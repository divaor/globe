// Check the paleo data exactly the way the browser will use it: read ONLY the output
// files, slerp the keyframed quaternions, rotate every vertex (P_t = q P q^-1), render
// with d3-geo and rasterize the SVG with sharp. Exits 1 if a consistency check fails.
//
//   node scripts/data/paleo/check_paleo.mjs [dataDir=public/data/paleo] [outDir] [times...]
//
// Prints schema/consistency checks and writes paleo-<t>Ma.png (equirectangular) and
// paleo-<t>Ma-globe.png (two orthographic hemispheres, i.e. d3's clipCircle path, which is
// what breaks first when a polygon is wound the wrong way) into outDir.
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { feature } from "topojson-client";
import { geoArea, geoEquirectangular, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import sharp from "sharp";

const [dataDir = "public/data/paleo", outDir = "paleo-previews", ...timeArgs] = process.argv.slice(2);
const TIMES = timeArgs.length ? timeArgs.map(Number) : [0, 66, 150, 200, 250, 300, 600, 1000];
const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const read = (f) => JSON.parse(readFileSync(join(dataDir, f), "utf8"));

const rot = read("paleo-rotations.json");
const layers = [
  ["continents", read("paleo-continents.json"), "#e9d9ae", "#d8c48f"],
  ["coastlines", read("paleo-coastlines.json"), "#8c6a3c", "#6f5230"],
].map(([name, topo, fill, stroke]) => ({ name, fill, stroke, topo, fc: feature(topo, topo.objects[name]) }));

// Coastline outlines without internal plate boundaries or seams: per feature, the arcs that no
// other feature uses (an arc used twice is a boundary between two pieces of land).
function outlines(topo, name) {
  const geoms = topo.objects[name].geometries;
  const ringsOf = (g) => (g.type === "Polygon" ? g.arcs : g.arcs.flat());
  const uses = new Map();
  for (const g of geoms) for (const ring of ringsOf(g)) for (const i of ring) { const k = i < 0 ? ~i : i; uses.set(k, (uses.get(k) || 0) + 1); }
  const { scale: [sx, sy], translate: [tx, ty] } = topo.transform;
  const decoded = topo.arcs.map((arc) => { let x = 0, y = 0; return arc.map(([dx, dy]) => [(x += dx) * sx + tx, (y += dy) * sy + ty]); });
  return geoms.map((g) => ({ type: "Feature", properties: g.properties, geometry: { type: "MultiLineString",
    coordinates: ringsOf(g).flat().map((i) => (i < 0 ? ~i : i)).filter((k) => uses.get(k) === 1).map((k) => decoded[k]) } }));
}
const coastOutline = { type: "FeatureCollection", features: outlines(layers[1].topo, "coastlines") };

// ---------------------------------------------------------------- consistency checks
const problems = [];
const nT = rot.times.length;
for (let i = 1; i < nT; i++) if (!(rot.times[i] > rot.times[i - 1])) problems.push(`times not increasing at ${i}`);
for (const [id, arr] of Object.entries(rot.plates)) {
  if (arr.length !== 4 * nT) problems.push(`plate ${id}: ${arr.length / 4} quaternions for ${nT} times`);
  for (let i = 0; i < nT; i++) {
    const n = Math.hypot(arr[4 * i], arr[4 * i + 1], arr[4 * i + 2], arr[4 * i + 3]);
    if (Math.abs(n - 1) > 3e-5) problems.push(`plate ${id} t=${rot.times[i]}: |q| = ${n}`);
    if (i && arr[4 * i] * arr[4 * i - 4] + arr[4 * i + 1] * arr[4 * i - 3] + arr[4 * i + 2] * arr[4 * i - 2] + arr[4 * i + 3] * arr[4 * i - 1] < 0)
      problems.push(`plate ${id}: sign flip between t=${rot.times[i - 1]} and ${rot.times[i]}`);
  }
}
for (const L of layers) {
  let maxArea = 0, total = 0;
  for (const f of L.fc.features) {
    const { p, b, e } = f.properties;
    if (!(String(p) in rot.plates)) problems.push(`${L.name}: plate ${p} has no rotation track`);
    if (!(b >= e)) problems.push(`${L.name}: b < e for plate ${p}`);
    const a = geoArea(f); // steradians; > 2π would mean a ring wound the wrong way for d3
    if (a > 2 * Math.PI) problems.push(`${L.name}: feature (p=${p}) inverted, area ${a.toFixed(2)} sr`);
    maxArea = Math.max(maxArea, a);
    total += a;
  }
  console.log(`${L.name}: ${L.fc.features.length} features, total area ${(total * 6371 ** 2 / 1e6).toFixed(1)} Mkm², largest ${(maxArea * 6371 ** 2 / 1e6).toFixed(2)} Mkm²`);
}
console.log(`rotations: ${Object.keys(rot.plates).length} plates x ${nT} keyframes, ${rot.times[0]}-${rot.times[nT - 1]} Ma`);
console.log(problems.length ? `PROBLEMS (${problems.length}):\n  ` + problems.slice(0, 30).join("\n  ") : "schema/consistency: OK");
if (problems.length) process.exitCode = 1;

// ---------------------------------------------------------------- browser-equivalent math
function quatAt(id, t) {
  const T = rot.times, q = rot.plates[id];
  let lo = 0, hi = T.length - 1;
  if (t <= T[0]) return q.slice(0, 4);
  if (t >= T[hi]) return q.slice(4 * hi, 4 * hi + 4);
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
  const f = (t - T[lo]) / (T[hi] - T[lo]);
  const a = q.slice(4 * lo, 4 * lo + 4); let b = q.slice(4 * hi, 4 * hi + 4);
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (dot < 0) { b = b.map((v) => -v); dot = -dot; }
  let wa = 1 - f, wb = f;
  if (dot < 0.9999995) { const th = Math.acos(dot), s = Math.sin(th); wa = Math.sin((1 - f) * th) / s; wb = Math.sin(f * th) / s; }
  const r = a.map((v, k) => wa * v + wb * b[k]);
  const n = Math.hypot(...r);
  return r.map((v) => v / n);
}
function rotatePoint([w, x, y, z], [lon, lat]) {
  const l = lon * RAD, p = lat * RAD;
  const vx = Math.cos(p) * Math.cos(l), vy = Math.cos(p) * Math.sin(l), vz = Math.sin(p);
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  const rx = vx + w * tx + (y * tz - z * ty), ry = vy + w * ty + (z * tx - x * tz), rz = vz + w * tz + (x * ty - y * tx);
  return [Math.atan2(ry, rx) * DEG, Math.asin(Math.max(-1, Math.min(1, rz))) * DEG];
}
function reconstruct(fc, t) {
  const out = [];
  const cache = new Map();
  for (const f of fc.features) {
    const { p, b, e } = f.properties;
    if (t > b || t < e) continue;
    if (!cache.has(p)) cache.set(p, quatAt(String(p), t));
    const q = cache.get(p);
    const g = f.geometry;
    if (g.type === "MultiLineString") {
      out.push({ type: "Feature", properties: f.properties, geometry: { type: g.type,
        coordinates: g.coordinates.map((line) => line.map((pt) => rotatePoint(q, pt))) } });
      continue;
    }
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    out.push({ type: "Feature", properties: f.properties, geometry: { type: "MultiPolygon",
      coordinates: polys.map((poly) => poly.map((ring) => ring.map((pt) => rotatePoint(q, pt)))) } });
  }
  return out;
}

// ---------------------------------------------------------------- previews
mkdirSync(outDir, { recursive: true });
const W = 1440, H = 720;
const projection = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]).precision(0.1);
const path = geoPath(projection);
for (const t of TIMES) {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + 28}" viewBox="0 0 ${W} ${H + 28}">`;
  svg += `<rect width="${W}" height="${H + 28}" fill="#ffffff"/><rect width="${W}" height="${H}" fill="#cfe3f0"/>`;
  svg += `<path d="${path(geoGraticule10())}" fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="0.6"/>`;
  let counts = [];
  for (const L of layers) {
    const feats = reconstruct(L.fc, t);
    counts.push(`${L.name} ${feats.length}`);
    // one path per layer (like a single canvas fill) avoids seams between adjacent pieces
    const d = feats.map((f) => path(f) || "").join("");
    svg += `<path d="${d}" fill="${L.fill}" fill-rule="nonzero" stroke="none"/>`;
  }
  svg += `<text x="8" y="${H + 20}" font-family="sans-serif" font-size="16" fill="#222">${t} Ma, Merdith et al. 2021 (${counts.join(", ")})</text></svg>`;
  const file = join(outDir, `paleo-${t}Ma.png`);
  await sharp(Buffer.from(svg)).png().toFile(file);
  console.log(`wrote ${file} (${counts.join(", ")})`);

  // globe views: hemispheres centred on 0°E,20°N and 180°E,20°S
  const R = 300, views = [[0, 20], [180, -20]];
  let g = `<svg xmlns="http://www.w3.org/2000/svg" width="${4 * R}" height="${2 * R + 28}"><rect width="100%" height="100%" fill="#ffffff"/>`;
  views.forEach(([lon0, lat0], k) => {
    const ortho = geoOrthographic().scale(R - 4).translate([R + 2 * R * k, R]).rotate([-lon0, -lat0]).clipAngle(90).precision(0.2);
    const op = geoPath(ortho);
    g += `<path d="${op({ type: "Sphere" })}" fill="#cfe3f0" stroke="#7a8a96"/>`;
    g += `<path d="${op(geoGraticule10())}" fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="0.6"/>`;
    for (const L of layers) g += `<path d="${reconstruct(L.fc, t).map((f) => op(f) || "").join("")}" fill="${L.fill}" stroke="none"/>`;
    g += `<path d="${reconstruct(coastOutline, t).map((f) => op(f) || "").join("")}" fill="none" stroke="#4a3418" stroke-width="0.7"/>`;
  });
  g += `<text x="8" y="${2 * R + 20}" font-family="sans-serif" font-size="16" fill="#222">${t} Ma, orthographic (centres 0°E 20°N and 180°E 20°S), coastline outline = arcs used by one feature only</text></svg>`;
  await sharp(Buffer.from(g)).png().toFile(join(outDir, `paleo-${t}Ma-globe.png`));
}
