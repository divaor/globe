// The trip's places (v0.31.2): what you want to see in each city of your trip, kept on this device with the trip.
// A ☆ on a row of a city's guide or on a card puts a place under its city (and the city into the trip); a work goes
// in as its museum, with the work named as the reason to go. The trip panel lists each city's places, nearest to its
// centre first until you reorder them, and the export (export.ts) writes them out with the trip's details.
import { Star } from 'lucide';
import { h, icon } from '../ui/dom';
import { lang } from '../app/i18n';

const es = () => lang() === 'es';
const L = (en: string, sp: string) => (es() ? sp : en);

export type PlaceKind = 'whs' | 'sight' | 'museum' | 'building' | 'park' | 'zoo' | 'garden' | 'tree' | 'dish' | 'spectacle';
export const PLACE_ICONS: Record<PlaceKind, string> = { whs: '🏛️', sight: '🏰', museum: '🖼️', building: '📐', park: '🏞️', zoo: '🦒', garden: '🌷', tree: '🌳', dish: '🍽️', spectacle: '📅' };

/** A reason to go: a work in a museum, or a line about the place; `k` names it (a work's id) so it can be taken out. */
export interface Why { k?: string; t: [string, string] }
export interface Place {
  /** Its kind and its id ("museum:Q160112", "whs:252", "dish:paella"). */
  id: string;
  kind: PlaceKind;
  /** The guide city it is under. */
  city: string;
  n: [string, string];
  at?: [number, number];
  why?: Why[];
  /** Its page (Wikipedia, UNESCO's, the official site). */
  url?: string;
  /** Put in itself (not only for a work in it). */
  self?: boolean;
}

/** The trip's details, all optional: what an assistant needs to plan it (export.ts). */
export interface TripDetails {
  start?: string; end?: string; from?: string; passport?: string;
  pace?: '' | 'relaxed' | 'normal' | 'packed'; budget?: '' | 'low' | 'mid' | 'high';
  interests?: string; note?: string;
  /** Days in each city. */
  days?: Record<string, number>;
}

const KEY = 'atlas-globe:trip-places';
const DKEY = 'atlas-globe:trip-details';

/** What the plan needs from the travel guide (set in guide.ts). */
export const planHooks: {
  /** The guide city nearest to a point, within reach of a day trip (loads the guide's cities first). */
  nearestCity?: (at: [number, number]) => Promise<string | null>;
  /** A city's centre and name. */
  city?: (id: string) => { at: [number, number]; name: string } | null;
  /** Puts the city into the trip. */
  addCity?: (id: string) => void;
  toast?: (msg: string) => void;
} = {};

type Store = { places: Record<string, Place[]>; manual: Record<string, true> };
function load(): Store {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (v && typeof v === 'object' && v.places) return { places: v.places, manual: v.manual ?? {} };
  } catch { /* private mode */ }
  return { places: {}, manual: {} };
}
let store = load();
let details: TripDetails = (() => { try { return JSON.parse(localStorage.getItem(DKEY) || '{}') ?? {}; } catch { return {}; } })();
const subs = new Set<() => void>();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* private mode: kept for this visit */ }
  for (const f of [...subs]) f();
}

/** Calls `fn` when places are added, moved or taken out. */
export function onPlan(fn: () => void): () => void { subs.add(fn); return () => subs.delete(fn); }
/** A city's places, in order. */
export const placesOf = (city: string): Place[] => store.places[city] ?? [];
/** Every city's places. */
export const allPlaces = (): Record<string, Place[]> => store.places;
/** The place with this id, wherever it is. */
export function findPlace(id: string): Place | null {
  for (const list of Object.values(store.places)) { const p = list.find((x) => x.id === id); if (p) return p; }
  return null;
}
/** Is the place (or, `why`, this reason of it) in the trip? */
export function inPlan(id: string, why?: string): boolean {
  const p = findPlace(id);
  return !!p && (why ? !!p.why?.some((w) => w.k === why) : true);
}

const dist = (a: [number, number], b: [number, number]) => {
  const r = Math.PI / 180, x = (b[0] - a[0]) * r * Math.cos(((a[1] + b[1]) / 2) * r), y = (b[1] - a[1]) * r;
  return Math.hypot(x, y) * 6371;
};

/** Puts a place into the trip (under its city, which joins the trip), or adds its new reasons to it. */
export function addPlace(p: Place): void {
  const list = (store.places[p.city] ??= []);
  const had = list.find((x) => x.id === p.id);
  if (had) {
    for (const w of p.why ?? []) if (!had.why?.some((x) => (w.k ? x.k === w.k : x.t[0] === w.t[0]))) (had.why ??= []).push(w);
    had.self ||= p.self;
  } else {
    list.push(p);
    // Nearest to the city's centre first, until the reader puts them in an order of their own.
    const c = planHooks.city?.(p.city);
    if (c && !store.manual[p.city]) list.sort((a, b) => (a.at ? dist(c.at, a.at) : 1e9) - (b.at ? dist(c.at, b.at) : 1e9));
  }
  planHooks.addCity?.(p.city);
  save();
}
/** Takes a place out (or only one reason of it: a work, leaving the museum if it was put in itself or for others). */
export function removePlace(id: string, why?: string): void {
  for (const [city, list] of Object.entries(store.places)) {
    const p = list.find((x) => x.id === id);
    if (!p) continue;
    if (why) {
      p.why = (p.why ?? []).filter((w) => w.k !== why);
      if (p.self || p.why.some((w) => w.k)) { save(); return; }
    }
    store.places[city] = list.filter((x) => x !== p);
    if (!store.places[city].length) { delete store.places[city]; delete store.manual[city]; }
    save();
    return;
  }
}
export function movePlace(city: string, id: string, by: number): void {
  const list = store.places[city] ?? [];
  const i = list.findIndex((x) => x.id === id), j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  store.manual[city] = true;
  save();
}
/** A city left the trip: its places go too. */
export function dropCity(city: string): void { if (store.places[city]) { delete store.places[city]; delete store.manual[city]; save(); } }
/** The whole plan goes (the trip was cleared), or is replaced (a shared trip). */
export function setPlan(places: Record<string, Place[]>): void { store = { places, manual: {} }; save(); }

export const tripDetails = (): TripDetails => details;
export function setTripDetails(d: TripDetails): void {
  details = d;
  try { localStorage.setItem(DKEY, JSON.stringify(d)); } catch { /* private mode */ }
}

// ---- The ☆ ---------------------------------------------------------------------------------------------------------

/** A place to put in, as it is known when the ☆ is pressed (its city may be found then: the nearest guide city). */
export type PlaceSpec = Omit<Place, 'city'> & { city?: string | null };

async function resolve(spec: PlaceSpec): Promise<Place | null> {
  let city = spec.city ?? null;
  if (!city && spec.at) city = (await planHooks.nearestCity?.(spec.at)) ?? null;
  if (!city) { planHooks.toast?.(L('No city of the travel guide is near enough to plan this.', 'Ninguna ciudad de la guía de viaje está lo bastante cerca para planear esto.')); return null; }
  return { ...spec, city };
}

/** Puts it in or takes it out; says so. `why`: the reason it stands for (a work: in its museum). Returns whether it
 * is in the trip now. */
export async function togglePlace(spec: PlaceSpec, why?: Why): Promise<boolean> {
  if (inPlan(spec.id, why?.k)) {
    removePlace(spec.id, why?.k);
    planHooks.toast?.(L('Taken out of your trip.', 'Quitado de tu viaje.'));
    return false;
  }
  const p = await resolve(why ? { ...spec, why: [why] } : { ...spec, self: true });
  if (!p) return false;
  addPlace(p);
  const c = planHooks.city?.(p.city);
  planHooks.toast?.(L(`In your trip, in ${c?.name ?? p.city}.`, `En tu viaje, en ${c?.name ?? p.city}.`));
  return true;
}

/** The small ☆ beside a row (★ once it is in the trip). */
export function planStar(spec: PlaceSpec, why?: Why): HTMLElement {
  const b = h('button', { type: 'button', class: 'plan-star', 'data-plan': why?.k ? `${spec.id}#${why.k}` : spec.id }) as HTMLButtonElement;
  const paint = () => {
    const on = inPlan(spec.id, why?.k);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
    const label = on ? L('In your trip: take it out', 'En tu viaje: quitarlo') : L('Add to your trip', 'Agregar a tu viaje');
    b.title = label; b.setAttribute('aria-label', label);
  };
  b.append(icon(Star, 16));
  b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); void togglePlace(spec, why).then(paint); });
  paint();
  const off = onPlan(() => { if (!b.isConnected) { off(); return; } paint(); });
  return b;
}

/** The card's button: "☆ Add to my trip" / "★ In my trip". */
export function planLink(spec: PlaceSpec, why?: Why): { label: string; onClick: (e?: Event) => void } {
  const text = (on: boolean) => (on ? L('★ In my trip', '★ En mi viaje') : L('☆ Add to my trip', '☆ Agregar a mi viaje'));
  return {
    label: text(inPlan(spec.id, why?.k)),
    onClick: (e?: Event) => {
      const el = e?.currentTarget as HTMLElement | undefined;
      void togglePlace(spec, why).then((on) => { if (el) el.textContent = text(on); });
    },
  };
}
