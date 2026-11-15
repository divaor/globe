// Checks the search box's matching (src/ui/match.ts, v0.29.0) with Node: a name found in any word order, by the start
// of its words, with a typo or two, without accents; the order of the scores (whole name, its start, the words
// together, every word, typos, inside); no far-fetched matches; and coordinates typed in several ways.
// Usage: node scripts/test/search.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { rolldown } = await import('rolldown');
const bundle = await rolldown({ input: path.join(ROOT, 'src/ui/match.ts'), platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
const M = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };
const s = (q, name) => M.matcher(q)(name);

// Found, however it is typed.
for (const [q, name] of [['Rafael Nadal', 'Rafael Nadal'], ['rafa nadal', 'Rafael Nadal'], ['Nadal Rafael', 'Rafael Nadal'], ['rafael nadl', 'Rafael Nadal'],
  ['nadal', 'Rafael Nadal'], ['pikaso', 'Pablo Picasso'], ['velazquez', 'Diego Velázquez'], ['sao paulo', 'São Paulo'], ['mexico', 'México'],
  ['frida', 'Frida Kahlo'], ['amadeus', 'Wolfgang Amadeus Mozart'], ['sagrada familia', 'Templo Expiatorio de la Sagrada Familia'], ['MOZART', 'Mozart']]) {
  check(s(q, name) > 0, `"${q}" finds ${name} (${s(q, name)})`);
}
// Not found: far-fetched.
for (const [q, name] of [['meninas', 'Papiro de las minas de oro'], ['lima', 'Paris'], ['nadal', 'Natalia'], ['x', ''], ['rafael', null]]) {
  check(s(q, name) === 0, `"${q}" does not find ${name === '' ? 'an empty name' : name === null ? 'no name' : name} (${s(q, name)})`);
}
// The order of the scores.
const order = [['Rafael Nadal', 'Rafael Nadal'], ['rafael', 'Rafael Nadal'], ['sagrada familia', 'La Sagrada Familia de Barcelona'], ['nadal rafael', 'Rafael Nadal'], ['rafael nadl', 'Rafael Nadal'], ['fael', 'Rafael Nadal']];
const sc = order.map(([q, n]) => s(q, n));
check(sc.every((v, i) => i === 0 || v < sc[i - 1]) && sc[0] === 100 && sc[1] === 80 && sc[2] === 75 && sc[5] === 30,
  `the whole name ${sc[0]} > its start ${sc[1]} > the words together ${sc[2]} > every word ${sc[3]} > with a typo ${sc[4]} > inside ${sc[5]}`);
check(s('nadal', 'Rafael Nadal') > s('nadal', 'Natal'), `the name itself before a typo away: Rafael Nadal ${s('nadal', 'Rafael Nadal')}, Natal ${s('nadal', 'Natal')}`);
check(M.editDistance('nadl', 'nadal', 2) === 1 && M.editDistance('pikaso', 'picasso', 2) === 2 && M.editDistance('form', 'from', 2) === 1 && M.editDistance('abc', 'xyzw', 2) === 3,
  'edits: a letter dropped, two changed, two swapped, too many');

// Coordinates.
const c = (q) => M.parseCoords(q);
const near = (a, b) => a && Math.abs(a[0] - b[0]) < 1e-3 && Math.abs(a[1] - b[1]) < 1e-3;
check(near(c('40.4, -3.7'), [40.4, -3.7]) && near(c('40.4 -3.7'), [40.4, -3.7]) && near(c('40.4N 3.7W'), [40.4, -3.7]) && near(c('-33.86, 151.21'), [-33.86, 151.21]),
  'coordinates: "40.4, -3.7", "40.4 -3.7", "40.4N 3.7W", "-33.86, 151.21"');
check(near(c('40°24′N 3°42′W'), [40.4, -3.7]) && near(c("33°52'S 151°13'E"), [-33.8667, 151.2167]), 'degrees and minutes: 40°24′N 3°42′W, 33°52\'S 151°13\'E');
check(c('100, 20') === null && c('45, 200') === null && c('Madrid') === null && c('10 20') === null, 'not coordinates: 100, 20 / 45, 200 / Madrid / 10 20');
check(M.fmtCoords([40.4, -3.7]) === '40.40° N, 3.70° W', `shown as ${M.fmtCoords([40.4, -3.7])}`);

console.log(failed ? `\n${failed} check(s) failed` : '\nsearch checks passed');
process.exit(failed ? 1 : 0);
