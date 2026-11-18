// Fill the states (v0.38.0): the rules, with no browser code (scripts/test/fill.mjs checks them with Node). Fill the
// map inside one country: its states, provinces or regions, coloured in as you get them. Every one of the 48
// countries of the States and provinces quiz by name; the twelve with capitals, area and population
// (public/data/states/states.json) by capital and biggest first too.
import { hash, shuffle } from './logic';

export type StateCat = 'names' | 'capitals' | 'people' | 'area';
export const STATE_CATS: StateCat[] = ['names', 'capitals', 'people', 'area'];

/** The twelve countries with capitals, area and population. */
export const WITH_FACTS = ['MEX', 'USA', 'BRA', 'ARG', 'COL', 'CHL', 'PER', 'ESP', 'CAN', 'AUS', 'DEU', 'IND'];

/**
 * A state of states.json: its capital [en, es (0: as en), lon, lat, people, note?], `s` when it is a city of its own
 * (no capital to ask), km², people and the year counted, its other cities [en, es, lon, lat, people], and `b` its
 * biggest city when that is not the capital [en, es, people]; `f` the capital's official long names.
 */
export interface StateFacts {
  c: [string, string | 0, number, number, number, [string, string]?];
  s?: 1; a: number; p: number; y: number | null;
  o: [string, string | 0, number, number, number][];
  b?: [string, string | 0, number];
  f?: string[];
}
export type StatesData = Record<string, Record<string, StateFacts>>;

/** What one of a country's divisions is called: "state", "province"... (for "Tap the state whose capital is..."). */
export const WORD: Record<string, [string, string]> = {
  MEX: ['state', 'estado'], USA: ['state', 'estado'], BRA: ['state', 'estado'], ARG: ['province', 'provincia'],
  COL: ['department', 'departamento'], CHL: ['region', 'región'], PER: ['region', 'región'], ESP: ['community', 'comunidad'],
  CAN: ['province', 'provincia'], AUS: ['state', 'estado'], DEU: ['state', 'estado'], IND: ['state', 'estado'],
};

/** The categories a country can be filled with: by name always; the rest only with its facts. */
export const catsOf = (a3: string, data: StatesData | null): StateCat[] => (data?.[a3] ? STATE_CATS : ['names']);

/** The divisions a category asks: all for names; for capitals, those with one (not a city of its own); the rest with
 *  their number. */
export function eligible(cat: StateCat, ids: string[], facts: Record<string, StateFacts> | undefined): string[] {
  if (cat === 'names') return ids.slice();
  if (!facts) return [];
  if (cat === 'capitals') return ids.filter((id) => facts[id] && !facts[id].s && facts[id].c?.[0]);
  if (cat === 'people') return ids.filter((id) => facts[id]?.p > 0);
  return ids.filter((id) => facts[id]?.a > 0);
}

/** The order they are asked in: the biggest left each time for people and area, else shuffled. */
export function stateOrder(cat: StateCat, ids: string[], facts: Record<string, StateFacts> | undefined, r: () => number): string[] {
  if (cat === 'people') return ids.slice().sort((a, b) => (facts?.[b]?.p ?? 0) - (facts?.[a]?.p ?? 0));
  if (cat === 'area') return ids.slice().sort((a, b) => (facts?.[b]?.a ?? 0) - (facts?.[a]?.a ?? 0));
  return shuffle(ids, r);
}

/** Where a point lies from the middle of its country: one of eight directions, or the middle itself. */
export type Dir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' | 'c';
export function direction(at: [number, number], box: [[number, number], [number, number]]): Dir {
  const [[w, s], [e, n]] = box;
  const fx = (at[0] - w) / Math.max(1e-6, e - w), fy = (at[1] - s) / Math.max(1e-6, n - s);
  const h = fx < 1 / 3 ? 'w' : fx > 2 / 3 ? 'e' : '';
  const v = fy < 1 / 3 ? 's' : fy > 2 / 3 ? 'n' : '';
  return ((v + h) || 'c') as Dir;
}
export const DIR_TEXT: Record<Dir, [string, string]> = {
  n: ['the north', 'el norte'], ne: ['the north-east', 'el noreste'], e: ['the east', 'el este'], se: ['the south-east', 'el sureste'],
  s: ['the south', 'el sur'], sw: ['the south-west', 'el suroeste'], w: ['the west', 'el oeste'], nw: ['the north-west', 'el noroeste'], c: ['the middle', 'el centro'],
};

/** The country of the day, the same for everyone: one of the twelve, by name or by capital. */
export function dailyCountry(day: string): { a3: string; cat: StateCat } {
  const h = hash(`states:${day}`);
  const list = WITH_FACTS.slice().sort();
  return { a3: list[h % list.length], cat: (['names', 'capitals'] as StateCat[])[Math.floor(h / list.length) % 2] };
}

/** The next country to fill in a category: the first of the list after this one that is not full. */
export function nextCountry(list: string[], from: string, full: (a3: string) => boolean): string | null {
  const k = list.indexOf(from);
  for (let d = 1; d <= list.length; d++) { const a3 = list[(k + d + list.length) % list.length]; if (a3 !== from && !full(a3)) return a3; }
  return null;
}
