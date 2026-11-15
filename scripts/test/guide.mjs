// Checks the travel guide (v0.26.0): its sums (src/guide/logic.ts) and its data (public/data/guide).
// Sums: the best months to go, sunrise and sunset against known times, time zones, flight times, the best order of a
// trip (against every order), the share link. Data: every guide city has its file; the cities have Wikidata ids and
// weather; Lima, Madrid, Kyoto, Mexico City and Cusco have what a guide to them must have.
// Usage: node scripts/test/guide.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { rolldown } = await import('rolldown');
const bundle = await rolldown({ input: path.join(ROOT, 'src/guide/logic.ts'), platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
const G = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };

// ---- Sums ------------------------------------------------------------------------------------------------------
const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
check(JSON.stringify(G.monthRanges([5, 6, 7, 8])) === '[[5,8]]' && JSON.stringify(G.monthRanges([11, 0, 1])) === '[[11,1]]' && JSON.stringify(G.monthRanges([2, 4])) === '[[2,2],[4,4]]' && JSON.stringify(G.monthRanges([...Array(12).keys()])) === '[[0,11]]',
  'months as ranges: June–September, December–February across the new year, single months, all year');
const cold = { t: Array(12).fill(-150), r: null, p: Array(12).fill(20), d: null };
const monsoon = { t: [200, 220, 260, 290, 300, 290, 280, 280, 280, 270, 240, 210], r: null, p: [10, 10, 20, 50, 200, 450, 600, 500, 300, 100, 30, 10], d: [10, 10, 20, 50, 120, 200, 250, 230, 150, 60, 20, 10] };
const mb = G.bestMonths(monsoon);
check(G.bestMonths(cold).length === 0 && mb.length && mb.every((m) => m <= 2 || m >= 10), `no good month in a frozen place; a monsoon place is best in its dry months (${mb.map((m) => M[m]).join(', ')})`);
// Sunrise and sunset: Madrid on the June solstice, about 04:45 and 19:48 UTC; Quito, about 12 hours of day; Tromsø.
const sm = G.sunTimes(new Date(Date.UTC(2026, 5, 21)), 40.4168, -3.7038);
const sq = G.sunTimes(new Date(Date.UTC(2026, 2, 20)), -0.18, -78.47);
check(Math.abs(sm.rise - 285) <= 6 && Math.abs(sm.set - 1188) <= 6 && Math.abs(sq.set - sq.rise - 728) <= 8 && G.sunTimes(new Date(Date.UTC(2026, 5, 21)), 69.65, 18.96).polar === 'day' && G.sunTimes(new Date(Date.UTC(2026, 11, 21)), 69.65, 18.96).polar === 'night',
  `the sun: Madrid on 21 June rises at ${G.hhmm(sm.rise)} and sets at ${G.hhmm(sm.set)} UTC; Quito's day is ${((sq.set - sq.rise) / 60).toFixed(1)} h at the equinox; Tromsø has polar day in June and polar night in December`);
const jan = new Date(Date.UTC(2026, 0, 15)), jul = new Date(Date.UTC(2026, 6, 15));
check(G.tzOffset('Asia/Tokyo', jan) === 540 && G.tzOffset('America/Lima', jan) === -300 && G.tzOffset('Asia/Kolkata', jan) === 330 && G.tzOffset('Europe/Madrid', jan) === 60 && G.tzOffset('Europe/Madrid', jul) === 120 && G.tzOffset('Nowhere/Nothing') === 0,
  'clocks: Tokyo +9, Lima −5, Kolkata +5:30, Madrid +1 in winter and +2 in summer');
check(G.hhmm(-30) === '23:30' && G.hhmm(1500) === '01:00' && G.hoursText(G.flightHours(586)) === '1 h 15 min' && G.hoursText(G.flightHours(10100)) === '13 h 15 min' && G.hoursText(0.2) === '15 min',
  `times: Lima → Cusco (586 km) is about ${G.hoursText(G.flightHours(586))} by air; Madrid → Tokyo (10,100 km) about ${G.hoursText(G.flightHours(10100))}`);
// The best order, against every order (up to 8 places), and a sound order for 14.
const seeded = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
let orderOk = true;
for (let t = 0; t < 10; t++) {
  const r = seeded(t + 1), n = 3 + (t % 6);
  const pts = Array.from({ length: n }, () => [r() * 60 - 10, r() * 40 + 10]);
  const o = G.bestOrder(pts);
  const best = Math.min(...perms([...Array(n).keys()].slice(1)).map((p) => G.tripKm([0, ...p].map((i) => pts[i]))));
  if (o[0] !== 0 || new Set(o).size !== n || Math.abs(G.tripKm(o.map((i) => pts[i])) - best) > 1e-6) orderOk = false;
}
const r14 = seeded(99), p14 = Array.from({ length: 14 }, () => [r14() * 100 - 50, r14() * 60]);
const o14 = G.bestOrder(p14);
check(orderOk && o14[0] === 0 && new Set(o14).size === 14 && G.tripKm(o14.map((i) => p14[i])) < G.tripKm(p14), `the best order matches trying every order (10 trips of 3 to 8 cities); 14 cities: ${Math.round(G.tripKm(p14))} km in the order given, ${Math.round(G.tripKm(o14.map((i) => p14[i])))} km in the best order found`);
const known = (id) => ['lima', 'cusco', 'arequipa'].includes(id);
check(G.tripHash(['lima', 'cusco']) === 'trip=lima,cusco' && JSON.stringify(G.readTrip('lima,Cusco,atlantis,lima,arequipa', known)) === '["lima","cusco","arequipa"]' && G.readTrip(null, known).length === 0,
  'a shared trip link: trip=lima,cusco; unknown and repeated cities are dropped');

// ---- Data ------------------------------------------------------------------------------------------------------
const dir = path.join(ROOT, 'public/data/guide');
const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
const F = index.fields, col = (k) => F.indexOf(k);
const cities = index.cities;
const files = new Set(fs.readdirSync(path.join(dir, 'c')));
const withQid = cities.filter((c) => c[col('qid')]).length, withClimate = cities.filter((c) => c[col('climate')]).length, withWv = cities.filter((c) => c[col('wv_en')] || c[col('wv_es')]).length;
check(cities.length >= 600 && cities.every((c) => files.has(`${c[0]}.json`)) && files.size === cities.length && new Set(cities.map((c) => c[0])).size === cities.length,
  `${cities.length} guide cities, each with its own file and id`);
check(withQid / cities.length > 0.97 && withClimate / cities.length > 0.97 && withWv / cities.length > 0.8, `${withQid} with a Wikidata id, ${withClimate} with weather, ${withWv} with a Wikivoyage page`);
const city = (id) => { const c = cities.find((x) => x[0] === id); return c && { c, g: JSON.parse(fs.readFileSync(path.join(dir, 'c', `${id}.json`), 'utf8')) }; };
const climate = (c) => c[col('climate')];
const lima = city('lima'), madrid = city('madrid'), kyoto = city('kyoto'), mexico = city('mexico-city'), cusco = city('cuzco');
check(lima && lima.g.eat.some((d) => /ceviche/i.test(d[4])) && lima.c[col('wv_en')] === 'Lima' && lima.g.museums.length >= 3 && Math.max(...climate(lima.c).p) < 30,
  `Lima: ceviche to eat (${lima?.g.eat.slice(0, 4).map((d) => d[4]).join(', ')}…), ${lima?.g.museums.length} museums, Wikivoyage “Lima”, hardly any rain (${climate(lima.c).p.reduce((s, x) => s + x, 0)} mm a year)`);
const mb2 = G.bestMonths(climate(madrid.c));
check(madrid && madrid.g.museums.some((m) => m[0] === 'Q160112') && madrid.g.museums.some((m) => m[0] === 'Q460889') && madrid.g.whs.length >= 1 && mb2.length && !mb2.includes(0) && madrid.g.history.length >= 5,
  `Madrid: the Prado and the Reina Sofía, ${madrid?.g.whs.map((s) => s[2]).join('; ')}; best months ${mb2.map((m) => M[m]).join(', ')}; ${madrid?.g.history.length} story items`);
const kb = G.bestMonths(climate(kyoto.c));
check(kyoto && kyoto.g.whs.some((s) => /Kyoto/.test(s[2])) && kb.length && !kb.includes(7) && kyoto.g.museums.length >= 3,
  `Kyoto: ${kyoto?.g.whs.map((s) => s[2]).join('; ')}; best months ${kb.map((m) => M[m]).join(', ')} (not August)`);
check(mexico && mexico.g.museums.some((m) => m[0] === 'Q524249') && mexico.g.eat.length >= 3 && mexico.g.whs.length >= 1,
  `Mexico City: the National Museum of Anthropology among ${mexico?.g.museums.length} museums; ${mexico?.g.eat.length} dishes; ${mexico?.g.whs.length} World Heritage sites`);
check(cusco && /Cusco/.test(cusco.c[col('also')]) && cusco.g.whs.some((s) => /Cuzco|Cusco/.test(s[2])) && cusco.g.trips.some((s) => /Machu Picchu/.test(s[2])),
  `Cusco (as Cuzco, also “${cusco?.c[col('also')]}”): ${cusco?.g.whs.map((s) => s[2]).join('; ')}, and Machu Picchu a day trip away (${cusco?.g.trips.find((s) => /Machu/.test(s[2]))?.[1]} km)`);
const kinds = new Set(cities.flatMap((c) => JSON.parse(fs.readFileSync(path.join(dir, 'c', `${c[0]}.json`), 'utf8')).museums.map((m) => m[3])));
check(['art', 'history', 'science', 'other'].every((k) => kinds.has(k)), `museums of each kind: ${[...kinds].join(', ')}`);

console.log(fails ? `\n${fails} check(s) failed` : '\ntravel guide checks passed');
process.exit(fails ? 1 : 0);
