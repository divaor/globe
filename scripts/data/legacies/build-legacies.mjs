#!/usr/bin/env node
// Legacies of past civilizations (v0.44.0): what the Sumerians, Egyptians, Greeks, Mexica, Incas and others gave
// the world that is still in use, where it went and who uses it today. Sources: scripts/data/legacies/<civ>.json
// (the format is in README.md beside this file). Output: public/data/legacies/
//   index.json      categories, civilizations, every legacy in brief (for the map, search and quizzes) and the
//                   country groups their "where" lists use
//   <civ>.json      one civilization in full
//   areas.json      the homelands, one TopoJSON feature per civilization
//
//   node scripts/data/legacies/build-legacies.mjs            build everything
//   node scripts/data/legacies/build-legacies.mjs --only greeks,romans   check just these files (writes nothing)
//   node scripts/data/legacies/build-legacies.mjs --check    check the sources and that the output is up to date
//   node scripts/data/legacies/build-legacies.mjs --titles   also check every Wikipedia title (QLever, cached)
//   node scripts/data/legacies/build-legacies.mjs --list groups | cats | items <words> | stories <words>
//   node scripts/data/legacies/build-legacies.mjs --find en|es <words>   Wikipedia titles with these words, and
//                   the same article's title in the other language (QLever; needs NODE_USE_ENV_PROXY=1)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';
import { geoContains, geoDistance } from 'd3-geo';
import { areaTopology, parseDate, KINDS } from '../build-conflicts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
let SRC = path.join(ROOT, 'scripts/data/legacies');
const DATA = path.join(ROOT, 'public/data');
let OUT = path.join(DATA, 'legacies');
const CACHE = path.join(ROOT, '.cache/legacies');
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
/** The smallest triangle (in steradians) a homeland's outline keeps when simplified. */
const HOME_DETAIL = 3e-7;

export const CATS = [
  ['words', '🗣️', '#8e44ad', 'Words and names', 'Palabras y nombres'],
  ['writing', '✍️', '#5b4bc4', 'Writing and books', 'Escritura y libros'],
  ['numbers', '🔢', '#2471a3', 'Numbers and maths', 'Números y matemáticas'],
  ['time', '📅', '#138d75', 'Time and calendars', 'Tiempo y calendarios'],
  ['science', '🔭', '#0097a7', 'Science and medicine', 'Ciencia y medicina'],
  ['build', '🏛️', '#a0522d', 'Buildings and cities', 'Edificios y ciudades'],
  ['tech', '⚙️', '#5d6d7e', 'Tools and technology', 'Herramientas y técnica'],
  ['food', '🌽', '#229954', 'Food and farming', 'Comida y agricultura'],
  ['money', '🪙', '#b7950b', 'Money and trade', 'Dinero y comercio'],
  ['law', '⚖️', '#c0392b', 'Law and government', 'Leyes y gobierno'],
  ['ideas', '💡', '#d35400', 'Ideas and beliefs', 'Ideas y creencias'],
  ['arts', '🎭', '#c2185b', 'Arts and music', 'Artes y música'],
  ['play', '🎲', '#e67e22', 'Games and sport', 'Juegos y deportes'],
  ['daily', '👕', '#7b7d7d', 'Daily life', 'Vida cotidiana'],
].map(([id, icon, color, en, es]) => ({ id, icon, color, name: { en, es } }));
const CAT_IDS = new Set(CATS.map((c) => c.id));
// How they gave it: made it first, made it into what we know, carried it far, gave it its name, bred it from a
// wild plant or animal, or kept it alive when others lost it.
export const HOW = ['invented', 'developed', 'spread', 'named', 'tamed', 'kept'];
export const SURE = ['known', 'likely', 'debated'];
// What kind of word: a word of everyday language (left out), a person's name, a place's name, a day's or a month's
// name, or the name of a star, planet or constellation.
export const WORD_TYPES = ['word', 'name', 'place', 'calendar', 'sky'];

// "where" groups: a country attribute (public/data/attributes/countries.json) and a value. "religion:islam"
// matches "islam-sunni", "islam-shia" and so on (a value followed by "-").
const FIELDS = {
  lang: 'languages', family: 'language_family', branch: 'language_branch', script: 'script', religion: 'religion',
  continent: 'continent', subregion: 'subregion', org: 'organizations', measure: 'measurement_system',
  week: 'start_of_week', clock: 'clock_format', drive: 'driving_side', paper: 'paper_size',
};

let countryList, attrs, shapes;
/** Whether a point is on land (in a country, or within about 25 km of one: coastal towns on a coarse map). */
function onLand(pt) {
  if (!shapes) {
    const topo = readJSON(path.join(DATA, 'base/countries-50m.json'));
    shapes = feature(topo, topo.objects.countries).features;
  }
  if (shapes.some((f) => geoContains(f, pt))) return true;
  const near = 25 / 6371;
  for (let a = 0; a < 360; a += 30) {
    const r = (a * Math.PI) / 180, d = (near * 180) / Math.PI;
    const q = [pt[0] + (d * Math.cos(r)) / Math.max(0.2, Math.cos((pt[1] * Math.PI) / 180)), pt[1] + d * Math.sin(r)];
    if (geoDistance(pt, q) <= near * 1.5 && shapes.some((f) => geoContains(f, q))) return true;
  }
  return false;
}
function countries() {
  if (!countryList) {
    const topo = readJSON(path.join(DATA, 'base/countries-50m.json'));
    const meta = readJSON(path.join(DATA, 'base/countries-meta.json'));
    countryList = new Map(feature(topo, topo.objects.countries).features.filter((f) => /^[A-Z]{3}$/.test(f.id)).map((f) => [f.id, meta[f.id]?.n ?? f.id]));
  }
  return countryList;
}
function attributes() {
  return (attrs ??= readJSON(path.join(DATA, 'attributes/countries.json')).data);
}
/** The countries of one group ("world", "MEX", "script:latin"…), or null when it is not one. */
export function groupMembers(g) {
  if (g === 'world') return [...countries().keys()];
  if (/^[A-Z]{3}$/.test(g)) return countries().has(g) ? [g] : null;
  const m = /^([a-z]+):([a-z0-9-]+)$/.exec(g);
  if (!m || !FIELDS[m[1]]) return null;
  const field = FIELDS[m[1]], v = m[2];
  const out = [];
  for (const iso of countries().keys()) {
    const a = attributes()[iso]?.[field];
    if (a == null) continue;
    if ([].concat(a).some((x) => x === v || (m[1] === 'religion' && String(x).startsWith(`${v}-`)))) out.push(iso);
  }
  return out.length ? out : null;
}
/** The countries a "where" list names: groups added together, "!group" taken away. */
export function resolveWhere(list) {
  const on = new Set();
  for (const g of list.filter((x) => !x.startsWith('!'))) for (const c of groupMembers(g) ?? []) on.add(c);
  for (const g of list.filter((x) => x.startsWith('!'))) for (const c of groupMembers(g.slice(1)) ?? []) on.delete(c);
  return [...on].sort();
}

// ---------------------------------------------------------------------------------------------
// Other collections, for "see" links: a story ("people/ancient-egypt", "people/ancient-egypt#3" for a step) or a
// marker of one ("inventions:papyrus").

const DIRS = new Map(Object.entries(KINDS).map(([kind, dir]) => [dir, kind]));
const storyCache = new Map(), itemCache = new Map();
function storiesOf(dir) {
  if (!storyCache.has(dir)) {
    const f = path.join(DATA, dir, 'index.json');
    const list = fs.existsSync(f) ? (readJSON(f).stories ?? readJSON(f).conflicts ?? []) : [];
    storyCache.set(dir, new Map(list.map((s) => [s.id, s])));
  }
  return storyCache.get(dir);
}
function itemsOf(dir) {
  if (!itemCache.has(dir)) {
    const f = path.join(DATA, dir, 'items.json');
    const list = fs.existsSync(f) ? readJSON(f).items : [];
    itemCache.set(dir, new Map(list.map((i) => [i.id, i])));
  }
  return itemCache.get(dir);
}
function stepsOf(dir, id) {
  const f = path.join(DATA, dir, `${id}.json`);
  return fs.existsSync(f) ? (readJSON(f).steps ?? []).length : 0;
}
/** A "see" link checked and made ready for the app: { k: kind, s: story, st?: step, n: name, i: icon }. */
function seeLink(ref, where) {
  let m = /^([a-z-]+)\/([a-z0-9-]+)(?:#(\d+))?$/.exec(ref);
  if (m) {
    const [, dir, id, step] = m;
    if (!DIRS.has(dir)) throw new Error(`${where}: "${dir}" is not a collection (${[...DIRS.keys()].join(', ')})`);
    const s = storiesOf(dir).get(id);
    if (!s) throw new Error(`${where}: there is no story "${id}" in ${dir} (see --list stories <words>)`);
    const o = { k: DIRS.get(dir), s: id, n: s.name, i: s.icon };
    if (step != null) {
      const n = stepsOf(dir, id);
      if (Number(step) >= n) throw new Error(`${where}: story ${dir}/${id} has steps 0 to ${n - 1}`);
      o.st = Number(step);
    }
    return o;
  }
  m = /^([a-z-]+):([a-z0-9-]+)$/.exec(ref);
  if (m) {
    const [, dir, id] = m;
    if (!DIRS.has(dir)) throw new Error(`${where}: "${dir}" is not a collection (${[...DIRS.keys()].join(', ')})`);
    const it = itemsOf(dir).get(id);
    if (!it) throw new Error(`${where}: there is no marker "${id}" in ${dir} (see --list items <words>)`);
    return { k: DIRS.get(dir), s: it.story, st: it.step, n: it.name, i: it.icon };
  }
  throw new Error(`${where}: "${ref}" must be "<collection>/<story>", "<collection>/<story>#<step>" or "<collection>:<marker>"`);
}

// ---------------------------------------------------------------------------------------------
// Checks.

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const warnings = [];
const warn = (s) => warnings.push(s);
const isPair = (a) => Array.isArray(a) && a.length === 2 && a.every((x) => typeof x === 'number' && Number.isFinite(x));
const inRange = ([lon, lat]) => lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;
const isColor = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);

function text(v, where, { required = true, max = 0, min = 0 } = {}) {
  if (v == null) { if (required) throw new Error(`${where}: missing (needs "en" and "es")`); return; }
  if (typeof v !== 'object' || Array.isArray(v)) throw new Error(`${where}: must be { "en": ..., "es": ... }`);
  for (const l of ['en', 'es']) {
    if (typeof v[l] !== 'string' || !v[l].trim()) throw new Error(`${where}.${l}: missing text`);
    if (max && v[l].length > max) throw new Error(`${where}.${l}: ${v[l].length} characters, at most ${max}`);
    if (min && v[l].length < min) throw new Error(`${where}.${l}: ${v[l].length} characters, at least ${min}`);
    if (v[l] !== v[l].trim() || /\s{2,}/.test(v[l])) warn(`${where}.${l}: extra spaces`);
  }
  for (const k of Object.keys(v)) if (!['en', 'es'].includes(k)) throw new Error(`${where}: unknown language "${k}" (only "en" and "es")`);
  if (v.en === v.es && v.en.split(' ').length > 3) warn(`${where}: the Spanish is the same as the English`);
  // British English, Latin American Spanish.
  const us = /\b(color|colors|center|centers|centered|theater|favorite|honor|honored|labor|neighbor|neighbors|gray|liter|liters|defense|catalog|traveler|travelers|jewelry|mold|plow|plows)\b/i.exec(v.en);
  if (us) warn(`${where}.en: "${us[1]}" is American spelling (British English, please)`);
  const spain = /\b(vosotros|ordenador|ordenadores|zumo|móvil|coche|coches|vale)\b/i.exec(v.es);
  if (spain) warn(`${where}.es: "${spain[1]}" sounds like Spain (Latin American Spanish, please)`);
}
function known(o, keys, where) {
  for (const k of Object.keys(o)) if (!keys.includes(k)) throw new Error(`${where}: unknown field "${k}"`);
}
function checkWhere(list, where, field) {
  if (!Array.isArray(list) || !list.length) throw new Error(`${where}.${field}: a list of groups such as ["world"], ["script:latin", "!VAT"] or ["MEX", "GTM"] (see --list groups)`);
  for (const g of list) {
    if (typeof g !== 'string' || !groupMembers(g.replace(/^!/, ''))) throw new Error(`${where}.${field}: "${g}" is not a country code or group (see --list groups)`);
  }
  const out = resolveWhere(list);
  if (!out.length) throw new Error(`${where}.${field}: names no country at all`);
  return out;
}
function checkWiki(w, where) {
  if (w == null) return;
  if (typeof w !== 'object' || typeof w.en !== 'string' || !w.en || typeof w.es !== 'string') throw new Error(`${where}: "wiki" is { "en": "Article title", "es": "Título del artículo" } ("es" may be "" when there is none)`);
  for (const l of ['en', 'es']) if (/^https?:|_/.test(w[l])) throw new Error(`${where}.${l}: the article's title as written ("Roman numerals"), not an address`);
  known(w, ['en', 'es'], where);
}
function checkImg(img, where) {
  if (img == null) return;
  if (typeof img !== 'string' || !/\.(jpe?g|png|gif|tiff?|webp|svg)$/i.test(img) || /^(File:|https?:)/i.test(img)) throw new Error(`${where}: "img" is a Wikimedia Commons file name such as "Rosetta Stone.JPG" (no "File:", no address)`);
}
function checkSources(list, where) {
  if (!Array.isArray(list) || list.length < 3) throw new Error(`${where}: at least 3 sources [{ "title", "url" }]`);
  for (const [i, s] of list.entries()) {
    if (!s || typeof s.title !== 'string' || !s.title.trim() || typeof s.url !== 'string' || !/^https:\/\/\S+$/.test(s.url)) throw new Error(`${where}[${i}]: { "title": "...", "url": "https://..." }`);
    known(s, ['title', 'url'], `${where}[${i}]`);
  }
}
const words = (s) => s.trim().split(/\s+/).length;

const LEGACY_KEYS = ['id', 'name', 'cat', 'icon', 'how', 'sure', 'date', 'end', 'circa', 'at', 'place', 'text', 'details', 'roots', 'path', 'where', 'strong', 'note', 'words', 'see', 'wiki', 'img'];
function checkLegacy(l, where, civ) {
  if (!l || typeof l !== 'object' || Array.isArray(l)) throw new Error(`${where}: must be an object`);
  known(l, LEGACY_KEYS, where);
  if (!ID_RE.test(l.id ?? '')) throw new Error(`${where}: "id" must be lowercase letters, digits and hyphens`);
  where = `${where} (${l.id})`;
  text(l.name, `${where}.name`, { max: 60 });
  if (!CAT_IDS.has(l.cat)) throw new Error(`${where}: "cat" must be one of ${[...CAT_IDS].join(', ')}`);
  if (typeof l.icon !== 'string' || !l.icon || [...l.icon].length > 8) throw new Error(`${where}: "icon" must be an emoji`);
  if (!HOW.includes(l.how)) throw new Error(`${where}: "how" must be one of ${HOW.join(', ')}`);
  if (l.sure != null && !SURE.includes(l.sure)) throw new Error(`${where}: "sure" must be one of ${SURE.join(', ')} (leave it out for "known")`);
  const t = parseDate(l.date, `${where}.date`);
  if (l.end != null && parseDate(l.end, `${where}.end`) < t) throw new Error(`${where}: "end" is before "date"`);
  if (l.circa != null && typeof l.circa !== 'boolean') throw new Error(`${where}: "circa" is true or left out`);
  if (!isPair(l.at) || !inRange(l.at)) throw new Error(`${where}: "at" must be [lon, lat]`);
  if (!onLand(l.at)) warn(`${where}: "at" ${JSON.stringify(l.at)} is in the sea: check it (it is [lon, lat], longitude first)`);
  text(l.place, `${where}.place`, { max: 90 });
  text(l.text, `${where}.text`, { max: 240, min: 40 });
  text(l.details, `${where}.details`, { required: false, max: 1400 });
  if (l.details) for (const lg of ['en', 'es']) if (words(l.details[lg]) < 30) warn(`${where}.details.${lg}: only ${words(l.details[lg])} words (40 to 150 reads best)`);
  text(l.roots, `${where}.roots`, { required: false, max: 300 });
  text(l.note, `${where}.note`, { max: 240 });
  const uses = checkWhere(l.where, where, 'where');
  let strong;
  if (l.strong != null) {
    strong = checkWhere(l.strong, where, 'strong');
    const out = strong.filter((c) => !uses.includes(c));
    if (out.length) throw new Error(`${where}.strong: ${out.join(', ')} not in "where"`);
  }
  if (l.path != null) {
    if (!Array.isArray(l.path) || l.path.length > 14) throw new Error(`${where}.path: a list of up to 14 steps`);
    for (const [i, p] of l.path.entries()) {
      const pw = `${where}.path[${i}]`;
      if (!p || typeof p !== 'object') throw new Error(`${pw}: { "at", "place", "date", "by"?, "note"?, "from"? }`);
      known(p, ['at', 'place', 'date', 'circa', 'by', 'note', 'from'], pw);
      if (!isPair(p.at) || !inRange(p.at)) throw new Error(`${pw}: "at" must be [lon, lat]`);
      if (!onLand(p.at)) warn(`${pw}: "at" ${JSON.stringify(p.at)} is in the sea: check it (it is [lon, lat], longitude first)`);
      text(p.place, `${pw}.place`, { max: 90 });
      parseDate(p.date, `${pw}.date`);
      if (p.circa != null && typeof p.circa !== 'boolean') throw new Error(`${pw}: "circa" is true or left out`);
      text(p.by, `${pw}.by`, { required: false, max: 90 });
      text(p.note, `${pw}.note`, { required: false, max: 240 });
      if (p.from != null && (!Number.isInteger(p.from) || p.from < 0 || p.from > i)) throw new Error(`${pw}: "from" is 0 (the origin) or the number of an earlier step counting from 1`);
    }
  }
  if (l.words != null) {
    if (!Array.isArray(l.words) || !l.words.length || l.words.length > 40) throw new Error(`${where}.words: a list of 1 to 40 words`);
    for (const [i, w] of l.words.entries()) {
      const ww = `${where}.words[${i}]`;
      if (!w || typeof w !== 'object') throw new Error(`${ww}: { "en"?, "es"?, "from", "means"?, "type"? }`);
      known(w, ['en', 'es', 'from', 'means', 'type'], ww);
      if (w.type != null && !WORD_TYPES.includes(w.type)) throw new Error(`${ww}.type: one of ${WORD_TYPES.join(', ')} (leave it out for a word)`);
      if (!w.en && !w.es) throw new Error(`${ww}: the word today in English ("en"), Spanish ("es") or both`);
      for (const k of ['en', 'es']) if (w[k] != null && (typeof w[k] !== 'string' || !w[k].trim() || w[k].length > 40)) throw new Error(`${ww}.${k}: a word or short phrase (at most 40 characters)`);
      if (typeof w.from !== 'string' || !w.from.trim() || w.from.length > 90) throw new Error(`${ww}.from: the word it comes from, with its language ("tomatl (Nahuatl)"), at most 90 characters`);
      text(w.means, `${ww}.means`, { required: false, max: 120 });
    }
  }
  const see = [];
  if (l.see != null) {
    if (!Array.isArray(l.see) || l.see.length > 8) throw new Error(`${where}.see: a list of up to 8 links`);
    for (const [i, r] of l.see.entries()) see.push(seeLink(r, `${where}.see[${i}]`));
  }
  checkWiki(l.wiki, `${where}.wiki`);
  checkImg(l.img, `${where}.img`);
  if (!l.wiki && !l.img) warn(`${where}: no "wiki" or "img", so the card has no picture`);
  if (l.cat === 'words' && !l.words) warn(`${where}: a "words" legacy without a "words" list`);
  if (civ.from && t < parseDate(civ.from, '') - 3000) warn(`${where}: dated ${l.date}, long before the civilization (${civ.from})`);
  return { t, uses, strong, see };
}

const CIV_KEYS = ['id', 'name', 'short', 'icon', 'color', 'from', 'to', 'at', 'zoom', 'home', 'defs', 'intro', 'today', 'story', 'wiki', 'sources', 'legacies'];
function checkCiv(c, file) {
  const where = path.basename(file);
  if (!c || typeof c !== 'object') throw new Error(`${where}: must be an object`);
  known(c, CIV_KEYS, where);
  if (!ID_RE.test(c.id ?? '') || `${c.id}.json` !== where) throw new Error(`${where}: "id" must match the file name`);
  text(c.name, `${where}.name`, { max: 50 });
  text(c.short, `${where}.short`, { required: false, max: 24 });
  if (typeof c.icon !== 'string' || !c.icon || [...c.icon].length > 8) throw new Error(`${where}: "icon" must be an emoji`);
  if (!isColor(c.color)) throw new Error(`${where}: "color" must be "#rrggbb"`);
  const from = parseDate(c.from, `${where}.from`);
  if (parseDate(c.to, `${where}.to`) < from) throw new Error(`${where}: "to" is before "from"`);
  if (!isPair(c.at) || !inRange(c.at)) throw new Error(`${where}: "at" must be [lon, lat]`);
  if (c.zoom != null && !(typeof c.zoom === 'number' && c.zoom >= 1 && c.zoom <= 12)) throw new Error(`${where}: "zoom" is between 1 and 12`);
  if (c.home == null) throw new Error(`${where}: "home" (the homeland at its height, an area expression) is missing`);
  text(c.intro, `${where}.intro`, { max: 700, min: 80 });
  text(c.today, `${where}.today`, { required: false, max: 400 });
  let story;
  if (c.story != null) story = seeLink(c.story, `${where}.story`);
  checkWiki(c.wiki, `${where}.wiki`);
  checkSources(c.sources, `${where}.sources`);
  if (!Array.isArray(c.legacies) || c.legacies.length < 12) throw new Error(`${where}: "legacies" needs at least 12 entries`);
  const ids = new Set(), names = new Set(), checked = [];
  for (const [i, l] of c.legacies.entries()) {
    const r = checkLegacy(l, `${where} legacies[${i}]`, c);
    if (ids.has(l.id)) throw new Error(`${where}: two legacies are called "${l.id}"`);
    ids.add(l.id);
    if (names.has(l.name.en.toLowerCase())) warn(`${where}: two legacies are named "${l.name.en}"`);
    names.add(l.name.en.toLowerCase());
    checked.push(r);
  }
  const cats = new Set(c.legacies.map((l) => l.cat));
  if (cats.size < 5) warn(`${where}: only ${cats.size} categories (${[...cats].join(', ')}); look wider`);
  // Words and names they gave us: several examples, where the civilization gave any.
  const ws = c.legacies.flatMap((l) => l.words ?? []);
  if (ws.length < 8) warn(`${where}: only ${ws.length} words and names in all; give several examples where they exist (everyday words, people's names, place names, days and months, stars)`);
  return { story, checked };
}

// ---------------------------------------------------------------------------------------------
// Wikipedia titles, checked against Wikidata's sitelinks on QLever (never Wikipedia itself). A title that is only
// a redirect counts as missing: use the article's own title.

async function checkTitles(civs) {
  const { ask, val } = await import('../lives/wdqs.mjs');
  const want = { en: new Map(), es: new Map() };
  for (const c of civs) {
    const add = (w, where) => { if (!w) return; for (const l of ['en', 'es']) if (w[l]) (want[l].get(w[l]) ?? want[l].set(w[l], []).get(w[l])).push(where); };
    add(c.wiki, `${c.id}.json`);
    for (const l of c.legacies) add(l.wiki, `${c.id}.json ${l.id}`);
  }
  let bad = 0;
  for (const lang of ['en', 'es']) {
    const titles = [...want[lang].keys()].sort();
    const found = new Set();
    for (let i = 0; i < titles.length; i += 200) {
      const chunk = titles.slice(i, i + 200);
      const hash = crypto.createHash('sha1').update(chunk.join('\n')).digest('hex').slice(0, 12);
      const vals = chunk.map((t) => `${JSON.stringify(t)}@${lang}`).join(' ');
      const rows = await ask(CACHE, `titles-${lang}-${hash}`, `SELECT ?t WHERE { VALUES ?t { ${vals} } ?a schema:isPartOf <https://${lang}.wikipedia.org/> ; schema:name ?t . }`);
      for (const r of rows) found.add(val(r, 't'));
    }
    for (const t of titles) if (!found.has(t)) { bad++; console.error(`FAIL ${want[lang].get(t).join(', ')}: no ${lang} Wikipedia article is called "${t}" (a redirect does not count; use the article's own title${lang === 'es' ? ', or "" when there is none' : ''})`); }
  }
  return bad;
}

// ---------------------------------------------------------------------------------------------
// Output.

const tx = (v) => (v ? { en: v.en, es: v.es } : undefined);
function civOut(c, story, checked) {
  const legacies = c.legacies.map((l, i) => {
    const { t, uses, strong, see } = checked[i];
    const o = { id: l.id, name: tx(l.name), cat: l.cat, icon: l.icon, how: l.how };
    if (l.sure && l.sure !== 'known') o.sure = l.sure;
    o.date = l.date; o.t = Math.round(t * 100) / 100;
    if (l.end) o.end = l.end;
    if (l.circa) o.circa = true;
    o.at = l.at; o.place = tx(l.place); o.text = tx(l.text);
    for (const k of ['details', 'roots']) if (l[k]) o[k] = tx(l[k]);
    if (l.path?.length) o.path = l.path.map((p) => ({ at: p.at, place: tx(p.place), date: p.date, ...(p.circa ? { circa: true } : {}), ...(p.by ? { by: tx(p.by) } : {}), ...(p.note ? { note: tx(p.note) } : {}), ...(p.from != null ? { from: p.from } : {}) }));
    o.where = l.where;
    if (l.strong) o.strong = l.strong;
    o.n = uses.length;
    o.note = tx(l.note);
    if (l.words) o.words = l.words.map((w) => ({ ...(w.en ? { en: w.en } : {}), ...(w.es ? { es: w.es } : {}), from: w.from, ...(w.means ? { means: tx(w.means) } : {}), ...(w.type && w.type !== 'word' ? { type: w.type } : {}) }));
    if (see.length) o.see = see;
    if (l.wiki) o.wiki = { en: l.wiki.en, es: l.wiki.es };
    if (l.img) o.img = l.img;
    return o;
  });
  const o = { id: c.id, name: tx(c.name) };
  if (c.short) o.short = tx(c.short);
  Object.assign(o, { icon: c.icon, color: c.color.toLowerCase(), from: c.from, to: c.to, at: c.at });
  if (c.zoom) o.zoom = c.zoom;
  o.intro = tx(c.intro);
  if (c.today) o.today = tx(c.today);
  if (story) o.story = story;
  if (c.wiki) o.wiki = { en: c.wiki.en, es: c.wiki.es };
  o.sources = c.sources.map((s) => ({ title: s.title, url: s.url }));
  o.legacies = legacies;
  return o;
}
function indexOut(full) {
  const groups = {};
  const all = [];
  for (const c of full) {
    for (const l of c.legacies) {
      for (const g of [...l.where, ...(l.strong ?? [])]) {
        const k = g.replace(/^!/, '');
        if (k !== 'world' && !/^[A-Z]{3}$/.test(k)) groups[k] ??= groupMembers(k);
      }
      const e = { c: c.id, id: l.id, name: l.name, icon: l.icon, cat: l.cat, how: l.how, t: l.t, at: l.at, where: l.where };
      if (l.strong) e.strong = l.strong;
      if (l.sure) e.sure = l.sure;
      // Its words (for the search, and a country's page): each in English and Spanish, and its kind.
      if (l.words) e.w = l.words.map((w) => ({ ...(w.en ? { en: w.en } : {}), ...(w.es ? { es: w.es } : {}), ...(w.type && w.type !== 'word' ? { t: w.type } : {}) }));
      all.push(e);
    }
  }
  const civs = full.map((c) => {
    const cats = {};
    for (const l of c.legacies) cats[l.cat] = (cats[l.cat] ?? 0) + 1;
    const o = { id: c.id, name: c.name };
    if (c.short) o.short = c.short;
    Object.assign(o, { icon: c.icon, color: c.color, from: c.from, to: c.to, at: c.at });
    if (c.zoom) o.zoom = c.zoom;
    o.n = c.legacies.length; o.cats = cats;
    if (c.story) o.story = { k: c.story.k, s: c.story.s };
    return o;
  }).sort((a, b) => parseDate(a.from, '') - parseDate(b.from, ''));
  return { cats: CATS, how: HOW, civs, groups: Object.fromEntries(Object.entries(groups).sort()), countries: [...countries().keys()].sort(), all };
}

function list(what, q) {
  if (what === 'groups') {
    const seen = new Map();
    for (const iso of countries().keys()) for (const [p, field] of Object.entries(FIELDS)) for (const v of [].concat(attributes()[iso]?.[field] ?? [])) {
      const k = `${p}:${v}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
      if (p === 'religion' && v.includes('-')) { const b = `${p}:${v.split('-')[0]}`; seen.set(b, (seen.get(b) ?? 0) + 1); }
    }
    console.log('world (every country on the map), a country code (MEX), or one of these groups (countries in brackets); "!group" takes one away:');
    for (const [k, n] of [...seen].sort()) console.log(`  ${k} (${n})`);
    return;
  }
  if (what === 'cats') { for (const c of CATS) console.log(`${c.id}\t${c.icon}\t${c.name.en}`); return; }
  const words = (q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (s) => words.every((w) => s.toLowerCase().includes(w));
  for (const dir of DIRS.keys()) {
    if (what === 'stories') for (const s of storiesOf(dir).values()) { if (hit(`${s.id} ${s.name.en} ${s.name.es}`)) console.log(`${dir}/${s.id}\t${s.name.en} (${stepsOf(dir, s.id)} steps)`); }
    if (what === 'items') for (const i of itemsOf(dir).values()) { if (hit(`${i.id} ${i.name.en} ${i.name.es}`)) console.log(`${dir}:${i.id}\t${i.name.en} (${i.date}, ${i.place?.en ?? ''})`); }
  }
}

/** Article titles with all these words in one language, each with its title in the other. */
async function find(lang, q) {
  if (!['en', 'es'].includes(lang) || !q.trim()) throw new Error('--find en|es <words>');
  const { ask, val } = await import('../lives/wdqs.mjs');
  const other = lang === 'en' ? 'es' : 'en';
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hash = crypto.createHash('sha1').update(`${lang} ${words.join(' ')}`).digest('hex').slice(0, 12);
  const rows = await ask(CACHE, `find-${hash}`, `SELECT ?t ?o ?s WHERE { ?a schema:about ?s ; schema:isPartOf <https://${lang}.wikipedia.org/> ; schema:name ?t . FILTER(${words.map((w) => `CONTAINS(LCASE(?t), ${JSON.stringify(w)})`).join(' && ')}) OPTIONAL { ?b schema:about ?s ; schema:isPartOf <https://${other}.wikipedia.org/> ; schema:name ?o } } LIMIT 40`);
  for (const r of rows.sort((a, b) => val(a, 't').length - val(b, 't').length)) console.log(`${lang}: ${val(r, 't')}\t${other}: ${val(r, 'o') ?? '(none)'}\t${val(r, 's').split('/').pop()}`);
  if (!rows.length) console.log('no titles with all these words');
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  if (args.includes('--list')) return list(opt('--list'), args.slice(args.indexOf('--list') + 2).join(' '));
  if (args.includes('--find')) return find(opt('--find'), args.slice(args.indexOf('--find') + 2).join(' '));
  // (For trying the app on other sources: --src <folder> --out <folder>.)
  if (opt('--src')) SRC = path.resolve(opt('--src'));
  if (opt('--out')) OUT = path.resolve(opt('--out'));
  const check = args.includes('--check');
  const only = opt('--only')?.split(',');
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
  let failed = 0;
  const full = [], homes = [];
  for (const f of files) {
    const id = f.replace(/\.json$/, '');
    if (only && !only.includes(id)) continue;
    try {
      const c = readJSON(path.join(SRC, f));
      const { story, checked } = checkCiv(c, f);
      homes.push({ id: c.id, expr: c.home, defs: c.defs });
      // The homeland on its own, so that a mistake names its file.
      areaTopology([{ id: c.id, expr: c.home, defs: c.defs }], `${f} home`, HOME_DETAIL);
      full.push(civOut(c, story, checked));
      console.log(`ok ${f}: ${c.legacies.length} legacies`);
    } catch (e) { failed++; console.error(`FAIL ${f}: ${e.message}`); }
  }
  if (only) for (const id of only) if (!files.includes(`${id}.json`)) { failed++; console.error(`FAIL no scripts/data/legacies/${id}.json`); }
  // The same legacy written by two civilizations.
  const seen = new Map();
  for (const c of full) for (const l of c.legacies) {
    const k = l.name.en.toLowerCase();
    if (seen.has(k)) warn(`"${l.name.en}" is in both ${seen.get(k)} and ${c.id}: say how each one gave it, or keep one`);
    else seen.set(k, c.id);
  }
  if (args.includes('--titles')) failed += await checkTitles(full.map((c) => ({ id: c.id, wiki: c.wiki, legacies: c.legacies })));
  for (const w of warnings) console.warn(`warn ${w}`);
  if (failed) process.exit(1);
  // --only checks those files and writes nothing (other files may be half-written).
  if (only) { console.log(`checked ${only.join(', ')}: run without --only to build`); return; }
  if (!full.length) { console.log('no civilizations yet'); return; }
  // Homelands are washes of colour seen whole, never close up: simplified harder than the stories' territories.
  const out = { 'index.json': indexOut(full), 'areas.json': areaTopology(homes, 'home', HOME_DETAIL) };
  for (const c of full) out[`${c.id}.json`] = c;
  if (check) {
    let stale = 0;
    for (const [f, d] of Object.entries(out)) {
      const p = path.join(OUT, f);
      if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== JSON.stringify(d)) { stale++; console.error(`FAIL public/data/legacies/${f} is out of date: run node scripts/data/legacies/build-legacies.mjs`); }
    }
    for (const f of fs.existsSync(OUT) ? fs.readdirSync(OUT) : []) if (!out[f] && f !== 'SOURCES.md') { stale++; console.error(`FAIL public/data/legacies/${f} has no source`); }
    if (stale) process.exit(1);
    console.log(`legacies: ${full.length} civilizations, ${full.reduce((n, c) => n + c.legacies.length, 0)} legacies, up to date`);
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const [f, d] of Object.entries(out)) fs.writeFileSync(path.join(OUT, f), JSON.stringify(d));
  for (const f of fs.readdirSync(OUT)) if (!out[f] && f !== 'SOURCES.md') fs.unlinkSync(path.join(OUT, f));
  console.log(`legacies: ${full.length} civilizations, ${full.reduce((n, c) => n + c.legacies.length, 0)} legacies`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
