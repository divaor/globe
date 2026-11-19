// Master the world (v0.34.0): what the reader knows, kept on this device (and in the backup of v0.31.2): each
// deck's cards, today's questions toward the daily goal, the days the goal was reached, the best runs, the
// marathons' records, the look-alike flags told apart, the comebacks, and the settings.
import type { Card, DeckId, Order } from './srs';
import type { Scope } from './decks';

export const MASTER_KEY = 'atlas-globe:master';
export type Speed = 'fast' | 'normal' | 'slow';
export const GOAL = 20;

export interface MasterState {
  cards: Record<DeckId, Record<string, Card>>;
  /** Questions answered today (all modes), toward the daily goal. */
  goal: { day: string; n: number };
  /** The days the daily goal was reached in a row. */
  days: { last: string; streak: number; best: number };
  runs: Record<DeckId, { best: number; combo: number }>;
  marathon: Record<DeckId, { record: number; inRow: Record<string, number>; won?: number }>;
  /** Look-alike flags told apart (the right flag picked with its look-alike among the options): "ROU|TCD". */
  pairs: string[];
  comebacks: number;
  settings: { deck: DeckId; scope: Scope; order: Order; speed: Speed; typing: boolean; territories: boolean; sound: boolean;
    /** The State capitals deck's country (v0.38.1), or 'all' for the twelve. */
    sscope: string };
}

const fresh = (): MasterState => ({
  cards: { capitals: {}, flags: {}, countries: {}, states: {}, outlines: {}, cities: {}, landmarks: {}, nature: {} },
  goal: { day: '', n: 0 },
  days: { last: '', streak: 0, best: 0 },
  runs: { capitals: { best: 0, combo: 0 }, flags: { best: 0, combo: 0 }, countries: { best: 0, combo: 0 }, states: { best: 0, combo: 0 }, outlines: { best: 0, combo: 0 }, cities: { best: 0, combo: 0 }, landmarks: { best: 0, combo: 0 }, nature: { best: 0, combo: 0 } },
  marathon: { capitals: { record: 0, inRow: {} }, flags: { record: 0, inRow: {} }, countries: { record: 0, inRow: {} }, states: { record: 0, inRow: {} }, outlines: { record: 0, inRow: {} }, cities: { record: 0, inRow: {} }, landmarks: { record: 0, inRow: {} }, nature: { record: 0, inRow: {} } },
  pairs: [],
  comebacks: 0,
  settings: { deck: 'capitals', scope: 'world', order: 'balanced', speed: 'normal', typing: false, territories: false, sound: true, sscope: 'MEX' },
});

let cache: MasterState | null = null;
export function master(): MasterState {
  if (cache) return cache;
  const f = fresh();
  try {
    const s = JSON.parse(localStorage.getItem(MASTER_KEY) || '{}') as Partial<MasterState>;
    cache = { ...f, ...s, cards: { ...f.cards, ...s.cards }, runs: { ...f.runs, ...s.runs }, marathon: { ...f.marathon, ...s.marathon }, settings: { ...f.settings, ...s.settings } };
  } catch { cache = f; }
  return cache!;
}
export function saveMaster() { try { localStorage.setItem(MASTER_KEY, JSON.stringify(master())); } catch { /* private mode: kept for this visit */ } }
/** Forget everything (Settings → Reset progress); the settings stay. */
export function resetMaster() { const s = master().settings; cache = { ...fresh(), settings: s }; saveMaster(); }
/** For a backup brought back from another device (v0.31.2). */
export function reloadMaster() { cache = null; }
