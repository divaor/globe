// Lives on the map (v0.28.0): a life is written in a short format of its own (scripts/data/lives/README.md) and
// turned here into a story like any other: one side (the person), a route from each place to the next, a marker
// for each step, each step's age, and a last step with the places to visit today. build-conflicts.mjs calls
// expandLife() for the "lives" collection before its usual checks.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { km, namedNear } from './gazetteer.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COLL = JSON.parse(fs.readFileSync(path.join(HERE, '_collection.json'), 'utf8'));
export const FIELDS = new Map(COLL.fields.map((f) => [f.id, f]));
export const PAIRS = COLL.pairs ?? [];
/** The year of the "today" step (the places to visit). */
export const TODAY = '2026';
/** What a step is: where they were born, a home, studies, work, a great work, a great moment, a journey... */
export const STEP_KINDS = ['born', 'home', 'study', 'career', 'made', 'moment', 'journey', 'love', 'struggle', 'power', 'honour', 'died'];
/** After the death: the remains moved, a state funeral, a late honour. */
const AFTER_DEATH = new Set(['journey', 'honour']);
const VISIT = { house: '🏠', museum: '🏛️', grave: '🪦', memorial: '🗿', site: '📍' };
const BY = ['land', 'sea', 'air', 'river'];
const TOP = new Set(['id', 'qid', 'name', 'icon', 'field', 'known', 'born', 'died', 'bornAbout', 'diedAbout', 'summary', 'unsure', 'steps', 'visit', 'legacy', 'sources', 'wiki', 'era']);
const STEP = new Set(['date', 'about', 'kind', 'place', 'label', 'at', 'title', 'text', 'details', 'unsure', 'by', 'icon', 'via', 'places']);
const VIS = new Set(['id', 'name', 'at', 'kind', 'text', 'details', 'wiki', 'img', 'whs', 'date']);

let factsCache;
export function facts() {
  if (factsCache === undefined) {
    const f = path.join(HERE, '_facts.json');
    factsCache = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  }
  return factsCache;
}

const isPair = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v)) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
const isText = (v) => v && typeof v === 'object' && typeof v.en === 'string' && v.en.trim() && typeof v.es === 'string' && v.es.trim();
const words = (s) => s.trim().split(/\s+/).length;
const round = (v) => Math.round(v * 1e4) / 1e4;
const parts = (d) => { const m = /^(-?\d+)(?:-(\d\d))?(?:-(\d\d))?/.exec(d); return { y: Number(m[1]) < 0 ? Number(m[1]) + 1 : Number(m[1]), m: m[2] ? Number(m[2]) : 0, d: m[3] ? Number(m[3]) : 0 }; };

/**
 * Their age at a date: `age`, and `lo` when the date does not say whether the birthday had come ("1929": 42 or 43);
 * `loose` when the birth is known by its year only.
 */
export function ageAt(born, date) {
  const b = parts(born), s = parts(date);
  let age = s.y - b.y, lo = age;
  if (b.m && s.m) {
    if (s.m < b.m || (s.m === b.m && b.d && s.d && s.d < b.d)) { age--; lo--; } else if (s.m === b.m && !(b.d && s.d)) lo = age - 1;
  } else if (b.m && !s.m) lo = age - 1;
  return { age, lo: Math.max(0, lo), loose: !b.m };
}

const rad = Math.PI / 180;
/** A point `f` of the way along the great circle from a to b. */
function between(a, b, f) {
  const v = (p) => [Math.cos(p[1] * rad) * Math.cos(p[0] * rad), Math.cos(p[1] * rad) * Math.sin(p[0] * rad), Math.sin(p[1] * rad)];
  const va = v(a), vb = v(b);
  const dot = Math.min(1, Math.max(-1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const w = Math.acos(dot);
  if (w < 1e-9) return [...b];
  const ka = Math.sin((1 - f) * w) / Math.sin(w), kb = Math.sin(f * w) / Math.sin(w);
  const p = [ka * va[0] + kb * vb[0], ka * va[1] + kb * vb[1], ka * va[2] + kb * vb[2]];
  return [round(Math.atan2(p[1], p[0]) / rad), round(Math.asin(Math.max(-1, Math.min(1, p[2]))) / rad)];
}
/** The middle of some points (the mean of their directions) and how far the farthest is from it, in km. */
function spread(pts) {
  let x = 0, y = 0, z = 0;
  for (const p of pts) { x += Math.cos(p[1] * rad) * Math.cos(p[0] * rad); y += Math.cos(p[1] * rad) * Math.sin(p[0] * rad); z += Math.sin(p[1] * rad); }
  const n = Math.hypot(x, y, z) || 1;
  const c = [round(Math.atan2(y, x) / rad), round(Math.asin(z / n) / rad)];
  return { c, far: Math.max(0, ...pts.map((p) => km(c, p))) };
}
/** The zoom that shows about `span` km around the camera's point on a computer (a phone widens it on its own). */
const zoomFor = (span) => (span < 40 ? 8.5 : span < 150 ? 7 : span < 400 ? 5.8 : span < 900 ? 4.6 : span < 1800 ? 3.6 : span < 3500 ? 2.8 : span < 6000 ? 2.2 : span < 9000 ? 1.8 : 1.5);

const SHIP = (y) => (y < 1840 ? '⛵' : '🚢');
function eraOf(born, died) {
  const y = (parts(born).y + parts(died).y) / 2;
  return y < 500 ? 'ancient' : y < 1500 ? 'medieval' : y < 1800 ? 'early-modern' : y < 1945 ? 'modern' : 'contemporary';
}

/**
 * Checks a life and turns it into a story. `parseDate` is the stories' date reader; `lint` adds the doubts
 * (places that no nearby town explains, dates that differ from Wikidata's, texts too long) as warnings.
 */
export function expandLife(c, file, { parseDate, lint = false }) {
  const where = path.basename(file);
  const fail = (m) => { throw new Error(`${where}: ${m}`); };
  const warn = (m) => { if (lint) console.warn(`  warn ${c.id}: ${m}`); };
  if (c.id !== path.basename(file, '.json')) fail(`"id" must be the file name ("${path.basename(file, '.json')}")`);
  for (const k of Object.keys(c)) if (!TOP.has(k)) fail(`unknown field "${k}" (${[...TOP].join(', ')})`);
  if (!/^Q\d+$/.test(c.qid ?? '')) fail('"qid" is the person\'s Wikidata id, such as "Q5588"');
  for (const k of ['name', 'known', 'summary', 'legacy']) if (!isText(c[k])) fail(`"${k}" needs "en" and "es"`);
  if (c.unsure != null && !isText(c.unsure)) fail('"unsure" needs "en" and "es"');
  if (typeof c.icon !== 'string' || !c.icon) fail('"icon" (an emoji) is missing');
  const field = FIELDS.get(c.field);
  if (!field) fail(`"field" is one of ${[...FIELDS.keys()].join(', ')}`);
  if (c.died == null) fail('"died" is missing: lives are written only for people who have died');
  const tb = parseDate(c.born, `${where} born`), td = parseDate(c.died, `${where} died`);
  if (td <= tb) fail('"died" must be after "born"');
  if (ageAt(c.born, c.died).age > 110) fail(`a life of ${ageAt(c.born, c.died).age} years: check "born" and "died"`);
  if (!Array.isArray(c.steps) || c.steps.length < 4 || c.steps.length > 16) fail('a life has 4 to 16 "steps" (8 to 14 is best)');
  if (!Array.isArray(c.sources) || c.sources.length < 2) fail('at least two "sources"');
  if (c.visit != null && (!Array.isArray(c.visit) || c.visit.length > 6)) fail('"visit" is a list of at most 6 places');

  const f = facts()[c.id];
  if (f) {
    if (f.qid !== c.qid) fail(`"qid" ${c.qid} is not this person's (${f.qid} in _facts.json)`);
    const same = (mine, theirs) => theirs.some((d) => { const n = Math.min(mine.length, d.date.length); return mine.slice(0, n) === d.date.slice(0, n); });
    if (f.born?.length && !same(c.born, f.born) && !c.bornAbout) warn(`born ${c.born}, but Wikidata says ${f.born.map((d) => d.date).join(' or ')}: check it (or set "bornAbout": true when the sources are unsure)`);
    if (f.died?.length && !same(c.died, f.died) && !c.diedAbout) warn(`died ${c.died}, but Wikidata says ${f.died.map((d) => d.date).join(' or ')}: check it (or set "diedAbout": true)`);
  } else warn('not in _facts.json (no check against Wikidata)');
  if (lint) {
    if (c.summary.en.length > 280) warn(`summary is ${c.summary.en.length} characters (aim for 240 or less)`);
    if (c.known.en.length > 60) warn(`"known" is long (${c.known.en.length} characters): a few words, such as "Mexican painter"`);
    if (words(c.legacy.en) > 90) warn(`legacy is ${words(c.legacy.en)} words (2 or 3 sentences)`);
  }

  let died = -1;
  const steps = [];
  const year = (d) => parts(d).y;
  c.steps.forEach((st, i) => {
    const w = `steps[${i}]`;
    for (const k of Object.keys(st)) if (!STEP.has(k)) fail(`${w}: unknown field "${k}" (${[...STEP].join(', ')})`);
    if (!STEP_KINDS.includes(st.kind)) fail(`${w}.kind: one of ${STEP_KINDS.join(', ')}`);
    if (!isText(st.place)) fail(`${w}.place: where, as a reader would say it today ({ "en": "Florence, Italy", "es": "Florencia, Italia" })`);
    if (st.label != null && !isText(st.label)) fail(`${w}.label needs "en" and "es"`);
    if (!isPair(st.at)) fail(`${w}.at must be [lon, lat]`);
    if (st.unsure != null && !isText(st.unsure)) fail(`${w}.unsure needs "en" and "es"`);
    if (st.about != null && typeof st.about !== 'boolean') fail(`${w}.about is true when the date is approximate`);
    if (st.by != null && !BY.includes(st.by)) fail(`${w}.by: how they got here, one of ${BY.join(', ')}`);
    if (st.via != null && (!Array.isArray(st.via) || !st.via.every(isPair))) fail(`${w}.via: a list of [lon, lat] points on the way here`);
    const t = parseDate(st.date, `${where} ${w}.date`);
    if (i === 0) {
      if (st.kind !== 'born') fail(`${w}: the first step is the birth ("kind": "born")`);
      if (st.date !== c.born) fail(`${w}: the birth's date (${st.date}) must be "born" (${c.born})`);
    } else if (st.kind === 'born') fail(`${w}: only the first step is "born"`);
    if (st.kind === 'died') {
      if (died >= 0) fail(`${w}: a second "died" step`);
      if (st.date !== c.died) fail(`${w}: the death's date (${st.date}) must be "died" (${c.died})`);
      died = i;
    } else if (died >= 0 && !AFTER_DEATH.has(st.kind)) fail(`${w}: after the death, a step is a "journey" (the remains moved) or an "honour"`);
    else if (died < 0 && t > td + 1e-9) fail(`${w}: ${st.date} is after the death (${c.died})`);
    if (t < tb - 1e-9) fail(`${w}: ${st.date} is before the birth (${c.born})`);
    if (lint) {
      if (st.details && (words(st.details.en) < 20 || words(st.details.en) > 130)) warn(`${w}.details is ${words(st.details.en)} words (40 to 110 is best)`);
      try {
        const near = namedNear([st.place.en, st.place.es, st.label?.en ?? '', st.label?.es ?? ''], st.at, 35);
        if (!near.ok) warn(`${w}: "${st.place.en}" at [${st.at.join(', ')}]: no town of that name within 35 km${near.nearest ? ` (the nearest is ${near.nearest.name}, ${near.nearest.cc}, ${near.nearest.d.toFixed(0)} km away)` : ' (no town at all: is it in the sea?)'}. Check the coordinates, or name the nearest town in "place".`);
      } catch (e) { if (i === 0) console.warn(`  (no gazetteer: ${e.message})`); }
    }
    steps.push({ st, t });
  });
  if (died < 0) fail('no step with "kind": "died"');
  if (f && lint) {
    const check = (what, at, label) => {
      const known = f.places.filter((p) => p.what === what && p.at);
      if (known.length && !known.some((p) => km(p.at, at) <= 80)) warn(`${label} at [${at.join(', ')}], but Wikidata has ${known.map((p) => `${p.name.en} [${p.at.join(', ')}]`).join(' or ')}: check it (or explain in "unsure")`);
    };
    check('born', c.steps[0].at, 'born');
    check('died', c.steps[died].at, 'died');
  }

  const side = { id: 'life', name: c.name, color: field.color };
  const out = [];
  let prev = null;
  for (const { st } of steps) {
    const o = { date: st.date, title: st.title, text: st.text };
    if (st.details) o.details = st.details;
    o.place = st.place;
    o.at = st.at.map(round);
    o.label = st.label ?? { en: st.place.en.split(',')[0].trim(), es: st.place.es.split(',')[0].trim() };
    o.lk = st.kind;
    // Their age, while they lived: "42–43" for a step dated by its year only, "about" when the birth is not sure.
    if (steps[died].st === st || parseDate(st.date, '') <= td) {
      const a = st.date === c.born ? { age: 0, lo: 0, loose: false } : ageAt(c.born, st.date);
      o.age = a.age;
      if (a.lo !== a.age) o.age0 = a.lo;
      if (a.loose || c.bornAbout) o.ageAbout = true;
    }
    if (st.about) o.about = true;
    if (st.unsure) o.unsure = st.unsure;
    const d = prev ? km(prev, st.at) : 0;
    if (prev && d > 15) {
      const by = st.by ?? 'land';
      const mv = { side: 'life', path: [prev, ...(st.via ?? []), st.at].map((p) => p.map(round)), by };
      const ic = st.icon ?? (by === 'sea' ? SHIP(year(st.date)) : by === 'air' ? '✈️' : by === 'river' ? '🛶' : null);
      if (ic) mv.icon = ic;
      o.moves = [mv];
      o.camera = { lon: between(prev, st.at, 0.62)[0], lat: between(prev, st.at, 0.62)[1], zoom: zoomFor(d * 0.75) };
    } else o.camera = { lon: round(st.at[0]), lat: round(st.at[1]), zoom: prev ? 7 : 5.5 };
    o.places = [
      // The step's own marker carries its title (the map already names the town) and opens the step's text.
      { name: st.title, at: st.at.map(round), cat: st.kind, type: 'place', date: st.date, place: st.place, text: st.text },
      ...(st.places ?? []),
    ];
    out.push(o);
    prev = st.at;
  }
  if (c.visit?.length) {
    c.visit.forEach((v, i) => {
      const w = `visit[${i}]`;
      for (const k of Object.keys(v)) if (!VIS.has(k)) fail(`${w}: unknown field "${k}" (${[...VIS].join(', ')})`);
      if (!isText(v.name) || !isText(v.text)) fail(`${w}: "name" and "text" need "en" and "es"`);
      if (!isPair(v.at)) fail(`${w}.at must be [lon, lat]`);
      if (!VISIT[v.kind]) fail(`${w}.kind: one of ${Object.keys(VISIT).join(', ')}`);
    });
    const list = (l) => { const n = c.visit.map((v) => v.name[l]); return n.length > 1 ? `${n.slice(0, -1).join('; ')}${l === 'en' ? '; and ' : '; y '}${n[n.length - 1]}` : n[0]; };
    const sp = spread(c.visit.map((v) => v.at));
    out.push({
      date: TODAY, aftermath: true, lk: 'visit',
      title: { en: 'In their footsteps today', es: 'Tras sus pasos hoy' },
      text: { en: `Places you can visit: ${list('en')}.`, es: `Lugares que puedes visitar: ${list('es')}.` },
      camera: { lon: sp.c[0], lat: sp.c[1], zoom: Math.min(8.5, zoomFor(sp.far * 1.6 + 20)) },
      places: c.visit.map((v) => {
        const { kind, ...rest } = v;
        return { ...rest, at: v.at.map(round), cat: 'visit', type: 'site', icon: VISIT[kind], date: v.date ?? TODAY };
      }),
    });
  }
  const all = spread(c.steps.map((s) => s.at));
  const wiki = c.wiki ?? (f?.wiki?.en ? { en: f.wiki.en, es: f.wiki.es ?? f.wiki.en } : null);
  const life = { born: c.born, died: c.died, field: c.field, qid: c.qid, place: c.steps[0].place, at: c.steps[0].at.map(round) };
  if (c.bornAbout) life.bornAbout = true;
  if (c.diedAbout) life.diedAbout = true;
  if (wiki) life.wiki = wiki;
  if (c.unsure) life.unsure = c.unsure;
  // Where each step happens (null for the places to visit today): a city's guide lists the lives that pass through it.
  life.path = out.map((o) => (o.at ? o.at.map((v) => Math.round(v * 100) / 100) : null));
  return {
    id: c.id, name: c.name, icon: c.icon, era: c.era ?? eraOf(c.born, c.died), region: c.known, start: c.born, end: out[out.length - 1].date,
    summary: c.summary, camera: { lon: all.c[0], lat: all.c[1], zoom: Math.min(6, zoomFor(all.far * 1.3 + 30)) },
    sides: [side], trail: true, life, steps: out, outcome: c.legacy, sources: c.sources,
  };
}
