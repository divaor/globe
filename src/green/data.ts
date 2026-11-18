// Green planet (v0.31.0): the plants, the botanical gardens, the famous trees, nature's calendar, the first crops and
// the ecoregions (public/data/green). Plants keep their ranges on the animals' grid (../layers/carpet.ts): GBIF's map
// squares of 1.40625°, about 150 km at the equator.
import { loadJSON } from '../data/store';
import { lang } from '../app/i18n';
import { hasCell, unpackCells, unpackCounts } from '../layers/carpet';
import type { Status } from '../wild/data';
import { appLocale } from '../app/i18n';

const es = () => lang() === 'es';

export type PlantGroup = 'trees' | 'flowers' | 'cacti' | 'strange' | 'food';

export interface Plant {
  i: number; id: string; q: string; sci: string; n: [string, string]; g: PlantGroup; e: string;
  fam: string | null; ord: string | null; st: Status | null; sl: number;
  /** Height (m) and lifespan (years), as Wikidata gives them. */
  f?: { h?: number[]; y?: number[] };
  img?: string; cc: string[]; home: string;
  /** The best places to see it: parks (wild/parks.json) and botanical gardens, by Wikidata id. */
  best: string[];
  /** Its crop's id in crops.json, for "Where it was first grown". */
  crop?: string;
  cells: Int32Array; counts: Uint8Array;
}
export interface Garden { i: number; id: string; n: [string, string]; at: [number, number]; k: 'bg' | 'arb'; sl: number; cc: string | null; img?: string; since?: number; f: string[] }
export interface FamousTree {
  i: number; id: string; n: [string, string]; at: [number, number]; sl: number; cc: string | null;
  /** Its species: [English, Spanish, Latin], and our plant's id when it is one of ours. */
  sp?: [string, string, string]; plant?: string;
  img?: string; q?: string;
  /** A record holder (tallest, oldest, widest…): what the record is. */
  rec?: { en: string; es: string };
  text?: { en: string; es: string };
  /** How old it is, in words ("about 4,850 years"), and its height in metres. */
  age?: { en: string; es: string }; h?: number; since?: number;
  /** Kept secret to protect it: drawn at its park, not where it stands. */
  secret?: boolean;
  /** Where it stands, said in words (a park, a village). */
  place?: { en: string; es: string };
  status?: 'alive' | 'gone' | 'fallen';
  src?: string[];
}
export type SpectacleKind = 'bloom' | 'autumn' | 'green' | 'animal';
export interface Spectacle {
  id: string; kind: SpectacleKind; e: string; n: { en: string; es: string }; at: [number, number]; place: { en: string; es: string }; cc: string | null;
  /** Its months (1–12) and its best one. */
  months: number[]; peak: number;
  text: { en: string; es: string }; how?: { en: string; es: string }; sci?: string; src: string[];
}
export interface Crop {
  id: string; e: string; n: { en: string; es: string }; sci: string;
  origin: { at: [number, number]; place: { en: string; es: string }; km: number };
  /** When it was first grown: a year (negative: BC) and how sure that is, said in words. */
  date: number; dateNote?: { en: string; es: string };
  spread: { from: [number, number]; to: [number, number]; date: number; label: { en: string; es: string } }[];
  text: { en: string; es: string }; today?: { en: string; es: string };
  /** A step of a Food story about it: [collection, story id, step numbered from 1]. */
  story?: [string, string, number];
  plant?: string; src: string[];
}

export interface GreenData {
  plants: Plant[];
  byId: Map<string, Plant>;
  bySci: Map<string, Plant>;
  /** Each square's plants, the best known first. */
  byCell: Map<number, Plant[]>;
  credit: string;
}

export const PLANT_GROUPS: Record<PlantGroup, { icon: string; name: { en: string; es: string }; color: string }> = {
  trees: { icon: '🌳', name: { en: 'Trees', es: 'Árboles' }, color: '#2f9e44' },
  flowers: { icon: '🌸', name: { en: 'Flowers', es: 'Flores' }, color: '#f783ac' },
  cacti: { icon: '🌵', name: { en: 'Cacti and succulents', es: 'Cactus y suculentas' }, color: '#a9e34b' },
  strange: { icon: '🪤', name: { en: 'Carnivorous and strange', es: 'Carnívoras y extrañas' }, color: '#cc5de8' },
  food: { icon: '🍫', name: { en: 'Food plants in the wild', es: 'Plantas de comer en estado silvestre' }, color: '#f59f00' },
};
export const plantGroupName = (g: PlantGroup) => (es() ? PLANT_GROUPS[g].name.es : PLANT_GROUPS[g].name.en);

export const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const monthName = (m: number) => (es() ? MONTHS_ES : MONTHS_EN)[((m % 12) + 12) % 12];

export const nm = (x: { n: [string, string] }) => (es() ? x.n[1] : x.n[0]);
export const tt = (x: { en: string; es: string } | undefined | null) => (x ? (es() ? x.es : x.en) : '');

let green: Promise<GreenData | null> | null = null;
export function loadGreen(): Promise<GreenData | null> {
  green ??= loadJSON<{ credit: string; plants: (Omit<Plant, 'i' | 'cells' | 'counts'> & { c: string; k: string })[] }>('green/plants.json').then((d) => {
    const plants: Plant[] = d.plants.map((p, i) => {
      const { c, k, ...rest } = p;
      return { ...rest, i, cells: unpackCells(c), counts: unpackCounts(k) };
    });
    plants.sort((a, b) => b.sl - a.sl).forEach((p, i) => { p.i = i; });
    const byCell = new Map<number, Plant[]>();
    for (const p of plants) for (const c of p.cells) (byCell.get(c) ?? byCell.set(c, []).get(c)!).push(p);
    return { plants, byId: new Map(plants.map((p) => [p.id, p])), bySci: new Map(plants.map((p) => [p.sci.toLowerCase(), p])), byCell, credit: d.credit };
  }).catch(() => { green = null; return null; });
  return green;
}

function lazy<T>(file: string, key: string, map?: (x: T, i: number) => T): () => Promise<T[] | null> {
  let p: Promise<T[] | null> | null = null;
  return () => {
    p ??= loadJSON<Record<string, T[]>>(file).then((d) => (map ? d[key].map(map) : d[key])).catch(() => { p = null; return null; });
    return p;
  };
}
export const loadGardens = lazy<Garden>('green/gardens.json', 'gardens', (g, i) => ({ ...g, i }));
export const loadTrees = lazy<FamousTree>('green/trees.json', 'trees', (t, i) => ({ ...t, i }));
export const loadCalendar = lazy<Spectacle>('green/calendar.json', 'spectacles');
export const loadCrops = lazy<Crop>('green/crops.json', 'crops');

/** Does it grow in this square? */
export function growsIn(p: Plant, c: number): boolean {
  return hasCell(p.cells, c);
}

/** Height and lifespan as the card shows them ("up to 115 m", "4,800 years"). */
export function plantFacts(p: Plant): { label: string; value: string; icon: string }[] {
  const f = p.f ?? {};
  const L = (en: string, sp: string) => (es() ? sp : en);
  const num = (x: number) => x.toLocaleString(appLocale(), { maximumFractionDigits: x < 1 ? 2 : x < 10 ? 1 : 0 });
  const m = (x: number) => (x < 1 ? `${num(x * 100)} cm` : `${num(x)} m`);
  const y = (x: number) => L(`${num(x)} years`, `${num(x)} años`);
  const span = (v: number[] | undefined, unit: (x: number) => string) => (v ? (v.length > 1 ? `${unit(v[0]).replace(/\s?\S+$/, '')}–${unit(v[1])}` : L(`up to ${unit(v[0])}`, `hasta ${unit(v[0])}`)) : null);
  const rows: { label: string; value: string; icon: string }[] = [];
  const ht = span(f.h, m); if (ht) rows.push({ label: L('Height', 'Altura'), value: ht, icon: '📏' });
  const life = span(f.y, y); if (life) rows.push({ label: L('Lives', 'Vive'), value: life, icon: '⏳' });
  return rows;
}

/** Plants of the same family (or order, for a family of one). */
export function plantRelatives(d: GreenData, p: Plant): Plant[] {
  const fam = d.plants.filter((b) => b !== p && p.fam && b.fam === p.fam);
  return fam.length ? fam : d.plants.filter((b) => b !== p && p.ord && b.ord === p.ord).slice(0, 12);
}

/** A year as people say it: "8000 BC", "1492". */
export function yearText(y: number): string {
  const L = (en: string, sp: string) => (es() ? sp : en);
  if (y < 0) return L(`${Math.abs(y).toLocaleString(appLocale())} BC`, `${Math.abs(y).toLocaleString(appLocale())} a. C.`);
  return String(y);
}

/** The biomes of RESOLVE Ecoregions 2017 (BIOME_NUM): their names and the colours the map uses. */
export const BIOMES: Record<number, { en: string; es: string; color: string }> = {
  1: { en: 'Tropical and subtropical moist broadleaf forests', es: 'Bosques húmedos tropicales y subtropicales', color: '#1b7837' },
  2: { en: 'Tropical and subtropical dry broadleaf forests', es: 'Bosques secos tropicales y subtropicales', color: '#9ccb5b' },
  3: { en: 'Tropical and subtropical coniferous forests', es: 'Bosques de coníferas tropicales y subtropicales', color: '#53a46d' },
  4: { en: 'Temperate broadleaf and mixed forests', es: 'Bosques templados de hoja ancha y mixtos', color: '#3c8f4a' },
  5: { en: 'Temperate conifer forests', es: 'Bosques templados de coníferas', color: '#2a6b57' },
  6: { en: 'Boreal forests and taiga', es: 'Bosques boreales y taiga', color: '#6b9e8a' },
  7: { en: 'Tropical and subtropical grasslands, savannas and shrublands', es: 'Pastizales, sabanas y matorrales tropicales y subtropicales', color: '#d9c45c' },
  8: { en: 'Temperate grasslands, savannas and shrublands', es: 'Pastizales, sabanas y matorrales templados', color: '#e6d993' },
  9: { en: 'Flooded grasslands and savannas', es: 'Pastizales y sabanas inundables', color: '#5bbcb0' },
  10: { en: 'Montane grasslands and shrublands', es: 'Pastizales y matorrales de montaña', color: '#b59d7a' },
  11: { en: 'Tundra', es: 'Tundra', color: '#a9c8d6' },
  12: { en: 'Mediterranean forests, woodlands and scrub', es: 'Bosques, arbolados y matorrales mediterráneos', color: '#c98d4a' },
  13: { en: 'Deserts and xeric shrublands', es: 'Desiertos y matorrales xéricos', color: '#f2d6a2' },
  14: { en: 'Mangroves', es: 'Manglares', color: '#0e7c86' },
};
export const biomeName = (b: number) => (BIOMES[b] ? (es() ? BIOMES[b].es : BIOMES[b].en) : (es() ? 'Roca y hielo' : 'Rock and ice'));

/** The eight biogeographic realms, in Spanish. */
export const REALMS: Record<string, string> = {
  Afrotropic: 'Afrotropical', Antarctica: 'Antártico', Australasia: 'Australasia', Indomalayan: 'Indomalayo', Nearctic: 'Neártico',
  Neotropic: 'Neotropical', Oceania: 'Oceánico', Palearctic: 'Paleártico',
};
export const realmName = (r: string) => (es() ? REALMS[r] ?? r : r);

/** How much of an ecoregion is protected (RESOLVE's "Nature Needs Half" class). */
export const PROTECTION: Record<number, { en: string; es: string; color: string }> = {
  1: { en: 'Half protected', es: 'Protegida en la mitad', color: '#2f9e44' },
  2: { en: 'Could reach half protected', es: 'Podría llegar a la mitad protegida', color: '#94d82d' },
  3: { en: 'Could recover', es: 'Podría recuperarse', color: '#fab005' },
  4: { en: 'Imperiled', es: 'En peligro', color: '#e03131' },
};
