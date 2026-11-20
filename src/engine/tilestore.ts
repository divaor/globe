// Where saved offline areas keep their tiles (v0.43.0). On the website: the browser's Cache Storage, as since
// v0.19.0. In the apps: files in the app's own data folder (src/native/tilefiles.ts), which the phone keeps until
// the app is deleted (an app's web view may have no Cache Storage, or clear it).
import { isNative } from '../native/platform';

export interface TileStore {
  match(url: string): Promise<Blob | null>;
  put(url: string, blob: Blob): Promise<void>;
  delete(url: string): Promise<void>;
}

export const SAVED_CACHE = 'atlas-saved-tiles';

let opened: Promise<TileStore> | null = null;

export function savedStore(): Promise<TileStore> {
  opened ??= (async (): Promise<TileStore> => {
    if (isNative()) return (await import('../native/tilefiles')).fileStore();
    const c = await caches.open(SAVED_CACHE);
    return {
      async match(url) { const r = await c.match(url); return r ? r.blob() : null; },
      async put(url, blob) { await c.put(url, new Response(blob, { headers: { 'content-type': blob.type || 'application/octet-stream' } })); },
      async delete(url) { await c.delete(url); },
    };
  })();
  opened.catch(() => { opened = null; });
  return opened;
}

/** Whether saved areas can be kept here at all. */
export const canSave = () => isNative() || (typeof window !== 'undefined' && 'caches' in window);
