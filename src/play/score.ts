// The map games' scoring (v0.24.0), the same for every game: par is the best result the app can find; a result
// scores 1,000 × par ÷ yours (so the best scores 1,000); stars say how close you came on your own; hints cost
// points and stars. No browser code: scripts/test/play.mjs checks it with Node.

export type Hint = 'names' | 'filter' | 'step';
/** What each hint costs. */
export const HINT_COST: Record<Hint, number> = { names: 150, filter: 200, step: 300 };

/**
 * A result against par. `count`: a goal counted in whole things (countries), where one more than par still earns
 * two stars; otherwise two stars need 15 % of par. A smaller result is better.
 */
export function scoreOf(par: number, yours: number, hints: Hint[] = [], count = false): { score: number; stars: 1 | 2 | 3; base: number } {
  const base = yours <= par + 1e-9 ? 1000 : par <= 0 ? Math.round(1000 / (1 + yours)) : Math.round((1000 * par) / yours);
  const found: 1 | 2 | 3 = yours <= par + 1e-9 ? 3 : (count ? yours <= par + 1 : yours <= par * 1.15) ? 2 : 1;
  // Stars are for finding the route yourself: the names or the map leave at most two, the next step one.
  const cap = hints.includes('step') ? 1 : hints.length ? 2 : 3;
  const stars = Math.min(found, cap) as 1 | 2 | 3;
  const cost = hints.reduce((s, h) => s + HINT_COST[h], 0);
  return { score: Math.max(0, base - cost), stars, base };
}

export const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

/** A round as a link: the same round for a friend, with the score to beat (no names, nothing personal). */
export interface Challenge { from: string; to: string; goal: string; rule: string | null; overseas: boolean; beat?: number }
export function challengeHash(c: Challenge): string {
  const p = new URLSearchParams({ hop: `${c.from}-${c.to}`, goal: c.goal });
  if (c.rule) p.set('rule', c.rule);
  if (c.overseas) p.set('overseas', '1');
  if (c.beat !== undefined) p.set('beat', String(c.beat));
  return p.toString();
}
export function readChallenge(hash: string): Challenge | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const m = /^([A-Z]{3})-([A-Z]{3})$/.exec(p.get('hop') ?? '');
  if (!m) return null;
  const goal = p.get('goal') ?? 'count';
  if (!['count', 'people', 'area', 'km'].includes(goal)) return null;
  const beat = p.get('beat');
  return { from: m[1], to: m[2], goal, rule: p.get('rule'), overseas: p.get('overseas') === '1', beat: beat !== null && /^\d{1,4}$/.test(beat) ? Number(beat) : undefined };
}

/** Days since the first daily route (14 November 2026 is #1). */
const FIRST = Date.UTC(2026, 10, 14);
export const hopNumber = (day: string) => { const [y, m, d] = day.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - FIRST) / 864e5) + 1; };
