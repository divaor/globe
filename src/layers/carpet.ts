// The living carpet (Animals of the world in v0.30.0, shared with Plants of the world since v0.31.0): living things
// drawn as emoji where they live, from their squares of GBIF's map grid (1.40625°, about 150 km at the equator).
//
// At each zoom the globe is cut into a fixed grid whose squares are about 56 px apart on the screen; each square
// shows its best-standing thing that its neighbours don't already show, so the carpet stays varied and keeps still
// while the map is dragged. Zoomed in past the data's own squares, each square shows its best ones side by side.
// A range ("show where it lives") is its squares, darker where more people saw it.
import { geoDistance } from 'd3-geo';
import type { MultiPolygon } from 'geojson';
import type { RenderCtx } from './types';

export const COLS = 256, ROWS = 128, DEG = 360 / COLS;

/** Anything the carpet can show: an emoji, a fame (Wikipedia sitelinks) and its squares. */
export interface CarpetItem { i: number; id: string; e: string; sl: number; cells: Int32Array; counts: Uint8Array }
export interface Pick<T> { a: T; lon: number; lat: number }
export interface Drawn<T> { a: T; x: number; y: number; r: number }
/** How a thing's disc looks: its fill, an optional ring, and how faint its emoji is. */
export interface DiscStyle { fill: string; ring?: string; ringWidth?: number; alpha?: number }

/** How far apart the carpet's things are on the screen: wider once their names show. */
export const spacingAt = (z: number) => (z >= 3.2 ? 86 : 56);
export const sizeAt = (z: number) => Math.max(17, Math.min(30, 13 + z * 2.6));
/** A small, fixed shake for a square, so the carpet doesn't look like a chessboard (0..1). */
export const hash = (x: number, y: number, s = 0) => { let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

/** The carpet at grid level k (squares of 2^k data squares a side, wider towards the poles), for the whole globe. */
function levelPicks<T extends CarpetItem>(byCell: Map<number, T[]>, k: number, ok: (a: T) => boolean, weightOf: (a: T) => number): Pick<T>[] {
  const size = 1 << k, out: Pick<T>[] = [];
  let prev: { x0: number; x1: number; id: string; e: string }[] = [];
  for (let y0 = 0; y0 < ROWS; y0 += size) {
    const latC = -90 + (y0 + size / 2) * DEG;
    const stretch = 2 ** Math.round(Math.log2(1 / Math.max(Math.cos((latC * Math.PI) / 180), 0.06)));
    const w = Math.min(COLS, size * stretch);
    const row: { x0: number; x1: number; id: string; e: string }[] = [];
    let west: T | null = null;
    for (let x0 = 0; x0 < COLS; x0 += w) {
      const m = new Map<T, [number, number, number]>();
      let filled = 0;
      for (let y = y0; y < Math.min(ROWS, y0 + size); y++) for (let x = x0; x < x0 + w; x++) {
        const list = byCell.get(y * COLS + x);
        if (!list) continue;
        let any = false;
        for (const a of list) {
          if (!ok(a)) continue;
          any = true;
          const s = m.get(a);
          if (s) { s[0]++; s[1] += x; s[2] += y; } else m.set(a, [1, x, y]);
        }
        if (any) filled++;
      }
      if (!m.size) { west = null; continue; }
      // Its neighbours' things, and their emoji: no two neighbours look the same.
      const near = new Set<string>();
      if (west) { near.add(west.id); near.add(west.e); }
      for (const p of prev) if (p.x1 > x0 - w && p.x0 < x0 + 2 * w) { near.add(p.id); near.add(p.e); }
      let best: T | null = null, bs = -1, first: T | null = null, fs = -1;
      for (const [a, s] of m) {
        const score = weightOf(a) * Math.sqrt(s[0] / filled);
        if (score > fs) { fs = score; first = a; }
        if (!near.has(a.id) && !near.has(a.e) && score > bs) { bs = score; best = a; }
      }
      const a = best ?? first!;
      const s = m.get(a)!;
      // Where it lives in this square (the middle of its own data squares), shaken a little.
      const jx = (hash(x0, y0, 1) - 0.5) * 0.5 * Math.min(w, 2), jy = (hash(x0, y0, 2) - 0.5) * 0.5 * Math.min(size, 2);
      out.push({ a, lon: -180 + (s[1] / s[0] + 0.5 + jx) * DEG, lat: Math.max(-89, Math.min(89, -90 + (s[2] / s[0] + 0.5 + jy) * DEG)) });
      row.push({ x0, x1: x0 + w, id: a.id, e: a.e });
      west = a;
    }
    prev = row;
  }
  return out;
}

/** Zoomed in past the data's squares: each visible square's best-standing things, `m` × `m` of them. */
function slotPicks<T extends CarpetItem>(byCell: Map<number, T[]>, rc: RenderCtx, m: number, ok: (a: T) => boolean, weightOf: (a: T) => number): Pick<T>[] {
  const out: Pick<T>[] = [];
  const [clon, clat] = rc.center;
  const r = (rc.view.visibleRadius() * 180) / Math.PI;
  const y0 = Math.max(0, Math.floor((clat - r + 90) / DEG)), y1 = Math.min(ROWS - 1, Math.floor((clat + r + 90) / DEG));
  for (let y = y0; y <= y1; y++) {
    const lat = -90 + (y + 0.5) * DEG;
    const span = Math.min(180, r / Math.max(0.05, Math.cos((lat * Math.PI) / 180)) + DEG);
    const x0 = Math.floor((clon - span + 180) / DEG), x1 = Math.floor((clon + span + 180) / DEG);
    for (let xx = x0; xx <= x1; xx++) {
      const x = ((xx % COLS) + COLS) % COLS;
      const list = byCell.get(y * COLS + x);
      if (!list) continue;
      // Twice as many of its best-standing things as it has room for (a different emoji each as far as they go),
      // and of those a fixed mix for this square, so neighbours don't all show the same few.
      const all = list.filter(ok).sort((p, q) => weightOf(q) - weightOf(p));
      const emo = new Set<string>(), pool: T[] = [];
      for (const a of all) if (pool.length < 2 * m * m && !emo.has(a.e)) { emo.add(a.e); pool.push(a); }
      for (const a of all) if (pool.length < 2 * m * m && !pool.includes(a)) pool.push(a);
      const shown = pool.length <= m * m ? pool : [pool[0], ...pool.slice(1).sort((p, q) => hash(x, y, p.i) - hash(x, y, q.i)).slice(0, m * m - 1)];
      if (!shown.length) continue;
      // The slots in a fixed shuffled order for this square, so the best known isn't always top left.
      const slots = Array.from({ length: m * m }, (_, j) => j).sort((p, q) => hash(x, y, p) - hash(x, y, q));
      shown.forEach((a, j) => {
        const sx = slots[j] % m, sy = Math.floor(slots[j] / m);
        const jx = (hash(x, y, 10 + j) - 0.5) * 0.45, jy = (hash(x, y, 20 + j) - 0.5) * 0.45;
        out.push({ a, lon: -180 + (x + (sx + 0.5 + jx) / m) * DEG, lat: -90 + (y + (sy + 0.5 + jy) / m) * DEG });
      });
    }
  }
  return out;
}

const glyphs = new Map<string, HTMLCanvasElement>();
/** An emoji drawn once at a size, then copied: much faster than drawing text hundreds of times a frame. */
export function glyph(e: string, px: number, dpr: number): HTMLCanvasElement {
  const s = Math.round(px * dpr), key = `${e}|${s}`;
  let c = glyphs.get(key);
  if (c) return c;
  if (glyphs.size > 600) glyphs.clear();
  c = document.createElement('canvas');
  c.width = c.height = Math.ceil(s * 1.3);
  const g = c.getContext('2d')!;
  g.font = `${s}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(e, c.width / 2, c.height / 2 + s * 0.06);
  glyphs.set(key, c);
  return c;
}

/** One carpet: its picks cached per grid level and per filter (`key`). */
export class Carpet<T extends CarpetItem> {
  private cache = new Map<string, Pick<T>[]>();
  constructor(private weightOf: (a: T) => number) {}
  clear() { this.cache.clear(); }

  /** Draws the carpet and returns where each thing went (for taps and names). */
  draw(rc: RenderCtx, byCell: Map<number, T[]>, ok: (a: T) => boolean, key: string, style: (a: T) => DiscStyle): Drawn<T>[] {
    const { ctx } = rc;
    const pxPerDeg = (rc.view.pxPerRadian * Math.PI) / 180, base = DEG * pxPerDeg;
    const S = spacingAt(rc.webZoom);
    let list: Pick<T>[];
    if (base >= S * 2) list = slotPicks(byCell, rc, Math.min(4, Math.floor(base / S)), ok, this.weightOf);
    else {
      const k = Math.max(0, Math.ceil(Math.log2(S / base)));
      const ck = `${k}|${key}`;
      let p = this.cache.get(ck);
      if (!p) { if (this.cache.size > 24) this.cache.clear(); p = levelPicks(byCell, k, ok, this.weightOf); this.cache.set(ck, p); }
      list = p;
    }
    const size = sizeAt(rc.webZoom), r = size * 0.62;
    const [clon, clat] = rc.center, vr = rc.view.visibleRadius();
    const drawn: Drawn<T>[] = [];
    const { w, h } = rc.view;
    for (const p of list) {
      if (geoDistance([clon, clat], [p.lon, p.lat]) > vr) continue;
      const xy = rc.project(p.lon, p.lat);
      if (!xy || xy[0] < -r || xy[1] < -r || xy[0] > w + r || xy[1] > h + r) continue;
      const [x, y] = xy;
      const st = style(p.a);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = st.fill; ctx.fill();
      if (st.ring) { ctx.lineWidth = st.ringWidth ?? 2.4; ctx.strokeStyle = st.ring; ctx.stroke(); }
      const g = glyph(p.a.e, size, rc.dpr), gs = g.width / rc.dpr;
      const alpha = ctx.globalAlpha;
      if (st.alpha != null) ctx.globalAlpha = alpha * st.alpha;
      ctx.drawImage(g, x - gs / 2, y - gs / 2, gs, gs);
      ctx.globalAlpha = alpha;
      rc.labels.reserve(x - r, y - r, x + r, y + r);
      drawn.push({ a: p.a, x, y, r });
    }
    return drawn;
  }
}

/** The nearest drawn thing to a tap, if close enough. */
export function pickDrawn<T>(drawn: Drawn<T>[] | undefined, x: number, y: number): Drawn<T> | null {
  let best: Drawn<T> | null = null, bd = Infinity;
  for (const d of drawn ?? []) { const dd = Math.hypot(d.x - x, d.y - y); if (dd < Math.max(18, d.r + 3) && dd < bd) { bd = dd; best = d; } }
  return best;
}

// ---- Ranges ---------------------------------------------------------------------------------------------------
export interface RangeOf { id: string; cells: Int32Array; counts: Uint8Array }
const rangeCache = new Map<string, MultiPolygon[]>();
/** A range's squares, as one shape per shade (0–9 sightings on a log scale; cached). */
function binsOf(f: RangeOf): MultiPolygon[] {
  let bins = rangeCache.get(f.id);
  if (bins) return bins;
  bins = Array.from({ length: 10 }, () => ({ type: 'MultiPolygon', coordinates: [] }));
  f.cells.forEach((c, i) => {
    const x = c % COLS, y = Math.floor(c / COLS);
    const w = -180 + x * DEG, s = -90 + y * DEG, e = w + DEG, n = s + DEG, mid = w + DEG / 2;
    // Clockwise (west, north, east, south): on the sphere the other way round is everything but the square.
    bins![Math.min(9, f.counts[i] ?? 0)].coordinates.push([[[w, s], [w, n], [mid, n], [e, n], [e, s], [mid, s], [w, s]]]);
  });
  if (rangeCache.size > 12) rangeCache.clear();
  rangeCache.set(f.id, bins);
  return bins;
}

/** The two shades a range is drawn in: orange for animals, green for plants. */
export const RANGE_INK = {
  animal: { dark: [255, 190, 60], light: [230, 73, 0], strong: 'rgb(240,110,20)', weak: 'rgba(255,190,60,0.55)' },
  plant: { dark: [105, 219, 124], light: [47, 158, 68], strong: 'rgb(43,138,62)', weak: 'rgba(105,219,124,0.55)' },
} as const;

/** A range on the map: the map dims a little, then the squares, darker where more people saw it. */
export function drawRange(rc: RenderCtx, f: RangeOf, ink: keyof typeof RANGE_INK = 'animal') {
  const { ctx, path } = rc;
  const dark = rc.theme.dark;
  ctx.beginPath(); path({ type: 'Sphere' });
  ctx.fillStyle = dark ? 'rgba(6,10,20,0.42)' : 'rgba(255,255,255,0.5)'; ctx.fill();
  const c = RANGE_INK[ink];
  binsOf(f).forEach((mp, b) => {
    if (!mp.coordinates.length) return;
    ctx.beginPath(); path(mp);
    ctx.fillStyle = dark ? `rgba(${c.dark.join(',')},${0.5 + b * 0.05})` : `rgba(${c.light.join(',')},${0.42 + b * 0.055})`;
    ctx.fill();
  });
}

export const cellAt = (lon: number, lat: number) =>
  Math.min(ROWS - 1, Math.max(0, Math.floor((lat + 90) / DEG))) * COLS + ((Math.floor((lon + 180) / DEG) % COLS) + COLS) % COLS;
export const cellCenter = (c: number): [number, number] => [-180 + ((c % COLS) + 0.5) * DEG, -90 + (Math.floor(c / COLS) + 0.5) * DEG];

/** Does it live in this square? (cells sorted) */
export function hasCell(cells: Int32Array, c: number): boolean {
  let lo = 0, hi = cells.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1; const v = cells[m]; if (v === c) return true; if (v < c) lo = m + 1; else hi = m - 1; }
  return false;
}
/** How far a point is from a range, in km: 0 inside one of its squares. */
export function distanceKm(cells: Int32Array, at: [number, number]): number {
  if (hasCell(cells, cellAt(at[0], at[1]))) return 0;
  let best = Infinity;
  for (const c of cells) { const d = geoDistance(cellCenter(c), at); if (d < best) best = d; }
  // From the middle of the nearest square to its edge: about half a square.
  return Math.max(0, best * 6371 - (DEG * 111) / 2);
}

/** Squares as text, unpacked: the gaps between sorted square numbers as base-36 numbers, joined by dots. */
export function unpackCells(s: string): Int32Array {
  const parts = s ? s.split('.') : [];
  const out = new Int32Array(parts.length);
  let c = -1;
  for (let i = 0; i < parts.length; i++) out[i] = c += parseInt(parts[i], 36);
  return out;
}
export function unpackCounts(k: string): Uint8Array {
  const counts = new Uint8Array(k.length);
  for (let j = 0; j < k.length; j++) counts[j] = k.charCodeAt(j) - 48;
  return counts;
}

/** The middle of a range, weighted by sightings, and a zoom close enough to see it all (for flying there). */
export function rangeView(f: { cells: Int32Array; counts: Uint8Array }): { lon: number; lat: number; zoom: number } | null {
  if (!f.cells.length) return null;
  let x = 0, y = 0, z = 0, w = 180, e = -180, s = 90, n = -90;
  const lon0 = cellCenter(f.cells[f.counts.indexOf(Math.max(...f.counts))] ?? f.cells[0])[0];
  f.cells.forEach((c, i) => {
    const [lon, lat] = cellCenter(c);
    const l = ((lon - lon0 + 540) % 360) - 180 + lon0, wt = 1 + (f.counts[i] ?? 0);
    x += l * wt; y += lat * wt; z += wt;
    w = Math.min(w, l); e = Math.max(e, l); s = Math.min(s, lat); n = Math.max(n, lat);
  });
  const span = Math.max(e - w, (n - s) * 1.4, 4);
  return { lon: ((x / z + 540) % 360) - 180, lat: y / z, zoom: Math.max(1, Math.min(14, 120 / span)) };
}
