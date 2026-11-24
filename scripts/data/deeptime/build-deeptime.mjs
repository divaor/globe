#!/usr/bin/env node
// Deep time (v0.45.0): checks the sources in scripts/data/deeptime/ (README there) and builds public/data/deeptime/:
// deeptime.json (the groups and kinds, the Earth's vital signs through time, the events, the narration) and
// species.json (the past species, each with its fossil sites). Places are given with today's coordinates; places
// younger than the plate model's oldest age (1000 Ma) get the plate that carries them, so the app moves them with
// their continent.
//
// Usage:
//   node scripts/data/deeptime/build-deeptime.mjs                  build everything
//   node scripts/data/deeptime/build-deeptime.mjs --only [a,b]     check every file, or the files named (writes nothing)
//   --titles     check the Wikipedia titles on QLever (NODE_USE_ENV_PROXY=1)
//   --pbdb       compare species' ages with the Paleobiology Database (cached in .cache/deeptime/pbdb)
//   --check      fail if public/data/deeptime is not what the sources build
//   --draft      build even if the events, species or script are not written yet (to look at the app meanwhile)
//   --find en|es <words>    Wikipedia titles with these words, with the other language's title
//   --list events|species|beats|items [words]   ids in use; markers of the Life through time stories
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { plateFor, PALEO_MAX_MA } from '../paleo-rot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = path.join(ROOT, 'scripts/data/deeptime');
const OUT = path.join(ROOT, 'public/data/deeptime');
const CACHE = path.join(ROOT, '.cache/deeptime');
const UA = 'AtlasGlobe-research/1.0 (https://example.org)';

/** Groups of living things: id, icon, colour, English, Spanish (the colours of the Life through time stories). */
export const GROUPS = [
  ['microbe', '🦠', '#26a69a', 'Microbes', 'Microbios'],
  ['plant', '🌿', '#2e8b3e', 'Plants and algae', 'Plantas y algas'],
  ['invertebrate', '🐚', '#8e44ad', 'Invertebrates', 'Invertebrados'],
  ['fish', '🐟', '#1e6fd9', 'Fish', 'Peces'],
  ['amphibian', '🐸', '#9ccc65', 'Amphibians', 'Anfibios'],
  ['reptile', '🦎', '#827717', 'Reptiles', 'Reptiles'],
  ['dinosaur', '🦕', '#c0392b', 'Dinosaurs', 'Dinosaurios'],
  ['flyer', '🪶', '#f39c12', 'Flyers', 'Voladores'],
  ['mammal', '🦣', '#8d5524', 'Mammals', 'Mamíferos'],
  ['human', '🧍', '#e67e22', 'Humans and their relatives', 'Humanos y sus parientes'],
];
/** Kinds of events: id, icon, colour, English, Spanish. */
export const KINDS = [
  ['planet', '🌍', '#5d6d7e', 'The planet', 'El planeta'],
  ['impact', '☄️', '#e74c3c', 'Impacts', 'Impactos'],
  ['volcano', '🌋', '#d35400', 'Great eruptions', 'Grandes erupciones'],
  ['ice', '🧊', '#5dade2', 'Ice ages', 'Glaciaciones'],
  ['climate', '🌡️', '#e67e22', 'Climate', 'Clima'],
  ['air', '💨', '#48c9b0', 'The air', 'El aire'],
  ['continent', '🗺️', '#a0522d', 'Continents', 'Continentes'],
  ['life', '🧬', '#27ae60', 'Life', 'Vida'],
  ['extinction', '💀', '#7b241c', 'Mass extinctions', 'Extinciones masivas'],
  ['human', '🔥', '#e67e22', 'Humans', 'Humanos'],
  ['cosmic', '✨', '#6c5ce7', 'The universe', 'El universo'],
  ['star', '⭐', '#f1c40f', 'Stars and the Sun', 'Las estrellas y el Sol'],
  ['galaxy', '🌌', '#8e44ad', 'Galaxies', 'Galaxias'],
];
/** The kinds of the cosmos chapter (v0.46.0): they come before the Earth. */
export const COSMIC_KINDS = ['cosmic', 'star', 'galaxy'];
/** The first million years are told in years after the Big Bang ("t"): in millions of years ago they would all read 13,787. */
const T_MAX = 1e6;
export const LIFE = ['sea', 'fresh', 'shore', 'land', 'air'];
export const DIETS = ['meat', 'plants', 'both', 'filter', 'small', 'light', 'chem', 'fish'];
export const ICE = ['snowball', 'south', 'north', 'glacial', 'caps'];
/** The vital signs: id, unit, the values that make sense, whether it is required, English, Spanish. */
export const SERIES = [
  ['o2', '%', [0, 40], true, 'Oxygen', 'Oxígeno'],
  ['co2', 'ppm', [100, 3e6], true, 'Carbon dioxide', 'Dióxido de carbono'],
  ['ch4', 'ppm', [0, 1e5], false, 'Methane', 'Metano'],
  ['temp', '°C', [-60, 250], true, 'Average temperature', 'Temperatura media'],
  ['sea', 'm', [-200, 400], false, 'Sea level', 'Nivel del mar'],
  ['day', 'h', [2, 25], true, 'Length of the day', 'Duración del día'],
  ['moon', 'thousand km', [10, 410], true, 'Distance to the Moon', 'Distancia a la Luna'],
  ['genera', 'genera', [0, 20000], false, 'Marine genera known from fossils', 'Géneros marinos conocidos por fósiles'],
  ['ocean_ph', 'pH', [5, 9.5], false, 'Ocean pH', 'pH del océano'],
];
/** The Earth's first days (Ma): every required series reaches back to them. */
export const EARTH_MA = 4540;
/** The Big Bang (Ma, Planck 2018). */
export const BIG_BANG_MA = 13787;

// ---------------------------------------------------------------------------------------------
// Checks.

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const warnings = [];
const warn = (m) => warnings.push(m);
const known = (o, keys, where) => { for (const k of Object.keys(o)) if (!keys.includes(k)) throw new Error(`${where}: unknown field "${k}" (known: ${keys.join(', ')})`); };
const num = (v, where, lo = -Infinity, hi = Infinity) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`${where}: a number from ${lo} to ${hi}`);
  return v;
};
const AMERICAN = /\b(color|colors|center|centers|meter|meters|kilometer|kilometers|organization|recognized|realized|harbor|neighbor|favorite|gray|fiber|liter|aluminum)\b/i;
const SPAIN = /\b(ordenador|coche|vosotros|vuestro|zumo|patata)\b/i;
function text(v, where, { required = true, min = 0, max = 2000 } = {}) {
  if (v == null) { if (required) throw new Error(`${where}: { "en", "es" } required`); return; }
  if (typeof v !== 'object') throw new Error(`${where}: { "en", "es" }`);
  known(v, ['en', 'es'], where);
  for (const l of ['en', 'es']) {
    const s = v[l];
    if (typeof s !== 'string' || !s.trim()) throw new Error(`${where}.${l}: text required`);
    if (s.length > max) throw new Error(`${where}.${l}: ${s.length} characters (at most ${max})`);
    if (s.length < min) warn(`${where}.${l}: only ${s.length} characters (${min} or more reads best)`);
    if (/\s{2,}|^\s|\s$/.test(s)) warn(`${where}.${l}: extra spaces`);
  }
  if (AMERICAN.test(v.en)) warn(`${where}.en: American spelling ("${AMERICAN.exec(v.en)[0]}"); the app's English is British`);
  if (SPAIN.test(v.es)) warn(`${where}.es: "${SPAIN.exec(v.es)[0]}" is Spain's Spanish; the default is Latin American`);
}
function wiki(v, where) {
  if (v == null) return;
  if (typeof v !== 'object') throw new Error(`${where}: { "en", "es" } Wikipedia titles`);
  known(v, ['en', 'es'], where);
  if (typeof v.en !== 'string' || !v.en.trim()) throw new Error(`${where}.en: the English Wikipedia title`);
  if (v.es != null && typeof v.es !== 'string') throw new Error(`${where}.es: the Spanish Wikipedia title, or ""`);
  for (const l of ['en', 'es']) if (v[l] && /https?:|_/.test(v[l])) throw new Error(`${where}.${l}: the article's title as written ("Chicxulub crater"), not a link`);
}
function lonLat(v, where) {
  if (!Array.isArray(v) || v.length !== 2) throw new Error(`${where}: [lon, lat], today's coordinates`);
  num(v[0], `${where}[0] (longitude)`, -180, 180);
  num(v[1], `${where}[1] (latitude)`, -90, 90);
  return v;
}

/** The plate that carries a place at an age (Ma), when the plate model reaches it. */
function plateAt(at, ma, where) {
  if (ma > PALEO_MAX_MA) return undefined;
  const r = plateFor(at, ma);
  if (r.note) warn(`${where}: ${r.note}`);
  return r.pl ?? undefined;
}

function checkVitals(v) {
  const where = 'vitals.json';
  known(v, ['sources', 'series', 'ice', 'notes'], where);
  if (!Array.isArray(v.sources) || v.sources.length < 4) throw new Error(`${where}.sources: at least 4 sources, each { "id", "title", "url" }`);
  const ids = new Set();
  for (const [i, s] of v.sources.entries()) {
    known(s, ['id', 'title', 'url'], `${where}.sources[${i}]`);
    if (!ID.test(s.id ?? '') || ids.has(s.id)) throw new Error(`${where}.sources[${i}].id: a new id (lowercase, digits, hyphens)`);
    ids.add(s.id);
    if (typeof s.title !== 'string' || s.title.length < 10) throw new Error(`${where}.sources[${i}].title: who, when, what`);
    if (!/^https:\/\//.test(s.url ?? '')) throw new Error(`${where}.sources[${i}].url: an https link (a DOI or a publisher's page)`);
    if (/wikipedia\.org/.test(s.url)) throw new Error(`${where}.sources[${i}]: not Wikipedia`);
  }
  const used = new Set();
  const out = {};
  for (const [id, unit, [lo, hi], required] of SERIES) {
    const s = v.series?.[id];
    const w = `${where}.series.${id}`;
    if (!s) { if (required) throw new Error(`${w}: required`); continue; }
    known(s, ['src', 'points'], w);
    if (!Array.isArray(s.src) || !s.src.length) throw new Error(`${w}.src: the ids of its sources`);
    for (const x of s.src) { if (!ids.has(x)) throw new Error(`${w}.src: no source "${x}"`); used.add(x); }
    if (!Array.isArray(s.points) || s.points.length < 6) throw new Error(`${w}.points: at least 6 points [ma, value] or [ma, value, low, high]`);
    let last = -1;
    for (const [i, p] of s.points.entries()) {
      const pw = `${w}.points[${i}]`;
      if (!Array.isArray(p) || (p.length !== 2 && p.length !== 4)) throw new Error(`${pw}: [ma, value] or [ma, value, low, high]`);
      num(p[0], `${pw}[0] (ma)`, 0, BIG_BANG_MA);
      if (p[0] <= last) throw new Error(`${pw}: points go from the youngest (0) to the oldest, each older than the one before (${p[0]} after ${last})`);
      last = p[0];
      for (let k = 1; k < p.length; k++) num(p[k], `${pw}[${k}] (${unit})`, lo, hi);
      if (p.length === 4 && !(p[2] <= p[1] && p[1] <= p[3])) throw new Error(`${pw}: low ≤ value ≤ high`);
    }
    if (s.points[0][0] !== 0) throw new Error(`${w}: the first point is today (ma 0)`);
    if (required && last < EARTH_MA && !v.notes?.[id]) warn(`${w}: stops at ${last} Ma; reach back to ${EARTH_MA}, or say why in notes.${id}`);
    out[id] = s.points;
  }
  for (const id of ids) if (!used.has(id)) warn(`${where}: source "${id}" is not used by any series`);
  const ice = (v.ice ?? []).map((x, i) => {
    const w = `${where}.ice[${i}]`;
    known(x, ['from', 'to', 'kind'], w);
    num(x.from, `${w}.from`, 0, EARTH_MA); num(x.to, `${w}.to`, 0, EARTH_MA);
    if (!(x.from > x.to)) throw new Error(`${w}: from (older) > to (younger)`);
    if (!ICE.includes(x.kind)) throw new Error(`${w}.kind: one of ${ICE.join(', ')}`);
    return x;
  });
  if (!ice.some((x) => x.kind === 'snowball')) warn(`${where}.ice: no Snowball Earth`);
  for (const [k, t] of Object.entries(v.notes ?? {})) text(t, `${where}.notes.${k}`, { max: 400 });
  return { series: out, ice, notes: v.notes ?? {}, sources: v.sources };
}

/**
 * An event or a beat in the first million years gives "t", years after the Big Bang (1e-32 seconds is 3.17e-40
 * years); everything later gives "ma". Either one, not both; "ma" is worked out from "t".
 */
function withT(x, where) {
  if (x == null || typeof x !== 'object') return x;
  if (x.t == null) return x;
  if (x.ma != null) throw new Error(`${where}: "t" (years after the Big Bang) or "ma", not both`);
  num(x.t, `${where}.t`, 0, T_MAX);
  return { ...x, ma: BIG_BANG_MA - x.t / 1e6 };
}
/** Order from the oldest: by "t" in the first million years (their "ma" all round to the Big Bang), by "ma" after. */
const sinceBang = (x) => (x.t != null ? x.t : (BIG_BANG_MA - x.ma) * 1e6);

function checkEvent(e, i, file) {
  const where = `${file} events[${i}]${e?.id ? ` (${e.id})` : ''}`;
  known(e, ['id', 'kind', 't', 'ma', 'to', 'err', 'name', 'at', 'r', 'text', 'first', 'sure', 'wiki', 'species', 'item', 'img'], where);
  e = withT(e, where);
  if (!ID.test(e.id ?? '')) throw new Error(`${where}.id: lowercase letters, digits and hyphens`);
  if (!KINDS.some((k) => k[0] === e.kind)) throw new Error(`${where}.kind: one of ${KINDS.map((k) => k[0]).join(', ')}`);
  num(e.ma, `${where}.ma`, 0, BIG_BANG_MA);
  const cosmic = COSMIC_KINDS.includes(e.kind);
  if (cosmic ? e.ma < EARTH_MA - 50 : e.ma > EARTH_MA + 30) throw new Error(`${where}: ${cosmic ? `a ${e.kind} event comes before the Earth` : `only ${COSMIC_KINDS.join(', ')} events come before the Earth (4540 Ma)`}`);
  if (e.to != null) { num(e.to, `${where}.to`, 0, BIG_BANG_MA); if (!(e.to < e.ma)) throw new Error(`${where}.to: younger (smaller) than ma`); }
  if (e.err != null) num(e.err, `${where}.err`, 0, 2000);
  text(e.name, `${where}.name`, { max: 50 });
  text(e.text, `${where}.text`, { min: 120, max: 600 });
  if (e.at != null) lonLat(e.at, `${where}.at`);
  if (e.r != null) num(e.r, `${where}.r`, 1, 5000);
  if ((e.kind === 'impact' || e.kind === 'volcano') && !e.at) throw new Error(`${where}: an ${e.kind} needs "at", where it happened`);
  if (e.kind === 'volcano' && e.to == null) warn(`${where}: a great eruption lasts a while; give "to"`);
  if (e.kind === 'extinction' && e.to == null) warn(`${where}: give "to", when the extinction ended`);
  if (e.first != null && e.first !== true) throw new Error(`${where}.first: true, or leave it out`);
  if (e.sure != null && !['likely', 'debated'].includes(e.sure)) throw new Error(`${where}.sure: "likely" or "debated"`);
  wiki(e.wiki, `${where}.wiki`);
  if (!e.wiki) warn(`${where}: no "wiki"; its card will have no picture`);
  if (e.species != null && (!Array.isArray(e.species) || e.species.some((s) => !ID.test(s)))) throw new Error(`${where}.species: a list of species ids`);
  if (e.img != null && !/^https:\/\/upload\.wikimedia\.org\//.test(e.img)) throw new Error(`${where}.img: a Wikimedia Commons file link, or leave it out`);
  const out = { ...e };
  if (e.at) { const pl = plateAt(e.at, e.to ?? e.ma, where); if (pl) out.pl = pl; }
  return out;
}

function checkSpecies(s, i, file) {
  const where = `${file} species[${i}]${s?.id ? ` (${s.id})` : ''}`;
  known(s, ['id', 'name', 'common', 'group', 'icon', 'life', 'from', 'to', 'alive', 'sites', 'len', 'mass', 'diet', 'text', 'kin', 'wiki', 'pbdb', 'item'], where);
  if (!ID.test(s.id ?? '')) throw new Error(`${where}.id: lowercase letters, digits and hyphens`);
  text(s.name, `${where}.name`, { max: 40 });
  if (s.common != null) text(s.common, `${where}.common`, { max: 40 });
  if (!GROUPS.some((g) => g[0] === s.group)) throw new Error(`${where}.group: one of ${GROUPS.map((g) => g[0]).join(', ')}`);
  if (typeof s.icon !== 'string' || !s.icon || [...s.icon].length > 4) throw new Error(`${where}.icon: one emoji`);
  if (!LIFE.includes(s.life)) throw new Error(`${where}.life: one of ${LIFE.join(', ')}`);
  num(s.from, `${where}.from`, 0, EARTH_MA);
  num(s.to, `${where}.to`, 0, EARTH_MA);
  if (!(s.from > s.to)) throw new Error(`${where}: from (first appearance) is older (larger) than to (last appearance)`);
  if (s.alive != null && s.alive !== true) throw new Error(`${where}.alive: true, or leave it out`);
  if (s.alive && s.to !== 0) throw new Error(`${where}: a species alive today has "to": 0`);
  if (!s.alive && s.to === 0) throw new Error(`${where}: "to": 0 means alive today; add "alive": true`);
  if (!Array.isArray(s.sites) || !s.sites.length || s.sites.length > 4) throw new Error(`${where}.sites: 1 to 4 fossil sites`);
  const mid = (s.from + s.to) / 2;
  const sites = s.sites.map((x, k) => {
    const w = `${where}.sites[${k}]`;
    known(x, ['at', 'place'], w);
    lonLat(x.at, `${w}.at`);
    text(x.place, `${w}.place`, { max: 90 });
    const out = { at: x.at, place: x.place };
    const pl = plateAt(x.at, mid, w);
    if (pl) out.pl = pl;
    return out;
  });
  if (s.len != null) num(s.len, `${where}.len (metres)`, 1e-7, 60);
  if (s.mass != null) num(s.mass, `${where}.mass (kg)`, 1e-12, 200000);
  if (!DIETS.includes(s.diet)) throw new Error(`${where}.diet: one of ${DIETS.join(', ')}`);
  text(s.text, `${where}.text`, { min: 120, max: 500 });
  if (s.kin != null) text(s.kin, `${where}.kin`, { max: 120 });
  wiki(s.wiki, `${where}.wiki`);
  if (!s.wiki) throw new Error(`${where}.wiki: its Wikipedia titles (for its picture)`);
  if (s.pbdb != null && (typeof s.pbdb !== 'string' || !/^[A-Z][a-z]+( [a-z]+)?$/.test(s.pbdb))) throw new Error(`${where}.pbdb: a genus or "Genus species" name`);
  return { ...s, sites };
}

function checkBeat(b0, i, prev, ids, file = 'script.json') {
  const where = `${file} beats[${i}]${b0?.id ? ` (${b0.id})` : ''}`;
  known(b0, ['id', 't', 'ma', 'focus', 'cam', 'text'], where);
  const b = withT(b0, where);
  if (!/^beat-[a-z0-9-]+$/.test(b.id ?? '')) throw new Error(`${where}.id: "beat-…"`);
  num(b.ma, `${where}.ma`, 0, BIG_BANG_MA);
  if (prev != null && sinceBang(b) < sinceBang(prev)) throw new Error(`${where}: beats go from the oldest to today`);
  if (file === 'script-cosmos.json' && b.ma <= EARTH_MA) throw new Error(`${where}: the cosmos chapter's beats come before the Earth (4540 Ma); the Earth's own are in script.json`);
  if (b.focus != null && !ids.has(b.focus)) throw new Error(`${where}.focus: no event or species "${b.focus}"`);
  if (b.cam != null) {
    if (!Array.isArray(b.cam) || b.cam.length !== 3) throw new Error(`${where}.cam: [lon, lat, zoom]`);
    lonLat(b.cam.slice(0, 2), `${where}.cam`); num(b.cam[2], `${where}.cam[2] (zoom)`, 0.6, 12);
  }
  text(b.text, `${where}.text`, { min: 80, max: 420 });
  for (const l of ['en', 'es']) if (/[()[\]]/.test(b.text[l])) warn(`${where}.text.${l}: brackets read badly aloud`);
  return b;
}

// ---------------------------------------------------------------------------------------------
// Online checks.

async function checkTitles(list) {
  const { ask, val } = await import('../lives/wdqs.mjs');
  const want = { en: new Map(), es: new Map() };
  for (const [w, where] of list) for (const l of ['en', 'es']) if (w?.[l]) (want[l].get(w[l]) ?? want[l].set(w[l], []).get(w[l])).push(where);
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

/** A taxon's first and last appearance in the Paleobiology Database (cached). */
function pbdbAges(name) {
  const dir = path.join(CACHE, 'pbdb');
  const file = path.join(dir, `${name.replace(/\s+/g, '_')}.json`);
  let j;
  if (fs.existsSync(file)) j = JSON.parse(fs.readFileSync(file, 'utf8'));
  else {
    fs.mkdirSync(dir, { recursive: true });
    const url = `https://paleobiodb.org/data1.2/taxa/single.json?name=${encodeURIComponent(name)}&show=app&vocab=pbdb`;
    const out = execFileSync('curl', ['-sS', '--max-time', '60', '-A', UA, url]).toString();
    j = JSON.parse(out);
    fs.writeFileSync(file, out);
  }
  const r = j.records?.[0];
  if (!r || r.firstapp_max_ma == null) return null;
  return { first: r.firstapp_max_ma, firstMin: r.firstapp_min_ma, last: r.lastapp_min_ma, lastMax: r.lastapp_max_ma, extant: r.is_extant === 'extant', n: r.n_occs };
}

function checkPbdb(species) {
  let n = 0;
  for (const s of species) {
    if (!s.pbdb) continue;
    let a;
    try { a = pbdbAges(s.pbdb); } catch (e) { warn(`${s.id}: the Paleobiology Database did not answer for "${s.pbdb}" (${String(e.message).slice(0, 80)})`); continue; }
    n++;
    if (!a) { warn(`${s.id}: the Paleobiology Database has no ages for "${s.pbdb}"`); continue; }
    const off = (mine, lo, hi) => mine < lo * 0.8 || mine > hi * 1.2;
    if (off(s.from, a.firstMin, a.first)) warn(`${s.id}: from ${s.from} Ma; the Paleobiology Database's first appearance of ${s.pbdb} is ${a.firstMin}–${a.first} Ma (${a.n} finds)`);
    if (!s.alive && off(s.to, a.last, a.lastMax)) warn(`${s.id}: to ${s.to} Ma; the database's last appearance of ${s.pbdb} is ${a.last}–${a.lastMax} Ma`);
    if (s.alive && !a.extant) warn(`${s.id}: "alive" but the database lists ${s.pbdb} as extinct`);
  }
  console.log(`pbdb: ${n} species compared`);
}

async function findTitles(lang, q) {
  const { ask, val } = await import('../lives/wdqs.mjs');
  if (!['en', 'es'].includes(lang) || !q.trim()) throw new Error('--find en|es <words>');
  const other = lang === 'en' ? 'es' : 'en';
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hash = crypto.createHash('sha1').update(`${lang} ${words.join(' ')}`).digest('hex').slice(0, 12);
  const rows = await ask(CACHE, `find-${hash}`, `SELECT ?t ?o WHERE { ?a schema:about ?s ; schema:isPartOf <https://${lang}.wikipedia.org/> ; schema:name ?t . FILTER(${words.map((w) => `CONTAINS(LCASE(?t), ${JSON.stringify(w)})`).join(' && ')}) OPTIONAL { ?b schema:about ?s ; schema:isPartOf <https://${other}.wikipedia.org/> ; schema:name ?o } } LIMIT 40`);
  if (!rows.length) console.log('no titles with all these words');
  for (const r of rows) console.log(`${lang}: ${val(r, 't')}   ${other}: ${val(r, 'o') ?? '—'}`);
}

// ---------------------------------------------------------------------------------------------
// Reading, building, writing.

const readJSON = (f) => {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { throw new Error(`${path.relative(ROOT, f)}: ${e.message}`); }
};
const sourceFiles = () => fs.readdirSync(SRC).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();

/** Everything checked: the parts that exist (a part not written yet is left out when `partial`). */
function checkAll(only, partial) {
  const files = sourceFiles().filter((f) => !only || only.includes(f.replace(/\.json$/, '')));
  const has = (f) => files.includes(f);
  const got = { vitals: null, events: [], species: [], beats: [], beatsCosmos: [] };
  const ids = new Map();
  const claim = (id, where) => { if (ids.has(id)) throw new Error(`${where}: id "${id}" is used again (first in ${ids.get(id)})`); ids.set(id, where); };
  if (has('vitals.json')) got.vitals = checkVitals(readJSON(path.join(SRC, 'vitals.json')));
  for (const f of files.filter((x) => /^events-.*\.json$/.test(x))) {
    const j = readJSON(path.join(SRC, f));
    known(j, ['events'], f);
    for (const [i, e] of (j.events ?? []).entries()) { const o = checkEvent(e, i, f); claim(o.id, f); got.events.push(o); }
  }
  got.events.sort((a, b) => sinceBang(a) - sinceBang(b) || a.id.localeCompare(b.id));
  for (const f of files.filter((x) => /^species-.*\.json$/.test(x))) {
    const j = readJSON(path.join(SRC, f));
    known(j, ['species'], f);
    for (const [i, s] of (j.species ?? []).entries()) { const o = checkSpecies(s, i, f); claim(o.id, f); got.species.push(o); }
  }
  got.species.sort((a, b) => b.from - a.from || a.id.localeCompare(b.id));
  // Links between them (only checked when both sides are here).
  const species = new Set(got.species.map((s) => s.id));
  if (got.species.length) for (const e of got.events) for (const s of e.species ?? []) if (!species.has(s)) warn(`event ${e.id}: no species "${s}"`);
  // A marker of the Life through time stories: its story and step, so the card can open it.
  const items = new Map((readJSON(path.join(ROOT, 'public/data/life/items.json')).items ?? []).map((x) => [x.id, x]));
  for (const x of [...got.events, ...got.species]) {
    if (!x.item) continue;
    const it = items.get(x.item);
    if (!it) throw new Error(`${x.id}.item: no marker "${x.item}" in the Life through time stories (--list items <words>)`);
    if (it.story != null && it.step != null) x.story = [it.story, it.step];
  }
  if (has('script.json')) {
    const j = readJSON(path.join(SRC, 'script.json'));
    known(j, ['beats'], 'script.json');
    if (!Array.isArray(j.beats) || j.beats.length < 10) throw new Error('script.json beats: at least 10');
    const all = new Set([...got.events.map((e) => e.id), ...got.species.map((s) => s.id)]);
    if (partial && (!got.events.length || !got.species.length)) for (const b of j.beats) if (b.focus) all.add(b.focus);
    let prev = null;
    for (const [i, b] of j.beats.entries()) { prev = checkBeat(b, i, prev, all); claim(b.id, 'script.json'); }
    got.beats = j.beats;
  }
  // The cosmos chapter's narration (v0.46.0): from the Big Bang to the Earth.
  if (has('script-cosmos.json')) {
    const f = 'script-cosmos.json';
    const j = readJSON(path.join(SRC, f));
    known(j, ['beats'], f);
    if (!Array.isArray(j.beats) || j.beats.length < 10) throw new Error(`${f} beats: at least 10`);
    const all = new Set(got.events.map((e) => e.id));
    if (partial && !got.events.length) for (const b of j.beats) if (b.focus) all.add(b.focus);
    let prev = null;
    got.beatsCosmos = j.beats.map((b, i) => { prev = checkBeat(b, i, prev, all, f); claim(b.id, f); return prev; });
  }
  // Coverage: every period has species, firsts are there, the big five are there.
  if (!partial && got.species.length) {
    const ts = readJSON(path.join(ROOT, 'public/data/paleo/timescale.json'));
    for (const u of ts.units.filter((x) => x.rank === 'period' && x.end < 540)) {
      const n = got.species.filter((s) => s.from > u.end && s.to < u.start).length;
      if (n < 6) warn(`only ${n} species lived in the ${u.name_en} (6 or more reads best)`);
    }
  }
  return got;
}

function build(got) {
  const tx = (v) => (v ? { en: v.en, es: v.es } : undefined);
  const deeptime = {
    groups: GROUPS.map(([id, icon, color, en, es]) => ({ id, icon, color, name: { en, es } })),
    kinds: KINDS.map(([id, icon, color, en, es]) => ({ id, icon, color, name: { en, es } })),
    series: SERIES.filter(([id]) => got.vitals.series[id]).map(([id, unit, , , en, es]) => ({ id, unit, name: { en, es }, points: got.vitals.series[id], note: tx(got.vitals.notes[id]) })),
    ice: got.vitals.ice,
    sources: got.vitals.sources,
    events: got.events,
    beats: got.beats,
    beatsCosmos: got.beatsCosmos,
  };
  const species = { species: got.species };
  return { 'deeptime.json': deeptime, 'species.json': species };
}

const stringify = (o) => `${JSON.stringify(o)}\n`;

async function main() {
  const args = process.argv.slice(2);
  const at = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  if (args[0] === '--find') return findTitles(args[1], args.slice(2).join(' '));
  if (args[0] === '--list') {
    const what = args[1], q = args.slice(2).join(' ').toLowerCase();
    if (what === 'items') {
      for (const x of readJSON(path.join(ROOT, 'public/data/life/items.json')).items) if (!q || `${x.id} ${x.name.en} ${x.name.es}`.toLowerCase().includes(q)) console.log(`${x.id}  ${x.name.en} (${x.cat}, ${x.date})`);
      return;
    }
    const got = checkAll(null, true);
    const list = what === 'species' ? got.species.map((s) => `${s.id}  ${s.name.en} ${s.from}–${s.to} Ma`) : what === 'beats' ? got.beats.map((b) => `${b.id}  ${b.ma} Ma`) : got.events.map((e) => `${e.id}  ${e.kind} ${e.ma} Ma  ${e.name.en}`);
    for (const l of list) if (!q || l.toLowerCase().includes(q)) console.log(l);
    return;
  }
  const onlyArg = args.includes('--only') ? (at('--only') && !at('--only').startsWith('--') ? at('--only').split(',') : null) : undefined;
  const checking = onlyArg !== undefined;
  let got;
  try { got = checkAll(onlyArg ?? null, checking); } catch (e) { console.error(`FAIL ${e.message}`); process.exit(1); }
  for (const w of warnings) console.warn(`warn ${w}`);
  warnings.length = 0;
  if (args.includes('--pbdb')) { checkPbdb(got.species); for (const w of warnings) console.warn(`warn ${w}`); warnings.length = 0; }
  if (args.includes('--titles')) {
    const list = [...got.events.map((e) => [e.wiki, `event ${e.id}`]), ...got.species.map((s) => [s.wiki, `${s.id}`])];
    const bad = await checkTitles(list);
    if (bad) process.exit(1);
    console.log(`titles: all ${list.length} items' articles exist`);
  }
  const n = `${got.events.length} events, ${got.species.length} species, ${got.beats.length} beats${got.beatsCosmos.length ? ` and ${got.beatsCosmos.length} in the cosmos` : ''}${got.vitals ? `, ${Object.keys(got.vitals.series).length} vital signs` : ''}`;
  if (checking) { console.log(`ok: ${n} (checked; run without --only to build)`); return; }
  // --draft builds what there is (to look at the app while helpers still write a part); a release builds all four.
  const draft = args.includes('--draft') && !args.includes('--check');
  for (const part of ['vitals', 'events', 'species', 'beats', 'beatsCosmos']) if (!got[part] || (Array.isArray(got[part]) && !got[part].length)) {
    if (draft && part !== 'vitals') { console.warn(`warn --draft: ${part} is missing`); continue; }
    console.error(`FAIL nothing to build yet: ${part} is missing`); process.exit(1);
  }
  const files = build(got);
  if (args.includes('--check')) {
    let stale = 0;
    for (const [f, o] of Object.entries(files)) {
      const p = path.join(OUT, f);
      if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== stringify(o)) { console.error(`FAIL public/data/deeptime/${f} is not what the sources build (run build-deeptime.mjs)`); stale++; }
    }
    if (stale) process.exit(1);
    console.log(`deep time: ${n}, up to date`);
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const [f, o] of Object.entries(files)) fs.writeFileSync(path.join(OUT, f), stringify(o));
  console.log(`deep time: ${n}`);
}

main().catch((e) => { console.error(`FAIL ${e.message}`); process.exit(1); });
