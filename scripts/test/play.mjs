// Checks the map games' logic (src/play/route.ts and score.ts, v0.24.0) on the real border graph
// (public/data/play/borders.json): known routes and their par for each goal, the odd borders (exclaves, overseas
// regions, tunnels), every knowledge round playable, rounds of each level, the daily route the same on every
// device and different each day, scoring and stars, and the challenge link. Then the other six games' rules
// (src/play/logic.ts, v0.25.0): Pin it's points and places (public/data/play/pins.json), Higher or lower's pairs,
// Grand tour's best order (against every order), Name them all's score and typed capitals, Border chain and Outline.
// Usage: node scripts/test/play.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { rolldown } = await import('rolldown');
const load = async (f) => {
  const bundle = await rolldown({ input: path.join(ROOT, f), platform: 'neutral', logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
};
const R = await load('src/play/route.ts');
const S = await load('src/play/score.ts');
const G = await load('src/play/logic.ts');
const P = await load('src/mydata/parse.ts');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/play/borders.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/base/countries-meta.json'), 'utf8'));
const nm = (p) => p.map((x) => meta[x]?.n ?? x).join(' › ');
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };

const g = new R.Borders(data);
const between = (r) => (r ? r.path.length - 2 : -1);

// Known routes.
const a = g.best('ESP', 'CHN', 'count'), b = g.best('ESP', 'CHN', 'people');
check(between(a) === 4 && between(b) > between(a) && b.cost < g.cost(a.path, 'people'), `Spain → China: fewest countries ${between(a)} (${nm(a.path)}); fewest people ${between(b)}, ${(b.cost / 1e6).toFixed(0)} M (${nm(b.path)})`);
const c = g.best('NOR', 'IND', 'count'), d = g.best('NOR', 'IND', 'people');
check(between(c) === 2 && between(d) >= 4, `Norway → India: ${between(c)} in between (${nm(c.path)}); fewest people: ${nm(d.path)}`);
const e = g.best('MEX', 'ARG', 'count'), f = g.best('MEX', 'ARG', 'count', R.RULES.find((x) => x.id === 'spa'));
check(between(e) === 7 && e.path.includes('BRA') && f && !f.path.includes('BRA'), `Mexico → Argentina: ${nm(e.path)}; only Spanish-speaking: ${f && nm(f.path)}`);
const k = g.best('PRT', 'VNM', 'km');
check(k && k.cost > 9000 && k.cost < 20000, `Portugal → Vietnam, shortest by capitals: ${Math.round(k?.cost ?? 0).toLocaleString('en')} km (${k && nm(k.path)})`);

// Odd borders.
check(g.borders('POL', 'RUS') && g.note('POL', 'RUS') === 'kaliningrad' && g.borders('AZE', 'TUR') && g.borders('AGO', 'COG'), 'exclaves count, with their note: Poland–Russia (Kaliningrad), Azerbaijan–Turkey, Angola–Congo');
const go = new R.Borders(data, { overseas: true });
check(!g.borders('FRA', 'BRA') && go.borders('FRA', 'BRA') && go.borders('ESP', 'MAR') && !g.borders('ESP', 'MAR'), 'overseas regions (French Guiana, Ceuta and Melilla) count only when turned on');
check(g.borders('FRA', 'GBR') && g.note('FRA', 'GBR') === 'channel' && g.borders('DNK', 'SWE') && g.borders('BHR', 'SAU') && g.borders('MYS', 'SGP'), 'tunnels and bridges count: the Channel Tunnel, Øresund, King Fahd, Johor');
check(!g.borders('IND', 'LKA') && !data.countries.KAS && g.borders('BWA', 'ZMB'), 'no India–Sri Lanka (sea), no Siachen Glacier; Botswana–Zambia at Kazungula');
const main = g.reach('FRA');
check(main.has('ZAF') && main.has('CHN') && main.has('GBR') && !main.has('USA') && !main.has('AUS'), `Afro-Eurasia is one piece of ${main.size} countries; the Americas and Australia are apart`);

// Knowledge rounds.
for (const rule of R.RULES) {
  const r = R.makeRound(g, R.seeded(`test:${rule.id}`), { goal: 'count', level: 'medium', rule });
  const best = r && g.best(r.from, r.to, 'count', rule);
  check(!!best && best.path.every((x) => g.allowed(rule, x)) && between(best) >= 2, `${rule.en}: ${best ? nm(best.path) : 'no round'}`);
}
// Each goal and level.
for (const level of ['easy', 'medium', 'hard']) for (const goal of R.GOALS) {
  const r = R.makeRound(g, R.seeded(`test:${level}:${goal}`), { goal, level });
  check(!!r, `${level} ${goal}: ${r ? `${meta[r.from].n} → ${meta[r.to].n}, ${between(g.best(r.from, r.to, 'count'))} in between` : 'no round'}`);
}
const eu = R.makeRound(g, R.seeded('test:eu'), { goal: 'count', level: 'easy', continent: 'EU' });
check(eu && data.countries[eu.from].ct === 'EU' && data.countries[eu.to].ct === 'EU', `a round in Europe: ${eu && `${meta[eu.from].n} → ${meta[eu.to].n}`}`);

// The daily route.
const days = Array.from({ length: 30 }, (_, i) => { const t = new Date(Date.UTC(2026, 10, 14 + i)); return t.toISOString().slice(0, 10); });
const rounds = days.map((day) => R.dailyRound(g, day, S.hopNumber(day)));
const again = R.dailyRound(g, days[3], S.hopNumber(days[3]));
check(rounds.every(Boolean) && JSON.stringify(again) === JSON.stringify(rounds[3]) && new Set(rounds.map((r) => `${r.from}${r.to}`)).size >= 28,
  `30 daily routes, each the same on every device and almost all different (#${S.hopNumber(days[0])} ${days[0]}: ${meta[rounds[0].from].n} → ${meta[rounds[0].to].n}, ${rounds[0].goal}${rounds[0].rule ? `, ${rounds[0].rule}` : ''})`);
check(new Set(rounds.map((r) => r.goal)).size === 4 && rounds.filter((r) => r.rule).length >= 8, `the daily goals turn (${[...new Set(rounds.map((r) => r.goal))].join(', ')}); ${rounds.filter((r) => r.rule).length} knowledge days`);

// Scoring.
const s1 = S.scoreOf(4, 4), s2 = S.scoreOf(4, 5, [], true), s3 = S.scoreOf(4, 7, [], true), s4 = S.scoreOf(4, 4, ['names', 'step']), s5 = S.scoreOf(100, 112), s6 = S.scoreOf(4, 40, ['names', 'filter', 'step'], true);
check(s1.score === 1000 && s1.stars === 3 && s2.score === 800 && s2.stars === 2 && s3.score === 571 && s3.stars === 1, `par 4: 4 → ${s1.score} ${S.starText(s1.stars)}, 5 → ${s2.score} ${S.starText(s2.stars)}, 7 → ${s3.score} ${S.starText(s3.stars)}`);
const s7 = S.scoreOf(4, 4, ['names']);
check(s4.score === 550 && s4.stars === 1 && s7.score === 850 && s7.stars === 2 && s5.stars === 2 && s6.score === 0, `hints cost points and stars (names: ${s7.score} ${S.starText(s7.stars)}; names and the next step: ${s4.score} ${S.starText(s4.stars)}); within 15 % is two stars; never below 0`);

// The challenge link.
const link = S.challengeHash({ from: 'ESP', to: 'CHN', goal: 'people', rule: null, overseas: false, beat: 870 });
const back = S.readChallenge(`#${link}`);
check(back && back.from === 'ESP' && back.to === 'CHN' && back.goal === 'people' && back.beat === 870 && !back.overseas && S.readChallenge('#hop=xx') === null, `a challenge link carries the round and the score (#${link})`);

// ---- The other six games (v0.25.0)

// Pin it.
const pp = [0, 25, 500, 1500, 2000, 20000].map(G.pinPoints);
check(pp[0] === 5000 && pp.every((v, i) => i === 0 || v < pp[i - 1]) && Math.abs(pp[2] - 3583) <= 1 && Math.abs(pp[3] - 1839) <= 1 && pp[5] === 0 && G.pinPoints(-5) === 5000,
  `Pin it: ${[0, 25, 500, 1500, 2000, 20000].map((d, i) => `${d} km → ${pp[i]}`).join(', ')}`);
const five = (d) => 5 * G.pinPoints(d);
check(G.pinStars(five(0)) === 3 && G.pinStars(five(100)) === 3 && G.pinStars(five(600)) === 2 && G.pinStars(five(2500)) === 1, `Pin it stars: five pins 100 km off ${S.starText(G.pinStars(five(100)))}, 600 km ${S.starText(G.pinStars(five(600)))}, 2,500 km ${S.starText(G.pinStars(five(2500)))}`);
const pins = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/play/pins.json'), 'utf8')).packs;
const packNames = ['capitals', 'heritage', 'structures', 'dishes', 'inventions', 'museums', 'battles'];
const badPin = Object.values(pins).flat().filter((p) => !p[0] || !p[1] || !(Math.abs(p[2]) <= 180) || !(Math.abs(p[3]) <= 90) || !p[4]);
const quito = pins.capitals.find((p) => p[0] === 'Quito'), paris = pins.capitals.find((p) => p[0] === 'Paris');
check(packNames.every((k) => pins[k]?.length >= 40) && !badPin.length && pins.capitals.length >= 190 && pins.capitals.length <= 200 && quito && G.km([quito[2], quito[3]], [-78.5, -0.2]) < 30 && paris && paris[5] === 'France' && paris[6] === 'Francia',
  `Pin it's places: ${packNames.map((k) => `${k} ${pins[k]?.length}`).join(', ')}; each with names, a place and an icon; Quito where it is, Paris noted as France`);

// Higher or lower.
check(G.hiloPoints(100, 99, 0) > G.hiloPoints(100, 10, 0) && G.hiloPoints(100, 10, 10) === 2 * G.hiloPoints(100, 10, 0) && G.hiloPoints(5, 5, 0) === 300, `Higher or lower: a close pair is worth more (${G.hiloPoints(100, 99, 0)} vs ${G.hiloPoints(100, 10, 0)}), a run of ten doubles it`);
const values = Object.entries(meta).filter(([, m]) => m.pop > 1e6).map(([id, m]) => [id, m.pop]);
const rank = new Map([...values].sort((x, y) => x[1] - y[1]).map(([id], i) => [id, i]));
const gap = (run) => { const r = R.seeded(`hilo-test:${run}`); let t = 0; for (let i = 0; i < 200; i++) { const p = G.hiloPair(r, values, run); t += Math.abs(rank.get(p[0]) - rank.get(p[1])); } return t / 200; };
const pairs = Array.from({ length: 300 }, (_, i) => G.hiloPair(R.seeded(`hp:${i}`), values, i % 12));
const fair = pairs.every((p) => p && p[0] !== p[1] && Math.min(meta[p[0]].pop, meta[p[1]].pop) / Math.max(meta[p[0]].pop, meta[p[1]].pop) <= 0.9);
const same = JSON.stringify(G.hiloPair(R.seeded('hilo:2026-11-15'), values, 0)) === JSON.stringify(G.hiloPair(R.seeded('hilo:2026-11-15'), values, 0));
check(fair && same && gap(10) < gap(0) / 2 && G.hiloStars(10) === 3 && G.hiloStars(5) === 2 && G.hiloStars(4) === 1, `Higher or lower pairs: always 10 % apart, the same for the same seed, closer as the run grows (rank gap ${gap(0).toFixed(0)} at first, ${gap(10).toFixed(0)} after ten)`);

// Grand tour: the best order against every order.
const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
let tourOk = true;
for (let t = 0; t < 12; t++) {
  const r = R.seeded(`tour-test:${t}`), n = 4 + (t % 4);
  const pts = Array.from({ length: n }, () => [r() * 360 - 180, r() * 140 - 70]);
  const cost = (i, j) => G.km(pts[i], pts[j]);
  const best = G.bestTour(n, cost);
  const brute = Math.min(...perms(Array.from({ length: n - 1 }, (_, i) => i + 1)).map((p) => G.tourCost([0, ...p], cost)));
  if (Math.abs(best.cost - brute) > 1e-6 || best.order[0] !== 0 || new Set(best.order).size !== n || Math.abs(G.tourCost(best.order, cost) - best.cost) > 1e-6) tourOk = false;
}
check(tourOk, 'Grand tour: the best order from the first stop matches trying every order (12 tours of 4 to 7 stops)');

// Name them all.
const n1 = G.namesScore(10, 10, 30), n2 = G.namesScore(7, 10, 30), n3 = G.namesScore(6, 10, 0);
check(n1.score === 1060 && n1.stars === 3 && n2.score === 700 && n2.stars === 2 && n3.stars === 1 && G.namesTime(3) === 60 && G.namesTime(15) === 150 && G.namesTime(54) === 300,
  `Name them all: all 10 with 30 s left ${n1.score} ${S.starText(n1.stars)}, 7 of 10 ${n2.score} ${S.starText(n2.stars)}; 60 s to 5 min on the clock`);
const cm = G.capitalNames(['Mexico City', 'Ciudad de México'], P.norm), cb = G.capitalNames(['Bogotá', 'Bogotá'], P.norm), cw = G.capitalNames(['Washington, D.C.', null], P.norm);
check(cm.has(P.norm('mexico city')) && cm.has(P.norm('México')) && cb.has(P.norm('bogota')) && [...cw].some((x) => x.startsWith(P.norm('washington'))), `typed capitals match without accents or "Ciudad de" (${[...cm].join(', ')}; ${[...cb].join(', ')})`);

// Border chain and Outline.
check(G.chainScore(1, 1) === 0 && G.chainScore(15, 2) === 1600 && G.chainStars(15) === 3 && G.chainStars(8) === 2 && G.chainStars(7) === 1, `Border chain: 15 countries over two continents ${G.chainScore(15, 2)} ${S.starText(G.chainStars(15))}`);
check(G.outlinePoints(1) === 1000 && G.outlinePoints(3) === 500 && G.outlinePoints(5) === 150 && G.outlinePoints(6) === 0 && G.outlineStars(5000) === 3 && G.outlineStars(2500) === 2 && G.outlineStars(1000) === 1,
  `Outline: 1,000 at the first try, 500 at the third, 150 at the fifth; five at the first try ${S.starText(G.outlineStars(5000))}`);
check(G.GAMES.length === 7 && G.GAMES[0] === 'hop' && new Set(G.GAMES).size === 7, `seven map games: ${G.GAMES.join(', ')}`);

console.log(fails ? `\n${fails} check(s) failed` : '\nmap-game checks passed');
process.exit(fails ? 1 : 0);
