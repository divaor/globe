// Into the deep (v0.33.0): the heights of the coastal cities on the sea-rising slider, from GeoNames (CC BY 4.0):
// for each city drafted in curated/places.json ("rise_draft"), the biggest GeoNames city within 25 km of its centre,
// its surveyed elevation where GeoNames has one, else its terrain height (the "dem" column: SRTM's average for the
// ~90 m square around the point). The cities move to "rise" with the height and where it came from.
//
//   node scripts/data/ocean/rise-heights.mjs     (needs .cache/geonames/cities500.txt, as scripts/data/build-base.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const F = path.join(ROOT, 'scripts/data/ocean/curated/places.json');
const places = JSON.parse(fs.readFileSync(F, 'utf8'));
const draft = places.rise_draft ?? [];
if (!draft.length) { console.log('nothing drafted'); process.exit(0); }
const rows = fs.readFileSync(path.join(ROOT, '.cache/geonames/cities500.txt'), 'utf8').split('\n');
const km = (a, b, c, d) => { const r = Math.PI / 180, x = (c - a) * r * Math.cos(((b + d) / 2) * r), y = (d - b) * r; return Math.hypot(x, y) * 6371; };
const cities = [];
for (const line of rows) {
  const f = line.split('\t');
  if (f.length < 17) continue;
  cities.push({ id: f[0], name: f[1], lat: Number(f[4]), lon: Number(f[5]), pop: Number(f[14]), elev: f[15] === '' ? null : Number(f[15]), dem: Number(f[16]) });
}
const done = [];
for (const c of draft) {
  // The GeoNames city of the same name within 40 km, else the biggest within 25 km.
  const simple = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const same = cities.filter((g) => km(c.lon, c.lat, g.lon, g.lat) < 40 && simple(g.name) === simple(c.name.en)).sort((a, b) => b.pop - a.pop)[0];
  const near = same ?? cities.filter((g) => km(c.lon, c.lat, g.lon, g.lat) < 25).sort((a, b) => b.pop - a.pop)[0];
  if (!near) { console.log(`${c.id}: no GeoNames city near`); continue; }
  const h = near.elev ?? (near.dem > -9000 ? near.dem : null);
  if (h == null) { console.log(`${c.id}: no height for ${near.name}`); continue; }
  done.push({ id: c.id, name: c.name, lon: c.lon, lat: c.lat, elev_m: h, src: `GeoNames ${near.id} (${near.name}): ${near.elev != null ? 'elevation' : 'terrain height (SRTM)'}, CC BY 4.0` });
  console.log(`${c.id}: ${near.name} (${near.pop}) ${h} m${near.elev != null ? '' : ' (dem)'}; draft said ${c.elev_m_unverified}`);
}
places.rise = done.sort((a, b) => a.elev_m - b.elev_m);
delete places.rise_draft;
fs.writeFileSync(F, JSON.stringify(places, null, 2) + '\n');
console.log(`rise: ${done.length} cities`);
