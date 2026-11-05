// Projection registry. Every projection is described by its d3 "raw" function (radians in,
// unitless x/y out) so that the vector renderer (d3 on Canvas) and the raster renderer (WebGL,
// same formulas in GLSL — see gl.ts) produce identical geometry, and so that any two projections
// can be morphed by interpolating their raw outputs.
import {
  geoOrthographicRaw, geoEquirectangularRaw, geoMercatorRaw, geoNaturalEarth1Raw, geoEqualEarthRaw,
  geoAzimuthalEqualAreaRaw, geoAzimuthalEquidistantRaw, geoStereographicRaw,
  type GeoRawProjection,
} from 'd3-geo';
import {
  geoRobinsonRaw, geoWinkel3Raw, geoMollweideRaw, geoEckert4Raw, geoMillerRaw, geoCylindricalEqualAreaRaw,
} from 'd3-geo-projection';

export type ProjectionId =
  | 'globe' | 'equirectangular' | 'mercator' | 'miller' | 'robinson' | 'winkel3' | 'equalEarth'
  | 'naturalEarth' | 'mollweide' | 'gallPeters' | 'eckert4' | 'azimuthalEquidistant'
  | 'azimuthalEqualArea' | 'stereographic';

/** globe: orthographic; azimuthal: centred on a point, rotates freely; flat: north-up world map. */
export type ProjectionKind = 'globe' | 'azimuthal' | 'flat';

export interface ProjectionDef {
  id: ProjectionId;
  /** Index of this projection's raw function in the GLSL shader. */
  gl: number;
  kind: ProjectionKind;
  raw: GeoRawProjection;
  /** Clip angle in degrees for globe/azimuthal projections (small-circle clip around the centre). */
  clipAngle?: number;
  /** Raw-space bounds over the visible sphere: [xmin, ymin, xmax, ymax]. Filled in at start-up. */
  bounds: [number, number, number, number];
  /** Short property for the UI: what the projection is good at. */
  property: 'conformal' | 'equal-area' | 'compromise' | 'equidistant' | 'perspective';
}

const MERCATOR_MAX_LAT = (85.0511287798 * Math.PI) / 180;
const clampLat = (phi: number, max: number) => Math.max(-max, Math.min(max, phi));

function withInvert(f: (l: number, p: number) => [number, number], base: GeoRawProjection): GeoRawProjection {
  const r = f as GeoRawProjection;
  if (base.invert) r.invert = base.invert.bind(base);
  return r;
}

const mercator = withInvert((l, p) => geoMercatorRaw(l, clampLat(p, MERCATOR_MAX_LAT)) as [number, number], geoMercatorRaw);
const miller = withInvert((l, p) => geoMillerRaw(l, clampLat(p, (89.5 * Math.PI) / 180)) as [number, number], geoMillerRaw);
const gallPeters = geoCylindricalEqualAreaRaw(Math.PI / 4);

const defs: Omit<ProjectionDef, 'bounds'>[] = [
  { id: 'globe', gl: 0, kind: 'globe', raw: geoOrthographicRaw, clipAngle: 90, property: 'perspective' },
  { id: 'equirectangular', gl: 1, kind: 'flat', raw: geoEquirectangularRaw, property: 'equidistant' },
  { id: 'mercator', gl: 2, kind: 'flat', raw: mercator, property: 'conformal' },
  { id: 'miller', gl: 3, kind: 'flat', raw: miller, property: 'compromise' },
  { id: 'robinson', gl: 4, kind: 'flat', raw: geoRobinsonRaw, property: 'compromise' },
  { id: 'winkel3', gl: 5, kind: 'flat', raw: geoWinkel3Raw, property: 'compromise' },
  { id: 'equalEarth', gl: 6, kind: 'flat', raw: geoEqualEarthRaw, property: 'equal-area' },
  { id: 'naturalEarth', gl: 7, kind: 'flat', raw: geoNaturalEarth1Raw, property: 'compromise' },
  { id: 'mollweide', gl: 8, kind: 'flat', raw: geoMollweideRaw, property: 'equal-area' },
  { id: 'gallPeters', gl: 9, kind: 'flat', raw: gallPeters, property: 'equal-area' },
  { id: 'eckert4', gl: 10, kind: 'flat', raw: geoEckert4Raw, property: 'equal-area' },
  { id: 'azimuthalEquidistant', gl: 11, kind: 'azimuthal', raw: geoAzimuthalEquidistantRaw, clipAngle: 179.5, property: 'equidistant' },
  { id: 'azimuthalEqualArea', gl: 12, kind: 'azimuthal', raw: geoAzimuthalEqualAreaRaw, clipAngle: 179.5, property: 'equal-area' },
  { id: 'stereographic', gl: 13, kind: 'azimuthal', raw: geoStereographicRaw, clipAngle: 140, property: 'conformal' },
];

function computeBounds(def: Omit<ProjectionDef, 'bounds'>): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const clip = def.clipAngle ? (def.clipAngle * Math.PI) / 180 : Infinity;
  const n = 180;
  for (let i = 0; i <= n; i++) {
    const l = -Math.PI + (2 * Math.PI * i) / n;
    for (let j = 0; j <= n / 2; j++) {
      const p = -Math.PI / 2 + (Math.PI * j) / (n / 2);
      if (clip < Infinity && Math.acos(Math.cos(l) * Math.cos(p)) > clip + 1e-9) continue;
      const [x, y] = def.raw(l, p);
      if (!isFinite(x) || !isFinite(y)) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return [x0, y0, x1, y1];
}

export const PROJECTIONS: Record<ProjectionId, ProjectionDef> = Object.fromEntries(
  defs.map((d) => [d.id, { ...d, bounds: d.id === 'globe' ? [-1, -1, 1, 1] : computeBounds(d) }]),
) as Record<ProjectionId, ProjectionDef>;

export const PROJECTION_ORDER: ProjectionId[] = defs.map((d) => d.id);

export function isFlat(def: ProjectionDef): boolean {
  return def.kind === 'flat';
}

/** Scale (px per raw unit) that fits the projection inside a w×h viewport at zoom 1. */
export function fitScale(def: ProjectionDef, w: number, h: number): number {
  if (def.kind === 'globe') return (Math.min(w, h) / 2) * 0.82;
  const [x0, y0, x1, y1] = def.bounds;
  const padX = Math.min(32, w * 0.04), padY = Math.min(72, h * 0.08);
  return Math.min((w - 2 * padX) / (x1 - x0), (h - 2 * padY) / (y1 - y0));
}
