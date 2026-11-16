// Keeps the screen on while something plays by itself (a guided tour, a Time travel story playing or read aloud),
// so a phone does not dim and lock in the middle of it: the Screen Wake Lock API, where the browser has it (Chrome
// on Android, Safari since 16.4). Each player says whether it wants the screen on; the lock is held while any does.
// The browser lets go of it when the page is hidden; it is asked for again when the page comes back.
type Sentinel = { release: () => Promise<void>; addEventListener?: (type: string, fn: () => void) => void };
type WakeLock = { request: (type: 'screen') => Promise<Sentinel> };

const owners = new Set<string>();
let lock: Sentinel | null = null;
let asking = false;

async function sync(): Promise<void> {
  const want = owners.size > 0 && document.visibilityState === 'visible';
  if (want && !lock && !asking) {
    const wl = (navigator as unknown as { wakeLock?: WakeLock }).wakeLock;
    if (!wl) return;
    asking = true;
    try {
      const s = await wl.request('screen');
      lock = s;
      s.addEventListener?.('release', () => { if (lock === s) lock = null; });
    } catch { lock = null; /* not allowed (battery saver, no permission): the screen may dim */ }
    asking = false;
    void sync(); // (what is wanted may have changed while asking)
  } else if (!want && lock) {
    const s = lock;
    lock = null;
    try { await s.release(); } catch { /* already gone */ }
  }
}

/** Asks for the screen to stay on (`on`) or lets it go, for one player ("tour", "story:wars"…). */
export function keepAwake(owner: string, on: boolean) {
  if (on === owners.has(owner)) return;
  if (on) owners.add(owner); else owners.delete(owner);
  void sync();
}

/** Who keeps the screen on now, and whether the lock is held (for the tests). */
export function awakeState() { return { owners: [...owners], held: !!lock }; }

document.addEventListener('visibilitychange', () => void sync());
