// Checks Lives on the map (v0.28.0): every life as the app plays it (public/data/lives), and two lives side by side
// (src/lives/merge.ts).
// - A life: born first, one death, ages that grow with the dates, every step on the map, the route from each place to
//   the next starting where the last one ended, its Wikidata id and field, both languages.
// - The list: every life is in a field of the list, and the pairs offered exist.
// - Two lives: both lives' steps in date order, each in its own colour, and a handshake where their paths crossed.
// Usage: node scripts/test/lives.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'public/data/lives');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const { rolldown } = await import('rolldown');
const bundle = await rolldown({ input: path.join(ROOT, 'src/lives/merge.ts'), platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
const M = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
const km = M.km;

const index = read('index.json');
const lives = new Map(index.stories.map((e) => [e.id, read(`${e.id}.json`)]));
const fields = new Set(index.fields.map((f) => f.id));
const two = (v) => v && typeof v.en === 'string' && v.en.trim() && typeof v.es === 'string' && v.es.trim();

// ---- every life
const bad = [];
let steps = 0, unsure = 0, visits = 0;
for (const [id, c] of lives) {
  const why = [];
  const l = c.life;
  if (!l || !/^Q\d+$/.test(l.qid) || !fields.has(l.field) || !two(l.place) || !Array.isArray(l.at)) why.push('its life (Wikidata id, field, birthplace)');
  const real = c.steps.filter((st) => !st.aftermath);
  if (real[0]?.lk !== 'born' || real[0]?.date !== l?.born) why.push('the first step is not the birth');
  const died = real.filter((st) => st.lk === 'died');
  if (died.length !== 1 || died[0].date !== l?.died) why.push('one death, on the day they died');
  let age = -1, prev = null;
  for (const [i, st] of c.steps.entries()) {
    if (!two(st.title) || !two(st.text)) why.push(`step ${i + 1}: both languages`);
    if (st.aftermath) { visits += (st.show ?? []).length; continue; }
    steps++;
    if (st.unsure) unsure++;
    if (!two(st.place) || !Array.isArray(st.at)) { why.push(`step ${i + 1}: no place`); continue; }
    // (A step where they were not, "away", has no route; the next one starts from where they were.)
    if (st.away) { if ((st.moves ?? []).length) why.push(`step ${i + 1}: a route to a place they were not`); continue; }
    // (A step dated by its year only may be a year either way: its lower age counts.)
    if (st.age != null) { if (st.age < age) why.push(`step ${i + 1}: aged ${st.age} after ${age}`); age = st.age0 ?? st.age; }
    // The route to a step starts where the last step was, and ends at the step.
    for (const mv of st.moves ?? []) {
      if (!prev || km(mv.path[0], prev) > 1 || km(mv.path[mv.path.length - 1], st.at) > 1) why.push(`step ${i + 1}: its route does not join the last place to this one`);
    }
    if (prev && km(prev, st.at) > 15 && !(st.moves ?? []).length) why.push(`step ${i + 1}: no route from the last place`);
    if (!(st.show ?? []).some((k) => km(c.items[k].at, st.at) < 0.2)) why.push(`step ${i + 1}: no marker at its place`);
    prev = st.at;
  }
  if ((l?.path ?? []).length !== c.steps.length) why.push('the list of its places');
  if (c.sides.length !== 1 || !c.trail || !two(c.outcome) || c.sources.length < 2) why.push('its side, trail, legacy or sources');
  if (why.length) bad.push(`${id}: ${[...new Set(why)].slice(0, 3).join('; ')}`);
}
check(!bad.length, bad.length ? `${bad.length} lives are not right: ${bad.slice(0, 5).join(' | ')}` : `${lives.size} lives: each begins with the birth and has one death; ages grow; every step has a place, a marker and the route from the last place (${steps} steps, ${unsure} marked not certain, ${visits} places to visit)`);
const byField = {};
for (const e of index.stories) byField[e.life.field] = (byField[e.life.field] ?? 0) + 1;
check(index.stories.every((e) => e.life && fields.has(e.life.field)) && index.pairs.every((p) => lives.has(p.a) && lives.has(p.b)),
  `the list: ${Object.entries(byField).map(([k, n]) => `${n} ${k}`).join(', ')}; ${index.pairs.length} pairs to see side by side, all written`);

// ---- one life we know
const frida = lives.get('frida-kahlo');
if (frida) {
  const st = frida.steps;
  const wed = st.find((x) => x.date === '1929-08-21'), paris = st.find((x) => x.date === '1939-03-10');
  check(frida.life.qid === 'Q5588' && frida.life.field === 'arts' && st[0].age === 0 && wed?.age === 22 && st.find((x) => x.lk === 'died')?.age === 47 && km(st[0].at, [-99.1625, 19.355]) < 1
    && paris?.moves?.[0].by === 'sea' && paris.moves[0].icon === '🚢' && st[st.length - 1].aftermath && st[st.length - 1].show.length === 3,
  `Frida Kahlo: born in Coyoacán, married at ${wed?.age}, by ship to Paris in 1939, died at ${st.find((x) => x.lk === 'died')?.age}; three places to visit today`);
}

// ---- two lives side by side
const WORDS = { both: { en: 'Both in {place}', es: 'Ambos en {place}' }, summary: { en: 'Two lives.', es: 'Dos vidas.' } };
const pair = (a, b) => M.mergeLives(structuredClone(lives.get(a)), structuredClone(lives.get(b)), WORDS);
const pairsOk = [];
for (const p of index.pairs) {
  const a = lives.get(p.a), b = lives.get(p.b), m = pair(p.a, p.b);
  const sorted = m.steps.every((st, i) => i === 0 || st.t >= m.steps[i - 1].t);
  const whole = m.steps.length === a.steps.length + b.steps.length && m.items.length === a.items.length + b.items.length;
  const sides = m.sides.length === 2 && m.sides[0].color !== m.sides[1].color && m.steps.every((st) => ['a', 'b'].includes(st.who) && (st.moves ?? []).every((mv) => mv.side === st.who));
  const shown = m.steps.every((st) => (st.show ?? []).every((k) => m.items[k] && m.items[k].first <= m.steps.indexOf(st)));
  pairsOk.push([`${p.a}${M.SEP}${p.b}`, sorted && whole && sides && shown && m.id === `${p.a}${M.SEP}${p.b}`, m.steps.filter((st) => st.met).length]);
}
check(pairsOk.every((x) => x[1]), pairsOk.length ? `two lives side by side: ${pairsOk.length} pairs, each with both lives' steps in date order, two colours and every marker (${pairsOk.map((x) => `${x[0]} ${x[2]} 🤝`).slice(0, 4).join(', ')}…)` : 'two lives side by side: no pair is written yet');
if (lives.has('frida-kahlo') && lives.has('diego-rivera')) {
  const m = pair('frida-kahlo', 'diego-rivera');
  const wed = m.steps.find((st) => st.who === 'a' && st.date === '1929-08-21');
  check(wed?.met && wed.events?.some((e) => e.icon === '🤝' && /Coyoacán/.test(e.text.en) && /1929/.test(e.text.en)) && m.name.en === 'Frida Kahlo and Diego Rivera' && m.name.es === 'Frida Kahlo y Diego Rivera',
    `Frida Kahlo and Diego Rivera: their paths cross at their wedding ("${wed?.events?.[0]?.text.en}")`);
}

console.log(fails ? `\n${fails} check(s) failed` : '\nlives checks passed');
process.exit(fails ? 1 : 0);
