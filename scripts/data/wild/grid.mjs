// The grid that Wild world (v0.30.0) and Green planet (v0.31.0) keep ranges on: geohashes of 3 characters, 256
// columns of 1.40625° from 180° W, 128 rows from 90° S (GBIF's map squares); and which countries each square touches.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';
import { geoContains, geoBounds, geoDistance } from 'd3-geo';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

export const COLS = 256, ROWS = 128, DEG = 360 / COLS;
const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';
/** The grid square of a geohash of 3 characters (15 bits: longitude and latitude bits interleaved, longitude first). */
export function cellOfHash(g) {
  let bits = 0;
  for (const ch of g) bits = bits * 32 + B32.indexOf(ch);
  let lon = 0, lat = 0;
  for (let i = 14; i >= 0; i--) {
    const b = (bits >> i) & 1;
    if ((14 - i) % 2 === 0) lon = lon * 2 + b; else lat = lat * 2 + b;
  }
  return lat * COLS + lon; // lon: 8 bits (0..255), lat: 7 bits (0..127)
}
export const cellCenter = (c) => [-180 + (c % COLS + 0.5) * DEG, -90 + (Math.floor(c / COLS) + 0.5) * DEG];
export const cellAt = (lon, lat) => Math.min(ROWS - 1, Math.max(0, Math.floor((lat + 90) / DEG))) * COLS + ((Math.floor((lon + 180) / DEG) % COLS) + COLS) % COLS;
export function neighbours(c) {
  const x = c % COLS, y = Math.floor(c / COLS), out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const yy = y + dy; if (yy < 0 || yy >= ROWS) continue;
    out.push(yy * COLS + ((x + dx + COLS) % COLS));
  }
  return out;
}

// ---- Countries: which country each square touches --------------------------------------------------------------
const topo = read(path.join(ROOT, 'public/data/base/countries-50m.json'));
export const meta = read(path.join(ROOT, 'public/data/base/countries-meta.json'));
const shapes = feature(topo, topo.objects.countries).features.map((f) => ({ id: f.id, f, b: geoBounds(f) }));
const inBox = (b, lon, lat) => lat >= b[0][1] - 0.01 && lat <= b[1][1] + 0.01 && (b[0][0] <= b[1][0] ? lon >= b[0][0] - 0.01 && lon <= b[1][0] + 0.01 : lon >= b[0][0] || lon <= b[1][0]);
export function countryAt(lon, lat) {
  for (const s of shapes) if (inBox(s.b, lon, lat) && geoContains(s.f, [lon, lat])) return s.id;
  return null;
}
const cellCountries = new Map();
/** The countries a square touches: its centre and eight points around it. */
export function countriesOf(c) {
  if (cellCountries.has(c)) return cellCountries.get(c);
  const [lon, lat] = cellCenter(c), set = new Set();
  for (const [dx, dy] of [[0, 0], [-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3], [0, -0.42], [0, 0.42], [-0.42, 0], [0.42, 0]]) {
    const id = countryAt(lon + dx * DEG, lat + dy * DEG); if (id) set.add(id);
  }
  const out = [...set];
  cellCountries.set(c, out);
  return out;
}
export const continentOf = (id) => meta[id]?.ct ?? null;

/** A circle of [lon, lat, km] as grid squares. */
export function circleCells([lon, lat, km]) {
  const out = new Set([cellAt(lon, lat)]);
  const r = km / 6371;
  for (let y = 0; y < ROWS; y++) {
    const clat = -90 + (y + 0.5) * DEG;
    if (Math.abs(clat - lat) > km / 111 + DEG) continue;
    for (let x = 0; x < COLS; x++) {
      const c = y * COLS + x;
      if (geoDistance(cellCenter(c), [lon, lat]) <= r + (DEG * Math.PI / 180) * 0.5) out.add(c);
    }
  }
  return [...out];
}

/** Squares as text: the gaps between sorted square numbers as base-36 numbers, joined by dots ("3f.1.1.a"). */
export const packCells = (cs) => { let prev = -1; return cs.map((c) => { const d = c - prev; prev = c; return d.toString(36); }).join('.'); };
/** How many sightings each square has, on a scale of 0 to 9 (log₂). */
export const packCounts = (ns) => ns.map((n) => String(Math.min(9, Math.floor(Math.log2(Math.max(1, n)))))).join('');
export const unpackCells = (s) => { let c = -1; return s ? s.split('.').map((d) => (c += parseInt(d, 36))) : []; };
