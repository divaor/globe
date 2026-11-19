// Master the world's four new decks (v0.39.0): public/data/master/cities.json, landmarks.json and nature.json.
//
//  - Big cities: the 250 best-known cities of the travel guide (public/data/guide/index.json, 690 cities with their
//    Spanish names), best known by Wikidata's sitelinks (CC0, through QLever, kept in .cache/master), each with the six
//    nearest of the deck (the ones it is picked among).
//  - Landmarks: the 300 best-known World Heritage sites that have a picture (public/data/layers/heritage.json:
//    UNESCO's list with Wikidata's names, Commons pictures and readers), the country or countries they are in.
//  - Rivers, mountains and seas: a hand-picked list of the best-known rivers, lakes, mountain ranges, deserts and
//    peaks (shapes from Put it on the map, public/data/onmap/: Natural Earth, public domain, with Wikidata's names)
//    and oceans, seas, gulfs, bays, straits and channels (Natural Earth's marine areas, 1:50m), with their shapes in
//    one small TopoJSON.
//
// Outlines needs no file: it asks the countries of public/data/master/deck.json.
//   node scripts/data/master/build-decks.mjs            build
//   node scripts/data/master/build-decks.mjs --check    the files as committed: what each question needs (no network, no cache)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';
import { feature } from 'topojson-client';
import { geoCentroid, geoDistance } from 'd3-geo';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'public/data/master');
const CACHE = path.join(ROOT, '.cache/master');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const r2 = (x) => Math.round(x * 100) / 100;
const KM = 6371;
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** The countries of the deck: continent and a point (the capital), to place what lies in no country (a sea). */
const deck = J('public/data/master/deck.json').countries;
const ctOf = new Map(deck.map((c) => [c.id, c.ct]));
const caps = deck.filter((c) => c.cap && !c.t).map((c) => ({ id: c.id, ct: c.ct, at: c.cap.at }));
const nearestCt = (at) => caps.reduce((b, c) => { const d = geoDistance(at, c.at); return d < b.d ? { d, ct: c.ct } : b; }, { d: Infinity, ct: '' }).ct;
/** The n nearest of a list (by their points), for the options a question is picked among. */
function nearest(list, n, same = () => true) {
  return list.map((a) => list.filter((b) => b !== a && same(a, b)).map((b) => ({ b, d: geoDistance(a.at, b.at) })).sort((x, y) => x.d - y.d).slice(0, n).map((x) => x.b.id));
}

// ---- Big cities.
export const CITIES = 250;
const SHARE = { AS: 70, EU: 60, NA: 40, AF: 35, SA: 30, OC: 10 };
async function cities() {
  const g = J('public/data/guide/index.json');
  const f = Object.fromEntries(g.fields.map((k, i) => [k, i]));
  const rows = g.cities.filter((r) => r[f.qid] && ctOf.has(r[f.country]));
  let sl = new Map();
  const file = path.join(CACHE, 'city-sitelinks.json');
  if (fs.existsSync(file)) sl = new Map(Object.entries(J(path.relative(ROOT, file))));
  else {
    const { askFor, val, qidOf } = await import('../lives/wdqs.mjs');
    const got = await askFor(CACHE, 'city-sitelinks', 'item', rows.map((r) => r[f.qid]), '?item ?sl', '?item wikibase:sitelinks ?sl .', 120);
    for (const b of got) sl.set(qidOf(val(b, 'item')), Number(val(b, 'sl')));
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(sl)));
  }
  const all = rows.map((r) => ({ id: r[f.id], en: r[f.name], es: r[f.nombre], at: [r[f.lon], r[f.lat]], cc: r[f.country], pop: r[f.pop], cap: r[f.capital] === 2 ? 1 : 0, sl: sl.get(r[f.qid]) ?? 0 }));
  // A share per continent (by fame alone Europe had 75 and South America 15), then the best known of the rest.
  all.sort((a, b) => b.sl - a.sl || b.pop - a.pop);
  const top = [];
  for (const [ct, n] of Object.entries(SHARE)) top.push(...all.filter((c) => ctOf.get(c.cc) === ct).slice(0, n));
  top.push(...all.filter((c) => !top.includes(c)).slice(0, CITIES - top.length));
  top.sort((a, b) => b.sl - a.sl || b.pop - a.pop);
  const near = nearest(top, 6);
  return {
    about: 'Master the world, Big cities (v0.39.0): [id, name, nombre (0: as name), lon, lat, country, continent, people, capital (1), Wikipedias, the six nearest of the deck]. The travel guide\'s cities (GeoNames, CC BY 4.0; Wikidata, CC0), the best known by Wikidata\'s sitelinks. Built by scripts/data/master/build-decks.mjs.',
    cities: top.map((c, i) => [c.id, c.en, c.es && c.es !== c.en ? c.es : 0, r2(c.at[0]), r2(c.at[1]), c.cc, ctOf.get(c.cc), c.pop, c.cap, c.sl, near[i]]),
  };
}

// ---- Landmarks.
export const LANDMARKS = 300;
const SHARE_L = { AS: 90, EU: 80, AF: 45, NA: 35, SA: 35, OC: 10 };
/** World-famous sites the count of readers misses (their Wikipedia articles are other items: Machu Picchu's, the Great
 *  Wall's), always in, each counted in its continent's share. */
export const MUST = [274, 438, 303, 80, 441, 403, 600, 426, 174, 285, 124, 1100, 64, 18, 2, 309];
/** How well known each World Heritage site is: the most sitelinks among the Wikidata items that carry its number
 *  (P757): Machu Picchu's article item, not the Historic Sanctuary's, which has few. */
async function whsFame() {
  const file = path.join(CACHE, 'whs-fame.json');
  if (fs.existsSync(file)) return new Map(Object.entries(J(path.relative(ROOT, file))).map(([k, v]) => [Number(k), v]));
  const { ask, val } = await import('../lives/wdqs.mjs');
  const rows = await ask(CACHE, 'whs-sitelinks', 'SELECT ?ref (MAX(?sl) AS ?m) WHERE { ?item wdt:P757 ?ref . ?item wikibase:sitelinks ?sl } GROUP BY ?ref');
  const out = new Map();
  for (const b of rows) { const ref = parseInt(val(b, 'ref'), 10); if (ref > 0) out.set(ref, Math.max(out.get(ref) ?? 0, Number(val(b, 'm')))); }
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(Object.fromEntries(out)));
  return out;
}

async function landmarks() {
  const fame = await whsFame();
  // (In one or two countries: "which country?" has no answer for Le Corbusier's work in seven.)
  const meta = J('public/data/base/countries-meta.json');
  const sites = J('public/data/layers/heritage.json').sites.filter((s) => s.img && !s.x && !s.merged && s.at && s.cc?.length && s.cc.length <= 2 && s.cc.every((c) => ctOf.has(c)));
  // Not a site whose name is its country's ("Great Zimbabwe", "Belize Barrier Reef", "Gran Canal de China").
  const word = (text, n) => !!n && new RegExp(`(^|[^a-z])${norm(n).replace(/ /g, '[^a-z]+')}([^a-z]|$)`).test(norm(text));
  const named = (s) => s.cc.some((c) => [s.w?.[0], s.n[0]].some((t) => word(t, meta[c]?.n)) || [s.w?.[1], s.n[1]].some((t) => word(t, meta[c]?.es)));
  for (let i = sites.length - 1; i >= 0; i--) if (named(sites[i])) sites.splice(i, 1);
  // A share per continent too (by fame alone Asia had 117 and South America 15).
  const known = (s) => Math.max(fame.get(s.ref) ?? 0, s.pop ?? 0);
  sites.sort((a, b) => known(b) - known(a) || a.ref - b.ref);
  const top = [];
  const must = sites.filter((s) => MUST.includes(s.ref));
  if (must.length !== MUST.length) throw new Error(`landmarks: not found or left out: ${MUST.filter((r) => !must.some((s) => s.ref === r)).join(', ')}`);
  top.push(...must);
  for (const [ct, n] of Object.entries(SHARE_L)) { const have = must.filter((s) => ctOf.get(s.cc[0]) === ct).length; top.push(...sites.filter((s) => ctOf.get(s.cc[0]) === ct && !top.includes(s)).slice(0, Math.max(0, n - have))); }
  top.push(...sites.filter((s) => !top.includes(s)).slice(0, LANDMARKS - top.length));
  top.sort((a, b) => known(b) - known(a) || a.ref - b.ref);
  return {
    about: 'Master the world, Landmarks (v0.39.0): [id, name, nombre (0: as name), lon, lat, countries, continent, kind (c cultural, n natural, m mixed), year listed, Commons picture, Wikipedias]. UNESCO\'s World Heritage List with Wikidata\'s names (CC0) and Commons pictures (each with its own licence, credited in the app); the best known by the sitelinks of the best-known Wikidata item with its World Heritage number. Built by scripts/data/master/build-decks.mjs.',
    sites: top.map((s) => {
      const [en0, es0] = s.w?.[0] ? [s.w[0], s.w[1] || s.n[1]] : s.n;
      // Not the answer in its name: "Sewell, Chile" → "Sewell"; "Guanajuato (city)" → "Guanajuato".
      const tail = new Set(s.cc.flatMap((c) => [meta[c]?.n, meta[c]?.es].filter(Boolean).map(norm)));
      const clean = (n) => { const x = String(n ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim(); const m = /^(.*\S),\s*([^,]+)$/.exec(x); return m && tail.has(norm(m[2])) ? m[1] : x; };
      const en = clean(en0), es = es0 ? clean(es0) : 0;
      return [`w${s.ref}`, en, es && es !== en ? es : 0, r2(s.at[0]), r2(s.at[1]), s.cc, ctOf.get(s.cc[0]), s.c, s.y, s.img, known(s)];
    }),
  };
}

// ---- Rivers, mountains and seas: the best known, by hand. Each name as Put it on the map or Natural Earth has it.
export const NATURE = {
  river: ['Nile', 'Amazon River', 'Yangtze River', 'Mississippi River', 'Missouri River', 'Yellow River', 'Ob', 'Paraná River', 'Congo River', 'Amur River', 'Lena River', 'Mekong River', 'Niger River', 'Yenisei', 'Volga', 'Danube', 'Rhine', 'Ganges', 'Indus River', 'Euphrates', 'Tigris', 'Zambezi', 'Orinoco River', 'Rio Grande', 'Colorado River', 'Columbia River', 'Yukon River', 'Mackenzie River', 'Murray River', 'São Francisco River', 'Magdalena River', 'Uruguay River', 'Elbe', 'Loire', 'Seine', 'River Thames', 'Po', 'Ebro', 'Tagus', 'Dnieper', 'Vistula', 'Oder', 'Irrawaddy River', 'Limpopo River', 'Orange River', 'Senegal River', 'Ohio River', 'Rhône', 'Brahmaputra River', 'Syr Darya', 'Amu Darya'],
  lake: ['Lake Superior', 'Lake Victoria', 'Lake Huron', 'Lake Michigan', 'Lake Tanganyika', 'Lake Baikal', 'Lake Malawi', 'Great Bear Lake', 'Great Slave Lake', 'Lake Erie', 'Lake Ontario', 'Lake Winnipeg', 'Lake Ladoga', 'Lake Balkhash', 'Titicaca', 'Lake Nicaragua', 'Lake Turkana', 'Issyk-Kul', 'Vänern', 'Lake Chad', 'Lake Geneva', 'Great Salt Lake', 'Lake Tana', 'Qinghai Lake', 'Lake Albert', 'Lake Kivu'],
  range: ['Andes', 'Rocky Mountains', 'Himalayas', 'Alps', 'Ural Mountains', 'Appalachian Mountains', 'Atlas Mountains', 'Caucasus Mountains', 'Great Dividing Range', 'Karakoram', 'Hindu Kush', 'Tianshan Mountains', 'Altai Mountains', 'Pyrenees', 'Carpathians', 'Scandinavian Mountains', 'Sierra Madre Occidental', 'Sierra Madre Oriental', 'Sierra Madre del Sur', 'Sierra Nevada', 'Drakensberg', 'Zagros Mountains', 'Kunlun Mountains', 'Pamir Mountains', 'Cascade Range', 'Alaska Range', 'Brooks Range', 'Ethiopian Highlands', 'Transantarctic Mountains', 'Western Ghats', 'Dinaric Alps'],
  desert: ['Sahara', 'Gobi Desert', 'Kalahari Desert', "Rub' al Khali", 'Atacama Desert', 'Namib', 'Thar Desert', 'Taklamakan', 'Karakum Desert', 'Kyzyl Kum', 'Great Victoria Desert', 'Great Sandy Desert', 'Sonoran Desert', 'Chihuahuan Desert', 'Syrian Desert', 'Libyan Desert', 'Nubian Desert'],
  peak: ['Mount Everest', 'K2', 'Aconcagua', 'Mount Kilimanjaro', 'Denali', 'Mont Blanc', 'Matterhorn', 'Mount Elbrus', 'Mount Fuji', 'Mount Etna', 'Mount Vesuvius', 'Popocatépetl', 'Iztaccihuatl', 'Chimborazo', 'Cotopaxi', 'Teide', 'Mount Olympus', 'Mount Ararat', 'Mount Kosciuszko', 'Mauna Kea', 'Mount Rainier', 'Huascarán', 'Ojos del Salado', 'Vinson Massif', 'Mount Kenya', 'Aoraki / Mount Cook', 'Jbel Toubkal', 'Damavand', 'Pico Bolívar', 'Pinatubo'],
  water: ['Atlantic Ocean', 'Pacific Ocean', 'Indian Ocean', 'Arctic Ocean', 'Southern Ocean', 'Mediterranean Sea', 'Caribbean Sea', 'Black Sea', 'Caspian Sea', 'Red Sea', 'Baltic Sea', 'North Sea', 'Arabian Sea', 'South China Sea', 'East China Sea', 'Yellow Sea', 'Sea of Japan', 'Philippine Sea', 'Coral Sea', 'Tasman Sea', 'Bering Sea', 'Sea of Okhotsk', 'Barents Sea', 'Norwegian Sea', 'Adriatic Sea', 'Aegean Sea', 'Labrador Sea', 'Weddell Sea', 'Ross Sea', 'Gulf of Mexico', 'Persian Gulf', 'Gulf of Guinea', 'Gulf of Aden', 'Gulf of Alaska', 'Gulf of California', 'Gulf of Thailand', 'Gulf of Bothnia', 'Gulf of Carpentaria', 'Bay of Bengal', 'Hudson Bay', 'Bay of Biscay', 'Baffin Bay', 'Strait of Gibraltar', 'Strait of Malacca', 'English Channel', 'Mozambique Channel', 'Drake Passage'],
};
/** The Spanish names Natural Earth has wrong or missing, by English name. */
const ES_FIX = { 'Gulf of Mexico': 'Golfo de México', 'Sea of Japan': 'Mar de Japón', 'Persian Gulf': 'Golfo Pérsico', 'English Channel': 'Canal de la Mancha', 'Drake Passage': 'Pasaje de Drake' };

async function nature() {
  const o = J('public/data/onmap/places.json');
  const topo = J('public/data/onmap/shapes.json');
  const shapeOf = new Map();
  for (const obj of Object.values(topo.objects)) for (const f of feature(topo, obj).features) shapeOf.set(f.properties.i, f.geometry);
  // Every country a place is in (the Andes: seven), the first the one it is listed under first.
  const countriesOf = new Map();
  for (const [c, list] of Object.entries(o.countries)) for (const e of list) { if (!countriesOf.has(e[0])) countriesOf.set(e[0], []); countriesOf.get(e[0]).push(c); }
  const items = [], geoms = [], missing = [];
  // Rivers, lakes, ranges, deserts and peaks from Put it on the map: every piece of a name (the Nile's two) is one.
  for (const kind of ['river', 'lake', 'range', 'desert', 'peak']) for (const name of NATURE[kind]) {
    const idx = o.places.map((p, i) => i).filter((i) => o.places[i][0] === kind && norm(o.places[i][1]) === norm(name));
    if (!idx.length) { missing.push(`${kind} ${name}`); continue; }
    const main = idx.reduce((a, b) => (o.places[b][5] > o.places[a][5] ? b : a));
    const p = o.places[main];
    const parts = idx.map((i) => o.places[i][6]).filter((s) => s >= 0).map((s) => shapeOf.get(s)).filter(Boolean);
    let g = null;
    if (parts.length) {
      const line = /Line/.test(parts[0].type);
      const coords = parts.flatMap((x) => (x.type === 'LineString' || x.type === 'Polygon' ? [x.coordinates] : x.coordinates));
      g = { type: line ? 'MultiLineString' : 'MultiPolygon', coordinates: coords };
    }
    const cc = [...new Set([...(countriesOf.get(main) ?? []), ...idx.flatMap((i) => countriesOf.get(i) ?? [])])];
    items.push({ kind, en: p[1], es: p[2] || p[1], at: [p[3], p[4]], cc, ct: ctOf.get(cc[0]) ?? nearestCt([p[3], p[4]]), fame: p[5], g });
  }
  // The waters from Natural Earth's marine areas (two pieces of one name, the Atlantic's, are one).
  const marine = JSON.parse(fs.readFileSync(path.join(ROOT, '.cache/ne/ne_50m_geography_marine_polys.geojson'), 'utf8'));
  const KIND = { ocean: 'ocean', sea: 'sea', gulf: 'gulf', bay: 'bay', strait: 'strait', channel: 'channel' };
  const waters = [];
  for (const name of NATURE.water) {
    const fs_ = marine.features.filter((f) => KIND[f.properties.featurecla] && norm(f.properties.name_en || f.properties.name) === norm(name));
    if (!fs_.length) { missing.push(`water ${name}`); continue; }
    const pr = fs_[0].properties;
    const coords = fs_.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));
    waters.push({ name, kind: KIND[pr.featurecla], es: ES_FIX[name] ?? capFirst(pr.name_es || name), rank: pr.scalerank, g: { type: 'MultiPolygon', coordinates: coords } });
  }
  if (missing.length) throw new Error(`not found: ${missing.join(', ')}`);
  // The seas simplified like Put it on the map's shapes (they are drawn at a continent's size).
  const wfc = { type: 'FeatureCollection', features: waters.map((w, i) => ({ type: 'Feature', properties: { i }, geometry: w.g })) };
  const simple = JSON.parse((await mapshaper.applyCommands('-i in.json -simplify 12% keep-shapes -o out.json format=geojson', { 'in.json': wfc }))['out.json']);
  for (const f of simple.features) {
    const w = waters[f.properties.i];
    const at = geoCentroid(f.geometry);
    // (An ocean is in every continent's waters: only in the world's deck.)
    items.push({ kind: w.kind, en: w.name, es: w.es, at: [r2(at[0]), r2(at[1])], cc: [], ct: w.kind === 'ocean' ? '' : nearestCt(at), fame: 10 - (w.rank ?? 5), g: f.geometry });
  }
  // The shapes, in item order (a peak has none).
  const fc = { type: 'FeatureCollection', features: [] };
  items.forEach((it, i) => { if (it.g) { it.shape = geoms.length; geoms.push(i); fc.features.push({ type: 'Feature', properties: { i: it.shape }, geometry: it.g }); } else it.shape = -1; });
  const topoOut = JSON.parse((await mapshaper.applyCommands('-i in.json name=shapes -o out.json format=topojson quantization=1e5', { 'in.json': fc }))['out.json']);
  const GROUP = (k) => (['ocean', 'sea', 'gulf', 'bay', 'strait', 'channel'].includes(k) ? 'water' : k);
  const list = items.map((it, i) => ({ ...it, id: `n${i}`, group: GROUP(it.kind) }));
  const near = nearest(list, 5, (a, b) => a.group === b.group);
  return {
    data: {
      about: 'Master the world, Rivers, mountains and seas (v0.39.0): items [kind, name, nombre (0: as name), lon, lat, countries, continent (empty: the world\'s only, an ocean), fame, shape (index in shapes, -1: a point), the five nearest of the same kind], shapes a TopoJSON. Rivers, lakes, ranges, deserts and peaks from Put it on the map (Natural Earth, public domain; Wikidata\'s names, CC0); the waters from Natural Earth\'s marine areas. Built by scripts/data/master/build-decks.mjs.',
      items: list.map((it, i) => [it.kind, it.en, it.es && it.es !== it.en ? it.es : 0, r2(it.at[0]), r2(it.at[1]), it.cc, it.ct, Math.round(it.fame), it.shape, near[i].map((id) => Number(id.slice(1)))]),
      shapes: topoOut,
    },
  };
}

async function build() {
  const out = { 'cities.json': await cities(), 'landmarks.json': await landmarks(), 'nature.json': (await nature()).data };
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, JSON.stringify(v)]));
}

/** The files as committed, checked with no network and no cache (CI has neither): what each card needs to be asked. */
function check() {
  const errs = [];
  const read = (f) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
  const meta = J('public/data/base/countries-meta.json');
  const cities = read('cities.json').cities, ids = new Set(cities.map((c) => c[0]));
  if (cities.length !== CITIES) errs.push(`cities.json: ${cities.length} cities, not ${CITIES}`);
  for (const c of cities) {
    if (!c[1] || !Number.isFinite(c[3]) || !Number.isFinite(c[4]) || !meta[c[5]] || !c[6]) errs.push(`city ${c[0]}: a name, point, country or continent missing`);
    if (c[10]?.length !== 6 || c[10].some((n) => !ids.has(n) || n === c[0])) errs.push(`city ${c[0]}: its six nearest are not six cities of the deck`);
  }
  const sites = read('landmarks.json').sites;
  if (sites.length !== LANDMARKS) errs.push(`landmarks.json: ${sites.length} sites, not ${LANDMARKS}`);
  for (const r of MUST) if (!sites.some((x) => x[0] === `w${r}`)) errs.push(`landmarks: the world-famous site ${r} is missing`);
  for (const x of sites) {
    if (!x[1] || !x[9] || !Array.isArray(x[5]) || !x[5].length || x[5].length > 2 || x[5].some((c) => !meta[c])) errs.push(`site ${x[0]}: a name, picture or country missing, or in more than two countries`);
    // Its name does not give its country away.
    const said = x[5].filter((c) => [meta[c]?.n, meta[c]?.es].some((n) => n && new RegExp(`(^|[^a-z])${norm(n).replace(/ /g, '[^a-z]+')}([^a-z]|$)`).test(norm(`${x[1]} ${x[2] || ''}`))));
    if (said.length) errs.push(`site ${x[0]} ${x[1]}: its name says ${said.join(', ')}`);
  }
  const nat = read('nature.json'), items = nat.items;
  const shapes = new Set();
  for (const obj of Object.values(nat.shapes.objects)) for (const f of feature(nat.shapes, obj).features) shapes.add(f.properties.i);
  const want = Object.entries(NATURE).reduce((n, [, l]) => n + l.length, 0);
  if (items.length !== want) errs.push(`nature.json: ${items.length} places, not the ${want} picked`);
  items.forEach((it, i) => {
    const [kind, en, , lon, lat, cc, , , shape, near] = it;
    if (!en || !Number.isFinite(lon) || !Number.isFinite(lat) || !Array.isArray(cc)) errs.push(`place ${i} ${en}: a name, point or countries missing`);
    if ((kind === 'peak') !== (shape < 0) || (shape >= 0 && !shapes.has(shape))) errs.push(`place ${i} ${en}: its shape is missing`);
    if (near?.length !== 5 || near.some((k) => !items[k] || k === i)) errs.push(`place ${i} ${en}: its five nearest are not five places of the deck`);
  });
  for (const e of errs.slice(0, 20)) console.log(`  ${e}`);
  if (errs.length) { console.log(`${errs.length} problems in Master the world's new decks`); process.exit(1); }
  console.log(`Master the world's new decks: ${cities.length} big cities, ${sites.length} landmarks, ${items.length} rivers, mountains and seas, each with what its questions need`);
}

if (process.argv.includes('--check')) check();
else {
  const files = await build();
  for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(OUT, k), v);
  const c = JSON.parse(files['cities.json']).cities, l = JSON.parse(files['landmarks.json']).sites, n = JSON.parse(files['nature.json']).items;
  const count = (rows, i) => Object.entries(rows.reduce((m, r) => ((m[r[i] || 'world'] = (m[r[i] || 'world'] ?? 0) + 1), m), {})).map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(`cities.json: ${c.length} (${count(c, 6)}), ${(files['cities.json'].length / 1024).toFixed(0)} KB`);
  console.log(`landmarks.json: ${l.length} (${count(l, 6)}), ${(files['landmarks.json'].length / 1024).toFixed(0)} KB`);
  console.log(`nature.json: ${n.length} (${count(n, 0)}), ${(files['nature.json'].length / 1024).toFixed(0)} KB`);
}
