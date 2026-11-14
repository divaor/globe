// Saved areas for offline use: the detail tiles of a box of the map, at several zooms, kept in the browser's Cache
// Storage (see tiles.ts: the loader looks there before the network). Each area is listed with its size and can be
// deleted; tiles another saved area still needs are kept.
import { SAVED_CACHE, saved, fetchTileBytes, tileRange, SOURCES, type TileSource } from './tiles';

export interface SavedArea {
  id: string;
  name: { en: string; es: string };
  /** [west, south, east, north] (west > east across the antimeridian). */
  box: [number, number, number, number];
  /** Zooms saved, lowest to highest. */
  z0: number; z1: number;
  sources: string[];
  tiles: number;
  bytes: number;
  date: string;
}

const KEY = 'atlas-globe:saved-areas';
export function areas(): SavedArea[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') as SavedArea[]; } catch { return []; }
}
function store(list: SavedArea[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* not kept */ }
  saved.any = list.length > 0;
}
saved.any = areas().length > 0;

/** Average size of a tile, to estimate an area before saving it (heights vary more: mountains are bigger). */
const AVG: Record<string, number> = { terrain: 55_000, s2cloudless: 28_000 };

export interface Plan { list: { src: TileSource; z: number; x: number; y: number }[]; estimate: number }
/** Every tile of the box at zooms z0..z1, for each source. */
export function plan(box: [number, number, number, number], z0: number, z1: number, sources: string[]): Plan {
  const list: Plan['list'] = [];
  let estimate = 0;
  for (const id of sources) {
    const src = SOURCES[id];
    if (!src) continue;
    for (let z = z0; z <= Math.min(z1, src.maxZoom); z++) {
      const r = tileRange(box, z);
      for (let j = 0; j < r.ny; j++) for (let i = 0; i < r.nx; i++) list.push({ src, z, x: (r.x0 + i) % r.n, y: r.y0 + j });
      estimate += r.nx * r.ny * (AVG[id] ?? 40_000);
    }
  }
  return { list, estimate };
}
const urlsOf = (a: Pick<SavedArea, 'box' | 'z0' | 'z1' | 'sources'>) => new Set(plan(a.box, a.z0, a.z1, a.sources).list.map((t) => t.src.url(t.z, t.x, t.y)));

export interface Progress { done: number; total: number; bytes: number; failed: number }

/** Saves an area's tiles (6 at a time), reporting progress; a cancelled save is undone. */
export async function saveArea(area: Omit<SavedArea, 'id' | 'tiles' | 'bytes' | 'date'>, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<SavedArea | null> {
  const { list } = plan(area.box, area.z0, area.z1, area.sources);
  const cache = await caches.open(SAVED_CACHE);
  // Ask the browser to keep this storage when space runs low.
  try { await navigator.storage?.persist?.(); } catch { /* not offered */ }
  const p: Progress = { done: 0, total: list.length, bytes: 0, failed: 0 };
  let next = 0;
  const worker = async () => {
    while (next < list.length && !signal.aborted) {
      const t = list[next++];
      const url = t.src.url(t.z, t.x, t.y);
      const have = await cache.match(url);
      if (have) { p.bytes += (await have.clone().blob()).size; }
      else {
        const r = await fetchTileBytes(t.src, t.z, t.x, t.y);
        if (r) { const b = await r.clone().blob(); p.bytes += b.size; await cache.put(url, r); } else p.failed++;
      }
      p.done++;
      onProgress({ ...p });
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  const entry: SavedArea = { ...area, id: `a${Date.now().toString(36)}`, tiles: p.done - p.failed, bytes: p.bytes, date: new Date().toISOString().slice(0, 10) };
  if (signal.aborted) { await removeUrls(urlsOf(entry), areas()); return null; }
  store([...areas(), entry]);
  return entry;
}

/** Deletes an area and its tiles (not those another saved area also holds). */
export async function deleteArea(id: string) {
  const list = areas();
  const a = list.find((x) => x.id === id);
  if (!a) return;
  const rest = list.filter((x) => x.id !== id);
  store(rest);
  await removeUrls(urlsOf(a), rest);
}

async function removeUrls(urls: Set<string>, keepAreas: SavedArea[]) {
  const keep = new Set<string>();
  for (const k of keepAreas) for (const u of urlsOf(k)) keep.add(u);
  const cache = await caches.open(SAVED_CACHE);
  for (const u of urls) if (!keep.has(u)) await cache.delete(u);
}
