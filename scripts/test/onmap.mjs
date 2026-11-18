// Checks Put it on the map (src/onmap/logic.ts and public/data/onmap, v0.36.0) with Node: the places (names in
// English and Spanish, every shape there), which countries and regions have enough for a puzzle (Mexico among
// them, Luxembourg in its region instead), the puzzles (six places, each among three or more of its kind, the
// best known asked), the marks by distance, the share grid and the puzzle of the day (a country, then a region).
// Usage: node scripts/test/onmap.mjs
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { rolldown } = await import('rolldown');
const bundle = await rolldown({ input: path.join(ROOT, 'src/onmap/logic.ts'), platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
const O = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };

const data = J('public/data/onmap/places.json');
const shapes = J('public/data/onmap/shapes.json');
const meta = J('public/data/base/countries-meta.json');
const deck = J('public/data/master/deck.json').countries.filter((c) => !c.t);
const P = data.places;

// The places.
const shapeIdx = new Set(Object.values(shapes.objects).flatMap((o) => o.geometries.map((g) => g.properties.i)));
const nShapes = shapeIdx.size;
const badShape = P.filter((p) => (O.SHAPED.includes(p[0]) ? !shapeIdx.has(p[6]) : p[6] !== -1));
check(!badShape.length && O.KINDS.every((k) => P.some((p) => p[0] === k)), `${P.length} places of ${O.KINDS.length} kinds; every river, lake, range and desert has its shape (${nShapes})`);
const es = (k) => P.filter((p) => p[0] === k && p[2]).length / Math.max(1, P.filter((p) => p[0] === k).length);
check(es('river') > 0.6 && es('lake') > 0.5 && es('range') > 0.5, `Spanish names: rivers ${Math.round(es('river') * 100)}%, lakes ${Math.round(es('lake') * 100)}%, ranges ${Math.round(es('range') * 100)}% (the rest are the same in both)`);
const name = (i) => P[i][1];
const mex = O.byKind(O.entriesOf(data.countries.MEX, P), P);
check(/Rio Grande|Balsas/.test(mex.get('river').slice(0, 3).map((c) => name(c.i)).join()) && /Sierra Madre/.test(name(mex.get('range')[0].i)) && /Mexico City/.test(name(mex.get('city')[0].i)) && /Chichen|Teotihuac/.test(mex.get('built').slice(0, 2).map((c) => name(c.i)).join()),
  `Mexico: ${O.KINDS.filter((k) => mex.get(k)).map((k) => `${k} ${mex.get(k).length}`).join(', ')}; best known: ${['river', 'range', 'peak', 'city', 'built'].map((k) => name(mex.get(k)[0].i)).join(', ')}`);
const fra = O.byKind(O.entriesOf(data.countries.FRA, P), P);
check(![...fra.values()].flat().some((c) => c.at[0] < -10 || c.at[1] < 40), `France's places are in France, not across the oceans (Réunion, French Guiana): ${fra.get('range').map((c) => name(c.i)).join(', ')}`);

// Countries and regions with enough for a puzzle.
const ok = deck.filter((c) => O.playable(O.byKind(O.entriesOf(data.countries[c.id], P), P), 'all')).map((c) => c.id);
const regions = [...new Set(Object.values(meta).map((m) => m.sr).filter(Boolean))];
const members = (r) => deck.filter((c) => meta[c.id]?.sr === r).map((c) => c.id);
const okR = regions.filter((r) => members(r).length && O.playable(O.byKind(O.regionEntries(data.countries, members(r), P), P), 'all'));
const noR = regions.filter((r) => members(r).length && !okR.includes(r));
check(ok.length >= 110 && ok.includes('MEX') && !ok.includes('LUX') && okR.length >= 20 && okR.includes('Western Europe'), `${ok.length} of ${deck.length} countries have enough for a puzzle of everything (Mexico yes, Luxembourg no: it is in Western Europe's); ${okR.length} of ${okR.length + noR.length} regions (not: ${noR.join(', ')}, in Oceania's)`);
const mixes = Object.fromEntries(O.MIXES.map((m) => [m, deck.filter((c) => O.playable(O.byKind(O.entriesOf(data.countries[c.id], P), P), m)).length]));
check(mixes.nature >= 45 && mixes.cities >= 120 && mixes.built >= 60, `by mix: ${O.MIXES.map((m) => `${m} ${mixes[m]}`).join(', ')}`);

// Puzzles.
let bad = [];
for (const id of ok) {
  const cands = O.byKind(O.entriesOf(data.countries[id], P), P);
  for (let s = 1; s <= 3; s++) {
    const pz = O.makePuzzle(cands, 'all', O.rng(s));
    const kinds = new Set(pz?.map((c) => P[c.i][0]));
    const fine = pz && pz.length === 6 && new Set(pz.map((c) => c.i)).size === 6 && kinds.size >= 3
      && pz.every((c) => cands.get(P[c.i][0]).includes(c) && cands.get(P[c.i][0]).length >= 3);
    if (!fine) bad.push(id);
  }
}
check(!bad.length, `three puzzles for each of them: six different places, from three kinds or more, each among three or more of its kind${bad.length ? ` (not: ${[...new Set(bad)].slice(0, 6).join(' ')})` : ''}`);
const pzM = O.makePuzzle(mex, 'all', O.rng(7));
check(pzM.every((c) => mex.get(P[c.i][0]).indexOf(c) < 4), `the well-known ones are asked (Mexico: ${pzM.map((c) => name(c.i)).join(', ')})`);
const city = O.makePuzzle(mex, 'cities', O.rng(2));
check(city && city.every((c) => P[c.i][0] === 'city') && O.makePuzzle(mex, 'cities', O.rng(2)).map((c) => c.i).join() === city.map((c) => c.i).join(), `Cities: six of Mexico's cities among ${mex.get('city').length}; the same seed, the same puzzle`);

// Marks.
const span = O.spanOf(mex);
const cities = mex.get('city');
const gdl = cities.find((c) => /Guadalajara/.test(name(c.i))), zap = cities.find((c) => /Zapopan|Tlaquepaque|Tonal/.test(name(c.i))) ?? cities.find((c) => c !== gdl && O.km(c.at, gdl.at) < 200);
const mty = cities.find((c) => /Monterrey/.test(name(c.i))), mer = cities.find((c) => /M[ée]rida/.test(name(c.i))) ?? cities.find((c) => O.km(c.at, gdl.at) > 1500);
const m1 = O.mark(gdl, gdl, span), m2 = zap && O.mark(gdl, zap, span), m3 = O.mark(gdl, mty, span), m4 = mer && O.mark(gdl, mer, span);
check(m1.m === 'g' && (!m2 || m2.m === 'y') && ['y', 'o'].includes(m3.m) && (!m4 || ['o', 'r'].includes(m4.m)) && span > 2500 && span < 4500,
  `marks against Mexico's size (${Math.round(span)} km): Guadalajara right ${m1.m}; ${zap ? `${name(zap.i)} ${m2.m}; ` : ''}Monterrey ${m3.m} (${Math.round(m3.km)} km); ${mer ? `${name(mer.i)} ${m4.m}` : ''}`);
check(O.grid([['g', 'y', 'o', 'r', 'g', 'g'], ['g', 'g', 'g', 'g', 'g', 'g']]) === '🟩🟨🟧🟥🟩🟩\n🟩🟩🟩🟩🟩🟩' && O.missColor(0.01).startsWith('hsl(5') && O.missColor(0.6).startsWith('hsl(0,'), 'the share grid, and yellow to red on the map');

// The puzzle of the day.
const d1 = O.dailyScope('2026-11-18', ok, okR.map((r) => `r:${r}`)), d2 = O.dailyScope('2026-11-19', ok, okR.map((r) => `r:${r}`));
check(d1 && d2 && d1 !== d2 && (d1.startsWith('r:') !== d2.startsWith('r:')) && O.dailyScope('2026-11-18', ok, okR.map((r) => `r:${r}`)) === d1, `the puzzle of the day: ${d1} today, ${d2} tomorrow (a country one day, a region the next; the same for everyone)`);

console.log(failed ? `\n${failed} check(s) failed` : '\nPut it on the map checks passed');
process.exit(failed ? 1 : 0);
