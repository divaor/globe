// Master the world (v0.34.0): when each country comes back. Spaced repetition: a country answered right comes back
// later (the next day, then in 3 days, then about 2.5 times as long each time), one missed comes back a few
// questions later and the same day. It counts as known when it was right on one day and as mastered when it was right
// on 3 different days. As it gets better known it is asked harder: picked from a list, then its dot tapped with no
// list, then (if the reader wants) its name typed. No browser code: scripts/test/master.mjs checks it with Node.

export type DeckId = 'capitals' | 'flags' | 'countries';
export const DECKS: DeckId[] = ['capitals', 'flags', 'countries'];
export type Level = 'new' | 'learning' | 'known' | 'mastered';
export type Step = 'pick' | 'tap' | 'type';
export type Order = 'balanced' | 'known' | 'people' | 'continent' | 'fixed' | 'random';
export const ORDERS: Order[] = ['balanced', 'known', 'people', 'continent', 'fixed', 'random'];

/** What is known of one country in one deck. */
export interface Card {
  /** Times asked, right and wrong. */
  seen: number; right: number; wrong: number;
  /** The days (2026-11-17) it was answered right, the last five. */
  days: string[];
  /** Days until it comes back, and the day it is due. */
  ivl: number; due: string;
  /** Times missed after it had been right. */
  lapses: number;
  mastered?: boolean;
  /** It was mastered, then missed: relearning it is a comeback. */
  forgot?: boolean;
}

/** The day after `day` plus n (local days, as dayKey writes them). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export const blank = (today: string): Card => ({ seen: 0, right: 0, wrong: 0, days: [], ivl: 0, due: today, lapses: 0 });

export function level(c?: Card): Level {
  if (!c || !c.seen) return 'new';
  if (c.mastered) return 'mastered';
  return c.days.length >= 1 ? 'known' : 'learning';
}

/**
 * An answer: the card as it is now, and whether it was just mastered, forgotten (a mastered one missed) or
 * relearned after it had been forgotten (a comeback).
 */
export function grade(was: Card | undefined, ok: boolean, today: string): { card: Card; mastered: boolean; forgot: boolean; comeback: boolean } {
  const c: Card = { ...(was ?? blank(today)), days: [...(was?.days ?? [])] };
  c.seen++;
  if (ok) {
    c.right++;
    const firstToday = !c.days.includes(today);
    if (firstToday) {
      c.days = [...c.days, today].slice(-5);
      // A missed card answered right again the same day comes back tomorrow; otherwise the interval grows.
      c.ivl = c.ivl <= 0 ? 1 : c.ivl === 1 ? 3 : Math.min(180, Math.round(c.ivl * 2.5));
    }
    c.due = addDays(today, Math.max(1, c.ivl));
    const nowMastered = c.days.length >= 3;
    const just = nowMastered && !c.mastered;
    const comeback = just && !!c.forgot;
    c.mastered = nowMastered;
    if (comeback) c.forgot = false;
    return { card: c, mastered: just, forgot: false, comeback };
  }
  c.wrong++;
  const forgot = !!c.mastered;
  if (c.right > 0) c.lapses++;
  // A miss takes back one day of credit (a mastered one keeps only one: it is learned again over two more days) and
  // brings it back today.
  c.days = forgot ? c.days.slice(0, 1) : c.days.slice(0, Math.max(0, c.days.length - 1));
  c.ivl = 0;
  c.due = today;
  if (forgot) { c.mastered = false; c.forgot = true; }
  return { card: c, mastered: false, forgot, comeback: false };
}

/** How it is asked now: picked from a list, then tapped (or picked among look-alikes), then typed. */
export function step(c: Card | undefined, typing: boolean): Step {
  const d = c?.days.length ?? 0;
  if (d >= 2 && typing) return 'type';
  return d >= 1 ? 'tap' : 'pick';
}

// ---- Orders: the order new countries are met in (spaced repetition then decides when each comes back)
export interface Orderable { id: string; name: string; ct: string; fame: number; pop: number }
const CONTINENTS = ['EU', 'AS', 'AF', 'NA', 'SA', 'OC'];

/** A small seeded random (mulberry32), for shuffles that can be repeated. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffle<T>(a: T[], r: () => number): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

export function ordered(list: Orderable[], how: Order, seed = 1): string[] {
  const byFame = list.slice().sort((a, b) => b.fame - a.fame);
  switch (how) {
    case 'known': return byFame.map((x) => x.id);
    case 'people': return list.slice().sort((a, b) => b.pop - a.pop).map((x) => x.id);
    case 'continent': return CONTINENTS.flatMap((ct) => byFame.filter((x) => x.ct === ct)).concat(byFame.filter((x) => !CONTINENTS.includes(x.ct))).map((x) => x.id);
    case 'fixed': return list.slice().sort((a, b) => a.name.localeCompare(b.name)).map((x) => x.id);
    case 'random': return shuffle(list.map((x) => x.id), rng(seed));
    default: {
      // Balanced: the best known first, with one of the lesser known every fourth.
      const half = Math.ceil(byFame.length / 2), top = byFame.slice(0, half), rest = byFame.slice(half), out: string[] = [];
      let i = 0, j = 0;
      while (i < top.length || j < rest.length) {
        for (let k = 0; k < 3 && i < top.length; k++) out.push(top[i++].id);
        if (j < rest.length) out.push(rest[j++].id);
      }
      return out;
    }
  }
}

// ---- Learn: the countries due today, then up to five new ones, fewer while many are still being learned
export function learnQueue(ids: string[], cards: Record<string, Card | undefined>, today: string, newMax = 5): { due: string[]; fresh: string[]; queue: string[] } {
  const rank = new Map(ids.map((id, i) => [id, i]));
  const due = ids.filter((id) => { const c = cards[id]; return !!c?.seen && c.due <= today; })
    .sort((a, b) => cards[a]!.due.localeCompare(cards[b]!.due) || rank.get(a)! - rank.get(b)!);
  const shaky = due.filter((id) => !cards[id]!.days.length).length;
  const room = shaky >= 8 ? 0 : shaky >= 4 ? Math.min(2, newMax) : newMax;
  const fresh = ids.filter((id) => !cards[id]?.seen).slice(0, room);
  // The new ones spread among the ones coming back, not all at the end.
  const queue: string[] = [];
  const gap = fresh.length ? Math.max(1, Math.floor(due.length / (fresh.length + 1))) : 0;
  let f = 0;
  due.forEach((id, i) => { queue.push(id); if (f < fresh.length && (i + 1) % gap === 0) queue.push(fresh[f++]); });
  while (f < fresh.length) queue.push(fresh[f++]);
  return { due, fresh, queue };
}

/** A country missed in a session comes back this many questions later. */
export const AGAIN = 3;
export function requeue(queue: string[], at: number, id: string): string[] {
  const q = queue.slice();
  q.splice(Math.min(q.length, at + 1 + AGAIN), 0, id);
  return q;
}

// ---- Run: three hearts, a combo, a power-up every 10 in a row
export type Power = 'half' | 'heart' | 'peek';
export const POWERS: Power[] = ['half', 'heart', 'peek'];
export interface Run { hearts: number; combo: number; best: number; score: number; asked: number; powers: Power[] }
export const newRun = (): Run => ({ hearts: 3, combo: 0, best: 0, score: 0, asked: 0, powers: [] });
/** The multiplier grows by one every five right in a row. */
export const multiplier = (combo: number) => 1 + Math.floor(combo / 5);
export function runAnswer(r: Run, ok: boolean, r01: () => number = Math.random): { run: Run; gained: number; power: Power | null; over: boolean } {
  const run = { ...r, powers: [...r.powers], asked: r.asked + 1 };
  if (!ok) { run.hearts--; run.combo = 0; return { run, gained: 0, power: null, over: run.hearts <= 0 }; }
  run.combo++;
  run.best = Math.max(run.best, run.combo);
  const gained = 10 * multiplier(run.combo);
  run.score += gained;
  let power: Power | null = null;
  if (run.combo % 10 === 0) { power = POWERS[Math.floor(r01() * POWERS.length)]; if (power === 'heart') run.hearts++; else run.powers.push(power); }
  return { run, gained, power, over: false };
}

// ---- Marathon: the whole deck in a fixed order, back to the start on a miss; ten right in a row (over the
// marathons) and a country is skipped
export const SKIP_AFTER = 10;
export function marathonList(ids: string[], inRow: Record<string, number>): string[] {
  return ids.filter((id) => (inRow[id] ?? 0) < SKIP_AFTER);
}
