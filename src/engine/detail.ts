// A detail mosaic: the web-map tiles of one source that cover the area on screen, at the zoom that matches it,
// kept in one WebGL texture the raster shader reads (see gl.ts). Tiles arrive one by one; until a tile is there,
// its parent (or grandparent), if in memory, stands in, stretched. Moving or zooming away rebuilds the mosaic
// from the tiles in memory and asks the loader for the rest.
import type { GLRaster, RasterDetail, RasterPalette } from './gl';
import type { View } from './view';
import { tiles, prefs, tileKey, tileX, tileY, cols, rows, shrinks, type TileSource, type Want } from './tiles';

/** Most tiles across and down one mosaic can hold (4096 px), fewer on small devices (2048 px). */
function maxTiles(gl: GLRaster): number {
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  const big = gl.maxTextureSize >= 4096 && !(mem !== undefined && mem < 4) && Math.min(screen.width, screen.height) >= 500;
  return big ? 16 : 8;
}

/**
 * The web-map zoom whose tiles match the screen: a tile pixel no bigger than 1.5 CSS pixels. Web-map tiles shrink
 * towards the poles (by the cosine of the latitude), so farther from the equator a lower zoom is enough.
 */
export function tileZoom(view: View, src: TileSource): number {
  // A grid tile (the other worlds) spans half the longitude of a Mercator tile of the same zoom, and doesn't shrink.
  if (!shrinks(src)) return Math.max(src.minZoom, Math.min(src.maxZoom, Math.ceil(view.webZoom - 1 - 0.585)));
  const c = Math.max(0.05, Math.cos((view.lat * Math.PI) / 180));
  return Math.max(src.minZoom, Math.min(src.maxZoom, Math.ceil(view.webZoom + Math.log2(c) - 0.585)));
}

/** The tiles of zoom z that the screen shows: its points every 40 px (and its edges) turned into map positions. */
export function visibleTiles(view: View, src: TileSource, z: number): [number, number][] {
  const n = cols(src, z), m = rows(src, z);
  const seen = new Set<number>();
  const out: [number, number][] = [];
  const step = 40;
  const add = (sx: number, sy: number) => {
    const g = view.invert(sx, sy);
    if (!g) return;
    const x = Math.min(n - 1, Math.max(0, Math.floor(tileX(src, g[0], z)))), y = Math.min(m - 1, Math.max(0, Math.floor(tileY(src, g[1], z))));
    const k = y * n + x;
    if (!seen.has(k)) { seen.add(k); out.push([x, y]); }
  };
  for (let sy = 0; sy <= view.h + step - 1; sy += step) for (let sx = 0; sx <= view.w + step - 1; sx += step) add(Math.min(sx, view.w - 1), Math.min(sy, view.h - 1));
  return out;
}

/** The smallest block of columns (wrapping round the world) and rows that holds the tiles. */
export function boundRange(list: [number, number][], n: number) {
  if (!list.length) return null;
  const xs = [...new Set(list.map(([x]) => x))].sort((a, b) => a - b);
  // The widest gap between used columns (going round) is left out of the block.
  let gap = n - xs[xs.length - 1] + xs[0] - 1, start = xs[0];
  for (let k = 1; k < xs.length; k++) { const g = xs[k] - xs[k - 1] - 1; if (g > gap) { gap = g; start = xs[k]; } }
  const ys = list.map(([, y]) => y);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { x0: start, y0, nx: n - gap, ny: y1 - y0 + 1, n };
}

export class DetailMosaic {
  private tex: WebGLTexture | null = null;
  private dims = '';
  private key = '';
  private range = { z: -1, x0: 0, y0: 0, nx: 0, ny: 0, n: 1 };
  /** Tiles in the texture: true when the real tile is there, false for a stand-in. */
  private placed = new Map<string, boolean>();
  private scratch: HTMLCanvasElement | null = null;
  /** The tiles the last frame showed (for tests and the counter). */
  loaded = 0;
  total = 0;

  constructor(private gl: GLRaster, readonly src: TileSource, private mode: 1 | 2 | 3, private palette?: RasterPalette) {}

  /**
   * The detail for this frame, or null (detail off, or the view not zoomed in past `zStart`, where the world
   * image is as sharp). Uploads at most a few tiles per frame and asks for another frame if more are waiting.
   */
  update(view: View, zStart: number, requestRender: () => void): RasterDetail | null {
    if (!prefs.detail) { this.free(); return null; }
    let z = tileZoom(view, this.src);
    if (z < zStart) { this.free(); return null; }
    const lim = maxTiles(this.gl);
    let need = visibleTiles(view, this.src, z);
    let r = boundRange(need, cols(this.src, z));
    while (r && (r.nx > lim || r.ny > lim) && z > zStart) { z--; need = visibleTiles(view, this.src, z); r = boundRange(need, cols(this.src, z)); }
    if (!r || r.nx > lim || r.ny > lim) { this.free(); return null; }
    // The texture is kept while the screen's tiles stay inside it; a new one gets a tile of margin all round, so a
    // small pan does not rebuild it.
    const cur = this.range;
    const inside = !!this.tex && cur.z === z && need.every(([x, y]) => ((x - cur.x0 + cur.n) % cur.n) < cur.nx && y >= cur.y0 && y < cur.y0 + cur.ny);
    let rebuilt = false;
    if (!inside) {
      const n = r.n;
      const mx = r.nx + 2 <= lim && r.nx + 2 <= n ? 1 : 0;
      const y0 = Math.max(0, r.y0 - 1), y1 = Math.min(rows(this.src, z) - 1, r.y0 + r.ny);
      const ny = y1 - y0 + 1 <= lim ? y1 - y0 + 1 : r.ny;
      const range = { z, x0: (r.x0 - mx + n) % n, y0: ny === r.ny ? r.y0 : y0, nx: r.nx + 2 * mx, ny, n };
      // A fresh texture is cleared by WebGL (empty texels are transparent: the world image shows there).
      if (this.tex) this.gl.deleteTexture(this.tex);
      this.tex = this.gl.detailTexture(range.nx * 256, range.ny * 256, this.src.kind === 'terrarium');
      this.dims = `${range.nx}x${range.ny}`;
      this.key = `${z}/${range.x0}/${range.y0}/${this.dims}`;
      this.range = range;
      this.placed.clear();
      rebuilt = true;
    }
    r = this.range;
    // Nearest the centre first.
    const cx = tileX(this.src, view.lon, z), cy = tileY(this.src, view.lat, z);
    const want: (Want & { d: number; i: number; j: number })[] = [];
    for (const [x, y] of need) {
      const i = (x - r.x0 + r.n) % r.n, j = y - r.y0;
      const dx = Math.min(Math.abs(x + 0.5 - cx), r.n - Math.abs(x + 0.5 - cx));
      want.push({ src: this.src, z, x, y, d: Math.hypot(dx, y + 0.5 - cy), i, j });
    }
    want.sort((a, b) => a.d - b.d);
    // A new texture gets every tile already in memory at once (no flicker); later, a few per frame.
    const budget = rebuilt ? 96 : 12;
    let uploads = 0, loaded = 0;
    for (const w of want) {
      const k = tileKey(this.src, w.z, w.x, w.y);
      if (this.placed.get(k)) { loaded++; continue; }
      if (uploads >= budget) continue;
      const bmp = tiles.get(this.src, w.z, w.x, w.y);
      if (bmp) {
        this.gl.uploadTile(this.tex!, w.i * 256, w.j * 256, bmp.width === 256 && bmp.height === 256 ? bmp : this.resized(bmp));
        this.placed.set(k, true);
        uploads++; loaded++;
      } else if (!this.placed.has(k) && this.standIn(w.z, w.x, w.y, w.i, w.j)) {
        this.placed.set(k, false);
        uploads++;
      }
    }
    this.loaded = loaded;
    this.total = want.length;
    tiles.want(want.filter((w) => !this.placed.get(tileKey(this.src, w.z, w.x, w.y))).map(({ src, z: zz, x, y }) => ({ src, z: zz, x, y })));
    if (uploads >= budget) requestRender();
    return { tex: this.tex!, x0: r.x0, y0: r.y0, nx: r.nx, ny: r.ny, n: r.n, geo: !shrinks(this.src), mode: this.mode, palette: this.palette, zf: Math.max(1, Math.min(6, 2 ** ((11 - z) * 0.4))) };
  }

  /** A tile that is not 256 px square, drawn to that size (the mosaic holds 256 px cells). */
  private resized(bmp: ImageBitmap): HTMLCanvasElement {
    const c = (this.scratch ??= document.createElement('canvas'));
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = this.src.kind !== 'terrarium';
    ctx.drawImage(bmp, 0, 0, 256, 256);
    return c;
  }

  /** The parent or grandparent tile's part, stretched, until the tile itself arrives. */
  private standIn(z: number, x: number, y: number, i: number, j: number): boolean {
    for (let up = 1; up <= 3 && z - up >= this.src.minZoom; up++) {
      const s = 2 ** up;
      const p = tiles.get(this.src, z - up, Math.floor(x / s), Math.floor(y / s));
      if (!p) continue;
      const c = (this.scratch ??= document.createElement('canvas'));
      c.width = 256; c.height = 256;
      const ctx = c.getContext('2d', { willReadFrequently: false })!;
      // Heights must not be blended (each channel is a digit of the height).
      ctx.imageSmoothingEnabled = this.src.kind !== 'terrarium';
      ctx.clearRect(0, 0, 256, 256);
      const part = 256 / s;
      ctx.drawImage(p, (x % s) * part, (y % s) * part, part, part, 0, 0, 256, 256);
      this.gl.uploadTile(this.tex!, i * 256, j * 256, c);
      return true;
    }
    return false;
  }

  free() {
    if (this.tex) this.gl.deleteTexture(this.tex);
    this.tex = null;
    this.range = { z: -1, x0: 0, y0: 0, nx: 0, ny: 0, n: 1 };
    this.key = '';
    this.dims = '';
    this.placed.clear();
    this.loaded = 0;
    this.total = 0;
  }
}
