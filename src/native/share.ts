// Sharing, copying and saving in the apps (v0.43.0). The app shares with navigator.share, copies with
// navigator.clipboard and saves files with a link's download (a wallpaper, the backup, a trip, a calendar file).
// Phone apps' web views have none of these (or only some), so in the apps they are given the phone's own: the share
// menu (@capacitor/share), the clipboard (@capacitor/clipboard), and files written to the app's cache folder and handed
// to the share menu, where "Save to Files" or "Save to device" saves them.
import { Clipboard } from '@capacitor/clipboard';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { safeName } from './urls';
import { bridged } from './platform';

const toBase64 = (b: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
  r.onerror = () => reject(r.error);
  r.readAsDataURL(b);
});


/** Writes a file to the app's cache folder and returns its address for the share menu. */
async function cacheFile(name: string, blob: Blob): Promise<string> {
  const path = `share/${safeName(name)}`;
  const r = await Filesystem.writeFile({ path, data: await toBase64(blob), directory: Directory.Cache, recursive: true });
  return r.uri;
}

/** "The reader closed the share menu": the same error the website's navigator.share gives. */
const cancelled = (e: unknown) => /cancel/i.test(String((e as Error)?.message ?? e));
const abort = () => new DOMException('Share canceled', 'AbortError');

/** Shares text, a link or files through the phone's share menu. */
export async function shareNative(d: ShareData): Promise<void> {
  const files = d.files?.length ? await Promise.all([...d.files].map((f) => cacheFile(f.name, f))) : undefined;
  try {
    await Share.share({ title: d.title, text: d.text, url: d.url, files, dialogTitle: d.title });
  } catch (e) {
    if (cancelled(e)) throw abort();
    throw e;
  }
}

/** Saves a file: the share menu opens with it (Save to Files, Drive, a message…). */
export async function saveNative(name: string, blob: Blob): Promise<void> {
  try {
    await Share.share({ files: [await cacheFile(name, blob)], title: name, dialogTitle: name });
  } catch (e) {
    if (!cancelled(e)) throw e;
  }
}

/** Gives the page the phone's share menu, clipboard and file saving. */
export function installShare() {
  if (!bridged()) return;
  const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean };
  Object.defineProperty(nav, 'share', { configurable: true, writable: true, value: (d: ShareData) => shareNative(d) });
  Object.defineProperty(nav, 'canShare', { configurable: true, writable: true, value: () => true });
  Object.defineProperty(nav, 'clipboard', {
    configurable: true,
    value: {
      writeText: (s: string) => Clipboard.write({ string: s }),
      readText: async () => (await Clipboard.read()).value,
    },
  });
  // A link with a download (a blob: or data: address the page made): saved through the share menu instead.
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (this.hasAttribute('download') && /^(blob|data):/.test(this.href)) {
      const name = this.getAttribute('download') || 'atlas';
      void fetch(this.href).then((r) => r.blob()).then((b) => saveNative(name, b)).catch((e) => console.warn('save', e));
      return;
    }
    click.call(this);
  };
}
