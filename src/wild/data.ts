// Wild world (v0.30.0): the animals, the parks and the zoos (public/data/wild, from Wikidata and GBIF), and the grid
// their ranges are kept on: GBIF's map squares, 256 columns × 128 rows of 1.40625° (about 150 km at the equator).
import { loadJSON } from '../data/store';
import { lang } from '../app/i18n';
import { hasCell, unpackCells, unpackCounts } from '../layers/carpet';
import { appLocale } from '../app/i18n';

const es = () => lang() === 'es';
const L = (en: string, sp: string) => (es() ? sp : en);

export { COLS, ROWS, DEG, cellAt, cellCenter } from '../layers/carpet';

export type Group = 'mammals' | 'birds' | 'reptiles' | 'sea' | 'small';
export type Status = 'LC' | 'NT' | 'VU' | 'EN' | 'CR' | 'EW' | 'EX' | 'DD';

export interface Animal {
  i: number; id: string; q: string; sci: string; n: [string, string]; g: Group; g2?: Group; e: string;
  fam: string | null; ord: string | null; cls: string | null; st: Status | null; sl: number;
  f?: { kg?: number[]; m?: number[]; h?: number[]; y?: number[]; w?: number[] };
  img?: string; snd?: string; sndh?: string; gone?: number; last?: { en: string; es: string }; story?: number;
  cc: string[]; home: string; best: string[];
  /** Its squares, sorted, and how many sightings each has (0–9, log₂). */
  cells: Int32Array; counts: Uint8Array;
}
export interface Park { i: number; id: string; n: [string, string]; at: [number, number]; k: 'np' | 'res'; sl: number; cc: string | null; km2?: number; whs?: number; img?: string; f: string[] }
export interface Zoo { i: number; id: string; n: [string, string]; at: [number, number]; k: 'zoo' | 'aq'; sl: number; cc: string | null; img?: string }

export interface WildData {
  animals: Animal[];
  byId: Map<string, Animal>;
  /** Each square's animals, the best known first. */
  byCell: Map<number, Animal[]>;
  credit: string;
}

export const GROUPS: Record<Group, { icon: string; name: { en: string; es: string }; color: string }> = {
  mammals: { icon: '🦁', name: { en: 'Mammals', es: 'Mamíferos' }, color: '#f2b84b' },
  birds: { icon: '🦜', name: { en: 'Birds', es: 'Aves' }, color: '#74c0fc' },
  reptiles: { icon: '🐊', name: { en: 'Reptiles and amphibians', es: 'Reptiles y anfibios' }, color: '#8ce99a' },
  sea: { icon: '🐋', name: { en: 'Fish and sea life', es: 'Peces y vida marina' }, color: '#4dabf7' },
  small: { icon: '🦋', name: { en: 'Insects and other small creatures', es: 'Insectos y otros animales pequeños' }, color: '#e599f7' },
};
export const groupName = (g: Group) => (es() ? GROUPS[g].name.es : GROUPS[g].name.en);

/** IUCN Red List categories: their name and colour (the Red List's own scale). */
export const STATUS: Record<Status, { en: string; es: string; color: string; ink: string }> = {
  LC: { en: 'Least concern', es: 'Preocupación menor', color: '#2f9e44', ink: '#fff' },
  NT: { en: 'Near threatened', es: 'Casi amenazado', color: '#94d82d', ink: '#1b2a0a' },
  VU: { en: 'Vulnerable', es: 'Vulnerable', color: '#fcc419', ink: '#2b2100' },
  EN: { en: 'Endangered', es: 'En peligro', color: '#fd7e14', ink: '#fff' },
  CR: { en: 'Critically endangered', es: 'En peligro crítico', color: '#e03131', ink: '#fff' },
  EW: { en: 'Extinct in the wild', es: 'Extinto en estado silvestre', color: '#862e9c', ink: '#fff' },
  EX: { en: 'Extinct', es: 'Extinto', color: '#212529', ink: '#fff' },
  DD: { en: 'Data deficient', es: 'Datos insuficientes', color: '#868e96', ink: '#fff' },
};
export const statusName = (s: Status) => (es() ? STATUS[s].es : STATUS[s].en);
export const threatened = (s: Status | null) => s === 'VU' || s === 'EN' || s === 'CR';

export const nm = (x: { n: [string, string] }) => (es() ? x.n[1] : x.n[0]);

let wild: Promise<WildData | null> | null = null;
export function loadWild(): Promise<WildData | null> {
  wild ??= loadJSON<{ credit: string; animals: (Omit<Animal, 'i' | 'cells' | 'counts'> & { c: string; k: string })[] }>('wild/animals.json').then((d) => {
    const animals: Animal[] = d.animals.map((a, i) => {
      const { c, k, ...rest } = a;
      return { ...rest, i, cells: unpackCells(c), counts: unpackCounts(k) };
    });
    animals.sort((a, b) => b.sl - a.sl).forEach((a, i) => { a.i = i; });
    const byCell = new Map<number, Animal[]>();
    for (const a of animals) for (const c of a.cells) (byCell.get(c) ?? byCell.set(c, []).get(c)!).push(a);
    return { animals, byId: new Map(animals.map((a) => [a.id, a])), byCell, credit: d.credit };
  }).catch(() => { wild = null; return null; });
  return wild;
}

let parks: Promise<Park[] | null> | null = null;
export function loadParks(): Promise<Park[] | null> {
  parks ??= loadJSON<{ parks: Omit<Park, 'i'>[] }>('wild/parks.json').then((d) => d.parks.map((p, i) => ({ ...p, i }))).catch(() => { parks = null; return null; });
  return parks;
}
let zoos: Promise<Zoo[] | null> | null = null;
export function loadZoos(): Promise<Zoo[] | null> {
  zoos ??= loadJSON<{ zoos: Omit<Zoo, 'i'>[] }>('wild/zoos.json').then((d) => d.zoos.map((p, i) => ({ ...p, i }))).catch(() => { zoos = null; return null; });
  return zoos;
}

/** Does it live in this square? */
export function livesIn(a: Animal, c: number): boolean {
  return hasCell(a.cells, c);
}

/** Size, weight and lifespan as the card shows them ("120–250 kg", "up to 3.3 m"). */
export function factRows(a: Animal): { label: string; value: string; icon: string }[] {
  const f = a.f ?? {};
  const num = (x: number) => x.toLocaleString(appLocale(), { maximumFractionDigits: x < 1 ? 2 : x < 10 ? 1 : 0 });
  const span = (v: number[] | undefined, unit: (x: number) => string) => (v ? (v.length > 1 ? `${unit(v[0]).replace(/\s?\S+$/, '')}–${unit(v[1])}` : unit(v[0])) : null);
  const kg = (x: number) => (x >= 1000 ? `${num(x / 1000)} t` : x < 1 ? `${num(x * 1000)} g` : `${num(x)} kg`);
  const m = (x: number) => (x < 1 ? `${num(x * 100)} cm` : `${num(x)} m`);
  const y = (x: number) => (x < 1 ? L(`${num(Math.round(x * 12))} months`, `${num(Math.round(x * 12))} meses`) : L(`${num(x)} years`, `${num(x)} años`));
  const rows: { label: string; value: string; icon: string }[] = [];
  const w = span(f.kg, kg); if (w) rows.push({ label: L('Weight', 'Peso'), value: w, icon: '⚖️' });
  const len = span(f.m, m); if (len) rows.push({ label: L('Length', 'Longitud'), value: len, icon: '📏' });
  else { const ht = span(f.h, m); if (ht) rows.push({ label: L('Height', 'Altura'), value: ht, icon: '📏' }); }
  const ws = span(f.w, m); if (ws) rows.push({ label: L('Wingspan', 'Envergadura'), value: ws, icon: '🪶' });
  const life = span(f.y, y); if (life) rows.push({ label: L('Lives', 'Vive'), value: life, icon: '⏳' });
  return rows;
}

/** Animals of the same family (or order, for a family of one). */
export function relatives(d: WildData, a: Animal): Animal[] {
  const fam = d.animals.filter((b) => b !== a && a.fam && b.fam === a.fam);
  return fam.length ? fam : d.animals.filter((b) => b !== a && a.ord && b.ord === a.ord).slice(0, 12);
}
