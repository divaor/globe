#!/usr/bin/env node
// Tectonic plates (Bird 2003, PB2002, via github.com/fraxen/tectonicplates, ODC-By).
//   node scripts/data/build-earth.mjs   (downloads into .cache/plates if needed)
// Output: public/data/layers/plates.json — TopoJSON with "plates" (polygons: c code, n name) and
// "bounds" (polylines merged from PB2002 steps: k = boundary class, v = relative velocity mm/yr).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = path.join(ROOT, '.cache/plates');
const SRC = 'https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON';
await fs.mkdir(CACHE, { recursive: true });
for (const f of ['PB2002_plates', 'PB2002_steps']) {
  const file = path.join(CACHE, `${f}.json`);
  try { await fs.access(file); } catch { await fs.writeFile(file, Buffer.from(await (await fetch(`${SRC}/${f}.json`)).arrayBuffer())); }
}
const steps = JSON.parse(await fs.readFile(path.join(CACHE, 'PB2002_steps.json'), 'utf8')).features;
// Merge consecutive steps of the same boundary and class into polylines.
const lines = [];
let cur = null;
for (const s of steps) {
  const p = s.properties;
  const a = [p.STARTLONG, p.STARTLAT], b = [p.FINALLONG, p.FINALLAT];
  const key = `${p.PLATEBOUND}|${p.STEPCLASS}`;
  const last = cur && cur.coords[cur.coords.length - 1];
  const joins = cur && cur.key === key && Math.abs(last[0] - a[0]) < 1e-3 && Math.abs(last[1] - a[1]) < 1e-3 && Math.abs(a[0] - b[0]) < 90;
  if (joins) { cur.coords.push(b); cur.v.push(p.VELOCITYLE); }
  else {
    if (cur) lines.push(cur);
    cur = { key, k: p.STEPCLASS, b: p.PLATEBOUND, coords: [a, b], v: [p.VELOCITYLE] };
  }
}
if (cur) lines.push(cur);
const fc = { type: 'FeatureCollection', features: lines.map((l) => ({ type: 'Feature', properties: { k: l.k, v: Math.round(l.v.reduce((x, y) => x + y, 0) / l.v.length), b: l.b }, geometry: { type: 'LineString', coordinates: l.coords } })) };
const tmp = path.join(CACHE, 'bounds.geojson');
await fs.writeFile(tmp, JSON.stringify(fc));
const plates = JSON.parse(await fs.readFile(path.join(CACHE, 'PB2002_plates.json'), 'utf8'));
plates.features = plates.features.map((f) => ({ ...f, properties: { c: f.properties.Code, n: f.properties.PlateName } }));
const tmpP = path.join(CACHE, 'plates.geojson');
await fs.writeFile(tmpP, JSON.stringify(plates));
await mapshaper.runCommands(`-i "${tmpP}" name=plates -simplify 30% keep-shapes -i "${tmp}" name=bounds -simplify 50% -o "${path.join(ROOT, 'public/data/layers/plates.json')}" format=topojson quantization=1e5 target=*`);
console.log('plates.json:', lines.length, 'boundary lines');
