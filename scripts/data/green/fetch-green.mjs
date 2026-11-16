// Green planet (v0.31.0): asks Wikidata (through QLever, see ../lives/wdqs.mjs) and GBIF for the plants, their ranges,
// the botanical gardens and the remarkable trees, and writes what the build reads into scripts/data/green/raw/. Every
// answer is kept in .cache (GBIF's with Wild world's, in .cache/wild/gbif), so a second run asks nothing again.
//
//   NODE_USE_ENV_PROXY=1 node scripts/data/green/fetch-green.mjs species   the candidates: Wikidata + GBIF taxonomy
//   NODE_USE_ENV_PROXY=1 node scripts/data/green/fetch-green.mjs ranges    each chosen plant's range from GBIF
//   NODE_USE_ENV_PROXY=1 node scripts/data/green/fetch-green.mjs places    botanical gardens, arboreta, remarkable trees
//   NODE_USE_ENV_PROXY=1 node scripts/data/green/fetch-green.mjs ndvi      the twelve months of 2024 greenness (NASA)
//   NODE_USE_ENV_PROXY=1 node scripts/data/green/fetch-green.mjs eco       the 847 ecoregions of RESOLVE 2017, simplified
//
// Ranges are counted as for the animals (../wild/gbif.mjs): only sightings shared under CC0 or CC BY, without
// LIVING_SPECIMEN records (plants in gardens) or fossils, from 1970 on, in squares of 1.40625°.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask, askFor, val, qidOf, point } from '../lives/wdqs.mjs';
import { gbif, pool, rangeOf } from '../wild/gbif.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const RAW = path.join(ROOT, 'scripts/data/green/raw');
const CACHE = path.join(ROOT, '.cache/green');
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const write = (f, d) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(d, null, 0) + '\n'); };
const file = (u) => (u ? decodeURIComponent(u.split('/').pop()).replace(/_/g, ' ') : null);

const MIN_SL = 40;
async function species() {
  const C = path.join(CACHE, 'wd');
  const { EXTRA: extra, CURATED } = await import('./choose-green.mjs');
  const EXTRA = [...new Set([...extra.map((e) => e.sci), ...Object.keys(CURATED)])].map((sci) => ({ sci }));
  const want = `?s wdt:P225 ?sci . OPTIONAL { ?s wdt:P846 ?gbif } OPTIONAL { ?s wdt:P141 ?st }`;
  const base = [
    ...await ask(C, `plants-${MIN_SL}`, `SELECT ?s ?sl ?sci ?gbif ?st WHERE { ?s wdt:P105 wd:Q7432 . ?s wikibase:sitelinks ?sl . FILTER(?sl >= ${MIN_SL}) ?s wdt:P171+ wd:Q756 . ${want} }`),
    ...await ask(C, `plants-extra2-${EXTRA.length}-${EXTRA.map((e) => e.sci).join('').length}`, `SELECT ?s ?sl ?sci ?gbif ?st WHERE { VALUES ?sci { ${EXTRA.map((e) => `"${e.sci}"`).join(' ')} } ?s wdt:P225 ?sci . ?s wdt:P105 wd:Q7432 . ?s wikibase:sitelinks ?sl . OPTIONAL { ?s wdt:P846 ?gbif } OPTIONAL { ?s wdt:P141 ?st } }`),
  ];
  const by = new Map();
  for (const r of base) {
    const q = qidOf(val(r, 's'));
    const o = by.get(q) ?? { qid: q, sl: Number(val(r, 'sl')), sci: val(r, 'sci'), gbif: val(r, 'gbif') ?? null, status: [] };
    const st = qidOf(val(r, 'st')); if (st && !o.status.includes(st)) o.status.push(st);
    if (!o.gbif && val(r, 'gbif')) o.gbif = val(r, 'gbif');
    by.set(q, o);
  }
  const ids = [...by.keys()];
  console.log(`${ids.length} candidates`);
  const lab = await askFor(C, `labels-${ids.length}`, 's', ids, '?s ?l', `?s rdfs:label ?l . FILTER(LANG(?l) = "en" || LANG(?l) = "es")`);
  for (const r of lab) { const o = by.get(qidOf(val(r, 's'))); if (o && r.l) (o.label ??= {})[r.l['xml:lang']] = r.l.value; }
  const wiki = await askFor(C, `wiki-${ids.length}`, 's', ids, '?s ?site ?t', `?a schema:about ?s ; schema:isPartOf ?site ; schema:name ?t . FILTER(?site IN (<https://en.wikipedia.org/>, <https://es.wikipedia.org/>))`);
  for (const r of wiki) { const o = by.get(qidOf(val(r, 's'))); if (o) (o.wiki ??= {})[val(r, 'site').includes('//es.') ? 'es' : 'en'] = val(r, 't'); }
  const common = await askFor(C, `common-${ids.length}`, 's', ids, '?s ?c', `?s wdt:P1843 ?c . FILTER(LANG(?c) = "en" || LANG(?c) = "es")`);
  for (const r of common) { const o = by.get(qidOf(val(r, 's'))); if (o && r.c) ((o.common ??= {})[r.c['xml:lang']] ??= []).push(r.c.value); }
  const media = await askFor(C, `media-${ids.length}`, 's', ids, '?s ?img', `OPTIONAL { ?s wdt:P18 ?img }`);
  for (const r of media) { const o = by.get(qidOf(val(r, 's'))); if (o) o.img ??= file(val(r, 'img')); }
  for (const [prop, key] of [['P2048', 'height'], ['P2250', 'life']]) {
    const rows = await askFor(C, `q-${key}-${ids.length}`, 's', ids, '?s ?a ?u', `?s p:${prop}/psv:${prop} ?v . ?v wikibase:quantityAmount ?a ; wikibase:quantityUnit ?u .`);
    for (const r of rows) { const o = by.get(qidOf(val(r, 's'))); if (o) ((o.q ??= {})[key] ??= []).push([Number(val(r, 'a')), qidOf(val(r, 'u'))]); }
  }
  // GBIF's taxonomy, by GBIF's own match of the scientific name (Wikidata's key is sometimes a variety or a duplicate).
  const list = [...by.values()];
  await pool(list, 6, async (o) => {
    const m = await gbif(`https://api.gbif.org/v1/species/match?kingdom=Plantae&name=${encodeURIComponent(o.sci)}`, `match-plants/${o.sci.replace(/[^\w]+/g, '_')}.json`);
    let key = m?.usageKey && m.matchType === 'EXACT' && m.kingdom === 'Plantae' ? String(m.acceptedUsageKey ?? m.usageKey) : o.gbif;
    if (!key) return;
    let t = await gbif(`https://api.gbif.org/v1/species/${key}`, `species/${key}.json`);
    if (t && t.taxonomicStatus !== 'ACCEPTED' && t.acceptedKey) { key = String(t.acceptedKey); t = await gbif(`https://api.gbif.org/v1/species/${key}`, `species/${key}.json`); }
    if (!t) return;
    o.gbif = String(t.key);
    o.tax = { kingdom: t.kingdom, phylum: t.phylum, class: t.class, order: t.order, family: t.family, genus: t.genus, rank: t.rank };
  });
  list.sort((a, b) => b.sl - a.sl);
  write(path.join(RAW, 'species.json'), list);
  console.log(`species.json: ${list.length} (${list.filter((o) => o.tax).length} with GBIF taxonomy)`);
}

async function ranges() {
  const chosen = read(path.join(RAW, 'chosen.json'));
  const out = fs.existsSync(path.join(RAW, 'ranges.json')) ? read(path.join(RAW, 'ranges.json')) : {};
  const keysFile = path.join(RAW, 'ranges-keys.json');
  const keys = fs.existsSync(keysFile) ? read(keysFile) : {};
  for (const a of chosen) if (out[a.id] && keys[a.id] !== a.gbif) { delete out[a.id]; delete keys[a.id]; }
  const todo = chosen.filter((a) => a.gbif && !out[a.id]);
  console.log(`ranges: ${todo.length} to ask (${chosen.length} chosen)`);
  let n = 0;
  await pool(todo, 5, async (a) => {
    out[a.id] = await rangeOf(a.gbif, false);
    keys[a.id] = a.gbif;
    if (++n % 25 === 0) { write(path.join(RAW, 'ranges.json'), out); write(keysFile, keys); }
  });
  write(path.join(RAW, 'ranges.json'), out);
  write(keysFile, keys);
  const empty = chosen.filter((a) => !out[a.id] || !Object.keys(out[a.id]).length).map((a) => a.id);
  console.log(`ranges.json: ${Object.keys(out).length}; without sightings: ${empty.join(', ') || 'none'}`);
}

async function places() {
  const C = path.join(CACHE, 'wd');
  const out = {};
  for (const [kind, classes, min] of [['garden', ['Q167346', 'Q272231'], 1], ['tree', ['Q811534', 'Q5739210'], 2]]) {
    const rows = await ask(C, `places-${kind}-${min}`, `SELECT ?p ?sl ?c ?cc ?sp WHERE { VALUES ?k { ${classes.map((q) => `wd:${q}`).join(' ')} } ?p wdt:P31/wdt:P279* ?k . ?p wikibase:sitelinks ?sl . FILTER(?sl >= ${min}) ?p wdt:P625 ?c . OPTIONAL { ?p wdt:P17 ?cn . ?cn wdt:P298 ?cc } OPTIONAL { ?p wdt:P171 ?sp } }`);
    for (const r of rows) {
      const q = qidOf(val(r, 'p')); const at = point(val(r, 'c'), 4);
      if (!q || !at) continue;
      const o = out[q] ?? { qid: q, kind, sl: Number(val(r, 'sl')), at, cc: val(r, 'cc') ?? null };
      const sp = qidOf(val(r, 'sp')); if (sp) o.taxon = sp;
      out[q] = o;
    }
    console.log(`${kind}: ${rows.length} rows`);
  }
  const ids = Object.keys(out);
  const lab = await askFor(C, `place-labels-${ids.length}`, 'p', ids, '?p ?l', `?p rdfs:label ?l . FILTER(LANG(?l) = "en" || LANG(?l) = "es" || LANG(?l) = "mul")`, 400);
  for (const r of lab) { const o = out[qidOf(val(r, 'p'))]; if (o) (o.label ??= {})[r.l['xml:lang']] = r.l.value; }
  const wiki = await askFor(C, `place-wiki-${ids.length}`, 'p', ids, '?p ?site ?t', `?a schema:about ?p ; schema:isPartOf ?site ; schema:name ?t . FILTER(?site IN (<https://en.wikipedia.org/>, <https://es.wikipedia.org/>))`, 400);
  for (const r of wiki) { const o = out[qidOf(val(r, 'p'))]; if (o) (o.wiki ??= {})[val(r, 'site').includes('//es.') ? 'es' : 'en'] = val(r, 't'); }
  const img = await askFor(C, `place-img-${ids.length}`, 'p', ids, '?p ?img', `?p wdt:P18 ?img .`, 400);
  for (const r of img) { const o = out[qidOf(val(r, 'p'))]; if (o && !o.img) o.img = file(val(r, 'img')); }
  const inc = await askFor(C, `place-inception-${ids.length}`, 'p', ids, '?p ?d', `?p wdt:P571 ?d .`, 400);
  for (const r of inc) { const o = out[qidOf(val(r, 'p'))]; const y = /^(-?\d+)-/.exec(val(r, 'd') ?? '')?.[1]; if (o && y && o.since == null) o.since = Number(y); }
  const ht = await askFor(C, `place-height-${ids.length}`, 'p', ids, '?p ?a ?u', `?p p:P2048/psv:P2048 ?v . ?v wikibase:quantityAmount ?a ; wikibase:quantityUnit ?u .`, 400);
  for (const r of ht) { const o = out[qidOf(val(r, 'p'))]; if (o && !o.height) o.height = [Number(val(r, 'a')), qidOf(val(r, 'u'))]; }
  // The species of a tree ("individual of taxon"), and whether it is gone (date of its end).
  const treeIds = Object.values(out).filter((o) => o.kind === 'tree').map((o) => o.qid);
  const ofTaxon = await askFor(C, `tree-taxon-${treeIds.length}`, 'p', treeIds, '?p ?sp', `?p wdt:P10241 ?sp .`, 400);
  for (const r of ofTaxon) { const o = out[qidOf(val(r, 'p'))]; const sp = qidOf(val(r, 'sp')); if (o && sp) o.taxon ??= sp; }
  const ended = await askFor(C, `tree-end-${treeIds.length}`, 'p', treeIds, '?p ?d', `{ ?p wdt:P576 ?d } UNION { ?p wdt:P746 ?d } UNION { ?p wdt:P570 ?d }`, 400);
  for (const r of ended) { const o = out[qidOf(val(r, 'p'))]; const y = /^(-?\d+)-/.exec(val(r, 'd') ?? '')?.[1]; if (o && y) o.gone = Number(y); }
  // The taxon of a tree, by name (for its card).
  const taxa = [...new Set(Object.values(out).map((o) => o.taxon).filter(Boolean))];
  const tl = await askFor(C, `taxon-labels-${taxa.length}`, 't', taxa, '?t ?l ?sci', `OPTIONAL { ?t rdfs:label ?l . FILTER(LANG(?l) = "en" || LANG(?l) = "es") } OPTIONAL { ?t wdt:P225 ?sci }`, 400);
  const tn = {};
  for (const r of tl) { const t = qidOf(val(r, 't')); (tn[t] ??= {}); if (r.l) tn[t][r.l['xml:lang']] = r.l.value; if (val(r, 'sci')) tn[t].sci = val(r, 'sci'); }
  for (const o of Object.values(out)) if (o.taxon) o.taxonName = tn[o.taxon] ?? null;
  write(path.join(RAW, 'places.json'), Object.values(out).sort((a, b) => b.sl - a.sl));
  console.log(`places.json: ${ids.length}`);
}

// ---- The breathing planet: NASA's monthly vegetation index (MODIS Terra, from GIBS; public domain) ---------------
async function ndvi() {
  const { default: sharp } = await import('sharp');
  const OUT = path.join(ROOT, 'public/data/green/ndvi');
  fs.mkdirSync(OUT, { recursive: true });
  const UA = 'AtlasGlobe-research/1.0 (https://example.org)';
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    const f = path.join(CACHE, 'ndvi', `2024-${mm}.png`);
    if (!fs.existsSync(f)) {
      const url = `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=MODIS_Terra_L3_NDVI_Monthly&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=2048&HEIGHT=1024&FORMAT=image/png&TIME=2024-${mm}-01`;
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      const buf = Buffer.from(await r.arrayBuffer());
      if (!r.ok || !/image/.test(r.headers.get('content-type') ?? '') || buf.length < 100000) throw new Error(`GIBS ${mm}: ${r.status}`);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, buf);
    }
    await sharp(f).resize(1024, 512).webp({ quality: 78, alphaQuality: 60, effort: 6 }).toFile(path.join(OUT, `${mm}.webp`));
    console.log(`ndvi ${mm}: ${Math.round(fs.statSync(path.join(OUT, `${mm}.webp`)).size / 1024)} KB`);
  }
}

// ---- Ecoregions: RESOLVE Ecoregions 2017 (Dinerstein et al., CC BY 4.0), simplified with mapshaper ---------------
// Small island ecoregions vanish when the islands are thinned, so they are simplified again on their own and put
// back. Spanish names come from Wikidata's ecoregions (WWF codes), matched on the English name.
async function eco() {
  const { execFileSync } = await import('node:child_process');
  const D = path.join(CACHE, 'eco');
  const zip = path.join(D, 'Ecoregions2017.zip');
  if (!fs.existsSync(zip)) {
    fs.mkdirSync(D, { recursive: true });
    execFileSync('curl', ['-sS', '-L', '--max-time', '1200', '-A', 'AtlasGlobe-research/1.0 (https://example.org)', '-o', zip, 'https://storage.googleapis.com/teow2016/Ecoregions2017.zip']);
  }
  const shp = path.join(D, 'Ecoregions2017.shp');
  if (!fs.existsSync(shp)) execFileSync('unzip', ['-o', '-q', zip, '-d', D]);
  const ms = (args) => execFileSync(path.join(ROOT, 'node_modules/.bin/mapshaper'), args, { stdio: ['ignore', 'ignore', 'inherit'] });
  const fields = ['-filter-fields', 'ECO_ID,ECO_NAME,BIOME_NUM,REALM,COLOR,NNH'];
  const main = path.join(D, 'main.geojson'); const small = path.join(D, 'small.geojson'); const topo = path.join(D, 'eco.json');
  ms(['-i', shp, ...fields, '-simplify', '0.8%', 'weighted', 'keep-shapes', '-filter-islands', 'min-area=60km2', 'remove-empty', '-filter-slivers', '-o', 'format=geojson', main]);
  const kept = new Set(read(main).features.filter((f) => f.geometry).map((f) => f.properties.ECO_ID));
  const all = execFileSync(path.join(ROOT, 'node_modules/.bin/mapshaper'), ['-i', shp, ...fields, '-o', 'format=csv', '-'], { maxBuffer: 1 << 28 }).toString().trim().split('\n').slice(1).map((l) => Number(l.split(',')[0]));
  const lost = all.filter((id) => !kept.has(id));
  ms(['-i', shp, ...fields, '-filter', `[${lost.join(',')}].includes(ECO_ID)`, '-simplify', '2%', 'weighted', 'keep-shapes', '-o', 'format=geojson', small]);
  ms(['-i', main, small, 'combine-files', '-filter', 'this.isNull === false', '-merge-layers', 'force', 'name=eco', '-o', 'format=topojson', 'quantization=30000', topo]);
  // Spanish names.
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\becoregion\b/g, '').replace(/[^a-z]+/g, ' ').trim();
  const rows = await ask(path.join(CACHE, 'wd'), 'eco-wwf', `SELECT ?e ?code ?en ?es WHERE { ?e wdt:P1294 ?code . OPTIONAL { ?e rdfs:label ?en . FILTER(LANG(?en) = "en") } OPTIONAL { ?e rdfs:label ?es . FILTER(LANG(?es) = "es") } }`);
  const es = new Map();
  for (const r of rows) {
    const en = val(r, 'en'); const e = val(r, 'es');
    if (en && e && e !== en && !/[A-Z][a-z]+ (forests|woodlands|grasslands|desert|scrub|tundra|savanna)\b/.test(e)) es.set(norm(en), e);
  }
  const t = read(topo);
  const geoms = t.objects.eco.geometries;
  for (const g of geoms) {
    const p = g.properties;
    const name = es.get(norm(p.ECO_NAME));
    g.properties = { i: p.ECO_ID, n: p.ECO_NAME, b: p.BIOME_NUM, r: p.REALM, c: p.COLOR, h: p.NNH, ...(name ? { es: name } : {}) };
  }
  const ids = new Set(geoms.map((g) => g.properties.i));
  if (ids.size !== all.length) throw new Error(`ecoregions: ${ids.size} of ${all.length}`);
  write(path.join(ROOT, 'public/data/green/ecoregions.json'), t);
  console.log(`ecoregions.json: ${ids.size} ecoregions (${geoms.filter((g) => g.properties.es).length} with a Spanish name), ${Math.round(fs.statSync(path.join(ROOT, 'public/data/green/ecoregions.json')).size / 1024)} KB`);
}

const step = process.argv[2];
if (step === 'species') await species();
else if (step === 'ranges') await ranges();
else if (step === 'places') await places();
else if (step === 'ndvi') await ndvi();
else if (step === 'eco') await eco();
else { console.error('usage: fetch-green.mjs species | ranges | places | ndvi | eco'); process.exit(1); }
