// Checks Master the world's spaced repetition (src/master/srs.ts, v0.34.0) with Node: when a country comes back,
// when it is known and mastered (right on 3 different days), what a miss does (and a comeback), how it is asked as
// it gets better known, the Learn queue (due first, five new at most, fewer while many are shaky, a miss back three
// questions later), the orders, Run's hearts, combo and power-ups, and Marathon's skipping.
// Usage: node scripts/test/master.mjs
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { rolldown } = await import('rolldown');
const bundle = await rolldown({ input: path.join(ROOT, 'src/master/srs.ts'), platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
const S = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };
const D = (n) => S.addDays('2026-11-17', n);

// The schedule: right on day 0 → back the next day; then in 3 days; then 2.5 times as long.
let c, g;
g = S.grade(undefined, true, D(0)); c = g.card;
check(c.due === D(1) && S.level(c) === 'known' && !g.mastered, `right the first time: known, back tomorrow (${c.due})`);
g = S.grade(c, true, D(1)); c = g.card;
check(c.due === D(4) && c.ivl === 3, `right the next day: back in 3 days (${c.due})`);
g = S.grade(c, true, D(4)); c = g.card;
check(g.mastered && S.level(c) === 'mastered' && c.ivl === 8 && c.due === D(12), `right on a third day: mastered, back in 8 days (${c.due})`);
// Right twice the same day counts once.
let t = S.grade(undefined, true, D(0)).card; t = S.grade(t, true, D(0)).card;
check(t.days.length === 1 && t.ivl === 1, 'right twice the same day: one day of credit');
// Ten in a row the same day is not mastery.
let ten = undefined; for (let i = 0; i < 10; i++) ten = S.grade(ten, true, D(0)).card;
check(!ten.mastered && S.level(ten) === 'known', 'ten right in one sitting: known, not mastered');

// A miss: back today, one day of credit lost; a mastered one missed is forgotten, and relearning it is a comeback.
g = S.grade(c, false, D(12)); let m = g.card;
check(g.forgot && m.forgot && !m.mastered && m.due === D(12) && m.days.length === 1 && m.lapses === 1, `a mastered country missed: forgotten, back today, ${m.days.length} day of credit left`);
g = S.grade(m, true, D(12)); m = g.card;
check(!g.comeback && !m.mastered && m.due === D(13), 'right again the same day: known, back tomorrow');
g = S.grade(m, true, D(13)); m = g.card;
check(g.comeback && m.mastered && !m.forgot, 'right the next day: mastered again, a comeback');
let n = S.grade(undefined, false, D(0)).card;
check(S.level(n) === 'learning' && n.lapses === 0 && n.due === D(0), 'missed the first time: learning, due today, not a lapse');

// How it is asked.
const card = (days) => ({ ...S.blank(D(0)), seen: 3, days });
check(S.step(undefined, false) === 'pick' && S.step(card([D(0)]), false) === 'tap' && S.step(card([D(0), D(1)]), false) === 'tap' && S.step(card([D(0), D(1)]), true) === 'type',
  'asked: picked when new, tapped once known, typed (if wanted) after two days');

// The Learn queue.
const ids = Array.from({ length: 30 }, (_, i) => `C${i}`);
const cards = {};
for (let i = 0; i < 6; i++) cards[`C${i}`] = { ...S.blank(D(0)), seen: 2, days: [D(-1)], due: D(0) };
cards.C6 = { ...S.blank(D(0)), seen: 2, days: [D(-1)], due: D(5) };
let q = S.learnQueue(ids, cards, D(0));
check(q.due.length === 6 && q.fresh.length === 5 && q.fresh[0] === 'C7' && q.queue.length === 11 && !q.queue.includes('C6'),
  `Learn: the 6 due today and 5 new (${q.queue.join(' ')}); not the one due later`);
const shaky = {};
for (let i = 0; i < 9; i++) shaky[`C${i}`] = { ...S.blank(D(0)), seen: 2, days: [], due: D(0) };
q = S.learnQueue(ids, shaky, D(0));
check(q.fresh.length === 0, 'Learn: no new ones while 8 or more are still shaky');
const rq = S.requeue(['A', 'B', 'C', 'D', 'E', 'F'], 0, 'A');
check(rq.indexOf('A', 1) === 4, `a miss comes back three questions later (${rq.join(' ')})`);

// The orders.
const list = Array.from({ length: 12 }, (_, i) => ({ id: `K${i}`, name: String.fromCharCode(90 - i), ct: i % 2 ? 'EU' : 'AF', fame: 12 - i, pop: i * 10 }));
const bal = S.ordered(list, 'balanced');
check(bal.slice(0, 4).join() === 'K0,K1,K2,K6' && bal.length === 12 && new Set(bal).size === 12, `balanced: three well known, then a lesser known (${bal.join(' ')})`);
check(S.ordered(list, 'people')[0] === 'K11' && S.ordered(list, 'fixed')[0] === 'K11' && S.ordered(list, 'continent')[0] === 'K1', 'most populous, A to Z and by continent (Europe first)');
check(S.ordered(list, 'random', 7).join() === S.ordered(list, 'random', 7).join() && S.ordered(list, 'random', 7).join() !== S.ordered(list, 'random', 8).join(), 'random: the same for the same seed');

// Run.
let run = S.newRun(), gained = 0, power = null;
for (let i = 0; i < 10; i++) ({ run, gained, power } = S.runAnswer(run, true, () => 0.5));
check(run.combo === 10 && run.score === 10 * 4 + 20 * 5 + 30 && power === 'heart' && run.hearts === 4, `Run: ten in a row score ${run.score}, a power-up (${power})`);
({ run } = S.runAnswer(run, false));
({ run } = S.runAnswer(run, false));
({ run } = S.runAnswer(run, false));
const last = S.runAnswer(run, false);
check(last.over && last.run.combo === 0 && last.run.best === 10, 'Run: over when the hearts run out; the best combo is kept');

// Marathon.
check(S.marathonList(['A', 'B', 'C'], { A: 10, B: 9 }).join() === 'B,C', 'Marathon: a country right ten times in a row is skipped');

// The deck itself.
const deck = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/master/deck.json'), 'utf8'));
const all = deck.countries, cs = all.filter((x) => !x.t);
check(cs.length === 195 && cs.filter((x) => x.cap && !x.skip).length === 194 && cs.filter((x) => x.cities.length === 3).length >= 193, `the deck: ${cs.length} countries, ${cs.filter((x) => x.cap && !x.skip).length} capitals, three other cities for ${cs.filter((x) => x.cities.length === 3).length}`);
check(cs.every((x) => x.like.length >= 3 && x.land.length + x.near.length >= 3), 'every country has three look-alike flags and three neighbours');
check(all.length - cs.length >= 15 && all.filter((x) => x.t).every((x) => x.like.length >= 3), `and ${all.length - cs.length} territories, for the setting that adds them`);

// The State capitals deck (v0.38.1): a card per state with a capital to ask, country by country.
const db = await rolldown({ input: path.join(ROOT, 'src/master/decks.ts'), platform: 'neutral', logLevel: 'silent' });
const Dk = await import(`data:text/javascript;base64,${Buffer.from((await db.generate({ format: 'esm' })).output[0].code).toString('base64')}`);
const sj = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/states/states.json'), 'utf8')).countries;
const sd = Dk.stateDeck(sj), sById = new Map(sd.map((c) => [c.id, c]));
const perCountry = Object.fromEntries(Object.keys(sj).map((a3) => [a3, sd.filter((c) => c.ct === a3).length]));
check(sd.length >= 280 && Object.keys(sj).length === 12 && Object.values(perCountry).every((n) => n >= 7), `State capitals: ${sd.length} states in 12 countries (${Object.entries(perCountry).map(([a, n]) => `${a} ${n}`).join(', ')})`);
check(!sById.has('MEX|MX-DIF') && !sById.has('DEU|DE-BE') && !sById.has('USA|US-DC') && sById.get('MEX|MX-JAL')?.cap.en === 'Guadalajara' && sById.get('COL|COL-1398')?.cap.en === 'Bogotá',
  `a city of its own (Mexico City, Berlin, Washington) has no card; Jalisco's capital is ${sById.get('MEX|MX-JAL')?.cap.en}, Cundinamarca's ${sById.get('COL|COL-1398')?.cap.en}`);
check(sd.every((c) => c.cap && c.cities.length >= 1 && c.near.length >= 3 && c.near.every((n) => sById.get(n)?.ct === c.ct)), 'every state: a capital, another city, and three or more of the same country to pick among');
const usa = sd.filter((c) => c.ct === 'USA').sort((a, b) => b.fame - a.fame);
check(usa[0].id === 'USA|US-CA' && sById.get('ESP|ES-CanaryIs')?.note?.en.includes('Las Palmas'), `the most populous first (${usa[0].id}); a shared capital explained (the Canaries)`);
const oc = S.ordered(sd.map((c) => ({ id: c.id, name: c.id, ct: c.ct, fame: c.fame, pop: c.pop })), 'continent');
const runs = oc.map((id) => sById.get(id).ct).filter((ct, i, a) => ct !== a[i - 1]);
check(runs.length === 12, `"Country by country": the twelve one after another (${runs.join(' ')})`);
const scope = new Map(Dk.statesIn(sd, 'CHL').map((c) => [c.id, c]));
const qf = Dk.question('states', sById.get('CHL|CL-VS'), 'pick', false, scope, S.rng(3));
const qr = Dk.question('states', sById.get('CHL|CL-VS'), 'pick', true, scope, S.rng(3));
check(qf.places[0].en === 'Valparaíso' && qf.places.length === 3 && qr.options.length === 4 && qr.options.includes('CHL|CL-VS') && qr.options.every((o) => o.startsWith('CHL|')),
  `asked like a capital: Valparaíso among ${qf.places.length} dots; the other way round, among four Chilean regions (${qr.options.join(' ')})`);

// The decks of v0.39.0: Big cities, Landmarks, and Rivers, mountains and seas.
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const cities = J('public/data/master/cities.json').cities, cityIds = new Set(cities.map((c) => c[0]));
const per = (rows, i) => rows.reduce((m, r) => ((m[r[i]] = (m[r[i]] ?? 0) + 1), m), {});
const cct = per(cities, 6);
check(cities.length === 250 && cct.SA >= 30 && cct.NA >= 40 && cities.every((c) => c[10].length === 6 && c[10].every((n) => cityIds.has(n))),
  `Big cities: ${cities.length} (${Object.entries(cct).map(([k, v]) => `${k} ${v}`).join(', ')}), each with its six nearest`);
const capOf = (id) => cities.find((c) => c[0] === id)?.[8];
check(capOf('brasilia') === 1 && capOf('mexico-city') === 1 && capOf('rio-de-janeiro') === 0 && capOf('new-york-city') === 0 && cities.find((c) => c[0] === 'mexico-city')?.[2] === 'Ciudad de México' && cities.find((c) => c[0] === 'bogota')?.[1] === 'Bogotá',
  'national capitals marked (Brasília, Mexico City; not Rio de Janeiro or New York); Spanish names (Ciudad de México)');
const sites = J('public/data/master/landmarks.json').sites;
const meta = J('public/data/base/countries-meta.json');
const giveaway = sites.filter((s) => s[5].some((c) => [meta[c]?.n, meta[c]?.es].some((n) => n && new RegExp(`\\b${n}\\b`).test(`${s[1]} ${s[2] || ''}`))));
check(sites.length === 300 && sites.every((s) => s[9] && s[5].length >= 1 && s[5].length <= 2) && !giveaway.length && ['Machu Picchu', 'Great Wall', 'Taj Mahal', 'Petra', 'Chichen Itza', 'Iguazu'].every((n) => sites.some((s) => s[1].includes(n))),
  `Landmarks: ${sites.length}, each with a picture and in one or two countries, none named after its country${giveaway.length ? ` (but: ${giveaway.map((s) => s[1]).join(', ')})` : ''}; Machu Picchu, the Great Wall, the Taj Mahal, Petra, Chichen Itza, Iguazú`);
const nat = J('public/data/master/nature.json'), items = nat.items;
const kinds = per(items, 0);
const has = (n) => items.some((i) => i[1] === n);
check(items.length >= 200 && kinds.river >= 50 && kinds.peak >= 25 && items.every((i) => (i[0] === 'peak') === (i[8] < 0)) && items.every((i) => i[9].length === 5 && i[9].every((k) => items[k] && items[k][0] !== undefined)),
  `Rivers, mountains and seas: ${items.length} (${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(', ')}); a shape for all but the peaks; five of the same kind near each`);
check(['Volga', 'Yangtze River', 'Congo River', 'Amazon River', 'Andes', 'Sahara', 'Titicaca', 'Mount Everest', 'Gulf of Mexico', 'Caribbean Sea', 'Pacific Ocean'].every(has) && items.find((i) => i[1] === 'Andes')[5].length >= 6,
  'the Volga, the Yangtze and the Congo (named right since v0.39.0), the Amazon, the Andes in their countries, the Sahara, Titicaca, Everest, the Gulf of Mexico, the Caribbean, the Pacific');

console.log(failed ? `\n${failed} check(s) failed` : '\nmaster checks passed');
process.exit(failed ? 1 : 0);
