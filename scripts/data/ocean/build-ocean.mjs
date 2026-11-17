// Into the deep (v0.33.0): checks the curated files (scripts/data/ocean/curated/, written from sources by research
// helpers and reviewed) and builds what the app reads into public/data/ocean/ from them and fetch-ocean.mjs's answers:
//   features.json        GEBCO's undersea feature names (and the famous ones, with Spanish names, texts and paths)
//   features-notes.json  when each was found and how it got its name (loaded on a tap)
//   wrecks.json          the famous wrecks with their stories, and Wikidata's others
//   deep.json            the depth zones, the records and things at their depths, hydrothermal vents
//   animals.json         sea animals at their depths, by ocean and latitude
//   places.json          kelp forests, the garbage patches, coastal cities and their heights
//
//   node scripts/data/ocean/build-ocean.mjs          (--check: only check)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CUR = path.join(ROOT, 'scripts/data/ocean/curated');
const RAW = path.join(ROOT, 'scripts/data/ocean/raw');
const OUT = path.join(ROOT, 'public/data/ocean');
const check = process.argv.includes('--check');
const read = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const write = (name, d) => { if (check) return; fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name), JSON.stringify(d) + '\n'); };
const problems = [];
const t2 = (o, where) => { if (!o?.en || !o?.es) problems.push(`${where}: missing en or es`); else for (const [k, v] of Object.entries(o)) if (/!/.test(v)) problems.push(`${where}.${k}: an exclamation mark`); };
const at = (lon, lat, where) => { if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) problems.push(`${where}: bad coordinates`); };
const r3 = (x) => Math.round(x * 1000) / 1000;

// ---- features.json and features-notes.json
const gebco = read(path.join(RAW, 'gebco-features.json'));
const cf = read(path.join(CUR, 'features.json'));
if (gebco) {
  const famous = (cf?.features ?? []).map((f) => {
    t2(f.name, `feature ${f.id}.name`); t2(f.text, `feature ${f.id}.text`); at(f.lon, f.lat, `feature ${f.id}`);
    return { id: f.id, name: f.name, kind: f.kind, lon: r3(f.lon), lat: r3(f.lat), ...(f.line?.length > 1 ? { line: f.line.map(([x, y]) => [r3(x), r3(y)]) } : {}), ...(f.depth_m ? { depth_m: f.depth_m } : {}), rank: f.rank ?? 3, text: f.text };
  });
  // GEBCO keeps a name apart from its generic term ("Mariana" + "Trench"): the famous ones are left out of the rows,
  // by their gazetteer id or their full name.
  const famousNames = new Set(famous.map((f) => f.name.en.toLowerCase()));
  const famousIds = new Set((cf?.features ?? []).map((f) => Number(f.gebco)).filter(Boolean));
  const full = (r) => `${r[1]} ${gebco.types[r[2]]}`.toLowerCase();
  const rows = gebco.rows.filter((r) => !famousIds.has(r[0]) && !famousNames.has(r[1].toLowerCase()) && !famousNames.has(full(r))).map((r) => [r[0], r[1], r[2], r[3], r[4]]);
  const notes = Object.fromEntries(gebco.rows.filter((r) => r[5] || r[6]).map((r) => [String(r[0]), [r[5] ?? null, r[6] ?? null]]));
  write('features.json', { types: gebco.types, generic: cf?.generic ?? {}, rows, famous });
  write('features-notes.json', notes);
  console.log(`features.json: ${rows.length} GEBCO names, ${famous.length} famous; notes for ${Object.keys(notes).length}`);
}

// ---- wrecks.json
const cw = read(path.join(CUR, 'wrecks.json'));
const ww = read(path.join(RAW, 'wrecks-wikidata.json')) ?? [];
if (cw) {
  const wrecks = cw.wrecks.map((w) => {
    t2(w.name, `wreck ${w.id}.name`); t2(w.place, `wreck ${w.id}.place`); t2(w.text, `wreck ${w.id}.text`); at(w.lon, w.lat, `wreck ${w.id}`);
    if (!(w.depth_m >= 0)) problems.push(`wreck ${w.id}: depth`);
    return { id: w.id, name: w.name, lon: w.lon, lat: w.lat, depth_m: w.depth_m, year: w.year, ...(w.found ? { found: w.found } : {}), era: w.era, kind: w.kind, place: w.place, text: w.text };
  });
  const near = (a, b) => Math.abs(a[0] - b.lon) < 0.5 && Math.abs(a[1] - b.lat) < 0.5;
  const names = new Set(wrecks.flatMap((w) => [w.name.en.toLowerCase(), w.name.es.toLowerCase()]));
  const more = ww.filter((w) => !names.has(w.n[0].toLowerCase()) && !wrecks.some((c) => near(w.at, c))).map((w) => ({ id: w.id, n: w.n, at: w.at, ...(w.dep ? { dep: w.dep } : {}), ...(w.y ? { y: w.y } : {}) }));
  write('wrecks.json', { wrecks, more });
  console.log(`wrecks.json: ${wrecks.length} famous + ${more.length} from Wikidata`);
}

// ---- deep.json
const deep = read(path.join(CUR, 'deep.json'));
if (deep) {
  for (const z of deep.zones) for (const k of ['name', 'light', 'temp', 'life', 'fact']) t2(z[k], `zone ${z.id}.${k}`);
  for (const mk of deep.markers) { t2(mk.name, `marker ${mk.id}.name`); t2(mk.text, `marker ${mk.id}.text`); if (mk.lon != null) at(mk.lon, mk.lat, `marker ${mk.id}`); }
  deep.vents ??= []; deep.markers ??= [];
  for (const v of deep.vents) { t2(v.name, `vent ${v.id}.name`); t2(v.text, `vent ${v.id}.text`); at(v.lon, v.lat, `vent ${v.id}`); }
  write('deep.json', {
    zones: deep.zones.map(({ id, top_m, bottom_m, name, light, temp, life, fact }) => ({ id, top_m, bottom_m, name, light, temp, life, fact })),
    markers: deep.markers.map(({ id, depth_m, kind, name, place, lon, lat, year, text }) => ({ id, depth_m, kind, name, ...(place ? { place } : {}), ...(lon != null ? { lon, lat } : {}), ...(year ? { year } : {}), text })),
    vents: deep.vents.map(({ id, name, kind, lon, lat, depth_m, year, text }) => ({ id, name, kind, lon, lat, depth_m, ...(year ? { year } : {}), text })),
  });
  console.log(`deep.json: ${deep.zones.length} zones, ${deep.markers.length} markers, ${deep.vents.length} vents`);
}

// ---- animals.json
const sa = read(path.join(CUR, 'sea-animals.json'));
if (sa) {
  for (const a of sa.animals) {
    t2(a.name, `animal ${a.id}.name`); t2(a.text, `animal ${a.id}.text`);
    if (!(a.depth?.[1] >= a.depth?.[0])) problems.push(`animal ${a.id}: depth range`);
    if (!a.oceans?.length) problems.push(`animal ${a.id}: oceans`);
  }
  write('animals.json', { animals: sa.animals.map(({ id, e, name, sci, group, depth, usual, oceans, lat, text, record }) => ({ id, e, name, sci, group, depth, usual: usual ?? Math.round((depth[0] + depth[1]) / 2), oceans, lat: lat ?? [-90, 90], text, ...(record ? { record } : {}) })) });
  console.log(`animals.json: ${sa.animals.length} animals`);
}

// ---- places.json
const pl = read(path.join(CUR, 'places.json'));
if (pl) {
  for (const k of pl.kelp ?? []) { t2(k.name, `kelp ${k.id}.name`); t2(k.text, `kelp ${k.id}.text`); at(k.lon, k.lat, `kelp ${k.id}`); }
  for (const p of pl.patches ?? []) { t2(p.name, `patch ${p.id}.name`); t2(p.text, `patch ${p.id}.text`); if (!(p.ring?.length >= 4)) problems.push(`patch ${p.id}: ring`); }
  for (const c of pl.rise ?? []) { t2(c.name, `city ${c.id}.name`); at(c.lon, c.lat, `city ${c.id}`); if (!Number.isFinite(c.elev_m)) problems.push(`city ${c.id}: elevation`); }
  write('places.json', {
    kelp: (pl.kelp ?? []).map(({ id, name, lon, lat, text }) => ({ id, name, lon, lat, text })),
    patches: (pl.patches ?? []).map(({ id, name, ring, text }) => ({ id, name, ring, text })),
    rise: (pl.rise ?? []).map(({ id, name, lon, lat, elev_m }) => ({ id, name, lon, lat, elev_m })),
  });
  console.log(`places.json: ${pl.kelp?.length ?? 0} kelp forests, ${pl.patches?.length ?? 0} patches, ${pl.rise?.length ?? 0} cities`);
}

if (problems.length) { console.error(`${problems.length} problem(s):\n- ${problems.slice(0, 40).join('\n- ')}`); process.exit(1); }
console.log(check ? 'all good' : 'written');
