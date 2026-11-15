// States and provinces (first-level divisions of every country, Natural Earth 1:10m, public domain): the lines
// between them, drawn from country zoom on (see Renderer), their names, and which one a point is in.
import { geoArea, geoContains } from 'd3-geo';
import { mesh } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { MultiLineString } from 'geojson';
import { chunkLines, loadJSON, shapesFrom, type Line, type Shape } from '../data/store';

interface RegionProps { n: string; es?: string; a: string; t?: string | null; lr: number; lx: number; ly: number }

export interface Region {
  name: string;
  es: string;
  /** The country (ISO 3166 alpha-3, as Natural Earth gives it). */
  country: string;
  /** What the country calls them: State, Province, Region, Department... */
  type: string | null;
  /** Natural Earth's label rank: the lower, the earlier its name shows. */
  rank: number;
  /** Where its name goes. */
  lon: number; lat: number;
  /** Its size: the diameter of a circle of the same area, in radians. */
  size: number;
  shape: Shape<RegionProps>;
}

export interface Regions {
  /** The lines between two regions of one country (country borders and coasts are drawn with the countries). */
  lines: Line[];
  regions: Region[];
}

let data: Regions | null = null;
let pending: Promise<Regions> | null = null;

/** The regions, once loaded (null before). */
export function regions(): Regions | null { return data; }

/** Loads the regions (about 1.5 MB, once). */
export function loadRegions(): Promise<Regions> {
  pending ??= loadJSON<Topology>('base/admin1.json').then((topo) => {
    const obj = topo.objects.admin1 as GeometryCollection<RegionProps>;
    const lines = chunkLines(mesh(topo, obj as GeometryCollection, (a, b) =>
      a !== b && (a.properties as RegionProps).a === (b.properties as RegionProps).a) as MultiLineString);
    const shapes = shapesFrom<RegionProps>(topo, 'admin1');
    const list: Region[] = [];
    for (const s of shapes) {
      const p = s.feature.properties;
      if (!p?.n) continue;
      const area = geoArea(s.feature);
      list.push({
        name: p.n, es: p.es || p.n, country: p.a, type: p.t && p.t !== 'null' ? p.t : null, rank: p.lr ?? 9,
        lon: p.lx, lat: p.ly, size: 2 * Math.sqrt(area / Math.PI), shape: s,
      });
    }
    // Bigger regions first: their names are placed before the small ones'.
    list.sort((a, b) => b.size - a.size);
    data = { lines, regions: list };
    return data;
  });
  pending.catch(() => { pending = null; });
  return pending;
}

/** The region a point is in, if the regions are loaded. */
export function regionAt(lon: number, lat: number): Region | null {
  if (!data) return null;
  for (const r of data.regions) {
    const [w, s, e, n] = r.shape.bbox;
    if (lat < s || lat > n) continue;
    if (w <= e ? lon < w || lon > e : lon < w && lon > e) continue;
    if (geoContains(r.shape.feature, [lon, lat])) return r;
  }
  return null;
}

const TYPES_ES: Record<string, string> = {
  State: 'Estado', Province: 'Provincia', Region: 'Región', Department: 'Departamento', District: 'Distrito',
  County: 'Condado', Prefecture: 'Prefectura', Municipality: 'Municipio', Governorate: 'Gobernación', Parish: 'Parroquia',
  Territory: 'Territorio', 'Autonomous Community': 'Comunidad autónoma', 'Autonomous Region': 'Región autónoma',
  'Metropolitan department': 'Departamento', 'Federal District': 'Distrito federal', Canton: 'Cantón', Oblast: 'Óblast',
  Republic: 'República', Krai: 'Krai', 'Capital District': 'Distrito capital', 'Federal Territory': 'Territorio federal',
  Emirate: 'Emirato', Division: 'División', Island: 'Isla', 'Island council': 'Isla', 'Commune|Municipality': 'Comuna',
  Commune: 'Comuna', 'Statistical Region': 'Región', 'Unitary Authority': 'Autoridad unitaria', Voivodeship: 'Voivodato',
  'Autonomous Province': 'Provincia autónoma', 'Capital City': 'Ciudad capital', Area: 'Área', Zone: 'Zona',
};

/** "State", "Province"… in the reader's language; null when Natural Earth does not say. */
export function regionType(r: Region, es: boolean): string | null {
  const t = r.type?.split('|')[0] ?? null;
  if (!t) return null;
  return es ? TYPES_ES[r.type!] ?? TYPES_ES[t] ?? null : t;
}
