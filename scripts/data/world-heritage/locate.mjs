// Adds to each World Heritage site in public/data/layers/heritage.json the country its place falls in (from the
// app's own country shapes), so a site in a territory (Bermuda, French Polynesia) or filed under a kingdom on
// Wikidata (the Netherlands, Denmark) counts for the country a reader taps. Run by build.py after it writes the file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';
import { geoContains, geoBounds, geoDistance } from 'd3-geo';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FILE = path.join(ROOT, 'public/data/layers/heritage.json');
const shapes = (name) => {
  const topo = JSON.parse(fs.readFileSync(path.join(ROOT, `public/data/base/${name}.json`), 'utf8'));
  return feature(topo, topo.objects.countries).features.map((f) => ({ id: f.id, f, b: geoBounds(f) }));
};
const fine = shapes('countries-10m');
const inBox = (b, [lon, lat]) => lat >= b[0][1] - 0.01 && lat <= b[1][1] + 0.01 && (b[0][0] <= b[1][0] ? lon >= b[0][0] - 0.01 && lon <= b[1][0] + 0.01 : lon >= b[0][0] || lon <= b[1][0]);
function where(at) {
  for (const s of fine) if (inBox(s.b, at) && geoContains(s.f, at)) return s.id;
  // A site on a small island or a coast: the nearest country within about 25 km.
  let best = null, bd = 25 / 6371;
  for (const s of fine) {
    if (!inBox([[s.b[0][0] - 0.5, s.b[0][1] - 0.5], [s.b[1][0] + 0.5, s.b[1][1] + 0.5]], at)) continue;
    for (const ring of polygonsOf(s.f)) for (const p of ring) { const d = geoDistance(at, p); if (d < bd) { bd = d; best = s.id; } }
  }
  return best;
}
function* polygonsOf(f) {
  const g = f.geometry;
  if (g.type === 'Polygon') yield* g.coordinates;
  else if (g.type === 'MultiPolygon') for (const p of g.coordinates) yield* p;
}
const doc = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let added = 0, none = [];
for (const s of doc.sites) {
  if (s.ccx) continue;
  const id = where(s.at);
  if (!id) { if (!s.cc.length) none.push(s.ref); continue; }
  if (!s.cc.includes(id)) { s.cc.push(id); added++; }
}
fs.writeFileSync(FILE, JSON.stringify(doc));
console.log(`countries by place: ${added} added${none.length ? `; no country for ${none.join(', ')}` : ''}`);
