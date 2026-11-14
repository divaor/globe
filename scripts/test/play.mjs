// Checks the map games' logic (src/play/route.ts and score.ts, v0.24.0) on the real border graph
// (public/data/play/borders.json): known routes and their par for each goal, the odd borders (exclaves, overseas
// regions, tunnels), every knowledge round playable, rounds of each level, the daily route the same on every
// device and different each day, scoring and stars, and the challenge link.
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

console.log(fails ? `\n${fails} check(s) failed` : '\nmap-game checks passed');
process.exit(fails ? 1 : 0);
