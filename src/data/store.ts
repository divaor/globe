// Loads and caches map data. Countries come in three levels of detail (110m, 50m, 10m); the
// renderer picks one by zoom and whether the view is moving, and culls by bounding box.
import { feature, mesh } from 'topojson-client';
import { geoArea, geoBounds, geoDistance } from 'd3-geo';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Geometry, LineString, MultiLineString } from 'geojson';

export type LOD = '110m' | '50m' | '10m';
export type BBox = [number, number, number, number]; // west, south, east, north (west > east when crossing 180°)

export interface CountryMeta {
  n: string; es: string; sn?: string; ses?: string; ab?: string | null; ct: string; rg: string; sr: string; mc: number; mc13: number;
  lx: number; ly: number; lr: number; ml: number; pop: number; gdp: number; eco: string; inc: string;
  type: string; sov: string; sovA3?: string; iso?: string; a2: string | null; wd?: string;
}

export interface Shape<P = Record<string, unknown>> {
  id: string;
  feature: Feature<Geometry, P>;
  bbox: BBox;
}

export interface Line { geometry: LineString; bbox: BBox }

export interface BaseLevel {
  lod: LOD;
  countries: Shape[];
  byId: Map<string, Shape>;
  borders: Line[];
  coast: Line[];
}

export interface City {
  lon: number; lat: number; name: string; es: string | null; pop: number; minZoom: number;
  capital: 0 | 1 | 2; flags: number; country: string; tz: string | null; admin1: string | null;
}

const BASE_URL = new URL(/* @vite-ignore */ './', document.baseURI).href;
declare const __APP_VERSION__: string;
/** A data file's address. Its app version (?v=0.15.0) keeps the offline cache from answering a new version of
 * the app with an older copy of a file: a phone once got last version's country facts, without the language
 * families a new quiz needed. Flags never change, so they stay unversioned. */
export const dataUrl = (path: string) => {
  const u = new URL(`data/${path}`, BASE_URL);
  if (!path.startsWith('../')) u.searchParams.set('v', __APP_VERSION__);
  return u.href;
};

const jsonCache = new Map<string, Promise<unknown>>();
export function loadJSON<T = unknown>(path: string): Promise<T> {
  let p = jsonCache.get(path);
  if (!p) {
    p = fetch(dataUrl(path)).then((r) => {
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      return r.json();
    });
    p.catch(() => jsonCache.delete(path));
    jsonCache.set(path, p);
  }
  return p as Promise<T>;
}

export function bboxOf(f: Feature | Geometry | { type: string }): BBox {
  const b = geoBounds(f as never);
  return [b[0][0], b[0][1], b[1][0], b[1][1]];
}

/** Rough test: can a bbox be within `radius` (radians) of `center`? Conservative. */
export function bboxNear(b: BBox, center: [number, number], radius: number): boolean {
  if (radius >= Math.PI * 0.999) return true;
  const [w, s, e, n] = b;
  const [cl, cp] = center;
  const lat = Math.max(s, Math.min(n, cp));
  let lon: number;
  const inside = w <= e ? cl >= w && cl <= e : cl >= w || cl <= e;
  if (inside) lon = cl;
  else {
    const dw = Math.abs(((cl - w + 540) % 360) - 180), de = Math.abs(((cl - e + 540) % 360) - 180);
    lon = dw < de ? w : e;
  }
  return geoDistance(center, [lon, lat]) <= radius + 0.03;
}

/** Splits a MultiLineString into chunks with their own bbox so they can be culled. */
export function chunkLines(m: MultiLineString, maxPts = 160): Line[] {
  const out: Line[] = [];
  for (const line of m.coordinates) {
    for (let i = 0; i < line.length - 1; i += maxPts - 1) {
      const coords = line.slice(i, Math.min(line.length, i + maxPts));
      if (coords.length < 2) continue;
      const g: LineString = { type: 'LineString', coordinates: coords };
      out.push({ geometry: g, bbox: bboxOf(g) });
    }
  }
  return out;
}

export function shapesFrom<P = Record<string, unknown>>(topo: Topology, objectName: string, idOf?: (p: P, i: number) => string): Shape<P>[] {
  const fc = feature(topo, topo.objects[objectName] as GeometryCollection) as unknown as { features: Feature<Geometry, P>[] };
  return fc.features.filter((f) => f.geometry).map((f, i) => {
    fixWinding(f.geometry);
    return { id: idOf ? idOf(f.properties, i) : String(f.id ?? i), feature: f, bbox: bboxOf(f) };
  });
}

/**
 * d3 draws polygons on the sphere, so a ring wound the wrong way means "the whole Earth except this
 * shape" and would paint over the map. No shape in this app is bigger than a hemisphere, so any
 * polygon that is gets its rings reversed.
 */
export function fixWinding(g: Geometry): void {
  const flip = (rings: number[][][]) => rings.map((r) => r.slice().reverse());
  if (g.type === 'Polygon') {
    if (geoArea(g) > 2 * Math.PI) g.coordinates = flip(g.coordinates);
  } else if (g.type === 'MultiPolygon') {
    g.coordinates = g.coordinates.map((p) => (geoArea({ type: 'Polygon', coordinates: p }) > 2 * Math.PI ? flip(p) : p));
  }
}

export class DataStore {
  meta: Record<string, CountryMeta> = {};
  cities: City[] = [];
  private levels: Partial<Record<LOD, BaseLevel>> = {};
  private pending: Partial<Record<LOD, Promise<BaseLevel>>> = {};
  onLevelLoaded: (lod: LOD) => void = () => {};

  async init(): Promise<void> {
    const [meta] = await Promise.all([
      loadJSON<Record<string, CountryMeta>>('base/countries-meta.json'),
      this.ensure('110m'),
    ]);
    this.meta = meta;
    // Cities and the 50m level load right after first paint.
    loadJSON<{ fields: string[]; rows: unknown[][] }>('base/cities.json').then((c) => {
      this.cities = c.rows.map((r) => ({
        lon: r[0] as number, lat: r[1] as number, name: r[2] as string, es: (r[3] as string) || null,
        pop: r[4] as number, minZoom: r[5] as number, capital: r[6] as 0 | 1 | 2, flags: r[7] as number,
        country: r[8] as string, tz: (r[9] as string) || null, admin1: (r[10] as string) || null,
      }));
      this.onLevelLoaded('110m');
    });
  }

  level(lod: LOD): BaseLevel | undefined {
    return this.levels[lod];
  }

  /** Best loaded level at or below the wanted detail; kicks off loading of the wanted one. */
  best(want: LOD): BaseLevel {
    const order: LOD[] = ['10m', '50m', '110m'];
    const i = order.indexOf(want);
    if (!this.levels[want]) void this.ensure(want);
    for (const lod of order.slice(i)) if (this.levels[lod]) return this.levels[lod]!;
    for (const lod of order) if (this.levels[lod]) return this.levels[lod]!;
    throw new Error('no country data loaded');
  }

  ensure(lod: LOD): Promise<BaseLevel> {
    if (this.levels[lod]) return Promise.resolve(this.levels[lod]!);
    if (!this.pending[lod]) {
      this.pending[lod] = loadJSON<Topology>(`base/countries-${lod}.json`).then((topo) => {
        const countries = shapesFrom(topo, 'countries');
        const obj = topo.objects.countries as GeometryCollection;
        const borders = chunkLines(mesh(topo, obj, (a, b) => a !== b) as MultiLineString);
        const coast = chunkLines(mesh(topo, obj, (a, b) => a === b) as MultiLineString);
        const level: BaseLevel = { lod, countries, byId: new Map(countries.map((c) => [c.id, c])), borders, coast };
        this.levels[lod] = level;
        this.onLevelLoaded(lod);
        return level;
      });
    }
    return this.pending[lod]!;
  }

  name(id: string, lang: string): string {
    const m = this.meta[id];
    if (!m) return id;
    return lang === 'es' ? m.es || m.n : m.n;
  }
}
