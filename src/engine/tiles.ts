// Web-map tiles for detailed terrain: where they come from, the user's choices (detail on or off, only on Wi-Fi),
// how much has been downloaded, and a loader that keeps a capped number of decoded tiles in memory, fetches the
// ones the view needs (nearest first, dropping those no longer needed), and looks in saved offline areas first.

export type TileKind = 'terrarium' | 'rgb';
export interface TileSource {
  id: string; kind: TileKind;
  url: (z: number, x: number, y: number) => string;
  minZoom: number; maxZoom: number;
  credit: string;
}

/** Heights of land and sea floor, as Terrarium PNGs (AWS Open Data). */
export const TERRAIN: TileSource = {
  id: 'terrain', kind: 'terrarium', minZoom: 0, maxZoom: 14,
  url: (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
  credit: 'Terrain Tiles (Mapzen, AWS Open Data): 3DEP, SRTM, GMTED2010, ETOPO1 and other sources (see SOURCES.md)',
};

/** Sentinel-2 cloudless 2016, by EOX (CC BY 4.0): the edition free for any use. */
export const SENTINEL: TileSource = {
  id: 's2cloudless', kind: 'rgb', minZoom: 0, maxZoom: 14,
  url: (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/${z}/${y}/${x}.jpg`,
  credit: 'Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017), CC BY 4.0',
};

export const SOURCES: Record<string, TileSource> = { [TERRAIN.id]: TERRAIN, [SENTINEL.id]: SENTINEL };

// ---- the user's choices and the download counter -------------------------------------------------

const PREFS_KEY = 'atlas-globe:terrain';
export interface TerrainPrefs { detail: boolean; wifiOnly: boolean; total: number }
function loadPrefs(): TerrainPrefs {
  const d: TerrainPrefs = { detail: true, wifiOnly: false, total: 0 };
  try { return { ...d, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return d; }
}
export const prefs: TerrainPrefs = loadPrefs();
export function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* not kept */ } }
/** Bytes of tiles downloaded since the app opened. */
export const stats = { session: 0, fromSaved: 0, requests: 0 };
let saveTimer = 0;
function counted(bytes: number) {
  stats.session += bytes;
  prefs.total += bytes;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(savePrefs, 1500);
}

interface NetInfo { type?: string; effectiveType?: string; saveData?: boolean }
/** What the browser says about the connection: Wi-Fi (or cable), mobile data, none, or it does not say
 *  (Safari and desktop browsers). */
export function connection(): 'wifi' | 'cellular' | 'offline' | 'unknown' {
  if (!navigator.onLine) return 'offline';
  const c = (navigator as unknown as { connection?: NetInfo }).connection;
  const t = c?.type;
  if (t === 'wifi' || t === 'ethernet' || t === 'wimax') return 'wifi';
  if (t === 'cellular' || t === 'bluetooth') return 'cellular';
  if (t === 'none') return 'offline';
  return 'unknown';
}
/** Tiles may be downloaded now: detail is on and, with "only on Wi-Fi", the connection is not known to be mobile. */
export function mayDownload(): boolean {
  if (!prefs.detail) return false;
  const c = connection();
  if (c === 'offline') return false;
  return !(prefs.wifiOnly && c === 'cellular');
}

export const fmtBytes = (b: number, es = false) => {
  const f = (x: number, d: number) => x.toLocaleString(es ? 'es-ES' : 'en-GB', { maximumFractionDigits: d });
  return b < 1e6 ? `${f(b / 1e3, 0)} KB` : b < 1e9 ? `${f(b / 1e6, 1)} MB` : `${f(b / 1e9, 2)} GB`;
};

// ---- saved offline areas live in a cache of their own ---------------------------------------------

export const SAVED_CACHE = 'atlas-saved-tiles';
/** Set by offline.ts: whether any area is saved (no need to look in the cache otherwise). */
export const saved = { any: false };

// ---- the loader ---------------------------------------------------------------------------------

export const tileKey = (src: TileSource, z: number, x: number, y: number) => `${src.id}/${z}/${x}/${y}`;
interface Entry { bmp: ImageBitmap; used: number }
export interface Want { src: TileSource; z: number; x: number; y: number }

function deviceMemory(): number | undefined { return (navigator as unknown as { deviceMemory?: number }).deviceMemory; }

export class TileLoader {
  private cache = new Map<string, Entry>();
  private inflight = new Set<string>();
  private queue: Want[] = [];
  /** Tiles that failed (missing at the source): not asked again this visit. */
  private missing = new Set<string>();
  private clock = 0;
  private listeners = new Set<() => void>();
  /** At most this many decoded tiles (each 256 KB in memory) are kept; fewer on small phones. */
  readonly max: number;
  readonly concurrency = 6;

  constructor() {
    const mem = deviceMemory();
    this.max = mem !== undefined && mem < 4 ? 96 : Math.min(screen.width, screen.height) < 500 ? 128 : 320;
  }

  onTile(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  get size() { return this.cache.size; }

  /** A decoded tile, if it is in memory. */
  get(src: TileSource, z: number, x: number, y: number): ImageBitmap | null {
    const e = this.cache.get(tileKey(src, z, x, y));
    if (!e) return null;
    e.used = ++this.clock;
    return e.bmp;
  }

  /** What each user (the map, the 3D view) needs now, most important first. */
  private wants = new Map<string, Want[]>();

  /** The tiles a user needs now, most important first; its queued ones no longer needed are dropped. The 3D view
   *  goes before the map. */
  want(list: Want[], owner = 'map') {
    this.wants.set(owner, list);
    const seen = new Set<string>();
    this.queue = [];
    for (const o of ['3d', ...[...this.wants.keys()].filter((x) => x !== '3d')]) {
      for (const w of this.wants.get(o) ?? []) {
        const k = tileKey(w.src, w.z, w.x, w.y);
        if (seen.has(k)) continue;
        seen.add(k);
        const e = this.cache.get(k);
        // Keep what is in use from being evicted.
        if (e) { e.used = ++this.clock; continue; }
        if (!this.inflight.has(k) && !this.missing.has(k)) this.queue.push(w);
      }
    }
    this.pump();
  }

  /** Whether a tile failed (not at the source, or not a picture). */
  failed(src: TileSource, z: number, x: number, y: number) { return this.missing.has(tileKey(src, z, x, y)); }
  /** Whether a tile is on its way. */
  loading(src: TileSource, z: number, x: number, y: number) { return this.inflight.has(tileKey(src, z, x, y)) || this.queue.some((w) => w.src === src && w.z === z && w.x === x && w.y === y); }

  private pump() {
    while (this.inflight.size < this.concurrency && this.queue.length) {
      const w = this.queue.shift()!;
      const k = tileKey(w.src, w.z, w.x, w.y);
      if (this.cache.has(k) || this.inflight.has(k)) continue;
      this.inflight.add(k);
      void this.load(w, k).finally(() => { this.inflight.delete(k); this.pump(); });
    }
  }

  private async load(w: Want, k: string) {
    const url = w.src.url(w.z, w.x, w.y);
    let blob: Blob | null = null;
    // A saved offline area first.
    if (saved.any && 'caches' in window) {
      try {
        const r = await (await caches.open(SAVED_CACHE)).match(url);
        if (r) { blob = await r.blob(); stats.fromSaved++; }
      } catch { /* no cache */ }
    }
    if (!blob) {
      if (!mayDownload()) return;
      try {
        stats.requests++;
        const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (!r.ok) { if (r.status === 404 || r.status === 403) this.missing.add(k); return; }
        blob = await r.blob();
        counted(blob.size);
      } catch { return; }
    }
    try {
      const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      this.put(k, bmp);
      for (const fn of this.listeners) fn();
    } catch { this.missing.add(k); }
  }

  private put(k: string, bmp: ImageBitmap) {
    this.cache.set(k, { bmp, used: ++this.clock });
    if (this.cache.size <= this.max) return;
    // Evict the least recently used.
    const old = [...this.cache.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, this.cache.size - this.max);
    for (const [key, e] of old) { e.bmp.close(); this.cache.delete(key); }
  }

  /** Frees every decoded tile (tests, and when detail is turned off). */
  clear() {
    for (const e of this.cache.values()) e.bmp.close();
    this.cache.clear();
    this.queue = [];
    this.wants.clear();
  }

  /** Waits until every tile of a list is in memory or has failed (or the time is up); calls back on each arrival. */
  async loadAll(list: Want[], owner: string, onTile: (have: number) => void, ms = 25000): Promise<number> {
    const count = () => list.filter((w) => this.cache.has(tileKey(w.src, w.z, w.x, w.y))).length;
    const done = () => list.every((w) => this.cache.has(tileKey(w.src, w.z, w.x, w.y)) || this.missing.has(tileKey(w.src, w.z, w.x, w.y)));
    this.want(list, owner);
    if (done()) return count();
    return new Promise((resolve) => {
      const t0 = Date.now();
      const check = () => {
        onTile(count());
        // Tiles that can't be fetched now (no connection, detail off) are not waited for.
        if (done() || Date.now() - t0 > ms || (!mayDownload() && !this.inflight.size)) { off(); clearInterval(timer); resolve(count()); }
      };
      const off = this.onTile(check);
      const timer = window.setInterval(check, 500);
    });
  }
}

export const tiles = new TileLoader();

/** Fetches one tile's bytes for saving (no decoding): from the network, counted. */
export async function fetchTileBytes(src: TileSource, z: number, x: number, y: number): Promise<Response | null> {
  try {
    stats.requests++;
    const r = await fetch(src.url(z, x, y), { mode: 'cors', credentials: 'omit' });
    if (!r.ok) return null;
    const b = await r.clone().blob();
    counted(b.size);
    return r;
  } catch { return null; }
}

// ---- tile arithmetic (Web Mercator) ----------------------------------------------------------------

const MAX_LAT = 85.0511287798;
export const lonToX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
export const latToY = (lat: number, z: number) => {
  const r = (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};
export const yToLat = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

/** The lon/lat box of a spherical cap: [west, south, east, north], west > east when it crosses the antimeridian;
 *  a cap over a pole spans every longitude. */
export function capBox(lon: number, lat: number, r: number): [number, number, number, number] {
  const D = 180 / Math.PI;
  const rd = r * D;
  const s = Math.max(-90, lat - rd), n = Math.min(90, lat + rd);
  if (n >= 90 || s <= -90 || rd >= 90) return [-180, s, 180, n];
  const dl = Math.asin(Math.min(1, Math.sin(r) / Math.cos((lat * Math.PI) / 180))) * D;
  if (dl >= 180) return [-180, s, 180, n];
  const w = ((lon - dl + 540) % 360) - 180, e = ((lon + dl + 540) % 360) - 180;
  return [w, s, e, n];
}

/** The tiles of zoom z covering a box: first column x0 (columns wrap), nx columns, rows y0..y0+ny-1. */
export function tileRange(box: [number, number, number, number], z: number) {
  const n = 2 ** z;
  const [w, s, e, nn] = box;
  const x0 = Math.min(n - 1, Math.floor(lonToX(w, z)));
  const x1 = Math.min(n - 1, Math.floor(lonToX(e, z)));
  const nx = w === -180 && e === 180 ? n : ((x1 - x0 + n) % n) + 1;
  const y0 = Math.max(0, Math.floor(latToY(nn, z))), y1 = Math.min(n - 1, Math.floor(latToY(s, z)));
  return { x0, y0, nx: Math.min(nx, n), ny: Math.max(1, y1 - y0 + 1), n };
}
