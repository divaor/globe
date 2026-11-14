// Checks the researched space data and writes what the app loads:
//   scripts/data/space/_landings.json → public/data/worlds/landings.json (every landing on another world, with routes)
//   scripts/data/space/_worlds.json   → public/data/worlds/facts.json    (facts about each world, for cards and the orrery)
// (public/data/space/ holds the Space exploration stories, built by build-conflicts.mjs.)
//
//   node scripts/data/space/build-space.mjs [--check]     (--check: validate and compare, write nothing)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT = path.join(ROOT, 'public/data/worlds');
const check = process.argv.includes('--check');
const read = (f) => JSON.parse(fs.readFileSync(path.join(HERE, f), 'utf8'));
const errors = [];
const fail = (m) => errors.push(m);
const isText = (t) => t && typeof t === 'object' && typeof t.en === 'string' && t.en && typeof t.es === 'string' && t.es;
const isPt = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && isFinite(v)) && p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90;
const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const WORLDS_WITH_MAPS = new Set(fs.readdirSync(path.join(ROOT, 'public/data/worlds')).filter((f) => /-2k\.jpg$/.test(f) && !/-(elev|clouds)-/.test(f)).map((f) => f.replace('-2k.jpg', '')));
const KINDS = ['crewed', 'lander', 'rover', 'helicopter', 'sample', 'impact', 'probe', 'crash'];
const round = (p) => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5];

// ---- landings
const L = read('_landings.json');
const ids = new Set();
const landings = L.landings.map((l, i) => {
  const w = `_landings.json landings[${i}] (${l.id})`;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(l.id ?? '')) fail(`${w}: "id" must be lowercase letters, digits and hyphens`);
  if (ids.has(l.id)) fail(`${w}: id twice`);
  ids.add(l.id);
  if (!WORLDS_WITH_MAPS.has(l.world)) fail(`${w}: "world" ${l.world} has no map`);
  if (!isText(l.name)) fail(`${w}: "name" needs en and es`);
  if (!isPt(l.at)) fail(`${w}: "at" must be [lon, lat] in range`);
  if (!DATE.test(l.date ?? '')) fail(`${w}: "date" is YYYY-MM-DD`);
  if (l.end != null && (!DATE.test(l.end) || l.end < l.date)) fail(`${w}: "end" is a date after "date"`);
  if (!KINDS.includes(l.kind)) fail(`${w}: "kind" is one of ${KINDS.join(', ')}`);
  if (!isText(l.agency)) fail(`${w}: "agency" needs en and es`);
  if (!isText(l.text)) fail(`${w}: "text" needs en and es`);
  for (const k of ['craft', 'site', 'firsts', 'details', 'routeNote']) if (l[k] != null && !isText(l[k])) fail(`${w}: "${k}" needs en and es`);
  if (l.route != null && (!Array.isArray(l.route) || l.route.length < 2 || !l.route.every(isPt))) fail(`${w}: "route" is a list of [lon, lat]`);
  if (l.wiki != null && (typeof l.wiki.en !== 'string' || !l.wiki.en)) fail(`${w}: "wiki" needs at least an English title`);
  const o = { ...l, at: round(l.at) };
  if (l.route) o.route = l.route.map(round);
  delete o.sources;
  return o;
});
landings.sort((a, b) => a.world.localeCompare(b.world) || a.date.localeCompare(b.date));

// ---- worlds
const W = read('_worlds.json');
const NEED = ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'ceres', 'vesta', 'jupiter', 'io', 'europa', 'ganymede', 'callisto', 'saturn', 'titan', 'enceladus', 'uranus', 'neptune', 'triton', 'pluto', 'charon', 'eris', 'haumea', 'makemake', 'halley'];
const have = new Set(W.worlds.map((x) => x.id));
for (const id of NEED) if (!have.has(id)) fail(`_worlds.json: "${id}" is missing`);
const worlds = W.worlds.map((x, i) => {
  const w = `_worlds.json worlds[${i}] (${x.id})`;
  if (!isText(x.name)) fail(`${w}: "name" needs en and es`);
  for (const k of ['radius', 'mass', 'gravity', 'day', 'solarDay', 'year', 'distance', 'moons']) if (x[k] != null && (typeof x[k] !== 'number' || !isFinite(x[k]))) fail(`${w}: "${k}" must be a number`);
  for (const k of ['temp', 'atmosphere', 'discovered', 'firstVisit', 'text', 'wow']) if (x[k] != null && !isText(x[k])) fail(`${w}: "${k}" needs en and es`);
  for (const [j, p] of (x.places ?? []).entries()) { if (!isText(p.name) || !isPt(p.at) || !isText(p.text)) fail(`${w}.places[${j}]: name, at and text`); }
  const o = { ...x };
  delete o.sources;
  return o;
});

if (errors.length) { for (const e of errors) console.error(`FAIL ${e}`); process.exit(1); }
const files = { 'landings.json': { source: 'Atlas Globe research (sources in scripts/data/space/_landings.json)', landings }, 'facts.json': { source: 'NASA planetary fact sheets, JPL and the IAU (sources in scripts/data/space/_worlds.json)', worlds } };
let stale = 0;
for (const [f, v] of Object.entries(files)) {
  const p = path.join(OUT, f), text = JSON.stringify(v);
  if (check) { if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== text) { console.error(`FAIL public/data/worlds/${f} is out of date; run node scripts/data/space/build-space.mjs`); stale++; } }
  else { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(p, text); }
}
if (stale) process.exit(1);
const per = {};
for (const l of landings) per[l.world] = (per[l.world] ?? 0) + 1;
console.log(`ok   space: ${landings.length} landings (${Object.entries(per).map(([k, n]) => `${k} ${n}`).join(', ')}), ${landings.filter((l) => l.route).length} routes; ${worlds.length} worlds`);
