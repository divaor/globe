// The plate model shared by "Pangea to today" and the Life through time stories (Merdith et al.
// 2021, 1000 million years ago to today). Every piece of present-day coastline and continental
// shelf belongs to a plate; its position at an age is its present-day position rotated by that
// plate's interpolated rotation (unit quaternions, slerp).
import { geoArea, geoCentroid, geoContains, type GeoStream } from 'd3-geo';
import { feature as topoFeature, mesh } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Geometry, MultiLineString, Polygon } from 'geojson';
import { loadJSON, fixWinding } from '../data/store';
import { t, lang } from '../app/i18n';
import type { App } from '../app/app';
import type { RenderCtx } from '../layers/types';

export const RAD = Math.PI / 180, DEG = 180 / Math.PI;

export interface Rotations { times: number[]; plates: Record<string, number[]>; citation: string }
/** A unit of the geologic time scale (ages in Ma). */
export interface Unit { rank: string; name_en: string; name_es: string; start: number; end: number; color: string }
export interface Ev { ma: number; en: string; es: string }
export interface Piece {
  p: string; b: number; e: number;
  rings: Float64Array[][];      // polygons → rings → xyz triples (closing point dropped)
  lines: Float64Array[];        // outline polylines (xyz)
  geom: Geometry;               // present-day geometry (for taps)
  cont: string;                 // continent today
  c: [number, number, number];  // present-day centroid (xyz)
  area: number;
}

/** The plate model's oldest age, in Ma. */
export const PALEO_MAX_MA = 1000;

export const toXYZ = (coords: number[][], close: boolean) => {
  const n = close ? coords.length - 1 : coords.length;
  const a = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const l = coords[i][0] * RAD, p = coords[i][1] * RAD, cp = Math.cos(p);
    a[i * 3] = cp * Math.cos(l); a[i * 3 + 1] = cp * Math.sin(l); a[i * 3 + 2] = Math.sin(p);
  }
  return a;
};

export function quatAt(rot: Rotations, p: string, ma: number): number[] | null {
  const T = rot.times, q = rot.plates[p];
  if (!q) return null;
  const n = T.length;
  if (ma <= T[0]) return q.slice(0, 4);
  if (ma >= T[n - 1]) return q.slice(4 * n - 4);
  let i = 0, j = n - 1;
  while (j - i > 1) { const m = (i + j) >> 1; if (T[m] <= ma) i = m; else j = m; }
  const f = (ma - T[i]) / (T[j] - T[i]);
  const a = q.slice(4 * i, 4 * i + 4);
  let b = q.slice(4 * j, 4 * j + 4);
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (d < 0) { b = b.map((v) => -v); d = -d; }
  const th = Math.acos(Math.min(1, d)), s = Math.sin(th);
  const wa = s < 1e-9 ? 1 - f : Math.sin((1 - f) * th) / s, wb = s < 1e-9 ? f : Math.sin(f * th) / s;
  const r = a.map((v, k) => wa * v + wb * b[k]);
  const len = Math.hypot(r[0], r[1], r[2], r[3]);
  return r.map((v) => v / len);
}

/** Rotation matrix (row-major) of a unit quaternion [w, x, y, z]. */
export function matrix(q: number[]): number[] {
  const [w, x, y, z] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}

const lonLat = (x: number, y: number, z: number): [number, number] => [Math.atan2(y, x) * DEG, Math.asin(Math.max(-1, Math.min(1, z))) * DEG];

/** A unit's name in the reader's language. */
export function unitName(u: Unit): string { return lang() === 'es' ? u.name_es : u.name_en; }

let shared: Promise<PaleoWorld> | null = null;
/** The plate model, loaded once (it needs today's 1:50m countries to name the continents). */
export function loadPaleo(app: App): Promise<PaleoWorld> {
  if (!shared) shared = PaleoWorld.load(app).catch((e) => { shared = null; throw e; });
  return shared;
}

export class PaleoWorld {
  private cache: { ma: number; get: (p: string) => number[] | null } | null = null;

  private constructor(readonly rot: Rotations, readonly pieces: Piece[], readonly shelves: Piece[], readonly units: Unit[], readonly events: Ev[]) {}

  static async load(app: App): Promise<PaleoWorld> {
    const [coast, shelf, rot, ts] = await Promise.all([
      loadJSON<Topology>('paleo/paleo-coastlines.json'),
      loadJSON<Topology>('paleo/paleo-continents.json'),
      loadJSON<Rotations>('paleo/paleo-rotations.json'),
      loadJSON<{ units: Unit[]; events: Ev[] }>('paleo/timescale.json'),
      app.data.ensure('50m'),
    ]);
    const build = (topo: Topology, name: string, withLines: boolean): Piece[] => {
      const obj = topo.objects[name] as GeometryCollection;
      const feats = (topoFeature(topo, obj) as unknown as { features: Feature<Geometry, { p: number | string; b: number; e: number }>[] }).features;
      return feats.map((f, i) => {
        const g = f.geometry;
        fixWinding(g);
        const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
        let lines: Float64Array[] = [];
        if (withLines) {
          const geomObj = obj.geometries[i];
          const m = mesh(topo, obj, (a, b) => a === b && a === geomObj) as MultiLineString;
          lines = m.coordinates.map((c) => toXYZ(c, false));
        }
        // Present-day continent of the largest part.
        let best = polys[0], bestA = -1;
        for (const pc of polys) { const a = geoArea({ type: 'Polygon', coordinates: pc } as Polygon); if (a > bestA) { bestA = a; best = pc; } }
        const cen = best ? geoCentroid({ type: 'Polygon', coordinates: best } as Polygon) : [0, 0];
        const id = app.renderer.countryAt(cen[0], cen[1]);
        const cont = id ? app.data.meta[id]?.ct ?? 'SS' : 'SS';
        return {
          p: String(f.properties.p), b: f.properties.b, e: f.properties.e,
          rings: polys.map((poly) => poly.map((ring) => toXYZ(ring, true))),
          lines, geom: g, cont, c: toXYZ([cen as number[]], false) as unknown as [number, number, number],
          area: geoArea(f as never),
        };
      });
    };
    return new PaleoWorld(rot, build(coast, 'coastlines', true), build(shelf, 'continents', false), ts.units, ts.events.sort((a, b) => b.ma - a.ma));
  }

  /** The plates' rotation matrices at `ma` (kept for the last age asked: one frame draws one age). */
  mats(ma: number): (p: string) => number[] | null {
    if (this.cache?.ma === ma) return this.cache.get;
    const m = new Map<string, number[] | null>();
    const get = (p: string) => {
      let r = m.get(p);
      if (r === undefined) { const q = quatAt(this.rot, p, ma); r = q ? matrix(q) : null; m.set(p, r); }
      return r;
    };
    this.cache = { ma, get };
    return get;
  }

  visible(p: Piece, ma: number) { return ma <= p.b + 1e-6 && ma >= p.e - 1e-6; }

  /** Where a present-day point carried by plate `p` was at `ma`. */
  rotate(lon: number, lat: number, p: string, ma: number): [number, number] {
    const m = this.mats(ma)(p);
    if (!m) return [lon, lat];
    const l = lon * RAD, q = lat * RAD, x = Math.cos(q) * Math.cos(l), y = Math.cos(q) * Math.sin(l), z = Math.sin(q);
    return lonLat(m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z);
  }

  /** Streams rotated geometry straight into the projection (no per-frame GeoJSON objects). */
  private stream(stream: GeoStream, m: number[], piece: Piece, polygons: boolean) {
    const emit = (a: Float64Array) => {
      for (let i = 0; i < a.length; i += 3) {
        const x = a[i], y = a[i + 1], z = a[i + 2];
        const X = m[0] * x + m[1] * y + m[2] * z, Y = m[3] * x + m[4] * y + m[5] * z, Z = m[6] * x + m[7] * y + m[8] * z;
        stream.point(Math.atan2(Y, X) * DEG, Math.asin(Math.max(-1, Math.min(1, Z))) * DEG);
      }
    };
    if (polygons) {
      for (const poly of piece.rings) {
        stream.polygonStart();
        for (const ring of poly) { stream.lineStart(); emit(ring); stream.lineEnd(); }
        stream.polygonEnd();
      }
    } else {
      for (const line of piece.lines) { stream.lineStart(); emit(line); stream.lineEnd(); }
    }
  }

  /** The continents at `ma`: shelves (the crust that fits together), land by today's continent, coastlines. */
  draw(rc: RenderCtx, ma: number, style: { shelf: string; land: (cont: string) => string; coast: string; coastWidth?: number }) {
    const { ctx, view } = rc;
    const mat = this.mats(ma);
    const stream = view.projection.stream(canvasStream(ctx));
    ctx.beginPath();
    for (const s of this.shelves) { if (!this.visible(s, ma)) continue; const m = mat(s.p); if (m) this.stream(stream, m, s, true); }
    ctx.fillStyle = style.shelf;
    ctx.fill();
    const groups = new Map<string, Piece[]>();
    for (const s of this.pieces) { if (!this.visible(s, ma)) continue; let g = groups.get(s.cont); if (!g) groups.set(s.cont, (g = [])); g.push(s); }
    for (const [cont, list] of groups) {
      ctx.beginPath();
      for (const s of list) { const m = mat(s.p); if (m) this.stream(stream, m, s, true); }
      ctx.fillStyle = style.land(cont);
      ctx.fill();
    }
    ctx.beginPath();
    for (const s of this.pieces) { if (!this.visible(s, ma)) continue; const m = mat(s.p); if (m) this.stream(stream, m, s, false); }
    ctx.strokeStyle = style.coast;
    ctx.lineWidth = style.coastWidth ?? 0.7;
    ctx.stroke();
  }

  /** The middle of today's continents `conts` at `ma` (weighted by area), or null. */
  centroidOf(conts: string[], ma: number): [number, number] | null {
    const mat = this.mats(ma);
    let X = 0, Y = 0, Z = 0;
    for (const s of this.pieces) {
      if (!conts.includes(s.cont) || !this.visible(s, ma) || s.area < 1e-4) continue;
      const m = mat(s.p);
      if (!m) continue;
      const [x, y, z] = s.c;
      X += (m[0] * x + m[1] * y + m[2] * z) * s.area; Y += (m[3] * x + m[4] * y + m[5] * z) * s.area; Z += (m[6] * x + m[7] * y + m[8] * z) * s.area;
    }
    const len = Math.hypot(X, Y, Z);
    return len < 1e-9 ? null : [Math.atan2(Y, X) * DEG, Math.asin(Z / len) * DEG];
  }

  /** Rodinia, Pangea and Panthalassa, Laurasia and Gondwana when they existed; today's continents smaller. */
  labels(rc: RenderCtx, ma: number, o: { big?: number; small?: number } = {}) {
    const big = (text: string, pos: [number, number] | null, pr = o.big ?? 990, size = 22) => {
      if (!pos) return;
      const pt = rc.project(pos[0], pos[1]);
      if (pt) rc.labels.add({ text, x: pt[0], y: pt[1], priority: pr, size, weight: 800, caps: true, color: '#ffffff', halo: 'rgba(0,0,0,0.55)' });
    };
    const all = ['AF', 'SA', 'NA', 'EU', 'AS', 'OC', 'AN'];
    if (ma >= 750 && ma <= 1000) big('Rodinia', this.centroidOf(all, ma));
    if (ma <= 335 && ma >= 175) {
      const c = this.centroidOf(all, ma);
      big('Pangea', c);
      if (c) big('Panthalassa', [c[0] + 180 > 180 ? c[0] - 180 : c[0] + 180, -c[1]], (o.big ?? 990) - 390, 16);
    }
    if (ma < 175 && ma >= 100) {
      big('Laurasia', this.centroidOf(['NA', 'EU', 'AS'], ma), o.big ?? 990, 18);
      big('Gondwana', this.centroidOf(['SA', 'AF', 'AN', 'OC'], ma), o.big ?? 990, 18);
    }
    for (const cont of all) {
      const c = this.centroidOf([cont], ma);
      if (!c) continue;
      const pt = rc.project(c[0], c[1]);
      if (pt) rc.labels.add({ text: t(`cont.${cont}`), x: pt[0], y: pt[1] + 18, priority: o.small ?? 700, size: 12, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
    }
  }

  /** The time scale's unit of a rank (period, era, eon, epoch) at `ma`. */
  unit(ma: number, rank: string): Unit | undefined {
    return this.units.find((u) => u.rank === rank && ma <= u.start + 1e-9 && ma >= u.end - 1e-9);
  }

  /** "Triassic · Mesozoic" (and a nearby event): the slider's caption. */
  caption(ma: number): string {
    const es = lang() === 'es';
    const per = this.unit(ma, 'period'), era = this.unit(ma, 'era');
    const ev = this.events.find((e) => e.ma >= ma - 0.01 && e.ma - ma < 30);
    const parts = [per ? unitName(per) : '', era ? unitName(era) : ''].filter(Boolean).join(' · ');
    return ev ? `${parts} — ${es ? ev.es : ev.en}` : parts;
  }

  /**
   * What lies under a tap on the continents of `ma`: the tapped point taken back to the present day
   * with each visible plate's inverse rotation. Null over the sea.
   */
  tapRows(lon: number, lat: number, ma: number, app: App): { label: string; value: string; icon: string }[] | null {
    const es = lang() === 'es';
    const l = lon * RAD, p = lat * RAD;
    const v = [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
    const mat = this.mats(ma);
    for (const s of this.pieces) {
      if (!this.visible(s, ma)) continue;
      const m = mat(s.p);
      if (!m) continue;
      // The inverse of a rotation is its transpose.
      const p0 = lonLat(m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]);
      if (!geoContains(s.geom as never, p0)) continue;
      const id = app.renderer.countryAt(p0[0], p0[1]);
      const m0 = id ? app.data.meta[id] : null;
      return [
        { label: es ? 'Hoy es' : 'Today it is', value: m0 ? `${es ? m0.es : m0.n}` : (es ? 'una isla o meseta oceánica' : 'an island or ocean plateau'), icon: '📍' },
        { label: es ? 'Continente actual' : 'Continent today', value: t(`cont.${s.cont}`), icon: '🌍' },
        { label: es ? 'Posición entonces' : 'Position then', value: fmtPos(lon, lat), icon: '🧭' },
        { label: es ? 'Hoy está en' : 'Today it lies at', value: fmtPos(p0[0], p0[1]), icon: '🗺️' },
      ];
    }
    return null;
  }
}

/** "35°N, 12°W". */
export function fmtPos(lon: number, lat: number): string {
  return `${fmtLat(lat)}, ${Math.abs(lon).toFixed(0)}°${lon >= 0 ? 'E' : 'W'}`;
}
/** "35°N", "12°S"; the equator is "0°". */
export function fmtLat(lat: number): string {
  const v = Math.abs(lat).toFixed(0);
  return v === '0' ? '0°' : `${v}°${lat >= 0 ? 'N' : 'S'}`;
}

/** Minimal canvas sink for d3 projection streams (moveTo/lineTo; closes polygon rings). */
export function canvasStream(ctx: CanvasRenderingContext2D): GeoStream {
  let first = true, poly = false;
  return {
    point(x, y) { if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); },
    lineStart() { first = true; },
    lineEnd() { if (poly) ctx.closePath(); },
    polygonStart() { poly = true; },
    polygonEnd() { poly = false; },
    sphere() { /* not used */ },
  };
}
