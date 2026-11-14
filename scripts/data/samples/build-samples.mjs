// Builds the sample files for "Your data" (public/data/samples/), each showing one kind of table the app reads:
//   life-expectancy.csv  a row per country and year, with world and regional totals (Our World in Data's format):
//                        life expectancy at birth, every tenth year from 1950 and the latest, from Our World in Data
//                        (CC BY 4.0); download it first with
//                        curl -o <src>/life-expectancy.csv "https://ourworldindata.org/grapher/life-expectancy.csv?v=1&csvType=full&useColumnShortNames=false"
//   latin-america-cities.csv  points: the 40 biggest cities of Latin America and the Caribbean, from the app's own
//                        cities (GeoNames, CC BY 4.0)
//   mexico-world-heritage.csv  regions: World Heritage sites in each Mexican state, counted from the app's World
//                        Heritage list (each site at its listed point)
//   my-travels.csv       categories: an example of the countries someone has visited, lived in or wants to visit
// Usage: node scripts/data/samples/build-samples.mjs <src folder with life-expectancy.csv>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';
import { geoContains } from 'd3-geo';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'public/data/samples');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const src = process.argv[2];
if (!src) { console.error('usage: node scripts/data/samples/build-samples.mjs <src folder>'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const q = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
const write = (f, rows) => { fs.writeFileSync(path.join(OUT, f), rows.map((r) => r.map(q).join(',')).join('\n') + '\n'); console.log(`wrote public/data/samples/${f} (${rows.length - 1} rows)`); };

// Life expectancy: every tenth year and the latest.
{
  const lines = fs.readFileSync(path.join(src, 'life-expectancy.csv'), 'utf8').trim().split('\n');
  const head = lines[0].split(',');
  const rows = lines.slice(1).map((l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((x) => x.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')));
  const latest = Math.max(...rows.map((r) => Number(r[2])));
  const keep = rows.filter((r) => { const y = Number(r[2]); return y >= 1950 && (y % 10 === 0 || y === latest); });
  write('life-expectancy.csv', [['Entity', 'Code', 'Year', head[3]], ...keep.map((r) => [r[0], r[1], r[2], Math.round(Number(r[3]) * 10) / 10])]);
}
// Latin America's biggest cities.
{
  const c = read('base/cities.json');
  const meta = read('base/countries-meta.json');
  const F = Object.fromEntries(c.fields.map((f, i) => [f, i]));
  const latam = new Set(Object.entries(meta).filter(([, m]) => m.sr === 'South America' || m.sr === 'Central America' || m.sr === 'Caribbean').map(([k]) => k).concat(['MEX']));
  const top = c.rows.filter((r) => latam.has(r[F.country])).sort((a, b) => b[F.pop] - a[F.pop]).slice(0, 40);
  write('latin-america-cities.csv', [['City', 'Country', 'Latitude', 'Longitude', 'Population', 'Capital'],
    ...top.map((r) => [r[F.name], meta[r[F.country]].n, r[F.lat], r[F.lon], r[F.pop], r[F.capital] === 2 ? 'National capital' : r[F.capital] === 1 ? 'State capital' : 'No'])]);
}
// World Heritage sites in each Mexican state.
{
  const topo = read('base/admin1.json');
  const states = feature(topo, topo.objects.admin1).features.filter((f) => f.properties.a === 'MEX' && f.properties.n);
  const wh = read('layers/heritage.json').sites.filter((s) => s.cc?.includes('MEX') && !s.removed);
  const count = new Map(states.map((s) => [s.properties.es, { n: 0, cultural: 0, natural: 0 }]));
  let placed = 0;
  for (const s of wh) {
    const st = states.find((f) => geoContains(f, s.at));
    if (!st) continue;
    placed++;
    const c = count.get(st.properties.es);
    c.n++; if (s.c === 'n') c.natural++; else c.cultural++;
  }
  console.log(`  Mexico: ${wh.length} sites, ${placed} placed in a state`);
  write('mexico-world-heritage.csv', [['País', 'Estado', 'Sitios del Patrimonio Mundial', 'Culturales', 'Naturales'],
    ...[...count].sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([name, c]) => ['México', name === 'México' ? 'Ciudad de México' : name, c.n, c.cultural, c.natural])]);
}
// An example of travels (categories).
write('my-travels.csv', [['Country', 'Status'],
  ['Mexico', 'Lived there'], ['Peru', 'Visited'], ['Chile', 'Visited'], ['Argentina', 'Visited'], ['Spain', 'Visited'], ['Italy', 'Visited'],
  ['United States', 'Visited'], ['Colombia', 'Lived there'], ['Japan', 'Want to go'], ['Iceland', 'Want to go'], ['Morocco', 'Want to go'],
  ['New Zealand', 'Want to go'], ['Cuba', 'Visited'], ['Guatemala', 'Visited'], ['Egypt', 'Want to go']]);
