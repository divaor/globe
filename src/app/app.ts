// App controller: owns the data store, renderer and interaction; manages the filter stack, the
// projection, language and theme; persists state to localStorage and the URL (share links).
import { DataStore } from '../data/store';
import { Renderer } from '../engine/renderer';
import { Interaction } from '../engine/interaction';
import { PROJECTIONS, type ProjectionId } from '../engine/projections';
import { THEMES } from './theme';
import { detectLang, detectSpanish, setLang, setSpanish, type Lang, type Spanish } from './i18n';
import { setLayerContext } from '../layers/context';
import { tiles, prefs as terrainPrefs } from '../engine/tiles';
import { DETAIL_LAYERS, satellite } from '../layers/imagery';
import { mapView, styledTheme, MAP_STYLES, type MapStyle } from '../engine/style';
import type { InfoRow, LayerDef, LayerInstance } from '../layers/types';

/** Ambient mode's names: the view's own only, all of the map's, or none. */
export type AmbientNames = 'view' | 'all' | 'none';
export interface ActiveSpec { id: string; opacity: number; options?: Record<string, string | boolean> }

interface Saved {
  lang?: Lang;
  /** The language was picked in Settings (v0.35.0); until then the app follows the phone's language. */
  langPicked?: boolean;
  /** Which Spanish (Latin America's, or Spain's words). */
  es?: Spanish;
  theme?: 'dark' | 'light';
  projection?: ProjectionId;
  active?: ActiveSpec[];
  labels?: { countries: boolean; capitals: boolean; cities: boolean; seas: boolean; values?: boolean };
  graticule?: boolean;
  shading?: boolean;
  quality?: 'auto' | 'high' | 'low';
  gpuMotion?: boolean;
  labelScale?: number;
  ambient?: { speed: number; cycle: boolean; clock: boolean; playlist?: string; secs?: number; narrate?: boolean; voice?: boolean; names?: AmbientNames };
  camera?: { lon: number; lat: number; zoom: number };
  /** The map style and the states and provinces (engine/style.ts). */
  view?: { style?: MapStyle; regions?: boolean; regionNames?: boolean };
}

type Listener = (...args: unknown[]) => void;
const STORE_KEY = 'atlas-globe:v1';

export class App {
  readonly data = new DataStore();
  readonly renderer: Renderer;
  readonly interaction: Interaction;
  readonly registry = new Map<string, LayerDef>();
  lang: Lang = detectLang();
  spanish: Spanish = detectSpanish();
  /** Picked in Settings; otherwise the phone's language is followed at each start (v0.35.0). */
  langPicked = false;
  themeId: 'dark' | 'light' = 'dark';
  selection: string | null = null;
  /** Ambient mode (the screensaver): its playlist ('' for the filters on the map), seconds a view, reading aloud. */
  /** Ambient mode; `names`: the view's own names only (the map's countries, cities and seas hidden), all, or none. */
  ambient: { on: boolean; speed: number; cycle: boolean; clock: boolean; playlist: string; secs: number; narrate: boolean; names: AmbientNames } = { on: false, speed: 1, cycle: false, clock: true, playlist: '', secs: 40, narrate: false, names: 'view' };
  /** While ambient mode plays (its playlist's filters, fewer names), what is saved is the map from before it. */
  held: Saved | null = null;
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
    // Detailed terrain: a new frame when a tile arrives, and a deeper zoom while a detail filter is on.
    tiles.onTile(() => this.renderer.requestRender());
    this.on('layers', () => this.syncMaxZoom());
  }

  /** The deepest zoom: about four web-map levels deeper while detailed terrain is on under a detail filter. */
  syncMaxZoom() {
    const v = this.renderer.view;
    const deep = terrainPrefs.detail && (this.layers.some((l) => DETAIL_LAYERS.includes(l.def.id)) || (mapView.style === 'satellite' && !!this.renderer.baseImagery));
    v.maxZoom = deep ? 6400 : 400;
    if (v.zoom > v.maxZoom) { v.flyTo({ zoom: v.maxZoom }, 600); this.renderer.requestRender(); }
  }

  /** Filters requested before they were registered (packs that load in the background). */
  private pending = new Map<string, Partial<ActiveSpec>>();
  /** Counts setStack calls: one overtaken by a newer one turns nothing more on. */
  private stackSeq = 0;

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
    setSpanish(this.spanish);
    setLang(this.lang);
    this.renderer.lang = this.lang;
    this.applyTheme();
    document.documentElement.dataset.theme = this.themeId;
    void this.syncBaseImagery();
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
    const seq = ++this.stackSeq;
    for (const l of [...this.layers]) if (!ids.includes(l.def.id)) this.deactivate(l.def.id, false);
    // A filter that loads is waited for; if another stack was asked for meanwhile, that one wins.
    for (const id of ids) {
      if (seq !== this.stackSeq) return;
      await this.activate(id);
    }
    if (seq !== this.stackSeq) return;
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

  /** Replaces a filter's options: its defaults, then these. */
  setOptions(id: string, options: Record<string, string | boolean>) {
    const inst = this.instance(id);
    if (!inst) return;
    const next: Record<string, string | boolean> = {};
    for (const o of inst.def.options ?? []) next[o.id] = o.default;
    inst.options = Object.assign(next, options);
    inst.def.onOptionsChanged?.(inst);
    this.emit('layers');
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

  /** The language, and for Spanish which Spanish ('latam' or 'spain'), picked in Settings; null follows the phone. */
  setLang(l: Lang | null, spanish: Spanish = this.spanish) {
    this.langPicked = l != null;
    if (l == null) { l = detectLang(); spanish = detectSpanish(); }
    this.lang = l;
    this.spanish = spanish;
    setSpanish(spanish);
    setLang(l);
    this.renderer.lang = l;
    for (const inst of this.layers) inst.def.onOptionsChanged?.(inst);
    this.emit('lang');
    this.renderer.requestRender();
    this.save();
  }

  setTheme(id: 'dark' | 'light') {
    this.themeId = id;
    this.applyTheme();
    document.documentElement.dataset.theme = id;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', id === 'dark' ? '#07101f' : '#f4f1ea');
    this.emit('theme');
    this.renderer.requestRender();
    this.save();
  }

  /** The map's theme: the app's light or dark theme in the chosen map style. */
  private applyTheme() {
    this.renderer.theme = styledTheme(THEMES[this.themeId], mapView.style);
    // Over the light Map style, text drawn straight on the map (the brand) turns dark.
    document.documentElement.classList.toggle('map-light', mapView.style === 'map');
  }

  /** The map style (Atlas, Map, Satellite) and the states and provinces with their names; for every filter. */
  setMapView(v: Partial<typeof mapView>) {
    Object.assign(mapView, v);
    this.applyTheme();
    void this.syncBaseImagery();
    this.emit('mapview');
    this.renderer.requestRender();
    this.save();
  }

  private satelliteBase: LayerInstance | null = null;

  /** In the Satellite style, NASA's picture (Sentinel-2 zoomed in) goes under every filter; it needs WebGL. */
  private async syncBaseImagery() {
    const r = this.renderer;
    if (mapView.style !== 'satellite' || !r.gl) {
      // Its detail tiles are let go; the world picture stays loaded for the next time.
      if (r.baseImagery) satellite.onDeactivate?.(r.baseImagery);
      r.baseImagery = null;
      this.syncMaxZoom();
      return;
    }
    let inst = this.satelliteBase;
    if (!inst) {
      inst = this.satelliteBase = { def: satellite, opacity: 1, options: {}, ready: false, state: {} };
      try {
        await satellite.load!({ data: this.data, gl: r.gl, lang: () => this.lang, requestRender: () => r.requestRender() }, inst);
        inst.ready = true;
      } catch (e) {
        console.error('satellite style', e);
        this.satelliteBase = null;
        return;
      }
    }
    if (mapView.style === 'satellite') r.baseImagery = inst;
    this.syncMaxZoom();
    r.requestRender();
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
  snapshot(): Saved {
    const r = this.renderer;
    return {
      lang: this.lang, es: this.spanish, langPicked: this.langPicked, theme: this.themeId, projection: this.projection,
      active: this.layers.filter((l) => !l.def.hidden).map((l) => ({ id: l.def.id, opacity: Math.round(l.opacity * 100) / 100, options: l.options })),
      labels: r.settings.labels, graticule: r.settings.graticule, shading: r.settings.shading, quality: r.settings.quality, gpuMotion: r.settings.gpuMotion,
      labelScale: r.settings.labelScale,
      ambient: { speed: this.ambient.speed, cycle: this.ambient.cycle, clock: this.ambient.clock, playlist: this.ambient.playlist, secs: this.ambient.secs, voice: this.ambient.narrate, names: this.ambient.names },
      camera: r.view.camera(),
      view: { ...mapView },
    };
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      // Ambient mode's own settings are saved as they are now; the rest as before it started.
      const s = this.held ? { ...this.held, ambient: this.snapshot().ambient } : this.snapshot();
      try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* private mode */ }
      if (!this.mode) history.replaceState(null, '', `#${this.shareHash(s)}`);
    }, 400);
  }

  shareHash(s = this.snapshot()): string {
    const c = s.camera!;
    const layers = (s.active ?? []).map((a) => (a.opacity !== 1 ? `${a.id}~${a.opacity}` : a.id)).join(',');
    const opts = (s.active ?? []).filter((a) => a.options && Object.keys(a.options).length)
      .map((a) => `${a.id}:${Object.entries(a.options!).map(([k, v]) => `${k}=${v}`).join(';')}`).join('|');
    const p = new URLSearchParams({ p: s.projection!, l: layers, c: `${c.lon.toFixed(2)},${c.lat.toFixed(2)},${c.zoom.toFixed(2)}`, lang: s.lang === 'es' && s.es === 'spain' ? 'es-ES' : s.lang! });
    if (opts) p.set('o', opts);
    // The map style and the states, when not the usual ones.
    if (s.view?.style && s.view.style !== 'atlas') p.set('m', s.view.style);
    if (s.view?.regions === false) p.set('st', '0');
    else if (s.view?.regionNames === false) p.set('sn', '0');
    return p.toString();
  }

  shareUrl(): string {
    // A time-travel mode that keeps its own place in the address (a war and its step) shares that.
    if (this.mode && /[#&](war|eras|food|structures|people|life|games|journeys|beliefs|writing|plagues|disasters|music|books|art|inventions|heritage|space|lives|world)=/.test(location.hash)) return location.href;
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
        lang: (hash.get('lang')?.slice(0, 2) as Lang) ?? saved.lang,
        es: hash.get('lang') === 'es-ES' ? 'spain' : hash.get('lang') === 'es' ? 'latam' : saved.es,
        camera: c.length === 3 && c.every(isFinite) ? { lon: c[0], lat: c[1], zoom: c[2] } : saved.camera,
        view: { style: (hash.get('m') as MapStyle) ?? 'atlas', regions: hash.get('st') !== '0', regionNames: hash.get('sn') !== '0' },
      };
    }
    const r = this.renderer;
    // The language: a share link's, or the one picked in Settings, or the phone's (v0.35.0). A language saved before
    // v0.35.0 counts as picked when it is not the phone's.
    const fromLink = (hash.get('l') !== null || !!hash.get('p')) && !!hash.get('lang');
    const picked = saved.langPicked ?? (!!saved.lang && (saved.lang !== this.lang || (saved.lang === 'es' && !!saved.es && saved.es !== this.spanish)));
    this.langPicked = !!saved.langPicked || (!fromLink && picked);
    if (fromLink || this.langPicked) {
      if (saved.lang === 'en' || saved.lang === 'es') this.lang = saved.lang;
      if (saved.es === 'latam' || saved.es === 'spain') this.spanish = saved.es;
    }
    if (saved.theme) this.themeId = saved.theme;
    if (saved.labels) r.settings.labels = { ...r.settings.labels, ...saved.labels };
    if (saved.graticule !== undefined) r.settings.graticule = saved.graticule;
    if (saved.shading !== undefined) r.settings.shading = saved.shading;
    if (saved.quality) r.settings.quality = saved.quality;
    if (saved.gpuMotion !== undefined) r.settings.gpuMotion = saved.gpuMotion;
    if (saved.labelScale) r.settings.labelScale = saved.labelScale;
    if (saved.view) {
      if (saved.view.style && MAP_STYLES.includes(saved.view.style)) mapView.style = saved.view.style;
      if (typeof saved.view.regions === 'boolean') mapView.regions = saved.view.regions;
      if (typeof saved.view.regionNames === 'boolean') mapView.regionNames = saved.view.regionNames;
    }
    // Reading the views aloud is kept as "voice" since v0.33.2: an older "narrate" is not carried over, so it starts off.
    if (saved.ambient) { const { narrate: _was, voice, ...rest } = saved.ambient; Object.assign(this.ambient, rest); this.ambient.narrate = voice === true; }
    // Before playlists, "cycle through filters" played the filters of what is now the playlist Our planet.
    if (saved.ambient?.cycle && saved.ambient.playlist === undefined) this.ambient.playlist = 'planet';
    if (saved.projection && PROJECTIONS[saved.projection]) r.view.setProjection(saved.projection, false);
    if (saved.camera) Object.assign(r.view, saved.camera);
    return saved;
  }
}
