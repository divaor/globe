// Wars and conquests: famous conflicts played step by step on the map. Each step shows the
// territory every side holds (crossfading from the step before), the routes armies take (drawn as
// they march), the battles of the moment (markers that pop up; tap one for its casualties) and
// events such as declarations of war. A bar under the map tells the story; "Details" opens the
// longer notes, every battle, the outcome and the sources. Data: public/data/conflicts/, built by
// scripts/data/build-conflicts.mjs from scripts/data/conflicts/*.json.
import { geoArea, geoCentroid, geoContains, geoDistance, geoInterpolate } from 'd3-geo';
import { mesh } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Geometry, MultiLineString, Polygon } from 'geojson';
import { Play, Pause, X, ChevronLeft, ChevronRight, ListOrdered, BookOpen } from 'lucide';
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
interface Step {
  date: string; t: number; title: Text; text: Text; details?: Text; control: Record<string, number | null>;
  moves?: Move[]; battles?: Battle[]; events?: WarEvent[]; deaths?: Range; camera?: Cam; aftermath?: boolean;
}
interface Conflict {
  id: string; name: Text; icon: string; era: string; region: Text; summary: Text; start: string; end: string; t0: number; t1: number;
  camera: Cam; sides: Side[]; casualties?: Losses; casualtiesNote?: Text; outcome: Text; sources: { title: string; url: string }[]; steps: Step[];
}
interface Entry { id: string; name: Text; icon: string; era: string; region: Text; summary: Text; start: string; end: string; t0: number; t1: number; steps: number; sides: { name: Text; color: string }[] }
interface Area extends Shape { lp: Pt; area: number }

export const ERAS = ['ancient', 'medieval', 'early-modern', 'modern', 'contemporary'];
const MONTHS: Record<'en' | 'es', string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
};

// Timing of a step, in ms at 1×: the territory fades in, arrows draw, battles pop up one by one.
const FADE = 900, MOVE_FROM = 250, MOVE_MS = 2300, BATTLE_FROM = 700, BATTLE_GAP = 420, POP = 380, PULSE = 1500;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const pop = (x: number) => { const t = clamp01(x); return t < 1 ? 1 - Math.pow(1 - t, 3) * (1 - 2.2 * t) : 1; };

/** "1 September 1939", "May 334 BC", "336 a. C."... */
export function fmtWhen(d: string, eraHint = 1): string {
  const m = /^(-?\d+)(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(d);
  if (!m) return d;
  const y = Number(m[1]), mo = m[2] ? Number(m[2]) : 0, day = m[3] ? Number(m[3]) : 0;
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

export class WarsMode {
  private index: Entry[] = [];
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
  readonly layer: LayerDef;

  constructor(private app: App, private shell: Shell) {
    const self = this;
    this.layer = {
      id: 'wars', category: 'political', icon: '⚔️', kind: 'fill', hidden: true, animated: true,
      name: { en: 'Wars and conquests', es: 'Guerras y conquistas' },
      desc: { en: 'Conflicts step by step.', es: 'Conflictos paso a paso.' },
      credit: 'Wars and conquests: Atlas Globe (sources listed with each conflict); historical borders: aourednik/historical-basemaps (GPL-3.0)',
      drawFill(rc) { self.drawFill(rc); },
      drawOverlay(rc) { self.drawOverlay(rc); },
      labels(rc) { self.labels(rc); },
    };
    app.register([this.layer]);
    app.on('lang', () => { if (this.active && this.c) { this.buildBar(); this.renderBar(); } });
  }

  get active() { return this.app.mode === 'wars'; }

  private async ensureIndex() {
    if (!this.index.length) this.index = (await loadJSON<{ conflicts: Entry[] }>('conflicts/index.json')).conflicts;
    if (!this.snaps.length) {
      const idx = await loadJSON<{ snapshots: { year: number; file: string }[] }>('history/index.json');
      this.snaps = idx.snapshots.map((s) => ({ ...s, astro: s.year < 0 ? s.year + 1 : s.year }));
    }
  }

  /** The list of conflicts, by era (from the Time travel menu or the bar's list button). */
  async pick() {
    await this.ensureIndex();
    const wrap = h('div', { class: 'war-list' }, h('p', { class: 'muted small' }, t('warsIntro')));
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
            h('span', { class: 'war-sides' }, c.sides.map((s) => h('span', { class: 'war-side' }, h('i', { style: { background: s.color } }), tx(s.name))))));
        card.addEventListener('click', () => void this.open(c.id));
        wrap.append(card);
      }
    }
    this.shell.openPanel('wars', t('warsTitle'), wrap);
  }

  /** Opens a conflict (at a step, from a shared link) and starts playing it. */
  async open(id: string, at = 0) {
    this.shell.sheet.close();
    await this.ensureIndex();
    const [c, topo] = await Promise.all([loadJSON<Conflict>(`conflicts/${id}.json`), loadJSON<Topology>(`conflicts/${id}-areas.json`)]);
    if (!this.active) await this.enterMode();
    this.stop();
    this.c = c;
    this.areas = new Map(shapesFrom(topo, 'areas').map((s) => [Number(s.id), { ...s, ...labelPoint(s.feature) }]));
    this.step = Math.max(0, Math.min(c.steps.length - 1, at)); this.prev = -1;
    this.buildBar();
    this.go(this.step, { fly: true });
    this.playing = true;
    this.renderBar();
    this.app.emit('mode', 'wars');
  }

  private async enterMode() {
    const app = this.app;
    this.savedStack = app.layers.filter((l) => !l.def.hidden).map((l) => l.def.id);
    this.savedProjection = app.projection;
    app.mode = 'wars';
    document.documentElement.classList.add('mode-time', 'mode-wars');
    app.select(null);
    app.renderer.baseMap = false;
    await app.setStack(['wars']);
    window.addEventListener('keydown', this.onKey);
  }

  async exit() {
    if (!this.active) return;
    const app = this.app;
    this.stop();
    this.bar?.remove();
    this.bar = null; this.ui = null; this.c = null;
    window.removeEventListener('keydown', this.onKey);
    app.renderer.view.insetBottom = 0;
    app.mode = null;
    document.documentElement.classList.remove('mode-time', 'mode-wars');
    app.renderer.baseMap = true;
    for (const id of ['wars', 'war-step']) if (this.shell.sheet.isOpen(id)) this.shell.sheet.close();
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

  /** Shows step `i`; the camera moves when the step (or a jump) asks for another view. */
  private go(i: number, o: { fly?: boolean; user?: boolean } = {}) {
    const c = this.c!;
    i = Math.max(0, Math.min(c.steps.length - 1, i));
    this.prev = i === this.step ? -1 : this.step;
    this.step = i;
    const cam = this.cameraAt(i);
    let delay = 0;
    if (o.fly || o.user || c.steps[i].camera) {
      const v = this.app.renderer.view;
      const far = geoDistance([v.lon, v.lat], [cam.lon, cam.lat]) > 0.05 || Math.abs(Math.log(v.zoom / cam.zoom)) > 0.15;
      if (far) { v.flyTo(cam, 1300); delay = 700; }
    }
    this.stepAt = performance.now() + delay;
    // The address names the war and the step, so the page can be shared or reloaded there.
    history.replaceState(null, '', `#war=${c.id}&step=${i + 1}&p=${this.app.projection}&lang=${lang()}`);
    void this.ensureBorders(c.steps[i]);
    if (this.shell.sheet.isOpen('war-step')) this.openDetails(true);
    this.shell.card.hide();
    this.renderBar();
    this.kick();
  }

  private stepMs() {
    const st = this.c!.steps[this.step];
    const len = tx(st.text).length + tx(st.title).length;
    const battles = (st.battles?.length ?? 0) * BATTLE_GAP;
    return Math.max(5200, Math.min(12000, 3200 + len * 32 + battles)) / this.speed;
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
    const animating = el < MOVE_FROM + MOVE_MS + Math.max(FADE, BATTLE_FROM + (this.c.steps[this.step].battles?.length ?? 0) * BATTLE_GAP + PULSE);
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
      if (!p) continue;
      rc.labels.add({
        text: tx(side.name), x: p[0], y: p[1], priority: 950 + Math.min(300, px), size: Math.max(10.5, Math.min(16, 8 + px / 45)),
        weight: 800, caps: px > 140, color: '#ffffff', halo: darker(side.color, 0.55),
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
  }

  // ---- taps

  tap(lon: number, lat: number): boolean {
    const c = this.c;
    if (!c) return true;
    const v = this.app.renderer.view;
    const here = v.project(lon, lat);
    const st = c.steps[this.step];
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
    const list = h('button', { type: 'button', class: 'icon-btn', title: t('warsAll'), 'aria-label': t('warsAll') }, icon(ListOrdered, 18));
    list.addEventListener('click', () => void this.pick());
    const exit = h('button', { type: 'button', class: 'icon-btn', title: t('close'), 'aria-label': t('close') }, icon(X, 18));
    exit.addEventListener('click', () => void this.exit());
    const date = h('div', { class: 'wb-date' });
    const count = h('span', { class: 'wb-count' });
    const title = h('div', { class: 'wb-title' });
    const text = h('p', { class: 'wb-text' });
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
        h('div', { class: 'wb-tools' }, list, exit)),
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
    ui.text.textContent = tx(st.text);
    clear(ui.play);
    ui.play.append(icon(this.playing ? Pause : Play, 22));
    ui.play.setAttribute('aria-label', this.playing ? 'Pause' : 'Play');
    ui.track.querySelectorAll('.wb-tick').forEach((el, i) => { el.classList.toggle('done', i < this.step); el.classList.toggle('on', i === this.step); });
    clear(ui.meta);
    const shown = c.sides.filter((s) => st.control[s.id] != null || (st.moves ?? []).some((m) => m.side === s.id));
    for (const s of shown) ui.meta.append(h('span', { class: 'wb-side' }, h('i', { style: { background: s.color } }), tx(s.name)));
    if (st.deaths != null) {
      const el = h('span', { class: 'wb-deaths', title: t('warDeathsSoFar') });
      ui.meta.append(el);
      this.countUp(el, this.prev >= 0 ? this.c!.steps[this.prev].deaths : undefined, st.deaths);
    }
    const more = h('button', { type: 'button', class: 'pill sm wb-more' }, icon(BookOpen, 15), t('warDetails'));
    more.addEventListener('click', () => this.openDetails());
    ui.meta.append(more);
    requestAnimationFrame(() => {
      if (!this.bar) return;
      const r = this.bar.getBoundingClientRect();
      const covered = Math.max(0, window.innerHeight - r.top + 6);
      this.app.renderer.view.insetBottom = covered;
      document.documentElement.style.setProperty('--wb-h', `${Math.round(r.height)}px`);
      this.app.renderer.requestRender();
    });
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
    if (st.events?.length) {
      body.append(h('h3', { class: 'sec-title' }, `📜 ${t('warEvents')}`));
      body.append(h('ul', { class: 'war-events' }, st.events.map((e) => h('li', null, `${e.icon} ${e.date ? `${fmtWhen(e.date, c.t0)}: ` : ''}${tx(e.text)}`))));
    }
    const lastFight = c.steps.reduce((k, s, i) => (s.aftermath ? k : i), 0);
    if (this.step >= lastFight) {
      body.append(h('h3', { class: 'sec-title' }, `🏁 ${t('warOutcome')}`), h('p', null, tx(c.outcome)));
      const total = c.casualties ? Object.entries(c.casualties).filter(([k, v]) => k !== 'note' && v != null) : [];
      if (total.length || c.casualtiesNote) {
        body.append(h('h3', { class: 'sec-title' }, `☠️ ${t('warHumanCost')}`));
        for (const [k, v] of total) body.append(h('div', { class: 'row' }, h('span', { class: 'row-icon' }, '☠️'), h('span', { class: 'row-label' }, k === 'total' ? t('warTotal') : tx(c.sides.find((s) => s.id === k)?.name)), h('span', { class: 'row-value' }, fmtRange(v as Range))));
        if (c.casualtiesNote) body.append(h('p', { class: 'muted' }, tx(c.casualtiesNote)));
      }
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
