// The map games' rules and scores (v0.25.0), without the browser: scripts/test/play.mjs checks them with Node.
// Each game keeps its own scale, with the stars meaning the same everywhere: ★★★ is close to the best there is,
// ★★ a good result, ★ a finished one.

/** Stars for a share of the best result. */
export const starsFor = (share: number): 1 | 2 | 3 => (share >= 0.85 ? 3 : share >= 0.55 ? 2 : 1);

/** Great-circle distance in km. */
export function km(a: [number, number], b: [number, number]): number {
  const r = Math.PI / 180;
  const s = Math.sin(((b[1] - a[1]) * r) / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** n distinct items, in the order the generator picks them. */
export function sample<T>(rand: () => number, list: T[], n: number): T[] {
  const a = [...list];
  const out: T[] = [];
  while (out.length < n && a.length) out.push(a.splice(Math.floor(rand() * a.length), 1)[0]);
  return out;
}

// ---- Pin it -----------------------------------------------------------------------------------------------
export const PIN_ROUNDS = 5;
export const PIN_MAX = 5000;
/** A pin's points: 5,000 on the spot, falling with the distance (about 3,600 at 500 km, 1,300 at 2,000 km). */
export const pinPoints = (distKm: number) => Math.round(PIN_MAX * Math.exp(-Math.max(0, distKm) / 1500));
export const pinStars = (total: number) => starsFor(total / (PIN_MAX * PIN_ROUNDS) / 0.94);

// ---- Higher or lower ------------------------------------------------------------------------------------------
/** A right answer's points: 100 for an easy pair, up to 300 for two values almost the same; the run multiplies them. */
export function hiloPoints(a: number, b: number, run: number): number {
  const lo = Math.min(Math.abs(a), Math.abs(b)), hi = Math.max(Math.abs(a), Math.abs(b));
  const close = hi > 0 ? lo / hi : 1;
  return Math.round(100 * (1 + 2 * close) * (1 + run / 10));
}
/** Stars for a run of right answers. */
export const hiloStars = (run: number): 1 | 2 | 3 => (run >= 10 ? 3 : run >= 5 ? 2 : 1);
/**
 * Two countries to compare on a fact: different enough to be fair (10 % apart at least), closer as the run grows
 * (later pairs are harder), and not two of the same value.
 */
export function hiloPair(rand: () => number, values: [string, number][], run: number): [string, string] | null {
  if (values.length < 2) return null;
  const sorted = [...values].sort((x, y) => x[1] - y[1]);
  // The gap in rank between the two: wide at first, narrower later.
  const span = Math.max(2, Math.round(sorted.length * Math.max(0.04, 0.45 - run * 0.04)));
  for (let tries = 0; tries < 200; tries++) {
    const i = Math.floor(rand() * sorted.length);
    const j = Math.min(sorted.length - 1, Math.max(0, i + (rand() < 0.5 ? -1 : 1) * (1 + Math.floor(rand() * span))));
    if (i === j) continue;
    const [a, b] = [sorted[i], sorted[j]];
    const lo = Math.min(Math.abs(a[1]), Math.abs(b[1])), hi = Math.max(Math.abs(a[1]), Math.abs(b[1]));
    if (hi === 0 || lo / hi > 0.9) continue;
    return rand() < 0.5 ? [a[0], b[0]] : [b[0], a[0]];
  }
  return null;
}

// ---- Grand tour --------------------------------------------------------------------------------------------
/** A tour's cost: the legs between its stops, in order (it ends at the last stop; no way back). */
export function tourCost(order: number[], cost: (i: number, j: number) => number): number {
  let s = 0;
  for (let k = 1; k < order.length; k++) s += cost(order[k - 1], order[k]);
  return s;
}
/** The best order of n stops from stop 0 (every order is tried: 7! = 5,040 at most). */
export function bestTour(n: number, cost: (i: number, j: number) => number): { order: number[]; cost: number } {
  const rest = Array.from({ length: n - 1 }, (_, i) => i + 1);
  let best = { order: [0, ...rest], cost: Infinity };
  const go = (order: number[], left: number[], acc: number) => {
    if (acc >= best.cost) return;
    if (!left.length) { best = { order: [...order], cost: acc }; return; }
    for (let k = 0; k < left.length; k++) {
      const x = left[k];
      order.push(x);
      go(order, left.filter((_, i) => i !== k), acc + cost(order[order.length - 2], x));
      order.pop();
    }
  };
  go([0], rest, 0);
  return best;
}

// ---- Name them all ----------------------------------------------------------------------------------------
/** Seconds to name a list: ten a name, from one to five minutes. */
export const namesTime = (n: number) => Math.max(60, Math.min(300, n * 10));
/** The share named, as points out of 1,000, and two points for each second left when every one is named. */
export function namesScore(found: number, total: number, secsLeft: number): { score: number; stars: 1 | 2 | 3 } {
  const share = total ? found / total : 0;
  const score = Math.round(share * 1000) + (found === total ? Math.max(0, Math.round(secsLeft * 2)) : 0);
  return { score, stars: found === total ? 3 : share >= 0.7 ? 2 : 1 };
}

// ---- Border chain -----------------------------------------------------------------------------------------
export const CHAIN_SECS = 90;
/** 100 points a country after the first, and 200 for each continent beyond the first. */
export const chainScore = (len: number, continents: number) => Math.max(0, len - 1) * 100 + Math.max(0, continents - 1) * 200;
export const chainStars = (len: number): 1 | 2 | 3 => (len >= 15 ? 3 : len >= 8 ? 2 : 1);

// ---- Outline ------------------------------------------------------------------------------------------------
export const OUTLINE_ROUNDS = 5;
/** Points by the try that got it: 1,000 at the first, then 700, 500, 300, 150; nothing after five. */
export const outlinePoints = (tries: number) => [0, 1000, 700, 500, 300, 150][tries] ?? 0;
export const outlineStars = (total: number) => starsFor(total / (1000 * OUTLINE_ROUNDS) / 0.9);

// ---- v0.29.0: games with the guide, the journeys, the sun and the lives -------------------------------------------
/** The nearest a pin comes to any point of a line (the sun's lines, sampled every degree), in km. */
export function nearestKm(p: [number, number], line: [number, number][]): number {
  let best = Infinity;
  for (const q of line) { const d = km(p, q); if (d < best) best = d; }
  return best;
}

/** The point at `deg` degrees of arc from `from`, heading `bearing` degrees (clockwise from north). */
export function destination(from: [number, number], deg: number, bearing: number): [number, number] {
  const r = Math.PI / 180, d = deg * r, b = bearing * r, la = from[1] * r, lo = from[0] * r;
  const lat2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lon2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(lat2));
  return [((((lon2 / r) + 540) % 360) - 180), lat2 / r];
}

export type SunGoal = 'rise' | 'noon' | 'set' | 'midnight' | 'overhead';
/**
 * Where the sun is doing something right now, from the point straight under it (`sub`, [lon, lat]): rising (the half
 * of the day–night line west of it, where the morning starts), setting (the half east of it), noon (its meridian, where
 * the sun is up) and midnight (the opposite meridian), sampled every degree; overhead is the point itself.
 */
export function sunLine(sub: [number, number], goal: SunGoal): [number, number][] {
  if (goal === 'overhead') return [sub];
  if (goal === 'noon' || goal === 'midnight') {
    const lon = goal === 'noon' ? sub[0] : ((sub[0] + 360) % 360) - 180;
    const out: [number, number][] = [];
    // At noon the sun is up where the latitude is within 90° of its own; at midnight it is down there.
    for (let lat = -90; lat <= 90; lat++) if (goal === 'noon' ? Math.abs(lat - sub[1]) < 90 : Math.abs(lat + sub[1]) < 90) out.push([lon, lat]);
    return out;
  }
  const out: [number, number][] = [];
  for (let b = 0; b < 360; b++) {
    const p = destination(sub, 90, b);
    const west = ((p[0] - sub[0] + 540) % 360) - 180 < 0;
    if (west === (goal === 'rise')) out.push(p);
  }
  return out;
}

/** Climate detective: the points of a pin, plus 1,000 for the city's own climate zone or 400 for its group (A–E). */
export const CLIMATE_ROUNDS = 5;
export const climateBonus = (city: string | null, pin: string | null) => (!city || !pin ? 0 : city === pin ? 1000 : city[0] === pin[0] ? 400 : 0);
export const climateStars = (total: number) => starsFor(total / ((PIN_MAX + 1000) * CLIMATE_ROUNDS) / 0.85);

/** Explorer's log and Sunrise race score their pins like Pin it, out of what was asked. */
export const roundStars = (total: number, rounds: number) => starsFor(total / (PIN_MAX * rounds) / 0.9);

/** Whose life is this?: 1,000 at the first place shown, 200 less for each place more, nothing for a wrong name. */
export const LIFE_ROUNDS = 5;
export const lifePoints = (shown: number, right: boolean) => (right ? Math.max(200, 1000 - 200 * (shown - 1)) : 0);
export const lifeStars = (total: number) => starsFor(total / (1000 * LIFE_ROUNDS) / 0.9);

// ---- Daily -------------------------------------------------------------------------------------------------
/** The map games, in the order of the panel and of the daily puzzles. */
export const GAMES = ['hop', 'pin', 'hilo', 'tour', 'names', 'chain', 'outline', 'museum', 'climate', 'explorer', 'sunrise', 'lives'] as const;
export type GameId = (typeof GAMES)[number];

/** A city's names for matching typed capitals: its English and Spanish names, without accents or punctuation. */
export function capitalNames(names: (string | null | undefined)[], normFn: (s: string) => string): Set<string> {
  const out = new Set<string>();
  for (const n of names) if (n) { out.add(normFn(n)); out.add(normFn(n.replace(/\s*\(.*\)$/, '')).replace(/^(ciudad de|city of) /, '')); }
  return out;
}
