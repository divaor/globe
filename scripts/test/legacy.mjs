// Checks Legacies of the past (src/legacy/logic.ts and public/data/legacies, v0.44.0) with Node: "where" groups
// added together and taken away, the lines of a journey (with branches), what a country borrowed (used there and
// not everywhere, or everywhere), the shades of a civilization's map, the search, and "Who gave us this?" (four
// different civilizations, one right, nothing debated or shared by two civilizations, the same questions from the
// same seed). Then the real data: every civilization's homeland and legacies, every legacy used somewhere, the
// five the reader named first with 30 or more, Mexico borrowing from the Mexica, Peru from the Incas.
// Usage: node scripts/test/legacy.mjs
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { rolldown } = await import('rolldown');
const bundle = await rolldown({ input: path.join(ROOT, 'src/legacy/logic.ts'), platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
const G = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };

// ---- A small made-up index.
const T = (en) => ({ en, es: en });
const mini = {
  cats: [{ id: 'words', icon: '🗣️', color: '#888888', name: T('Words') }, { id: 'time', icon: '📅', color: '#888888', name: T('Time') }],
  how: ['invented'],
  civs: ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, name: T(`Civ ${id}`), icon: '🏛️', color: '#123456', from: String(-1000 - i), to: '1', at: [i, i], n: 2, cats: { words: 1, time: 1 } })),
  groups: { 'lang:spa': ['MEX', 'ESP', 'PER'], 'branch:romance': ['MEX', 'ESP', 'PER', 'FRA', 'ITA'] },
  countries: ['MEX', 'ESP', 'PER', 'FRA', 'ITA', 'JPN'],
  all: [],
};
let k = 0;
for (const c of mini.civs) {
  mini.all.push({ c: c.id, id: `${c.id}-word`, name: T(`Word of ${c.id}`), icon: '🗣️', cat: 'words', how: 'named', t: -k++, at: c.at, where: ['lang:spa'], w: [{ en: `w${c.id}`, es: `p${c.id}` }, { en: `Name${c.id}`, t: 'name' }] });
  mini.all.push({ c: c.id, id: `${c.id}-hour`, name: T(`Hour of ${c.id}`), icon: '📅', cat: 'time', how: 'invented', t: -k++, at: c.at, where: ['world'] });
}
mini.all.push({ c: 'a', id: 'a-shared', name: T('Shared thing'), icon: '⚙️', cat: 'time', how: 'spread', t: 0, at: [0, 0], where: ['branch:romance', '!ESP'], strong: ['MEX', 'JPN'] });
mini.all.push({ c: 'b', id: 'b-shared', name: T('Shared thing'), icon: '⚙️', cat: 'time', how: 'spread', t: 0, at: [0, 0], where: ['ITA'] });
mini.all.push({ c: 'c', id: 'c-debated', name: T('Debated thing'), icon: '❓', cat: 'time', how: 'invented', t: 0, at: [0, 0], where: ['FRA'], sure: 'debated' });

const set = (s) => [...s].sort().join(',');
check(set(G.members(['lang:spa'], mini)) === 'ESP,MEX,PER', 'a group names its countries');
check(set(G.members(['branch:romance', '!ESP'], mini)) === 'FRA,ITA,MEX,PER', '"!group" takes countries away');
check(set(G.members(['world', '!lang:spa'], mini)) === 'FRA,ITA,JPN', '"world" is every country');
check(set(G.members(['JPN', 'MEX'], mini)) === 'JPN,MEX', 'country codes');
check(G.everywhere(['world']) && !G.everywhere(['world', '!JPN']) && !G.everywhere(['lang:spa']), 'everywhere means "world" with nothing taken away');
const u = G.usersOf(mini.all.find((b) => b.id === 'a-shared'), mini);
check(set(u.all) === 'FRA,ITA,MEX,PER' && set(u.strong) === 'MEX', 'strongest only where it is used at all');

// The lines of a journey: step to step, or from an earlier step.
const segs = G.segments([0, 0], [{ at: [1, 0] }, { at: [2, 0] }, { at: [0, 5], from: 0 }, { at: [3, 0], from: 2 }]);
check(JSON.stringify(segs) === JSON.stringify([[[0, 0], [1, 0]], [[1, 0], [2, 0]], [[0, 0], [0, 5]], [[2, 0], [3, 0]]]), 'segments follow the steps and their branches');
check(G.segments([0, 0]).length === 0, 'no path, no lines');

// What a country borrowed.
const mx = G.borrowed('MEX', mini);
const a = mx.find((g) => g.civ.id === 'a');
check(mx.length === 5 && a.own.length === 2 && a.world.length === 1, 'Mexico: the Words, the shared thing, and the hour used everywhere');
check(mx[0].civ.id === 'a', 'the civilization it borrowed most from comes first');
check(G.borrowed('JPN', mini).every((g) => g.own.length === 0 && g.world.length === 1), 'Japan: only what is used everywhere');
const counts = G.countsFor('a', mini);
check(counts.get('MEX') === 3 && counts.get('ESP') === 2 && counts.get('JPN') === 1, 'a civilization’s shades count its legacies in each country');

// Search.
const score = (q) => (s) => (s.toLowerCase().includes(q) ? 50 : 0);
check(G.findLegacies('word of a', mini, score('word of a')).map((x) => x.b.id)[0] === 'a-word', 'search by name');
check(G.findLegacies('wc', mini, score('wc')).some((x) => x.b.id === 'c-word'), 'search by a word it gave');
check(G.findLegacies('pc', mini, score('pc')).some((x) => x.b.id === 'c-word'), 'search by its Spanish word');

// Words and names by kind, each once, as the reader says them.
const byType = G.wordsByType([{ id: 'x', words: [{ en: 'paper', es: 'papel', from: 'papyros' }, { en: 'Susan', es: 'Susana', from: 'sšn', type: 'name' }] }, { id: 'y', words: [{ en: 'paper', es: 'papel', from: 'papyros' }, { es: 'adobe', en: 'adobe', from: 'ḏbt' }] }], 'es');
check(JSON.stringify([...byType].map(([t, l]) => [t, l.map((x) => x.w)])) === JSON.stringify([['word', ['papel', 'adobe']], ['name', ['Susana']]]), 'words and names by kind, once each, in Spanish');
check(G.wordIn({ es: 'cacahuate' }, 'en') === 'cacahuate' && G.wordIn({ en: 'tomato', es: 'tomate' }, 'fr') === 'tomato', 'a word missing in a language falls back to the other');

// Who gave us this?
const qs = G.quizQuestions(mini, 30, G.seeded(7));
check(qs.length > 0 && qs.every((q) => q.options.length === 4 && new Set(q.options).size === 4 && q.options.includes(q.c)), 'four different civilizations, one of them right');
check(!qs.some((q) => q.id === 'c-debated' || q.id.endsWith('-shared')), 'nothing debated or given by two civilizations');
check(new Set(qs.map((q) => `${q.c}/${q.id}`)).size === qs.length, 'no legacy asked twice');
check(JSON.stringify(G.quizQuestions(mini, 5, G.seeded(42))) === JSON.stringify(G.quizQuestions(mini, 5, G.seeded(42))), 'the same seed, the same questions (the daily challenge)');
check(new Set(G.quizQuestions(mini, 5, G.seeded(3)).map((q) => q.c)).size === 5, 'spread over the civilizations');

// The legacy of the day: the same all day, another tomorrow, none twice before all have had their day.
const d1 = G.ofTheDay('2026-11-24', mini), d2 = G.ofTheDay('2026-11-25', mini);
check(!!d1 && d1 === G.ofTheDay('2026-11-24', mini) && d1 !== d2, `the legacy of the day: ${d1?.id}, then ${d2?.id}`);
const days = Array.from({ length: 12 }, (_, i) => G.ofTheDay(`2026-12-${String(i + 1).padStart(2, '0')}`, mini)?.id);
check(new Set(days).size === 12 && !days.includes('c-debated'), 'twelve days, twelve different legacies, nothing debated');

// ---- The real data.
const dir = path.join(ROOT, 'public/data/legacies');
if (!fs.existsSync(path.join(dir, 'index.json'))) {
  check(false, 'public/data/legacies/index.json is built (node scripts/data/legacies/build-legacies.mjs)');
} else {
  const idx = J('public/data/legacies/index.json');
  const areas = J('public/data/legacies/areas.json');
  const homes = new Set(areas.objects.areas.geometries.map((g) => g.id));
  check(idx.civs.length >= 15, `${idx.civs.length} civilizations`);
  check(idx.civs.every((c) => homes.has(c.id)), 'every civilization has a homeland');
  check(idx.civs.every((c) => c.n >= 12 && fs.existsSync(path.join(dir, `${c.id}.json`))), 'every civilization has 12 legacies or more, and its file');
  for (const id of ['sumerians', 'egyptians', 'greeks', 'mexica', 'incas']) {
    const c = idx.civs.find((x) => x.id === id);
    check(!!c && c.n >= 30, `${id}: ${c?.n ?? 0} legacies (the five named first have 30 or more)`);
  }
  check(idx.all.every((b) => G.members(b.where, idx).size > 0), `all ${idx.all.length} legacies are used somewhere today`);
  check(idx.all.every((b) => idx.cats.some((c) => c.id === b.cat)), 'every legacy has a known category');
  const used = new Set(idx.all.map((b) => b.cat));
  check(used.size >= 12, `${used.size} of ${idx.cats.length} categories used`);
  const mex = G.borrowed('MEX', idx);
  check(mex.some((g) => g.civ.id === 'mexica' && g.own.length >= 5), 'Mexico borrowed from the Mexica');
  check(G.borrowed('PER', idx).some((g) => g.civ.id === 'incas' && g.own.length >= 5), 'Peru borrowed from the Incas');
  const r = G.reach(idx).byCountry;
  check((r.get('MEX') ?? 0) >= 10 && (r.get('JPN') ?? 0) >= 5, `Mexico borrowed from ${r.get('MEX')} civilizations, Japan from ${r.get('JPN')}`);
  const quiz = G.quizQuestions(idx, 10, G.seeded(1));
  check(quiz.length === 10 && new Set(quiz.map((q) => q.c)).size === 10, 'a quiz of 10 questions from 10 civilizations');
  // Each civilization's file matches the index.
  let ok = true;
  for (const c of idx.civs) {
    const f = J(`public/data/legacies/${c.id}.json`);
    if (f.legacies.length !== c.n || f.legacies.some((l) => !idx.all.find((b) => b.c === c.id && b.id === l.id))) { ok = false; console.log(`  ${c.id}: file and index differ`); }
    for (const l of f.legacies) if (l.path?.some((p, i) => p.from != null && (p.from < 0 || p.from > i))) { ok = false; console.log(`  ${c.id}/${l.id}: a step's "from" is not an earlier step`); }
  }
  check(ok, 'each civilization’s file matches the index');
}

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('legacies: all good');
