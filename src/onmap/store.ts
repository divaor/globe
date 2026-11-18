// Put it on the map (v0.36.0): what is kept on this device (and in the backup of v0.31.2): the puzzles of the day
// played (the checks it took, solved or not, the share grid), how many puzzles were played and solved, and the last
// choices.
import type { Mix } from './logic';

export const ONMAP_KEY = 'atlas-globe:onmap';

export interface OnmapState {
  /** The puzzle of the day: where, the checks used, solved, and the share grid. */
  dailies: Record<string, { scope: string; tries: number; solved: boolean; grid: string }>;
  played: number;
  solved: number;
  /** Solved at the first check. */
  first: number;
  settings: { mix: Mix; scope: string };
}

const fresh = (): OnmapState => ({ dailies: {}, played: 0, solved: 0, first: 0, settings: { mix: 'all', scope: 'MEX' } });

let cache: OnmapState | null = null;
export function onmapState(): OnmapState {
  if (cache) return cache;
  const f = fresh();
  try {
    const s = JSON.parse(localStorage.getItem(ONMAP_KEY) || '{}') as Partial<OnmapState>;
    cache = { ...f, ...s, settings: { ...f.settings, ...s.settings }, dailies: { ...s.dailies } };
  } catch { cache = f; }
  return cache!;
}
export function saveOnmap() { try { localStorage.setItem(ONMAP_KEY, JSON.stringify(onmapState())); } catch { /* private mode: kept for this visit */ } }
/** Forget everything (Settings → Reset progress); the choices stay. */
export function resetOnmap() { const s = onmapState().settings; cache = { ...fresh(), settings: s }; saveOnmap(); }
/** For a backup brought back from another device. */
export function reloadOnmap() { cache = null; }
