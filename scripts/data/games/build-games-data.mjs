#!/usr/bin/env node
/**
 * Reads the Wikipedia articles of every Games (downloaded by fetch-wiki.mjs into .cache/games/wiki/)
 * and writes scripts/data/games/_data/events.json: for each Olympics, its host, dates, nations,
 * athletes, events, who opened it and lit the flame, the teams that took part (with their athletes)
 * and the medal table; for each men's and women's World Cup, its hosts, dates, the teams in their
 * final ranking, the final and the top scorer. Every event lists the revisions it was read from.
 *
 *   node scripts/data/games/build-games-data.mjs            write _data/events.json
 *   node scripts/data/games/build-games-data.mjs --report   print a table to check it against
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENTS } from './games.mjs';
import { fileOf } from './fetch-wiki.mjs';
import { templates, template, section, plain, firstNumber, isoDate, dateRange, linkTarget, permalink } from './wikitext.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '_data/events.json');

function page(title) {
  const f = fileOf(title);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

/** Ranks of a medal table: by gold, then silver, then bronze; equal rows share a rank. */
function rankMedals(rows) {
  rows.sort((a, b) => b.g - a.g || b.s - a.s || b.b - a.b || a.code.localeCompare(b.code));
  rows.forEach((r, i) => { const p = rows[i - 1]; r.rank = p && p.g === r.g && p.s === r.s && p.b === r.b ? p.rank : i + 1; });
  return rows;
}

/** An Olympics: infobox, teams (flagIOC with athletes, in the participants list) and medal table. */
function olympics(e) {
  const main = page(e.main), med = page(e.medals);
  if (!main) return { error: `missing ${e.main}` };
  const w = main.wikitext;
  const box = template(w, 'Infobox Olympic games')?.named ?? {};
  const season = e.kind === 'summer' ? 'Summer' : 'Winter';
  // Participants: {{flagIOC|USA|1936 Summer|312}} (the number is the athletes it sent).
  const seen = new Map();
  // London 2012 lists them in a template of its own ({{2012 Summer Olympics Participating National Olympic Committees}}).
  const own = /\{\{\s*([^{}|]*Participating National Olympic Committees[^{}|]*)\}\}/.exec(w);
  const inc = own ? page(`Template:${own[1].trim()}`) : null;
  const text = inc ? `${w}\n${inc.wikitext}` : w;
  for (const t of [...templates(text, 'flagIOC'), ...templates(text, 'flag IOC')]) {
    const [code, games, n] = t.pos;
    if (!/^[A-Z0-9]{3}$/.test(code ?? '') || !new RegExp(`^${e.year}\\s+${season}$`).test(games ?? '')) continue;
    const a = /^[\d,]+$/.test(n ?? '') ? Number(n.replace(/,/g, '')) : null;
    if (a != null && !seen.has(code)) seen.set(code, a);
  }
  const teams = [...seen].map(([code, athletes]) => ({ code, athletes }));
  // The medal table: {{Medals table | gold_USA = 11 | silver_USA = 7 | bronze_USA = 2 | host_GRE = yes ...}}.
  const medals = [];
  let hostCodes = [];
  if (med) {
    const mt = templates(med.wikitext, 'Medals table').find((t) => Object.keys(t.named).some((k) => k.startsWith('gold_')));
    if (mt) {
      const codes = new Set(Object.keys(mt.named).filter((k) => /^(gold|silver|bronze)_[A-Z0-9]{3}$/.test(k)).map((k) => k.split('_')[1]));
      for (const code of codes) {
        const num = (k) => Number(plain(mt.named[`${k}_${code}`] ?? '0').replace(/\D/g, '') || 0);
        const row = { code, g: num('gold'), s: num('silver'), b: num('bronze') };
        if (mt.named[`name_${code}`]) row.name = plain(mt.named[`name_${code}`]);
        if (row.g + row.s + row.b) medals.push(row);
      }
      hostCodes = Object.keys(mt.named).filter((k) => /^host_[A-Z0-9]{3}$/.test(k) && /yes|true|1/i.test(mt.named[k])).map((k) => k.slice(5));
      if (!hostCodes.length && mt.named.host) hostCodes = plain(mt.named.host).split(/[,\s]+/).filter((x) => /^[A-Z0-9]{3}$/.test(x));
    }
  }
  const host = plain(box.host_city);
  return {
    id: e.id, kind: e.kind, year: e.year,
    host: { city: host, stadium: plain(box.stadium), stadiumTitle: linkTarget(box.stadium), codes: hostCodes },
    dates: [isoDate(box.opening, e.year), isoDate(box.closing, e.year)],
    nations: firstNumber(box.nations), athletes: firstNumber(box.athletes), athletesText: plain(box.athletes),
    events: firstNumber(box.events), eventsText: plain(box.events),
    openedBy: plain(box.opened_by), cauldron: plain(box.cauldron), motto: plain(box.motto),
    teams, medals: rankMedals(medals),
    sources: [main, med].filter(Boolean).map((p) => ({ title: p.title, url: permalink(p.title, p.revid) })),
  };
}

/** The teams of a World Cup in FIFA's final ranking ("Tournament ranking": team_order, status_XXX=H). */
function ranking(w) {
  const sec = section(w, 'Tournament ranking') ?? section(w, 'Final ranking') ?? section(w, 'Final standings') ?? '';
  const st = templates(sec, '#invoke:Sports table').find((t) => t.named.team_order || t.named.team1) ?? null;
  if (!st) return null;
  // Either team_order=URU, ARG, ... or team1=USA |team2=NOR ...
  const order = st.named.team_order
    ? plain(st.named.team_order).split(/\s*,\s*/).map((x) => x.trim()).filter((x) => /^[A-Z0-9]{3}$/.test(x))
    : Object.keys(st.named).filter((k) => /^team\d+$/.test(k)).sort((a, b) => Number(a.slice(4)) - Number(b.slice(4))).map((k) => plain(st.named[k])).filter((x) => /^[A-Z0-9]{3}$/.test(x));
  const hosts = Object.keys(st.named).filter((k) => /^status_[A-Z0-9]{3}$/.test(k) && /H/.test(st.named[k])).map((k) => k.slice(7));
  return { order, hosts };
}

/** A World Cup: infobox, teams in final ranking order, the final (score, venue, attendance) and the top scorer. */
function worldCup(e) {
  const main = page(e.main), fin = page(e.final);
  if (!main) return { error: `missing ${e.main}` };
  const w = main.wikitext;
  const box = template(w, 'Infobox international football competition')?.named ?? {};
  let rk = ranking(w);
  if (!rk) {
    // No ranking table (2019 Women's World Cup): the qualified teams, and the last four from the infobox.
    const quals = section(w, 'Qualified teams') ?? section(w, 'List of qualified teams') ?? '';
    const codes = [], hosts = [];
    for (const line of quals.split('\n')) {
      const t = templates(line, 'fbw')[0] ?? templates(line, 'fb')[0];
      const code = t?.pos[0];
      if (!code || !/^[A-Z0-9]{3}$/.test(code) || codes.includes(code)) continue;
      codes.push(code);
      if (/\(hosts?\)/i.test(line)) hosts.push(code);
    }
    const podium = ['champion', 'second', 'third', 'fourth'].map((k) => {
      const v = box[`${k}_other`] ?? box[k] ?? '';
      return (templates(v, 'fbw')[0] ?? templates(v, 'fb')[0])?.pos[0] ?? plain(v);
    });
    if (podium.every((c) => codes.includes(c))) rk = { order: [...podium, ...codes.filter((c) => !podium.includes(c))], hosts, partial: 4 };
  }
  const final = {};
  if (fin) {
    const fb = template(fin.wikitext, 'Infobox football match')?.named ?? {};
    Object.assign(final, {
      title: fin.title, team1: plain(fb.team1), team2: plain(fb.team2), score: plain(fb.score ?? (fb.team1score != null ? `${fb.team1score}–${fb.team2score}` : '')),
      details: plain(fb.details), date: isoDate(fb.date, e.year), stadium: plain(fb.stadium), stadiumTitle: linkTarget(fb.stadium), city: plain(fb.city),
      attendance: firstNumber(fb.attendance), referee: plain(fb.referee), motm: plain(fb.man_of_the_match ?? fb.man_of_the_match1a ?? fb.player_of_the_match),
      raw: Object.fromEntries(Object.entries(fb).filter(([k]) => /score|aet|penalt|extra|result/i.test(k)).map(([k, v]) => [k, plain(v)])),
    });
  }
  const dates = plain(box.dates);
  return {
    id: e.id, kind: e.kind, year: e.year,
    host: { country: plain(box.country), city: plain(box.city), codes: rk?.hosts ?? [], stadium: final.stadium ?? null, stadiumTitle: final.stadiumTitle ?? null },
    dates: dateRange(box.dates, e.year), datesText: dates,
    nations: firstNumber(box.num_teams), teams: (rk?.order ?? []).map((code, i) => (rk.partial && i >= rk.partial ? { code } : { code, place: i + 1 })),
    podium: ['champion', 'second', 'third', 'fourth'].map((k) => plain(box[k])),
    matches: firstNumber(box.matches), goals: firstNumber(box.goals), attendance: firstNumber(box.attendance),
    topScorer: plain(box.top_scorer), bestPlayer: plain(box.player), final,
    sources: [main, fin].filter(Boolean).map((p) => ({ title: p.title, url: permalink(p.title, p.revid) })),
  };
}

/** Teams that are not one of today's countries: their medals are not given to anyone (as the filter always said). */
const PAST = new Set(['URS', 'EUN', 'EUA', 'FRG', 'GDR', 'SAA', 'TCH', 'YUG', 'SCG', 'IOP', 'ANZ', 'BOH', 'RU1', 'BWI', 'ROC', 'OAR', 'AIN', 'IOA', 'EOR', 'ROT', 'ZZX', 'COR', 'AHO', 'NBO', 'MAL', 'RHO', 'YAR', 'YMD', 'RAU', 'UAR', 'IOP']);

/**
 * Every country's Olympic medals of all time, Summer and Winter, from Wikipedia's "All-time Olympic
 * Games medal table" (it leaves out art competitions and counts stripped medals as the IOC does).
 * → _data/medals-alltime.json: { source, through, iso: { USA: [gold, silver, bronze] }, past: [codes] }.
 */
function allTime() {
  const p = page('All-time Olympic Games medal table');
  if (!p) return null;
  const codes = JSON.parse(fs.readFileSync(path.join(HERE, '_codes.json'), 'utf8')).ioc;
  const w = p.wikitext;
  const list = w.slice(w.indexOf('==List of NOCs with medals'), w.indexOf('==List of NOCs without medals'));
  const iso = {}, past = [], unknown = [];
  for (const row of list.split('\n|-')) {
    const m = /\{\{flag ?IOC\|([A-Z0-9]{3})/.exec(row);
    if (!m) continue;
    const body = row.slice(m.index + m[0].length).replace(/\{\{[^{}]*\}\}/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>|<ref[^>]*\/>/g, '').replace(/style="[^"]*"\s*\|/g, '');
    const nums = [...body.matchAll(/(?<![\w#])(\d[\d,]*)(?!\w)/g)].map((x) => Number(x[1].replace(/,/g, '')));
    if (nums.length < 15) continue;
    const [, g, sv, b] = nums.slice(-5); // the combined total: games, gold, silver, bronze, total
    const code = m[1];
    if (PAST.has(code)) { past.push(code); continue; }
    // A code's countries today (codes whose meaning changed, like RUS for the Russian Empire before 1920, by their latest).
    let u = codes[code]?.units;
    if (Array.isArray(u) && Array.isArray(u[0])) u = u.find(([from, to]) => 2026 >= from && 2026 <= to)?.[2];
    if (!Array.isArray(u) || u.length !== 1 || typeof u[0] !== 'string' || u[0].startsWith('@')) { unknown.push(code); continue; }
    const t = (iso[u[0]] ??= [0, 0, 0]);
    t[0] += g; t[1] += sv; t[2] += b;
  }
  if (unknown.length) console.warn(`all-time medals: no country for ${unknown.join(', ')}`);
  return { source: { title: p.title, url: permalink(p.title, p.revid) }, through: 'Milano Cortina 2026', iso, past };
}

function main() {
  const report = process.argv.includes('--report');
  const out = {};
  for (const e of EVENTS) {
    const d = e.kind === 'summer' || e.kind === 'winter' ? olympics(e) : worldCup(e);
    out[e.id] = d;
    if (report) {
      if (d.error) { console.log(`${e.id.padEnd(12)} ${d.error}`); continue; }
      if (d.medals) {
        const top = d.medals.slice(0, 3).map((m) => `${m.code} ${m.g}/${m.s}/${m.b}`).join(', ');
        console.log(`${e.id.padEnd(12)} ${String(d.host.city).padEnd(28)} ${d.dates.join('…').padEnd(22)} nations ${String(d.nations).padStart(3)} teams ${String(d.teams.length).padStart(3)} medals ${String(d.medals.length).padStart(3)} host ${d.host.codes.join('+') || '?'} | ${top}`);
      } else {
        console.log(`${e.id.padEnd(12)} ${String(d.host.country).padEnd(28)} ${d.dates.join('…').padEnd(22)} teams ${String(d.nations).padStart(3)} ranked ${String(d.teams.length).padStart(3)} host ${d.host.codes.join('+') || '?'} | ${d.teams.slice(0, 4).map((x) => x.code).join(' ')} | final ${d.final.team1 ?? ''} ${d.final.score ?? ''} ${d.final.team2 ?? ''} @ ${d.final.stadium ?? ''}`);
      }
    }
  }
  if (!report) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
    console.log(`wrote ${path.relative(process.cwd(), OUT)} (${Object.keys(out).length} events)`);
    const at = allTime();
    if (at) {
      fs.writeFileSync(path.join(HERE, '_data/medals-alltime.json'), `${JSON.stringify(at, null, 1)}\n`);
      console.log(`wrote _data/medals-alltime.json (${Object.keys(at.iso).length} countries)`);
    }
  }
}

main();
