// Art and architecture data (v0.27.0): museums and their best-known works, the artists, notable buildings with their
// architects and styles, and where our own art items are now (public/data/artguide, built by
// scripts/data/artguide/build-artguide.mjs from Wikidata). Loaded once, when first needed.
import { loadJSON } from '../data/store';
import { lang, L } from '../app/i18n';

const es = () => lang() === 'es';
export type WorkKind = 'painting' | 'sculpture' | 'antiquity' | 'object';
export interface Museum { i: number; id: string; name: [string, string]; at: [number, number]; city: string; visitors: number; sl: number; web: string | null }
export interface Artist { i: number; id: string; name: [string, string]; sl: number }
export interface Work { id: string; name: [string, string]; kind: WorkKind; museum: Museum; artist: Artist | null; year: number | null; img: string | null; sl: number }
export interface Style { key: string; name: [string, string]; color: string }
export interface Architect { i: number; id: string; name: [string, string]; sl: number }
export interface Building { id: string; name: [string, string]; at: [number, number]; city: string | null; architects: Architect[]; style: Style | null; year: number | null; img: string | null; sl: number }
export interface ArtData {
  museums: Museum[]; works: Work[]; artists: Artist[]; byMuseum: Map<string, Work[]>; byArtist: Map<string, Work[]>; museumById: Map<string, Museum>;
}
export interface ArchData { styles: Style[]; architects: Architect[]; buildings: Building[]; byArchitect: Map<string, Building[]> }

/** A row's English and Spanish names (a Spanish name of 0 is the same as the English one). */
const two = (r: unknown[]): [string, string] => [r[1] as string, (r[2] as string) || (r[1] as string)];
let art: Promise<ArtData | null> | null = null;
let arch: Promise<ArchData | null> | null = null;
let now: Promise<Record<string, [string, string, string, string | null]>> | null = null;

export function loadArt(): Promise<ArtData | null> {
  art ??= loadJSON<{ museums: unknown[][]; works: unknown[][]; artists: unknown[][] }>('artguide/collections.json').then((d) => {
    const museums: Museum[] = d.museums.map((r, i) => ({ i, id: r[0] as string, name: two(r), at: [r[3] as number, r[4] as number], city: r[5] as string, visitors: r[6] as number, sl: r[7] as number, web: r[8] as string | null }));
    const artists: Artist[] = d.artists.map((r, i) => ({ i, id: r[0] as string, name: two(r), sl: r[3] as number }));
    const works: Work[] = d.works.map((r) => ({ id: r[0] as string, name: two(r), kind: r[3] as WorkKind, museum: museums[r[4] as number], artist: (r[5] as number) >= 0 ? artists[r[5] as number] : null, year: r[6] as number | null, img: r[7] as string | null, sl: r[8] as number }));
    const byMuseum = new Map<string, Work[]>(), byArtist = new Map<string, Work[]>();
    for (const w of works) {
      (byMuseum.get(w.museum.id) ?? byMuseum.set(w.museum.id, []).get(w.museum.id)!).push(w);
      if (w.artist) (byArtist.get(w.artist.id) ?? byArtist.set(w.artist.id, []).get(w.artist.id)!).push(w);
    }
    return { museums, works, artists, byMuseum, byArtist, museumById: new Map(museums.map((m) => [m.id, m])) };
  }).catch(() => { art = null; return null; });
  return art;
}

export function loadArch(): Promise<ArchData | null> {
  arch ??= loadJSON<{ styles: unknown[][]; architects: unknown[][]; buildings: unknown[][] }>('artguide/architecture.json').then((d) => {
    const styles: Style[] = d.styles.map((r) => ({ key: r[0] as string, name: [r[1] as string, r[2] as string], color: r[3] as string }));
    const sm = new Map(styles.map((s) => [s.key, s]));
    const architects: Architect[] = d.architects.map((r, i) => ({ i, id: r[0] as string, name: two(r), sl: r[3] as number }));
    const buildings: Building[] = d.buildings.map((r) => ({ id: r[0] as string, name: two(r), at: [r[3] as number, r[4] as number], city: r[5] as string | null, architects: (r[6] as number[]).map((i) => architects[i]), style: sm.get(r[7] as string) ?? null, year: r[8] as number | null, img: r[9] as string | null, sl: r[10] as number }));
    const byArchitect = new Map<string, Building[]>();
    for (const b of buildings) for (const a of b.architects) (byArchitect.get(a.id) ?? byArchitect.set(a.id, []).get(a.id)!).push(b);
    return { styles, architects, buildings, byArchitect };
  }).catch(() => { arch = null; return null; });
  return arch;
}

/** Where our art items are now: item id → [Wikidata id, name, nombre, guide city or null]. */
export function loadNowIn() {
  now ??= loadJSON<{ items: Record<string, [string, string, string, string | null]> }>('artguide/nowin.json').then((d) => d.items).catch(() => { now = null; return {}; });
  return now;
}

export const nm = (x: { name: [string, string] }) => (es() ? x.name[1] : x.name[0]);
/** "1503", "c. 140 BC". */
export function yearText(y: number | null): string {
  if (y == null) return '';
  return y < 0 ? (L('{0} BC', '{0} a. C.', -y)) : String(y);
}
export const commons = (file: string, w = 330) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=${w}`;
export const commonsPage = (file: string) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`;
/** A Wikidata item's Wikipedia article in the reader's language (Wikidata sends the reader on). */
export const wikiOf = (qid: string) => `https://www.wikidata.org/wiki/Special:GoToLinkedPage/${lang()}wiki/${qid}`;

const credits = new Map<string, Promise<{ licence: string; author: string } | null>>();
/** A Commons file's licence and author, read live from Commons (shown under its picture). */
export function commonsCredit(file: string): Promise<{ licence: string; author: string } | null> {
  if (!credits.has(file)) {
    credits.set(file, fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=extmetadata&iiextmetadatafilter=LicenseShortName%7CArtist&titles=${encodeURIComponent(`File:${file}`)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { query?: { pages?: Record<string, { imageinfo?: { extmetadata?: { LicenseShortName?: { value: string }; Artist?: { value: string } } }[] }> } } | null) => {
        const meta = Object.values(j?.query?.pages ?? {})[0]?.imageinfo?.[0]?.extmetadata;
        if (!meta?.LicenseShortName) return null;
        const strip = (s: string) => new DOMParser().parseFromString(s, 'text/html').body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        return { licence: strip(meta.LicenseShortName.value), author: meta.Artist ? strip(meta.Artist.value).slice(0, 80) : '' };
      })
      .catch(() => null));
  }
  return credits.get(file)!;
}

/** The kinds of works, as the city art guide filters them. */
export const KINDS: [WorkKind | 'all', { en: string; es: string; ctx?: string }, string][] = [
  ['all', { en: 'All', es: 'Todo', ctx: 'everything' }, '🖼️'], ['painting', { en: 'Paintings', es: 'Pinturas' }, '🎨'], ['sculpture', { en: 'Sculpture', es: 'Escultura' }, '🗿'],
  ['antiquity', { en: 'Antiquities', es: 'Antigüedades' }, '🏺'], ['object', { en: 'Other treasures', es: 'Otros tesoros' }, '💎'],
];
/** Periods, as the city art guide filters them. */
export const PERIODS: [string, { en: string; es: string }, number, number][] = [
  ['all', { en: 'Any time', es: 'Cualquier época' }, -Infinity, Infinity],
  ['ancient', { en: 'Before 500', es: 'Antes de 500' }, -Infinity, 500],
  ['medieval', { en: '500–1400', es: '500–1400' }, 500, 1400],
  ['renaissance', { en: '1400–1600', es: '1400–1600' }, 1400, 1600],
  ['baroque', { en: '1600–1800', es: '1600–1800' }, 1600, 1800],
  ['1800s', { en: '1800–1900', es: '1800–1900' }, 1800, 1900],
  ['modern', { en: 'Since 1900', es: 'Desde 1900' }, 1900, Infinity],
];
export const kindIcon = (k: WorkKind) => KINDS.find((x) => x[0] === k)?.[2] ?? '🖼️';

// ---- The trip's places (v0.31.2) ------------------------------------------------------------------------------------
/** A museum as a place of the trip, with the works to see there as its reasons. */
export const museumPlace = (m: Museum, works: Work[] = []) => ({
  id: `museum:${m.id}`, kind: 'museum' as const, city: m.city, n: m.name, at: m.at, url: m.web ?? wikiOf(m.id),
  ...(works.length ? { why: works.map((w) => ({ k: `work:${w.id}`, t: [w.name[0], w.name[1]] as [string, string] })) } : {}),
});
/** A work's reason to go to its museum. */
export const workWhy = (w: Work) => ({ k: `work:${w.id}`, t: [`${w.name[0]}${w.artist ? ` (${w.artist.name[0]})` : ''}`, `${w.name[1]}${w.artist ? ` (${w.artist.name[1]})` : ''}`] as [string, string] });
/** A building as a place of the trip (its city: the guide's, or the nearest one). */
export const buildingPlace = (b: Building) => ({
  id: `building:${b.id}`, kind: 'building' as const, city: b.city, n: b.name, at: b.at, url: wikiOf(b.id),
  ...(b.architects.length ? { why: [{ t: [b.architects.map((a) => a.name[0]).join(', '), b.architects.map((a) => a.name[1]).join(', ')] as [string, string] }] } : {}),
});
