// Stories played step by step on the map: Wars and conquests, Eras and ideas, Food through time
// and Great structures. Each step shows the territory of its sides (crossfading from the step
// before), routes (drawn as they go), battles (wars: tap one for its casualties), items (people,
// works, sites, dishes, structures: markers that pop up, then stay as dots; tap one for its card
// with a picture from Wikipedia) and dated events. A bar under the map tells the story; "Details"
// opens the longer notes, the step's items, the outcome and the sources; "Browse" lists everything.
// Data: public/data/<collection>/, built by scripts/data/build-conflicts.mjs.
import { geoArea, geoCentroid, geoContains, geoDistance, geoInterpolate } from 'd3-geo';
import { mesh } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Geometry, MultiLineString, Polygon } from 'geojson';
import { Play, Pause, X, ChevronLeft, ChevronRight, ListOrdered, BookOpen, Search } from 'lucide';
import { loadJSON, shapesFrom, chunkLines, type Shape, type Line } from '../data/store';
import { t, tx, lang, fmtNumber, fmtCompact } from '../app/i18n';
import { h, icon, clear } from '../ui/dom';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { LayerDef, RenderCtx } from '../layers/types';

type Text = { en: string; es: string };
type Range = number | [number, number];
type Pt = [number, number];
interface Cam { lon: number; lat: number; zoom: number }
interface Side { id: string; name: Text; color: string; members?: Text }
type Losses = { [side: string]: Range | Text | undefined; note?: Text };
interface Battle { name: Text; at: Pt; date?: string; winner?: string; casualties?: Losses; result?: Text; details?: Text }
interface Move { side: string; path: Pt[]; label?: Text }
interface WarEvent { icon: string; text: Text; at?: Pt; date?: string }
/** A marker of the stories other than wars: a person, work, site, dish, structure... */
export interface Item {
  id?: string; name: Text; at: Pt; cat: string; icon: string; date: string; t: number; end?: string; life?: [string, string | null];
  /** When it stopped existing (a civilization's end); `tu` is that time. Off the map after it. */
  until?: string; tu?: number;
  type?: string; country?: string; place?: Text; text: Text; details?: Text; why?: Text; how?: Text; by?: Text; size?: Text; status?: Text;
  facts?: { label: Text; value: Text }[]; wiki?: Text;
  /** The first step that shows it (-1: a time tour's catalogue item, shown from its date). */
  first: number;
}
export interface Cat { id: string; name: Text; icon: string; color: string }
interface Step {
  date: string; t: number; title: Text; text: Text; details?: Text; control: Record<string, number | null>;
  moves?: Move[]; battles?: Battle[]; events?: WarEvent[]; deaths?: Range; camera?: Cam; aftermath?: boolean; show?: number[];
}
interface Conflict {
  id: string; name: Text; icon: string; era: string; region: Text; summary: Text; start: string; end: string; t0: number; t1: number;
  camera: Cam; sides: Side[]; casualties?: Losses; casualtiesNote?: Text; outcome: Text; sources: { title: string; url: string }[]; steps: Step[];
  kind?: string; items?: Item[]; cats?: Cat[]; catalog?: 'all' | 'shown';
}
interface Entry {
  id: string; name: Text; icon: string; era: string; region: Text; summary: Text; start: string; end: string; t0: number; t1: number; steps: number;
  sides: { name: Text; color: string }[]; items?: number; cats?: string[];
}
/** Where an item's marker is drawn this frame: (x, y), moved apart from crowded neighbours, and (ax, ay), its true place. */
interface Spot { k: number; x: number; y: number; ax: number; ay: number; r: number; wt: number }
/** A collection's items.json row: an item and where it first appears. */
export interface CollectionItem extends Omit<Item, 'first'> { story: string; step: number }

/** The collections of stories. */
export type StoryKind = 'wars' | 'eras' | 'food' | 'structures' | 'people';
export const STORY_KINDS: StoryKind[] = ['wars', 'eras', 'food', 'structures', 'people'];
const KINDS: Record<StoryKind, { dir: string; hash: string; icon: string; name: Text }> = {
  wars: { dir: 'conflicts', hash: 'war', icon: '⚔️', name: { en: 'Wars and conquests', es: 'Guerras y conquistas' } },
  eras: { dir: 'eras', hash: 'eras', icon: '🎨', name: { en: 'Eras and ideas', es: 'Épocas e ideas' } },
  food: { dir: 'food', hash: 'food', icon: '🌾', name: { en: 'Food through time', es: 'La comida en el tiempo' } },
  structures: { dir: 'structures', hash: 'structures', icon: '🏛️', name: { en: 'Great structures', es: 'Grandes construcciones' } },
  people: { dir: 'people', hash: 'people', icon: '🏺', name: { en: 'Peoples and civilizations', es: 'Pueblos y civilizaciones' } },
};
export const storyHashKey = (k: StoryKind) => KINDS[k].hash;
interface Area extends Shape { lp: Pt; area: number }

export const ERAS = ['prehistory', 'ancient', 'medieval', 'early-modern', 'modern', 'contemporary'];
const MONTHS: Record<'en' | 'es', string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
};

// Timing of a step, in ms at 1×: the territory fades in, arrows draw, battles and items pop up one
// by one.
const FADE = 900, MOVE_FROM = 250, MOVE_MS = 2300, BATTLE_FROM = 700, BATTLE_GAP = 420, POP = 380, PULSE = 1500, ITEM_GAP = 300;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const pop = (x: number) => { const t = clamp01(x); return t < 1 ? 1 - Math.pow(1 - t, 3) * (1 - 2.2 * t) : 1; };

/** Dates older than 10,000 BC are written as years ago: -3200000 is 3.2 million years ago. */
const AGO = -10000;
function group(n: number, sep: string): string { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep); }
/** How long ago: ["3.2", million] or ["300,000", years]. */
function agoNum(n: number, es: boolean): [string, boolean] {
  if (n >= 1e6) { const m = Math.round(n / 1e5) / 10; return [es ? String(m).replace('.', ',') : String(m), true]; }
  const r = n >= 1e5 ? Math.round(n / 1e3) * 1e3 : Math.round(n / 100) * 100;
  return [group(r, es ? '\u00a0' : ','), false];
}
/** "3.2 million years ago", "300,000 years ago", "hace 14\u00a0400 años". */
function fmtAgo(y: number): string {
  const es = lang() === 'es', [v, mill] = agoNum(-y, es);
  if (mill) return es ? `hace ${v}\u00a0${v === '1' ? 'millón' : 'millones'} de años` : `${v}\u00a0million years ago`;
  return es ? `hace ${v}\u00a0años` : `${v}\u00a0years ago`;
}
/** "7–2 million years ago", "300,000–40,000 years ago", "3.3 million – 300,000 years ago". */
function fmtAgoRange(y0: number, y1: number): string {
  const es = lang() === 'es', [a, ma] = agoNum(-y0, es), [b, mb] = agoNum(-y1, es);
  if (ma && mb) return es ? `hace ${a}–${b}\u00a0millones de años` : `${a}–${b}\u00a0million years ago`;
  if (!ma && !mb) return es ? `hace ${a}–${b}\u00a0años` : `${a}–${b}\u00a0years ago`;
  return es ? `hace ${a}\u00a0millones – ${b}\u00a0años` : `${a}\u00a0million – ${b}\u00a0years ago`;
}

/** "1 September 1939", "May 334 BC", "336 a. C.", "3.2 million years ago"... */
export function fmtWhen(d: string, eraHint = 1): string {
  const m = /^(-?\d+)(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(d);
  if (!m) return d;
  const y = Number(m[1]), mo = m[2] ? Number(m[2]) : 0, day = m[3] ? Number(m[3]) : 0;
  if (y < AGO) return fmtAgo(y);
  const es = lang() === 'es';
  // Non-breaking spaces keep "216 a. C." and "AD 476" together when the text wraps.
  const year = y < 0 ? (es ? `${-y}\u00a0a.\u00a0C.` : `${-y}\u00a0BC`) : eraHint < 0 && y < 1000 ? (es ? `${y}\u00a0d.\u00a0C.` : `AD\u00a0${y}`) : String(y);
  const mon = mo ? MONTHS[es ? 'es' : 'en'][mo - 1] : '';
  if (es) return day ? `${day} de ${mon} de ${year}` : mo ? `${mon} de ${year}` : year;
  return day ? `${day} ${mon} ${year}` : mo ? `${mon[0].toUpperCase()}${mon.slice(1)} ${year}` : year;
}

/** "1939–1945", "334–323 BC", "509 BC – AD 117". */
function fmtYears(start: string, end: string): string {
  const y0 = Number(/^-?\d+/.exec(start)?.[0]), y1 = Number(/^-?\d+/.exec(end)?.[0]);
  if (y0 < AGO) return y1 < AGO ? fmtAgoRange(y0, y1) : `${fmtAgo(y0)} – ${fmtWhen(end, y0)}`;
  const es = lang() === 'es';
  if (y0 < 0 && y1 < 0) return `${-y0}–${-y1}\u00a0${es ? 'a.\u00a0C.' : 'BC'}`;
  if (y0 < 0) return es ? `${-y0}\u00a0a.\u00a0C. – ${y1}\u00a0d.\u00a0C.` : `${-y0}\u00a0BC – AD\u00a0${y1}`;
  return y0 === y1 ? String(y0) : `${y0}–${y1}`;
}

function fmtCount(v: number): string { return v >= 1e6 ? fmtCompact(v) : fmtNumber(v); }
export function fmtRange(v: Range): string {
  if (typeof v === 'number') return fmtCount(v);
  return v[0] === v[1] ? fmtCount(v[0]) : `${fmtCount(v[0])}–${fmtCount(v[1])}`;
}

/** A darker shade of a #rrggbb colour (for outlines). */
function darker(hex: string, f = 0.7): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(((n >> s) & 255) * f);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

/** Points along a route, following great circles, cut at `q` (0..1) of its length. */
function routeTo(path: Pt[], q: number): Pt[] {
  const legs = path.slice(1).map((p, i) => geoDistance(path[i], p));
  const total = legs.reduce((a, b) => a + b, 0);
  let left = total * clamp01(q);
  const out: Pt[] = [path[0]];
  for (let i = 0; i < legs.length && left > 0; i++) {
    const f = Math.min(1, left / (legs[i] || 1e-9));
    const interp = geoInterpolate(path[i], path[i + 1]);
    const n = Math.max(2, Math.ceil((legs[i] * f) / 0.01));
    for (let k = 1; k <= n; k++) out.push(interp((k / n) * f) as Pt);
    left -= legs[i];
  }
  return out;
}

export class StoryMode {
  private index: Entry[] = [];
  private cats = new Map<string, Cat>();
  private all: CollectionItem[] | null = null;
  private c: Conflict | null = null;
  private areas = new Map<number, Area>();
  private step = 0;
  private prev = -1;
  private stepAt = 0;
  private playing = false;
  private speed = 1;
  private raf = 0;
  private bar: HTMLElement | null = null;
  private ui: { date: HTMLElement; title: HTMLElement; text: HTMLElement; meta: HTMLElement; play: HTMLButtonElement; track: HTMLElement; count: HTMLElement } | null = null;
  private savedStack: string[] = [];
  private savedProjection: string | null = null;
  private snaps: { year: number; astro: number; file: string }[] = [];
  private borders = new Map<string, Line[] | 'loading'>();
  private onKey = (e: KeyboardEvent) => this.key(e);
  private onResize = () => { this.fitText(); this.measureBar(); };
  /** The step text is shown whole (tapped open) rather than in three lines. */
  private textOpen = false;
  /** The markers as drawn in the last frame (story and step, item index → spot): taps and labels use them. */
  private spots: { key: string; at: Map<number, Spot> } = { key: '', at: new Map() };
  readonly layer: LayerDef;

  constructor(private app: App, private shell: Shell, readonly kind: StoryKind = 'wars') {
    const self = this;
    const k = KINDS[kind];
    this.layer = {
      id: kind === 'wars' ? 'wars' : `story-${kind}`, category: 'political', icon: k.icon, kind: 'fill', hidden: true, animated: true,
      name: k.name,
      desc: { en: 'Stories step by step.', es: 'Historias paso a paso.' },
      credit: `${k.name.en}: Atlas Globe (sources listed with each story); pictures: Wikipedia; historical borders: aourednik/historical-basemaps (GPL-3.0)`,
      drawFill(rc) { self.drawFill(rc); },
      drawOverlay(rc) { self.drawOverlay(rc); },
      labels(rc) { self.labels(rc); },
    };
    app.register([this.layer]);
    app.on('lang', () => { if (this.active && this.c) { this.buildBar(); this.renderBar(); } });
  }

  get active() { return this.app.mode === this.kind; }
  get wars() { return this.kind === 'wars'; }
  private get dir() { return KINDS[this.kind].dir; }
  private tr(key: 'Title' | 'Intro') { return this.wars ? t(`wars${key}`) : t(`${this.kind}${key}`); }

  private async ensureIndex() {
    if (!this.index.length) {
      const idx = await loadJSON<{ conflicts?: Entry[]; stories?: Entry[]; categories?: Cat[] }>(`${this.dir}/index.json`);
      this.index = idx.conflicts ?? idx.stories ?? [];
      this.cats = new Map((idx.categories ?? []).map((c) => [c.id, c]));
    }
    if (!this.snaps.length) {
      const idx = await loadJSON<{ snapshots: { year: number; file: string }[] }>('history/index.json');
      this.snaps = idx.snapshots.map((s) => ({ ...s, astro: s.year < 0 ? s.year + 1 : s.year }));
    }
  }

  /** The list of stories, by era (from the Time travel menu or the bar's list button). */
  async pick() {
    await this.ensureIndex();
    const wrap = h('div', { class: 'war-list' }, h('p', { class: 'muted small' }, this.tr('Intro')));
    if (!this.wars) {
      const browse = h('button', { type: 'button', class: 'pill story-browse-all' }, icon(Search, 16), t('storyBrowseAll'));
      browse.addEventListener('click', () => void this.browseCollection());
      wrap.append(browse);
    }
    for (const era of ERAS) {
      const items = this.index.filter((c) => c.era === era);
      if (!items.length) continue;
      wrap.append(h('h3', { class: 'sec-title' }, t(`era.${era}`)));
      for (const c of items) {
        const card = h('button', { type: 'button', class: `war-card${this.c?.id === c.id && this.active ? ' on' : ''}`, 'data-war': c.id },
          h('span', { class: 'war-icon' }, c.icon),
          h('span', { class: 'war-text' },
            h('span', { class: 'war-name' }, tx(c.name)),
            h('span', { class: 'war-sub' }, `${fmtYears(c.start, c.end)} · ${tx(c.region)}`),
            h('span', { class: 'war-sum' }, tx(c.summary)),
            h('span', { class: 'war-sides' },
              c.sides.map((s) => h('span', { class: 'war-side' }, h('i', { style: { background: s.color } }), tx(s.name))),
              (c.cats ?? []).map((id) => this.cats.get(id)).filter((x): x is Cat => !!x)
                .map((k) => h('span', { class: 'war-side' }, h('b', { class: 'story-cat' }, k.icon), tx(k.name))))));
        card.addEventListener('click', () => void this.open(c.id));
        wrap.append(card);
      }
    }
    this.shell.openPanel(this.sheetId, this.tr('Title'), wrap);
  }

  private get sheetId() { return this.wars ? 'wars' : `story-${this.kind}`; }

  /** Opens a story (at a step, from a shared link) and starts playing it; `focus` shows one item. */
  async open(id: string, at = 0, focus?: { name: string; at: Pt }) {
    this.shell.sheet.close();
    await this.ensureIndex();
    const [c, topo] = await Promise.all([loadJSON<Conflict>(`${this.dir}/${id}.json`), loadJSON<Topology>(`${this.dir}/${id}-areas.json`)]);
    if (!this.active) await this.enterMode();
    this.stop();
    this.c = c;
    this.areas = new Map(shapesFrom(topo, 'areas').map((s) => [Number(s.id), { ...s, ...labelPoint(s.feature) }]));
    this.step = Math.max(0, Math.min(c.steps.length - 1, at)); this.prev = -1;
    this.textOpen = false;
    this.buildBar();
    this.go(this.step, { fly: !focus });
    this.playing = !focus;
    this.renderBar();
    this.app.emit('mode', this.kind);
    if (focus) {
      // Opened for one item (from Browse or a quiz): fly to it and open its card.
      const k = c.items?.findIndex((it) => tx(it.name) === focus.name && Math.abs(it.at[0] - focus.at[0]) < 1e-3 && Math.abs(it.at[1] - focus.at[1]) < 1e-3) ?? -1;
      const v = this.app.renderer.view;
      v.flyTo({ lon: focus.at[0], lat: focus.at[1], zoom: Math.max(v.zoom, 4.5) }, 1300);
      if (k >= 0) setTimeout(() => { if (this.c === c) this.itemCard(c.items![k]); }, 1350);
    }
  }

  private async enterMode() {
    const app = this.app;
    this.savedStack = app.layers.filter((l) => !l.def.hidden).map((l) => l.def.id);
    this.savedProjection = app.projection;
    app.mode = this.kind;
    document.documentElement.classList.add('mode-time', 'mode-story', `mode-${this.kind}`);
    app.select(null);
    app.renderer.baseMap = false;
    await app.setStack([this.layer.id]);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', this.onResize);
  }

  async exit() {
    if (!this.active) return;
    const app = this.app;
    this.stop();
    this.bar?.remove();
    this.bar = null; this.ui = null; this.c = null;
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    app.renderer.view.insetBottom = 0;
    app.mode = null;
    document.documentElement.classList.remove('mode-time', 'mode-story', `mode-${this.kind}`);
    app.renderer.baseMap = true;
    for (const id of [this.sheetId, 'war-step', 'story-browse']) if (this.shell.sheet.isOpen(id)) this.shell.sheet.close();
    app.select(null);
    this.shell.card.hide();
    await app.setStack(this.savedStack.length ? this.savedStack : ['political']);
    if (this.savedProjection && this.savedProjection !== app.projection) app.setProjection(this.savedProjection as never);
    app.emit('mode', null);
    app.save();
  }

  // ---- steps and playback

  private cameraAt(i: number): Cam {
    const c = this.c!;
    for (let k = i; k >= 0; k--) if (c.steps[k].camera) return c.steps[k].camera!;
    return c.camera;
  }

  /**
   * The step's camera, zoomed out (at most 4 times) when the step's own markers would not all be in
   * view on this screen: a phone's map between the panels is much smaller than the one it was set for.
   */
  private fitCam(cam: Cam, st: Step): Cam {
    const c = this.c!;
    if (!c.items || !st.show?.length) return cam;
    const v = this.app.renderer.view;
    const perZoom = v.pxPerRadian / v.zoom;
    const halfW = v.w / 2 - 30, halfH = v.mapH / 2 - 30;
    const R = Math.PI / 180;
    let k = Infinity;
    for (const i of st.show) {
      const [lon, lat] = c.items[i].at;
      const dx = Math.abs(((lon - cam.lon + 540) % 360) - 180) * R * Math.cos(lat * R), dy = Math.abs(lat - cam.lat) * R;
      if (dx > 1e-9) k = Math.min(k, halfW / dx);
      if (dy > 1e-9) k = Math.min(k, halfH / dy);
    }
    const z = k / perZoom;
    return isFinite(z) && z < cam.zoom ? { ...cam, zoom: Math.max(z, cam.zoom / 4, 1) } : cam;
  }

  /** Shows step `i`; the camera moves when the step (or a jump) asks for another view. */
  private go(i: number, o: { fly?: boolean; user?: boolean; stay?: boolean } = {}) {
    const c = this.c!;
    i = Math.max(0, Math.min(c.steps.length - 1, i));
    this.prev = i === this.step ? -1 : this.step;
    this.step = i;
    // The address names the war and the step, so the page can be shared or reloaded there.
    history.replaceState(null, '', `#${KINDS[this.kind].hash}=${c.id}&step=${i + 1}&p=${this.app.projection}&lang=${lang()}`);
    void this.ensureBorders(c.steps[i]);
    if (this.shell.sheet.isOpen('war-step')) this.openDetails(true);
    this.shell.card.hide();
    this.renderBar();
    // The bar is up with this step's text, so the camera knows how much map is left above it.
    this.measureBar();
    const cam = this.fitCam(this.cameraAt(i), c.steps[i]);
    let delay = 0;
    if (!o.stay && (o.fly || o.user || c.steps[i].camera)) {
      const v = this.app.renderer.view;
      const far = geoDistance([v.lon, v.lat], [cam.lon, cam.lat]) > 0.05 || Math.abs(Math.log(v.zoom / cam.zoom)) > 0.15;
      if (far) { v.flyTo(cam, 1300); delay = 700; }
    }
    this.stepAt = performance.now() + delay;
    this.kick();
  }

  private stepMs() {
    const st = this.c!.steps[this.step];
    const len = tx(st.text).length + tx(st.title).length;
    const battles = (st.battles?.length ?? 0) * BATTLE_GAP + (st.show?.length ?? 0) * ITEM_GAP;
    return Math.max(5200, Math.min(13000, 3200 + len * 32 + battles)) / this.speed;
  }

  private kick() { if (!this.raf) this.raf = requestAnimationFrame(this.loop); }

  private loop = (now: number) => {
    this.raf = 0;
    if (!this.c) return;
    const el = now - this.stepAt;
    const last = this.c.steps.length - 1;
    if (this.playing && el > this.stepMs()) {
      if (this.step < last) { this.go(this.step + 1); return; }
      this.playing = false;
      this.renderBar();
    }
    const cur = this.c.steps[this.step];
    const animating = el < MOVE_FROM + MOVE_MS + Math.max(FADE, BATTLE_FROM + (cur.battles?.length ?? 0) * BATTLE_GAP + (cur.show?.length ?? 0) * ITEM_GAP + PULSE);
    if (animating) this.app.renderer.requestRender();
    if (animating || this.playing) this.raf = requestAnimationFrame(this.loop);
  };

  private stop() { this.playing = false; cancelAnimationFrame(this.raf); this.raf = 0; }

  private toggle() {
    if (!this.c) return;
    if (!this.playing && this.step === this.c.steps.length - 1) this.go(0, { user: true });
    this.playing = !this.playing;
    this.renderBar();
    this.kick();
  }

  private key(e: KeyboardEvent) {
    if (!this.c || (e.target as HTMLElement)?.closest?.('input, select, textarea')) return;
    if (e.key === 'ArrowRight') { this.playing = false; this.go(this.step + 1, { user: true }); }
    else if (e.key === 'ArrowLeft') { this.playing = false; this.go(this.step - 1, { user: true }); }
    else if (e.key === ' ') { this.toggle(); }
    else return;
    e.preventDefault();
  }

  // ---- context borders from the historical map nearest in time

  private snapFor(st: Step) {
    let best = this.snaps[0];
    for (const s of this.snaps) if (s.astro <= st.t + 0.5) best = s;
    return best;
  }

  private async ensureBorders(st: Step) {
    const s = this.snapFor(st);
    if (!s || this.borders.has(s.file)) return;
    this.borders.set(s.file, 'loading');
    try {
      const topo = await loadJSON<Topology>(`history/${s.file}`);
      const obj = topo.objects.world as GeometryCollection;
      this.borders.set(s.file, chunkLines(mesh(topo, obj, (a, b) => a !== b) as MultiLineString));
      this.app.renderer.requestRender();
    } catch { this.borders.delete(s.file); }
  }

  // ---- drawing

  /** Time into the current step's animation; with reduced motion, every step is shown finished. */
  private elapsed() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 60000;
    return (performance.now() - this.stepAt) * this.speed;
  }

  private fillArea(rc: RenderCtx, idx: number | null | undefined, color: string, alpha: number) {
    if (idx == null || alpha <= 0.01) return;
    const a = this.areas.get(idx);
    if (!a || !rc.visibleShapes([a]).length) return;
    const { ctx, path } = rc;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.beginPath(); path(a.feature as never);
    ctx.fillStyle = color; ctx.globalAlpha *= 0.82; ctx.fill();
    ctx.globalAlpha /= 0.82;
    ctx.strokeStyle = darker(color); ctx.lineWidth = 1.1; ctx.stroke();
    ctx.restore();
  }

  private drawFill(rc: RenderCtx) {
    const c = this.c;
    const { ctx, path, theme } = rc;
    // Plain land and coasts (the base map is off in this mode). In the dark theme the land is a
    // neutral grey, so the sides' colours (blues especially) stand out against it.
    ctx.beginPath();
    for (const s of rc.visibleShapes(rc.level.countries)) path(s.feature as never);
    ctx.fillStyle = theme.dark ? '#4f545c' : theme.land; ctx.fill();
    if (!c) return;
    const st = c.steps[this.step];
    const snap = this.snapFor(st);
    const b = snap && this.borders.get(snap.file);
    if (Array.isArray(b)) {
      ctx.save(); ctx.globalAlpha *= 0.55;
      ctx.beginPath(); for (const l of rc.visibleLines(b)) path(l.geometry);
      ctx.strokeStyle = theme.border; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.restore();
    }
    const p = ease(this.elapsed() / FADE);
    const old = this.prev >= 0 ? c.steps[this.prev] : null;
    for (const side of c.sides) {
      const cur = st.control[side.id], was = old?.control[side.id];
      if (!old || p >= 1 || cur === was) this.fillArea(rc, cur, side.color, 1);
      else { this.fillArea(rc, was, side.color, 1 - p); this.fillArea(rc, cur, side.color, p); }
    }
    ctx.beginPath();
    for (const l of rc.visibleLines(rc.level.coast)) path(l.geometry);
    ctx.strokeStyle = theme.coast; ctx.lineWidth = 0.6; ctx.stroke();
  }

  private sideColor(id?: string) { return this.c?.sides.find((s) => s.id === id)?.color ?? '#59616b'; }

  private drawRoute(rc: RenderCtx, mv: Move, q: number, alpha: number) {
    if (q <= 0 || alpha <= 0.01) return;
    const pts = routeTo(mv.path, q);
    const { ctx } = rc;
    const runs: Pt[][] = [];
    let run: Pt[] = [];
    for (const g of pts) { const p = rc.project(g[0], g[1]); if (p) run.push(p); else if (run.length) { runs.push(run); run = []; } }
    if (run.length) runs.push(run);
    const col = this.sideColor(mv.side);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [w, s] of [[6, 'rgba(255,255,255,0.9)'], [3, col]] as const) {
      ctx.beginPath();
      for (const r of runs) { ctx.moveTo(r[0][0], r[0][1]); for (const p of r.slice(1)) ctx.lineTo(p[0], p[1]); }
      ctx.strokeStyle = s; ctx.lineWidth = w; ctx.stroke();
    }
    // Arrowhead at the tip.
    const last = runs[runs.length - 1];
    if (last && last.length >= 2) {
      const [x1, y1] = last[last.length - 1];
      let k = last.length - 2;
      while (k > 0 && Math.hypot(x1 - last[k][0], y1 - last[k][1]) < 6) k--;
      const a = Math.atan2(y1 - last[k][1], x1 - last[k][0]);
      ctx.beginPath();
      ctx.moveTo(x1 + Math.cos(a) * 7, y1 + Math.sin(a) * 7);
      ctx.lineTo(x1 + Math.cos(a + 2.5) * 9, y1 + Math.sin(a + 2.5) * 9);
      ctx.lineTo(x1 + Math.cos(a - 2.5) * 9, y1 + Math.sin(a - 2.5) * 9);
      ctx.closePath();
      ctx.fillStyle = col; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5;
      ctx.stroke(); ctx.fill();
    }
    ctx.restore();
  }

  private drawBattle(rc: RenderCtx, b: Battle, s: number, pulse: number, small: boolean) {
    const p = rc.project(b.at[0], b.at[1]);
    if (!p || s <= 0) return;
    const { ctx } = rc;
    const ring = b.winner && b.winner !== 'none' ? this.sideColor(b.winner) : '#9aa3ad';
    ctx.save();
    if (small) {
      ctx.beginPath(); ctx.arc(p[0], p[1], 3.6, 0, Math.PI * 2);
      ctx.fillStyle = ring; ctx.globalAlpha *= 0.85; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.restore();
      return;
    }
    if (pulse > 0 && pulse < 1) {
      ctx.beginPath(); ctx.arc(p[0], p[1], 10 + pulse * 26, 0, Math.PI * 2);
      ctx.strokeStyle = ring; ctx.globalAlpha = (1 - pulse) * 0.8; ctx.lineWidth = 3; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const r = 11 * s;
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
    ctx.fillStyle = '#1b2230'; ctx.fill();
    ctx.lineWidth = 2.6; ctx.strokeStyle = ring; ctx.stroke();
    ctx.font = `${Math.round(12 * s)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⚔️', p[0], p[1] + 0.5);
    ctx.restore();
  }

  private drawOverlay(rc: RenderCtx) {
    const c = this.c;
    if (!c) return;
    const el = this.elapsed();
    const st = c.steps[this.step];
    const old = this.prev >= 0 ? c.steps[this.prev] : null;
    const fadeOut = 1 - ease(el / FADE);
    // Battles of earlier steps stay as small dots: the war's history.
    for (let k = 0; k < this.step; k++) for (const b of c.steps[k].battles ?? []) this.drawBattle(rc, b, 1, 0, true);
    if (old && fadeOut > 0) for (const mv of old.moves ?? []) this.drawRoute(rc, mv, 1, fadeOut * 0.7);
    (st.moves ?? []).forEach((mv, k) => this.drawRoute(rc, mv, ease((el - MOVE_FROM - k * 300) / MOVE_MS), 1));
    (st.events ?? []).forEach((ev, k) => {
      if (!ev.at) return;
      const p = rc.project(ev.at[0], ev.at[1]);
      const s = pop((el - 300 - k * 300) / POP);
      if (!p || s <= 0) return;
      const { ctx } = rc;
      ctx.save();
      ctx.beginPath(); ctx.arc(p[0], p[1], 11 * s, 0, Math.PI * 2);
      ctx.fillStyle = rc.theme.dark ? 'rgba(20,28,44,0.9)' : 'rgba(255,255,255,0.92)'; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(120,130,145,0.9)'; ctx.stroke();
      ctx.font = `${Math.round(13 * s)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ev.icon || '📜', p[0], p[1] + 0.5);
      ctx.restore();
    });
    (st.battles ?? []).forEach((b, k) => {
      const at = BATTLE_FROM + k * BATTLE_GAP;
      this.drawBattle(rc, b, pop((el - at) / POP), (el - at) / PULSE, false);
    });
    if (c.items) {
      // Earlier items (and, in a time tour, everything built by now) as dots, this step's popping up.
      // Crowded markers move apart, each with a line to its true place, so every one can be tapped.
      const now = new Set(st.show ?? []);
      const zoomed = rc.view.pxPerRadian > 1600;
      const spots = this.layout(rc, st, zoomed);
      this.spots = { key: `${c.id}:${this.step}`, at: spots };
      const popAt = new Map((st.show ?? []).map((k, n) => [k, pop((el - BATTLE_FROM - n * ITEM_GAP) / POP)]));
      this.drawLeaders(rc, spots, (k) => popAt.get(k) ?? 1);
      c.items.forEach((it, k) => { if (!now.has(k) && this.onMap(it, st)) this.drawItem(rc, it, 1, 0, true, zoomed, spots.get(k)); });
      (st.show ?? []).forEach((k, n) => {
        const at = BATTLE_FROM + n * ITEM_GAP;
        this.drawItem(rc, c.items![k], pop((el - at) / POP), (el - at) / PULSE, false, zoomed, spots.get(k));
      });
    }
  }

  /** Is an item on the map at this step (other than as one of the step's own)? */
  private onMap(it: Item, st: Step) {
    if (it.tu != null && st.t > it.tu + 1e-6) return false;
    return (it.first >= 0 && it.first < this.step) || (this.c?.catalog === 'all' && it.t <= st.t + 1e-6);
  }

  private catOf(id: string): Cat | undefined { return this.c?.cats?.find((k) => k.id === id) ?? this.cats.get(id); }

  /**
   * Where the markers go: the step's own (big) markers, and zoomed in every marker on the map, move
   * apart when they overlap, as little as they must; the step's own move least.
   */
  private layout(rc: RenderCtx, st: Step, zoomed: boolean): Map<number, Spot> {
    const c = this.c!, out = new Map<number, Spot>();
    const { w, h } = rc.view, M = 90;
    const pts: Spot[] = [];
    const add = (k: number, r: number, wt: number) => {
      const it = c.items![k];
      const p = rc.project(it.at[0], it.at[1]);
      if (!p || p[0] < -M || p[0] > w + M || p[1] < -M || p[1] > h + M) return;
      pts.push({ k, x: p[0], y: p[1], ax: p[0], ay: p[1], r, wt });
    };
    const now = st.show ?? [];
    for (const k of now) add(k, 12.5, 3);
    if (zoomed) {
      const mine = new Set(now);
      c.items!.forEach((it, k) => { if (!mine.has(k) && this.onMap(it, st)) add(k, 8.5, 1); });
    }
    spread(pts, 3);
    for (const p of pts) out.set(p.k, p);
    return out;
  }

  /** A thin line from each moved marker to a dot at its true place (under all the markers). */
  private drawLeaders(rc: RenderCtx, spots: Map<number, Spot>, scale: (k: number) => number) {
    const { ctx } = rc;
    const ink = rc.theme.dark ? 'rgba(232,238,247,0.8)' : 'rgba(28,34,46,0.62)';
    ctx.save();
    for (const sp of spots.values()) {
      const dx = sp.x - sp.ax, dy = sp.y - sp.ay, d = Math.hypot(dx, dy);
      const s = scale(sp.k);
      if (d < sp.r * 0.7 || s <= 0) continue;
      ctx.globalAlpha = Math.min(1, s);
      ctx.beginPath(); ctx.moveTo(sp.ax, sp.ay); ctx.lineTo(sp.x - (dx / d) * sp.r * s, sp.y - (dy / d) * sp.r * s);
      ctx.lineWidth = 1.4; ctx.strokeStyle = ink; ctx.stroke();
      ctx.beginPath(); ctx.arc(sp.ax, sp.ay, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = this.catOf(this.c!.items![sp.k].cat)?.color ?? '#59616b'; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
    ctx.restore();
  }

  private drawItem(rc: RenderCtx, it: Item, s: number, pulse: number, small: boolean, zoomed: boolean, spot?: Spot) {
    const p = spot ? [spot.x, spot.y] : rc.project(it.at[0], it.at[1]);
    if (!p || s <= 0) return;
    const { ctx } = rc;
    const col = this.catOf(it.cat)?.color ?? '#59616b';
    ctx.save();
    if (small && !zoomed) {
      ctx.beginPath(); ctx.arc(p[0], p[1], 3.8, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.globalAlpha *= 0.9; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.restore();
      return;
    }
    if (!small && pulse > 0 && pulse < 1) {
      ctx.beginPath(); ctx.arc(p[0], p[1], 11 + pulse * 24, 0, Math.PI * 2);
      ctx.strokeStyle = col; ctx.globalAlpha = (1 - pulse) * 0.75; ctx.lineWidth = 3; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const r = (small ? 8.5 : 12.5) * s;
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
    ctx.fillStyle = rc.theme.dark ? '#1b2230' : '#ffffff'; ctx.fill();
    ctx.lineWidth = small ? 1.8 : 2.8; ctx.strokeStyle = col; ctx.stroke();
    ctx.font = `${Math.round((small ? 9.5 : 13.5) * s)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(it.icon, p[0], p[1] + 0.5);
    ctx.restore();
  }

  private labels(rc: RenderCtx) {
    const c = this.c;
    if (!c) return;
    const st = c.steps[this.step];
    const el = this.elapsed();
    const pxr = rc.view.pxPerRadian;
    const seen = new Set<number>();
    for (const side of c.sides) {
      const idx = st.control[side.id];
      if (idx == null || seen.has(idx)) continue;
      seen.add(idx);
      const a = this.areas.get(idx);
      if (!a) continue;
      const px = Math.sqrt(a.area) * pxr;
      if (px < 46) continue;
      const p = rc.project(a.lp[0], a.lp[1]);
      // Under the top bar or the story bar it could not be read.
      if (!p || p[1] < 76 || p[1] > rc.view.h - rc.view.insetBottom - 16) continue;
      // A long legend name ("Women can vote in national elections") stays small and in lower case.
      const name = tx(side.name), long = !this.wars && name.length > 24;
      rc.labels.add({
        text: name, x: p[0], y: p[1], priority: 950 + Math.min(300, px), size: long ? Math.max(10.5, Math.min(13, 8 + px / 60)) : Math.max(10.5, Math.min(16, 8 + px / 45)),
        weight: 800, caps: px > 140 && !long, color: '#ffffff', halo: darker(side.color, 0.55),
      });
    }
    (st.battles ?? []).forEach((b, k) => {
      if (el < BATTLE_FROM + k * BATTLE_GAP + POP * 0.6) return;
      const p = rc.project(b.at[0], b.at[1]);
      if (!p) return;
      const lost = totalLosses(b.casualties);
      // Beside the marker, on whichever side fits on the screen.
      rc.labels.add({
        text: tx(b.name), x: p[0], y: p[1], gap: 15,
        priority: 1400 - k, size: 12, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo,
        ...(lost ? { sub: `☠ ${fmtShort(lost)}`, subColor: rc.theme.dark ? '#ff9b8f' : '#a8322a', subSize: 11 } : {}),
      });
    });
    // Named routes, once drawn: the name sits halfway along.
    (st.moves ?? []).forEach((mv, k) => {
      if (!mv.label || el < MOVE_FROM + k * 300 + MOVE_MS) return;
      const mid = routeTo(mv.path, 0.5);
      const g = mid[mid.length - 1];
      const p = rc.project(g[0], g[1]);
      if (!p) return;
      rc.labels.add({ text: tx(mv.label), x: p[0], y: p[1] - 12, priority: 700 - k, size: 11.5, weight: 700, italic: true, color: darker(this.sideColor(mv.side), 0.75), halo: rc.theme.labelHalo });
    });
    if (c.items) {
      const now = st.show ?? [];
      const spot = (k: number): [number, number] | null => {
        const sp = this.spots.key === `${c.id}:${this.step}` ? this.spots.at.get(k) : undefined;
        return sp ? [sp.x, sp.y] : rc.project(c.items![k].at[0], c.items![k].at[1]);
      };
      now.forEach((k, n) => {
        if (el < BATTLE_FROM + n * ITEM_GAP + POP * 0.6) return;
        const it = c.items![k];
        const p = spot(k);
        if (!p) return;
        rc.labels.add({
          text: tx(it.name), x: p[0], y: p[1], gap: 16, priority: 1350 - n, size: 12, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo,
          sub: itemYears(it, c.t0), subColor: rc.theme.dark ? '#c3ccd6' : '#5b6470', subSize: 10.5,
        });
      });
      // Zoomed in, the earlier ones get their names too.
      if (rc.view.pxPerRadian > 1600) {
        c.items.forEach((it, k) => {
          if (now.includes(k) || !this.onMap(it, st)) return;
          const p = spot(k);
          if (p) rc.labels.add({ text: tx(it.name), x: p[0], y: p[1], gap: 11, priority: 520, size: 10.5, weight: 600, color: rc.theme.label, halo: rc.theme.labelHalo });
        });
      }
    }
  }

  // ---- taps

  tap(lon: number, lat: number): boolean {
    const c = this.c;
    if (!c) return true;
    const v = this.app.renderer.view;
    const here = v.project(lon, lat);
    const st = c.steps[this.step];
    if (c.items && here) {
      // An item near the tap (where its marker is drawn): this step's first, then the others on the map.
      const now = st.show ?? [];
      const rest = c.items.map((_, k) => k).filter((k) => !now.includes(k) && this.onMap(c.items![k], st));
      const drawn = this.spots.key === `${c.id}:${this.step}` ? this.spots.at : null;
      for (const [n, pool] of [now, rest].entries()) {
        let best = -1, bestD = n === 0 ? 26 : 16;
        for (const k of pool) {
          const sp = drawn?.get(k);
          const p = sp ? [sp.x, sp.y] : v.project(c.items[k].at[0], c.items[k].at[1]);
          if (!p) continue;
          const d = Math.hypot(p[0] - here[0], p[1] - here[1]);
          if (d < bestD) { bestD = d; best = k; }
        }
        if (best >= 0) { this.itemCard(c.items[best]); return true; }
      }
    }
    // A battle marker near the tap: this step's first, then earlier ones.
    const pools: Battle[][] = [st.battles ?? [], c.steps.slice(0, this.step).reverse().flatMap((s) => s.battles ?? [])];
    for (const [k, pool] of pools.entries()) {
      let best: Battle | null = null, bestD = k === 0 ? 26 : 14;
      for (const b of pool) {
        const p = v.project(b.at[0], b.at[1]);
        if (!p || !here) continue;
        const d = Math.hypot(p[0] - here[0], p[1] - here[1]);
        if (d < bestD) { bestD = d; best = b; }
      }
      if (best) { this.battleCard(best, st); return true; }
    }
    for (const side of [...c.sides].reverse()) {
      const a = this.areas.get(st.control[side.id] ?? -1);
      if (a && geoContains(a.feature as never, [lon, lat])) {
        const rows = [
          ...(side.members ? [{ label: t('warMembers'), value: tx(side.members), icon: '🤝' }] : []),
          { label: fmtWhen(st.date, c.t0), value: tx(st.title), icon: '📅' },
        ];
        this.shell.card.showCustom(c.icon, tx(side.name), tx(c.name), rows);
        return true;
      }
    }
    this.shell.card.hide();
    return true;
  }

  /** An item's card: when, where, who, size, what remains, its story, and a picture from Wikipedia. */
  itemCard(it: Omit<Item, 'first'>) {
    const c = this.c;
    const cat = this.catOf(it.cat);
    const rows: { label: string; value: string; icon: string }[] = [];
    rows.push({ label: it.life ? t('storyLived') : t('storyWhen'), value: itemWhen(it, c?.t0 ?? 1), icon: '📅' });
    if (it.place) rows.push({ label: t('storyWhere'), value: tx(it.place), icon: '📍' });
    if (it.size) rows.push({ label: t('storySize'), value: tx(it.size), icon: '📏' });
    if (it.status) rows.push({ label: t('storyStatus'), value: tx(it.status), icon: '🏷️' });
    for (const f of it.facts ?? []) rows.push({ label: tx(f.label), value: tx(f.value), icon: '⭐' });
    const notes = [tx(it.text)];
    if (it.by) notes.push(`${t('storyBy')}: ${tx(it.by)}`);
    if (it.why) notes.push(`${t('storyWhy')}: ${tx(it.why)}`);
    if (it.how) notes.push(`${t('storyHow')}: ${tx(it.how)}`);
    if (it.details) notes.push(tx(it.details));
    const links = it.wiki ? [{ label: t('wikipedia'), href: wikiUrl(it.wiki) }] : [];
    const sub = [cat ? `${cat.icon} ${tx(cat.name)}` : '', c ? tx(c.name) : ''].filter(Boolean).join(' · ');
    this.shell.card.showCustom(it.icon, tx(it.name), sub, rows, links, notes, this.wikiThumb(it));
  }

  private wikiThumb(it: Omit<Item, 'first'>) { return wikiThumb(it.wiki); }

  /** Stops playing (a tour or a quiz opened the story). */
  pause() { if (this.playing) { this.playing = false; this.renderBar(); } }

  /** Shows a story at a step, paused (guided tours): opens it, or just moves when it is open. */
  async show(id: string, step: number) {
    if (this.active && this.c?.id === id) { this.shell.card.hide(); this.go(step, { user: true }); }
    else await this.open(id, step);
    this.pause();
  }

  /** Flies to an item and opens its card. */
  private focusItem(it: Omit<Item, 'first'>) {
    const v = this.app.renderer.view;
    v.flyTo({ lon: it.at[0], lat: it.at[1], zoom: Math.max(v.zoom, 4.5) }, 1200);
    setTimeout(() => this.itemCard(it), 1250);
  }

  /** A row in a list of items (details, Browse). */
  private itemRow(it: Omit<Item, 'first'>, onClick: () => void, extra?: string) {
    const b = h('button', { type: 'button', class: 'story-item' },
      h('span', { class: 'story-item-icon', style: { borderColor: this.catOf(it.cat)?.color ?? 'var(--line)' } }, it.icon),
      h('span', { class: 'story-item-text' },
        h('span', { class: 'story-item-name' }, tx(it.name)),
        h('span', { class: 'story-item-sub' }, [itemWhen(it, this.c?.t0 ?? 1), it.place ? tx(it.place) : '', extra ?? ''].filter(Boolean).join(' · ')),
        h('span', { class: 'story-item-desc' }, tx(it.text))));
    b.addEventListener('click', onClick);
    return b;
  }

  /** A searchable list of items, filtered by category. */
  private openBrowser(entries: { it: Omit<Item, 'first'>; extra?: string; go: () => void }[], title: string) {
    const cats = [...new Set(entries.map((e) => e.it.cat))].map((id) => this.catOf(id)).filter((x): x is Cat => !!x);
    let q = '', cat = '';
    const input = h('input', { type: 'search', class: 'search-input', placeholder: t('storySearch'), 'aria-label': t('storySearch') }) as HTMLInputElement;
    const chips = h('div', { class: 'chip-row story-chips' });
    const count = h('p', { class: 'muted small' });
    const list = h('div', { class: 'story-list' });
    const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const draw = () => {
      clear(list);
      const nq = norm(q.trim());
      const shown = entries.filter((e) => (!cat || e.it.cat === cat) && (!nq || norm(`${tx(e.it.name)} ${e.it.place ? tx(e.it.place) : ''} ${tx(e.it.text)}`).includes(nq)));
      count.textContent = t('storyCount', { n: shown.length });
      if (!shown.length) list.append(h('p', { class: 'muted' }, t('storyNothing')));
      for (const e of shown.slice(0, 300)) list.append(this.itemRow(e.it, e.go, e.extra));
    };
    const drawChips = () => {
      clear(chips);
      for (const k of [null, ...cats]) {
        const b = h('button', { type: 'button', class: `chip${(k?.id ?? '') === cat ? ' on' : ''}` }, k ? `${k.icon} ${tx(k.name)}` : t('storyAllCats'));
        b.addEventListener('click', () => { cat = k?.id ?? ''; drawChips(); draw(); });
        chips.append(b);
      }
    };
    input.addEventListener('input', () => { q = input.value; draw(); });
    drawChips(); draw();
    this.shell.openPanel('story-browse', title, h('div', null, count, list), undefined, h('div', { class: 'story-browse-head' }, input, chips));
  }

  /** Everything in the story on show, by date. */
  private browse() {
    const c = this.c;
    if (!c?.items) return;
    if (this.playing) { this.playing = false; this.renderBar(); }
    const entries = c.items.map((it) => ({
      it,
      go: () => {
        const step = it.first >= 0 ? it.first : Math.max(0, c.steps.findIndex((st) => st.t >= it.t));
        this.shell.sheet.close();
        this.playing = false;
        if (step !== this.step) this.go(step, { stay: true });
        this.focusItem(it);
      },
    })).sort((a, b) => a.it.t - b.it.t);
    this.openBrowser(entries, `${t('storyBrowse')} · ${tx(c.name)}`);
  }

  /** Everything in the collection, from every story (the picker's "Browse everything"). */
  async browseCollection() {
    await this.ensureIndex();
    if (!this.all) this.all = (await loadJSON<{ items: CollectionItem[] }>(`${this.dir}/items.json`)).items;
    const names = new Map(this.index.map((e) => [e.id, tx(e.name)]));
    const entries = [...this.all].sort((a, b) => a.t - b.t).map((it) => ({
      it, extra: names.get(it.story),
      go: () => void this.open(it.story, it.step, { name: tx(it.name), at: it.at }),
    }));
    this.openBrowser(entries, `${KINDS[this.kind].icon} ${this.tr('Title')}`);
  }

  /** A battle's facts as rows, and its notes as paragraphs. */
  private battleInfo(b: Battle, st: Step) {
    const c = this.c!;
    const rows: { label: string; value: string; icon: string }[] = [];
    const notes: string[] = [];
    rows.push({ label: t('warDate'), value: fmtWhen(b.date ?? st.date, c.t0), icon: '📅' });
    const winner = b.winner && b.winner !== 'none' ? c.sides.find((s) => s.id === b.winner) : null;
    if (b.result) rows.push({ label: t('warResult'), value: tx(b.result), icon: '🏁' });
    else if (winner) rows.push({ label: t('warResult'), value: t('warVictory', { side: tx(winner.name) }), icon: '🏁' });
    for (const [k, v] of Object.entries(b.casualties ?? {})) {
      if (k === 'note' || v == null) continue;
      const name = k === 'total' ? t('warTotal') : tx(c.sides.find((s) => s.id === k)?.name);
      rows.push({ label: `${t('warLosses')}: ${name}`, value: fmtRange(v as Range), icon: '☠️' });
    }
    if (b.details) notes.push(tx(b.details));
    if (b.casualties?.note) notes.push(`${t('warNote')}: ${tx(b.casualties.note)}`);
    return { rows, notes };
  }

  private battleCard(b: Battle, st: Step) {
    const es = lang() === 'es';
    const wiki = `https://${es ? 'es' : 'en'}.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(tx(b.name))}`;
    const { rows, notes } = this.battleInfo(b, st);
    this.shell.card.showCustom('⚔️', tx(b.name), tx(this.c!.name), rows, [{ label: t('wikipedia'), href: wiki }], notes);
  }

  // ---- the bar

  private buildBar() {
    this.bar?.remove();
    const c = this.c!;
    const play = h('button', { type: 'button', class: 'tb-play', 'aria-label': 'Play' }) as HTMLButtonElement;
    play.addEventListener('click', () => this.toggle());
    const prev = h('button', { type: 'button', class: 'icon-btn', title: t('warPrev'), 'aria-label': t('warPrev') }, icon(ChevronLeft, 20));
    prev.addEventListener('click', () => { this.playing = false; this.go(this.step - 1, { user: true }); });
    const next = h('button', { type: 'button', class: 'icon-btn', title: t('warNext'), 'aria-label': t('warNext') }, icon(ChevronRight, 20));
    next.addEventListener('click', () => { this.playing = false; this.go(this.step + 1, { user: true }); });
    const allLabel = this.wars ? t('warsAll') : t('storyAll');
    const list = h('button', { type: 'button', class: 'icon-btn wb-list', title: allLabel, 'aria-label': allLabel }, icon(ListOrdered, 18));
    list.addEventListener('click', () => void this.pick());
    const exit = h('button', { type: 'button', class: 'icon-btn wb-exit', title: t('close'), 'aria-label': t('close') }, icon(X, 18));
    exit.addEventListener('click', () => void this.exit());
    const tools: HTMLElement[] = [list, exit];
    if (c.items) {
      const browse = h('button', { type: 'button', class: 'icon-btn wb-browse', title: t('storyBrowse'), 'aria-label': t('storyBrowse') }, icon(Search, 18));
      browse.addEventListener('click', () => this.browse());
      tools.unshift(browse);
    }
    const date = h('div', { class: 'wb-date' });
    const count = h('span', { class: 'wb-count' });
    const title = h('div', { class: 'wb-title' });
    // Three lines of the step's text; a tap shows all of it (and folds it again).
    const text = h('p', { class: 'wb-text', role: 'button', tabindex: '0', 'aria-expanded': 'false', title: t('storyReadAll') });
    const flip = () => {
      if (!text.classList.contains('cut') && !text.classList.contains('open')) return; // all of it is shown already
      this.textOpen = !this.textOpen; this.fitText(); this.measureBar();
    };
    text.addEventListener('click', flip);
    text.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
    const meta = h('div', { class: 'wb-meta' });
    const track = h('div', { class: 'wb-track', role: 'slider', tabindex: '0', 'aria-label': tx(c.name) });
    c.steps.forEach((s, i) => {
      const tick = h('button', { type: 'button', class: `wb-tick${s.aftermath ? ' after' : ''}`, title: `${fmtWhen(s.date, c.t0)} · ${tx(s.title)}`, 'aria-label': `${fmtWhen(s.date, c.t0)} · ${tx(s.title)}` });
      tick.addEventListener('click', () => { this.playing = false; this.go(i, { user: true }); });
      track.append(tick);
    });
    this.bar = h('section', { class: 'warbar glass', 'aria-label': tx(c.name) },
      h('div', { class: 'wb-top' },
        play,
        h('div', { class: 'wb-head' }, date, h('div', { class: 'wb-name' }, h('span', { class: 'wb-title-short' }, `${c.icon} ${tx(c.name)}`), count)),
        h('div', { class: 'wb-tools' }, ...tools)),
      title, text, meta, h('div', { class: 'wb-nav' }, prev, track, next));
    this.ui = { date, title, text, meta, play, track, count };
    this.app.root.append(this.bar);
  }

  private renderBar() {
    const c = this.c, ui = this.ui;
    if (!c || !ui) return;
    const st = c.steps[this.step];
    ui.date.textContent = fmtWhen(st.date, c.t0);
    fitLine(ui.date);
    ui.count.textContent = ` · ${t('warStepOf', { k: this.step + 1, n: c.steps.length })}`;
    clear(ui.title);
    ui.title.append(...(st.aftermath ? [h('span', { class: 'wb-tag' }, t('warAftermath')), ' '] : []), stepTitle(st));
    this.fitText();
    clear(ui.play);
    ui.play.append(icon(this.playing ? Pause : Play, 22));
    ui.play.setAttribute('aria-label', this.playing ? 'Pause' : 'Play');
    ui.track.querySelectorAll('.wb-tick').forEach((el, i) => { el.classList.toggle('done', i < this.step); el.classList.toggle('on', i === this.step); });
    clear(ui.meta);
    const shown = c.sides.filter((s) => st.control[s.id] != null || (st.moves ?? []).some((m) => m.side === s.id));
    for (const s of shown) ui.meta.append(h('span', { class: 'wb-side' }, h('i', { style: { background: s.color } }), tx(s.name)));
    if (c.items && st.show?.length) {
      // The kinds of things this step shows (people, works, dishes...), most common first.
      const n = new Map<string, number>();
      for (const k of st.show) n.set(c.items[k].cat, (n.get(c.items[k].cat) ?? 0) + 1);
      for (const [id] of [...n].sort((a, b) => b[1] - a[1]).slice(0, shown.length ? 2 : 3)) {
        const k = this.catOf(id);
        if (k) ui.meta.append(h('span', { class: 'wb-side' }, h('b', { class: 'story-cat' }, k.icon), tx(k.name)));
      }
    }
    if (st.deaths != null) {
      const el = h('span', { class: 'wb-deaths', title: t('warDeathsSoFar') });
      ui.meta.append(el);
      this.countUp(el, this.prev >= 0 ? this.c!.steps[this.prev].deaths : undefined, st.deaths);
    }
    const more = h('button', { type: 'button', class: 'pill sm wb-more' }, icon(BookOpen, 15), t('warDetails'));
    more.addEventListener('click', () => this.openDetails());
    ui.meta.append(more);
    requestAnimationFrame(() => this.measureBar());
  }

  /** The map centres above the bar, and the card sits over it. */
  private measureBar() {
    if (!this.bar) return;
    const r = this.bar.getBoundingClientRect();
    const covered = Math.max(0, window.innerHeight - r.top + 6);
    this.app.renderer.view.insetBottom = covered;
    document.documentElement.style.setProperty('--wb-h', `${Math.round(r.height)}px`);
    this.app.renderer.requestRender();
  }

  /** The step's text: all of it when opened, else three lines that end, when it is longer, in "… more". */
  private fitText() {
    const el = this.ui?.text, c = this.c;
    if (!el || !c) return;
    const full = tx(c.steps[this.step].text);
    const link = (key: string) => h('span', { class: 'wb-text-more' }, t(key));
    el.classList.remove('open', 'cut');
    el.textContent = full;
    el.setAttribute('aria-expanded', 'false');
    const fits = () => el.scrollHeight <= el.clientHeight + 1;
    if (!el.clientHeight || fits()) return;
    if (this.textOpen) { el.classList.add('open'); el.append(' ', link('storyLess')); el.setAttribute('aria-expanded', 'true'); return; }
    el.classList.add('cut');
    // The longest start of the text, cut at a word, that leaves room for "… more".
    const show = (n: number) => { el.textContent = `${cutAt(full, n)}… `; el.append(link('storyMore')); };
    let lo = 0, hi = full.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      show(mid);
      if (fits()) lo = mid; else hi = mid - 1;
    }
    show(lo);
  }

  /** Counts the death toll up (or down) from the previous step's figure. */
  private countUp(el: HTMLElement, from: Range | undefined, to: Range) {
    const lo = (v: Range) => (typeof v === 'number' ? v : v[0]), hi = (v: Range) => (typeof v === 'number' ? v : v[1]);
    const f = from ?? 0;
    const t0 = performance.now(), ms = 1300 / this.speed;
    const step = (now: number) => {
      if (!el.isConnected) return;
      const q = ease((now - t0) / ms);
      const a = Math.round(lo(f) + (lo(to) - lo(f)) * q), b = Math.round(hi(f) + (hi(to) - hi(f)) * q);
      el.textContent = `☠️ ${fmtRange(a === b ? a : [a, b])} ${t('warDeathsShort')}`;
      if (q < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** The step's longer story, its battles and events, and the outcome at the end. */
  private openDetails(refresh = false) {
    const c = this.c;
    if (!c) return;
    // Reading pauses the story.
    if (!refresh && this.playing) { this.playing = false; this.renderBar(); }
    const st = c.steps[this.step];
    const body = h('div', { class: 'war-details' });
    if (this.step === 0) body.append(h('p', { class: 'war-summary' }, tx(c.summary)));
    // The bar's text first (it may have been cut there), then the longer notes.
    if (st.details && tx(st.details) !== tx(st.text)) body.append(h('p', { class: 'war-lead' }, tx(st.text)));
    body.append(h('p', null, tx(st.details) || tx(st.text)));
    if (st.battles?.length) {
      body.append(h('h3', { class: 'sec-title' }, `⚔️ ${t('warBattles')}`));
      for (const b of st.battles) {
        const { rows, notes } = this.battleInfo(b, st);
        body.append(h('div', { class: 'war-battle' }, h('div', { class: 'war-battle-name' }, tx(b.name)),
          rows.map((r) => h('div', { class: 'row' }, h('span', { class: 'row-icon' }, r.icon), h('span', { class: 'row-label' }, r.label), h('span', { class: 'row-value' }, r.value))),
          notes.map((n) => h('p', { class: 'card-note' }, n))));
      }
    }
    if (c.items && st.show?.length) {
      body.append(h('h3', { class: 'sec-title' }, `📍 ${t('storyOnMap')}`));
      for (const k of st.show) {
        const it = c.items[k];
        body.append(this.itemRow(it, () => { this.shell.sheet.close(); this.focusItem(it); }));
      }
    }
    if (st.events?.length) {
      body.append(h('h3', { class: 'sec-title' }, `📜 ${t('warEvents')}`));
      body.append(h('ul', { class: 'war-events' }, st.events.map((e) => h('li', null, `${e.icon} ${e.date ? `${fmtWhen(e.date, c.t0)}: ` : ''}${tx(e.text)}`))));
    }
    const lastFight = c.steps.reduce((k, s, i) => (s.aftermath ? k : i), 0);
    if (this.step >= lastFight) {
      body.append(h('h3', { class: 'sec-title' }, this.wars ? `🏁 ${t('warOutcome')}` : `🌍 ${t('storyLegacy')}`), h('p', null, tx(c.outcome)));
      const total = c.casualties ? Object.entries(c.casualties).filter(([k, v]) => k !== 'note' && v != null) : [];
      if (total.length || c.casualtiesNote) {
        body.append(h('h3', { class: 'sec-title' }, `☠️ ${t('warHumanCost')}`));
        for (const [k, v] of total) body.append(h('div', { class: 'row' }, h('span', { class: 'row-icon' }, '☠️'), h('span', { class: 'row-label' }, k === 'total' ? t('warTotal') : tx(c.sides.find((s) => s.id === k)?.name)), h('span', { class: 'row-value' }, fmtRange(v as Range))));
        if (c.casualtiesNote) body.append(h('p', { class: 'muted' }, tx(c.casualtiesNote)));
      }
    }
    if (c.items) {
      const all = h('button', { type: 'button', class: 'pill story-browse-all' }, icon(Search, 16), t('storyBrowse'));
      all.addEventListener('click', () => this.browse());
      body.append(all);
    }
    body.append(h('h3', { class: 'sec-title' }, `📚 ${t('warSources')}`),
      h('ul', { class: 'war-sources' }, c.sources.map((s) => h('li', null, h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title)))));
    const title = `${fmtWhen(st.date, c.t0)} · ${stepTitle(st)}`;
    if (refresh) {
      const el = this.shell.sheet.el.querySelector('.sheet-body');
      if (el) { clear(el); el.append(body); el.scrollTop = 0; }
      this.shell.sheet.setTitle(title);
    } else this.shell.openPanel('war-step', title, body);
  }
}

const yearOf = (d: string) => /^-?\d+/.exec(d)?.[0] ?? d;

const thumbs = new Map<string, Promise<string | null>>();
/** The picture of a Wikipedia article (in the reader's language, else English), or null. */
export function wikiThumb(wiki?: Text): Promise<string | null> {
  if (!wiki) return Promise.resolve(null);
  const l = lang() === 'es' ? 'es' : 'en';
  const key = `${l}:${wiki[l]}`;
  let p = thumbs.get(key);
  if (!p) {
    p = (async () => {
      for (const [ll, title] of [[l, wiki[l]], ['en', wiki.en]] as const) {
        if (!title) continue;
        try {
          const r = await fetch(`https://${ll}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
          if (!r.ok) continue;
          const j = (await r.json()) as { thumbnail?: { source: string } };
          if (j.thumbnail?.source) return j.thumbnail.source;
        } catch { /* offline */ }
      }
      return null;
    })();
    thumbs.set(key, p);
  }
  return p;
}

/** When an item was: "1452–1519" (a life), "2600–2560 BC" (built), "c. 1503" style dates. */
export function itemWhen(it: Omit<Item, 'first'>, eraHint: number): string {
  if (it.life) return it.life[1] ? fmtYears(it.life[0], it.life[1]) : `${fmtWhen(yearOf(it.life[0]), eraHint)}–`;
  if (it.end && yearOf(it.end) !== yearOf(it.date)) return fmtYears(it.date, it.end);
  if (it.until && yearOf(it.until) !== yearOf(it.date)) return fmtYears(it.date, it.until);
  return fmtWhen(it.date, eraHint);
}

/** The years under an item's name on the map. */
function itemYears(it: Omit<Item, 'first'>, eraHint: number): string {
  if (it.life) return it.life[1] ? fmtYears(it.life[0], it.life[1]) : `${fmtWhen(yearOf(it.life[0]), eraHint)}–`;
  if (it.end && yearOf(it.end) !== yearOf(it.date)) return fmtYears(it.date, it.end);
  if (it.until && yearOf(it.until) !== yearOf(it.date)) return fmtYears(it.date, it.until);
  return fmtWhen(yearOf(it.date), eraHint);
}

/** The item's Wikipedia article in the reader's language. */
function wikiUrl(w: Text): string {
  const l = lang() === 'es' && w.es ? 'es' : 'en';
  return `https://${l}.wikipedia.org/wiki/${encodeURIComponent(w[l].replace(/ /g, '_'))}`;
}

/** A step's title; aftermath steps get a tag in the bar, so a leading "Aftermath:" is dropped. */
function stepTitle(st: Step): string {
  const s = tx(st.title);
  return st.aftermath ? s.replace(/^(aftermath|after the war|después|tras la guerra|consecuencias)\s*[:—–-]\s*/i, '').replace(/^./, (ch) => ch.toUpperCase()) : s;
}

/** All sides' casualties of a battle added up (low and high), or null when none are given. */
function totalLosses(c?: Losses): [number, number] | null {
  if (!c) return null;
  if (Array.isArray(c.total) || typeof c.total === 'number') { const v = c.total as Range; return typeof v === 'number' ? [v, v] : v; }
  let lo = 0, hi = 0, any = false;
  for (const [k, v] of Object.entries(c)) {
    if (k === 'note' || v == null || (typeof v !== 'number' && !Array.isArray(v))) continue;
    any = true;
    lo += typeof v === 'number' ? v : v[0];
    hi += typeof v === 'number' ? v : v[1];
  }
  return any ? [lo, hi] : null;
}

/** "41K–92K", "150", "1.2M" for the map. */
function fmtShort(v: [number, number]): string {
  const f = (n: number) => (n >= 10000 ? fmtCompact(n) : fmtNumber(n));
  return v[0] === v[1] ? f(v[0]) : `${f(v[0])}–${f(v[1])}`;
}

/** Shrinks an element's text until it fits on its one line (long dates on phones). */
/**
 * Moves overlapping markers apart until every pair is at least their radii plus `gap` apart; a
 * heavier marker (wt) moves less. Markers on the very same spot fan out in fixed directions, so
 * the layout is the same from frame to frame.
 */
function spread(pts: Spot[], gap: number) {
  const n = pts.length;
  if (n < 2) return;
  const cell = 2 * Math.max(...pts.map((p) => p.r)) + gap;
  const key = (gx: number, gy: number) => (gx + 32768) * 65536 + (gy + 32768);
  for (let iter = 0; iter < 60; iter++) {
    const grid = new Map<number, number[]>();
    pts.forEach((p, i) => {
      const g = key(Math.floor(p.x / cell), Math.floor(p.y / cell));
      const b = grid.get(g);
      if (b) b.push(i); else grid.set(g, [i]);
    });
    let moved = false;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const gx = Math.floor(a.x / cell), gy = Math.floor(a.y / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const j of grid.get(key(gx + dx, gy + dy)) ?? []) {
          if (j <= i) continue;
          const b = pts[j];
          const need = a.r + b.r + gap;
          let ux = b.x - a.x, uy = b.y - a.y;
          const d = Math.hypot(ux, uy);
          if (d >= need) continue;
          if (d < 0.01) { const t = (i * 0.618 + j * 0.382) * Math.PI * 2; ux = Math.cos(t); uy = Math.sin(t); } else { ux /= d; uy /= d; }
          const push = need - d, fa = b.wt / (a.wt + b.wt), fb = 1 - fa;
          a.x -= ux * push * fa; a.y -= uy * push * fa;
          b.x += ux * push * fb; b.y += uy * push * fb;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}

/** The first `n` characters of a text, cut back to the end of a word. */
function cutAt(s: string, n: number): string {
  if (n >= s.length) return s;
  const x = s.slice(0, n), sp = x.lastIndexOf(' ');
  return (sp > n * 0.6 ? x.slice(0, sp) : x).replace(/[\s,;:.\-–—(]+$/, '');
}

function fitLine(el: HTMLElement, min = 13) {
  el.style.fontSize = '';
  let size = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > el.clientWidth + 1 && size > min) el.style.fontSize = `${--size}px`;
}

function labelPoint(f: Feature<Geometry>): { lp: Pt; area: number } {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  let best: Feature<Polygon> | null = null, bestA = -1;
  for (const c of polys) {
    const pf: Feature<Polygon> = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: c } };
    const a = geoArea(pf);
    if (a > bestA) { bestA = a; best = pf; }
  }
  return { lp: (best ? geoCentroid(best) : [0, 0]) as Pt, area: Math.max(0, bestA) };
}
