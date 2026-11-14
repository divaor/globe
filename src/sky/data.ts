// The sky's data (public/data/sky/, built by scripts/data/sky/build-sky.mjs): stars, constellations and deep-sky
// objects, loaded once and shared by the sky view, the backdrop, search, quizzes and tours.
import { loadJSON } from '../data/store';
import { lang } from '../app/i18n';
import { vec, type V3, RAD } from './astro';

export type Text = { en: string; es: string };
export const tr = (t: Text | undefined) => (t ? (lang() === 'es' ? t.es : t.en) : '');
export const L = (en: string, es: string) => (lang() === 'es' ? es : en);

export interface Star { hip: number; ra: number; dec: number; mag: number; bv: number; v: V3; name?: string; es?: string; desig?: string; con?: string }
export interface Constellation {
  id: string; name: Text; la: string; gen: string; rank: number; at: [number, number][];
  lines: number[][]; bounds: number[][]; area: number; dec: [number, number]; best: number; brightest: number | null; objects: string[];
  meaning?: Text; origin?: Text; originType?: string; text?: Text; other?: Text; wiki?: Text;
  /** Unit vectors of the lines' points (J2000), built on load. */
  lv?: V3[][]; bv?: V3[][];
}
export interface SkyObject {
  id: string; name: Text; type: string; con?: string; ra: number; dec: number; ly?: number; size?: Text; text?: Text; famous?: boolean; wiki?: Text; mag?: number;
  v?: V3;
}
export interface StarInfo { hip: number; name: Text; kind?: Text; ly?: number; text?: Text; names?: Text; wiki?: Text }
export interface SkyData { stars: Star[]; byHip: Map<number, Star>; cons: Constellation[]; borders: V3[][]; objects: SkyObject[]; info: Map<number, StarInfo> }

let starsLoading: Promise<Star[]> | null = null;
/** Just the stars (the globe's backdrop needs no more). */
export function loadStars(): Promise<Star[]> {
  if (starsLoading) return starsLoading;
  starsLoading = loadJSON<{ stars: number[][]; names: Record<string, [string, string, string, string]> }>('sky/stars.json').then((s) => s.stars.map(([hip, ra, dec, mag, bv]) => {
    const n = s.names[hip];
    return { hip, ra, dec, mag, bv, v: vec(ra, dec), ...(n ? { name: n[0] || undefined, es: n[1] || undefined, desig: n[2] || undefined, con: n[3] || undefined } : {}) };
  }));
  starsLoading.catch(() => { starsLoading = null; });
  return starsLoading;
}

let loading: Promise<SkyData> | null = null;
/** Everything: the stars, constellations, deep-sky objects and the stars' cards. */
export function loadSky(): Promise<SkyData> {
  if (loading) return loading;
  loading = (async () => {
    const [stars, c, o, si] = await Promise.all([
      loadStars(),
      loadJSON<{ cons: Constellation[]; borders: number[][] }>('sky/constellations.json'),
      loadJSON<{ objects: SkyObject[] }>('sky/objects.json'),
      loadJSON<{ stars: StarInfo[] }>('sky/starinfo.json').catch(() => ({ stars: [] as StarInfo[] })),
    ]);
    const pts = (flat: number[]) => { const out: V3[] = []; for (let i = 0; i < flat.length; i += 2) out.push(vec(flat[i], flat[i + 1])); return out; };
    for (const k of c.cons) { k.lv = k.lines.map(pts); k.bv = k.bounds.map(pts); }
    for (const x of o.objects) x.v = vec(x.ra, x.dec);
    return { stars, byHip: new Map(stars.map((x) => [x.hip, x])), cons: c.cons, borders: c.borders.map(pts), objects: o.objects, info: new Map(si.stars.map((x) => [x.hip, x])) };
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

/** A star's name for people: its proper name, else its Bayer or Flamsteed designation with the constellation's genitive. */
export function starName(d: SkyData, s: Star): string {
  const info = d.info.get(s.hip);
  if (info) return tr(info.name);
  if (s.name) return lang() === 'es' && s.es ? s.es : s.name;
  return starDesig(d, s) || `HIP ${s.hip}`;
}
export function starDesig(d: SkyData, s: Star): string {
  if (!s.desig || !s.con) return '';
  const c = d.cons.find((k) => k.id === s.con);
  return c ? `${s.desig} ${c.gen}` : `${s.desig} ${s.con}`;
}

/** Is a direction inside a ring of unit vectors? (Winding number in a stereographic projection centred on it.) */
export function inRing(ring: V3[], p: V3): boolean {
  // A frame at p.
  const ref: V3 = Math.abs(p[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const e: V3 = [ref[1] * p[2] - ref[2] * p[1], ref[2] * p[0] - ref[0] * p[2], ref[0] * p[1] - ref[1] * p[0]];
  const el = Math.hypot(...e); e[0] /= el; e[1] /= el; e[2] /= el;
  const n: V3 = [p[1] * e[2] - p[2] * e[1], p[2] * e[0] - p[0] * e[2], p[0] * e[1] - p[1] * e[0]];
  let wind = 0, prev = 0, first = true, a0 = 0;
  for (const v of ring) {
    const z = v[0] * p[0] + v[1] * p[1] + v[2] * p[2];
    if (z < -0.2) return false;
    const k = 2 / (1 + z);
    const a = Math.atan2(k * (v[0] * n[0] + v[1] * n[1] + v[2] * n[2]), k * (v[0] * e[0] + v[1] * e[1] + v[2] * e[2]));
    if (first) { a0 = a; first = false; } else { let da = a - prev; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; wind += da; }
    prev = a;
  }
  let da = a0 - prev; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; wind += da;
  return Math.abs(wind) > Math.PI;
}

/** The constellation a J2000 direction is in. */
export function constellationAt(d: SkyData, p: V3): Constellation | null {
  for (const c of d.cons) if (c.bv!.some((r) => inRing(r, p))) return c;
  return null;
}

/** The middle of a constellation's figure (its lines' points), J2000. */
export function centreOf(c: Constellation): V3 {
  const all = c.lv!.flat();
  const s: V3 = [0, 0, 0];
  for (const v of all) { s[0] += v[0]; s[1] += v[1]; s[2] += v[2]; }
  const l = Math.hypot(...s) || 1;
  return all.length ? [s[0] / l, s[1] / l, s[2] / l] : vec(c.at[0][0], c.at[0][1]);
}

/** Angular size (degrees) of a constellation's figure around its middle. */
export function spanOf(c: Constellation): number {
  const m = centreOf(c);
  let max = 0;
  for (const v of c.lv!.flat()) max = Math.max(max, Math.acos(Math.max(-1, Math.min(1, v[0] * m[0] + v[1] * m[1] + v[2] * m[2]))) / RAD);
  return max * 2 || 20;
}

export const MONTHS: Text[] = [
  { en: 'January', es: 'enero' }, { en: 'February', es: 'febrero' }, { en: 'March', es: 'marzo' }, { en: 'April', es: 'abril' },
  { en: 'May', es: 'mayo' }, { en: 'June', es: 'junio' }, { en: 'July', es: 'julio' }, { en: 'August', es: 'agosto' },
  { en: 'September', es: 'septiembre' }, { en: 'October', es: 'octubre' }, { en: 'November', es: 'noviembre' }, { en: 'December', es: 'diciembre' },
];

export const OBJECT_TYPES: Record<string, { icon: string; color: string; name: Text }> = {
  galaxy: { icon: '🌌', color: '#f0b8ff', name: { en: 'Galaxy', es: 'Galaxia' } },
  nebula: { icon: '☁️', color: '#ff9cc0', name: { en: 'Nebula', es: 'Nebulosa' } },
  planetary: { icon: '💫', color: '#9cf0e0', name: { en: 'Planetary nebula', es: 'Nebulosa planetaria' } },
  snr: { icon: '💥', color: '#ffb36b', name: { en: 'Supernova remnant', es: 'Remanente de supernova' } },
  open: { icon: '✨', color: '#a8d4ff', name: { en: 'Open cluster', es: 'Cúmulo abierto' } },
  globular: { icon: '🔆', color: '#ffe08a', name: { en: 'Globular cluster', es: 'Cúmulo globular' } },
  dark: { icon: '🌑', color: '#9aa3b5', name: { en: 'Dark nebula', es: 'Nebulosa oscura' } },
  star: { icon: '⭐', color: '#fff2c4', name: { en: 'Star', es: 'Estrella' } },
  other: { icon: '🔭', color: '#c8d2e6', name: { en: 'Sky object', es: 'Objeto del cielo' } },
};
