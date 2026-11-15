// Crowded markers (v0.28.0). Where a filter's dots sit on top of each other (two museums in one building, a city's
// museums seen from far), no tap can reach each of them. Once the map is close they move apart, each with a thin
// line to a small dot at its true place, and a tap goes to the marker as it is drawn.
// - `settle` lays a filter's markers out: each takes the free spot nearest its place, the best known first, so
//   those stay where they belong; a small pile opens into a ring round its places, with the lines in the middle.
// - `Crowd` keeps a filter's layout from frame to frame: while the map is only dragged no marker changes its
//   spot beside its place, and the layout is worked out again when the zoom changes.
// - `spread` is the layout Time travel's stories use for their markers (modes/stories.ts).
import type { LayerInstance, RenderCtx } from './types';
import type { Box, LabelSpec } from '../engine/labels';

/** A marker on the screen: where it is drawn (x, y), where it belongs (ax, ay), its radius, and its weight. */
export interface Spot { k: number; x: number; y: number; ax: number; ay: number; r: number; wt: number }

/**
 * Moves overlapping markers apart until every pair is at least their radii plus `gap` apart; a
 * heavier marker (wt) moves less. Markers on the very same spot fan out in fixed directions, so
 * the layout is the same from frame to frame.
 */
export function spread(pts: Spot[], gap: number) {
  const n = pts.length;
  if (n < 2) return;
  let big = 0;
  for (const p of pts) if (p.r > big) big = p.r;
  const cell = 2 * big + gap;
  // The markers of each cell of a grid, as lists threaded through `next` (a cell's markers in the order of the list).
  const next = new Int32Array(n), gxs = new Int32Array(n), gys = new Int32Array(n);
  let head = new Int32Array(64);
  for (let iter = 0; iter < 60; iter++) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const gx = (gxs[i] = Math.floor(pts[i].x / cell)), gy = (gys[i] = Math.floor(pts[i].y / cell));
      if (gx < x0) x0 = gx; if (gx > x1) x1 = gx; if (gy < y0) y0 = gy; if (gy > y1) y1 = gy;
    }
    const cols = x1 - x0 + 1, rows = y1 - y0 + 1;
    if (!(cols * rows <= 4e6)) return; // (a marker has gone astray: nothing sensible to lay out)
    if (head.length < cols * rows) head = new Int32Array(cols * rows);
    head.fill(-1, 0, cols * rows);
    for (let i = n - 1; i >= 0; i--) { const c = gxs[i] - x0 + (gys[i] - y0) * cols; next[i] = head[c]; head[c] = i; }
    let moved = false;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const gx = Math.floor(a.x / cell) - x0, gy = Math.floor(a.y / cell) - y0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const cx = gx + dx, cy = gy + dy;
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
        for (let j = head[cx + cy * cols]; j >= 0; j = next[j]) {
          if (j <= i) continue;
          const b = pts[j];
          const need = a.r + b.r + gap;
          let ux = b.x - a.x, uy = b.y - a.y;
          const d = Math.hypot(ux, uy);
          if (d >= need) continue;
          if (d < 0.01) { const t = (i * 0.618 + j * 0.382) * Math.PI * 2; ux = Math.cos(t); uy = Math.sin(t); } else { ux /= d; uy /= d; }
          const push = need - d, fa = b.wt / (a.wt + b.wt), fb = 1 - fa;
          a.x -= ux * push * fa; a.y -= uy * push * fa;
          b.x += ux * push * fb; b.y += uy * push * fb;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}

/** The colour of the lines from moved markers to their places. */
export const leaderInk = (dark: boolean) => (dark ? 'rgba(232,238,247,0.8)' : 'rgba(28,34,46,0.62)');

/**
 * A thin line from a marker (of radius r, drawn at x, y) to a small dot at its true place (ax, ay); with `edge`, the
 * line has an edge of that colour, to show on any map.
 */
export function leader(ctx: CanvasRenderingContext2D, ax: number, ay: number, x: number, y: number, r: number, ink: string, dot: string, edge?: string) {
  const dx = x - ax, dy = y - ay, d = Math.hypot(dx, dy) || 1;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(x - (dx / d) * r, y - (dy / d) * r);
  if (edge) { ctx.lineWidth = 3.4; ctx.strokeStyle = edge; ctx.stroke(); }
  ctx.lineWidth = 1.4; ctx.strokeStyle = ink; ctx.stroke();
  ctx.beginPath(); ctx.arc(ax, ay, 2.8, 0, Math.PI * 2);
  ctx.fillStyle = dot; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.stroke();
}

/** A marker to settle: where it belongs (ax, ay), its radius and weight, and a number of its own that never changes. */
export interface Mark {
  ax: number; ay: number; r: number; wt: number; id: number;
  /** Where it goes (out). A marker that is `kept` comes in with its spot, and stays there. */
  x: number; y: number; kept?: boolean;
  /** How many markers are in its pile: those that overlap at their true places, one through another (out). */
  pile?: number;
}

/** A pile of up to this many markers opens like a flower round its places, so the lines to them show. */
const RING = 12;
/** In such a pile, a marker's edge keeps this far (and the gap) from the other markers' places. */
const CLEAR = 5;

/**
 * Lays out markers that overlap, every pair at least `gap` apart.
 * - A small pile's markers push each other apart, the heavier giving way less, and keep off each other's true
 *   places: markers that only just touch move a little, and a pile on one spot opens like a flower, with the
 *   lines to the places in the middle.
 * - In a big pile (a city centre's buildings) each marker takes the free spot nearest its place, the heaviest
 *   first: the best known stay where they belong and the others gather round them.
 * Markers that are `kept` do not move: the others find their spots round them. The answer depends on how the
 * markers lie to each other, not on where on the screen they are.
 */
export function settle(ms: Mark[], gap: number) {
  const n = ms.length;
  if (!n) return;
  let big = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const span = (x: number, y: number) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  for (const m of ms) {
    if (m.r > big) big = m.r;
    span(m.ax, m.ay);
    if (m.kept) span(m.x, m.y);
  }
  const cell = 2 * big + gap, REACH = 600;
  // A grid over everywhere a marker can go: its place, and up to REACH from it.
  const gx0 = Math.floor((x0 - REACH) / cell) - 1, gy0 = Math.floor((y0 - REACH) / cell) - 1;
  const cols = Math.floor((x1 + REACH) / cell) + 2 - gx0, rows = Math.floor((y1 + REACH) / cell) + 2 - gy0;
  if (!(cols * rows <= 4e6)) { for (const m of ms) { if (!m.kept) { m.x = m.ax; m.y = m.ay; } m.pile = 1; } return; }
  const head = new Int32Array(cols * rows).fill(-1), next = new Int32Array(n);
  const cellOf = (x: number, y: number) => Math.floor(x / cell) - gx0 + (Math.floor(y / cell) - gy0) * cols;

  // ---- the piles, at the true places
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let i = 0; i < n; i++) { const c = cellOf(ms[i].ax, ms[i].ay); next[i] = head[c]; head[c] = i; }
  for (let i = 0; i < n; i++) {
    const a = ms[i], c = cellOf(a.ax, a.ay);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (let j = head[c + dx + dy * cols]; j >= 0; j = next[j]) {
        if (j <= i) continue;
        const b = ms[j], need = a.r + b.r + gap, ux = b.ax - a.ax, uy = b.ay - a.ay;
        if (ux * ux + uy * uy < need * need) parent[find(i)] = find(j);
      }
    }
  }
  const size = new Int32Array(n), rank = new Int32Array(n);
  for (const i of ms.map((_, k) => k).sort((a, b) => ms[a].id - ms[b].id)) rank[i] = size[find(i)]++;
  for (let i = 0; i < n; i++) ms[i].pile = size[find(i)];

  // ---- markers of a small pile whose places are as good as one spot: set in a ring round it
  const soft = (i: number) => !ms[i].kept && ms[i].pile! <= RING;
  const ringAt = new Map<number, [number, number]>();
  {
    const piles = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      if (ms[i].pile! < 2 || ms[i].pile! > RING) continue;
      const r = find(i), l = piles.get(r);
      if (l) l.push(i); else piles.set(r, [i]);
    }
    for (const l of piles.values()) {
      if (l.some((q) => ms[q].kept)) continue;
      // Within the pile, the markers that would cover each other's places, one through another.
      const group = l.map((_, k) => k);
      const top = (k: number): number => { while (group[k] !== k) k = group[k]; return k; };
      for (let a = 0; a < l.length; a++) for (let b = a + 1; b < l.length; b++) {
        const A = ms[l[a]], B = ms[l[b]];
        if (Math.hypot(A.ax - B.ax, A.ay - B.ay) < Math.max(A.r, B.r) + 3) group[top(a)] = top(b);
      }
      const sets = new Map<number, number[]>();
      l.forEach((q, k) => { const t = top(k), g = sets.get(t); if (g) g.push(q); else sets.set(t, [q]); });
      for (const g of sets.values()) if (g.length > 1) ringOf(g);
    }
  }
  /**
   * A ring: the markers set round the middle of their places, each on the side its place is on, as close in as
   * lets every pair be apart and every place show beside every marker. Not for places that are spread out.
   */
  function ringOf(g: number[]) {
    let cx = 0, cy = 0, far = 0, bigR = 0, sum = 0;
    for (const q of g) { cx += ms[q].ax; cy += ms[q].ay; }
    cx /= g.length; cy /= g.length;
    for (const q of g) { far = Math.max(far, Math.hypot(ms[q].ax - cx, ms[q].ay - cy)); bigR = Math.max(bigR, ms[q].r); sum += 2 * ms[q].r + gap; }
    if (far > bigR) return;
    // Each marker's side: where its place lies from the middle; those in the very middle go round the clock.
    const mid = g.filter((q) => Math.hypot(ms[q].ax - cx, ms[q].ay - cy) <= 0.5).sort((a, b) => ms[a].id - ms[b].id);
    const side = new Map<number, number>();
    for (const q of g) {
      const k = mid.indexOf(q);
      side.set(q, k >= 0 ? -Math.PI / 2 + (k / mid.length) * Math.PI * 2 : Math.atan2(ms[q].ay - cy, ms[q].ax - cx));
    }
    const order = g.slice().sort((a, b) => side.get(a)! - side.get(b)! || ms[a].id - ms[b].id);
    // Round the ring each takes room for its width; the ring is then turned so that the markers are, as a whole,
    // on the sides they belong.
    const at: number[] = [];
    let run = 0, sx = 0, sy = 0;
    for (const q of order) {
      const w = ((2 * ms[q].r + gap) / sum) * Math.PI * 2;
      at.push(run + w / 2); run += w;
      const d = side.get(q)! - at[at.length - 1];
      sx += Math.cos(d); sy += Math.sin(d);
    }
    const turn = Math.atan2(sy, sx);
    // How big the ring has to be: for every pair to be apart, and for every place to show beside every marker.
    let rho = bigR + CLEAR + gap + far;
    for (let a = 0; a < order.length; a++) for (let b = a + 1; b < order.length; b++) {
      const half = Math.abs(Math.sin((at[b] - at[a]) / 2));
      if (half > 1e-6) rho = Math.max(rho, (ms[order[a]].r + ms[order[b]].r + gap) / (2 * half));
    }
    rho += 0.01;
    order.forEach((q, k) => ringAt.set(q, [cx + Math.cos(at[k] + turn) * rho, cy + Math.sin(at[k] + turn) * rho]));
  }

  // ---- the other markers of small piles (and the markers on their own): pushed apart
  // The bodies: every marker but those of big piles (those kept, and those set in rings, do not move), and the
  // true place of each marker of a small pile, which the pile's other markers keep off.
  const N: number[] = [], PX: number[] = [], PY: number[] = [], PR: number[] = [], PW: number[] = [], PID: number[] = [], OWN: number[] = [], MOVES: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const m = ms[i];
    if (!soft(i) && !m.kept) continue;
    const set = ringAt.get(i);
    // (A pile's markers start a hair off their places, each its own way round the clock: pushed straight from
    // one spot they would all end in a row.)
    const t = -Math.PI / 2 + (rank[i] / m.pile!) * Math.PI * 2, e = soft(i) && m.pile! > 1 ? 0.5 : 0;
    N.push(i); PX.push(m.kept ? m.x : set ? set[0] : m.ax + Math.cos(t) * e); PY.push(m.kept ? m.y : set ? set[1] : m.ay + Math.sin(t) * e);
    PR.push(m.r); PW.push(m.wt); PID.push(m.id); OWN.push(-1); MOVES.push(soft(i) && !set);
  }
  const bodies = N.length;
  for (let k = 0; k < bodies; k++) {
    const m = ms[N[k]];
    if (m.pile! > 1 && m.pile! <= RING) { N.push(-1); PX.push(m.ax); PY.push(m.ay); PR.push(CLEAR); PW.push(1); PID.push(m.id + 0.5); OWN.push(k); MOVES.push(false); }
  }
  // Which pairs can ever meet (their places near enough), in an order that does not depend on the screen.
  const SLACK = 80;
  const pairs: number[] = [];
  if (N.length <= 900) {
    for (let a = 0; a < N.length; a++) for (let b = a + 1; b < N.length; b++) {
      if ((!MOVES[a] && !MOVES[b]) || OWN[b] === a || OWN[a] === b) continue;
      const need = PR[a] + PR[b] + gap + SLACK, ux = PX[b] - PX[a], uy = PY[b] - PY[a];
      if (ux * ux + uy * uy < need * need) pairs.push(a, b);
    }
    // (A marker caught between two places it must keep off can go to and fro for ever: forty rounds, no more.)
    for (let iter = 0; iter < 40; iter++) {
      let most = 0;
      for (let p = 0; p < pairs.length; p += 2) {
        const a = pairs[p], b = pairs[p + 1];
        const need = PR[a] + PR[b] + gap;
        let ux = PX[b] - PX[a], uy = PY[b] - PY[a];
        const d2 = ux * ux + uy * uy;
        if (d2 >= need * need) continue;
        const d = Math.sqrt(d2);
        if (d < 0.01) { const t = (PID[a] * 0.618 + PID[b] * 0.382) * Math.PI * 2; ux = Math.cos(t); uy = Math.sin(t); } else { ux /= d; uy /= d; }
        const push = need - d, fa = !MOVES[a] ? 0 : !MOVES[b] ? 1 : PW[b] / (PW[a] + PW[b]), fb = 1 - fa;
        PX[a] -= ux * push * fa; PY[a] -= uy * push * fa;
        PX[b] += ux * push * fb; PY[b] += uy * push * fb;
        if (push > most) most = push;
      }
      // (Near enough: the placing below sees to what is left.)
      if (most < 0.05) break;
    }
  }

  // ---- the markers as they are placed, the heaviest first
  head.fill(-1);
  const X = new Float64Array(n), Y = new Float64Array(n);
  const put = (i: number, x: number, y: number) => { X[i] = x; Y[i] = y; ms[i].x = x; ms[i].y = y; const c = cellOf(x, y); next[i] = head[c]; head[c] = i; };
  const RR = new Float64Array(n);
  for (let i = 0; i < n; i++) RR[i] = ms[i].r;
  /** Would this marker, at (x, y), overlap a marker already placed? (The one in the way last time is asked first.) */
  let inWay = -1;
  const hits = (i: number, x: number, y: number): boolean => {
    const r = RR[i];
    if (inWay >= 0) { const need = r + RR[inWay] + gap, ux = X[inWay] - x, uy = Y[inWay] - y; if (ux * ux + uy * uy < need * need) return true; }
    const c = cellOf(x, y);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (let j = head[c + dx + dy * cols]; j >= 0; j = next[j]) {
        const need = r + RR[j] + gap, ux = X[j] - x, uy = Y[j] - y;
        if (ux * ux + uy * uy < need * need) { inWay = j; return true; }
      }
    }
    return false;
  };
  // How far the last marker looked for from about a spot had to go: nothing nearer is free for one as big (spots
  // only fill up), so the next one from about there need not look nearer. One note for each 16 px square.
  const notes = new Map<number, [number, number, number, number]>();
  const noteKey = (x: number, y: number) => Math.floor(x / 16) * 100003 + Math.floor(y / 16);
  /** The free spot nearest (hx, hy): there, or as near as can be on the side away from the marker most in the way. */
  const place = (i: number, hx: number, hy: number) => {
    if (!hits(i, hx, hy)) { put(i, hx, hy); return; }
    const r = ms[i].r, note = notes.get(noteKey(hx, hy));
    const skip = note && r >= note[3] ? note[2] - Math.hypot(hx - note[0], hy - note[1]) : 0;
    let vx = 0, vy = 0, bd = Infinity;
    const c = cellOf(hx, hy);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (let j = head[c + dx + dy * cols]; j >= 0; j = next[j]) {
        const ux = hx - X[j], uy = hy - Y[j], d = ux * ux + uy * uy;
        if (d < bd) { bd = d; vx = ux; vy = uy; }
      }
    }
    // (Markers on the very same spot go round the clock, each its own way.)
    const t0 = vx * vx + vy * vy > 0.25 ? Math.atan2(vy, vx) : ms[i].id * 2.399963;
    let fx = hx, fy = hy, last = 0;
    const c0 = Math.cos(t0), s0 = Math.sin(t0);
    search: for (let rho = 2; rho <= REACH - 100; last = rho, rho += Math.max(2, rho * 0.1)) {
      if (rho < skip) continue;
      const count = Math.max(8, Math.min(64, Math.ceil((2 * Math.PI * rho) / 3))), turns = turnsOf(count);
      for (let k = 0; k < count; k++) {
        // (straight ahead first, then a step to one side, a step to the other, two steps…)
        const ca = turns[2 * k], sa = turns[2 * k + 1];
        const ux = c0 * ca - s0 * sa, uy = s0 * ca + c0 * sa;
        if (hits(i, hx + ux * rho, hy + uy * rho)) continue;
        // As near as it can be along that line.
        let lo = last, hi = rho;
        for (let b = 0; b < 5; b++) { const mid = (lo + hi) / 2; if (hits(i, hx + ux * mid, hy + uy * mid)) lo = mid; else hi = mid; }
        fx = hx + ux * hi; fy = hy + uy * hi;
        // (Everything nearer than the ring before this one was taken.)
        if (!note || r <= note[3]) notes.set(noteKey(hx, hy), [hx, hy, last, r]);
        break search;
      }
    }
    put(i, fx, fy);
  };
  for (let i = 0; i < n; i++) if (ms[i].kept) put(i, ms[i].x, ms[i].y);
  const order = (list: number[]) => list.sort((a, b) => ms[b].wt - ms[a].wt || ms[a].id - ms[b].id);
  // The markers set in rings and pushed apart go where that left them (or, should one still overlap, as near as it can).
  const where = new Map<number, number>();
  for (let k = 0; k < bodies; k++) if (!ms[N[k]].kept) where.set(N[k], k);
  const pushed = order([...where.keys()]);
  for (const i of pushed) { const k = where.get(i)!; place(i, PX[k], PY[k]); }
  // Those of big piles then take the free spots nearest their places.
  const rest: number[] = [];
  for (let i = 0; i < n; i++) if (!ms[i].kept && !where.has(i)) rest.push(i);
  for (const i of order(rest)) place(i, ms[i].ax, ms[i].ay);
}

/** The directions a marker looks in round a ring of `count` steps, as cosine and sine: ahead, a step left, a step right, two… */
const TURNS = new Map<number, Float64Array>();
function turnsOf(count: number): Float64Array {
  let t = TURNS.get(count);
  if (!t) {
    t = new Float64Array(count * 2);
    for (let k = 0; k < count; k++) { const a = ((k === 0 ? 0 : k % 2 ? (k + 1) / 2 : -k / 2) * 2 * Math.PI) / count; t[2 * k] = Math.cos(a); t[2 * k + 1] = Math.sin(a); }
    TURNS.set(count, t);
  }
  return t;
}

/** A filter's marker as a frame draws it: at (x, y); it belongs at (ax, ay). `box`: it is one of a pile that has moved apart. */
export interface Placed<T> { it: T; x: number; y: number; ax: number; ay: number; r: number; box?: Box }

/** How far apart the markers have moved, 0 to 1, over one zoom level from where they begin to. */
const bloom = (z: number) => { const t = Math.max(0, Math.min(1, z)); return t * t * (3 - 2 * t); };

/** The markers of one filter: where each is drawn in a frame, the lines to their places, and which one a tap hits. */
export class Crowd<T> {
  /** The markers of the last frame drawn: what the reader sees, and taps. */
  placed: Placed<T>[] = [];
  /** Where the markers of piles are, this frame: their names keep off them. */
  private boxes: Box[] = [];
  private rc: RenderCtx | null = null;
  /** How far from its place each marker on the screen was put, and the zoom, projection and list that was for. */
  private kept = new Map<T, [number, number]>();
  private sig = '';
  /** How long the last full layout took (ms), and whether the last frame kept the layout of an earlier zoom. */
  private cost = 0;
  private stale = false;

  /** `from`: the zoom level at which crowded markers begin to move apart; one level closer they are fully apart. */
  constructor(private from: number, private gap = 3) {}

  /**
   * This frame's markers on the screen: worked out once a frame (the labels get the same answer as the dots, and
   * `list` is asked only then). `r` is a marker's radius in pixels; the heavier markers (`wt`, by default the
   * bigger) stay at their places and the others go round them. The same marker must be the same object from frame
   * to frame; `key` names the list (it changes when the filter's choices change what is shown).
   */
  place(rc: RenderCtx, list: () => Iterable<T>, at: (it: T) => [number, number], r: (it: T) => number, wt?: (it: T) => number, key = ''): Placed<T>[] {
    if (this.rc === rc) return this.placed;
    this.rc = rc;
    const { w, h } = rc.view, M = 70;
    const out: Placed<T>[] = [], ids: number[] = [];
    this.boxes = [];
    let n = 0;
    for (const it of list()) {
      n++;
      const g = at(it);
      const p = rc.project(g[0], g[1]);
      if (!p || p[0] < -M || p[0] > w + M || p[1] < -M || p[1] > h + M) continue;
      out.push({ it, x: p[0], y: p[1], ax: p[0], ay: p[1], r: r(it) });
      ids.push(n);
    }
    const f = bloom(rc.webZoom - this.from);
    // While the map is only dragged, every marker keeps its spot beside its place: the layout is for one zoom.
    const sig = `${key}|${rc.view.pxPerRadian}|${rc.view.current.id}|${rc.view.t}`;
    // While a pinch or a flight changes the zoom, a slow layout (many markers) is not done afresh each frame: the
    // markers keep their spots beside their places, and the layout is done again once the map is still.
    const hold = rc.moving && this.cost > 4 && f >= 1 && key + '|' === this.sig.slice(0, key.length + 1);
    if (!hold && (sig !== this.sig || this.stale || f <= 0)) this.kept.clear();
    this.stale = hold && sig !== this.sig;
    if (!hold) this.sig = sig;
    if (f > 0 && out.length > 1) {
      const ms: Mark[] = out.map((p, k) => {
        const o = this.kept.get(p.it);
        return { ax: p.ax, ay: p.ay, r: p.r, wt: wt ? wt(p.it) : p.r, id: ids[k], x: o ? p.ax + o[0] : p.ax, y: o ? p.ay + o[1] : p.ay, kept: !!o };
      });
      const t0 = performance.now();
      settle(ms, this.gap);
      if (!this.stale) this.cost = performance.now() - t0;
      const kept = new Map<T, [number, number]>();
      for (let k = 0; k < out.length; k++) {
        const p = out[k], m = ms[k];
        kept.set(p.it, [m.x - m.ax, m.y - m.ay]);
        p.x = p.ax + (m.x - m.ax) * f; p.y = p.ay + (m.y - m.ay) * f;
        if (m.pile! > 1) { p.box = [p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r]; this.boxes.push(p.box); }
      }
      this.kept = kept;
    }
    this.placed = out;
    return out;
  }

  /** The lines from the moved markers to their true places (a marker still over its place has none); draw them first. */
  leaders(rc: RenderCtx, color: (it: T) => string) {
    const dark = rc.theme.dark;
    const ink = dark ? '#f1f5fb' : '#1c222e', edge = dark ? 'rgba(8,14,26,0.6)' : 'rgba(255,255,255,0.75)';
    for (const p of this.placed) {
      if (Math.hypot(p.x - p.ax, p.y - p.ay) > p.r + 2) leader(rc.ctx, p.ax, p.ay, p.x, p.y, p.r, ink, color(p.it), edge);
    }
  }

  /**
   * A marker's name: `below` px under it, centred; or, for one of a pile that has moved apart, beside it on
   * whichever side is free of the pile's other markers.
   */
  name(rc: RenderCtx, p: Placed<T>, l: Omit<LabelSpec, 'x' | 'y'>, below = p.r + 8) {
    if (p.box) rc.labels.add({ ...l, x: p.x, y: p.y, gap: p.r + 4, avoid: this.boxes, own: p.box });
    else rc.labels.add({ ...l, x: p.x, y: p.y + below });
  }

  /**
   * The marker under a tap, as the last frame drew it: the one the tap is inside, else the nearest within `reach`
   * pixels of its centre.
   */
  pick(tap: { x: number; y: number }, reach = 18): T | null {
    let best: T | null = null, be = Infinity, bd = Infinity;
    for (const p of this.placed) {
      const d = Math.hypot(p.x - tap.x, p.y - tap.y);
      if (d > Math.max(reach, p.r + 3)) continue;
      const e = Math.max(0, d - p.r);
      if (e < be || (e === be && d < bd)) { be = e; bd = d; best = p.it; }
    }
    return best;
  }
}

/** A filter's crowd, kept with its instance (`from` as in Crowd). */
export function crowdOf<T>(inst: LayerInstance, from: number): Crowd<T> {
  return (inst.state.crowd ??= new Crowd<T>(from)) as Crowd<T>;
}
