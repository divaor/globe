// Border hop's routes (v0.24.0): the border graph (public/data/play/borders.json, built by
// scripts/data/play/build-borders.mjs), the best route for each goal, and the rounds to play. No browser code:
// scripts/test/play.mjs checks it with Node.
//
// Goals: the fewest countries crossed, the fewest people in them, the smallest area, or the shortest distance from
// capital to capital. The start and the target never count: only the countries in between (for the distance, the
// whole way from the start's capital to the target's). Knowledge rounds limit which countries a route may use:
// only Spanish-speaking ones, only those that drive on the left, none in NATO...

export interface BorderData {
  countries: Record<string, { pop: number; area: number; cap: [number, number] | null; ct: string }>;
  /** Land borders; a third item names the note that explains an odd one (an exclave). */
  land: [string, string, string?][];
  /** Borders made by an overseas region on another continent (French Guiana): off unless turned on. */
  overseas: [string, string, string][];
  /** Tunnels and bridges that count as borders. */
  links: [string, string, string][];
  groups: Record<string, string[]>;
  notes: Record<string, { en: string; es: string }>;
}

export type Goal = 'count' | 'people' | 'area' | 'km';
export const GOALS: Goal[] = ['count', 'people', 'area', 'km'];

/** A knowledge round: every country of the route must be in a group (`only`), or none may be (`avoid`). */
export interface Rule { id: string; icon: string; group: string; mode: 'only' | 'avoid'; en: string; es: string; desc: { en: string; es: string }; /** Why a country is refused ({c}: its name). */ no: { en: string; es: string } }
export const RULES: Rule[] = [
  { id: 'spa', icon: '🗣️', group: 'spa', mode: 'only', en: 'Only Spanish-speaking countries', es: 'Solo países de habla hispana', desc: { en: 'Every country on the way has Spanish as an official language.', es: 'Todos los países del camino tienen el español como lengua oficial.' }, no: { en: '{c} is not a Spanish-speaking country.', es: '{c} no es un país de habla hispana.' } },
  { id: 'ara', icon: '🗣️', group: 'ara', mode: 'only', en: 'Only Arabic-speaking countries', es: 'Solo países de habla árabe', desc: { en: 'Every country on the way has Arabic as an official language.', es: 'Todos los países del camino tienen el árabe como lengua oficial.' }, no: { en: '{c} is not an Arabic-speaking country.', es: '{c} no es un país de habla árabe.' } },
  { id: 'fra', icon: '🗣️', group: 'fra', mode: 'only', en: 'Only French-speaking countries', es: 'Solo países francófonos', desc: { en: 'Every country on the way has French as an official language.', es: 'Todos los países del camino tienen el francés como lengua oficial.' }, no: { en: '{c} is not a French-speaking country.', es: '{c} no es un país francófono.' } },
  { id: 'rus', icon: '🗣️', group: 'rus', mode: 'only', en: 'Only Russian-speaking countries', es: 'Solo países de habla rusa', desc: { en: 'Every country on the way has Russian as an official language.', es: 'Todos los países del camino tienen el ruso como lengua oficial.' }, no: { en: '{c} is not a Russian-speaking country.', es: '{c} no es un país de habla rusa.' } },
  { id: 'left', icon: '🚗', group: 'left', mode: 'only', en: 'Drive on the left', es: 'Por la izquierda', desc: { en: 'Every country on the way drives on the left.', es: 'En todos los países del camino se circula por la izquierda.' }, no: { en: 'In {c} they drive on the right.', es: 'En {c} se circula por la derecha.' } },
  { id: 'olympics', icon: '🏅', group: 'olympics', mode: 'only', en: 'Olympic hosts', es: 'Sedes olímpicas', desc: { en: 'Every country on the way has hosted the Olympic Games.', es: 'Todos los países del camino han organizado unos Juegos Olímpicos.' }, no: { en: '{c} has never hosted the Olympic Games.', es: '{c} nunca ha organizado unos Juegos Olímpicos.' } },
  { id: 'nonato', icon: '🚫', group: 'nato', mode: 'avoid', en: 'Avoid NATO', es: 'Sin la OTAN', desc: { en: 'No country on the way is a member of NATO.', es: 'Ningún país del camino es miembro de la OTAN.' }, no: { en: '{c} is a member of NATO.', es: '{c} es miembro de la OTAN.' } },
  { id: 'noeu', icon: '🚫', group: 'eu', mode: 'avoid', en: 'Avoid the EU', es: 'Sin la UE', desc: { en: 'No country on the way is a member of the European Union.', es: 'Ningún país del camino es miembro de la Unión Europea.' }, no: { en: '{c} is a member of the European Union.', es: '{c} es miembro de la Unión Europea.' } },
];

export interface Options { overseas?: boolean }

/** Great-circle distance in km. */
export function km(a: [number, number], b: [number, number]): number {
  const r = Math.PI / 180;
  const s = Math.sin(((b[1] - a[1]) * r) / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}

export class Borders {
  readonly adj = new Map<string, Map<string, string | undefined>>();
  constructor(readonly data: BorderData, readonly opts: Options = {}) {
    const add = (a: string, b: string, note?: string) => {
      if (!data.countries[a] || !data.countries[b]) return;
      for (const [x, y] of [[a, b], [b, a]]) {
        if (!this.adj.has(x)) this.adj.set(x, new Map());
        this.adj.get(x)!.set(y, note);
      }
    };
    for (const [a, b, n] of data.land) add(a, b, n);
    for (const [a, b, n] of data.links) add(a, b, n);
    if (opts.overseas) for (const [a, b, n] of data.overseas) add(a, b, n);
  }

  neighbours(id: string): string[] { return [...(this.adj.get(id)?.keys() ?? [])]; }
  borders(a: string, b: string): boolean { return !!this.adj.get(a)?.has(b); }
  /** The note that explains a border (Kaliningrad, the Channel Tunnel...), if it needs one. */
  note(a: string, b: string): string | undefined { return this.adj.get(a)?.get(b); }

  /** May a route of this round use the country? */
  allowed(rule: Rule | null, id: string): boolean {
    if (!rule) return true;
    const inGroup = this.data.groups[rule.group]?.includes(id) ?? false;
    return rule.mode === 'only' ? inGroup : !inGroup;
  }

  /** What entering a country costs (the target costs nothing: only the countries in between count). */
  private nodeCost(goal: Goal, id: string): number {
    const c = this.data.countries[id];
    return goal === 'count' ? 1 : goal === 'people' ? c.pop : goal === 'area' ? c.area : 0;
  }
  private stepKm(a: string, b: string): number {
    const p = this.data.countries[a].cap, q = this.data.countries[b].cap;
    return p && q ? km(p, q) : 0;
  }

  /** A route's cost for a goal. */
  cost(path: string[], goal: Goal): number {
    if (goal === 'km') { let s = 0; for (let i = 1; i < path.length; i++) s += this.stepKm(path[i - 1], path[i]); return s; }
    let s = 0;
    for (let i = 1; i < path.length - 1; i++) s += this.nodeCost(goal, path[i]);
    return s;
  }

  /** The best route from `a` to `b` for a goal (Dijkstra), within a round's rule; null when there is none. */
  best(a: string, b: string, goal: Goal, rule: Rule | null = null): { path: string[]; cost: number } | null {
    if (!this.allowed(rule, a) || !this.allowed(rule, b)) return null;
    const dist = new Map<string, number>([[a, 0]]);
    const hops = new Map<string, number>([[a, 0]]);
    const prev = new Map<string, string>();
    const done = new Set<string>();
    // A small binary heap of [cost, hops, id]: ties go to the route with fewer countries.
    const heap: [number, number, string][] = [[0, 0, a]];
    const push = (x: [number, number, string]) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (cmp(heap[p], heap[i]) <= 0) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && cmp(heap[l], heap[m]) < 0) m = l; if (r < heap.length && cmp(heap[r], heap[m]) < 0) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const cmp = (x: [number, number, string], y: [number, number, string]) => x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0);
    while (heap.length) {
      const [d, n, u] = pop();
      if (done.has(u)) continue;
      done.add(u);
      if (u === b) break;
      for (const v of this.neighbours(u)) {
        if (done.has(v) || !this.allowed(rule, v)) continue;
        const nd = d + (goal === 'km' ? this.stepKm(u, v) : v === b ? 0 : this.nodeCost(goal, v));
        const old = dist.get(v);
        if (old === undefined || nd < old - 1e-9 || (Math.abs(nd - old) < 1e-9 && n + 1 < (hops.get(v) ?? Infinity))) {
          dist.set(v, nd); hops.set(v, n + 1); prev.set(v, u); push([nd, n + 1, v]);
        }
      }
    }
    if (!done.has(b)) return null;
    const path = [b];
    while (path[0] !== a) path.unshift(prev.get(path[0])!);
    return { path, cost: dist.get(b)! };
  }

  /** The countries reachable from `a` within a rule (its connected part of the map). */
  reach(a: string, rule: Rule | null = null): Set<string> {
    const seen = new Set([a]);
    const todo = [a];
    while (todo.length) for (const v of this.neighbours(todo.pop()!)) if (!seen.has(v) && this.allowed(rule, v)) { seen.add(v); todo.push(v); }
    return seen;
  }
}

// ---- Rounds -------------------------------------------------------------------------------------------------------

export type Level = 'easy' | 'medium' | 'hard';
/** How many countries in between the shortest route has, for each level. */
const SPAN: Record<Level, [number, number]> = { easy: [2, 3], medium: [4, 6], hard: [7, 14] };

export interface Round { from: string; to: string; goal: Goal; rule: string | null; overseas: boolean }

/** A seeded random number generator (the same rounds on every device for a seed). */
export function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Countries big enough to start from (not microstates or tiny territories), with a capital. */
function playable(g: Borders, id: string): boolean {
  const c = g.data.countries[id];
  return !!c && !!c.cap && c.area >= 2000 && g.neighbours(id).length > 0;
}

/**
 * A round: a start and a target whose fewest-countries route has as many countries in between as the level asks,
 * on one continent (or anywhere) and within a knowledge rule. For people, area and distance the route that wins
 * must differ from the fewest-countries one when it can, so the goal matters.
 */
export function makeRound(g: Borders, rand: () => number, o: { goal: Goal; level: Level; continent?: string; rule?: Rule | null }): Round | null {
  const rule = o.rule ?? null;
  const [lo, hi] = rule ? [2, 9] : SPAN[o.level];
  const pool = Object.keys(g.data.countries).filter((id) => playable(g, id) && g.allowed(rule, id) && (!o.continent || g.data.countries[id].ct === o.continent)).sort();
  // An easy round stays on one continent (Russia and China make far countries close: Laos is two from Belarus).
  const sameContinent = o.level === 'easy' && !rule;
  for (let tries = 0; tries < 400 && pool.length > 1; tries++) {
    const from = pool[Math.floor(rand() * pool.length)], to = pool[Math.floor(rand() * pool.length)];
    if (from === to || (sameContinent && g.data.countries[from].ct !== g.data.countries[to].ct)) continue;
    const fewest = g.best(from, to, 'count', rule);
    if (!fewest) continue;
    const n = fewest.path.length - 2;
    if (n < lo || n > hi) continue;
    if (o.goal !== 'count' && tries < 300) {
      const b = g.best(from, to, o.goal, rule);
      if (!b || b.path.join() === fewest.path.join()) continue;
    }
    return { from, to, goal: o.goal, rule: rule?.id ?? null, overseas: !!g.opts.overseas };
  }
  return null;
}

/** The daily route: the same for everyone on a day. Its goal turns with the days; every third day is a knowledge round. */
export function dailyRound(g: Borders, day: string, n: number): Round | null {
  const rand = seeded(`hop:${day}`);
  const rule = n % 3 === 0 ? RULES[Math.floor(n / 3) % RULES.length] : null;
  const goal: Goal = rule ? 'count' : GOALS[n % GOALS.length];
  return makeRound(g, rand, { goal, level: 'medium', rule }) ?? makeRound(g, rand, { goal, level: 'medium' });
}
