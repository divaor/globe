// The travel guide's data (v0.26.0): about 700 cities, each with what to eat, what to see, what the stories tell of
// it, its museums and its weather month by month. Everything but the museums and the Wikivoyage page names comes
// from the app's own data; those two come from Wikidata (CC0), fetched once and kept in scripts/data/guide/.
//
//   node scripts/data/guide/build-guide.mjs --fetch   fetch Wikidata (museums near each city, Wikivoyage titles)
//   node scripts/data/guide/build-guide.mjs           build public/data/guide/
//   node scripts/data/guide/build-guide.mjs --check   in check:data: fails if the files are out of date or a known
//                                                     city's guide is missing what it should have (it reads the
//                                                     ids and weather the last build kept in derived.json)
//
// Which cities: every capital, every city of a million people or more, and towns with two World Heritage sites or
// great structures or more within reach (Cusco, Luxor, Kraków, Granada…). Each gets its Wikidata id from Natural
// Earth's populated places (.cache/ne/ne_10m_populated_places.geojson, which the base map is built from).
// Weather: CRU CL 2.0 monthly normals 1961–1990 on a 10′ grid (New et al. 2002, .cache/climate/, downloaded by
// --fetch): mean temperature, daily range, rain and wet days, from the nearest land cell.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HERE = path.join(ROOT, 'scripts/data/guide');
const OUT = path.join(ROOT, 'public/data/guide');
const CLIMATE = path.join(ROOT, '.cache/climate');
const UA = 'AtlasGlobe-research/1.0 (https://example.org)';
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const args = process.argv.slice(2);

/** Great-circle distance in km. */
const km = (a, b) => {
  const r = Math.PI / 180;
  const s = Math.sin(((b[1] - a[1]) * r) / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
};
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const r3 = (v) => Math.round(v * 1000) / 1000;

// ---- The cities ---------------------------------------------------------------------------------------------
const meta = read('base/countries-meta.json');
const C = read('base/cities.json');
const col = (k) => C.fields.indexOf(k);
const heritage = read('layers/heritage.json').sites.filter((s) => s.at && !s.x && !s.merged);
const structures = read('structures/items.json').items.filter((x) => x.at && (x.type === 'structure' || x.type === 'site'));

function pickCities() {
  const out = [];
  for (const r of C.rows) {
    const at = [r[col('lon')], r[col('lat')]];
    const country = r[col('country')];
    if (!meta[country]) continue;
    const pop = r[col('pop')], cap = r[col('capital')];
    let why = cap === 2 ? 'capital' : pop >= 1e6 ? 'big' : '';
    if (!why) {
      const n = heritage.filter((s) => km(at, s.at) < 25).length + structures.filter((s) => km(at, s.at) < 15).length;
      if (n >= 2) why = 'sights';
    }
    if (why) out.push({ name: r[col('name')], es: r[col('name_es')] || r[col('name')], at, country, pop, capital: cap, admin1: r[col('admin1')] || '', tz: r[col('tz')] || '', why });
  }
  // Two points of one city (a capital listed twice): keep the first (the most important).
  const kept = [];
  for (const c of out) if (!kept.some((k) => k.country === c.country && km(k.at, c.at) < 8)) kept.push(c);
  // Ids: the name, with the country where two share it.
  const count = {};
  for (const c of kept) count[slug(c.name)] = (count[slug(c.name)] ?? 0) + 1;
  for (const c of kept) c.id = count[slug(c.name)] > 1 ? `${slug(c.name)}-${c.country.toLowerCase()}` : slug(c.name);
  // Two of one name in one country (Suzhou, Jiangsu and Suzhou, Anhui): the second also gets its province.
  const seen = new Set();
  for (const c of kept) { if (seen.has(c.id)) c.id = `${c.id}-${slug(c.admin1) || 2}`; seen.add(c.id); }
  return kept;
}

/** Wikidata ids from Natural Earth's populated places: the nearest place of the same country with the same name. */
function addQids(cities) {
  const fc = JSON.parse(fs.readFileSync(path.join(ROOT, '.cache/ne/ne_10m_populated_places.geojson'), 'utf8'));
  const pts = fc.features.filter((f) => f.properties.WIKIDATAID).map((f) => { const p = f.properties; return { at: f.geometry.coordinates, q: p.WIKIDATAID, names: [p.NAME, p.NAME_EN, p.NAMEASCII, p.NAME_ES, p.NAMEPAR, p.NAMEALT].filter(Boolean) }; });
  let miss = 0;
  for (const c of cities) {
    let best = null, bd = 3;
    for (const p of pts) { const d = km(c.at, p.at); if (d < bd) { bd = d; best = p; } }
    if (best) {
      c.qid = best.q;
      // Other names it goes by, for searching ("Cusco" for Cuzco, "Bombay" for Mumbai).
      c.also = [...new Set(best.names.map((n) => n.trim()))].filter((n) => n !== c.name && n !== c.es && n.length > 1).join('|');
    } else miss++;
  }
  return miss;
}

// ---- Weather: CRU CL 2.0, the nearest land cell ------------------------------------------------------------------
async function climate(cities) {
  const need = new Map();
  for (const c of cities) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) need.set(`${Math.floor(c.at[1] * 6) + dy},${Math.floor(c.at[0] * 6) + dx}`, null);
  const grid = {};
  for (const v of ['tmp', 'dtr', 'pre', 'rd0']) {
    const f = path.join(CLIMATE, `grid_10min_${v}.dat.gz`);
    if (!fs.existsSync(f)) throw new Error(`${f} is missing: run with --fetch`);
    const rl = readline.createInterface({ input: fs.createReadStream(f).pipe(zlib.createGunzip()), crlfDelay: Infinity });
    const g = (grid[v] = new Map());
    for await (const line of rl) {
      const p = line.trim().split(/\s+/).map(Number);
      const key = `${Math.floor(p[0] * 6)},${Math.floor(p[1] * 6)}`;
      if (need.has(key)) g.set(key, { at: [p[1], p[0]], m: p.slice(2, 14) });
    }
  }
  let miss = 0;
  for (const c of cities) {
    let best = null, bd = 40;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const key = `${Math.floor(c.at[1] * 6) + dy},${Math.floor(c.at[0] * 6) + dx}`;
      const t = grid.tmp.get(key);
      if (!t) continue;
      const d = km(c.at, t.at);
      if (d < bd) { bd = d; best = key; }
    }
    if (!best || !grid.pre.get(best)) { miss++; continue; }
    c.climate = {
      t: grid.tmp.get(best).m.map((x) => Math.round(x * 10)),
      r: grid.dtr.get(best)?.m.map((x) => Math.round(x * 10)) ?? null,
      p: grid.pre.get(best).m.map((x) => Math.round(x)),
      d: grid.rd0.get(best)?.m.map((x) => Math.round(x * 10)) ?? null,
    };
  }
  return miss;
}

// ---- Wikidata: museums near each city, and its Wikivoyage pages --------------------------------------------------
const MUSEUMS = path.join(HERE, 'wikidata-museums.json');
const PAGES = path.join(HERE, 'wikidata-pages.json');
const radius = (pop) => (pop >= 8e6 ? 18 : pop >= 2e6 ? 14 : pop >= 5e5 ? 10 : 6);

async function sparql(q) {
  for (let tries = 0; tries < 6; tries++) {
    try {
      const res = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(q)}`, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
      if (res.ok) return (await res.json()).results.bindings;
    } catch { /* a dropped connection: try again */ }
    await new Promise((r) => setTimeout(r, 4000 * (tries + 1)));
  }
  throw new Error('Wikidata did not answer');
}

const museumQuery = (c) => `SELECT ?m ?en ?es ?coord ?visitors ?sl ?type ?typeEn ?web WHERE {
  SERVICE wikibase:around { ?m wdt:P625 ?coord . bd:serviceParam wikibase:center "Point(${c.at[0]} ${c.at[1]})"^^geo:wktLiteral ; wikibase:radius "${radius(c.pop)}" . }
  ?m wdt:P31 ?type . ?type wdt:P279* wd:Q33506 .
  ?m wikibase:sitelinks ?sl . FILTER(?sl >= 3)
  OPTIONAL { ?m wdt:P1174 ?visitors }
  OPTIONAL { ?m wdt:P856 ?web }
  OPTIONAL { ?m rdfs:label ?en FILTER(lang(?en)='en') }
  OPTIONAL { ?m rdfs:label ?es FILTER(lang(?es)='es') }
  OPTIONAL { ?type rdfs:label ?typeEn FILTER(lang(?typeEn)='en') }
}`;

async function fetchWikidata(cities) {
  // Wikivoyage and Wikipedia page names, 80 cities a query.
  const pages = fs.existsSync(PAGES) ? JSON.parse(fs.readFileSync(PAGES, 'utf8')) : {};
  const todo = cities.filter((c) => c.qid && !pages[c.qid]).map((c) => c.qid);
  for (let i = 0; i < todo.length; i += 80) {
    const vals = todo.slice(i, i + 80).map((q) => `wd:${q}`).join(' ');
    const q = `SELECT ?c ?site ?name WHERE { VALUES ?c { ${vals} } ?a schema:about ?c ; schema:isPartOf ?site ; schema:name ?name . VALUES ?site { <https://en.wikivoyage.org/> <https://es.wikivoyage.org/> <https://en.wikipedia.org/> <https://es.wikipedia.org/> } }`;
    for (const q2 of todo.slice(i, i + 80)) pages[q2] ??= {};
    for (const b of await sparql(q)) {
      const id = b.c.value.split('/').pop();
      const key = { 'https://en.wikivoyage.org/': 'wv_en', 'https://es.wikivoyage.org/': 'wv_es', 'https://en.wikipedia.org/': 'wp_en', 'https://es.wikipedia.org/': 'wp_es' }[b.site.value];
      pages[id][key] = b.name.value;
    }
    console.log(`pages: ${Math.min(i + 80, todo.length)}/${todo.length}`);
    fs.writeFileSync(PAGES, `${JSON.stringify(sortKeys(pages), null, 0)}\n`);
  }
  fs.writeFileSync(PAGES, `${JSON.stringify(sortKeys(pages), null, 0)}\n`);
  // Museums within a few km of each city.
  const museums = fs.existsSync(MUSEUMS) ? JSON.parse(fs.readFileSync(MUSEUMS, 'utf8')) : {};
  const left = cities.filter((c) => !museums[c.id]);
  let n = 0;
  const work = async () => {
    for (let c = left.shift(); c; c = left.shift()) {
      const by = {};
      for (const b of await sparql(museumQuery(c))) {
        const id = b.m.value.split('/').pop();
        const m = (by[id] ??= { en: b.en?.value ?? null, es: b.es?.value ?? null, sl: Number(b.sl.value), v: 0, types: [], web: b.web?.value ?? null, at: null });
        if (b.visitors) m.v = Math.max(m.v, Math.round(Number(b.visitors.value)));
        if (b.typeEn && !m.types.includes(b.typeEn.value)) m.types.push(b.typeEn.value);
        const pt = b.coord?.value.match(/Point\(([-\d.e]+) ([-\d.e]+)\)/);
        if (pt && !m.at) m.at = [r3(Number(pt[1])), r3(Number(pt[2]))];
      }
      museums[c.id] = Object.entries(by).sort((a, b) => b[1].sl - a[1].sl || b[1].v - a[1].v).slice(0, 16).map(([id, m]) => ({ id, ...m }));
      if (++n % 25 === 0) { console.log(`museums: ${n}`); fs.writeFileSync(MUSEUMS, `${JSON.stringify(sortKeys(museums))}\n`); }
      await new Promise((r) => setTimeout(r, 300));
    }
  };
  await Promise.all([work(), work()]);
  fs.writeFileSync(MUSEUMS, `${JSON.stringify(sortKeys(museums))}\n`);
}
function sortKeys(o) { return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]])); }

/** A museum's kind, from what Wikidata says it is. */
function museumKind(types) {
  const t = types.join(' ').toLowerCase();
  if (/\bart\b|gallery|fine arts|sculpture|painting|design/.test(t)) return 'art';
  if (/natural history|science|technolog|planetarium|aquarium|zoo|botanic|railway|transport|aviation|maritime|computer|space/.test(t)) return 'science';
  if (/archaeolog|history|historic|military|war|palace|castle|memorial|ethnograph|folk|city museum|national museum/.test(t)) return 'history';
  return 'other';
}

// ---- What each city's guide holds ----------------------------------------------------------------------------
const STORY_DIRS = { eras: 'eras', people: 'people', life: 'life', games: 'games', journeys: 'journeys', beliefs: 'beliefs', writing: 'writing', plagues: 'plagues', disasters: 'disasters', music: 'music', books: 'books', art: 'art', inventions: 'inventions', heritage: 'heritage', space: 'space' };
/** A story item, as the guide lists it: [kind, story, step, icon, name, nombre, lon, lat, date, km]. */
const ref = (kind, x, d) => [kind, x.story, x.step ?? 0, x.icon || '📍', x.name.en, x.name.es || x.name.en, r3(x.at[0]), r3(x.at[1]), x.date ?? '', Math.round(d * 10) / 10];

function guides(cities) {
  const food = read('food/items.json').items.filter((x) => x.at);
  const dishes = food.filter((x) => x.type === 'dish');
  const crops = food.filter((x) => x.type === 'crop');
  const stories = [];
  for (const [kind, dir] of Object.entries(STORY_DIRS)) {
    const f = path.join(ROOT, 'public/data', dir, 'items.json');
    if (!fs.existsSync(f)) continue;
    for (const x of JSON.parse(fs.readFileSync(f, 'utf8')).items) if (x.at && x.story && x.name) stories.push({ kind, x });
  }
  // Battles: every war in Time travel.
  for (const c of read('conflicts/index.json').conflicts) {
    const war = read(`conflicts/${c.id}.json`);
    (war.steps ?? []).forEach((st, i) => {
      for (const b of st.battles ?? []) if (b.at) stories.push({ kind: 'wars', x: { story: c.id, step: i, icon: '⚔️', name: b.name, at: b.at, date: String(b.date ?? st.date ?? '') } });
    });
  }
  const out = {};
  for (const c of cities) {
    const near = (x, r) => km(c.at, x.at) <= r;
    const town = c.pop < 5e5;
    // What to eat: from the city, then the rest of the country, then nearby countries; and what was first grown here.
    const dish = (x, where) => [x.id, where, Math.round(km(c.at, x.at)), x.icon || '🍽️', x.name.en, x.name.es || x.name.en, x.cat ?? '', x.story, x.step ?? 0, x.place?.en ?? '', x.place?.es ?? x.place?.en ?? '', x.date ?? '', r3(x.at[0]), r3(x.at[1])];
    const byKm = (a, b) => a[2] - b[2];
    const here = dishes.filter((x) => near(x, 60)).map((x) => dish(x, 'here')).sort(byKm);
    const country = dishes.filter((x) => x.country === c.country && !near(x, 60)).map((x) => dish(x, 'country')).sort(byKm).slice(0, 16);
    const region = dishes.filter((x) => x.country && x.country !== c.country && near(x, 700)).map((x) => dish(x, 'near')).sort(byKm).slice(0, 6);
    const grown = crops.filter((x) => (x.country === c.country || near(x, 300))).map((x) => dish(x, 'crop')).sort(byKm).slice(0, 6);
    // What to see: World Heritage in and around the city, and a day trip away; great structures.
    const site = (s) => [s.ref, Math.round(km(c.at, s.at)), s.n[0], s.n[1] || s.n[0], s.c, s.y, r3(s.at[0]), r3(s.at[1]), s.img ?? null, s.w?.[0] ?? null, s.w?.[1] ?? null];
    const whs = heritage.filter((s) => near(s, town ? 30 : 40)).map(site).sort((a, b) => a[1] - b[1]);
    const trips = heritage.filter((s) => !near(s, town ? 30 : 40) && near(s, 160)).map(site).sort((a, b) => a[1] - b[1]).slice(0, 8);
    const sights = structures.filter((x) => near(x, town ? 25 : 35)).map((x) => ref('structures', x, km(c.at, x.at)));
    // History here: what the stories tell of the place, a few from each collection.
    const rad = town ? 15 : 25;
    const byKind = {};
    for (const { kind, x } of stories) if (near(x, rad)) (byKind[kind] ??= []).push(ref(kind, x, km(c.at, x.at)));
    const history = [];
    const lists = Object.values(byKind).map((l) => l.sort((a, b) => a[9] - b[9]));
    for (let i = 0; history.length < 36 && lists.some((l) => l[i]); i++) for (const l of lists) if (l[i] && history.length < 36) history.push(l[i]);
    out[c.id] = { eat: [...here, ...country, ...region], grown, whs, trips, sights: sights.sort((a, b) => a[9] - b[9]), history };
  }
  return out;
}

// ---- Build -------------------------------------------------------------------------------------------------
const DERIVED = path.join(HERE, 'derived.json');
async function main() {
  const cities = pickCities();
  // Wikidata ids, other names and weather come from Natural Earth and CRU's grids (in .cache, not in the
  // repository); the build keeps what it took from them in derived.json, which --check (and CI) use instead.
  const sources = fs.existsSync(path.join(ROOT, '.cache/ne/ne_10m_populated_places.geojson')) && fs.existsSync(path.join(CLIMATE, 'grid_10min_rd0.dat.gz'));
  let miss = 0, noClimate = 0;
  if (sources && !args.includes('--check')) {
    miss = addQids(cities);
    noClimate = await climate(cities);
    fs.writeFileSync(DERIVED, `${JSON.stringify(Object.fromEntries(cities.map((c) => [c.id, { qid: c.qid ?? null, also: c.also ?? '', climate: c.climate ?? null }])))}\n`);
  } else {
    const d = JSON.parse(fs.readFileSync(DERIVED, 'utf8'));
    for (const c of cities) { const x = d[c.id]; if (x?.qid) c.qid = x.qid; else miss++; if (x?.also) c.also = x.also; if (x?.climate) c.climate = x.climate; else noClimate++; }
  }
  if (args.includes('--fetch')) {
    fs.mkdirSync(CLIMATE, { recursive: true });
    for (const v of ['tmp', 'dtr', 'pre', 'rd0']) {
      const f = path.join(CLIMATE, `grid_10min_${v}.dat.gz`);
      if (fs.existsSync(f)) continue;
      const res = await fetch(`https://crudata.uea.ac.uk/cru/data/hrg/tmc/grid_10min_${v}.dat.gz`, { headers: { 'User-Agent': UA } });
      fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
    }
    await fetchWikidata(cities);
  }
  const pages = JSON.parse(fs.readFileSync(PAGES, 'utf8'));
  const museums = JSON.parse(fs.readFileSync(MUSEUMS, 'utf8'));
  const g = guides(cities);
  // The index: every guide city with its facts and weather (the guide's list and the trip need no more).
  const index = {
    about: 'The travel guide’s cities (scripts/data/guide/build-guide.mjs). Weather: CRU CL 2.0 1961–1990 normals (New et al. 2002): t mean °C×10, r daily range °C×10, p rain mm, d wet days×10, by month. Museums and page names: Wikidata (CC0).',
    fields: ['id', 'name', 'nombre', 'lon', 'lat', 'country', 'pop', 'capital', 'admin1', 'tz', 'qid', 'wv_en', 'wv_es', 'wp_en', 'wp_es', 'climate', 'also'],
    cities: cities.map((c) => { const p = pages[c.qid] ?? {}; return [c.id, c.name, c.es, r3(c.at[0]), r3(c.at[1]), c.country, c.pop, c.capital, c.admin1, c.tz, c.qid ?? null, p.wv_en ?? null, p.wv_es ?? null, p.wp_en ?? null, p.wp_es ?? null, c.climate ?? null, c.also || '']; }),
  };
  // Each city's guide: the ids of what to eat and see (the app has the items), what the stories tell, and museums.
  const files = { 'index.json': JSON.stringify(index) };
  for (const c of cities) {
    const m = (museums[c.id] ?? []).map((x) => [x.id, x.en ?? x.es ?? x.id, x.es ?? x.en ?? x.id, museumKind(x.types), x.v || 0, x.sl, x.at, x.web]);
    files[`c/${c.id}.json`] = JSON.stringify({ id: c.id, ...g[c.id], museums: m });
  }
  // Checks: known cities and what their guides must have.
  const want = { lima: { eat: 'ceviche', museum: true }, madrid: { whs: true, museum: 'Q160112' }, kyoto: { whs: true }, 'mexico-city': { eat: true, museum: true }, cuzco: { whs: true } };
  const problems = [];
  for (const [id, w] of Object.entries(want)) {
    const c = cities.find((x) => x.id === id), gg = g[id];
    if (!c) { problems.push(`${id}: not a guide city`); continue; }
    if (!c.qid) problems.push(`${id}: no Wikidata id`);
    if (!c.climate) problems.push(`${id}: no weather`);
    if (w.eat === true && !gg.eat.length) problems.push(`${id}: nothing to eat`);
    if (typeof w.eat === 'string' && !gg.eat.some((e) => e[0] === w.eat || e[4].toLowerCase().includes(w.eat))) problems.push(`${id}: no ${w.eat}`);
    if (w.whs && !gg.whs.length) problems.push(`${id}: no World Heritage site`);
    if (w.museum === true && !(museums[id] ?? []).length) problems.push(`${id}: no museum`);
    if (typeof w.museum === 'string' && !(museums[id] ?? []).some((m) => m.id === w.museum)) problems.push(`${id}: no ${w.museum}`);
  }
  const noMuseum = cities.filter((c) => !(museums[c.id] ?? []).length).length;
  console.log(`${cities.length} cities (${cities.filter((c) => c.why === 'capital').length} capitals, ${cities.filter((c) => c.why === 'big').length} of a million or more, ${cities.filter((c) => c.why === 'sights').length} for their sights); ${miss} without a Wikidata id, ${noClimate} without weather, ${noMuseum} without a museum on Wikidata`);
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  if (args.includes('--check')) {
    const stale = Object.entries(files).filter(([f, s]) => !fs.existsSync(path.join(OUT, f)) || fs.readFileSync(path.join(OUT, f), 'utf8') !== s);
    const extra = fs.existsSync(path.join(OUT, 'c')) ? fs.readdirSync(path.join(OUT, 'c')).filter((f) => !files[`c/${f}`]) : [];
    if (stale.length || extra.length) { console.error(`public/data/guide is out of date (${stale.length} files differ, ${extra.length} extra): run node scripts/data/guide/build-guide.mjs`); process.exit(1); }
    console.log('guide data is up to date');
    return;
  }
  fs.rmSync(path.join(OUT, 'c'), { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'c'), { recursive: true });
  let bytes = 0;
  for (const [f, s] of Object.entries(files)) { fs.writeFileSync(path.join(OUT, f), s); bytes += s.length; }
  console.log(`wrote public/data/guide (${Object.keys(files).length} files, ${(bytes / 1024).toFixed(0)} KB; index ${(files['index.json'].length / 1024).toFixed(0)} KB)`);
}
await main();
