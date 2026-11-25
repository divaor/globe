// Where the reader is (v0.48.0): the country the device is in, from its location, for "Where you live" in Legacies of
// the past (it was guessed from the phone's language, so a Mexican phone in Spain said "Not in Mexico"). The location
// is turned into a country on the device and only the country is kept, on the device; nothing is sent anywhere.
// The device is asked once (Legacies' first opening); after that the country is refreshed quietly when the
// permission is already given, and the reader can ask again with "Use where I am".
import type { App } from './app';

const KEY = 'atlas-globe:here';
const ASKED = 'atlas-globe:here-asked';
/** A country found within the last day is used as it is. */
const FRESH = 24 * 3600 * 1000;

interface Here { iso: string; t: number }

function read(): Here | null {
  try { const h = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Here | null; return h?.iso ? h : null; } catch { return null; }
}

/** The country the device was last found in (an ISO code of the map), or null. */
export function hereCountry(): string | null { return read()?.iso ?? null; }

/** The phone's own region ("es-MX" → Mexico), when the device's location is not known. */
export function regionCountry(app: App): string | null {
  const region = (navigator.language.split('-')[1] ?? '').toUpperCase();
  if (!region) return null;
  for (const [iso, m] of Object.entries(app.data.meta)) if ((m as { a2?: string }).a2 === region) return iso;
  return null;
}

async function permission(): Promise<PermissionState | 'unknown'> {
  try { return (await navigator.permissions?.query({ name: 'geolocation' as PermissionName }))?.state ?? 'unknown'; } catch { return 'unknown'; }
}

let pending: Promise<string | null> | null = null;

/**
 * Finds the country the device is in. `ask`: may show the device's question (a tap on "Use where I am"); without it,
 * the device is asked only the first time, and otherwise only when it already allows the location.
 */
export function locateCountry(app: App, ask = false): Promise<string | null> {
  if (pending) return pending;
  pending = (async () => {
    const last = read();
    if (!ask && last && Date.now() - last.t < FRESH) return last.iso;
    if (!navigator.geolocation) return last?.iso ?? null;
    const state = await permission();
    let asked = false;
    try { asked = localStorage.getItem(ASKED) === '1'; } catch { /* private mode */ }
    if (state === 'denied' || (!ask && state !== 'granted' && asked)) return last?.iso ?? null;
    try { localStorage.setItem(ASKED, '1'); } catch { /* private mode */ }
    const pos = await new Promise<GeolocationPosition | null>((ok) =>
      navigator.geolocation.getCurrentPosition(ok, () => ok(null), { enableHighAccuracy: false, maximumAge: FRESH, timeout: 15000 }));
    if (!pos) return last?.iso ?? null;
    const iso = app.renderer.countryAt(pos.coords.longitude, pos.coords.latitude);
    if (!iso || !app.data.meta[iso]) return last?.iso ?? null;
    try { localStorage.setItem(KEY, JSON.stringify({ iso, t: Date.now() } satisfies Here)); } catch { /* private mode */ }
    return iso;
  })().finally(() => { pending = null; });
  return pending;
}
