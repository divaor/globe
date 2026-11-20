// Saved offline areas' tiles in the apps (v0.43.0): one file per tile in the app's data folder (tiles/<hash>.bin),
// named by a hash of the tile's address. See src/engine/tilestore.ts.
import { Directory, Filesystem } from '@capacitor/filesystem';
import type { TileStore } from '../engine/tilestore';
import { tileFile } from './urls';

const toBase64 = (b: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
  r.onerror = () => reject(r.error);
  r.readAsDataURL(b);
});
function fromBase64(s: string): Blob {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes]);
}

export function fileStore(): TileStore {
  return {
    async match(url) {
      try {
        const r = await Filesystem.readFile({ path: tileFile(url), directory: Directory.Data });
        return typeof r.data === 'string' ? fromBase64(r.data) : r.data;
      } catch { return null; }
    },
    async put(url, blob) {
      await Filesystem.writeFile({ path: tileFile(url), data: await toBase64(blob), directory: Directory.Data, recursive: true });
    },
    async delete(url) {
      try { await Filesystem.deleteFile({ path: tileFile(url), directory: Directory.Data }); } catch { /* gone already */ }
    },
  };
}
