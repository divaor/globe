// Stories played step by step on the map: Wars and conquests, Eras and ideas, Food through time,
// Great structures, Peoples and civilizations, and Life through time. Each step shows the territory
// of its sides (crossfading from the step before), routes (drawn as they go), battles (wars: tap one
// for its casualties), items (people, works, sites, dishes, structures, fossils: markers that pop up,
// then stay as dots; tap one for its card with a picture from Wikipedia) and dated events. A bar
// under the map tells the story; "Details" opens the longer notes, the step's items, the outcome and
// the sources; "Browse" lists everything. In Life through time, a step older than 5 million years is
// drawn on the continents of its age (the plate model of Pangea to today), its markers moving with
// their plates. In Games of the world, a step that is a Games or a World Cup colours every country by
// how it took part (host, medals, took part, boycotted, banned; champions in a World Cup), draws an arc
// from each team to the host city, and a tap on a country gives its result there.
// Data: public/data/<collection>/, built by scripts/data/build-conflicts.mjs.
import { geoArea, geoCentroid, geoContains, geoDistance, geoInterpolate } from 'd3-geo';
import { mesh } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Geometry, MultiLineString, Polygon } from 'geojson';
import { Play, Pause, X, ChevronLeft, ChevronRight, ListOrdered, BookOpen, Search } from 'lucide';
import { loadJSON, shapesFrom, chunkLines, dataUrl, type Shape, type Line } from '../data/store';
import { t, tx, lang, fmtNumber, fmtCompact, flagEmoji } from '../app/i18n';
import { h, icon, clear } from '../ui/dom';
import { continentSwatch, mix } from '../engine/colors';
import { loadPaleo, fmtLat, unitName, type PaleoWorld, type Unit } from './paleo';
import { SCRIPT_FONT, loadGlyphs, registerScriptFonts, isVertical } from '../app/scriptFonts';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { LayerDef, RenderCtx } from '../layers/types';

type Text = { en: string; es: string };
type Range = number | [number, number];
type Pt = [number, number];
/** A camera; `pl`, the plate under the point it looks at, moves it with its continent on an old map. */
interface Cam { lon: number; lat: number; zoom: number; pl?: string }
interface Side { id: string; name: Text; color: string; members?: Text }
type Losses = { [side: string]: Range | Text | undefined; note?: Text };
interface Battle { name: Text; at: Pt; date?: string; winner?: string; casualties?: Losses; result?: Text; details?: Text }
/**
 * A route; on an old map each point moves with its plate (`pls`). Journeys: `by` how it went (a sea
 * route is dashed) and `icon`, the traveller, a ship or a caravan, drawn at its head as it goes.
 */
interface Move { side: string; path: Pt[]; label?: Text; pls?: (string | null)[]; by?: 'sea' | 'land' | 'river' | 'ice' | 'air'; icon?: string }
interface WarEvent { icon: string; text: Text; at?: Pt; date?: string; pl?: string }
/** A marker of the stories other than wars: a person, work, site, dish, structure... */
export interface Item {
  id?: string; name: Text; at: Pt; cat: string; icon: string; date: string; t: number; end?: string; life?: [string, string | null];
  /** When it stopped existing (a civilization's end); `tu` is that time. Off the map after it. */
  until?: string; tu?: number;
  type?: string; country?: string; place?: Text; text: Text; details?: Text; why?: Text; how?: Text; by?: Text; size?: Text; status?: Text;
  facts?: { label: Text; value: Text }[]; wiki?: Text;
  /** Text in the item's own script, shown large on its card: a script's first letters, a word, an inscription. */
  sample?: Sample;
  /** A Wikimedia Commons file for the card, when the article has no picture of its own. */
  img?: string;
  /** Games of the world, a Games' host marker: the top four of its medal table or final ranking. */
  podium?: { c: string; n: Text; a2?: string }[];
  /** Life through time: the plate that carries it, so it moves with its continent on an old map. */
  pl?: string;
  /** The first step that shows it (-1: a time tour's catalogue item, shown from its date). */
  first: number;
}
export interface Cat { id: string; name: Text; icon: string; color: string }
/** An item's sample: the text, how it reads in Latin letters, and what it means. */
export interface Sample { text: string; latin?: string; means?: Text }

/** A sample as the card shows it: large, in the script fonts, with its reading and meaning. */
export function sampleEl(sm: Sample): HTMLElement {
  void registerScriptFonts();
  // The meaning is shown as written (a translation in quotes, or a note such as "the first four letters"), and
  // left out when it only repeats the sample, like "Hello" for an English reader.
  const bare = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const means = sm.means ? tx(sm.means) : '';
  return h('div', { class: 'item-sample' },
    h('div', { class: `sample-text${isVertical(sm.text) ? ' vertical' : ''}`, dir: 'auto' }, sm.text),
    sm.latin ? h('div', { class: 'sample-latin' }, sm.latin) : null,
    means && bare(means) !== bare(sm.text) ? h('div', { class: 'sample-means' }, means) : null);
}
/** Games of the world: a team at a Games (a country, or a team such as the Soviet Union or England). */
export interface Team {
  /** Its code (IOC or FIFA). */
  c: string;
  /** Where it is on the map: today's countries (ISO A3) and drawn areas ("#3": England, East Germany...). */
  u: string[];
  /** How it took part: one of the story's sides (g_host, g_medals, g_took, g_boycott, g_banned, g_champion, g_runnerup). */
  s: string;
  /** Gold, silver and bronze. */
  m?: [number, number, number];
  /** Its place in the medal table, or in the tournament (1–4). */
  r?: number;
  /** How many athletes it sent. */
  a?: number;
  /** Where its arc to the host starts. */
  o?: Pt;
  /** Its name when it is not one of today's countries (the Soviet Union, the Unified Team, England...). */
  n?: Text;
  /** Why it stayed away or was kept out. */
  why?: Text;
}
/** A Games or a World Cup: its name ("Berlin 1936"), the main stadium (or the final's), its teams. */
export interface Games { id: string; kind: 'summer' | 'winter' | 'wc' | 'wwc'; name: Text; host: Pt; teams: Team[]; nations?: number }
interface Step {
  date: string; t: number; title: Text; text: Text; details?: Text; control: Record<string, number | null>;
  moves?: Move[]; battles?: Battle[]; events?: WarEvent[]; deaths?: Range; camera?: Cam; aftermath?: boolean; show?: number[];
  /** Life through time: drawn on the continents of `ma` million years ago, or (`deep`, older than the plate model) on today's land greyed. */
  ma?: number; deep?: boolean;
  /** Games of the world: the Games or World Cup this step is. */
  games?: Games;
}
interface Conflict {
  id: string; name: Text; icon: string; era: string; region: Text; summary: Text; start: string; end: string; t0: number; t1: number;
  camera: Cam; sides: Side[]; casualties?: Losses; casualtiesNote?: Text; outcome: Text; sources: { title: string; url: string }[]; steps: Step[];
  kind?: string; items?: Item[]; cats?: Cat[]; catalog?: 'all' | 'shown';
  /** The routes of earlier steps stay on the map, faded: the journey so far (Journeys: on unless false). */
  trail?: boolean;
}
interface Entry {
  id: string; name: Text; icon: string; era: string; region: Text; summary: Text; start: string; end: string; t0: number; t1: number; steps: number;
  sides: { name: Text; color: string }[]; items?: number; cats?: string[];
}
/** Where an item's marker is drawn this frame: (x, y), moved apart from crowded neighbours, and (ax, ay), its true place. */
interface Spot { k: number; x: number; y: number; ax: number; ay: number; r: number; wt: number }
/** A collection's items.json row: an item and where it first appears. */
export interface CollectionItem extends Omit<Item, 'first'> {
  story: string; step: number;
  /** The other stories that tell it too. */
  also?: string[];
}

/** The collections of stories. */
export type StoryKind = 'wars' | 'eras' | 'food' | 'structures' | 'people' | 'life' | 'games' | 'journeys' | 'beliefs' | 'writing' | 'plagues' | 'disasters';
export const STORY_KINDS: StoryKind[] = ['wars', 'eras', 'food', 'structures', 'people', 'life', 'games', 'journeys', 'beliefs', 'writing', 'plagues', 'disasters'];
/** `paleo`: its old steps are drawn on the continents of their age. */
const KINDS: Record<StoryKind, { dir: string; hash: string; icon: string; name: Text; paleo?: boolean }> = {
  wars: { dir: 'conflicts', hash: 'war', icon: '⚔️', name: { en: 'Wars and conquests', es: 'Guerras y conquistas' } },
  eras: { dir: 'eras', hash: 'eras', icon: '🎨', name: { en: 'Eras and ideas', es: 'Épocas e ideas' } },
  food: { dir: 'food', hash: 'food', icon: '🌾', name: { en: 'Food through time', es: 'La comida en el tiempo' } },
  structures: { dir: 'structures', hash: 'structures', icon: '🏛️', name: { en: 'Great structures', es: 'Grandes construcciones' } },
  people: { dir: 'people', hash: 'people', icon: '🏺', name: { en: 'Peoples and civilizations', es: 'Pueblos y civilizaciones' } },
  life: { dir: 'life', hash: 'life', icon: '🦕', name: { en: 'Life through time', es: 'La vida en el tiempo' }, paleo: true },
  games: { dir: 'games', hash: 'games', icon: '🏅', name: { en: 'Games of the world', es: 'Juegos del mundo' } },
  journeys: { dir: 'journeys', hash: 'journeys', icon: '🧭', name: { en: 'Journeys and trade routes', es: 'Viajes y rutas comerciales' } },
  beliefs: { dir: 'beliefs', hash: 'beliefs', icon: '🛐', name: { en: 'Religions and philosophies', es: 'Religiones y filosofías' } },
  writing: { dir: 'writing', hash: 'writing', icon: '✍️', name: { en: 'Writing and languages', es: 'Escritura y lenguas' } },
  plagues: { dir: 'plagues', hash: 'plagues', icon: '🦠', name: { en: 'Plagues and cures', es: 'Epidemias y curas' } },
  disasters: { dir: 'disasters', hash: 'disasters', icon: '🌋', name: { en: 'Natural disasters', es: 'Desastres naturales' } },
};
export const storyHashKey = (k: StoryKind) => KINDS[k].hash;
interface Area extends Shape { lp: Pt; area: number; outline?: MultiLineString | null }

/** An area's outline without its edges along the ±180° meridian, where an area that crosses it is cut
 * in two, so the cut does not show as a line across the ocean; null when the area has no such edge. */
function outlineOf(g: Geometry): MultiLineString | null {
  if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') return null;
  const onCut = (p: number[]) => Math.abs(Math.abs(p[0]) - 180) < 1e-6;
  const lines: number[][][] = [];
  let cut = false;
  for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
    for (const ring of poly) {
      let cur: number[][] = [];
      ring.forEach((p, i) => {
        if (i > 0 && onCut(p) && onCut(ring[i - 1])) { cut = true; if (cur.length > 1) lines.push(cur); cur = []; }
        cur.push(p);
      });
      if (cur.length > 1) lines.push(cur);
    }
  }
  return cut ? { type: 'MultiLineString', coordinates: lines } : null;
}

/** The groups of the story lists: the geologic eras (Life through time), then the ages of history. */
export const ERAS = ['precambrian', 'paleozoic', 'mesozoic', 'cenozoic', 'prehistory', 'ancient', 'medieval', 'early-modern', 'modern', 'contemporary'];
const MONTHS: Record<'en' | 'es', string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
};

// Timing of a step, in ms at 1×: the territory fades in, arrows draw, battles and items pop up one
// by one.
const FADE = 900, MOVE_FROM = 250, MOVE_MS = 2300, BATTLE_FROM = 700, BATTLE_GAP = 420, POP = 380, PULSE = 1500, ITEM_GAP = 300;
/** Life through time: the continents drift from one step's age to the next. */
const DRIFT = 1700;
/** Games of the world: the arcs from every team to the host city grow for this long. */
const ARC_MS = 1700;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const pop = (x: number) => { const t = clamp01(x); return t < 1 ? 1 - Math.pow(1 - t, 3) * (1 - 2.2 * t) : 1; };

/** Dates older than 10,000 BC are written as years ago: -3200000 is 3.2 million years ago. */
const AGO = -10000;
function group(n: number, sep: string): string { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep); }
/**
 * How long ago, and in what: ["3.7", billions], ["3.2", millions] or ["300,000", years]. Spanish
 * counts thousands of millions in millions, with no separator ("3700 millones").
 */
function agoNum(n: number, es: boolean): [string, 'bn' | 'mn' | ''] {
  if (n >= 1e9 && !es) return [String(Math.round(n / 1e7) / 100), 'bn'];
  // Millions to two decimals at most, as the stories give them: 7, 3.2, 3.66.
  if (n >= 1e6) { const m = Math.round(n / 1e4) / 100; return [es ? String(m).replace('.', ',') : String(m), 'mn']; }
  const r = n >= 1e5 ? Math.round(n / 1e3) * 1e3 : Math.round(n / 100) * 100;
  return [group(r, es ? '\u00a0' : ','), ''];
}
const UNIT_EN = { bn: 'billion', mn: 'million', '': '' };
/** "3.7 billion years ago", "3.2 million years ago", "300,000 years ago", "hace 14\u00a0400 años". */
function fmtAgo(y: number): string {
  const es = lang() === 'es', [v, u] = agoNum(-y, es);
  if (es) return u ? `hace ${v}\u00a0${v === '1' ? 'millón' : 'millones'} de años` : `hace ${v}\u00a0años`;
  return `${v}\u00a0${u ? `${UNIT_EN[u]} ` : ''}years ago`;
}
/** "7–2 million years ago", "300,000–40,000 years ago", "3.7 billion – 541 million years ago". */
function fmtAgoRange(y0: number, y1: number): string {
  const es = lang() === 'es', [a, ua] = agoNum(-y0, es), [b, ub] = agoNum(-y1, es);
  if (ua === ub) return es ? `hace ${a}–${b}\u00a0${ua ? 'millones de ' : ''}años` : `${a}–${b}\u00a0${ua ? `${UNIT_EN[ua]} ` : ''}years ago`;
  if (es) return `hace ${a}\u00a0millones – ${b}\u00a0años`;
  return `${a}\u00a0${UNIT_EN[ua]} – ${b}\u00a0${ub ? `${UNIT_EN[ub]} ` : ''}years ago`;
}

/** "1 September 1939", "May 334 BC", "336 a. C.", "3.2 million years ago", "1 November 1755, 09:40"... A time
 *  of day is the local time at the place, as the story gives it. */
export function fmtWhen(d: string, eraHint = 1): string {
  const tm = /^(.*)T(\d{2}:\d{2})$/.exec(d);
  if (tm) return `${fmtWhen(tm[1], eraHint)}, ${tm[2]}`;
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
  // From deep time to our days: "245 million years ago – today".
  if (y0 < AGO) return y1 < AGO ? fmtAgoRange(y0, y1) : `${fmtAgo(y0)} – ${y1 >= 2000 ? t('storyToday') : fmtWhen(end, y0)}`;
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
  /** Life through time: the plate model (loaded with the first story that has an old step) and the time scale. */
  private paleo: PaleoWorld | null = null;
  private units: Unit[] = [];
  readonly layer: LayerDef;

  constructor(private app: App, private shell: Shell, readonly kind: StoryKind = 'wars') {
    const self = this;
    const k = KINDS[kind];
    this.layer = {
      id: kind === 'wars' ? 'wars' : `story-${kind}`, category: 'political', icon: k.icon, kind: 'fill', hidden: true, animated: true,
      name: k.name,
      desc: { en: 'Stories step by step.', es: 'Historias paso a paso.' },
      credit: `${k.name.en}: Atlas Globe (sources listed with each story); pictures: Wikipedia; historical borders: aourednik/historical-basemaps (GPL-3.0)${k.paleo ? '; continents of the past: Merdith et al. (2021) plate model (CC BY 4.0)' : ''}`,
      drawFill(rc) { self.drawFill(rc); },
      drawOverlay(rc) { self.drawOverlay(rc); },
      labels(rc) { self.labels(rc); },
    };
    app.register([this.layer]);
    app.on('lang', () => { if (this.active && this.c) { this.buildBar(); this.renderBar(); } });
  }

  get active() { return this.app.mode === this.kind; }
  get wars() { return this.kind === 'wars'; }
  /** Life through time: old steps are drawn on the continents of their age. */
  private get paleoKind() { return !!KINDS[this.kind].paleo; }
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
    if (this.paleoKind && !this.units.length) {
      try { this.units = (await loadJSON<{ units: Unit[] }>('paleo/timescale.json')).units; } catch { /* the age chips are left out */ }
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
    if (this.paleoKind && !this.paleo && c.steps.some((st) => st.ma != null)) {
      // The continents of the old steps (about 2 MB, once).
      this.shell.toast(t('dataLoading'), 1500);
      try { this.paleo = await loadPaleo(this.app); } catch { /* offline: old steps fall back to today's map */ }
    }
    if (!this.active) await this.enterMode();
    this.stop();
    this.c = c;
    // Markers may show a script's letter (𐤀, Ꭰ...): fetch its font, then draw again.
    const letters = (c.items ?? []).map((it) => it.icon).join('');
    if (/[^\u0000-\u052f\u2000-\u2bff\ufe0f\u{1f000}-\u{1faff}]/u.test(letters)) void loadGlyphs(letters).then((ok) => { if (ok && this.c === c) this.app.renderer.requestRender(); });
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
      const g = k >= 0 ? this.itemAt(c.items![k], this.stepAge(this.step)) : focus.at;
      v.flyTo({ lon: g[0], lat: g[1], zoom: Math.max(v.zoom, 4.5) }, 1300);
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

  // ---- Life through time: the continents of each step's age

  /** What a step is drawn on: the continents of its age (in Ma), today's map, or today's land greyed (older than the plate model). */
  private mapOf(i: number): number | 'today' | 'deep' {
    const st = this.c!.steps[i];
    if (st.ma != null && this.paleo) return st.ma;
    return st.deep ? 'deep' : 'today';
  }

  /** The age of a step's continents, or null for today's map. */
  private stepAge(i: number): number | null { const m = this.mapOf(i); return typeof m === 'number' ? m : null; }

  /** The age of the continents on screen now: they drift from one step's age to the next. Null: today's map. */
  private ageNow(): number | null {
    if (!this.c || !this.paleo) return null;
    const to = this.mapOf(this.step), from = this.prev >= 0 ? this.mapOf(this.prev) : to;
    const p = ease(this.elapsed() / DRIFT);
    if (typeof to === 'number') {
      if (typeof from === 'number') return from + (to - from) * p;
      return from === 'today' ? to * p : to;
    }
    // Back to today's map: the continents drift to their places first.
    if (to === 'today' && typeof from === 'number' && p < 1) return from * (1 - p);
    return null;
  }

  /** Where a present-day place is drawn: on an old map, moved with the plate that carries it. */
  private at(pt: Pt, pl: string | null | undefined, ma: number | null): Pt {
    return ma != null && pl && this.paleo ? this.paleo.rotate(pt[0], pt[1], pl, ma) : pt;
  }
  private itemAt(it: { at: Pt; pl?: string }, ma: number | null): Pt { return this.at(it.at, it.pl, ma); }
  private routeOf(mv: Move, ma: number | null): Pt[] { return ma == null ? mv.path : mv.path.map((pt, k) => this.at(pt, mv.pls?.[k], ma)); }

  /** A camera looks at a place on land today; on an old map it follows that place to where it was. */
  private placeCam(cam: Cam, ma: number | null): Cam {
    const [lon, lat] = this.at([cam.lon, cam.lat], cam.pl, ma);
    return { lon, lat, zoom: cam.zoom };
  }

  /**
   * The step's camera, zoomed out (at most 4 times) when the step's own markers would not all be in
   * view on this screen: a phone's map between the panels is much smaller than the one it was set for.
   */
  private fitCam(cam: Cam, st: Step, ma: number | null): Cam {
    const c = this.c!;
    // A journey's leg should be in view too, from where it starts to where it ends.
    const pts: Pt[] = [...(c.items ? (st.show ?? []).map((i) => this.itemAt(c.items![i], ma)) : []), ...(this.trail ? (st.moves ?? []).flatMap((mv) => this.routeOf(mv, ma)) : [])];
    if (!pts.length) return cam;
    const v = this.app.renderer.view;
    const perZoom = v.pxPerRadian / v.zoom;
    const halfW = v.w / 2 - 30, halfH = v.mapH / 2 - 30;
    const R = Math.PI / 180;
    let k = Infinity;
    for (const [lon, lat] of pts) {
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
    if (!this.noBorders(c.steps[i])) void this.ensureBorders(c.steps[i]);
    if (this.shell.sheet.isOpen('war-step')) this.openDetails(true);
    this.shell.card.hide();
    this.renderBar();
    // The bar is up with this step's text, so the camera knows how much map is left above it.
    this.measureBar();
    const ma = this.stepAge(i);
    const cam = this.fitCam(this.placeCam(this.cameraAt(i), ma), c.steps[i], ma);
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

  /**
   * No borders of the step's time: in Life through time before 10,000 years ago (the oldest maps are of
   * hominins), and on a Games step, which draws today's (its countries are coloured by today's shapes).
   */
  /** Does this story keep the routes of earlier steps on the map (a journey's trail)? */
  private get trail(): boolean { return this.c?.trail ?? this.c?.kind === 'journeys'; }

  private noBorders(st: Step) { return (this.paleoKind && st.t < -10000) || !!st.games; }

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
    if (a.outline === undefined) a.outline = outlineOf(a.feature.geometry as Geometry);
    if (a.outline) { ctx.beginPath(); path(a.outline as never); }
    ctx.strokeStyle = darker(color); ctx.lineWidth = 1.1; ctx.stroke();
    ctx.restore();
  }

  private drawFill(rc: RenderCtx) {
    const c = this.c;
    const { ctx, path, theme } = rc;
    // Plain land and coasts (the base map is off in this mode). In the dark theme the land is a
    // neutral grey, so the sides' colours (blues especially) stand out against it.
    const land = theme.dark ? '#4f545c' : theme.land;
    const ma = this.ageNow();
    if (ma != null && this.paleo) {
      // Life through time: the continents of the age, each tinted a little by the continent it is today.
      this.paleo.draw(rc, ma, {
        shelf: theme.dark ? '#2d4d66' : '#bcd7ea',
        land: (cont) => (cont === 'SS' ? land : mix(land, continentSwatch(cont), theme.dark ? 0.2 : 0.26)),
        coast: theme.coast, coastWidth: 0.6,
      });
      return;
    }
    // Older than the plate model: today's land, greyed. (Drawn from the frame's cached outlines, which the
    // Games' country colours then reuse.)
    const deep = !!c && this.mapOf(this.step) === 'deep';
    rc.fillCountries(rc.visibleShapes(rc.level.countries).map((s) => s.id), deep ? (theme.dark ? '#3d4148' : '#e2e2de') : land);
    if (!c) return;
    const st = c.steps[this.step];
    const p = ease(this.elapsed() / FADE);
    const old = this.prev >= 0 ? c.steps[this.prev] : null;
    // Games of the world: every country in the colour of how it took part, under today's borders.
    if (st.games || old?.games) this.fillTeams(rc, st, old, p);
    const snap = this.noBorders(st) ? null : this.snapFor(st);
    const b = st.games ? rc.level.borders : snap && this.borders.get(snap.file);
    if (Array.isArray(b)) {
      ctx.save(); ctx.globalAlpha *= st.games ? 0.8 : 0.55;
      ctx.beginPath(); for (const l of rc.visibleLines(b)) path(l.geometry);
      ctx.strokeStyle = theme.border; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.restore();
    }
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

  // ---- Games of the world: the countries' colours, the arcs to the host, the teams

  /**
   * Each team's countries in the colour of how it took part, fading from the step before. Countries of
   * one colour and strength are filled together, in one go.
   */
  private fillTeams(rc: RenderCtx, st: Step, old: Step | null, p: number) {
    const cur = this.tints(st), was = old ? this.tints(old) : null;
    const groups = new Map<string, { color: string; alpha: number; units: string[] }>();
    const add = (u: string, color: string, alpha: number) => {
      if (alpha <= 0.01) return;
      const key = `${color}|${alpha.toFixed(3)}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { color, alpha, units: [] }));
      g.units.push(u);
    };
    for (const [u, col] of cur) {
      const w = was?.get(u);
      if (!was || p >= 1 || w === col) add(u, col, 1);
      else { if (w) add(u, w, 1 - p); add(u, col, p); }
    }
    if (was && p < 1) for (const [u, w] of was) if (!cur.has(u)) add(u, w, 1 - p);
    const { ctx } = rc;
    for (const g of groups.values()) {
      ctx.save(); ctx.globalAlpha *= g.alpha * 0.82;
      rc.fillCountries(g.units.filter((u) => !u.startsWith('#')), g.color);
      ctx.restore();
      for (const u of g.units) if (u.startsWith('#')) this.fillArea(rc, Number(u.slice(1)), g.color, g.alpha);
    }
  }

  private tintCache = new WeakMap<Step, Map<string, string>>();
  /** A step's colours: country (or drawn area) → colour of its team's side. */
  private tints(st: Step): Map<string, string> {
    let m = this.tintCache.get(st);
    if (!m) {
      m = new Map();
      for (const tm of st.games?.teams ?? []) for (const u of tm.u) m.set(u, this.sideColor(tm.s));
      this.tintCache.set(st, m);
    }
    return m;
  }

  private arcCache = new Map<string, Pt[]>();
  /** Points along the great circle from a team's country to the host city. */
  private arcPts(o: Pt, to: Pt): Pt[] {
    const key = `${o[0]},${o[1]}>${to[0]},${to[1]}`;
    let pts = this.arcCache.get(key);
    if (!pts) {
      const n = Math.max(6, Math.ceil(geoDistance(o, to) / 0.025));
      const f = geoInterpolate(o, to);
      pts = Array.from({ length: n + 1 }, (_, k) => f(k / n) as Pt);
      this.arcCache.set(key, pts);
    }
    return pts;
  }

  /** A thin arc from every team that took part to the host city, growing as the step starts. */
  private drawArcs(rc: RenderCtx, g: Games, q: number) {
    if (q <= 0) return;
    const { ctx } = rc;
    const bySide = new Map<string, Pt[][]>();
    const starts: [Pt, string][] = [];
    for (const tm of g.teams) {
      if (!tm.o) continue;
      const pts = this.arcPts(tm.o, g.host);
      const last = q * (pts.length - 1), n = Math.floor(last);
      const runs = bySide.get(tm.s) ?? [];
      let run: Pt[] = [];
      const put = (pt: Pt) => { const p = rc.project(pt[0], pt[1]); if (p) run.push(p as Pt); else if (run.length) { if (run.length > 1) runs.push(run); run = []; } };
      for (let k = 0; k <= n; k++) put(pts[k]);
      // The growing tip, between two points.
      if (n < pts.length - 1 && last > n) { const f = last - n, a = pts[n], b = pts[n + 1]; put([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); }
      if (run.length > 1) runs.push(run);
      bySide.set(tm.s, runs);
      const s = rc.project(tm.o[0], tm.o[1]);
      if (s) starts.push([s as Pt, tm.s]);
    }
    const halo = rc.theme.dark ? 'rgba(10,16,28,0.55)' : 'rgba(255,255,255,0.75)';
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [side, runs] of bySide) {
      const col = this.sideColor(side);
      for (const [w, style] of [[2.8, halo], [1.25, darker(col, 0.8)]] as const) {
        ctx.beginPath();
        for (const r of runs) { ctx.moveTo(r[0][0], r[0][1]); for (const p of r.slice(1)) ctx.lineTo(p[0], p[1]); }
        ctx.strokeStyle = style; ctx.lineWidth = w; ctx.stroke();
      }
    }
    // Where each arc starts: a small dot in the team's colour.
    ctx.globalAlpha *= Math.min(1, q * 3);
    for (const [p, side] of starts) {
      ctx.beginPath(); ctx.arc(p[0], p[1], 2.4, 0, Math.PI * 2);
      ctx.fillStyle = darker(this.sideColor(side), 0.8); ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = halo; ctx.stroke();
    }
    ctx.restore();
  }

  /** A country of today by its code: its name in the reader's language and its flag (an emoji). */
  private country(iso: string): { name: string; flag: string; a2?: string } {
    const m = this.app.data.meta[iso] as { a2?: string } | undefined;
    return { name: this.app.data.name(iso, lang()) || iso, flag: flagEmoji(m?.a2) || '🏳️', a2: m?.a2 };
  }

  /** A team's name: its own (the Soviet Union, England...) or its country's. */
  private teamName(tm: Team): string {
    if (tm.n) return tx(tm.n);
    const iso = tm.u.find((u) => !u.startsWith('#'));
    return iso ? this.country(iso).name : tm.c;
  }

  /** A team's flag as a small picture (its country's), or a neutral one for teams of the past. */
  private teamFlag(tm: Team, g: Games): HTMLElement {
    const iso = !tm.n && tm.u.length === 1 && !tm.u[0].startsWith('#') ? tm.u[0] : null;
    const a2 = iso ? this.country(iso).a2 : undefined;
    if (!a2) return h('span', { class: 'mt-flag mt-flag-none' }, g.kind === 'wc' || g.kind === 'wwc' ? '⚽' : '🏳️');
    return h('img', { class: 'mt-flag', src: dataUrl(`../flags/${a2.toLowerCase()}.svg`), alt: '', width: 21, height: 15, loading: 'lazy',
      onerror: (e: Event) => { (e.target as HTMLElement).replaceWith(h('span', { class: 'mt-flag mt-flag-none' }, flagEmoji(a2))); } });
  }

  /** "Champions", "Runners-up", "Third place", "Fourth place", then "5th place" ("5.º lugar")... */
  private placeName(r: number) { return r >= 1 && r <= 4 ? t(`gamesPlace${r}`) : t('gamesRankOf', { r: ordinal(r) }); }

  /** A medal table (its first `max` rows), or a World Cup's last four. */
  private standings(g: Games, max = 10): HTMLElement | null {
    const wc = g.kind === 'wc' || g.kind === 'wwc';
    const ranked = g.teams.filter((tm) => tm.r != null && (wc || tm.m)).sort((a, b) => a.r! - b.r!);
    if (!ranked.length) return null;
    const head = wc ? [h('th', null, '#'), h('th', null, t('gamesTeam')), h('th', null, '')]
      : [h('th', null, '#'), h('th', null, t('gamesNation')), h('th', null, '🥇'), h('th', null, '🥈'), h('th', null, '🥉'), h('th', null, t('gamesTotal'))];
    const rows = ranked.slice(0, max).map((tm) => h('tr', { class: tm.s === 'g_host' ? 'mt-host' : '' },
      h('td', { class: 'mt-rank' }, String(tm.r)),
      h('td', { class: 'mt-name' }, this.teamFlag(tm, g), this.teamName(tm)),
      ...(wc ? [h('td', { class: 'mt-place' }, this.placeName(tm.r!))]
        : [...tm.m!.map((v) => h('td', { class: 'mt-n' }, String(v))), h('td', { class: 'mt-n mt-total' }, String(tm.m![0] + tm.m![1] + tm.m![2]))])));
    const table = h('table', { class: 'medal-table' }, h('thead', null, h('tr', null, ...head)), h('tbody', null, ...rows));
    const more = ranked.length - max;
    return h('div', { class: 'mt-wrap' }, table, more > 0 ? h('p', { class: 'muted small mt-more' }, t('gamesMoreRows', { n: more })) : null);
  }

  /** The team on the map under a tap, and the country of today tapped (null on a drawn area). */
  private teamAt(g: Games, lon: number, lat: number): { team: Team | null; iso: string | null } | null {
    for (const tm of g.teams) for (const u of tm.u) {
      if (!u.startsWith('#')) continue;
      const a = this.areas.get(Number(u.slice(1)));
      if (a && geoContains(a.feature as never, [lon, lat])) return { team: tm, iso: null };
    }
    const iso = this.app.renderer.countryAt(lon, lat);
    if (!iso) return null;
    return { team: g.teams.find((tm) => tm.u.includes(iso)) ?? null, iso };
  }

  /** A country's card at a Games: how its team took part, its medals or place, and why it stayed away. */
  private teamCard(g: Games, tm: Team | null, iso: string | null) {
    const here = iso ? this.country(iso) : null;
    const name = tm ? this.teamName(tm) : here!.name;
    const rows: { label: string; value: string; icon: string }[] = [];
    const notes: string[] = [];
    const wc = g.kind === 'wc' || g.kind === 'wwc';
    if (!tm) rows.push({ label: tx(g.name), value: t('gamesNoPart'), icon: '—' });
    else {
      const side = this.c?.sides.find((s) => s.id === tm.s);
      if (side) rows.push({ label: tx(g.name), value: tx(side.name), icon: tm.s === 'g_host' ? '🏟️' : tm.s === 'g_boycott' ? '✊' : tm.s === 'g_banned' ? '⛔' : '🏁' });
      if (tm.m) rows.push({ label: t('gamesMedals'), value: `🥇 ${tm.m[0]} · 🥈 ${tm.m[1]} · 🥉 ${tm.m[2]}`, icon: '🏅' });
      if (tm.r != null && tm.m) rows.push({ label: t('gamesRank'), value: ordinal(tm.r), icon: '📊' });
      if (tm.r != null && wc) rows.push({ label: t('gamesFinish'), value: this.placeName(tm.r), icon: '🏆' });
      if (tm.a) rows.push({ label: t('gamesAthletes'), value: fmtNumber(tm.a), icon: '👟' });
      // Kazakhstan in 1980: part of the Soviet Union's team.
      if (here && (tm.n || tm.u.length > 1) && here.name !== name) rows.push({ label: t('gamesPartOf', { country: here.name }), value: name, icon: '🧩' });
      if (tm.why) notes.push(tx(tm.why));
    }
    const icon = tm && !tm.n && tm.u.length === 1 && iso ? here!.flag : wc ? '⚽' : '🏅';
    this.shell.card.showCustom(icon, name, tx(g.name), rows, [], notes);
  }

  /** Details of a Games step: the medal table (or the last four), who took part and who stayed away. */
  private gamesDetails(g: Games): HTMLElement[] {
    const out: HTMLElement[] = [];
    const wc = g.kind === 'wc' || g.kind === 'wwc';
    const table = this.standings(g, 1000);
    if (table) out.push(h('h3', { class: 'sec-title' }, wc ? `🏆 ${t('gamesStandings')}` : `🏅 ${t('gamesMedalTable')}`), table);
    const took = g.teams.filter((tm) => !['g_boycott', 'g_banned'].includes(tm.s));
    // Every team that took part (a World Cup's ranking, when it has every team, already lists them).
    if (!wc || took.some((tm) => tm.r == null)) {
      const names = took.map((tm) => this.teamName(tm)).sort((a, b) => a.localeCompare(b, lang()));
      out.push(h('h3', { class: 'sec-title' }, `🌍 ${t(wc ? 'gamesTeamsN' : 'gamesNationsN', { n: g.nations ?? took.length })}`), h('p', { class: 'games-names' }, names.join(' · ')));
    } else out.push(h('p', { class: 'muted small' }, t('gamesTeamsN', { n: g.nations ?? took.length })));
    const away = g.teams.filter((tm) => tm.s === 'g_boycott' || tm.s === 'g_banned');
    if (away.length) {
      out.push(h('h3', { class: 'sec-title' }, `✊ ${t('gamesAway')}`));
      out.push(h('ul', { class: 'war-events' }, away.map((tm) => h('li', null, h('b', null, this.teamName(tm)), tm.why ? ` — ${tx(tm.why)}` : ''))));
    }
    out.push(h('p', { class: 'muted small story-map-note' }, t('gamesMapNote')));
    return out;
  }

  private drawRoute(rc: RenderCtx, mv: Move, q: number, alpha: number, ma: number | null) {
    if (q <= 0 || alpha <= 0.01) return;
    const pts = routeTo(this.routeOf(mv, ma), q);
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
      // By sea, the coloured line is dashed (the white edge stays whole).
      ctx.setLineDash(mv.by === 'sea' && w === 3 ? [9, 6] : []);
      ctx.strokeStyle = s; ctx.lineWidth = w; ctx.stroke();
    }
    ctx.setLineDash([]);
    const last = runs[runs.length - 1];
    if (mv.icon && last?.length) {
      // The traveller (a ship, a caravan...) at the head of the route, moving as it is drawn.
      const [x1, y1] = last[last.length - 1];
      ctx.beginPath(); ctx.arc(x1, y1, 12, 0, Math.PI * 2);
      ctx.fillStyle = rc.theme.dark ? 'rgba(20,28,44,0.92)' : 'rgba(255,255,255,0.95)'; ctx.fill();
      ctx.lineWidth = 2.4; ctx.strokeStyle = col; ctx.stroke();
      ctx.font = '14px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000';
      ctx.fillText(mv.icon, x1, y1 + 0.5);
    } else if (last && last.length >= 2) {
      // Arrowhead at the tip.
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

  /** A route of an earlier step of a journey: thin, faded, dashed by sea, with no arrowhead. */
  private drawTrail(rc: RenderCtx, mv: Move, ma: number | null) {
    const runs: Pt[][] = [];
    let run: Pt[] = [];
    for (const g of routeTo(this.routeOf(mv, ma), 1)) { const p = rc.project(g[0], g[1]); if (p) run.push(p); else if (run.length) { runs.push(run); run = []; } }
    if (run.length) runs.push(run);
    if (!runs.length) return;
    const { ctx } = rc;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [w, s, a] of [[4, rc.theme.dark ? 'rgba(10,16,28,0.55)' : 'rgba(255,255,255,0.7)', 1], [2, this.sideColor(mv.side), 0.75]] as const) {
      ctx.beginPath();
      for (const r of runs) { ctx.moveTo(r[0][0], r[0][1]); for (const p of r.slice(1)) ctx.lineTo(p[0], p[1]); }
      ctx.setLineDash(mv.by === 'sea' && w === 2 ? [6, 5] : []);
      ctx.globalAlpha = a; ctx.strokeStyle = s; ctx.lineWidth = w; ctx.stroke();
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
    const ma = this.ageNow();
    // Battles of earlier steps stay as small dots: the war's history.
    for (let k = 0; k < this.step; k++) for (const b of c.steps[k].battles ?? []) this.drawBattle(rc, b, 1, 0, true);
    if (this.trail) {
      // The journey so far: every earlier step's routes stay, thin and faded, under this step's.
      for (let k = 0; k < this.step; k++) for (const mv of c.steps[k].moves ?? []) this.drawTrail(rc, mv, ma);
      // Going back, the later step's routes fade away.
      if (old && this.prev > this.step && fadeOut > 0) for (const mv of old.moves ?? []) this.drawRoute(rc, mv, 1, fadeOut * 0.7, ma);
    } else if (old && fadeOut > 0) for (const mv of old.moves ?? []) this.drawRoute(rc, mv, 1, fadeOut * 0.7, ma);
    if (st.games) this.drawArcs(rc, st.games, ease((el - MOVE_FROM) / ARC_MS));
    (st.moves ?? []).forEach((mv, k) => this.drawRoute(rc, mv, ease((el - MOVE_FROM - k * 300) / MOVE_MS), 1, ma));
    (st.events ?? []).forEach((ev, k) => {
      if (!ev.at) return;
      const g = this.at(ev.at, ev.pl, ma);
      const p = rc.project(g[0], g[1]);
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
      const spots = this.layout(rc, st, zoomed, ma);
      this.spots = { key: `${c.id}:${this.step}`, at: spots };
      const popAt = new Map((st.show ?? []).map((k, n) => [k, pop((el - BATTLE_FROM - n * ITEM_GAP) / POP)]));
      this.drawLeaders(rc, spots, (k) => popAt.get(k) ?? 1);
      c.items.forEach((it, k) => { if (!now.has(k) && this.onMap(it, st)) this.drawItem(rc, it, 1, 0, true, zoomed, spots.get(k), ma); });
      (st.show ?? []).forEach((k, n) => {
        const at = BATTLE_FROM + n * ITEM_GAP;
        this.drawItem(rc, c.items![k], pop((el - at) / POP), (el - at) / PULSE, false, zoomed, spots.get(k), ma);
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
  private layout(rc: RenderCtx, st: Step, zoomed: boolean, ma: number | null): Map<number, Spot> {
    const c = this.c!, out = new Map<number, Spot>();
    const { w, h } = rc.view, M = 90;
    const pts: Spot[] = [];
    const add = (k: number, r: number, wt: number) => {
      const g = this.itemAt(c.items![k], ma);
      const p = rc.project(g[0], g[1]);
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

  private drawItem(rc: RenderCtx, it: Item, s: number, pulse: number, small: boolean, zoomed: boolean, spot: Spot | undefined, ma: number | null) {
    const g = spot ? null : this.itemAt(it, ma);
    const p = spot ? [spot.x, spot.y] : rc.project(g![0], g![1]);
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
    ctx.font = `${Math.round((small ? 9.5 : 13.5) * s)}px ${SCRIPT_FONT}, system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
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
    const ma = this.ageNow();
    // Pangea, Gondwana... and today's continents, under the story's own labels.
    if (ma != null && this.paleo) this.paleo.labels(rc, ma, { big: 900, small: 480 });
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
      const mid = routeTo(this.routeOf(mv, ma), 0.5);
      const g = mid[mid.length - 1];
      const p = rc.project(g[0], g[1]);
      if (!p) return;
      rc.labels.add({ text: tx(mv.label), x: p[0], y: p[1] - 12, priority: 700 - k, size: 11.5, weight: 700, italic: true, color: darker(this.sideColor(mv.side), 0.75), halo: rc.theme.labelHalo });
    });
    if (c.items) {
      const now = st.show ?? [];
      const spot = (k: number): [number, number] | null => {
        const sp = this.spots.key === `${c.id}:${this.step}` ? this.spots.at.get(k) : undefined;
        if (sp) return [sp.x, sp.y];
        const g = this.itemAt(c.items![k], ma);
        return rc.project(g[0], g[1]);
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
    const ma = this.ageNow();
    if (c.items && here) {
      // An item near the tap (where its marker is drawn): this step's first, then the others on the map.
      const now = st.show ?? [];
      const rest = c.items.map((_, k) => k).filter((k) => !now.includes(k) && this.onMap(c.items![k], st));
      const drawn = this.spots.key === `${c.id}:${this.step}` ? this.spots.at : null;
      for (const [n, pool] of [now, rest].entries()) {
        let best = -1, bestD = n === 0 ? 26 : 16;
        for (const k of pool) {
          const sp = drawn?.get(k);
          const g = sp ? null : this.itemAt(c.items[k], ma);
          const p = sp ? [sp.x, sp.y] : v.project(g![0], g![1]);
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
    // A Games step: the country tapped, and how its team took part.
    if (st.games) {
      const hit = this.teamAt(st.games, lon, lat);
      if (hit) { this.teamCard(st.games, hit.team, hit.iso); return true; }
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
    // On an old map, the land under the tap: what it is today and where it was then.
    if (ma != null && this.paleo) {
      const rows = this.paleo.tapRows(lon, lat, ma, this.app);
      if (rows) { this.shell.card.showCustom('🌋', fmtWhen(st.date, c.t0), this.paleo.caption(ma) || tx(c.name), rows); return true; }
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
    const then = this.latThen(it);
    if (then) rows.push({ label: t('lifeLatThen'), value: then, icon: '🧭' });
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
    // A Games' host city: its medal table (or a World Cup's last four) under the facts.
    const g = it.type === 'games' ? c?.steps.find((st) => st.games && `games-${st.games.id}` === it.id)?.games : undefined;
    const table = g ? this.standings(g, g.kind === 'wc' || g.kind === 'wwc' ? 4 : 10) : it.sample ? sampleEl(it.sample) : null;
    this.shell.card.showCustom(it.icon, tx(it.name), sub, rows, links, notes, this.wikiThumb(it), table);
  }

  private wikiThumb(it: Omit<Item, 'first'>) { return itemThumb(it); }

  /** Life through time: the latitude a fossil lay at when it lived, "12°S (today 47°N)". */
  private latThen(it: Omit<Item, 'first'>): string | null {
    const ma = -it.t / 1e6;
    if (!this.paleo || !it.pl || !(ma >= 5 && ma <= 1000)) return null;
    const lat = this.paleo.rotate(it.at[0], it.at[1], it.pl, ma)[1];
    return `${fmtLat(lat)} (${t('storyToday')}: ${fmtLat(it.at[1])})`;
  }

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
    const g = this.itemAt(it, this.c ? this.stepAge(this.step) : null);
    v.flyTo({ lon: g[0], lat: g[1], zoom: Math.max(v.zoom, 4.5) }, 1200);
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
    const age = this.ageChip(st);
    if (age) ui.meta.append(age);
    const teams = new Set(st.games?.teams.map((tm) => tm.s));
    const shown = c.sides.filter((s) => st.control[s.id] != null || teams.has(s.id) || (st.moves ?? []).some((m) => m.side === s.id));
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

  /**
   * Life through time: the step's geologic period (its epoch in the last 2.6 million years, its era
   * before 1000 million years ago) with the time scale's colour, and what the map shows.
   */
  private ageChip(st: Step): HTMLElement | null {
    if (!this.paleoKind || !this.units.length) return null;
    const ma = -st.t / 1e6;
    if (!(ma > 0.0117)) return null;
    const rank = ma < 2.58 ? 'epoch' : ma <= 1000 ? 'period' : 'era';
    const u = this.units.find((x) => x.rank === rank && ma <= x.start + 1e-9 && ma >= x.end - 1e-9);
    if (!u) return null;
    const map = this.mapOf(this.step);
    const tip = typeof map === 'number' ? t('lifeOldMap', { when: fmtWhen(st.date) }) : map === 'deep' ? t('lifeDeepMap') : '';
    return h('span', { class: 'wb-side wb-age', title: tip || unitName(u) }, h('i', { style: { background: u.color } }), `${typeof map === 'number' ? '🌋 ' : ''}${unitName(u)}`);
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
    if (st.games) body.append(...this.gamesDetails(st.games));
    if (c.items && st.show?.length) {
      body.append(h('h3', { class: 'sec-title' }, `📍 ${t('storyOnMap')}`));
      for (const k of st.show) {
        const it = c.items[k];
        body.append(this.itemRow(it, () => { this.shell.sheet.close(); this.focusItem(it); }));
      }
    }
    if (this.paleoKind) {
      // What the map shows, and the plate model on its own slider.
      const map = this.mapOf(this.step);
      if (typeof map === 'number') {
        const drift = h('button', { type: 'button', class: 'pill story-drift' }, '🌋 ', t('lifeSeeDrift'));
        drift.addEventListener('click', () => { this.shell.sheet.close(); this.app.emit('pangea-at', map); });
        body.append(h('p', { class: 'muted small story-map-note' }, t('lifeOldMapNote', { when: fmtWhen(st.date, c.t0) })), drift);
      } else if (map === 'deep') body.append(h('p', { class: 'muted small story-map-note' }, t('lifeDeepNote')));
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

/** "1st", "2nd", "23rd" ("1.º" in Spanish). */
function ordinal(n: number): string {
  if (lang() === 'es') return `${n}.º`;
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
}

/** An item's picture: its own Commons file if it has one, else its article's. */
export function itemThumb(it: { wiki?: Text; img?: string }): Promise<string | null> {
  if (it.img) return Promise.resolve(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(it.img.replace(/ /g, '_'))}?width=330`);
  return wikiThumb(it.wiki);
}

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
