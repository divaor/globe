// Put it on the map (v0.36.0): the rules, with no browser code (scripts/test/onmap.mjs checks them with Node). Six
// things from a country or a region (a river, a range, a city, a building...) to put on the map, each among the
// greyed-out places of its kind there; a check colours each one green when right, and from yellow to red by how far
// off it is, measured against the size of the country; five checks, and the greens stay.

export type Kind = 'river' | 'lake' | 'range' | 'desert' | 'peak' | 'city' | 'built' | 'park';
export const KINDS: Kind[] = ['river', 'lake', 'range', 'desert', 'peak', 'city', 'built', 'park'];
export type Mix = 'all' | 'nature' | 'cities' | 'built';
export const MIXES: Mix[] = ['all', 'nature', 'cities', 'built'];
export const MIX_KINDS: Record<Mix, Kind[]> = {
  all: KINDS, nature: ['river', 'lake', 'range', 'desert', 'peak', 'park'], cities: ['city'], built: ['built'],
};
/** Lines and areas (drawn as shapes); the rest are points. */
export const SHAPED: Kind[] = ['river', 'lake', 'range', 'desert'];

/** Six things, five checks; a kind needs three places to choose among (two more than it asks, when it asks two). */
export const ITEMS = 6;
export const TRIES = 5;
export const MIN_CANDS = 3;
/** The most of a kind shown on the map (the best known), so it stays readable. */
export const SHOWN = 12;

/** A place in a scope: its index, and the point it is measured from there. */
export interface Cand { i: number; at: [number, number] }
/** A place of places.json: [kind, name, nombre (0: as name), lon, lat, fame, shape]. */
export type PlaceRow = [Kind, string, string | 0, number, number, number, number];

/** Great-circle distance in km. */
export function km(a: [number, number], b: [number, number]): number {
  const r = Math.PI / 180;
  const s = Math.sin(((b[1] - a[1]) * r) / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** A small seeded random (mulberry32), and a string hash for seeds. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

/**
 * The places of a scope by kind, the best known first, at most SHOWN of each. A place in several of the scope's
 * countries comes once (its first point: where most of it is).
 */
export function byKind(entries: Cand[], places: PlaceRow[], kinds: Kind[] = KINDS): Map<Kind, Cand[]> {
  const seen = new Set<number>();
  const out = new Map<Kind, Cand[]>();
  for (const e of entries) {
    if (seen.has(e.i)) continue;
    seen.add(e.i);
    const k = places[e.i][0];
    if (!kinds.includes(k)) continue;
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(e);
  }
  for (const [k, l] of out) out.set(k, l.sort((a, b) => places[b.i][5] - places[a.i][5]).slice(0, SHOWN));
  return out;
}

/** The kinds of a mix that can be asked in a scope (three or more places of the kind; eight for a one-kind mix). */
export function usable(cands: Map<Kind, Cand[]>, mix: Mix): Kind[] {
  const ks = MIX_KINDS[mix];
  const need = ks.length === 1 ? ITEMS + 2 : MIN_CANDS;
  return ks.filter((k) => (cands.get(k)?.length ?? 0) >= need);
}

/**
 * A puzzle: six places of the scope to put on the map. As many kinds as it can (one of each, in a random order),
 * then a second of a kind with places to spare; each a well-known one of its kind (among its best known four, or
 * as many as it asks plus two). Null when the scope has too little for six.
 */
export function makePuzzle(cands: Map<Kind, Cand[]>, mix: Mix, r: () => number): Cand[] | null {
  const ks = usable(cands, mix);
  if (!ks.length) return null;
  const order = ks.slice();
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const picked: Cand[] = [];
  const count = new Map<Kind, number>();
  for (let round = 0; picked.length < ITEMS && round < ITEMS; round++) {
    let added = false;
    for (const k of order) {
      if (picked.length >= ITEMS) break;
      const all = cands.get(k)!;
      const n = count.get(k) ?? 0;
      // Room for one more of this kind: two places more than it asks, so a pick is still a choice.
      if (all.length < n + 1 + (MIX_KINDS[mix].length === 1 ? 2 : MIN_CANDS - 1)) continue;
      const pool = all.slice(0, Math.max(4, n + 3)).filter((c) => !picked.includes(c));
      if (!pool.length) continue;
      picked.push(pool[Math.floor(r() * pool.length)]);
      count.set(k, n + 1);
      added = true;
    }
    if (!added) break;
  }
  return picked.length === ITEMS ? picked : null;
}

/** The size of a scope: the farthest two of its places (at least 50 km), against which a miss is measured. */
export function spanOf(cands: Map<Kind, Cand[]>): number {
  const pts = [...cands.values()].flat().map((c) => c.at);
  let d = 50;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) d = Math.max(d, km(pts[i], pts[j]));
  return d;
}

/** A mark: right (g), close (y), off (o) or far (r); with how far off, as a share of the scope's size. */
export type Mark = 'g' | 'y' | 'o' | 'r';
export function mark(right: Cand, given: Cand, span: number): { m: Mark; off: number; km: number } {
  if (right.i === given.i) return { m: 'g', off: 0, km: 0 };
  const d = km(right.at, given.at), off = d / span;
  return { m: off <= 0.15 ? 'y' : off <= 0.35 ? 'o' : 'r', off, km: d };
}
/** The colour of a miss on the map: yellow when close to red when far (by the share of the scope's size). */
export function missColor(off: number): string {
  const t = Math.min(1, off / 0.5);
  return `hsl(${Math.round(52 * (1 - t))}, 90%, ${Math.round(56 - 6 * t)}%)`;
}
export const SQUARE: Record<Mark, string> = { g: '🟩', y: '🟨', o: '🟧', r: '🟥' };

/** The share grid: a line of six squares per check. */
export const grid = (rows: Mark[][]) => rows.map((row) => row.map((m) => SQUARE[m]).join('')).join('\n');

/**
 * The puzzle of the day, the same for everyone: a country one day and a region the next (by the day's number), from
 * the ones with enough to ask.
 */
export function dailyScope(day: string, countries: string[], regions: string[]): string | null {
  const n = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  const pool = (n % 2 === 0 ? countries : regions).slice().sort();
  const alt = (n % 2 === 0 ? regions : countries).slice().sort();
  const list = pool.length ? pool : alt;
  if (!list.length) return null;
  return list[hash(`onmap:${day}`) % list.length];
}

/** A country's places (places.json's rows: [place] or [place, lon, lat] for one that crosses borders). */
export function entriesOf(rows: number[][] | undefined, places: PlaceRow[]): Cand[] {
  return (rows ?? []).map((r) => ({ i: r[0], at: (r.length > 2 ? [r[1], r[2]] : [places[r[0]][3], places[r[0]][4]]) as [number, number] }));
}
/**
 * A region's places: its countries' together; a river or range in several of them is measured from its point in
 * the one that has most of it (its own point, when that country is in the region; else the nearest of theirs).
 */
export function regionEntries(rows: Record<string, number[][]>, members: string[], places: PlaceRow[]): Cand[] {
  const by = new Map<number, Cand[]>();
  for (const c of members) for (const e of entriesOf(rows[c], places)) { if (!by.has(e.i)) by.set(e.i, []); by.get(e.i)!.push(e); }
  return [...by.entries()].map(([i, es]) => {
    const own: [number, number] = [places[i][3], places[i][4]];
    return es.reduce((a, b) => (km(b.at, own) < km(a.at, own) ? b : a));
  });
}
/** Enough for a fair puzzle: six things, from three kinds or more for All and Nature (two of each, at most). */
export function playable(cands: Map<Kind, Cand[]>, mix: Mix = 'all'): boolean {
  const ks = usable(cands, mix);
  if ((mix === 'all' || mix === 'nature') && ks.length < 3) return false;
  return makePuzzle(cands, mix, rng(1)) !== null;
}
