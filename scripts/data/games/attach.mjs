// Games of the world: what a story step that is a Games or a World Cup ("games": "summer-1936")
// shows. build-conflicts.mjs calls attachGames() for the games collection; it gives each such step
// its teams (the countries each one colours, how it took part, its medals or place, where its arc to
// the host starts) and a marker for the host city with the Games' facts and medal table.
//
// Data: _data/events.json (build-games-data.mjs, from Wikipedia), _codes.json (IOC and FIFA codes →
// today's countries), _hosts.json (host names in English and Spanish, the stadium) and _away.json
// (who boycotted, withdrew or was kept out, and why).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature, merge } from 'topojson-client';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const readIf = (f, empty) => (fs.existsSync(f) ? readJSON(f) : empty);

let data = null;
function load() {
  if (!data) {
    data = {
      events: readJSON(path.join(HERE, '_data/events.json')),
      codes: readJSON(path.join(HERE, '_codes.json')),
      hosts: readIf(path.join(HERE, '_hosts.json'), {}),
      // GAMES_NO_AWAY=1 builds without the boycotts (to publish stories while _away.json is still being checked).
      away: process.env.GAMES_NO_AWAY ? {} : readIf(path.join(HERE, '_away.json'), {}),
      meta: readJSON(path.join(ROOT, 'public/data/base/countries-meta.json')),
    };
  }
  return data;
}

/** The ids of every Games (summer-1896 … wwc-2023). */
export function gamesIds() { return new Set(Object.keys(load().events)); }

const OLY = new Set(['summer', 'winter']);

/** The sides (legend) a games story gets, by the kinds of Games it has. */
export function gamesSides(kinds) {
  const oly = [...kinds].some((k) => OLY.has(k)), fb = [...kinds].some((k) => !OLY.has(k));
  const sides = [{ id: 'g_host', name: { en: 'Host', es: 'Sede' }, color: '#f0b429' }];
  if (fb) sides.push({ id: 'g_champion', name: { en: 'Champions', es: 'Campeón' }, color: '#2e9e5b' }, { id: 'g_runnerup', name: { en: 'Runners-up', es: 'Subcampeón' }, color: '#94d0a2' });
  if (oly) sides.push({ id: 'g_medals', name: { en: 'Won medals', es: 'Ganó medallas' }, color: '#2f78c4' });
  sides.push({ id: 'g_took', name: { en: 'Took part', es: 'Participó' }, color: '#9cc9ee' });
  sides.push({ id: 'g_boycott', name: oly && fb ? { en: 'Boycotted or withdrew', es: 'Boicoteó o se retiró' } : oly ? { en: 'Boycotted', es: 'Boicoteó' } : { en: 'Withdrew or boycotted', es: 'Se retiró o boicoteó' }, color: '#d9534f' });
  sides.push({ id: 'g_banned', name: { en: 'Banned or not invited', es: 'Excluido o no invitado' }, color: '#7d6aa8' });
  return sides;
}

// Areas that are not countries of today, drawn from the regions of the "States and provinces" quiz.
const EAST = ['Brandenburg', 'Mecklenburg-Western Pomerania', 'Saxony', 'Saxony-Anhalt', 'Thuringia', 'Berlin'];
const UK_OTHERS = ['Scotland', 'Wales', 'Northern Ireland'];
const CUSTOM = {
  'GB-ENG': ['GBR', (n) => !UK_OTHERS.includes(n)],
  'GB-SCT': ['GBR', (n) => n === 'Scotland'],
  'GB-WLS': ['GBR', (n) => n === 'Wales'],
  'GB-NIR': ['GBR', (n) => n === 'Northern Ireland'],
  'DE-E': ['DEU', (n) => EAST.includes(n)],
  'DE-W': ['DEU', (n) => !EAST.includes(n) && n !== 'Saarland'],
  'DE-SAAR': ['DEU', (n) => n === 'Saarland'],
  'MY-MAL': ['MYS', (n) => !['Sabah', 'Sarawak', 'Labuan'].includes(n)],
  'MY-NBO': ['MYS', (n) => ['Sabah', 'Labuan'].includes(n)],
};
const customCache = new Map();
/** A drawn area ("GB-ENG") as a MultiPolygon. */
function customArea(name) {
  if (!customCache.has(name)) {
    const def = CUSTOM[name];
    if (!def) throw new Error(`unknown area "@${name}" in games/_codes.json`);
    const topo = readJSON(path.join(ROOT, `public/data/regions/${def[0]}.json`));
    const geoms = topo.objects.regions.geometries.filter((g) => def[1](g.properties.n));
    if (!geoms.length) throw new Error(`area "@${name}": no region matches`);
    const g = merge(topo, geoms);
    customCache.set(name, g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
  }
  return customCache.get(name);
}

/** A team's code → its row in codes.json (IOC for Olympics, FIFA for World Cups). */
function codeRow(kind, code) { return load().codes[OLY.has(kind) ? 'ioc' : 'fifa'][code]; }

/** A team's own name in a year, when it is not a country of today: { en, es } or null. */
function nameIn(row, year) {
  const hit = row?.names?.find(([from, to]) => year >= from && year <= to);
  if (hit) return { en: hit[2], es: hit[3] };
  return row?.en ? { en: row.en, es: row.es } : null;
}

/** The units of a row in a year: today's countries (ISO A3) and "@areas". */
function unitsOf(row, year) {
  if (!row) return [];
  const u = row.units ?? [];
  if (u.length && Array.isArray(u[0])) {
    const hit = u.find(([from, to]) => year >= from && year <= to);
    return hit ? hit[2] : [];
  }
  return u;
}

const round = (p) => p.map((v) => Math.round(v * 100) / 100);
const fmtInt = (n, es) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, es ? ' ' : ',');

/**
 * Gives every step that names a Games its teams, and shows the host city's marker on it.
 * `addItem(item, step)` adds a marker to the story (its index); `addArea(mp)` a drawn area (its index).
 */
export function attachGames(c, steps, { addItem, addArea, warn }) {
  const d = load();
  steps.forEach((st, i) => {
    const id = st.games;
    if (id == null) return;
    const e = d.events[id];
    const where = `${c.id} steps[${i}] (${id})`;
    if (!e || e.error) throw new Error(`${where}: no data for this Games (run build-games-data.mjs)`);
    const host = d.hosts[id];
    if (!host) throw new Error(`${where}: missing from games/_hosts.json`);
    const oly = OLY.has(e.kind);
    const areaIdx = new Map();
    const unit = (u) => {
      if (!u.startsWith('@')) {
        if (!d.meta[u]) throw new Error(`${where}: "${u}" is not a country of the base map`);
        return u;
      }
      if (!areaIdx.has(u)) areaIdx.set(u, `#${addArea(customArea(u.slice(1)))}`);
      return areaIdx.get(u);
    };
    const origin = (row, units) => {
      if (row?.o) return round(row.o);
      const iso = units.find((x) => !x.startsWith('@'));
      return iso && d.meta[iso] ? round([d.meta[iso].lx, d.meta[iso].ly]) : undefined;
    };
    const teams = [];
    const taken = new Map(); // unit → code that colours it
    const add = (code, part) => {
      const row = codeRow(e.kind, code);
      if (!row) throw new Error(`${where}: code ${code} is not in games/_codes.json (${oly ? 'ioc' : 'fifa'})`);
      const units = unitsOf(row, e.year);
      // The same team under an older code (ROM and ROU for Romania): one team, with its athletes.
      const ks = units.map(unit);
      const owner = ks.length ? taken.get(ks[0]) : null;
      if (owner && ks.every((k) => taken.get(k) === owner) && part.s !== 'g_boycott' && part.s !== 'g_banned') {
        const tm = teams.find((x) => x.c === owner);
        if (part.a && !tm.a) tm.a = part.a;
        return tm;
      }
      const mine = [];
      for (const u of units) {
        const k = unit(u);
        if (taken.has(k)) { warn?.(`${where}: ${code} and ${taken.get(k)} both colour ${u}; ${taken.get(k)} keeps it`); continue; }
        taken.set(k, code); mine.push(k);
      }
      const tm = { c: code, u: mine, ...part };
      const own = nameIn(row, e.year);
      if (own) tm.n = own;
      const o = part.s === 'g_boycott' || part.s === 'g_banned' ? undefined : origin(row, units);
      if (o) tm.o = o;
      teams.push(tm);
      return tm;
    };
    const hosts = new Set(e.host.codes);
    if (oly) {
      const med = new Map(e.medals.map((m) => [m.code, m]));
      const athletes = new Map(e.teams.map((t) => [t.code, t.athletes]));
      // Medal winners first (in the table's order), then the rest by code.
      const codes = [...new Set([...e.medals.map((m) => m.code), ...[...athletes.keys()].sort()])];
      for (const code of codes) {
        const m = med.get(code);
        const part = { s: hosts.has(code) ? 'g_host' : m ? 'g_medals' : 'g_took' };
        if (m) { part.m = [m.g, m.s, m.b]; part.r = m.rank; }
        if (athletes.get(code)) part.a = athletes.get(code);
        if (hosts.has(code)) part.h = 1;
        add(code, part);
      }
    } else {
      for (const t of e.teams) {
        const part = { s: t.place === 1 ? 'g_champion' : hosts.has(t.code) ? 'g_host' : t.place === 2 ? 'g_runnerup' : 'g_took', r: t.place };
        if (hosts.has(t.code)) part.h = 1;
        add(t.code, part);
      }
    }
    for (const a of d.away[id] ?? []) {
      const was = teams.findIndex((tm) => tm.c === a.code);
      if (was >= 0) {
        // It took part only in a small part, before it stayed away (1956: riders at Stockholm, then the
        // Melbourne boycott): it is shown as staying away.
        if (!a.override) throw new Error(`${where}: ${a.code} took part, so it can't be in _away.json (unless "override": true)`);
        for (const k of teams[was].u) taken.delete(k);
        teams.splice(was, 1);
      }
      add(a.code, { s: a.s === 'banned' ? 'g_banned' : 'g_boycott', why: a.why });
    }
    // The host city's marker: the main stadium (or the final's), with the Games' facts.
    const champion = !oly ? e.teams.find((t) => t.place === 1) : null;
    const nameOf = (code, lang) => {
      const row = codeRow(e.kind, code);
      const own = nameIn(row, e.year);
      if (own) return own[lang];
      const iso = unitsOf(row, e.year)[0];
      return lang === 'es' ? d.meta[iso]?.es : d.meta[iso]?.sn ?? d.meta[iso]?.n;
    };
    const facts = [];
    const fact = (en, es, ven, ves) => facts.push({ label: { en, es }, value: { en: ven, es: ves ?? ven } });
    if (oly) {
      if (e.nations) fact('Nations', 'Países', fmtInt(e.nations), fmtInt(e.nations, true));
      if (e.athletes) fact('Athletes', 'Atletas', fmtInt(e.athletes), fmtInt(e.athletes, true));
      if (e.events) fact('Events', 'Pruebas', fmtInt(e.events), fmtInt(e.events, true));
    } else {
      fact('Teams', 'Selecciones', String(e.nations ?? e.teams.length));
      if (host.final) fact('Final', 'Final', host.final.en, host.final.es);
      if (e.matches) fact('Matches', 'Partidos', String(e.matches));
      if (e.goals) fact('Goals', 'Goles', String(e.goals));
      if (host.scorer) fact('Top scorer', 'Máximo goleador', host.scorer.en, host.scorer.es);
    }
    const text = oly
      ? {
        en: `${fmtInt(e.athletes ?? 0)} athletes from ${e.nations} nations competed in ${e.events} events.`,
        es: `${fmtInt(e.athletes ?? 0, true)} atletas de ${e.nations} países compitieron en ${e.events} pruebas.`,
      }
      : {
        en: `${e.nations ?? e.teams.length} teams played; ${nameOf(champion.code, 'en')} won the cup.`,
        es: `Jugaron ${e.nations ?? e.teams.length} selecciones; ${nameOf(champion.code, 'es')} ganó la copa.`,
      };
    if (oly && !e.athletes) { text.en = `${e.nations} nations competed in ${e.events} events.`; text.es = `${e.nations} países compitieron en ${e.events} pruebas.`; }
    const item = {
      id: `games-${id}`, name: host.name, at: host.at, cat: e.kind === 'summer' ? 'summer' : e.kind === 'winter' ? 'winter' : 'football',
      type: 'games', date: e.dates[0] ?? String(e.year), place: host.place, text: host.text ?? text, facts,
    };
    // The top four (medal table or final ranking): the "Who won?" quiz asks for the first.
    const top = oly ? [...e.medals].sort((a, b) => a.rank - b.rank).slice(0, 4).map((m) => m.code) : e.teams.filter((t) => t.place && t.place <= 4).sort((a, b) => a.place - b.place).map((t) => t.code);
    item.podium = top.map((code) => {
      const row = codeRow(e.kind, code), units = unitsOf(row, e.year);
      const one = !nameIn(row, e.year) && units.length === 1 && !units[0].startsWith('@') ? d.meta[units[0]] : null;
      return { c: code, n: { en: nameOf(code, 'en'), es: nameOf(code, 'es') }, ...(one?.a2 ? { a2: one.a2 } : {}) };
    });
    if (e.dates[1] && e.dates[1] !== e.dates[0]) item.end = e.dates[1];
    if (host.icon) item.icon = host.icon;
    if (host.wiki) item.wiki = host.wiki;
    if (host.img) item.img = host.img;
    const k = addItem(item, i);
    st.show = [...new Set([k, ...(st.show ?? [])])];
    st.games = { id, kind: e.kind, name: host.name, host: host.at, teams, nations: e.nations ?? teams.length };
    if (!st.camera) st.camera = { lon: host.at[0], lat: Math.max(-25, Math.min(42, host.at[1])), zoom: 1 };
  });
}
