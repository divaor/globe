// Wild world (v0.30.0): asks Wikidata (through QLever, see ../lives/wdqs.mjs) and GBIF for the animals, their
// ranges, the parks and the zoos, and writes what the build reads into scripts/data/wild/raw/. Every answer is kept
// in .cache/wild, so a second run asks nothing again.
//
//   NODE_USE_ENV_PROXY=1 node scripts/data/wild/fetch-wild.mjs species   the candidates: Wikidata + GBIF taxonomy
//   NODE_USE_ENV_PROXY=1 node scripts/data/wild/fetch-wild.mjs ranges    each chosen animal's range from GBIF
//   NODE_USE_ENV_PROXY=1 node scripts/data/wild/fetch-wild.mjs places    national parks, reserves, zoos, aquariums
//
// Ranges come from GBIF's ad hoc map tiles, counting only sightings shared under CC0 or CC BY (never CC BY-NC),
// without zoo animals (LIVING_SPECIMEN) or fossils, from 1970 on (any year for animals that are gone), in the
// squares of GBIF's tiles: geohashes of 3 characters, 1.40625° a side (about 150 km at the equator).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask, askFor, val, qidOf, point } from '../lives/wdqs.mjs';
import { gbif, pool, rangeOf } from './gbif.mjs';
import { DOMESTIC } from './choose.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HERE = path.join(ROOT, 'scripts/data/wild');
const RAW = path.join(HERE, 'raw');
const CACHE = path.join(ROOT, '.cache/wild');
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const write = (f, d) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(d, null, 0) + '\n'); };

// ---- Species --------------------------------------------------------------------------------------------------
const MIN_SL = 45;
const MIN_OTHER = 18;
async function species() {
  const C = path.join(CACHE, 'wd');
  // Animal species with a conservation status (which leaves out fossils and domestic breeds), the best known first;
  // reptiles, amphibians, fish and smaller animals with fewer Wikipedias too, since birds and mammals have the most.
  const want = `?s wdt:P141 ?st . ?s wdt:P225 ?sci . OPTIONAL { ?s wdt:P846 ?gbif }`;
  const base = [
    ...await ask(C, `species-${MIN_SL}`, `SELECT ?s ?sl ?sci ?gbif ?st WHERE {
      ?s wdt:P105 wd:Q7432 . ?s wikibase:sitelinks ?sl . FILTER(?sl >= ${MIN_SL}) ?s wdt:P171+ wd:Q729 . ${want} }`),
    ...await ask(C, `species-others-${MIN_OTHER}`, `SELECT ?s ?sl ?sci ?gbif ?st WHERE {
      ?s wdt:P105 wd:Q7432 . ?s wikibase:sitelinks ?sl . FILTER(?sl >= ${MIN_OTHER} && ?sl < ${MIN_SL}) ?s wdt:P171+ wd:Q729 .
      FILTER NOT EXISTS { ?s wdt:P171+ wd:Q5113 } FILTER NOT EXISTS { ?s wdt:P171+ wd:Q7377 } ${want} }`),
  ];
  // Animals asked for by name, whatever their rank (subspecies such as the quagga) or status: see EXTRA in choose.mjs.
  const { EXTRA } = await import('./choose.mjs');
  const names = EXTRA.map((e) => `"${e.sci}"`).join(' ');
  base.push(...await ask(C, `species-extra-${EXTRA.length}`, `SELECT ?s ?sl ?sci ?gbif ?st WHERE {
    VALUES ?sci { ${names} } ?s wdt:P225 ?sci . ?s wikibase:sitelinks ?sl . ?s wdt:P171+ wd:Q729 . OPTIONAL { ?s wdt:P141 ?st } OPTIONAL { ?s wdt:P846 ?gbif } }`));
  const by = new Map();
  for (const r of base) {
    const q = qidOf(val(r, 's'));
    const o = by.get(q) ?? { qid: q, sl: Number(val(r, 'sl')), sci: val(r, 'sci'), gbif: val(r, 'gbif') ?? null, status: [] };
    const st = qidOf(val(r, 'st')); if (st && !o.status.includes(st)) o.status.push(st);
    if (!o.gbif && val(r, 'gbif')) o.gbif = val(r, 'gbif');
    by.set(q, o);
  }
  const ids = [...by.keys()];
  console.log(`${ids.length} candidates with ${MIN_SL}+ Wikipedias`);
  const lab = await askFor(C, `labels-${ids.length}`, 's', ids, '?s ?l', `?s rdfs:label ?l . FILTER(LANG(?l) = "en" || LANG(?l) = "es")`);
  for (const r of lab) { const o = by.get(qidOf(val(r, 's'))); const l = r.l; if (o && l) (o.label ??= {})[l['xml:lang']] = l.value; }
  const wiki = await askFor(C, `wiki-${ids.length}`, 's', ids, '?s ?site ?t', `?a schema:about ?s ; schema:isPartOf ?site ; schema:name ?t . FILTER(?site IN (<https://en.wikipedia.org/>, <https://es.wikipedia.org/>))`);
  for (const r of wiki) { const o = by.get(qidOf(val(r, 's'))); if (o) (o.wiki ??= {})[val(r, 'site').includes('//es.') ? 'es' : 'en'] = val(r, 't'); }
  const common = await askFor(C, `common-${ids.length}`, 's', ids, '?s ?c', `?s wdt:P1843 ?c . FILTER(LANG(?c) = "en" || LANG(?c) = "es")`);
  for (const r of common) { const o = by.get(qidOf(val(r, 's'))); const c = r.c; if (o && c) ((o.common ??= {})[c['xml:lang']] ??= []).push(c.value); }
  const media = await askFor(C, `media-${ids.length}`, 's', ids, '?s ?img ?audio', `OPTIONAL { ?s wdt:P18 ?img } OPTIONAL { ?s wdt:P51 ?audio }`);
  const file = (u) => (u ? decodeURIComponent(u.split('/').pop()).replace(/_/g, ' ') : null);
  for (const r of media) { const o = by.get(qidOf(val(r, 's'))); if (!o) continue; o.img ??= file(val(r, 'img')); o.audio ??= file(val(r, 'audio')); }
  // Size, weight and lifespan, each with its unit.
  for (const [prop, key] of [['P2067', 'mass'], ['P2043', 'length'], ['P2048', 'height'], ['P2250', 'life'], ['P2050', 'wingspan']]) {
    const rows = await askFor(C, `q-${key}-${ids.length}`, 's', ids, '?s ?a ?u', `?s p:${prop}/psv:${prop} ?v . ?v wikibase:quantityAmount ?a ; wikibase:quantityUnit ?u .`);
    for (const r of rows) { const o = by.get(qidOf(val(r, 's'))); if (o) ((o.q ??= {})[key] ??= []).push([Number(val(r, 'a')), qidOf(val(r, 'u'))]); }
  }
  // GBIF's taxonomy: class, order, family, and whether the key is the accepted name.
  const list = [...by.values()];
  await pool(list.filter((o) => o.gbif), 6, async (o) => {
    let t = await gbif(`https://api.gbif.org/v1/species/${o.gbif}`, `species/${o.gbif}.json`);
    if (t && t.taxonomicStatus !== 'ACCEPTED' && t.acceptedKey) t = await gbif(`https://api.gbif.org/v1/species/${t.acceptedKey}`, `species/${t.acceptedKey}.json`);
    if (!t) return;
    o.gbif = String(t.key);
    o.tax = { kingdom: t.kingdom, phylum: t.phylum, class: t.class, order: t.order, family: t.family, genus: t.genus, rank: t.rank };
  });
  // Without a GBIF key on Wikidata: match the scientific name.
  await pool(list.filter((o) => !o.tax), 4, async (o) => {
    const m = await gbif(`https://api.gbif.org/v1/species/match?kingdom=Animalia&name=${encodeURIComponent(o.sci)}`, `match/${o.sci.replace(/[^\w]+/g, '_')}.json`);
    if (!m?.usageKey || m.matchType === 'NONE' || !['EXACT', 'FUZZY'].includes(m.matchType)) return;
    const key = m.acceptedUsageKey ?? m.usageKey;
    const t = await gbif(`https://api.gbif.org/v1/species/${key}`, `species/${key}.json`);
    if (!t) return;
    o.gbif = String(t.key);
    o.tax = { kingdom: t.kingdom, phylum: t.phylum, class: t.class, order: t.order, family: t.family, genus: t.genus, rank: t.rank };
  });
  // Wikidata's GBIF key is sometimes a subspecies, a fossil or a doubtful duplicate: GBIF's own match of the
  // scientific name wins when it is exact (its accepted species, where the sightings are filed).
  let changed = 0;
  await pool(list, 6, async (o) => {
    const m = await gbif(`https://api.gbif.org/v1/species/match?kingdom=Animalia&name=${encodeURIComponent(o.sci)}`, `match/${o.sci.replace(/[^\w]+/g, '_')}.json`);
    const words = o.sci.trim().split(/\s+/).length;
    if (!m?.usageKey || m.matchType !== 'EXACT' || m.kingdom !== 'Animalia' || m.rank !== (words >= 3 ? 'SUBSPECIES' : 'SPECIES')) return;
    const key = String(m.acceptedUsageKey ?? m.usageKey);
    if (key === o.gbif) return;
    const t = await gbif(`https://api.gbif.org/v1/species/${key}`, `species/${key}.json`);
    if (!t) return;
    o.gbif = key; changed++;
    o.tax = { kingdom: t.kingdom, phylum: t.phylum, class: t.class, order: t.order, family: t.family, genus: t.genus, rank: t.rank };
  });
  console.log(`GBIF keys corrected by name: ${changed}`);
  list.sort((a, b) => b.sl - a.sl);
  write(path.join(RAW, 'species.json'), list);
  console.log(`species.json: ${list.length} (${list.filter((o) => o.tax).length} with GBIF taxonomy)`);
}

// ---- Ranges ---------------------------------------------------------------------------------------------------
async function ranges() {
  const chosen = read(path.join(RAW, 'chosen.json'));
  const out = fs.existsSync(path.join(RAW, 'ranges.json')) ? read(path.join(RAW, 'ranges.json')) : {};
  // Each range keeps the GBIF key it was asked with (in ranges-keys.json): a corrected key is asked again.
  const keysFile = path.join(RAW, 'ranges-keys.json');
  const keys = fs.existsSync(keysFile) ? read(keysFile) : Object.fromEntries(chosen.filter((a) => out[a.id]).map((a) => [a.id, a.gbif]));
  for (const a of chosen) if (out[a.id] && keys[a.id] !== a.gbif) { delete out[a.id]; delete keys[a.id]; }
  const todo = chosen.filter((a) => a.gbif && !a.gone && (!out[a.id] || (DOMESTIC[a.sci] && !out[`${a.id}#domestic`])));
  console.log(`ranges: ${todo.length} to ask (${chosen.length} chosen)`);
  let n = 0;
  await pool(todo, 5, async (a) => {
    out[a.id] = await rangeOf(a.gbif, !!a.gone);
    keys[a.id] = a.gbif;
    // Its domestic form's sightings, to take away (dogs from wolves).
    if (DOMESTIC[a.sci]) {
      const m = await gbif(`https://api.gbif.org/v1/species/match?kingdom=Animalia&name=${encodeURIComponent(DOMESTIC[a.sci])}`, `match/${DOMESTIC[a.sci].replace(/[^\w]+/g, '_')}.json`);
      if (m?.usageKey) out[`${a.id}#domestic`] = await rangeOf(String(m.usageKey), false);
    }
    // Kept every 25 animals, so a stopped run goes on where it was.
    if (++n % 25 === 0) { write(path.join(RAW, 'ranges.json'), out); write(keysFile, keys); }
  });
  write(path.join(RAW, 'ranges.json'), out);
  write(keysFile, keys);
  const empty = chosen.filter((a) => !out[a.id] || !Object.keys(out[a.id]).length).map((a) => a.id);
  console.log(`ranges.json: ${Object.keys(out).length}; without sightings: ${empty.join(', ') || 'none'}`);
}

// ---- Parks, reserves, zoos and aquariums ----------------------------------------------------------------------
async function places() {
  const C = path.join(CACHE, 'wd');
  // Each kind with its Wikidata classes (and their subclasses: "national park of Brazil" is a national park), and
  // how many Wikipedias a place needs: any national park, zoo or aquarium; a nature reserve in 6 or more.
  const kinds = [
    ['np', ['Q46169'], 1],                                                    // national park
    ['reserve', ['Q1714375', 'Q1377575', 'Q20268591', 'Q1367500', 'Q2714144'], 2], // game reserve, wildlife refuge, wildlife reserve, marine protected area, bird sanctuary
    ['reserve', ['Q179049'], 6],                                              // nature reserve
    ['zoo', ['Q43501', 'Q642682', 'Q1711697'], 1],                            // zoo, safari park, wildlife park
    ['aquarium', ['Q2281788', 'Q1443808'], 1],                                // public aquarium, oceanarium
  ];
  const out = {};
  for (const [kind, classes, min] of kinds) {
    const rows = await ask(C, `places-${kind}-${classes[0]}`, `SELECT ?p ?sl ?c ?cc WHERE { VALUES ?k { ${classes.map((q) => `wd:${q}`).join(' ')} } ?p wdt:P31/wdt:P279* ?k . ?p wikibase:sitelinks ?sl . FILTER(?sl >= ${min}) ?p wdt:P625 ?c . OPTIONAL { ?p wdt:P17 ?cn . ?cn wdt:P298 ?cc } }`);
    for (const r of rows) {
      const q = qidOf(val(r, 'p')); const at = point(val(r, 'c'), 3);
      if (!q || !at) continue;
      const o = out[q] ?? { qid: q, kind, sl: Number(val(r, 'sl')), at, cc: val(r, 'cc') ?? null };
      // A place that is both (a national park that is also a reserve) is a national park; a zoo with an aquarium a zoo.
      if (kind === 'np') o.kind = 'np';
      out[q] = o;
    }
    console.log(`${kind} (${classes.join(' ')}): ${rows.length} rows`);
  }
  const ids = Object.keys(out);
  const lab = await askFor(C, `place-labels-${ids.length}`, 'p', ids, '?p ?l', `?p rdfs:label ?l . FILTER(LANG(?l) = "en" || LANG(?l) = "es" || LANG(?l) = "mul")`, 400);
  for (const r of lab) { const o = out[qidOf(val(r, 'p'))]; if (o) (o.label ??= {})[r.l['xml:lang']] = r.l.value; }
  const wiki = await askFor(C, `place-wiki-${ids.length}`, 'p', ids, '?p ?site ?t', `?a schema:about ?p ; schema:isPartOf ?site ; schema:name ?t . FILTER(?site IN (<https://en.wikipedia.org/>, <https://es.wikipedia.org/>))`, 400);
  for (const r of wiki) { const o = out[qidOf(val(r, 'p'))]; if (o) (o.wiki ??= {})[val(r, 'site').includes('//es.') ? 'es' : 'en'] = val(r, 't'); }
  const area = await askFor(C, `place-area-${ids.length}`, 'p', ids, '?p ?a ?u', `?p p:P2046/psv:P2046 ?v . ?v wikibase:quantityAmount ?a ; wikibase:quantityUnit ?u .`, 400);
  for (const r of area) { const o = out[qidOf(val(r, 'p'))]; if (o && !o.area) o.area = [Number(val(r, 'a')), qidOf(val(r, 'u'))]; }
  const img = await askFor(C, `place-img-${ids.length}`, 'p', ids, '?p ?img', `?p wdt:P18 ?img .`, 400);
  for (const r of img) { const o = out[qidOf(val(r, 'p'))]; if (o && !o.img) o.img = decodeURIComponent(val(r, 'img').split('/').pop()).replace(/_/g, ' '); }
  const whs = await askFor(C, `place-whs-${ids.length}`, 'p', ids, '?p ?w', `?p wdt:P757 ?w .`, 400);
  for (const r of whs) { const o = out[qidOf(val(r, 'p'))]; if (o) o.whs = val(r, 'w'); }
  write(path.join(RAW, 'places.json'), Object.values(out).sort((a, b) => b.sl - a.sl));
  console.log(`places.json: ${ids.length}`);
}

const step = process.argv[2];
if (step === 'species') await species();
else if (step === 'ranges') await ranges();
else if (step === 'places') await places();
else { console.error('usage: fetch-wild.mjs species | ranges | places'); process.exit(1); }
