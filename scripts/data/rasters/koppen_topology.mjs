#!/usr/bin/env node
// Köppen polygons (fine pixel-edge GeoJSON from koppen_raster.py) -> koppen.json TopoJSON.
//
//  1. every pixel corner becomes a vertex (so shared edges are detected), exterior
//     rings clockwise / holes anticlockwise (d3-geo spherical convention)
//  2. shared-arc topology; Visvalingam simplification with spherical triangle
//     areas (topojson-simplify). Corners on the antimeridian / poles are pinned so
//     pieces split at ±180° still meet exactly; closed loops keep >= 3 points
//  3. Chaikin corner cutting (2 passes) on every arc, then a light second
//     simplification: shared arcs are smoothed once, so neighbours still tile
//  4. arcs that cross another arc fall back to less smoothing/simplification
//     until no two arcs cross
//  5. small detached islands/holes dropped, long east-west segments densified
//     (<= 1° of longitude) so great-circle edges follow the parallels
//  6. quantised TopoJSON; every feature is checked with d3.geoArea against the
//     area of its pixels and must be smaller than a hemisphere
//
// Usage: node koppen_topology.mjs fine.geojson fine-areas.json out.json
//          [--min-weight 1.5e-6] [--resimplify 3e-7] [--smooth 2]
//          [--min-island-km2 150] [--quantization 1e5]
import fs from "node:fs";
import { topology } from "topojson-server";
import { presimplify, sphericalTriangleArea, sphericalRingArea, filter, filterAttachedWeight } from "topojson-simplify";
import { feature, quantize } from "topojson-client";
import { geoArea } from "d3-geo";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const pos = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const [inPath, areasPath, outPath] = pos;
const MIN_WEIGHT = opt("--min-weight", 1.5e-6); // steradians; 1e-6 sr ≈ 40.6 km²
const RESIMPLIFY = opt("--resimplify", 3e-7);
const SMOOTH = opt("--smooth", 2);
const MIN_ISLAND = opt("--min-island-km2", 150) / 6371.0088 ** 2;
const QUANT = opt("--quantization", 1e5);
const DENSIFY = opt("--densify-deg", 1);
const STEP = opt("--pixel-deg", 0.0625);

const fc = JSON.parse(fs.readFileSync(inPath, "utf8"));
const expected = JSON.parse(fs.readFileSync(areasPath, "utf8"));

const planarArea = (ring) => {
  let s = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return s / 2;
};

// ---------- 1. unit vertices + winding ----------
// rasterio drops collinear vertices, so a junction on a straight pixel edge of a
// neighbour would not be a vertex of that neighbour and topojson could not detect
// the shared arc. Put a vertex on every pixel corner first.
const unitRing = (ring) => {
  const out = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i];
    const n = Math.round(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / STEP);
    for (let k = 1; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    out.push(b);
  }
  return out;
};
for (const f of fc.features) {
  f.geometry.coordinates = f.geometry.coordinates.map((poly) =>
    poly.map((ring, j) => {
      ring = unitRing(ring);
      const a = planarArea(ring);
      if ((j === 0 && a > 0) || (j > 0 && a < 0)) ring.reverse();
      return ring;
    }),
  );
}

// ---------- 2. topology + weights ----------
const topo0 = topology({ koppen: fc });
const nPtsIn = topo0.arcs.reduce((s, a) => s + a.length, 0);

const onEdge = (p) => Math.abs(p[0]) === 180 || Math.abs(p[1]) === 90;
const midRun = (a, p, b) =>
  (Math.abs(p[0]) === 180 && a[0] === p[0] && b[0] === p[0]) || (Math.abs(p[1]) === 90 && a[1] === p[1] && b[1] === p[1]);
// corners where a boundary meets the antimeridian or a pole
const isPinned = (arc, i) => i === 0 || i === arc.length - 1 || (onEdge(arc[i]) && !midRun(arc[i - 1], arc[i], arc[i + 1]));

function weigh(arcs, keepTriangle) {
  const t = presimplify({ type: "Topology", objects: {}, arcs }, sphericalTriangleArea);
  for (const arc of t.arcs) {
    const n = arc.length;
    for (let i = 1; i < n - 1; i++) if (isPinned(arc, i)) arc[i][2] = Infinity;
    const closed = arc[0][0] === arc[n - 1][0] && arc[0][1] === arc[n - 1][1];
    if (keepTriangle && closed && n > 4) {
      // keep a triangle: the point farthest from the start and the one farthest from that chord
      let far = 1, best = -1;
      for (let i = 1; i < n - 1; i++) {
        const d = (arc[i][0] - arc[0][0]) ** 2 + (arc[i][1] - arc[0][1]) ** 2;
        if (d > best) (best = d), (far = i);
      }
      let third = 1;
      best = -1;
      for (let i = 1; i < n - 1; i++) {
        if (i === far) continue;
        const d = Math.abs((arc[far][0] - arc[0][0]) * (arc[i][1] - arc[0][1]) - (arc[far][1] - arc[0][1]) * (arc[i][0] - arc[0][0]));
        if (d > best) (best = d), (third = i);
      }
      arc[far][2] = arc[third][2] = Infinity;
    }
  }
  return t.arcs;
}
const weighted0 = weigh(topo0.arcs, true);

// arc endpoints used by more than one arc end (junction nodes)
const endpointUse = new Map();
for (const a of topo0.arcs) {
  for (const p of [a[0], a[a.length - 1]]) {
    const k = p[0] + "," + p[1];
    endpointUse.set(k, (endpointUse.get(k) || 0) + 1);
  }
}

// ---------- 3. smoothing ----------
function chaikinOpen(pts, iters) {
  for (let it = 0; it < iters && pts.length > 2; it++) {
    const out = [pts[0]];
    const n = pts.length - 1;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[i + 1];
      if (i > 0) out.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]]);
      if (i < n - 1) out.push([0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
    }
    out.push(pts[n]);
    pts = out;
  }
  return pts;
}
function chaikinClosed(pts, iters) {
  let ring = pts.slice(0, -1);
  for (let it = 0; it < iters && ring.length > 2; it++) {
    const out = [];
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      out.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]], [0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
    }
    ring = out;
  }
  return [...ring, ring[0]];
}
function smoothArc(arc, iters) {
  if (iters <= 0 || arc.length < 3) return arc;
  const n = arc.length;
  const closed = arc[0][0] === arc[n - 1][0] && arc[0][1] === arc[n - 1][1];
  const pins = [];
  for (let i = 1; i < n - 1; i++) if (isPinned(arc, i)) pins.push(i);
  if (closed && !pins.length && endpointUse.get(arc[0][0] + "," + arc[0][1]) <= 2 && n >= 4) return chaikinClosed(arc, iters);
  const cuts = [0, ...pins, n - 1];
  const out = [];
  for (let c = 0; c < cuts.length - 1; c++) {
    const piece = chaikinOpen(arc.slice(cuts[c], cuts[c + 1] + 1), iters);
    if (c > 0) piece.shift();
    out.push(...piece);
  }
  return out;
}

// per-arc level: 0 = full treatment, then less simplification, then no smoothing, then raw
const LEVELS = [
  { w: MIN_WEIGHT, s: SMOOTH },
  { w: MIN_WEIGHT / 4, s: SMOOTH },
  { w: MIN_WEIGHT / 4, s: 1 },
  { w: MIN_WEIGHT / 16, s: 0 },
  { w: 0, s: 0 },
];
const level = new Int8Array(topo0.arcs.length);
const cache = new Map();
function arcAt(i) {
  const key = i * 8 + level[i];
  if (cache.has(key)) return cache.get(key);
  const { w, s } = LEVELS[level[i]];
  let arc = weighted0[i].filter((p) => p[2] >= w).map((p) => [p[0], p[1]]);
  if (s > 0) {
    arc = smoothArc(arc, s);
    const [rew] = weigh([arc], false);
    arc = rew.filter((p) => p[2] >= RESIMPLIFY).map((p) => [p[0], p[1]]);
  }
  cache.set(key, arc);
  return arc;
}

// ---------- 4. crossing detection (planar lon/lat, grid index) ----------
function segIntersect(a, b, c, d) {
  const orient = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
  const on = (p, q, r) => Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
  const same = (p, q) => p[0] === q[0] && p[1] === q[1];
  if (o1 === 0 && on(a, b, c) && !same(c, a) && !same(c, b)) return true;
  if (o2 === 0 && on(a, b, d) && !same(d, a) && !same(d, b)) return true;
  if (o3 === 0 && on(c, d, a) && !same(a, c) && !same(a, d)) return true;
  if (o4 === 0 && on(c, d, b) && !same(b, c) && !same(b, d)) return true;
  return false;
}
function findCrossings(arcs) {
  const CELL = 0.5;
  const grid = new Map();
  const segs = [];
  arcs.forEach((arc, ai) => {
    for (let i = 0; i < arc.length - 1; i++) {
      const a = arc[i], b = arc[i + 1];
      const s = segs.length;
      segs.push([ai, i, a, b]);
      const x0 = Math.floor(Math.min(a[0], b[0]) / CELL), x1 = Math.floor(Math.max(a[0], b[0]) / CELL);
      const y0 = Math.floor(Math.min(a[1], b[1]) / CELL), y1 = Math.floor(Math.max(a[1], b[1]) / CELL);
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++) {
          const k = x * 100000 + y;
          let list = grid.get(k);
          if (!list) grid.set(k, (list = []));
          list.push(s);
        }
    }
  });
  const bad = new Set();
  const seen = new Set();
  for (const list of grid.values()) {
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const s = segs[list[i]], t = segs[list[j]];
        if (s[0] === t[0] && Math.abs(s[1] - t[1]) <= 1) continue; // adjacent in the same arc
        const key = list[i] * 4e7 + list[j];
        if (seen.has(key)) continue;
        seen.add(key);
        if (segIntersect(s[2], s[3], t[2], t[3])) {
          if (s[0] === t[0]) {
            // first and last segment of a closed loop share the start point
            const n = arcs[s[0]].length - 1;
            if ((s[1] === 0 && t[1] === n - 1) || (t[1] === 0 && s[1] === n - 1)) continue;
          }
          bad.add(s[0]);
          bad.add(t[0]);
        }
      }
  }
  return bad;
}

let arcs = topo0.arcs.map((_, i) => arcAt(i));
for (let iter = 0; ; iter++) {
  const bad = findCrossings(arcs);
  console.log(`pass ${iter}: ${bad.size} arcs involved in crossings`);
  if (!bad.size) break;
  let raised = 0;
  for (const i of bad) if (level[i] < LEVELS.length - 1) level[i]++, raised++;
  if (!raised) throw new Error("could not remove crossings");
  for (const i of bad) arcs[i] = arcAt(i);
}
const levelCounts = LEVELS.map((_, l) => level.filter((v) => v === l).length);
console.log("arcs per fallback level:", levelCounts.join(" / "));

let simp = { type: "Topology", bbox: topo0.bbox, objects: topo0.objects, arcs };

// ---------- 5. drop tiny detached islands / lakes and degenerate rings ----------
simp = filter(simp, filterAttachedWeight(simp, MIN_ISLAND, sphericalRingArea));
simp = filter(simp, (ring) => {
  const coords = feature(simp, { type: "Polygon", arcs: [ring] }).geometry.coordinates[0];
  const uniq = new Set(coords.map((p) => p[0] + "," + p[1]));
  return uniq.size >= 3 && Math.abs(planarArea(coords)) > 1e-9;
});

// densify long east-west segments
let added = 0;
simp.arcs = simp.arcs.map((arc) => {
  const out = [arc[0]];
  for (let i = 1; i < arc.length; i++) {
    const a = arc[i - 1], b = arc[i];
    const dx = Math.abs(b[0] - a[0]);
    if (dx > DENSIFY && !(Math.abs(a[1]) === 90 && Math.abs(b[1]) === 90)) {
      const n = Math.ceil(dx / DENSIFY);
      for (let k = 1; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]), added++;
    }
    out.push(b);
  }
  return out;
});

// ---------- 6. quantise, write, validate ----------
const q = quantize(simp, QUANT);
const json = JSON.stringify(q);
fs.writeFileSync(outPath, json);
const nPtsOut = simp.arcs.reduce((s, a) => s + a.length, 0);
console.log(`arcs ${topo0.arcs.length} -> ${simp.arcs.length}, points ${nPtsIn} -> ${nPtsOut} (+${added} densified), ${(json.length / 1024).toFixed(0)} KiB`);

const back = feature(q, q.objects.koppen);
let ok = true, allSmall = true;
const HEMI = 2 * Math.PI;
const R2 = 6371.0088 ** 2 / 1e6;
for (const f of back.features) {
  const a = geoArea(f);
  const e = expected[f.properties.k];
  const rel = (a - e) / e;
  let wrong = 0;
  for (const poly of f.geometry.coordinates) poly.forEach((r, j) => ((j === 0) !== (planarArea(r) < 0) ? wrong++ : 0));
  // smoothing shrinks tiny, fragmented classes a little; a winding error would be ~4π off
  const flag = a >= HEMI || Math.abs(rel) > (e * R2 > 1 ? 0.03 : 0.1) || wrong > 0;
  if (a >= HEMI) allSmall = false;
  if (flag) ok = false;
  console.log(
    `${f.properties.k.padEnd(4)} polygons ${String(f.geometry.coordinates.length).padStart(4)}  d3.geoArea ${(a * R2).toFixed(3).padStart(7)} Mkm²` +
      `  pixels ${(e * R2).toFixed(3).padStart(7)} Mkm²  diff ${(rel * 100).toFixed(2).padStart(6)}%  mis-wound rings ${wrong}${flag ? "  <-- CHECK" : ""}`,
  );
}
const total = back.features.reduce((s, f) => s + geoArea(f), 0);
console.log(`total ${(total * R2).toFixed(2)} Mkm² (${((100 * total) / (4 * Math.PI)).toFixed(2)}% of the sphere); every feature < hemisphere: ${allSmall}; area/winding checks passed: ${ok}`);
if (!ok) {
  console.error("validation failed");
  process.exit(1);
}
