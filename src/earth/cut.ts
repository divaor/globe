// The Earth cut open (v0.32.0): an eighth of the globe taken out (the northern quarter between two meridians), so
// the two meridian walls and the equator's floor show the layers to scale. The cut belongs to the globe: turn it and
// the cut turns too. Peeling takes the outer layers away, down to the inner core.
//
// The globe view is a parallel (orthographic) projection, so a point inside the Earth at a fraction k of the radius
// lands at centre + k × (where the surface point above it lands): each layer's edge on a wall is a scaled copy of
// the meridian's arc. What shows through the opening is only the part of it facing us (d3 clips at the horizon).
import { geoArea, geoPath, geoRotation } from 'd3-geo';
import type { RenderCtx } from '../layers/types';
import type { View } from '../engine/view';
import { EARTH_KM, LAYERS, type Layer } from './model';

const RAD = Math.PI / 180;

export interface CutState {
  /** West meridian of the cut; the cut spans 90° east of it, from the equator to the pole. */
  lon1: number;
  /** How many layers are peeled away (0 = the whole Earth, 5 = only the inner core); fractional while easing. */
  peel: number;
  /** The layer picked in the panel, outlined on the cut. */
  focus: Layer['id'] | null;
  /** The layers' names on the walls. */
  names: boolean;
  /** Name for each layer (the panel's language). */
  name: (l: Layer) => string;
}

/** Radius fraction of a depth. */
export const kOf = (depthKm: number) => 1 - depthKm / EARTH_KM;

/** The outer radius fraction of what is left after peeling `peel` layers (eased between whole layers). */
export function peelRadius(peel: number): number {
  const i = Math.floor(peel), f = peel - i;
  const at = (n: number) => (n <= 0 ? 1 : kOf(LAYERS[Math.min(LAYERS.length - 1, n)].top));
  return at(i) + (at(i + 1) - at(i)) * f;
}

/** Projects with the view: where a point at (lon, lat) and radius fraction k lands, and how far towards us it is. */
export function projector(view: View) {
  const rot = geoRotation(view.rotate as [number, number, number]);
  const [cx, cy] = view.translate, R = view.pxPerRadian;
  const v3 = (lon: number, lat: number): [number, number, number] => {
    const [l, p] = rot([lon, lat]);
    const L = l * RAD, P = p * RAD;
    return [Math.cos(P) * Math.sin(L), Math.sin(P), Math.cos(P) * Math.cos(L)];
  };
  const at = (lon: number, lat: number, k: number): [number, number] => { const [x, y] = v3(lon, lat); return [cx + R * k * x, cy - R * k * y]; };
  return { v3, at, cx, cy, R };
}

/** The opening on the surface: the octant between lon1 and lon1 + 90°, from the equator to (almost) the pole. */
export function openingRing(lon1: number): [number, number][] {
  const lon2 = lon1 + 90, ring: [number, number][] = [];
  for (let lat = 0; lat <= 89.5; lat += 2) ring.push([lon1, lat]);
  for (let lon = lon1; lon <= lon2; lon += 5) ring.push([lon, 89.5]);
  for (let lat = 89.5; lat >= 0; lat -= 2) ring.push([lon2, lat]);
  for (let lon = lon2; lon >= lon1; lon -= 2) ring.push([lon, 0]);
  ring.push([lon1, 0]);
  const poly = { type: 'Polygon' as const, coordinates: [ring] };
  // d3 takes the smaller side when the ring winds clockwise; turn it round when it wraps the rest of the globe.
  return geoArea(poly) > 2 * Math.PI ? ring.reverse() : ring;
}

/** Is a point on the surface inside the opening? */
export function inOpening(lon: number, lat: number, lon1: number): boolean {
  if (lat < 0) return false;
  const d = ((((lon - lon1) % 360) + 360) % 360);
  return d <= 90;
}

/** Light from the upper left, in front: a face is lit by how much it turns to it. */
const LIGHT = (() => { const v = [-0.45, 0.55, 0.7]; const n = Math.hypot(...v); return v.map((x) => x / n); })();
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.round(Math.min(255, x * f)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/**
 * Draws the cut on top of the shaded globe and sets the map's names to skip the opening (and everything, once the
 * surface is peeled away). Returns the screen path of the opening (for taps).
 */
export function drawCut(rc: RenderCtx, st: CutState, space: string): Path2D | null {
  const { ctx, view } = rc;
  if (view.current.kind !== 'globe' || view.morphing) return null;
  const P = projector(view);
  const { cx, cy, R } = P;
  const k0 = peelRadius(st.peel);
  const lon1 = st.lon1, lon2 = lon1 + 90;

  // The opening's visible part, on the full globe, as a path (d3 clips it at the horizon).
  const opening = new Path2D();
  geoPath(view.projection, opening as unknown as CanvasRenderingContext2D)({ type: 'Polygon', coordinates: [openingRing(lon1)] } as never);
  // Scaled to the peeled ball: the same shape, nearer the centre.
  const scaled = new Path2D();
  scaled.addPath(opening, new DOMMatrix().translate(cx, cy).scale(k0).translate(-cx, -cy));

  // Peeled: the surface goes; a smaller ball in its place, coloured by its outer layer.
  if (k0 < 0.999) {
    ctx.beginPath(); ctx.arc(cx, cy, R + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = space; ctx.fill();
    const outer = LAYERS[Math.min(LAYERS.length - 1, Math.max(0, Math.ceil(st.peel - 1e-6)))];
    const g = ctx.createRadialGradient(cx - R * k0 * 0.35, cy - R * k0 * 0.4, R * k0 * 0.05, cx, cy, R * k0);
    g.addColorStop(0, shade(outer.color, 1.25)); g.addColorStop(0.6, outer.color); g.addColorStop(1, shade(outer.color, 0.45));
    ctx.beginPath(); ctx.arc(cx, cy, R * k0, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
  }

  // The opening shows what is behind it: space first, then the faces that face us.
  ctx.save();
  ctx.clip(scaled);
  ctx.fillStyle = space; ctx.fillRect(cx - R - 2, cy - R - 2, 2 * R + 4, 2 * R + 4);
  type Face = { normal: [number, number, number]; edge: (k: number) => [number, number][] };
  const arc = (pts: (t: number) => [number, number], from: number, to: number, step: number) => {
    const out: [number, number][] = []; const n = Math.max(2, Math.ceil(Math.abs(to - from) / step));
    for (let i = 0; i <= n; i++) out.push(pts(from + ((to - from) * i) / n));
    return out;
  };
  const faces: Face[] = [
    // The west wall (meridian lon1): its inner side looks east.
    { normal: P.v3(lon1 + 90, 0), edge: (k) => arc((t) => P.at(lon1, t, k), 0, 90, 3) },
    // The east wall (meridian lon2): its inner side looks west.
    { normal: P.v3(lon2 - 90, 0), edge: (k) => arc((t) => P.at(lon2, t, k), 0, 90, 3) },
    // The floor (the equator's plane): it looks up, to the north pole.
    { normal: P.v3(0, 90), edge: (k) => arc((l) => P.at(l, 0, k), lon1, lon2, 3) },
  ];
  const visible = faces.filter((f) => f.normal[2] > 0.02);
  const centre: [number, number] = [cx, cy];
  for (const f of visible) {
    const lit = 0.62 + 0.45 * Math.max(0, f.normal[0] * LIGHT[0] + f.normal[1] * LIGHT[1] + f.normal[2] * LIGHT[2]);
    // Outer to inner: each layer's band is its outer edge, back along the inner edge (the centre for the inner core).
    for (const l of LAYERS) {
      const ko = Math.min(k0, kOf(l.top)), ki = kOf(l.bottom);
      if (ko <= ki) continue;
      const out = f.edge(ko), inn = ki > 0.001 ? f.edge(ki).reverse() : [centre];
      ctx.beginPath();
      out.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      for (const [x, y] of inn) ctx.lineTo(x, y);
      ctx.closePath();
      const dim = st.focus && st.focus !== l.id ? 0.55 : 1;
      if (l.id === 'inner-core') {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * kOf(l.top));
        g.addColorStop(0, shade('#fff3bf', lit * dim)); g.addColorStop(1, shade(l.color, lit * dim));
        ctx.fillStyle = g;
      } else ctx.fillStyle = shade(l.color, lit * dim);
      ctx.fill();
      if (st.focus === l.id) { ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke(); }
    }
    // The face's own edge, thin.
    const rim = f.edge(k0);
    ctx.beginPath(); ctx.moveTo(cx, cy); for (const [x, y] of rim) ctx.lineTo(x, y); ctx.closePath();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
  }
  ctx.restore();
  // The opening's rim.
  ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.stroke(scaled);

  // The layers' names on the wall that faces us most, along its middle; layers too thin to name are left to the panel.
  if (st.names && visible.length) {
    const wall = visible.filter((f) => f !== faces[2]).sort((a, b) => b.normal[2] - a.normal[2])[0];
    const lonW = wall === faces[0] ? lon1 : lon2;
    for (const l of LAYERS) {
      const ko = Math.min(k0, kOf(l.top)), ki = kOf(l.bottom);
      if (ko <= ki || (ko - ki) * R < 14) continue;
      const k = (ko + ki) / 2;
      const [x, y] = P.at(lonW, 40, k);
      rc.labels.add({ text: st.name(l), x, y, priority: 5000 - LAYERS.indexOf(l), size: 11, weight: 700, color: '#ffffff', halo: 'rgba(0,0,0,0.75)' });
    }
  }
  // Names of the map: none over the opening; none at all once the surface is peeled away.
  rc.labels.clip = k0 < 0.999 ? () => false : (x, y) => {
    const g = view.invert(x, y);
    return !(g && inOpening(g[0], g[1], lon1));
  };
  return scaled;
}
