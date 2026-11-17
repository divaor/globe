// Master the world (v0.34.0): the decks and their questions. Capitals: the country on the map and four of its cities
// as dots, pick the capital (reverse: the capital, pick its country). Flags: the country on the map, pick its flag,
// later among its look-alikes (reverse: the flag, pick its country). Countries: one outlined with no names, pick its
// name among its neighbours (later: tap it on a map with no names). No browser code, so it can be checked with Node.
import type { DeckId, Step } from './srs';
import { shuffle } from './srs';

export interface Names { en: string; es: string }
export interface Place extends Names { at: [number, number]; pop?: number }
export interface Country {
  id: string; a2: string; ct: string; fame: number; pop: number;
  /** A territory, in the deck only with that setting on. */
  t?: 1;
  cap?: Place; cities: Place[]; seats?: Names[]; note?: Names; skip?: string;
  land: string[]; near: string[]; like: string[];
}
export interface DeckData { countries: Country[]; flagNotes: Record<string, Names> }

export type Scope = 'world' | 'AF' | 'AS' | 'EU' | 'NA' | 'SA' | 'OC';
export const SCOPES: Scope[] = ['world', 'EU', 'AS', 'AF', 'NA', 'SA', 'OC'];

/** The countries a deck asks, in a scope: capitals leave out the city-states (Vatican City...). */
export function inScope(data: DeckData, deck: DeckId, scope: Scope, territories: boolean): Country[] {
  return data.countries.filter((c) => (territories || !c.t) && (scope === 'world' || c.ct === scope) && !(deck === 'capitals' && (c.skip === 'capitals' || !c.cap || c.cities.length < 1)));
}

export interface Question {
  deck: DeckId; id: string; step: Step; reverse: boolean;
  /** Capitals (forward): the capital (index 0) and the other cities, and the order they are shown in. */
  places?: Place[]; order?: number[];
  /** The countries to pick from (reverse capitals, flags, countries), the answer among them. */
  options?: string[];
}

/** The countries near one (its neighbours by land, then the nearest), among those allowed, filled from its continent. */
export function neighbours(c: Country, allowed: Map<string, Country>, n: number, r: () => number): string[] {
  const near = [...c.land, ...c.near].filter((x) => allowed.has(x) && x !== c.id);
  const out = [...new Set(near)].slice(0, n);
  if (out.length < n) {
    const same = shuffle([...allowed.values()].filter((o) => o.ct === c.ct && o.id !== c.id && !out.includes(o.id)).map((o) => o.id), r);
    out.push(...same.slice(0, n - out.length));
  }
  if (out.length < n) out.push(...shuffle([...allowed.keys()].filter((x) => x !== c.id && !out.includes(x)), r).slice(0, n - out.length));
  return out;
}

/** The flags that look like this one, among those allowed; random ones of its continent before it is known. */
export function lookalikes(c: Country, allowed: Map<string, Country>, n: number, hard: boolean, r: () => number): string[] {
  const like = c.like.filter((x) => allowed.has(x));
  if (hard && like.length >= n) return like.slice(0, n);
  const pool = shuffle([...allowed.values()].filter((o) => o.ct === c.ct && o.id !== c.id).map((o) => o.id), r);
  const out = hard ? like.slice(0, n) : [];
  for (const x of pool) { if (out.length >= n) break; if (!out.includes(x)) out.push(x); }
  if (out.length < n) out.push(...shuffle([...allowed.keys()].filter((x) => x !== c.id && !out.includes(x)), r).slice(0, n - out.length));
  return out.slice(0, n);
}

/** A question about one country, at its step; `reverse` asks the other way round (capitals and flags). */
export function question(deck: DeckId, c: Country, step: Step, reverse: boolean, allowed: Map<string, Country>, r: () => number): Question {
  if (deck === 'capitals' && !reverse) {
    const places = [c.cap!, ...c.cities];
    return { deck, id: c.id, step, reverse, places, order: shuffle(places.map((_, i) => i), r) };
  }
  if (deck === 'capitals') {
    const others = neighbours(c, new Map([...allowed].filter(([, o]) => !!o.cap && o.skip !== 'capitals')), 3, r);
    return { deck, id: c.id, step: 'pick', reverse, options: shuffle([c.id, ...others], r) };
  }
  if (deck === 'flags') {
    // Picked among four of its continent; once known, among its look-alikes.
    const others = lookalikes(c, allowed, 3, step !== 'pick' || reverse, r);
    return { deck, id: c.id, step: reverse ? 'pick' : step === 'type' ? 'type' : 'pick', reverse: reverse || step === 'type', options: shuffle([c.id, ...others], r) };
  }
  return { deck, id: c.id, step, reverse: false, options: shuffle([c.id, ...neighbours(c, allowed, 3, r)], r) };
}

/** The note on how to tell two flags apart, if there is one. */
export function flagNote(data: DeckData, a: string, b: string): Names | null {
  return data.flagNotes[a < b ? `${a}|${b}` : `${b}|${a}`] ?? null;
}

/** A typed answer: the same as the name, or nearly (no accents, no case, a typo in a longer word). */
export function typedRight(text: string, names: string[]): boolean {
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const t = fold(text);
  if (t.length < 2) return false;
  return names.some((n) => {
    const w = fold(n);
    if (w === t) return true;
    const k = w.length >= 9 ? 2 : w.length >= 5 ? 1 : 0;
    return k > 0 && Math.abs(w.length - t.length) <= k && dist(t, w) <= k;
  });
}
function dist(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
