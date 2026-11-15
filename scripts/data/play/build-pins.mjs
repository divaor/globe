// Pin it's places (v0.25.0): what the game asks you to pin, gathered from the app's own data into one small file
// (public/data/play/pins.json), so a phone does not load every story to play. Seven packs:
// capitals (the app's cities), World Heritage sites (the World Heritage list), great structures, battles (every
// war in Time travel), dishes, inventions and museums (the stories' items). Each place: its name in English and
// Spanish, where it is, an icon, and what is said after the answer (its country, or the place and date).
// Usage: node scripts/data/play/build-pins.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const OUT = path.join(ROOT, 'public/data/play/pins.json');
const meta = read('base/countries-meta.json');
const attrs = read('attributes/countries.json').data;
const r2 = (v) => Math.round(v * 1000) / 1000;
const country = (a3) => (meta[a3] ? [meta[a3].n, meta[a3].es || meta[a3].n] : null);
/** A place: [English name, Spanish name, lon, lat, icon, English note, Spanish note]. */
const place = (n, at, icon, note) => [n[0], n[1] || n[0], r2(at[0]), r2(at[1]), icon, note?.[0] ?? '', note?.[1] ?? note?.[0] ?? ''];
const packs = {};

// Capitals: one a country (the one its facts name, else the largest), with the country after the answer.
{
  const c = read('base/cities.json'), F = c.fields, col = (k) => F.indexOf(k);
  const by = new Map();
  for (const r of c.rows) {
    if (r[col('capital')] !== 2) continue;
    const a3 = r[col('country')];
    if (!meta[a3] || !(attrs[a3]?.independent ?? true)) continue;
    const named = attrs[a3]?.capital === r[col('name')];
    const cur = by.get(a3);
    if (!cur || (named && !cur.named) || (named === cur.named && r[col('pop')] > cur.pop)) by.set(a3, { r, named, pop: r[col('pop')] });
  }
  packs.capitals = [...by.entries()].sort().map(([a3, { r }]) => place([r[col('name')], r[col('name_es')]], [r[col('lon')], r[col('lat')]], '🏛️', country(a3)));
}
// World Heritage sites, with their country.
{
  const h = read('layers/heritage.json');
  const icon = { c: '🏛️', n: '🌿', m: '🏞️' };
  packs.heritage = h.sites.filter((s) => s.at && !s.d?.some?.((x) => Array.isArray(x) && x.length === 1)).map((s) => place(s.n, s.at, icon[s.c] ?? '🏛️', s.cc?.[0] ? country(s.cc[0]) : null));
}
// Items of the stories: structures, dishes, inventions, museums (with the place and date the stories give).
const items = (dir, ok) => read(`${dir}/items.json`).items.filter((x) => x.at && ok(x))
  .map((x) => place([x.name.en, x.name.es], x.at, x.icon || '📍', x.place ? [x.place.en, x.place.es] : null));
packs.structures = items('structures', (x) => x.type === 'structure' || x.type === 'site');
packs.dishes = items('food', (x) => x.type === 'dish');
packs.inventions = items('inventions', (x) => x.type === 'invention');
packs.museums = items('art', (x) => x.cat === 'museum' && x.type === 'institution');
// Battles: every war in Time travel, with the war and the year.
{
  const seen = new Set();
  packs.battles = [];
  for (const c of read('conflicts/index.json').conflicts) {
    const war = read(`conflicts/${c.id}.json`);
    for (const st of war.steps ?? []) for (const b of st.battles ?? []) {
      if (!b.at || seen.has(b.name.en)) continue;
      seen.add(b.name.en);
      const y = String(b.date ?? st.date ?? '').match(/^(-?\d+)/)?.[1];
      const yr = y ? (Number(y) < 0 ? [`${-Number(y)} BC`, `${-Number(y)} a. C.`] : [y, y]) : ['', ''];
      packs.battles.push(place([b.name.en, b.name.es], b.at, '⚔️', [`${war.name.en}${yr[0] ? `, ${yr[0]}` : ''}`, `${war.name.es}${yr[1] ? `, ${yr[1]}` : ''}`]));
    }
  }
}

const out = { about: 'Places for Pin it, gathered from the app’s data by scripts/data/play/build-pins.mjs: [name, nombre, lon, lat, icon, note, nota].', packs };
const json = JSON.stringify(out);
console.log(Object.entries(packs).map(([k, v]) => `${k} ${v.length}`).join(', '));
for (const [k, v] of Object.entries(packs)) {
  const bad = v.filter((p) => !p[0] || !p[1] || !Number.isFinite(p[2]) || !Number.isFinite(p[3]) || Math.abs(p[2]) > 180 || Math.abs(p[3]) > 90);
  if (bad.length || v.length < 40) { console.error(`${k}: ${v.length} places, ${bad.length} without a name or a place`); process.exit(1); }
}
if (process.argv.includes('--check')) {
  if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== json) { console.error('public/data/play/pins.json is out of date: run node scripts/data/play/build-pins.mjs'); process.exit(1); }
  console.log('pins.json is up to date');
} else {
  fs.writeFileSync(OUT, json);
  console.log(`wrote public/data/play/pins.json (${(json.length / 1024).toFixed(0)} KB)`);
}
