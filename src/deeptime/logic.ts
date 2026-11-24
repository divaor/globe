// Deep time (v0.45.0): the parts that need no page (scripts/test/deeptime.mjs runs them in Node). The Earth's vital
// signs at any moment, how bright the Sun was, a plain verdict on whether a person could survive there, what was
// alive, the time bar's two scales (true and story), the cosmic calendar, and how the planet looked.

export interface Tx { en: string; es: string }
/** A vital sign through time: [ma, value] or [ma, value, low, high], from today (0) back. */
export interface Series { id: string; unit: string; name: Tx; points: number[][]; note?: Tx }
export type IceKind = 'snowball' | 'south' | 'north' | 'glacial' | 'caps';
export interface Ice { from: number; to: number; kind: IceKind }
export interface Group { id: string; icon: string; color: string; name: Tx }
export interface DEvent {
  id: string; kind: string; ma: number; to?: number; err?: number; name: Tx; at?: [number, number]; pl?: string; r?: number;
  /** Years after the Big Bang, for the first million years (their `ma` all round to 13,787). */
  t?: number;
  text: Tx; first?: true; sure?: string; wiki?: Tx; species?: string[]; item?: string; img?: string;
  /** Its Life through time story and step (from `item`). */
  story?: [string, number];
}
export interface Site { at: [number, number]; place: Tx; pl?: string }
export interface Species {
  id: string; name: Tx; common?: Tx; group: string; icon: string; life: string; from: number; to: number; alive?: true;
  sites: Site[]; len?: number; mass?: number; diet: string; text: Tx; kin?: Tx; wiki: Tx; pbdb?: string; item?: string;
  story?: [string, number];
}
export interface Beat { id: string; ma: number; t?: number; focus?: string; cam?: [number, number, number]; text: Tx }
export interface DeepData {
  groups: Group[]; kinds: Group[]; series: Series[]; ice: Ice[]; sources: { id: string; title: string; url: string }[];
  events: DEvent[]; beats: Beat[];
  /** The cosmos chapter's narration, from the Big Bang to the Earth (v0.46.0). */
  beatsCosmos?: Beat[];
}

/** The Big Bang and the Earth's first days (Ma). */
export const BIG_BANG_MA = 13787;
export const EARTH_MA = 4540;
/** The magma ocean left by the Moon-forming impact (about 4510 Ma) had a solid crust by about this age (Ma). */
export const MOLTEN_UNTIL = 4480;

// ---- Vital signs ---------------------------------------------------------------------------------------------------

export interface Reading { v: number; lo?: number; hi?: number }
/** A series' value at `ma` (a straight line between its points), or null before its oldest point. */
export function valueAt(s: Series | undefined, ma: number): Reading | null {
  const p = s?.points;
  if (!p?.length || ma < 0) return null;
  if (ma <= p[0][0]) return toReading(p[0]);
  for (let i = 1; i < p.length; i++) {
    if (ma === p[i][0]) return toReading(p[i]);
    if (ma < p[i][0]) {
      const a = p[i - 1], b = p[i], f = (ma - a[0]) / (b[0] - a[0]);
      const mix = (x?: number, y?: number) => (x == null || y == null ? undefined : x + (y - x) * f);
      return { v: a[1] + (b[1] - a[1]) * f, lo: mix(a[2], b[2]), hi: mix(a[3], b[3]) };
    }
  }
  return null;
}
const toReading = (p: number[]): Reading => ({ v: p[1], lo: p[2], hi: p[3] });

/** How bright the Sun was, as a share of today's (Gough 1981: the young Sun was about 70% as bright). */
export const sunBrightness = (ma: number) => 1 / (1 + 0.4 * (Math.min(ma, 4570) / 4570));

/** Days in a year when a day lasted `hours` (the year's length in seconds has hardly changed). */
export const yearDays = (hours: number) => (365.2422 * 24) / hours;

const ICE_RANK: Record<IceKind, number> = { snowball: 5, glacial: 4, north: 3, south: 2, caps: 1 };
/** The most icy state at `ma`: Snowball Earth, a glacial maximum, ice in the north too, ice in the south, small caps. */
export function iceAt(ice: Ice[], ma: number): IceKind | null {
  let best: IceKind | null = null;
  for (const x of ice) if (ma <= x.from && ma >= x.to && (!best || ICE_RANK[x.kind] > ICE_RANK[best])) best = x.kind;
  return best;
}

/**
 * Whether there was an ozone layer: none while the air had almost no oxygen (under 0.02%), a thin one that let through
 * much of the burning light (the mid-Proterozoic's 0.1–1% gave a partial shield), a full one from about 2%.
 */
export const ozone = (o2: number | null): 'none' | 'thin' | 'full' => (o2 == null || o2 < 0.02 ? 'none' : o2 < 2 ? 'thin' : 'full');

export interface Vitals {
  ma: number; o2: Reading | null; co2: Reading | null; ch4: Reading | null; temp: Reading | null; sea: Reading | null;
  day: Reading | null; moon: Reading | null; genera: Reading | null; ph: Reading | null; sun: number; year: number | null;
  ice: IceKind | null; ozone: 'none' | 'thin' | 'full';
}
export function vitalsAt(d: Pick<DeepData, 'series' | 'ice'>, ma: number): Vitals {
  const s = (id: string) => valueAt(d.series.find((x) => x.id === id), ma);
  const o2 = s('o2'), day = s('day');
  return {
    ma, o2, co2: s('co2'), ch4: s('ch4'), temp: s('temp'), sea: s('sea'), day, moon: s('moon'), genera: s('genera'), ph: s('ocean_ph'),
    sun: sunBrightness(ma), year: day ? yearDays(day.v) : null, ice: iceAt(d.ice, ma), ozone: ozone(o2?.v ?? null),
  };
}

/**
 * Could a person survive here? Each reason has a level: 'no' (you would die), 'hard' (you could, barely, or not for
 * long) or 'ok'; the verdict is the worst. Reasons are keys the page turns into words.
 */
export type Level = 'ok' | 'hard' | 'no';
export interface Verdict { level: Level; reasons: { key: string; level: Level }[] }
export function survival(v: Vitals): Verdict {
  const r: { key: string; level: Level }[] = [];
  if (v.ma >= MOLTEN_UNTIL) r.push({ key: 'molten', level: 'no' });
  const o2 = v.o2?.v;
  if (o2 != null) {
    // Under 8% you pass out; 8–14% is like the top of a high mountain (14% is about 3,300 m today).
    if (o2 < 8) r.push({ key: 'no-oxygen', level: 'no' });
    else if (o2 < 14) r.push({ key: 'thin-oxygen', level: 'hard' });
    else if (o2 > 26) r.push({ key: 'rich-oxygen', level: 'ok' });
  }
  const co2 = v.co2?.v;
  if (co2 != null) {
    if (co2 >= 40000) r.push({ key: 'co2-deadly', level: 'no' });
    else if (co2 >= 10000) r.push({ key: 'co2-high', level: 'hard' });
    else if (co2 >= 3000) r.push({ key: 'co2-stuffy', level: 'ok' });
  }
  const t = v.temp?.v;
  if (v.ice === 'snowball') r.push({ key: 'snowball', level: 'hard' });
  else if (t != null) {
    if (t >= 40) r.push({ key: 'too-hot', level: 'no' });
    else if (t >= 28) r.push({ key: 'hot', level: 'hard' });
    else if (t >= 20) r.push({ key: 'warm', level: 'ok' });
    else if (t <= 8) r.push({ key: 'cold', level: 'ok' });
  }
  if (v.ma < MOLTEN_UNTIL && v.ozone === 'none') r.push({ key: 'no-ozone', level: 'no' });
  else if (v.ozone === 'thin') r.push({ key: 'thin-ozone', level: 'hard' });
  const rank: Record<Level, number> = { ok: 0, hard: 1, no: 2 };
  const level = r.reduce<Level>((w, x) => (rank[x.level] > rank[w] ? x.level : w), 'ok');
  return { level, reasons: r.sort((a, b) => rank[b.level] - rank[a.level]) };
}

// ---- Life and events -----------------------------------------------------------------------------------------------

/** Species alive at `ma` (first appearance at or before it, last at or after). */
export const aliveAt = (list: Species[], ma: number) => list.filter((s) => ma <= s.from + 1e-9 && ma >= s.to - 1e-9);

/** Events happening at `ma`: the ones that last and are under way, and the moments within `window` Ma. */
export function eventsAt(list: DEvent[], ma: number, window: number): DEvent[] {
  return list.filter((e) => (e.to != null ? ma <= e.ma + window && ma >= e.to - window : Math.abs(e.ma - ma) <= window));
}

/** The event or species with this id. */
export function byId(d: DeepData, species: Species[], id: string): { e?: DEvent; s?: Species } {
  const e = d.events.find((x) => x.id === id);
  return e ? { e } : { s: species.find((x) => x.id === id) };
}

// ---- Time scales ---------------------------------------------------------------------------------------------------

/**
 * The story scale: the busy recent past gets more of the bar than the long, quiet early times. Knots of [position,
 * Ma]; straight lines between them.
 */
export const STORY_KNOTS: [number, number][] = [
  [0, EARTH_MA], [0.1, 3500], [0.17, 2500], [0.26, 1000], [0.34, 541], [0.47, 252], [0.6, 145], [0.7, 66], [0.8, 23], [0.89, 2.58], [0.95, 0.3], [1, 0],
];
function along(knots: [number, number][], x: number, from: 0 | 1): number {
  const to = from ? 0 : 1;
  const k = from ? knots.slice().sort((a, b) => a[1] - b[1]) : knots;
  if (from === 0) {
    if (x <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) if (x <= k[i][0]) { const f = (x - k[i - 1][0]) / (k[i][0] - k[i - 1][0]); return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * f; }
    return k[k.length - 1][1];
  }
  if (x <= k[0][1]) return k[0][to];
  for (let i = 1; i < k.length; i++) if (x <= k[i][1]) { const f = (x - k[i - 1][1]) / (k[i][1] - k[i - 1][1]); return k[i - 1][0] + (k[i][0] - k[i - 1][0]) * f; }
  return k[k.length - 1][0];
}
export type Scale = 'story' | 'true';
/** The age (Ma) at a position of the bar (0 = the Earth's first days, 1 = today). */
export const maAt = (pos: number, scale: Scale, oldest = EARTH_MA) => (scale === 'true' ? oldest * (1 - pos) : along(STORY_KNOTS, pos, 0));
/** The bar's position of an age. */
export const posOf = (ma: number, scale: Scale, oldest = EARTH_MA) => (scale === 'true' ? 1 - ma / oldest : along(STORY_KNOTS, ma, 1));

/** How long ago, in a unit people read: billions, millions, thousands of years, years, or today. */
export function ago(ma: number): { n: number; unit: 'billion' | 'million' | 'thousand' | 'years' | 'today' } {
  const y = ma * 1e6;
  if (y < 1) return { n: 0, unit: 'today' };
  if (ma >= 1000) return { n: Math.round(ma / 10) / 100, unit: 'billion' };
  if (ma >= 1) return { n: ma >= 100 ? Math.round(ma) : Math.round(ma * 10) / 10, unit: 'million' };
  if (y >= 10000) return { n: Math.round(y / 1000), unit: 'thousand' };
  return { n: Math.round(y), unit: 'years' };
}

/**
 * The cosmic calendar (Carl Sagan's): all the time since the Big Bang squeezed into one year, the Big Bang at
 * midnight on 1 January and today at midnight at the end of 31 December. Month 0–11, day 1–31, and the time of day.
 */
export function cosmicDate(ma: number): { month: number; day: number; h: number; m: number; s: number } {
  const secs = Math.max(0, Math.min(1, 1 - ma / BIG_BANG_MA)) * 365 * 86400;
  const days = Math.min(364, Math.floor(secs / 86400));
  const lens = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let month = 0, d = days;
  while (d >= lens[month]) { d -= lens[month]; month++; }
  const rest = secs - days * 86400;
  return { month, day: d + 1, h: Math.floor(rest / 3600), m: Math.floor((rest % 3600) / 60), s: Math.floor(rest % 60) };
}
/** The share of all the time since the Big Bang that came after `ma` (humans: about 0.002%). */
export const shareSince = (ma: number) => ma / BIG_BANG_MA;

// ---- The planet's look ---------------------------------------------------------------------------------------------

/** How much of today's continental crust existed (a growth curve; an impression before the plate model). */
export function crust(ma: number): number {
  const k: [number, number][] = [[0, 1], [1000, 0.95], [1800, 0.85], [2500, 0.7], [3000, 0.4], [3500, 0.2], [4000, 0.06], [4400, 0.02], [EARTH_MA, 0]];
  for (let i = 1; i < k.length; i++) if (ma <= k[i][0]) { const f = (ma - k[i - 1][0]) / (k[i][0] - k[i - 1][0]); return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * f; }
  return 0;
}

export interface Look {
  /** 0–1: the magma ocean's glow (after the Moon-forming impact, until about 4480 million years ago, then fading). */
  magma: number;
  /** The sea's colour, the bare land's colour and the plants' share of land (0–1). */
  sea: string; land: string; green: number;
  /** An orange haze (the Archean's methane), 0–1. */
  haze: number;
  /** Snowball: the whole globe white. */
  snowball: boolean;
  /** Ice caps' reach from each pole, in degrees of latitude (0 = none). */
  capN: number; capS: number;
}
const lerp = (a: number, b: number, f: number) => a + (b - a) * Math.max(0, Math.min(1, f));
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const mixHex = (a: string, b: string, f: number) => {
  const p = (s: string, i: number) => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16);
  return hex(lerp(p(a, 0), p(b, 0), f), lerp(p(a, 1), p(b, 1), f), lerp(p(a, 2), p(b, 2), f));
};
/**
 * How the planet looked at `ma`: molten at first, a green-tinged iron-rich sea and an orange haze before the air had
 * oxygen, rusty bare land after, white in a Snowball Earth, green land once plants spread (about 470 million years
 * ago, forests from about 385), ice caps by the ice ages.
 */
export function look(ma: number, v: Pick<Vitals, 'o2' | 'ice' | 'temp'>): Look {
  const magma = ma >= MOLTEN_UNTIL ? 1 : ma >= 4400 ? (ma - 4400) / (MOLTEN_UNTIL - 4400) : 0;
  const o2 = v.o2?.v ?? 0;
  const oxic = Math.min(1, o2 / 2);
  const sea = mixHex('#2f6b5e', '#1f5f9e', oxic);
  const land = mixHex('#6b6460', '#9a6a4a', oxic);
  const green = ma > 470 ? 0 : ma > 385 ? lerp(0.15, 0.5, (470 - ma) / 85) : ma > 300 ? lerp(0.5, 0.85, (385 - ma) / 85) : 0.85;
  const haze = ma >= 2400 && ma <= 3800 ? Math.min(1, (ma > 2700 ? 0.5 : 0.9) * (o2 < 0.5 ? 1 : 0.3)) : 0;
  const ice = v.ice;
  const snowball = ice === 'snowball';
  // Degrees from the pole: a glacial maximum reaches far (to about 55° N on average), ice in both hemispheres less,
  // ice only in the south leaves the north open, small caps stay near the poles.
  const cap = (k: IceKind | null, south: boolean) => (k === 'glacial' ? (south ? 30 : 35) : k === 'north' ? (south ? 25 : 18) : k === 'south' ? (south ? 25 : 0) : k === 'caps' ? 8 : 0);
  return { magma, sea, land, green, haze, snowball, capN: snowball ? 90 : cap(ice, false), capS: snowball ? 90 : cap(ice, true) };
}

/** How long a narrated beat waits when nothing reads it aloud: time to read it, at least 5 seconds. */
export const readingTime = (text: string) => Math.max(5, Math.min(20, text.split(/\s+/).length * 0.32 + 1.5));


// ---- The cosmos (v0.46.0) ------------------------------------------------------------------------------------------

/**
 * The chapters: the cosmos (the Big Bang to the Earth and the Moon, drawn as a scene), the Earth (its first days to
 * today, on the globe) and the two joined ("Big Bang to today").
 */
export type Chapter = 'cosmos' | 'earth' | 'all';
/** The cosmos chapter ends once the Moon has formed; in "Big Bang to today" the globe takes over then (Ma). */
export const COSMOS_END = 4500;
/** Years after the Big Bang of an age in Ma, and back. */
export const sinceBang = (ma: number) => Math.max(0, (BIG_BANG_MA - ma) * 1e6);
export const maOfT = (t: number) => BIG_BANG_MA - t / 1e6;
/** When something happened, in years after the Big Bang (`t` when it has one: the first million years). */
export const tOf = (x: { t?: number; ma: number }) => (x.t != null ? x.t : sinceBang(x.ma));

/** The first 380,000 years on the story scale: a log scale from 10⁻³² seconds (log₁₀ of years). */
const LOG_T0 = -39.5;
const LOG_T1 = Math.log10(380000);
/** The share of the cosmos chapter's story bar the first 380,000 years get. */
const COSMOS_LOG = 0.16;
/** The rest of the cosmos chapter's story scale: [position, Ma]. */
const COSMOS_KNOTS: [number, number][] = [
  [COSMOS_LOG, BIG_BANG_MA - 0.38], [0.28, 13600], [0.4, 13300], [0.5, 12800], [0.6, 11000], [0.68, 10000], [0.76, 8800],
  [0.84, 6500], [0.9, 4600], [0.94, 4568], [0.97, EARTH_MA], [1, COSMOS_END],
];
/** In "Big Bang to today", the cosmos chapter's share of the story bar; the Earth's starts from the Moon's birth. */
const ALL_SPLIT = 0.3;
const ALL_EARTH_KNOTS: [number, number][] = [[0, COSMOS_END], ...STORY_KNOTS.slice(1)];

function cosmosT(pos: number, scale: Scale): number {
  if (scale === 'true') return Math.max(0, Math.min(1, pos)) * sinceBang(COSMOS_END);
  if (pos <= 0) return 0;
  if (pos < COSMOS_LOG) return 10 ** (LOG_T0 + (LOG_T1 - LOG_T0) * (pos / COSMOS_LOG));
  return sinceBang(along(COSMOS_KNOTS, pos, 0));
}
function cosmosPos(t: number, scale: Scale): number {
  if (scale === 'true') return Math.max(0, Math.min(1, t / sinceBang(COSMOS_END)));
  if (t <= 0) return 0;
  if (t < 380000) return Math.max(0, Math.min(1, (Math.log10(t) - LOG_T0) / (LOG_T1 - LOG_T0))) * COSMOS_LOG;
  return along(COSMOS_KNOTS, maOfT(t), 1);
}

/** The moment (years after the Big Bang) at a position of a chapter's bar. */
export function tAt(pos: number, scale: Scale, ch: Chapter): number {
  if (ch === 'earth') return sinceBang(maAt(pos, scale));
  if (ch === 'cosmos') return cosmosT(pos, scale);
  if (scale === 'true') return Math.max(0, Math.min(1, pos)) * sinceBang(0);
  if (pos < ALL_SPLIT) return cosmosT(pos / ALL_SPLIT, 'story');
  return sinceBang(along(ALL_EARTH_KNOTS, (pos - ALL_SPLIT) / (1 - ALL_SPLIT), 0));
}
/** A moment's position on a chapter's bar (clamped to the chapter). */
export function posOfT(t: number, scale: Scale, ch: Chapter): number {
  if (ch === 'earth') return posOf(Math.max(0, Math.min(EARTH_MA, maOfT(t))), scale);
  if (ch === 'cosmos') return cosmosPos(Math.min(t, sinceBang(COSMOS_END)), scale);
  if (scale === 'true') return Math.max(0, Math.min(1, t / sinceBang(0)));
  if (t <= sinceBang(COSMOS_END)) return cosmosPos(t, 'story') * ALL_SPLIT;
  return ALL_SPLIT + along(ALL_EARTH_KNOTS, maOfT(t), 1) * (1 - ALL_SPLIT);
}
/** The chapter a moment belongs to when nothing else says (before the Earth: the cosmos). */
export const chapterFor = (ma: number): Chapter => (ma > EARTH_MA ? 'cosmos' : 'earth');

/** How long after the Big Bang, in a unit people read. */
export function afterBang(t: number): { n: number; unit: 'bang' | 'tiny' | 'seconds' | 'minutes' | 'years' | 'thousand' | 'million' | 'billion'; exp?: number } {
  const secs = t * 365.25 * 86400;
  if (t <= 0) return { n: 0, unit: 'bang' };
  if (secs < 0.01) return { n: 10, unit: 'tiny', exp: Math.round(Math.log10(secs)) };
  if (secs < 120) return { n: Math.round(secs * 100) / 100, unit: 'seconds' };
  if (t < 1 / 365.25 / 24) return { n: Math.round(secs / 60), unit: 'minutes' };
  if (t < 10000) return { n: Math.round(t * 10) / 10, unit: 'years' };
  if (t < 1e6) return { n: Math.round(t / 1000), unit: 'thousand' };
  if (t < 1e9) return { n: Math.round(t / 1e6), unit: 'million' };
  return { n: Math.round(t / 1e7) / 100, unit: 'billion' };
}

// The universe's expansion: flat ΛCDM with Planck 2018's values, a table of the scale factor (its size compared with
// today) against time, by integrating the Friedmann equation in ln a.
const H0 = 67.66, OM = 0.3111, OL = 0.6889, OR = 9.0e-5;
const HUBBLE_YEARS = (977.79 / H0) * 1e9;
let TABLE: { la: Float64Array; t: Float64Array } | null = null;
function table() {
  if (TABLE) return TABLE;
  const n = 4000, la0 = Math.log(1e-14);
  const la = new Float64Array(n), t = new Float64Array(n);
  const invE = (l: number) => { const a = Math.exp(l); return 1 / Math.sqrt(OR / a ** 4 + OM / a ** 3 + OL); };
  la[0] = la0;
  t[0] = (Math.exp(2 * la0) / (2 * Math.sqrt(OR))) * HUBBLE_YEARS;
  for (let i = 1; i < n; i++) {
    la[i] = la0 * (1 - i / (n - 1));
    t[i] = t[i - 1] + ((invE(la[i - 1]) + invE(la[i])) / 2) * (la[i] - la[i - 1]) * HUBBLE_YEARS;
  }
  // The age comes out at 13.79 billion years; scale it to exactly the app's.
  const k = (BIG_BANG_MA * 1e6) / t[n - 1];
  for (let i = 0; i < n; i++) t[i] *= k;
  return (TABLE = { la, t });
}
/** The universe's size compared with today (the scale factor, 1 today) at `t` years after the Big Bang. */
export function scaleFactor(t: number): number {
  const { la, t: tt } = table();
  if (t <= 0) return 0;
  if (t <= tt[0]) return Math.sqrt((2 * Math.sqrt(OR) * t) / HUBBLE_YEARS);
  if (t >= tt[tt.length - 1]) return 1;
  let lo = 0, hi = tt.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tt[m] <= t) lo = m; else hi = m; }
  const f = (t - tt[lo]) / (tt[hi] - tt[lo]);
  return Math.exp(la[lo] + (la[hi] - la[lo]) * f);
}
/** The temperature of the light filling space (the cosmic background), in kelvin: 2.7255 K today. */
export const spaceTemp = (t: number) => (t <= 0 ? Infinity : 2.7255 / scaleFactor(t));

/** The universe's eras, for the bar's bands and the scene. */
export type CosmicEra = 'bang' | 'plasma' | 'dark' | 'stars' | 'galaxies' | 'milkyway' | 'nebula' | 'disc' | 'earth';
export const COSMIC_ERAS: { id: CosmicEra; from: number; color: string }[] = [
  { id: 'bang', from: 0, color: '#fff1c1' },
  { id: 'plasma', from: 3.17e-8, color: '#ff9a3c' },
  { id: 'dark', from: 380000, color: '#3b2f5c' },
  { id: 'stars', from: sinceBang(13600), color: '#4f6dd6' },
  { id: 'galaxies', from: sinceBang(13300), color: '#7b5ea7' },
  { id: 'milkyway', from: sinceBang(8800), color: '#a29bfe' },
  { id: 'nebula', from: sinceBang(4600), color: '#b5651d' },
  { id: 'disc', from: sinceBang(4568), color: '#f9ca24' },
  { id: 'earth', from: sinceBang(EARTH_MA), color: '#e17055' },
];
export function cosmicEra(t: number): CosmicEra {
  let e: CosmicEra = 'bang';
  for (const x of COSMIC_ERAS) if (t >= x.from) e = x.id;
  return e;
}

/** Could you survive in the universe before the Earth? Never; these say why. */
export function cosmicSurvival(t: number): Verdict {
  const r: { key: string; level: Level }[] = [{ key: 'no-earth', level: 'no' }];
  const temp = spaceTemp(t);
  if (t < 380000) r.push({ key: 'opaque', level: 'no' });
  if (temp > 400) r.push({ key: 'scorching-space', level: 'no' });
  else if (temp >= 273 && temp <= 373) r.push({ key: 'warm-space', level: 'ok' });
  if (t >= 380000 && t < sinceBang(13600)) r.push({ key: 'dark', level: 'ok' });
  return { level: 'no', reasons: r };
}
