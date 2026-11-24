// Legacies of past civilizations (v0.44.0): the parts that need no page (scripts/test/legacy.mjs runs them in
// Node). Who uses a legacy today (its "where" groups resolved to countries), what a country borrowed from each
// civilization, the lines of a legacy's journey, and the questions of "Who gave us this?".

export interface Tx { en: string; es: string }
export interface Cat { id: string; icon: string; color: string; name: Tx }
/** A civilization in the index: enough for the list, the homelands on the map and the quiz. */
export interface CivMeta {
  id: string; name: Tx; short?: Tx; icon: string; color: string; from: string; to: string; at: [number, number]; zoom?: number;
  /** How many legacies, and how many in each category. */
  n: number; cats: Record<string, number>;
  /** Its time-travel story (a kind and a story id). */
  story?: { k: string; s: string };
}
/** A legacy in brief (the index): for the map, the search, a country's list and the quiz. */
export interface Brief {
  c: string; id: string; name: Tx; icon: string; cat: string; how: string; t: number; at: [number, number];
  where: string[]; strong?: string[]; sure?: string;
  /** Its words today, in English and Spanish, and their kind (a person's name, a place...; a plain word has none). */
  w?: IndexWord[];
}
export interface LegacyIndex {
  cats: Cat[]; how: string[]; civs: CivMeta[];
  /** The countries of each group the "where" lists use ("script:latin" → [...]). */
  groups: Record<string, string[]>;
  /** Every country on the map ("world"). */
  countries: string[];
  all: Brief[];
}
export interface PathStep { at: [number, number]; place: Tx; date: string; circa?: boolean; by?: Tx; note?: Tx; from?: number }
/** What kind of word: a plain word, a person's name, a place's name, a day's or month's name, a star's or planet's. */
export type WordType = 'word' | 'name' | 'place' | 'calendar' | 'sky';
export const WORD_TYPES: WordType[] = ['word', 'name', 'place', 'calendar', 'sky'];
export interface Word { en?: string; es?: string; from: string; means?: Tx; type?: WordType }
export interface IndexWord { en?: string; es?: string; t?: WordType }

/** A word as the reader says it: Spanish in Spanish, else English (Portuguese, French and German read the English). */
export const wordIn = (w: { en?: string; es?: string }, lang: string) => (lang === 'es' ? w.es ?? w.en : w.en ?? w.es) ?? '';

/**
 * A word as it reads inside a sentence or a list (v0.44.1): a saying with commas in it ("veni, vidi, vici") in the
 * language's quotation marks, so the list does not read it as three words; anything else as it is.
 */
export function inText(w: string, lang: string): string {
  if (!w.includes(',')) return w;
  const [a, b] = ({ es: ['«', '»'], fr: ['« ', ' »'], de: ['„', '“'] } as Record<string, [string, string]>)[lang] ?? ['“', '”'];
  return `${a}${w}${b}`;
}

/**
 * Words and names a civilization gave, by kind, each once (as the reader says it), with the legacy it is in: for the
 * top of its page ("Words like paper, ebony and oasis; names like Susan").
 */
export function wordsByType(legacies: { id: string; words?: Word[] }[], lang: string): Map<WordType, { w: string; id: string }[]> {
  const out = new Map<WordType, { w: string; id: string }[]>();
  const seen = new Set<string>();
  for (const l of legacies) for (const w of l.words ?? []) {
    const t = w.type ?? 'word', text = wordIn(w, lang);
    const key = `${t}|${text.toLowerCase()}`;
    if (!text || seen.has(key)) continue;
    seen.add(key);
    (out.get(t) ?? out.set(t, []).get(t)!).push({ w: text, id: l.id });
  }
  return new Map(WORD_TYPES.filter((t) => out.has(t)).map((t) => [t, out.get(t)!]));
}
/** A link into a time-travel story: its kind, story, step (from 0), name and icon. */
export interface SeeLink { k: string; s: string; st?: number; n: Tx; i: string }
export interface Legacy {
  id: string; name: Tx; cat: string; icon: string; how: string; sure?: string; date: string; t: number; end?: string; circa?: boolean;
  at: [number, number]; place: Tx; text: Tx; details?: Tx; roots?: Tx; path?: PathStep[];
  where: string[]; strong?: string[]; n: number; note: Tx; words?: Word[]; see?: SeeLink[]; wiki?: Tx; img?: string;
}
export interface Civ {
  id: string; name: Tx; short?: Tx; icon: string; color: string; from: string; to: string; at: [number, number]; zoom?: number;
  intro: Tx; today?: Tx; story?: SeeLink; wiki?: Tx; sources: { title: string; url: string }[]; legacies: Legacy[];
}

type Groups = Pick<LegacyIndex, 'groups' | 'countries'>;

/** The countries a group names: "world", a country's code, or a group of the index. */
export function groupOf(g: string, idx: Groups): string[] {
  if (g === 'world') return idx.countries;
  if (/^[A-Z]{3}$/.test(g)) return [g];
  return idx.groups[g] ?? [];
}

/** The countries a "where" list names: its groups added together, "!group" taken away. */
export function members(where: string[], idx: Groups): Set<string> {
  const on = new Set<string>();
  for (const g of where) if (!g.startsWith('!')) for (const c of groupOf(g, idx)) on.add(c);
  for (const g of where) if (g.startsWith('!')) for (const c of groupOf(g.slice(1), idx)) on.delete(c);
  return on;
}

/** Whether a legacy is used everywhere ("world" with nothing taken away). */
export const everywhere = (where: string[]) => where.includes('world') && !where.some((g) => g.startsWith('!'));

/** Who uses a legacy today: every country, and the ones where it is strongest. */
export function usersOf(b: Pick<Brief, 'where' | 'strong'>, idx: Groups): { all: Set<string>; strong: Set<string> } {
  const all = members(b.where, idx);
  const strong = b.strong ? new Set([...members(b.strong, idx)].filter((c) => all.has(c))) : new Set<string>();
  return { all, strong };
}

/** For one civilization: in each country, how many of its legacies are used (the map's shades). */
export function countsFor(civ: string, idx: LegacyIndex): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of idx.all) {
    if (b.c !== civ) continue;
    for (const c of members(b.where, idx)) out.set(c, (out.get(c) ?? 0) + 1);
  }
  return out;
}

/**
 * What a country borrowed from the past, civilization by civilization: the legacies used there and not everywhere
 * (`own`) and those used all over the world (`world`); the civilizations it borrowed most from first.
 */
export function borrowed(iso: string, idx: LegacyIndex): { civ: CivMeta; own: Brief[]; world: Brief[] }[] {
  const by = new Map<string, { own: Brief[]; world: Brief[] }>();
  for (const b of idx.all) {
    if (!members(b.where, idx).has(iso)) continue;
    const e = by.get(b.c) ?? { own: [], world: [] };
    (everywhere(b.where) ? e.world : e.own).push(b);
    by.set(b.c, e);
  }
  return idx.civs.filter((c) => by.has(c.id)).map((civ) => ({ civ, ...by.get(civ.id)! }))
    .sort((a, b) => b.own.length + b.world.length - (a.own.length + a.world.length) || a.civ.id.localeCompare(b.civ.id));
}

/** In how many countries each civilization is used, and by how many civilizations each country borrowed. */
export function reach(idx: LegacyIndex): { byCountry: Map<string, number> } {
  const civs = new Map<string, Set<string>>();
  for (const b of idx.all) for (const c of members(b.where, idx)) (civs.get(c) ?? civs.set(c, new Set()).get(c)!).add(b.c);
  return { byCountry: new Map([...civs].map(([c, s]) => [c, s.size])) };
}

/**
 * The lines of a legacy's journey, as [from, to] points: from the place it began to its first step, then step to
 * step, unless a step says where its line starts ("from": 0 is the origin, k is step k, counting from 1).
 */
export function segments(origin: [number, number], path: PathStep[] = []): [[number, number], [number, number]][] {
  const pts = [origin, ...path.map((p) => p.at)];
  return path.map((p, i) => {
    const from = p.from != null && p.from >= 0 && p.from <= i ? p.from : i;
    return [pts[from], pts[i + 1]] as [[number, number], [number, number]];
  });
}

/** Text search over the legacies: by name (both languages), its words and its civilization. */
export function findLegacies(q: string, idx: LegacyIndex, score: (s: string) => number, max = 30): { b: Brief; s: number }[] {
  if (!q.trim()) return [];
  const civ = new Map(idx.civs.map((c) => [c.id, c]));
  const out: { b: Brief; s: number }[] = [];
  for (const b of idx.all) {
    const c = civ.get(b.c);
    const s = Math.max(score(b.name.en), score(b.name.es), ...(b.w ?? []).flatMap((w) => [w.en, w.es]).filter((w): w is string => !!w).map((w) => score(w) - 4), c ? Math.max(score(c.name.en), score(c.name.es)) - 30 : 0);
    if (s > 0) out.push({ b, s });
  }
  return out.sort((a, b) => b.s - a.s || a.b.t - b.b.t).slice(0, max);
}

/** A seeded random number generator (mulberry32), so the daily challenge's question is the same for everyone. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface QuizQ { c: string; id: string; options: string[] }
/**
 * "Who gave us this?": a legacy and four civilizations, one of them right. Debated ones are left out, and so is any
 * legacy whose name another civilization also has (both answers would be right); no two questions share a legacy,
 * and the questions take each civilization in turn, in a random order.
 */
export function quizQuestions(idx: LegacyIndex, n: number, rand: () => number = Math.random): QuizQ[] {
  const names = new Map<string, Set<string>>();
  for (const b of idx.all) { const k = b.name.en.toLowerCase(); (names.get(k) ?? names.set(k, new Set()).get(k)!).add(b.c); }
  const pool = idx.all.filter((b) => b.sure !== 'debated' && names.get(b.name.en.toLowerCase())!.size === 1);
  const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  // Spread over the civilizations: one legacy of each in turn, the civilizations in a random order.
  const byCiv = new Map<string, Brief[]>();
  for (const b of pool) (byCiv.get(b.c) ?? byCiv.set(b.c, []).get(b.c)!).push(b);
  for (const l of byCiv.values()) shuffle(l);
  const order = shuffle([...byCiv.keys()].sort());
  const out: QuizQ[] = [];
  for (let round = 0; out.length < n && order.some((c) => byCiv.get(c)!.length > round); round++) {
    for (const c of order) {
      const b = byCiv.get(c)![round];
      if (!b || out.length >= n) continue;
      const others = shuffle(idx.civs.filter((x) => x.id !== c).map((x) => x.id).sort()).slice(0, 3);
      out.push({ c, id: b.id, options: shuffle([c, ...others]) });
    }
  }
  return out;
}

/**
 * The legacy of the day, the same for everyone on a day ("2026-11-24"): a fixed shuffle of every legacy (nothing
 * debated) walked one a day, so none comes back until all have had their day.
 */
export function ofTheDay(day: string, idx: LegacyIndex): Brief | null {
  const pool = idx.all.filter((b) => b.sure !== 'debated').slice().sort((a, b) => `${a.c}/${a.id}`.localeCompare(`${b.c}/${b.id}`));
  if (!pool.length) return null;
  const rand = seeded(20441124);
  const walk = pool.map((_, i) => i);
  for (let i = walk.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [walk[i], walk[j]] = [walk[j], walk[i]]; }
  const [y, m, d] = day.split('-').map(Number);
  const n = Math.round(Date.UTC(y, m - 1, d) / 864e5);
  return pool[walk[((n % walk.length) + walk.length) % walk.length]];
}
