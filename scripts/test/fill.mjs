// Checks Fill the map (src/fill/logic.ts and public/data/fill/clues.json, v0.35.0) with Node: the scopes (the world,
// continents, regions), the stars, the order of the questions (biggest first for people and area), the clue ladders
// (three, hard to easy, of the chosen theme when there are any, none naming its country), the language prompts, the
// next region and the region of the day.
// Usage: node scripts/test/fill.mjs
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { rolldown } = await import('rolldown');
const bundle = await rolldown({ input: path.join(ROOT, 'src/fill/logic.ts'), platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
const F = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };

const deck = J('public/data/master/deck.json').countries.filter((c) => !c.t);
const meta = J('public/data/base/countries-meta.json');
const attrs = J('public/data/attributes/countries.json').data;
const clues = J('public/data/fill/clues.json').clues;
const units = deck.map((c) => ({ id: c.id, ct: c.ct, sr: meta[c.id].sr, pop: attrs[c.id]?.population ?? 0, area: attrs[c.id]?.area_km2 ?? 0, langs: attrs[c.id]?.languages ?? [], at: [meta[c.id].lx, meta[c.id].ly], land: c.land }));
const by = new Map(units.map((u) => [u.id, u]));

// Scopes.
const regions = F.regionsOf(units);
const world = F.inScope(units, 'world'), sa = F.inScope(units, 'r:South America'), eu = F.inScope(units, 'EU');
check(world.length === 195 && sa.length === 12 && eu.length >= 40 && regions.length === 22 && regions.every((r) => F.CONTS.includes(r.ct)),
  `scopes: the world ${world.length}, Europe ${eu.length}, South America ${sa.length}; ${regions.length} regions, each in a continent`);
check(F.CONTS.reduce((a, ct) => a + F.inScope(units, ct).length, 0) === 195, 'every country is in exactly one continent');

// Stars and order.
check([0, 1, 2, 3].map(F.starsFor).join() === '3,2,1,0' && F.TRIES === 3, 'stars: 3 at the first try, 2, 1, and 0 when shown after three misses');
const ppl = F.order('people', sa, by, F.rng(1));
check(ppl[0] === 'BRA' && ppl.every((id, i) => i === 0 || by.get(ppl[i - 1]).pop >= by.get(id).pop), `most people first: ${ppl.slice(0, 3).join(', ')}…`);
const area = F.order('area', world, by, F.rng(1));
check(area[0] === 'RUS' && area[1] === 'CAN', `largest first: ${area.slice(0, 3).join(', ')}…`);
check(F.order('countries', sa, by, F.rng(5)).join() === F.order('countries', sa, by, F.rng(5)).join() && new Set(F.order('countries', sa, by, F.rng(5))).size === 12, 'other categories: shuffled, the same for the same seed');

// Clues: every country has at least three; a ladder of three, hard to easy; the theme's own first; none names its country.
const short = deck.filter((c) => (clues[c.id] ?? []).length < 3).map((c) => c.id);
check(!short.length, `every country has three clues or more${short.length ? ` (not: ${short.join(' ')})` : ''}`);
let bad = [];
for (const c of deck) for (const th of F.THEMES) {
  const l = F.ladder(clues[c.id], th, F.rng(3));
  if (l.length !== 3 || new Set(l).size !== 3 || l[0].l > l[2].l) bad.push(`${c.id}/${th}`);
}
check(!bad.length, `a ladder of three different clues, hard to easy, for every country and theme${bad.length ? ` (not: ${bad.slice(0, 8).join(' ')})` : ''}`);
const names = (id) => [meta[id].n, meta[id].es, meta[id].sn, meta[id].ses].filter((x) => x && x.length > 3).map((x) => x.toLowerCase());
const leaks = deck.flatMap((c) => clues[c.id].filter((x) => x.k !== 'capital' && names(c.id).some((n) => x.en.toLowerCase().includes(n) || x.es.toLowerCase().includes(n))).map((x) => `${c.id}: ${x.en}`));
check(!leaks.length, `no clue names its own country${leaks.length ? ` (${leaks.slice(0, 4).join(' | ')})` : ''}`);
const arg = F.ladder(clues.ARG, 'people', F.rng(1));
check(arg.every((x) => x.t === 'people') && /Messi|Guevara|Francis|Borges|Maradona/.test(arg.map((x) => x.en).join(' ')), `the People theme asks about people first (Argentina: ${arg.map((x) => x.en.replace('Born here: ', '')).join('; ')})`);
check(clues.MEX.some((x) => x.k === 'peak' && x.m === 5636 && x.en.includes('{m}')), 'heights are kept as numbers, written the reader\'s way');

// Languages: any country speaking it is right.
const lp = F.langPrompt(sa, by, F.rng(2));
check(lp && lp.ids.length >= 1 && lp.ids.every((id) => by.get(id).langs.includes(lp.lang)), `a language prompt (${lp?.lang}): ${lp?.ids.join(', ')}`);

// The next region, and the region of the day.
const nx = F.nextRegion(regions, 'r:South America', () => false, (id) => by.get(id)?.at);
check(['r:Central America', 'r:Caribbean'].includes(nx?.id), `after South America comes a region nearby (${nx?.name})`);
const d1 = F.dailyPick('2026-11-18', regions), d2 = F.dailyPick('2026-11-18', regions), d3 = F.dailyPick('2026-11-19', regions);
const size = regions.find((r) => r.id === d1.scope).ids.length;
check(JSON.stringify(d1) === JSON.stringify(d2) && ['countries', 'capitals', 'flags'].includes(d1.cat) && size >= 5 && size <= 15 && JSON.stringify(d1) !== JSON.stringify(d3),
  `the region of the day: the same for everyone (${d1.scope.slice(2)}, ${d1.cat}; tomorrow ${d3.scope.slice(2)}, ${d3.cat})`);


// ---- Fill the states (v0.38.0): src/fill/states-logic.ts and public/data/states/states.json.
{
  const b2 = await rolldown({ input: path.join(ROOT, 'src/fill/states-logic.ts'), platform: 'neutral', logLevel: 'silent' });
  const { output: o2 } = await b2.generate({ format: 'esm' });
  const S = await import(`data:text/javascript;base64,${Buffer.from(o2[0].code).toString('base64')}`);
  const data = J('public/data/states/states.json').countries;
  const index = J('public/data/regions/index.json').countries;
  check(S.WITH_FACTS.length === 12 && S.WITH_FACTS.every((a3) => data[a3] && index.some((c) => c.id === a3)) && Object.keys(data).length === 12,
    `twelve countries with capitals, area and people, each one of the ${index.length} of the States and provinces quiz`);
  check(S.catsOf('MEX', data).join() === 'names,capitals,people,area' && S.catsOf('FRA', data).join() === 'names',
    'Mexico by name, capital and biggest first; France by name only');
  const mx = data.MEX, ids = Object.keys(mx);
  const caps = S.eligible('capitals', ids, mx);
  check(ids.length === 32 && caps.length === 31 && !caps.includes('MX-DIF') && S.eligible('names', ids, mx).length === 32,
    `Mexico: 32 states by name, 31 by capital (Mexico City is a city of its own)`);
  const ppl = S.stateOrder('people', ids, mx, F.rng(1)), area = S.stateOrder('area', ids, mx, F.rng(1));
  check(ppl[0] === 'MX-MEX' && area[0] === 'MX-CHH' && mx[ppl[0]].p >= mx[ppl[1]].p,
    `biggest first: the State of Mexico by people (${(mx['MX-MEX'].p / 1e6).toFixed(1)} million), Chihuahua by area (${mx['MX-CHH'].a.toLocaleString('en')} km²)`);
  check(mx['MX-MEX'].c[0] === 'Toluca' && mx['MX-MEX'].b?.[0] === 'Ecatepec' && mx['MX-JAL'].c[0] === 'Guadalajara' && data.USA['US-CA'].c[0] === 'Sacramento' && data.USA['US-CA'].b?.[0] === 'Los Angeles'
    && data.ESP['ES-CanaryIs'].c[5]?.[0]?.includes('Las Palmas') && data.DEU['DE-BE'].s === 1 && data.IND['IN-MH'].c[0] === 'Mumbai',
    'the capitals: Toluca (Ecatepec the biggest), Guadalajara, Sacramento (Los Angeles), Santa Cruz shared with Las Palmas, Berlin a city of its own, Mumbai');
  let bad = [];
  for (const [a3, st] of Object.entries(data)) for (const [id, x] of Object.entries(st)) {
    if (!x.c?.[0] || !(x.a > 0) || !(x.p > 0) || Math.abs(x.c[2]) > 180 || Math.abs(x.c[3]) > 90) bad.push(`${a3}/${id}`);
    for (const o of x.o) if (!o[0] || o[0] === x.c[0]) bad.push(`${a3}/${id} ${o[0]}`);
  }
  check(!bad.length, `every state of the twelve has a capital with a point, area and people, and other cities not its capital${bad.length ? `: ${bad.slice(0, 5).join(', ')}` : ''}`);
  check(S.direction([-117, 32], [[-118, 14], [-86, 33]]) === 'nw' && S.direction([-88, 20], [[-118, 14], [-86, 33]]) === 'se' && S.direction([-102, 23], [[-118, 14], [-86, 33]]) === 'c',
    'the hint after a miss: Baja California in the north-west, Yucatán in the south-east, Zacatecas in the middle');
  const d1 = S.dailyCountry('2026-11-18'), d2 = S.dailyCountry('2026-11-18');
  const days = new Set(Array.from({ length: 30 }, (_, k) => S.dailyCountry(`2026-12-${String(k + 1).padStart(2, '0')}`).a3));
  check(JSON.stringify(d1) === JSON.stringify(d2) && S.WITH_FACTS.includes(d1.a3) && ['names', 'capitals'].includes(d1.cat) && days.size >= 8,
    `the country of the day: the same for everyone (${d1.a3}, ${d1.cat}); ${days.size} of the twelve in a month`);
  check(S.nextCountry(['MEX', 'USA', 'BRA'], 'MEX', (a3) => a3 === 'USA') === 'BRA' && S.nextCountry(['MEX', 'USA'], 'MEX', () => true) === null, 'the next country: the first after it not full; none when all are');
}

console.log(failed ? `\n${failed} check(s) failed` : '\nfill checks passed');
process.exit(failed ? 1 : 0);
