#!/usr/bin/env node
// Names in Portuguese (Brazil), French and German (v0.42.0): every name the app's data shows (countries, states and
// provinces, cities, seas, rivers, mountains, World Heritage sites, animals, plants, people…), keyed by its English,
// in public/data/i18n/<lang>-data.json. The app reads them through nm() and tx() (src/app/i18n.ts).
//   - Natural Earth (public domain) has each country's, state's, city's, sea's and region's name in these languages.
//   - For the rest, the Wikidata item (CC0) behind each name comes from the answers the data builds kept in .cache/,
//     and its label in each language is asked from QLever (scripts/data/lives/wdqs.mjs).
// Only names that appear in public/data and read differently from the English are written. Texts that are not names
// (the data's short phrases) are added from i18n/data-<lang>.json when there is one (translated by hand).
// Usage: NODE_USE_ENV_PROXY=1 node scripts/i18n/names.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask } from '../data/lives/wdqs.mjs';
import { fixPlaces } from '../data/ne-fixes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = path.join(ROOT, '.cache');
const LANGS = ['pt', 'fr', 'de'];
const OUT = path.join(ROOT, 'public/data/i18n');

// 1. Every string in the app's data: the names a translation is wanted for.
const used = new Set();
/** Wikidata items the data names itself ({ q: 'Q140', n: ['Lion', 'León'] }), and the scientific names it gives. */
const dataItems = new Map();
const sci = new Set();
const enOf = (o) => (Array.isArray(o.n) ? o.n[0] : typeof o.n === 'string' ? o.n : typeof o.en === 'string' ? o.en : typeof o.name === 'string' ? o.name : null);
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) { if (!/^(raster|rasters|fonts|i18n|tiles)$/.test(f.name)) walk(p); continue; }
    if (!p.endsWith('.json') || fs.statSync(p).size > 80e6) continue;
    let j;
    try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { continue; }
    (function v(x) {
      if (typeof x === 'string') { if (x.length >= 2 && x.length <= 90 && /\p{L}/u.test(x)) used.add(x); }
      else if (Array.isArray(x)) x.forEach(v);
      else if (x && typeof x === 'object') {
        if (x.type === 'Topology') { for (const o of Object.values(x.objects ?? {})) for (const g of o.geometries ?? []) v(g.properties); return; }
        const q = [x.q, x.wd, x.qid, x.item].find((y) => typeof y === 'string' && /^Q\d+$/.test(y));
        const en = q && enOf(x);
        if (en) dataItems.set(q, en);
        if (typeof x.sci === 'string') sci.add(x.sci);
        Object.values(x).forEach(v);
      }
    })(j);
  }
})(path.join(ROOT, 'public/data'));

/** English → { lang → Map(translation → [priority, votes, lowest QID]) }: the candidates for each name. */
const cand = new Map();
/** The data's strings by their lowercase (Wikidata's "giant panda" is the app's "Giant Panda"). */
const usedLower = new Map();
for (const u of used) { const k = u.toLowerCase(); usedLower.set(k, [...(usedLower.get(k) ?? []), u]); }
function offer(en, lang, tr, prio, q = 1e12) {
  if (!en || !tr) return;
  if (!used.has(en)) { for (const u of usedLower.get(en.toLowerCase()) ?? []) offer(u, lang, tr, prio, q); return; }
  tr = tr.trim();
  // Where a language has no common name, Wikidata's label is the scientific one: the English is better then.
  if (sci.has(tr) && !sci.has(en)) return;
  // Wikidata writes common nouns in lowercase (leão, lion): a name written with a capital keeps it.
  if (/^\p{Lu}/u.test(en) && /^\p{Ll}/u.test(tr)) tr = tr[0].toLocaleUpperCase(lang) + tr.slice(1);
  if (tr === en) tr = en; // the same: kept as a vote for no change
  let byLang = cand.get(en);
  if (!byLang) cand.set(en, (byLang = {}));
  const m = (byLang[lang] ??= new Map());
  const c = m.get(tr);
  if (!c) m.set(tr, [prio, 1, q]);
  else { c[0] = Math.min(c[0], prio); c[1]++; c[2] = Math.min(c[2], q); }
}

// 2. Natural Earth: names written for maps.
const ne = (f) => fixPlaces(JSON.parse(fs.readFileSync(path.join(CACHE, 'ne', `${f}.geojson`), 'utf8'))).features.map((x) => x.properties);
const NAME = { pt: ['NAME_PT', 'name_pt'], fr: ['NAME_FR', 'name_fr'], de: ['NAME_DE', 'name_de'] };
const get = (p, keys) => keys.map((k) => p[k]).find((v) => typeof v === 'string' && v.trim());
function fromNE(file, prio, enKeys) {
  for (const p of ne(file)) {
    const ens = new Set(enKeys.map((k) => p[k]).filter((v) => typeof v === 'string' && v));
    for (const l of LANGS) { const tr = get(p, NAME[l]); if (tr) for (const en of ens) offer(en, l, tr, prio); }
  }
}
// Countries: the app's own names (base/countries-meta.json) by their Wikidata item, then Natural Earth's.
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/base/countries-meta.json'), 'utf8'));
const ne0 = ne('ne_10m_admin_0_countries');
for (const m of Object.values(meta)) {
  const p = ne0.find((x) => x.WIKIDATAID === m.wd);
  if (!p) continue;
  for (const l of LANGS) { const tr = get(p, NAME[l]); if (tr) for (const en of [m.n, m.sn].filter(Boolean)) offer(en, l, tr, 0); }
}
fromNE('ne_10m_admin_0_countries', 1, ['NAME', 'NAME_EN', 'ADMIN', 'NAME_LONG']);
fromNE('ne_50m_geography_marine_polys', 1, ['name', 'name_en']);
fromNE('ne_10m_geography_regions_polys', 1, ['NAME', 'NAME_EN', 'name', 'name_en']);
fromNE('ne_10m_geography_regions_points', 1, ['NAME', 'NAME_EN', 'name', 'name_en']);
fromNE('ne_10m_geography_regions_elevation_points', 3, ['name', 'name_en']);
fromNE('ne_10m_admin_1_states_provinces', 3, ['name', 'name_en']);
fromNE('ne_10m_populated_places', 3, ['NAME', 'NAME_EN']);
fromNE('ne_10m_lakes', 3, ['name', 'name_en']);

// 3. Wikidata: the item behind each name, from the answers the data builds kept (only those whose label is the
// item's own name: [folder/file prefix, item variable, label variable]).
const PAIRS = [
  ['born/P19-', 'x', 'l'], ['born/P20-', 'x', 'l'], ['born/name-', 'p', 'l'],
  ['green/wd/common-', 's', 'c'], ['green/wd/taxon-labels', 't', 'l'], ['green/wd/place-labels', 'p', 'l'],
  ['lives/thing-', 'x', 'l'], ['lives/who-', 'p', 'l'],
  ['master/countries', 'cap', 'capLabel'], ['master/names-', 'item', 'en'],
  ['ocean/wd/wrecks', 's', 'en'], ['onmap/labels-', 's', 'l'], ['onmap/rivers.json', 'r', 'en'],
  ['states/cityinfo-', 'item', 'en'], ['states/cityname-', 'item', 'name'], ['states/cityup-', 'up', 'upEn'],
  ['states/divisions', 's', 'en'], ['states/divisions', 'cap', 'capEn'], ['states/names-cities-', 'item', 'en'],
  ['v017/heritage/wikidata-sites', 's', 'en'],
  ['wild/wd/common', 's', 'c'], ['wild/wd/place-labels', 'p', 'l'], ['wild/probe/classes', 'k', 'l'],
];
/** QID → English name. */
const items = new Map();
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) { if (f.name !== 'i18n') walk(p); continue; }
    if (!p.endsWith('.json')) continue;
    const rel = path.relative(CACHE, p);
    const rules = PAIRS.filter(([pre]) => rel.startsWith(pre));
    if (!rules.length) continue;
    let b;
    try { b = JSON.parse(fs.readFileSync(p, 'utf8'))?.results?.bindings; } catch { continue; }
    if (!Array.isArray(b)) continue;
    for (const [, qv, lv] of rules) for (const x of b) {
      const q = x[qv]?.value?.match(/entity\/(Q\d+)$/)?.[1], l = x[lv];
      if (!q || !l || !['en', 'mul'].includes(l['xml:lang'])) continue;
      if (!usedLower.has(l.value.toLowerCase())) continue;
      if (!items.has(q) || l['xml:lang'] === 'en') items.set(q, l.value);
    }
  }
})(CACHE);
for (const [q, en] of dataItems) if (used.has(en)) items.set(q, en);
for (const m of Object.values(meta)) if (m.wd && used.has(m.n)) items.set(m.wd, m.n);
console.log(`${used.size} strings in the data; ${items.size} Wikidata items behind ${new Set(items.values()).size} of them`);

// Their labels, a few thousand items per question (kept in .cache/i18n/).
const qids = [...items.keys()].sort((a, b) => +a.slice(1) - +b.slice(1));
const SIZE = 2500;
for (let i = 0; i < qids.length; i += SIZE) {
  const part = qids.slice(i, i + SIZE);
  const name = `labels-${part[0]}-${part[part.length - 1]}-${part.length}`;
  const rows = await ask(path.join(CACHE, 'i18n'), name, `SELECT ?s ?l WHERE { VALUES ?s { ${part.map((q) => `wd:${q}`).join(' ')} } ?s rdfs:label ?l . FILTER(LANG(?l) IN ("pt", "pt-br", "fr", "de")) }`);
  const best = new Map(); // qid|lang → label (pt-br before pt)
  for (const r of rows) {
    const q = r.s.value.split('/').pop(), tag = r.l['xml:lang'], lang = tag.slice(0, 2);
    const k = `${q}|${lang}`;
    if (!best.has(k) || tag === 'pt-br') best.set(k, r.l.value);
  }
  for (const [k, tr] of best) { const [q, lang] = k.split('|'); offer(items.get(q), lang, tr, 2, +q.slice(1)); }
  process.stdout.write(`\r${Math.min(i + SIZE, qids.length)} of ${qids.length} items`);
}
process.stdout.write('\n');

// 4. One translation per English: the best source, then the most items, then the oldest item. Written only when it
// differs from the English.
fs.mkdirSync(OUT, { recursive: true });
for (const l of LANGS) {
  const out = {};
  for (const [en, byLang] of [...cand.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const m = byLang[l];
    if (!m) continue;
    const [tr] = [...m.entries()].sort((a, b) => a[1][0] - b[1][0] || b[1][1] - a[1][1] || a[1][2] - b[1][2])[0];
    if (tr !== en) out[en] = tr;
  }
  // The data's short texts (not names), translated by hand.
  const extra = path.join(ROOT, `i18n/data-${l}.json`);
  if (fs.existsSync(extra)) Object.assign(out, JSON.parse(fs.readFileSync(extra, 'utf8')));
  const file = path.join(OUT, `${l}-data.json`);
  fs.writeFileSync(file, `${JSON.stringify(out)}\n`);
  console.log(`${path.relative(ROOT, file)}: ${Object.keys(out).length} names, ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}
