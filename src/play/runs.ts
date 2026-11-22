// Today's puzzles as far as they went (v0.43.3). Each daily game keeps its round after every answer, so leaving the
// app mid-way and opening the puzzle again goes on where it was: starting again let a wrong answer be redone. One run
// per game; a run of another day is dropped. (Today's challenge keeps its own, src/learn/learn.ts.)
const KEY = 'atlas-globe:runs';
type Runs = Record<string, { day: string; v: unknown }>;

function read(): Runs {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Runs; } catch { return {}; }
}
function write(r: Runs) {
  try { if (Object.keys(r).length) localStorage.setItem(KEY, JSON.stringify(r)); else localStorage.removeItem(KEY); } catch { /* private mode: not kept */ }
}

/** Keeps a daily game's round as it is now. */
export function saveRun(game: string, day: string, v: unknown) {
  const r = read();
  for (const k of Object.keys(r)) if (r[k].day !== day) delete r[k];
  r[game] = { day, v };
  write(r);
}
/** The round of today's puzzle left mid-way, if any. */
export function loadRun<T>(game: string, day: string): T | null {
  const x = read()[game];
  return x && x.day === day ? (x.v as T) : null;
}
/** The puzzle is over (its result is kept with the game's own). */
export function endRun(game: string) {
  const r = read();
  if (!(game in r)) return;
  delete r[game];
  write(r);
}
