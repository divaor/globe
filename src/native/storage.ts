// Your progress in the apps (v0.43.0): the app keeps everything in the page's storage (localStorage), which iOS may
// clear when the phone runs short of space. In the apps every key is also written to the app's own storage
// (Capacitor Preferences: UserDefaults on iOS, SharedPreferences on Android), and put back into the page's storage
// at launch when it is missing. The rest of the app keeps reading and writing localStorage as before.
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { persist } from '../app/persist';

/** The app's keys in Preferences, apart from Preferences' own (its web stand-in keeps them in localStorage too). */
const PREFIX = 'ls:';
const own = (k: string) => k.startsWith('CapacitorStorage.');

const pending = new Map<string, string | null>();
let timer = 0;

// One write after another (v0.50.2): a flush asked for while one runs waits for it, then writes what came since, so
// awaiting a flush means everything changed until then is in the app's storage.
let running: Promise<void> = Promise.resolve();
function flush(): Promise<void> {
  clearTimeout(timer);
  timer = 0;
  running = running.then(async () => {
    const batch = [...pending];
    pending.clear();
    for (const [k, v] of batch) {
      try {
        if (v === null) await Preferences.remove({ key: PREFIX + k });
        else await Preferences.set({ key: PREFIX + k, value: v });
      } catch { /* tried again with the next change */ }
    }
  });
  return running;
}
function queue(k: string, v: string | null) {
  if (own(k)) return;
  pending.set(k, v);
  if (!timer) timer = window.setTimeout(() => void flush(), 400);
}

/**
 * At launch, before anything reads its state: what is missing from the page's storage comes back from the app's,
 * what only the page has is copied to the app's, and from now on every change goes to both.
 */
export async function keepStorage(): Promise<{ restored: number }> {
  let restored = 0;
  const ls = window.localStorage;
  const set = Storage.prototype.setItem, remove = Storage.prototype.removeItem, clearAll = Storage.prototype.clear;
  try {
    const { keys } = await Preferences.keys();
    for (const pk of keys) {
      if (!pk.startsWith(PREFIX)) continue;
      const k = pk.slice(PREFIX.length);
      if (ls.getItem(k) !== null) continue;
      const { value } = await Preferences.get({ key: pk });
      if (value != null) { set.call(ls, k, value); restored++; }
    }
    const have = new Set(keys);
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && !own(k) && !have.has(PREFIX + k)) queue(k, ls.getItem(k));
    }
  } catch { /* the app's storage could not be read: the page's storage still works */ }
  Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
    set.call(this, k, v);
    if (this === ls) queue(k, String(v));
  };
  Storage.prototype.removeItem = function (this: Storage, k: string) {
    remove.call(this, k);
    if (this === ls) queue(k, null);
  };
  Storage.prototype.clear = function (this: Storage) {
    if (this === ls) for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k) queue(k, null); }
    clearAll.call(this);
  };
  // Leaving the app: what is still waiting is written now. Starting the page again (a backup brought back) waits for it.
  void App.addListener('pause', () => void flush()).catch(() => {});
  persist.flush = flush;
  return { restored };
}

/** For the tests: writes what is waiting. */
export const flushStorage = flush;
