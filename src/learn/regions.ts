// The "States and provinces" quiz's map: the first-level regions of 48 countries (states, provinces,
// regions...), from public/data/regions/ (built by scripts/data/build-regions.mjs). Loading, a view
// that frames a country, what lies under a tap, a small picture of a region, and the drawing.
import { geoArea, geoBounds, geoCentroid, geoContains, geoOrthographic, geoPath } from 'd3-geo';
import { feature as topoFeature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Geometry } from 'geojson';
import { loadJSON } from '../data/store';
import type { View } from '../engine/view';
import type { RenderCtx } from '../layers/types';

/**
 * A region: its id, English and Spanish name, whether it lies apart (Alaska, the Canaries), a point
 * inside it, its bounds, and the bounds of its largest piece (`core`: Valparaíso without Easter Island).
 */
export interface Region { id: string; n: string; es: string; far: boolean; f: Feature<Geometry>; at: [number, number]; box: Box; core: Box }
type Box = [[number, number], [number, number]];
/** A country of the quiz: how many regions and what they are ("31 states and Mexico City"). */
export interface RegionCountry { id: string; n: number; what: { en: string; es: string } }

let index: Promise<RegionCountry[]> | null = null;
export function regionCountries(): Promise<RegionCountry[]> {
  if (!index) index = loadJSON<{ countries: RegionCountry[] }>('regions/index.json').then((x) => x.countries).catch((e) => { index = null; throw e; });
  return index;
}

const cache = new Map<string, Promise<Region[]>>();
export function loadRegions(a3: string): Promise<Region[]> {
  let p = cache.get(a3);
  if (!p) {
    p = loadJSON<Topology>(`regions/${a3}.json`).then((topo) => {
      const fc = topoFeature(topo, topo.objects.regions as GeometryCollection) as unknown as { features: Feature<Geometry, { id: string; n: string; es: string; far?: number; lx: number; ly: number }>[] };
      return fc.features.map((f) => {
        const g = f.geometry;
        const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
        let core = polys[0], best = -1;
        for (const p of polys) { const a = geoArea({ type: 'Polygon', coordinates: p }); if (a > best) { best = a; core = p; } }
        return {
          id: f.properties.id, n: f.properties.n, es: f.properties.es, far: !!f.properties.far, f,
          at: [f.properties.lx, f.properties.ly] as [number, number], box: geoBounds(f) as Box,
          core: (core ? geoBounds({ type: 'Polygon', coordinates: core }) : geoBounds(f)) as Box,
        };
      });
    });
    p.catch(() => cache.delete(a3));
    cache.set(a3, p);
  }
  return p;
}

const RAD = Math.PI / 180;

/**
 * The view that frames a country's regions (all but the far ones, which the player pans to) in
 * the map area left by the panels (`mapH`: its height once they have settled). Longitudes are
 * unwrapped around `mid`, the country's middle, so regions on both sides of 180° (Chukotka, the
 * Aleutians) stay together.
 */
export function frameRegions(view: View, list: Region[], mid: [number, number], mapH = view.mapH): { lon: number; lat: number; zoom: number } {
  const unwrap = (x: number) => { let d = x - mid[0]; while (d > 180) d -= 360; while (d < -180) d += 360; return mid[0] + d; };
  let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
  for (const r of list) {
    if (r.far && list.some((x) => !x.far)) continue;
    const west = unwrap(r.core[0][0]);
    let east = unwrap(r.core[1][0]);
    if (east < west) east += 360;
    w = Math.min(w, west); e = Math.max(e, east); s = Math.min(s, r.core[0][1]); n = Math.max(n, r.core[1][1]);
  }
  let lon = (w + e) / 2;
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  const lat = (s + n) / 2;
  const perZoom = view.pxPerRadian / view.zoom;
  const halfW = view.w / 2 - 22, halfH = mapH / 2 - 22;
  const dx = Math.max(1e-4, ((e - w) / 2) * RAD * Math.cos(Math.min(80, Math.abs(lat)) * RAD)), dy = Math.max(1e-4, ((n - s) / 2) * RAD);
  const zoom = Math.max(1, Math.min(40, Math.min(halfW / dx, halfH / dy) / perZoom));
  return { lon, lat, zoom };
}

/** The region under a point; else, for a tap that just misses a small region, the one whose middle is within 22 px. */
export function regionAt(list: Region[], lon: number, lat: number, view: View): Region | null {
  for (const r of list) {
    const [[w, s], [e, n]] = r.box;
    const inLon = w <= e ? lon >= w && lon <= e : lon >= w || lon <= e;
    if (inLon && lat >= s && lat <= n && geoContains(r.f, [lon, lat])) return r;
  }
  const here = view.project(lon, lat);
  if (!here) return null;
  let best: Region | null = null, bestD = 22;
  for (const r of list) {
    const p = view.project(r.at[0], r.at[1]);
    if (!p) continue;
    const d = Math.hypot(p[0] - here[0], p[1] - here[1]);
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}

/** A small picture of a region's shape (an SVG data address), for the quiz result. */
export function regionThumb(r: Region, color: string): string {
  const c = geoCentroid(r.f);
  const proj = geoOrthographic().rotate([-c[0], -c[1]]).fitExtent([[3, 3], [41, 41]], r.f);
  const d = geoPath(proj)(r.f) ?? '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><path d="${d}" fill="${color}" stroke="rgba(0,0,0,0.35)" stroke-width="0.8"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * How a region is shown: found or missed in an earlier question (`found`, `lost`); in this one, found
 * (`ok`), missed (`answer`, where it was) or tapped by mistake (`wrong`); picked in the result (`focus`).
 */
export type RegionMark = 'found' | 'lost' | 'ok' | 'answer' | 'wrong' | 'focus' | undefined;

const tint = (id: string) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return (h % 5) / 4; };

/** The country's regions: neutral tones, outlined, coloured by how the player did; names where marked. */
export function drawRegions(rc: RenderCtx, list: Region[], mark: (r: Region) => RegionMark, name: (r: Region) => string) {
  const { ctx, path, theme } = rc;
  const dark = theme.dark;
  const fills: Record<string, string> = dark
    ? { found: 'rgba(56,176,104,0.55)', lost: 'rgba(214,82,76,0.5)', ok: 'rgba(56,176,104,0.95)', answer: 'rgba(245,197,24,0.95)', wrong: 'rgba(214,82,76,0.92)', focus: 'rgba(98,160,234,0.95)' }
    : { found: 'rgba(46,158,91,0.45)', lost: 'rgba(217,83,79,0.42)', ok: 'rgba(46,158,91,0.9)', answer: 'rgba(245,197,24,0.95)', wrong: 'rgba(217,83,79,0.9)', focus: 'rgba(66,133,214,0.9)' };
  for (const r of list) {
    const m = mark(r);
    ctx.beginPath(); path(r.f as never);
    if (m) ctx.fillStyle = fills[m];
    else {
      // Neighbours in slightly different tones, so each region reads as its own.
      const k = tint(r.id);
      ctx.fillStyle = dark ? `rgb(${78 + 22 * k},${86 + 20 * k},${98 + 18 * k})` : `rgb(${250 - 18 * k},${244 - 20 * k},${226 - 26 * k})`;
    }
    ctx.fill();
  }
  ctx.beginPath();
  for (const r of list) path(r.f as never);
  ctx.strokeStyle = dark ? 'rgba(235,240,248,0.7)' : 'rgba(70,58,44,0.6)';
  ctx.lineWidth = 1.1;
  ctx.stroke();
  for (const r of list) {
    const m = mark(r);
    if (m !== 'ok' && m !== 'answer' && m !== 'wrong' && m !== 'focus') continue;
    const p = rc.project(r.at[0], r.at[1]);
    if (p) rc.labels.add({ text: name(r), x: p[0], y: p[1], priority: m === 'wrong' ? 2900 : 3000, size: 13, weight: 800, color: '#fff', halo: 'rgba(0,0,0,0.85)' });
  }
}
