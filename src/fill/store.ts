// Fill the map (v0.35.0): what is kept on this device (and in the backup of v0.31.2): one world map per category
// (each filled country and its stars, 0 when it was shown after three misses), the regions of the day played, and
// the last choices.
import type { FillCat, Theme } from './logic';

export const FILL_KEY = 'atlas-globe:fill';

export interface FillState {
  maps: Record<FillCat, Record<string, number>>;
  /** The region of the day: stars out of the most, and a mark per country (3 2 1 0). */
  dailies: Record<string, { s: number; n: number; m: string; scope: string; cat: FillCat }>;
  settings: { cat: FillCat; scope: string; theme: Theme };
}

const fresh = (): FillState => ({
  maps: { countries: {}, capitals: {}, flags: {}, people: {}, area: {}, clues: {}, languages: {} },
  dailies: {},
  settings: { cat: 'countries', scope: 'r:South America', theme: 'all' },
});

let cache: FillState | null = null;
export function fillState(): FillState {
  if (cache) return cache;
  const f = fresh();
  try {
    const s = JSON.parse(localStorage.getItem(FILL_KEY) || '{}') as Partial<FillState>;
    cache = { ...f, ...s, maps: { ...f.maps, ...s.maps }, settings: { ...f.settings, ...s.settings }, dailies: { ...s.dailies } };
  } catch { cache = f; }
  return cache!;
}
export function saveFill() { try { localStorage.setItem(FILL_KEY, JSON.stringify(fillState())); } catch { /* private mode: kept for this visit */ } }
/** Start one category's map again. */
export function resetFillMap(cat: FillCat) { fillState().maps[cat] = {}; saveFill(); }
/** Forget everything (Settings → Reset progress); the choices stay. */
export function resetFill() { const s = fillState().settings; cache = { ...fresh(), settings: s }; saveFill(); }
/** For a backup brought back from another device. */
export function reloadFill() { cache = null; }
