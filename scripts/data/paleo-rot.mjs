/**
 * The plate model of public/data/paleo/ for the story build: which plate carries a place, where
 * that place was millions of years ago, and the continents of a given age as GeoJSON (previews).
 *
 * Ages are in Ma (millions of years ago). The rotations cover 0–1000 Ma (Merdith et al. 2021);
 * a story step older than 5 Ma is drawn on the continents of its age (older than 1000 Ma: on
 * today's map, as the model does not go back so far).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';
import { geoContains, geoDistance } from 'd3-geo';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'public/data/paleo');
const RAD = Math.PI / 180, DEG = 180 / Math.PI;

/** Steps older than this (in years, as dates are written: -5000000) are drawn on the continents of their age. */
export const PALEO_YEARS = -5e6;
/** The plate model's oldest age, in Ma. */
export const PALEO_MAX_MA = 1000;
/** A step's date (astronomical year) as an age in Ma for the plate model, or null for today's map. */
export function paleoMa(t) {
  if (!(t < PALEO_YEARS)) return null;
  const ma = -t / 1e6;
  return ma <= PALEO_MAX_MA ? ma : null;
}
/** Older than the plate model: drawn on today's land. */
export const tooOld = (t) => t < -PALEO_MAX_MA * 1e6;

let model = null;
function load() {
  if (model) return model;
  const read = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const rot = read('paleo-rotations.json');
  const pieces = (topo, name, kind) => feature(topo, topo.objects[name]).features.map((f) => {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    // A box to skip far pieces quickly (none for pieces that cross ±180°, whose box would be wrong).
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity, jump = false;
    for (const poly of polys) for (const ring of poly) for (let i = 0; i < ring.length; i++) {
      const [x, y] = ring[i];
      if (i && Math.abs(x - ring[i - 1][0]) > 180) jump = true;
      if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
    }
    return { kind, p: String(f.properties.p), b: f.properties.b, e: f.properties.e, f, polys, box: jump ? null : [w, s, e, n] };
  });
  model = {
    rot,
    coast: pieces(read('paleo-coastlines.json'), 'coastlines', 'coast'),
    shelf: pieces(read('paleo-continents.json'), 'continents', 'shelf'),
  };
  return model;
}

/** The plate's rotation at `ma` (unit quaternion [w, x, y, z]), slerped between keyframes. */
export function quatAt(plate, ma) {
  const { rot } = load();
  const T = rot.times, q = rot.plates[plate];
  if (!q) return null;
  let lo = 0, hi = T.length - 1;
  if (ma <= T[0]) return q.slice(0, 4);
  if (ma >= T[hi]) return q.slice(4 * hi, 4 * hi + 4);
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= ma) lo = m; else hi = m; }
  const f = (ma - T[lo]) / (T[hi] - T[lo]);
  const a = q.slice(4 * lo, 4 * lo + 4);
  let b = q.slice(4 * hi, 4 * hi + 4);
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (dot < 0) { b = b.map((v) => -v); dot = -dot; }
  let wa = 1 - f, wb = f;
  if (dot < 0.9999995) { const th = Math.acos(dot), s = Math.sin(th); wa = Math.sin((1 - f) * th) / s; wb = Math.sin(f * th) / s; }
  const r = a.map((v, k) => wa * v + wb * b[k]);
  const n = Math.hypot(...r);
  return r.map((v) => v / n);
}

function turn([w, x, y, z], [lon, lat]) {
  const l = lon * RAD, p = lat * RAD;
  const vx = Math.cos(p) * Math.cos(l), vy = Math.cos(p) * Math.sin(l), vz = Math.sin(p);
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  const rx = vx + w * tx + (y * tz - z * ty), ry = vy + w * ty + (z * tx - x * tz), rz = vz + w * tz + (x * ty - y * tx);
  return [Math.atan2(ry, rx) * DEG, Math.asin(Math.max(-1, Math.min(1, rz))) * DEG];
}

/** Where a present-day place carried by `plate` was at `ma` (or the place itself, without a plate). */
export function rotate(pt, plate, ma) {
  if (plate == null || ma == null) return pt;
  const q = quatAt(plate, ma);
  return q ? turn(q, pt) : pt;
}

const shown = (pc, ma) => ma <= pc.b + 1e-6 && ma >= pc.e - 1e-6;
const inBox = (pc, [x, y], pad = 0) => !pc.box || (x >= pc.box[0] - pad && x <= pc.box[2] + pad && y >= pc.box[1] - pad && y <= pc.box[3] + pad);

/** Distance (km) from a point to the nearest vertex of a piece. */
function nearKm(pc, pt) {
  let best = Infinity;
  for (const poly of pc.polys) for (const ring of poly) for (const v of ring) { const d = geoDistance(pt, v); if (d < best) best = d; }
  return best * 6371;
}

/**
 * The plate that carries a present-day place, for drawing it at `ma`: the piece of land it is on
 * (land first, then the continental shelf), among the pieces the model draws at that age; else the
 * nearest such piece. `note` says why a place may look wrong on the old map.
 */
export function plateFor(pt, ma = 0) {
  const { coast, shelf } = load();
  for (const list of [coast, shelf]) {
    for (const pc of list) if (shown(pc, ma) && inBox(pc, pt) && geoContains(pc.f, pt)) return { pl: pc.p, km: 0 };
  }
  // On land the model only draws later (an island or a terrane added afterwards): still its plate.
  for (const list of [coast, shelf]) {
    for (const pc of list) {
      if (inBox(pc, pt) && geoContains(pc.f, pt)) return { pl: pc.p, km: 0, note: `the land there appears on the plate model only from ${pc.b} Ma on` };
    }
  }
  let best = null, bestKm = Infinity;
  for (const list of [coast, shelf]) {
    for (const pc of list) {
      if (!shown(pc, ma) || !inBox(pc, pt, 12)) continue;
      const km = nearKm(pc, pt);
      if (km < bestKm) { bestKm = km; best = pc; }
    }
  }
  if (!best) {
    for (const pc of [...coast, ...shelf]) {
      if (!shown(pc, ma)) continue;
      const km = nearKm(pc, pt);
      if (km < bestKm) { bestKm = km; best = pc; }
    }
  }
  return best ? { pl: best.p, km: Math.round(bestKm), note: bestKm > 400 ? `it is ${Math.round(bestKm)} km from the nearest land of the plate model` : undefined } : { pl: null, km: Infinity, note: 'no land of the plate model nearby' };
}

/** The continents at `ma`, rotated, as GeoJSON features (shelves and land), for previews. */
export function paleoLand(ma) {
  const { coast, shelf } = load();
  const qs = new Map();
  const q = (p) => { if (!qs.has(p)) qs.set(p, quatAt(p, ma)); return qs.get(p); };
  const out = (list) => list.filter((pc) => shown(pc, ma) && q(pc.p)).map((pc) => ({
    type: 'Feature', properties: {},
    geometry: { type: 'MultiPolygon', coordinates: pc.polys.map((poly) => poly.map((ring) => ring.map((v) => turn(q(pc.p), v)))) },
  }));
  return { shelf: { type: 'FeatureCollection', features: out(shelf) }, land: { type: 'FeatureCollection', features: out(coast) } };
}
