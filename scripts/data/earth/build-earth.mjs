// Journey to the centre of the Earth (v0.32.0): checks the curated files (scripts/data/earth/curated/, written from
// sources by research helpers and reviewed) and writes what the app reads into public/data/earth/:
//   inside.json   the layers' facts, the real things at their depths (the dig column), falling through the Earth
//   howdeep.json  the "How deep?" game's items
//   hotspots.json mantle hotspots and their dated chains
//   wonders.json  famous caves, geysers and hot springs, impact craters and mines (curated, then Wikidata's others)
//   plates.json   today's plate motions (NNR-MORVEL56 rotation poles, by PB2002 plate code)
//
//   node scripts/data/earth/build-earth.mjs          (--check: only check)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CUR = path.join(ROOT, 'scripts/data/earth/curated');
const RAW = path.join(ROOT, 'scripts/data/earth/raw');
const OUT = path.join(ROOT, 'public/data/earth');
const check = process.argv.includes('--check');
const read = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const write = (name, d) => { if (check) return; fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name), JSON.stringify(d) + '\n'); };
const problems = [];
const t2 = (o, where) => { if (!o?.en || !o?.es) problems.push(`${where}: missing en or es`); else for (const [k, v] of Object.entries(o)) if (/!/.test(v)) problems.push(`${where}.${k}: an exclamation mark`); };
const at = (o, where) => { if (!Number.isFinite(o.lon) || !Number.isFinite(o.lat) || Math.abs(o.lat) > 90 || Math.abs(o.lon) > 180) problems.push(`${where}: bad coordinates`); };

// ---- inside.json
const layers = read(path.join(CUR, 'layers.json'));
const markers = read(path.join(CUR, 'depth-markers.json'));
if (layers && markers) {
  for (const l of layers.layers) { for (const k of ['name', 'state', 'made', 'know', 'fact']) t2(l[k], `layer ${l.id}.${k}`); }
  for (const m of markers.markers) { t2(m.name, `marker ${m.id}.name`); t2(m.place, `marker ${m.id}.place`); t2(m.text, `marker ${m.id}.text`); at(m, `marker ${m.id}`); if (!(m.depth_m >= 0)) problems.push(`marker ${m.id}: depth`); }
  write('inside.json', {
    layers: layers.layers.map(({ id, temp_c, pressure_gpa, density, state, made, know, fact, src }) => ({ id, temp_c, pressure_gpa, density, state, made, know, fact, src })),
    markers: markers.markers.map(({ id, depth_m, below, kind, name, place, lon, lat, year, text, src }) => ({ id, depth_m, below, kind, name, place, lon, lat, ...(year ? { year } : {}), text, src })),
    moho: layers.moho, lehmann: layers.lehmann, fall_through: layers.fall_through,
  });
  console.log(`inside.json: ${layers.layers.length} layers, ${markers.markers.length} markers`);
} else console.log('inside.json: waiting for layers.json and depth-markers.json');

// ---- howdeep.json
const howdeep = read(path.join(CUR, 'howdeep.json'));
if (howdeep) {
  const items = howdeep.items ?? howdeep.markers ?? [];
  for (const m of items) { t2(m.name, `howdeep ${m.id}.name`); at(m, `howdeep ${m.id}`); }
  write('howdeep.json', { items });
  console.log(`howdeep.json: ${items.length} items`);
}

// ---- hotspots.json
const hot = read(path.join(CUR, 'hotspots.json'));
if (hot) {
  for (const s of hot.hotspots) { t2(s.name, `hotspot ${s.id}.name`); t2(s.text, `hotspot ${s.id}.text`); at(s, `hotspot ${s.id}`); for (const c of s.chain) { at(c, `hotspot ${s.id} chain`); if (!Number.isFinite(c.age_ma)) problems.push(`hotspot ${s.id} chain: age`); } }
  write('hotspots.json', { hotspots: hot.hotspots.map(({ id, name, lon, lat, text, chain }) => ({ id, name, lon, lat, text, chain: chain.map(({ name: n, lon: x, lat: y, age_ma }) => ({ name: n, lon: x, lat: y, age_ma })) })) });
  console.log(`hotspots.json: ${hot.hotspots.length} hotspots, ${hot.hotspots.reduce((a, s) => a + s.chain.length, 0)} dated places`);
}

// ---- wonders.json: the curated ones (with their texts) first, then Wikidata's others (names only), not the same twice.
const won = read(path.join(CUR, 'wonders.json'));
const wd = read(path.join(RAW, 'wonders-wikidata.json'));
if (won) {
  const out = [];
  const kinds = { caves: 'cave', geysers: 'geyser', craters: 'crater', mines: 'mine' };
  for (const [group, kind] of Object.entries(kinds)) for (const w of won[group] ?? []) {
    t2(w.name, `${kind} ${w.id}.name`); t2(w.text, `${kind} ${w.id}.text`); at(w, `${kind} ${w.id}`);
    const k = kind === 'geyser' && /spring|pamukkale|beppu|prismatic/i.test(`${w.id} ${w.name.en}`) ? 'spring' : kind;
    out.push({ id: w.id, k, n: [w.name.en, w.name.es], at: [w.lon, w.lat], place: [w.place?.en ?? '', w.place?.es ?? ''], text: [w.text.en, w.text.es], facts: w.facts ?? {}, top: 1 });
  }
  let added = 0;
  if (wd) {
    const near = (a, b) => Math.abs(a[0] - b[0]) < 0.3 && Math.abs(a[1] - b[1]) < 0.3;
    for (const [k, list] of Object.entries(wd)) for (const w of list) {
      if (out.some((o) => near(o.at, w.at) && (o.k === k || (k === 'spring' && o.k === 'geyser')))) continue;
      out.push({ id: w.id, k, n: w.n, at: w.at, sl: w.sl, ...(w.len ? { len: w.len } : {}), ...(w.dep ? { dep: w.dep } : {}), ...(w.dia ? { dia: w.dia } : {}) });
      added++;
    }
  }
  write('wonders.json', { src: 'Curated from sources (see scripts/data/earth/curated/wonders.json); others from Wikidata (CC0)', wonders: out });
  console.log(`wonders.json: ${out.filter((o) => o.top).length} curated + ${added} from Wikidata`);
}

// ---- plates.json (today's motions)
const nnr = read(path.join(CUR, 'nnr-morvel56.json'));
if (nnr) {
  const plates = Object.fromEntries(Object.entries(nnr.plates).map(([code, p]) => [code, [p.lat, p.lon, p.omega]]));
  write('plates.json', { model: nnr.model, ref: nnr.ref, plates });
  console.log(`plates.json: ${Object.keys(plates).length} plates`);
}

if (problems.length) { console.error(`${problems.length} problem(s):\n- ${problems.slice(0, 40).join('\n- ')}`); process.exit(1); }
console.log(check ? 'all good' : 'written');
