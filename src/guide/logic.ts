// The travel guide's sums (v0.26.0), without the browser: scripts/test/guide.mjs checks them with Node.
// Weather months worth a visit, sunrise and sunset, a city's clock against yours, and the trip: legs, flight time,
// the best order and the link that shares it.
import { bestTour } from '../play/logic';

/** A city's weather by month (CRU CL 2.0 normals): t mean °C×10, r daily range °C×10, p rain mm, d wet days×10. */
export interface Climate { t: number[]; r: number[] | null; p: number[]; d: number[] | null }

/** Great-circle distance in km. */
export function km(a: [number, number], b: [number, number]): number {
  const r = Math.PI / 180;
  const s = Math.sin(((b[1] - a[1]) * r) / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}

// ---- Weather ---------------------------------------------------------------------------------------------------
/**
 * How pleasant each month is, 0–1: warm afternoons but not hot ones (a daily high of 21–28 °C is best; it falls away
 * below and, faster, above; the high is the mean plus half the daily range), and dry (little rain, few wet days).
 */
export function monthScores(c: Climate): number[] {
  return c.t.map((t10, i) => {
    const high = t10 / 10 + (c.r ? c.r[i] / 20 : 5), p = c.p[i], wet = c.d ? c.d[i] / 10 : p / 8;
    const temp = high >= 21 && high <= 28 ? 1 : high < 21 ? Math.max(0, 1 - (21 - high) / 14) : Math.max(0, 1 - (high - 28) / 8);
    const rain = Math.max(0, 1 - Math.max(0, p - 60) / 300) * Math.max(0.3, 1 - wet / 40);
    return Math.round(temp * rain * 100) / 100;
  });
}

/** The best months to go (0 = January): those close to the best one, when the best one is good enough. */
export function bestMonths(c: Climate): number[] {
  const s = monthScores(c);
  const top = Math.max(...s);
  if (top < 0.35) return [];
  return s.map((v, i) => [v, i]).filter(([v]) => v >= top * 0.85).map(([, i]) => i);
}

/** Months as ranges: [5, 6, 7, 8] → [[5, 8]]; December wraps round to January ([11, 0, 1] → [[11, 1]]). */
export function monthRanges(months: number[]): [number, number][] {
  const set = new Set(months);
  if (set.size === 12) return [[0, 11]];
  const out: [number, number][] = [];
  for (let m = 0; m < 12; m++) {
    if (!set.has(m) || set.has((m + 11) % 12)) continue;
    let end = m;
    while (set.has((end + 1) % 12) && (end + 1) % 12 !== m) end = (end + 1) % 12;
    out.push([m, end]);
  }
  return out;
}

// ---- The sun -----------------------------------------------------------------------------------------------------
/**
 * Sunrise and sunset on a day, in minutes after midnight UTC (NOAA's formulas, with the usual 0.833° for the sun's
 * size and the air's bending). Null when the sun does not set (polar day) or rise (polar night) that day.
 */
export function sunTimes(day: Date, lat: number, lon: number): { rise: number; set: number } | { polar: 'day' | 'night' } {
  const start = Date.UTC(day.getUTCFullYear(), 0, 1);
  const n = Math.floor((Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) - start) / 864e5) + 1;
  const g = ((2 * Math.PI) / 365) * (n - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const phi = (lat * Math.PI) / 180;
  const x = Math.cos((90.833 * Math.PI) / 180) / (Math.cos(phi) * Math.cos(decl)) - Math.tan(phi) * Math.tan(decl);
  if (x > 1) return { polar: 'night' };
  if (x < -1) return { polar: 'day' };
  const ha = (Math.acos(x) * 180) / Math.PI;
  return { rise: 720 - 4 * (lon + ha) - eq, set: 720 - 4 * (lon - ha) - eq };
}

/** A time zone's offset from UTC in minutes at a moment ("Asia/Tokyo" → 540). */
export function tzOffset(tz: string, at = new Date()): number {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    const m = /GMT([+-])(\d{1,2}):?(\d{2})?/.exec(part);
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
  } catch { return 0; }
}

/** Minutes after midnight as "06:42" (wrapping round the day). */
export function hhmm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ---- The trip ----------------------------------------------------------------------------------------------------
/** Hours in the air for a flight: about 800 km an hour, and half an hour for taking off and landing. */
export const flightHours = (d: number) => d / 800 + 0.5;

/** "2 h 15 min", to the nearest quarter of an hour. */
export function hoursText(h: number): string {
  const q = Math.max(1, Math.round(h * 4));
  const hh = Math.floor(q / 4), mm = (q % 4) * 15;
  return hh ? `${hh} h${mm ? ` ${mm} min` : ''}` : `${mm} min`;
}

/**
 * The shortest order to visit the places, starting from the first and ending anywhere: every order is tried up to
 * nine places; beyond that, the nearest place next, then swaps of two legs while they make the trip shorter.
 */
export function bestOrder(pts: [number, number][]): number[] {
  const n = pts.length;
  if (n <= 2) return pts.map((_, i) => i);
  const cost = (i: number, j: number) => km(pts[i], pts[j]);
  if (n <= 9) return bestTour(n, cost).order;
  const order = [0];
  const left = new Set(pts.map((_, i) => i).slice(1));
  while (left.size) {
    const last = order[order.length - 1];
    let best = -1, bd = Infinity;
    for (const j of left) { const d = cost(last, j); if (d < bd) { bd = d; best = j; } }
    order.push(best); left.delete(best);
  }
  const len = (o: number[]) => o.slice(1).reduce((s, x, k) => s + cost(o[k], x), 0);
  for (let better = true; better;) {
    better = false;
    for (let i = 1; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
      const o = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
      if (len(o) < len(order) - 1e-9) { order.splice(0, n, ...o); better = true; }
    }
  }
  return order;
}

/** The trip's total length in km, in its order. */
export const tripKm = (pts: [number, number][]) => pts.slice(1).reduce((s, p, i) => s + km(pts[i], p), 0);

/** The share link's part: "trip=lima,cusco,arequipa". */
export const tripHash = (ids: string[]) => `trip=${ids.map(encodeURIComponent).join(',')}`;
/** The cities of a shared trip that the guide knows, in order, each once. */
export function readTrip(value: string | null, known: (id: string) => boolean): string[] {
  if (!value) return [];
  const out: string[] = [];
  for (const raw of value.split(',')) { const id = decodeURIComponent(raw.trim()).toLowerCase(); if (id && known(id) && !out.includes(id)) out.push(id); }
  return out.slice(0, 30);
}
