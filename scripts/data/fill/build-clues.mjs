// Fill the map's clues (v0.35.0): for every country of Master the world's deck, things that point to it, from the
// app's own data, each with a theme (nature, culture, people) and a level (1 hard, 2 medium, 3 easy). The game asks a
// country with a hard clue first and gives an easier one after each miss.
//  - nature: its national animal and its national flower or tree (1), its highest point and a lowest point below sea
//    level (2), its best-known natural World Heritage site (3);
//  - culture: a national dish and its main export (1), its official languages (2), its best-known cultural World
//    Heritage sites (2, 3);
//  - people: three of the best-known people born there (by how many Wikipedias have an article on them), the least
//    known first, with their field (not their description, which often names their nationality).
// Clues written by hand (curated-clues.json) for the countries the data says too little about. The capital is the
// last resort. A clue that names the country gives it away and is left out. Heights are kept as numbers (m) for the
// app to write the reader's way ({m} in the text). Writes public/data/fill/clues.json; --check compares it with what
// it would write.
// Usage: node scripts/data/fill/build-clues.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(path.join(ROOT, 'package.json'));
const { feature } = require('topojson-client');
const { geoContains } = require('d3-geo');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const OUT = path.join(ROOT, 'public/data/fill/clues.json');
const CURATED = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'curated-clues.json'), 'utf8')).clues;
const FIELD = {
  leaders: ['leader', 'líder'], science: ['science', 'ciencia'], letters: ['writer', 'escritor o escritora'], arts: ['art', 'arte'],
  music: ['music', 'música'], screen: ['film and television', 'cine y televisión'], sport: ['sport', 'deporte'], thought: ['thinker', 'pensamiento'],
  explore: ['explorer', 'exploración'], other: ['', ''],
};

const deck = J('public/data/master/deck.json').countries;
const meta = J('public/data/base/countries-meta.json');
const attrs = J('public/data/attributes/countries.json');
const heritage = J('public/data/layers/heritage.json').sites.filter((s) => !s.x && !s.merged);
const born = J('public/data/born/people.json');

// Where each person was born: the country whose shape holds the birthplace.
const topo = J('public/data/base/countries-50m.json');
const shapes = feature(topo, topo.objects.countries).features.map((f) => {
  let w = 180, s = 90, e = -180, n = -90;
  const walk = (c) => (typeof c[0] === 'number' ? ((w = Math.min(w, c[0])), (e = Math.max(e, c[0])), (s = Math.min(s, c[1])), (n = Math.max(n, c[1]))) : c.forEach(walk));
  walk(f.geometry?.coordinates ?? []);
  return { f, id: f.id, b: [w, s, e, n] };
});
const countryAt = (lon, lat) => {
  for (const x of shapes) {
    if (lon < x.b[0] || lon > x.b[2] || lat < x.b[1] || lat > x.b[3]) continue;
    if (x.f.geometry && geoContains(x.f, [lon, lat])) return x.id;
  }
  return null;
};

const cat = (field, key) => attrs.fields[field]?.categories?.[key];
const names = (id) => [meta[id]?.n, meta[id]?.es, meta[id]?.sn, meta[id]?.ses].filter(Boolean).map((x) => x.toLowerCase());
/** A clue that names its country gives it away. */
const givesAway = (id, text) => names(id).some((n) => n.length > 3 && text.toLowerCase().includes(n));

const peopleBy = new Map();
for (const p of born.people) {
  const [qid, name, nameEs, , , place, field, wikis] = p;
  const pl = born.places[place];
  if (!pl) continue;
  const id = countryAt(pl[2], pl[3]);
  if (!id) continue;
  if (!peopleBy.has(id)) peopleBy.set(id, []);
  const f = FIELD[born.fields[field]] ?? ['', ''];
  peopleBy.get(id).push({ qid, en: name, es: nameEs || name, wikis, what: f[0], whatEs: f[1] });
}
for (const list of peopleBy.values()) list.sort((a, b) => b.wikis - a.wikis);

const out = {};
let short = [];
for (const c of deck) {
  const id = c.id, a = attrs.data[id] ?? {};
  const clues = [];
  const add = (k, theme, level, en, es, icon, m) => { if (!givesAway(id, en) && !givesAway(id, es)) clues.push({ k, t: theme, l: level, i: icon, en, es, ...(m != null ? { m } : {}) }); };
  const plain = (x) => x.replace(/\s*\((bird|tree|flower|plant)\)$/i, '');
  // Nature.
  const an = a.national_animal && cat('national_animal', a.national_animal);
  if (an) add('animal', 'nature', 1, `National animal: ${plain(an.en)}`, `Animal nacional: ${plain(an.es)}`, an.emoji ?? '🐾');
  const pl = a.national_plant && cat('national_plant', a.national_plant);
  if (pl) add('plant', 'nature', 1, `National flower or tree: ${plain(pl.en)}`, `Flor o árbol nacional: ${plain(pl.es)}`, pl.emoji ?? '🌸');
  if (a.highest_point_name && a.highest_point_m && !/unnamed/i.test(a.highest_point_name)) {
    const nm = String(a.highest_point_name).replace(/^Volcan /, 'Volcán ');
    add('peak', 'nature', 2, `Highest point: ${nm}, {m} m`, `Punto más alto: ${nm}, {m} m`, '⛰️', a.highest_point_m);
  }
  if (a.lowest_point_name && a.lowest_point_m < 0 && !/unnamed/i.test(a.lowest_point_name)) {
    add('low', 'nature', 2, `Lowest point: ${a.lowest_point_name}, {m} m below sea level`, `Punto más bajo: ${a.lowest_point_name}, {m} m bajo el nivel del mar`, '⬇️', -a.lowest_point_m);
  }
  const sites = heritage.filter((s) => s.cc[0] === id).sort((x, y) => (y.pop ?? 0) - (x.pop ?? 0));
  const natural = sites.find((s) => s.c === 'n' && !givesAway(id, s.n[0]) && !givesAway(id, s.n[1] || s.n[0]));
  if (natural) add('site-n', 'nature', 3, `World Heritage: ${natural.n[0]}`, `Patrimonio de la Humanidad: ${natural.n[1] || natural.n[0]}`, '🌿');
  // Culture.
  if (a.national_dish) {
    const dish = String(a.national_dish).split(/,\s*/)[0];
    add('dish', 'culture', 1, `A national dish: ${dish}`, `Un plato nacional: ${dish}`, '🍲');
  }
  const ex = a.top_export && cat('top_export', a.top_export);
  if (ex) add('export', 'culture', 1, `Main export: ${ex.en}`, `Principal exportación: ${ex.es}`, '📦');
  const langs = (a.languages ?? []).map((l) => cat('languages', l)).filter(Boolean);
  if (langs.length) add('lang', 'culture', 2, `${langs.length > 1 ? 'Languages' : 'Language'}: ${langs.map((l) => l.en).join(', ')}`, `${langs.length > 1 ? 'Lenguas' : 'Lengua'}: ${langs.map((l) => l.es).join(', ')}`, '🗣️');
  const cultural = sites.filter((s) => s.c !== 'n' && !givesAway(id, s.n[0]) && !givesAway(id, s.n[1] || s.n[0])).slice(0, 2);
  cultural.forEach((s, i) => add(i === 0 ? 'site-c' : 'site-c2', 'culture', i === 0 ? 3 : 2, `World Heritage: ${s.n[0]}`, `Patrimonio de la Humanidad: ${s.n[1] || s.n[0]}`, '🏛️'));
  // People: the three best known, the least known of them first.
  const ppl = (peopleBy.get(id) ?? []).filter((p) => !givesAway(id, p.en)).slice(0, 3).reverse();
  ppl.forEach((p, i) => {
    const level = ppl.length === 3 ? i + 1 : ppl.length === 2 ? i + 2 : 3;
    add(`person${i}`, 'people', level, `Born here: ${p.en}${p.what ? ` (${p.what})` : ''}`, `Nació aquí: ${p.es}${p.whatEs ? ` (${p.whatEs})` : ''}`, '👤');
  });
  // Written by hand, then the last resort.
  for (const x of CURATED[id] ?? []) clues.push(x);
  if (c.cap) add('capital', 'easy', 3, `Capital: ${c.cap.en}`, `Capital: ${c.cap.es}`, '🏙️');
  out[id] = clues;
  if (clues.filter((x) => x.k !== 'capital').length < 3) short.push(id);
}

const json = JSON.stringify({ about: 'Fill the map clues (v0.35.0): per country, clues from the app\'s data with a theme (nature, culture, people, easy) and a level (1 hard, 2 medium, 3 easy). Built by scripts/data/fill/build-clues.mjs.', clues: out });
if (process.argv.includes('--check')) {
  const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (now !== json) { console.log('public/data/fill/clues.json is out of date: run node scripts/data/fill/build-clues.mjs'); process.exit(1); }
  console.log('fill clues are up to date');
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
  const n = Object.values(out).map((x) => x.length);
  console.log(`clues for ${deck.length} countries: ${n.reduce((a, b) => a + b, 0)} in all, ${(json.length / 1024).toFixed(0)} KB; fewer than 3 besides the capital: ${short.length} (${short.join(' ')})`);
}
