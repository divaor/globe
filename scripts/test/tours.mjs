// Checks the guided tours (src/learn/tours.ts): every stop that opens a story step points at a story and
// a step that exist, stops fly to real places, and every text is there in English and Spanish.
// Usage: node scripts/test/tours.mjs [--list] [file.ts ...]
//   With files, checks the tours they export as TOURS (drafts) instead of the app's.
// Node runs the TypeScript files directly (type stripping, Node 22.18 or later).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIRS = { wars: 'conflicts', eras: 'eras', food: 'food', structures: 'structures', people: 'people', life: 'life', games: 'games', journeys: 'journeys', beliefs: 'beliefs', writing: 'writing', plagues: 'plagues', disasters: 'disasters', music: 'music', books: 'books', art: 'art', inventions: 'inventions', heritage: 'heritage', space: 'space' };
const args = process.argv.slice(2);
const list = args.includes('--list');
const files = args.filter((a) => !a.startsWith('--'));

let tours = [];
if (files.length) {
  for (const f of files) { const m = await import(pathToFileURL(path.resolve(f)).href); tours.push(...(m.TOURS ?? m.SKY_TOURS)); }
} else {
  tours = (await import(pathToFileURL(path.join(ROOT, 'src/learn/tours.ts')).href)).TOURS;
}

const stories = new Map();
const story = (kind, id) => {
  const key = `${kind}/${id}`;
  if (!stories.has(key)) {
    const f = path.join(ROOT, 'public/data', DIRS[kind] ?? '?', `${id}.json`);
    stories.set(key, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
  }
  return stories.get(key);
};
const km = (a, b) => {
  const r = Math.PI / 180;
  const c = Math.sin(a[1] * r) * Math.sin(b[1] * r) + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.cos((a[0] - b[0]) * r);
  return 6371 * Math.acos(Math.max(-1, Math.min(1, c)));
};

const readJSON = (f) => { const p = path.join(ROOT, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
let targets = null;
/** Everything a sky stop can look at: constellations, stars by HIP, deep-sky objects, the Local Group, the Sun, Moon and planets. */
const skyTargets = () => {
  if (targets) return targets;
  targets = new Set(['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);
  for (const c of readJSON('public/data/sky/constellations.json')?.cons ?? []) targets.add(c.id);
  for (const s of readJSON('public/data/sky/stars.json')?.stars ?? []) targets.add(String(s[0]));
  for (const o of readJSON('public/data/sky/objects.json')?.objects ?? []) targets.add(o.id);
  const g = readJSON('public/data/sky/galaxy.json');
  for (const x of [...(g?.nearby ?? []), ...(g?.galaxy ?? []), ...(g?.localGroup ?? [])]) targets.add(x.id);
  return targets;
};

let errors = 0, warnings = 0;
const err = (m) => { errors++; console.log(`ERROR ${m}`); };
const warn = (m) => { warnings++; console.log(`warn  ${m}`); };
const names = new Set();
for (const tour of tours) {
  const tn = tour.en;
  if (!tour.en || !tour.es || !tour.icon) err(`a tour has no name or icon (${tn})`);
  if (names.has(tn)) err(`two tours are called "${tn}"`);
  names.add(tn);
  if (!tour.steps?.length) { err(`${tn}: no stops`); continue; }
  const flies = tour.steps.map((s) => s.fly).filter(Boolean);
  // A city tour's stops stay near the city: the middle of its stops.
  const mid = flies.length ? [flies.map((f) => f[0]).sort((a, b) => a - b)[flies.length >> 1], flies.map((f) => f[1]).sort((a, b) => a - b)[flies.length >> 1]] : null;
  if (list) console.log(`\n${tour.icon} ${tn} / ${tour.es} (${tour.steps.length} stops${tour.group ? `, ${tour.group}` : ''})`);
  tour.steps.forEach((s, i) => {
    const at = `${tn} #${i + 1}`;
    for (const k of ['title_en', 'title_es', 'en', 'es']) if (!s[k] || !String(s[k]).trim()) err(`${at}: no ${k}`);
    for (const k of ['en', 'es']) if (s[k] && s[k].length > 280) warn(`${at}: the ${k} text is long (${s[k].length} characters)`);
    if (s.fly) {
      const [lon, lat, z] = s.fly;
      if (!(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90 && z > 0 && z <= 60)) err(`${at}: fly ${JSON.stringify(s.fly)} is not a place`);
      if (tour.group === 'cities' && mid && km(mid, [lon, lat]) > 80) warn(`${at}: ${Math.round(km(mid, [lon, lat]))} km from the middle of the tour`);
    }
    let label = '';
    if (s.story) {
      const [kind, id, n] = s.story;
      if (!DIRS[kind]) { err(`${at}: no collection "${kind}"`); return; }
      const st = story(kind, id);
      if (!st) { err(`${at}: no story ${kind}/${id}`); return; }
      if (!(Number.isInteger(n) && n >= 1 && n <= st.steps.length)) { err(`${at}: ${kind}/${id} has no step ${n} (it has ${st.steps.length})`); return; }
      const step = st.steps[n - 1];
      label = `${kind}/${id} ${n}: ${step.date} · ${step.title.en}`;
      // The stop should look at something the step shows: one of its items, events or battles, or its camera.
      if (s.fly) {
        const pts = [];
        for (const x of step.show ?? []) { const it = typeof x === 'number' ? st.items?.[x] : st.items?.find((y) => y.id === x); if (it?.at) pts.push(it.at); }
        for (const e of [...(step.events ?? []), ...(step.battles ?? [])]) if (e.at) pts.push(e.at);
        if (step.camera?.lon != null) pts.push([step.camera.lon, step.camera.lat]);
        const d = pts.length ? Math.min(...pts.map((p) => km(p, s.fly))) : 0;
        if (d > 150) warn(`${at}: flies ${Math.round(d)} km from anything ${kind}/${id} step ${n} shows`);
      }
    } else if (s.world) {
      if (!fs.existsSync(path.join(ROOT, 'public/data/worlds', `${s.world}-2k.jpg`))) err(`${at}: no world "${s.world}"`);
      label = `world ${s.world}${s.map ? ` (${s.map})` : ''}`;
    } else if (s.orrery) {
      if (!/^-?\d{1,4}-\d{2}-\d{2}$/.test(s.orrery.date ?? '')) err(`${at}: orrery date ${s.orrery.date} is not YYYY-MM-DD`);
      label = `solar system ${s.orrery.date}`;
    } else if (s.sky) {
      // A sky stop looks at a constellation, a star (HIP), a deep-sky object or a body that exists.
      const t = s.sky.target;
      if (t && !skyTargets().has(t)) err(`${at}: sky target "${t}" is not a constellation, star (HIP), object or body`);
      if (s.sky.time && isNaN(new Date(s.sky.time).getTime())) err(`${at}: sky time ${s.sky.time} is not a date`);
      if (s.sky.place && !(Math.abs(s.sky.place.lat) <= 90 && Math.abs(s.sky.place.lon) <= 180)) err(`${at}: sky place out of range`);
      label = `sky ${t ?? ''}${s.sky.place ? ` from ${s.sky.place.label ?? `${s.sky.place.lat},${s.sky.place.lon}`}` : ''}`;
    } else if (s.galaxy) {
      if (!['nearby', 'neighbourhood', 'galaxy', 'local'].includes(s.galaxy) && !skyTargets().has(s.galaxy)) err(`${at}: galaxy target "${s.galaxy}" is unknown`);
      label = `galaxy ${s.galaxy}`;
    } else if (s.elements) {
      const els = readJSON('public/data/sky/elements.json')?.elements ?? [];
      if (s.elements.mark && !els.some((e) => e.symbol === s.elements.mark)) err(`${at}: no element "${s.elements.mark}"`);
      if (s.elements.origin && !els.some((e) => (e.origin?.[s.elements.origin] ?? 0) > 0)) err(`${at}: no element made by "${s.elements.origin}"`);
      label = `elements ${s.elements.origin ?? ''} ${s.elements.mark ?? ''}`;
    } else if (s.mode) label = `mode ${s.mode}`;
    else label = `map ${s.projection ?? ''} ${(s.stack ?? []).join('+')}`;
    if (list) console.log(`  ${String(i + 1).padStart(2)}. ${s.icon ?? ''}${s.title_en} | ${label}${s.fly ? ` | fly ${s.fly.join(', ')}` : ''}`);
  });
}
console.log(`\n${tours.length} tours, ${tours.reduce((n, t) => n + t.steps.length, 0)} stops: ${errors} errors, ${warnings} warnings`);
process.exit(errors ? 1 : 0);
