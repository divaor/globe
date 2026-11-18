// Fill the map (v0.35.0): the rules, with no browser code (scripts/test/fill.mjs checks them with Node). A world map
// coloured in country by country: what to fill it with (a category), where the questions come from (the world, a
// continent or a region), the order they come in, the clue ladders, the stars, the next region to fill, and the
// region of the day.

export type FillCat = 'countries' | 'capitals' | 'flags' | 'people' | 'area' | 'clues' | 'languages';
export const CATS: FillCat[] = ['countries', 'capitals', 'flags', 'people', 'area', 'clues', 'languages'];
export type Theme = 'all' | 'nature' | 'culture' | 'people';
export const THEMES: Theme[] = ['all', 'nature', 'culture', 'people'];
export const CONTS = ['EU', 'AS', 'AF', 'NA', 'SA', 'OC'] as const;

/** A clue (public/data/fill/clues.json): theme, level 1 (hard) to 3 (easy), icon, texts; m is a number for {m}. */
export interface Clue { k: string; t: string; l: number; i: string; en: string; es: string; m?: number }

/** A country as Fill the map sees it. */
export interface Unit { id: string; ct: string; sr: string; pop: number; area: number; langs: string[]; at: [number, number]; land: string[] }

/** The continent of each UN region (for the countries Master the world puts in no continent, and for grouping). */
export const REGION_CT: Record<string, string> = {
  'Western Asia': 'AS', 'Eastern Africa': 'AF', 'Western Africa': 'AF', 'Southern Europe': 'EU', 'Caribbean': 'NA', 'South America': 'SA',
  'South-Eastern Asia': 'AS', 'Eastern Europe': 'EU', 'Northern Europe': 'EU', 'Southern Asia': 'AS', 'Middle Africa': 'AF', 'Western Europe': 'EU',
  'Central America': 'NA', 'Northern Africa': 'AF', 'Southern Africa': 'AF', 'Eastern Asia': 'AS', 'Central Asia': 'AS', 'Micronesia': 'OC',
  'Melanesia': 'OC', 'Polynesia': 'OC', 'Australia and New Zealand': 'OC', 'Northern America': 'NA',
};
export const continentOf = (u: Unit) => (CONTS as readonly string[]).includes(u.ct) ? u.ct : REGION_CT[u.sr] ?? u.ct;

export interface Region { id: string; name: string; ct: string; ids: string[] }
/** The UN regions the countries fall in, by continent, the biggest first. */
export function regionsOf(units: Unit[]): Region[] {
  const by = new Map<string, string[]>();
  for (const u of units) { if (!u.sr) continue; if (!by.has(u.sr)) by.set(u.sr, []); by.get(u.sr)!.push(u.id); }
  return [...by].map(([name, ids]) => ({ id: `r:${name}`, name, ct: REGION_CT[name] ?? '', ids }))
    .sort((a, b) => CONTS.indexOf(a.ct as never) - CONTS.indexOf(b.ct as never) || b.ids.length - a.ids.length);
}

/** The countries of a scope: 'world', a continent ('EU') or a region ('r:South America'). */
export function inScope(units: Unit[], scope: string): string[] {
  if (scope === 'world') return units.map((u) => u.id);
  if (scope.startsWith('r:')) { const r = scope.slice(2); return units.filter((u) => u.sr === r).map((u) => u.id); }
  return units.filter((u) => continentOf(u) === scope).map((u) => u.id);
}

/** Stars for a country: right at the 1st try 3, the 2nd 2, the 3rd 1; shown after three misses 0. */
export const starsFor = (misses: number) => (misses <= 0 ? 3 : misses === 1 ? 2 : misses === 2 ? 1 : 0);
export const TRIES = 3;

/** A small seeded random (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffle<T>(a: T[], r: () => number): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}
export const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

/** The order the countries are asked in: by size for Biggest first (the biggest left each time), else shuffled. */
export function order(cat: FillCat, ids: string[], units: Map<string, Unit>, r: () => number): string[] {
  if (cat === 'people') return ids.slice().sort((a, b) => (units.get(b)?.pop ?? 0) - (units.get(a)?.pop ?? 0));
  if (cat === 'area') return ids.slice().sort((a, b) => (units.get(b)?.area ?? 0) - (units.get(a)?.area ?? 0));
  return shuffle(ids, r);
}

/**
 * Three clues for a country, hard to easy, of a theme when it has them: a level-1 clue, a level-2 and a level-3
 * (from any theme when the theme has none of that level, then any left). 'All' takes nature or culture first and
 * people second.
 */
export function ladder(clues: Clue[], theme: Theme, r: () => number): Clue[] {
  const out: Clue[] = [];
  const left = () => clues.filter((c) => !out.includes(c));
  const pick = (list: Clue[]) => (list.length ? list[Math.floor(r() * list.length)] : null);
  const want = (level: number, themes: string[]) => pick(left().filter((c) => c.l === level && themes.includes(c.t)));
  // For each level, groups of themes in order: the first group with a clue of that level gives it (at random within
  // the group), the capital ('easy') only when nothing else will do.
  const prefs: Record<Theme, string[][][]> = {
    all: [[['nature', 'culture']], [['people'], ['nature', 'culture']], [['culture', 'nature', 'people'], ['easy']]],
    nature: [[['nature']], [['nature']], [['nature'], ['easy']]],
    culture: [[['culture']], [['culture']], [['culture'], ['easy']]],
    people: [[['people']], [['people']], [['people'], ['easy']]],
  };
  for (let level = 1; level <= 3; level++) {
    let c: Clue | null = null;
    for (const group of prefs[theme][level - 1]) { c = want(level, group); if (c) break; }
    c ??= want(level, ['nature', 'culture', 'people']) ?? want(level, ['easy']) ?? pick(left().filter((x) => x.l >= level && x.t !== 'easy')) ?? pick(left());
    if (c) out.push(c);
  }
  return out.slice(0, 3);
}

/** A language prompt: one spoken in a country not yet filled, and every such country (any of them is right). */
export function langPrompt(todo: string[], units: Map<string, Unit>, r: () => number): { lang: string; ids: string[] } | null {
  const langs = [...new Set(todo.flatMap((id) => units.get(id)?.langs ?? []))];
  if (!langs.length) return null;
  const lang = langs[Math.floor(r() * langs.length)];
  return { lang, ids: todo.filter((id) => units.get(id)?.langs.includes(lang)) };
}

/** The nearest region (by its countries' middle) that is not full yet. */
export function nextRegion(regions: Region[], from: string, full: (r: Region) => boolean, at: (id: string) => [number, number] | undefined): Region | null {
  const mid = (r: Region): [number, number] => {
    const pts = r.ids.map(at).filter((p): p is [number, number] => !!p);
    let x = 0, y = 0, z = 0;
    for (const [lo, la] of pts) { const p = (lo * Math.PI) / 180, t = (la * Math.PI) / 180; x += Math.cos(t) * Math.cos(p); y += Math.cos(t) * Math.sin(p); z += Math.sin(t); }
    return [(Math.atan2(y, x) * 180) / Math.PI, (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI];
  };
  const here = regions.find((r) => r.id === from);
  const o = here ? mid(here) : [0, 0];
  const d = (p: [number, number]) => { const k = Math.PI / 180; return Math.acos(Math.min(1, Math.sin(o[1] * k) * Math.sin(p[1] * k) + Math.cos(o[1] * k) * Math.cos(p[1] * k) * Math.cos((p[0] - o[0]) * k))); };
  return regions.filter((r) => r.id !== from && !full(r)).sort((a, b) => d(mid(a)) - d(mid(b)))[0] ?? null;
}

/** The region of the day, the same for everyone: a region of 5 to 15 countries, and countries, capitals or flags. */
export function dailyPick(day: string, regions: Region[]): { scope: string; cat: FillCat } | null {
  const ok = regions.filter((r) => r.ids.length >= 5 && r.ids.length <= 15).sort((a, b) => a.id.localeCompare(b.id));
  if (!ok.length) return null;
  const h = hash(`fill:${day}`);
  return { scope: ok[h % ok.length].id, cat: (['countries', 'capitals', 'flags'] as FillCat[])[Math.floor(h / ok.length) % 3] };
}
