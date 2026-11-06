// App controller: owns the data store, renderer and interaction; manages the filter stack, the
// projection, language and theme; persists state to localStorage and the URL (share links).
import { DataStore } from '../data/store';
import { Renderer } from '../engine/renderer';
import { Interaction } from '../engine/interaction';
import { PROJECTIONS, type ProjectionId } from '../engine/projections';
import { THEMES } from './theme';
import { detectLang, setLang, type Lang } from './i18n';
import { setLayerContext } from '../layers/context';
import type { InfoRow, LayerDef, LayerInstance } from '../layers/types';

export interface ActiveSpec { id: string; opacity: number; options?: Record<string, string | boolean> }

interface Saved {
  lang?: Lang;
  theme?: 'dark' | 'light';
  projection?: ProjectionId;
  active?: ActiveSpec[];
  labels?: { countries: boolean; capitals: boolean; cities: boolean; seas: boolean; values?: boolean };
  graticule?: boolean;
  shading?: boolean;
  quality?: 'auto' | 'high' | 'low';
  gpuMotion?: boolean;
  labelScale?: number;
  ambient?: { speed: number; cycle: boolean; clock: boolean };
  camera?: { lon: number; lat: number; zoom: number };
}

type Listener = (...args: unknown[]) => void;
const STORE_KEY = 'atlas-globe:v1';

export class App {
  readonly data = new DataStore();
  readonly renderer: Renderer;
  readonly interaction: Interaction;
  readonly registry = new Map<string, LayerDef>();
  lang: Lang = detectLang();
  themeId: 'dark' | 'light' = 'dark';
  selection: string | null = null;
  ambient = { on: false, speed: 1, cycle: false, clock: true };
  private listeners = new Map<string, Set<Listener>>();
  private saveTimer = 0;
  /** Modes such as 'timeline' or 'pangea' take over the map; null = normal exploring. */
  mode: string | null = null;

  constructor(readonly root: HTMLElement, canvases: { bg: HTMLCanvasElement; gl: HTMLCanvasElement; fg: HTMLCanvasElement }) {
    this.renderer = new Renderer(this.data, canvases.bg, canvases.gl, canvases.fg);
    setLayerContext({
      data: this.data, gl: this.renderer.gl, lang: () => this.lang,
      requestRender: () => this.renderer.requestRender(),
      notify: () => this.emit('legend'),
    });
    this.interaction = new Interaction(canvases.fg, this.renderer, {
      onTap: (x, y) => this.emit('tap', x, y),
      onHover: (x, y) => this.emit('hover', x, y),
      onStart: () => this.emit('interact'),
      onEnd: () => { this.emit('interactEnd'); this.save(); },
    });
    this.data.onLevelLoaded = () => this.renderer.requestRender();
  }

  /** Filters requested before they were registered (packs that load in the background). */
  private pending = new Map<string, Partial<ActiveSpec>>();

  register(defs: LayerDef[]) {
    for (const d of defs) this.registry.set(d.id, d);
    for (const d of defs) {
      const spec = this.pending.get(d.id);
      if (spec) { this.pending.delete(d.id); void this.activate(d.id, spec); }
    }
    this.emit('registry');
  }

  on(evt: string, fn: Listener) {
    let s = this.listeners.get(evt);
    if (!s) this.listeners.set(evt, (s = new Set()));
    s.add(fn);
    return () => s!.delete(fn);
  }

  emit(evt: string, ...args: unknown[]) {
    this.listeners.get(evt)?.forEach((fn) => fn(...args));
  }

  get layers(): LayerInstance[] { return this.renderer.layers; }
  isActive(id: string) { return this.layers.some((l) => l.def.id === id); }
  instance(id: string) { return this.layers.find((l) => l.def.id === id); }

  async start() {
    const saved = this.restore();
    setLang(this.lang);
    this.renderer.lang = this.lang;
    this.renderer.theme = THEMES[this.themeId];
    document.documentElement.dataset.theme = this.themeId;
    await this.data.init();
    const active = saved.active?.length ? saved.active : [{ id: 'political', opacity: 1 }];
    for (const a of active) void this.activate(a.id, a);
    this.renderer.requestRender();
  }

  // ---- filters ----------------------------------------------------------------------------
  async activate(id: string, spec?: Partial<ActiveSpec>) {
    const def = this.registry.get(id);
    if (!def) { this.pending.set(id, spec ?? {}); return; }
    if (this.isActive(id)) return;
    if (def.group) for (const l of [...this.layers]) if (l.def.group === def.group) this.deactivate(l.def.id, false);
    const options: Record<string, string | boolean> = {};
    for (const o of def.options ?? []) options[o.id] = o.default;
    Object.assign(options, spec?.options ?? {});
    const inst: LayerInstance = {
      def, opacity: spec?.opacity ?? def.defaultOpacity ?? (this.layers.some((l) => l.def.kind === 'fill') && def.kind === 'fill' ? 0.75 : 1),
      options, ready: !def.load, state: {},
    };
    // Imagery goes to the bottom of the stack; everything else on top, respecting stackOrder hints
    // (e.g. city lights stay above the night shading).
    if (def.kind === 'raster' && def.group === 'imagery') this.layers.unshift(inst);
    else {
      const mine = def.stackOrder ?? 0;
      const i = this.layers.findIndex((l) => (l.def.stackOrder ?? 0) > mine);
      if (i < 0) this.layers.push(inst); else this.layers.splice(i, 0, inst);
    }
    this.emit('layers');
    this.renderer.requestRender();
    if (def.load) {
      try {
        await def.load({ data: this.data, gl: this.renderer.gl, lang: () => this.lang, requestRender: () => this.renderer.requestRender() }, inst);
        inst.ready = true;
      } catch (e) {
        console.error(`filter ${id}`, e);
        inst.error = String((e as Error)?.message ?? e);
      }
      this.emit('layers');
      this.renderer.requestRender();
    }
    this.save();
  }

  deactivate(id: string, notify = true) {
    const i = this.layers.findIndex((l) => l.def.id === id);
    if (i < 0) return;
    const [inst] = this.layers.splice(i, 1);
    if (typeof inst.state.timer === 'number') clearInterval(inst.state.timer);
    inst.def.onDeactivate?.(inst);
    if (notify) { this.emit('layers'); this.renderer.requestRender(); this.save(); }
  }

  toggle(id: string) {
    if (this.isActive(id)) this.deactivate(id); else void this.activate(id);
  }

  /** Replace the whole stack (used by tours, quizzes and ambient cycling). */
  async setStack(ids: string[]) {
    for (const l of [...this.layers]) if (!ids.includes(l.def.id)) this.deactivate(l.def.id, false);
    for (const id of ids) await this.activate(id);
    this.emit('layers');
    this.renderer.requestRender();
  }

  setOpacity(id: string, v: number) {
    const inst = this.instance(id);
    if (!inst) return;
    inst.opacity = v;
    this.renderer.requestRender();
    this.save();
  }

  setOption(id: string, key: string, value: string | boolean) {
    const inst = this.instance(id);
    if (!inst) return;
    inst.options[key] = value;
    inst.def.onOptionsChanged?.(inst);
    this.emit('layers');
    this.renderer.requestRender();
    this.save();
  }

  move(id: string, dir: -1 | 1) {
    const L = this.layers;
    const i = L.findIndex((l) => l.def.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= L.length) return;
    [L[i], L[j]] = [L[j], L[i]];
    this.emit('layers');
    this.renderer.requestRender();
    this.save();
  }

  // ---- view -------------------------------------------------------------------------------
  setProjection(id: ProjectionId, animate = true) {
    this.renderer.view.setProjection(id, animate);
    this.renderer.requestRender();
    this.emit('projection', id);
    this.save();
  }

  get projection(): ProjectionId { return this.renderer.view.current.id; }

  setLang(l: Lang) {
    this.lang = l;
    setLang(l);
    this.renderer.lang = l;
    for (const inst of this.layers) inst.def.onOptionsChanged?.(inst);
    this.emit('lang');
    this.renderer.requestRender();
    this.save();
  }

  setTheme(id: 'dark' | 'light') {
    this.themeId = id;
    this.renderer.theme = THEMES[id];
    document.documentElement.dataset.theme = id;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', id === 'dark' ? '#07101f' : '#f4f1ea');
    this.emit('theme');
    this.renderer.requestRender();
    this.save();
  }

  select(id: string | null) {
    this.selection = id;
    this.renderer.selection = id;
    this.emit('select', id);
    this.renderer.requestRender();
  }

  flyToCountry(id: string, select = true) {
    const m = this.data.meta[id];
    if (!m) return;
    const shape = this.data.best('50m').byId.get(id) ?? this.data.best('110m').byId.get(id);
    let zoom = 2.2;
    if (shape) {
      const [w, s, e, n] = shape.bbox;
      const span = Math.max(((e - w + 360) % 360) || 360, (n - s) * 1.4);
      zoom = Math.max(1.1, Math.min(60, 140 / Math.max(2, span)));
    }
    if (this.renderer.view.current.kind === 'flat') zoom = Math.max(1, zoom * 0.7);
    this.renderer.view.flyTo({ lon: m.lx, lat: m.ly, zoom });
    if (select) this.select(id);
    this.renderer.requestRender();
  }

  flyTo(lon: number, lat: number, zoom?: number) {
    this.renderer.view.flyTo({ lon, lat, zoom: zoom ?? Math.max(this.renderer.view.zoom, 6) });
    this.renderer.requestRender();
  }

  resetView() {
    const v = this.renderer.view;
    v.flyTo({ lon: v.lon, lat: v.current.kind === 'flat' ? 0 : 18, zoom: 1 }, 900);
    this.renderer.requestRender();
  }

  /** Rows from filters that know about a point (time zone, climate class...). */
  pickAt(lon: number, lat: number): { def: LayerDef; rows: InfoRow[] }[] {
    const out: { def: LayerDef; rows: InfoRow[] }[] = [];
    for (const l of this.layers) {
      if (!l.ready || !l.def.pick) continue;
      const rows = l.def.pick(lon, lat, l, this.lang);
      if (rows?.length) out.push({ def: l.def, rows });
    }
    return out;
  }

  // ---- persistence ------------------------------------------------------------------------
  private snapshot(): Saved {
    const r = this.renderer;
    return {
      lang: this.lang, theme: this.themeId, projection: this.projection,
      active: this.layers.filter((l) => !l.def.hidden).map((l) => ({ id: l.def.id, opacity: Math.round(l.opacity * 100) / 100, options: l.options })),
      labels: r.settings.labels, graticule: r.settings.graticule, shading: r.settings.shading, quality: r.settings.quality, gpuMotion: r.settings.gpuMotion,
      labelScale: r.settings.labelScale,
      ambient: { speed: this.ambient.speed, cycle: this.ambient.cycle, clock: this.ambient.clock },
      camera: r.view.camera(),
    };
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      const s = this.snapshot();
      try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* private mode */ }
      if (!this.mode) history.replaceState(null, '', `#${this.shareHash(s)}`);
    }, 400);
  }

  shareHash(s = this.snapshot()): string {
    const c = s.camera!;
    const layers = (s.active ?? []).map((a) => (a.opacity !== 1 ? `${a.id}~${a.opacity}` : a.id)).join(',');
    const opts = (s.active ?? []).filter((a) => a.options && Object.keys(a.options).length)
      .map((a) => `${a.id}:${Object.entries(a.options!).map(([k, v]) => `${k}=${v}`).join(';')}`).join('|');
    const p = new URLSearchParams({ p: s.projection!, l: layers, c: `${c.lon.toFixed(2)},${c.lat.toFixed(2)},${c.zoom.toFixed(2)}`, lang: s.lang! });
    if (opts) p.set('o', opts);
    return p.toString();
  }

  shareUrl(): string {
    // A time-travel mode that keeps its own place in the address (a war and its step) shares that.
    if (this.mode && /[#&](war|eras|food|structures)=/.test(location.hash)) return location.href;
    return `${location.origin}${location.pathname}#${this.shareHash()}`;
  }

  private restore(): Saved {
    let saved: Saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { saved = {}; }
    // A share link overrides the saved state.
    const hash = new URLSearchParams(location.hash.slice(1));
    if (hash.get('l') !== null || hash.get('p')) {
      const opts = new Map<string, Record<string, string | boolean>>();
      for (const part of (hash.get('o') ?? '').split('|').filter(Boolean)) {
        const [id, kv] = part.split(':');
        const o: Record<string, string | boolean> = {};
        for (const pair of (kv ?? '').split(';')) { const [k, v] = pair.split('='); if (k) o[k] = v === 'true' ? true : v === 'false' ? false : v; }
        opts.set(id, o);
      }
      const active = (hash.get('l') ?? '').split(',').filter(Boolean).map((tok) => {
        const [id, op] = tok.split('~');
        return { id, opacity: op ? Number(op) : 1, options: opts.get(id) };
      });
      const c = (hash.get('c') ?? '').split(',').map(Number);
      saved = {
        ...saved,
        projection: (hash.get('p') as ProjectionId) ?? saved.projection,
        active,
        lang: (hash.get('lang') as Lang) ?? saved.lang,
        camera: c.length === 3 && c.every(isFinite) ? { lon: c[0], lat: c[1], zoom: c[2] } : saved.camera,
      };
    }
    const r = this.renderer;
    if (saved.lang === 'en' || saved.lang === 'es') this.lang = saved.lang;
    if (saved.theme) this.themeId = saved.theme;
    if (saved.labels) r.settings.labels = { ...r.settings.labels, ...saved.labels };
    if (saved.graticule !== undefined) r.settings.graticule = saved.graticule;
    if (saved.shading !== undefined) r.settings.shading = saved.shading;
    if (saved.quality) r.settings.quality = saved.quality;
    if (saved.gpuMotion !== undefined) r.settings.gpuMotion = saved.gpuMotion;
    if (saved.labelScale) r.settings.labelScale = saved.labelScale;
    if (saved.ambient) Object.assign(this.ambient, saved.ambient);
    if (saved.projection && PROJECTIONS[saved.projection]) r.view.setProjection(saved.projection, false);
    if (saved.camera) Object.assign(r.view, saved.camera);
    return saved;
  }
}
