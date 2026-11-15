// Who was born here? (v0.28.0): where the world's best-known people were born, from Wikidata (CC0).
//
//   node scripts/data/born/build-born.mjs --fetch   asks Wikidata (about twenty short questions; answers kept in
//                                                   .cache/born) and writes scripts/data/born/wikidata-people.json
//   node scripts/data/born/build-born.mjs           builds public/data/born/people.json
//   node scripts/data/born/build-born.mjs --check   in check:data: fails if that file is out of date, or a known
//                                                   person is missing or misplaced
//
// The people: every human with articles in MIN_LINKS Wikipedias or more and a place of birth with coordinates, the
// best known first, about 12,000. Each keeps a name in English and Spanish, the years of birth and death, where
// they were born and (if they have died) where they died, and a field worked out from their occupations.
// Living people are listed by birthplace only: never where they live.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask, val, qidOf, point, yearOf } from '../lives/wdqs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HERE = path.join(ROOT, 'scripts/data/born');
const CACHE = path.join(ROOT, '.cache/born');
const OUT = path.join(ROOT, 'public/data/born/people.json');
const RAW = path.join(HERE, 'wikidata-people.json');
const args = process.argv.slice(2);
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const TARGET = 13_000;

/** The fields, in the order the app lists them. */
export const FIELDS = ['leaders', 'science', 'letters', 'arts', 'music', 'screen', 'sport', 'thought', 'explore', 'other'];
/** Words that tell a field, in a description ("Brazilian footballer") or an occupation; matched in lower case. */
const RULES = [
  ['sport', /football|soccer|basketball|baseball|tennis|athlet|boxer|boxing|racing|formula one|motorcycle racer|rally driver|cyclist|swimmer|golfer|wrestler|skier|skater|gymnast|sprinter|runner|rugby|cricketer|hockey|volleyball|handball|judoka|fencer|martial artist|chess|coach|sports|sportsperson|olympic|jockey|rower|climber|mountaineer|bodybuilder|referee|goalkeeper|striker|midfielder|quarterback|marathon|weightlifter|figure skat|surfer|sumo|karate|taekwondo/],
  ['music', /singer|musician|composer|songwriter|rapper|pianist|guitarist|violinist|conductor|drummer|bassist|cellist|organist|opera|disc jockey|record producer|lyricist|bandleader|saxophonist|trumpeter|musicologist|soprano|tenor|baritone|rock band|pop star|vocalist|dj\b|flautist|harpsichordist/],
  ['screen', /actor|actress|film director|film producer|screenwriter|television|comedian|filmmaker|director of photography|voice act|stage|theat(er|re) director|presenter|\bmodel\b|dancer|choreographer|showrunner|youtuber|animator|playback|stunt|cinematograph|talk show|broadcaster|magician|illusionist|ballerina|entertainer|drag queen|influencer|streamer|pornographic/],
  ['letters', /writer|poet|novelist|playwright|author|essayist|journalist|historian|biographer|translator|literary|librettist|diarist|linguist|philologist|children's|science fiction|lexicographer|publisher|editor|dramatist|storyteller|fabulist|chronicler|satirist|critic\b|screenplay|bard\b|troubadour|orator|rhetorician/],
  ['arts', /painter|sculptor|architect|photographer|illustrator|printmaker|draughtsperson|drawer|graphic|designer|engraver|cartoonist|comics|ceramicist|visual artist|\bartist|goldsmith|muralist|manga|calligrapher|couturier|fashion/],
  ['science', /physicist|mathematician|chemist|biologist|astronomer|physician|engineer|inventor|scientist|economist|psychologist|geologist|botanist|zoologist|naturalist|computer|programmer|geographer|cartographer|surgeon|neurologist|statistician|astrophysicist|anthropologist|sociologist|archaeologist|paleontologist|meteorologist|entomologist|ornithologist|pharmacologist|psychiatrist|psychoanalyst|nurse|logician|cryptographer|biochemist|geneticist|ecologist|researcher|professor|pedagogue|educator|teacher|ologist\b|polymath|scholar|doctor|medic|anatomist|alchemist|academic|agronomist|virolog|epidemiolog|software|aerospace/],
  ['thought', /philosopher|theologian|priest|pope\b|bishop|monk\b|\bnun\b|rabbi|imam|mystic|prophet|religious|missionary|cleric|guru|saint|preacher|pastor|apostle|cardinal|patriarch|lama\b|ethicist|evangelist|presbyter|deacon|martyr|abbot|abbess|hermit|friar|founder of religion|sophist|sage\b|buddha|caliph|ayatollah|reformer|spiritual/],
  ['explore', /explorer|navigator|aviator|astronaut|cosmonaut|pilot\b|seafarer|conquistador|privateer|pirate|traveler|traveller|mountaineer|circumnavigat/],
  ['leaders', /politician|monarch|\bking\b|queen|emperor|empress|president|prime minister|statesperson|statesman|stateswoman|military|officer|general\b|admiral|soldier|diplomat|revolutionar|judge|lawyer|jurist|ruler|sovereign|aristocrat|noble|prince|princess|sultan|pharaoh|khan\b|tsar|chancellor|minister|senator|governor|mayor|dictator|warlord|consort|activist|trade unionist|civil servant|head of state|business|entrepreneur|banker|industrialist|philanthropist|resistance|suffragist|abolitionist|human rights|regent|royalty|royal\b|samurai|warrior|conqueror|chief\b|shogun|daimyo|duke|duchess|count\b|countess|lord\b|emir|vizier|first lady|leader|commander|marshal|dynasty|heir|investor|magnate|economist and politician|secretary[- ]general|guerrilla|freedom fighter|environmentalist|pacifist|feminist|spy\b|founder|tycoon|\bceo\b|executive|khagan|consul|tribune|satrap|caudillo/],
];
/** People known above all for a crime are left off the list. */
const DROP = /^(serial killer|murderer|criminal|terrorist|pornographic actor|drug trafficker|mobster|gangster|assassin|spree killer|mass murderer|rapist|war criminal|concentration camp guard|executioner|holocaust perpetrator|drug lord|outlaw|robber|fraudster)$/;

const DROP_DESC = /\b(who (assassinated|killed|murdered|shot)|serial killer|mass murderer|murderer|assassin\b|killer\b|terrorist|militant\b|arsonist|outlaw|gangster|mobster|mafia boss|drug lord|war criminal|rapist|kidnapper|hijacker|pornographic)/i;

/**
 * A person's field: what their description says first ("Brazilian footballer": sport; "American actor and
 * politician": film and stage), or else what most of their occupations point to.
 */
export function fieldOf(desc, occs) {
  const d = (desc ?? '').toLowerCase();
  let best = null, at = Infinity;
  for (const [f, re] of RULES) { const m = re.exec(d); if (m && m.index < at) { at = m.index; best = f; } }
  if (best) return best;
  const n = new Map();
  for (const o of occs) { const x = o.toLowerCase(); for (const [f, re] of RULES) if (re.test(x)) { n.set(f, (n.get(f) ?? 0) + 1); break; } }
  let bn = 0;
  best = 'other';
  for (const f of FIELDS) if ((n.get(f) ?? 0) > bn) { bn = n.get(f); best = f; }
  return best;
}
/** A description without its years: "Brazilian footballer (1940–2022)" → "Brazilian footballer". */
const trim = (d) => (d ?? '').replace(/\s*[([][^)\]]*\d[^)\]]*[)\]]\s*$/u, '').trim().slice(0, 70);

async function fetchAll() {
  const counts = await ask(CACHE, 'counts', 'SELECT ?sl (COUNT(?p) AS ?n) WHERE { ?p wikibase:sitelinks ?sl . FILTER(?sl >= 40) ?p wdt:P31 wd:Q5 . } GROUP BY ?sl');
  const by = counts.map((b) => [Number(val(b, 'sl')), Number(val(b, 'n'))]).sort((a, b) => b[0] - a[0]);
  // The lowest number of Wikipedias that still keeps the list near TARGET people.
  let total = 0, min = by[0][0];
  for (const [s, n] of by) { if (total + n > TARGET && total > 0) break; total += n; min = s; }
  console.log(`people with articles in ${min} Wikipedias or more: ${total}`);
  // One short question for each thing we want to know about them (long chains of OPTIONALs time out).
  const who = `?p wikibase:sitelinks ?sl . FILTER(?sl >= ${min}) ?p wdt:P31 wd:Q5 .`;
  const q = (name, select, more) => ask(CACHE, `${name}-${min}`, `SELECT ${select} WHERE { ${who} ${more} }`);
  const ids = await q('ids', '?p ?sl', '');
  const label = async (lang) => new Map((await q(`name-${lang}`, '?p ?l', `?p rdfs:label ?l . FILTER(LANG(?l) = "${lang}")`)).map((b) => [qidOf(val(b, 'p')), val(b, 'l')]));
  const en = await label('en'), es = await label('es'), mul = await label('mul');
  const born = await q('born', '?p ?t', '?p wdt:P569 ?t .'), died = await q('died', '?p ?t', '?p wdt:P570 ?t .');
  const bornAt = await q('born-at', '?p ?x ?c', '?p wdt:P19 ?x . ?x wdt:P625 ?c .'), diedAt = await q('died-at', '?p ?x ?c', '?p wdt:P20 ?x . ?x wdt:P625 ?c .');
  const occ = await q('occ', '?p ?l', '?p wdt:P106 ?o . ?o rdfs:label ?l . FILTER(LANG(?l) = "en")');
  const describe = async (lang) => new Map((await q(`desc-${lang}`, '?p ?d', `?p schema:description ?d . FILTER(LANG(?d) = "${lang}")`)).map((b) => [qidOf(val(b, 'p')), val(b, 'd')]));
  const dEn = await describe('en'), dEs = await describe('es');
  const placeName = async (prop, lang) => new Map((await q(`${prop}-${lang}`, '?x ?l', `?p wdt:${prop} ?x . ?x rdfs:label ?l . FILTER(LANG(?l) = "${lang}")`)).map((b) => [qidOf(val(b, 'x')), val(b, 'l')]));
  const pEn = new Map([...await placeName('P19', 'en'), ...await placeName('P20', 'en')]);
  const pEs = new Map([...await placeName('P19', 'es'), ...await placeName('P20', 'es')]);
  const pMul = new Map([...await placeName('P19', 'mul'), ...await placeName('P20', 'mul')]);

  const people = new Map();
  for (const b of ids) {
    const id = qidOf(val(b, 'p'));
    // Names the same in every language are kept once on Wikidata, as "mul".
    const name = en.get(id) ?? mul.get(id);
    if (id && name) people.set(id, { id, sl: Number(val(b, 'sl')), en: name, es: es.get(id) ?? name, b: null, d: null, born: null, died: null, occ: [], den: trim(dEn.get(id)), des: trim(dEs.get(id)) });
  }
  // Several statements (two dates, two birthplaces): keep the first of each.
  for (const b of born) { const p = people.get(qidOf(val(b, 'p'))); const y = yearOf(val(b, 't')); if (p && p.b == null && y != null) p.b = y; }
  for (const b of died) { const p = people.get(qidOf(val(b, 'p'))); const y = yearOf(val(b, 't')); if (p && p.d == null && y != null) p.d = y; }
  const place = (b) => { const x = qidOf(val(b, 'x')); const name = pEn.get(x) ?? pMul.get(x); const at = point(val(b, 'c'), 3); return name && at ? { q: x, en: name, es: pEs.get(x) ?? name, at } : null; };
  for (const b of bornAt) { const p = people.get(qidOf(val(b, 'p'))); if (p && !p.born) p.born = place(b); }
  for (const b of diedAt) { const p = people.get(qidOf(val(b, 'p'))); if (p && !p.died) p.died = place(b); }
  for (const b of occ) { const p = people.get(qidOf(val(b, 'p'))); const o = val(b, 'l'); if (p && o && !p.occ.includes(o)) p.occ.push(o); }
  const rows = [...people.values()].filter((p) => p.born?.at && p.b != null).sort((a, b) => b.sl - a.sl || a.id.localeCompare(b.id));
  // Occupations are listed once, and each person points to theirs.
  const jobs = [...new Set(rows.flatMap((p) => p.occ))].sort();
  const jobIx = new Map(jobs.map((j, i) => [j, i]));
  for (const p of rows) p.occ = p.occ.map((o) => jobIx.get(o)).sort((a, b) => a - b);
  fs.mkdirSync(HERE, { recursive: true });
  // A row: id, Wikipedias, name, nombre (0: the same), year born, year died, [place id, name, nombre, lon, lat] born, the same died (or 0), occupations, description, descripción.
  const pl = (x) => (x ? [x.q, x.en, x.es === x.en ? 0 : x.es, x.at[0], x.at[1]] : 0);
  const row = (p) => [p.id, p.sl, p.en, p.es === p.en ? 0 : p.es, p.b, p.d, pl(p.born), pl(p.died), p.occ, p.den || 0, p.des || 0];
  fs.writeFileSync(RAW, `{"occupations":${JSON.stringify(jobs)},\n"people":[\n${rows.map((p) => JSON.stringify(row(p))).join(',\n')}\n]}\n`);
  console.log(`wrote wikidata-people.json: ${rows.length} people`);
}

const km = (a, b) => {
  const r = Math.PI / 180;
  const s = Math.sin(((b[1] - a[1]) * r) / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
};

/** The fields of the lives written for Lives on the map, by Wikidata id (their "rights" are public life here). */
const LIFE_FIELD = (() => {
  const m = new Map();
  try {
    const people = read(path.join(ROOT, 'scripts/data/lives/_people.json')), facts = read(path.join(ROOT, 'scripts/data/lives/_facts.json'));
    for (const p of people) if (facts[p.id]?.qid) m.set(facts[p.id].qid, p.field === 'rights' ? 'leaders' : p.field);
  } catch { /* no lives yet */ }
  return m;
})();

export function build() {
  const { occupations, people: rows } = read(RAW);
  const pl = (x) => (x ? { q: x[0], en: x[1], es: x[2] || x[1], at: [x[3], x[4]] } : null);
  const raw = rows.map((r) => ({ id: r[0], sl: r[1], en: r[2], es: r[3] || r[2], b: r[4], d: r[5], born: pl(r[6]), died: pl(r[7]), occ: r[8].map((i) => occupations[i]), den: r[9] || '', des: r[10] || '' }));
  const guide = read(path.join(ROOT, 'public/data/guide/index.json'));
  const gi = (k) => guide.fields.indexOf(k);
  const cities = guide.cities.map((c) => ({ id: c[gi('id')], at: [c[gi('lon')], c[gi('lat')]], qids: new Set([c[gi('qid')], ...String(c[gi('also')] ?? '').split(',')].filter(Boolean)), pop: c[gi('pop')] }));
  const byQid = new Map();
  for (const c of cities) for (const q of c.qids) byQid.set(q, c.id);
  // A birthplace belongs to a guide city when it is that city on Wikidata, or lies in it (within 12 km; 25 km for a city of 3 million or more).
  const cityOf = (pl) => {
    if (byQid.has(pl.q)) return byQid.get(pl.q);
    let best = null, bd = Infinity;
    for (const c of cities) { const d = km(pl.at, c.at); if (d < (c.pop >= 3e6 ? 25 : 12) && d < bd) { bd = d; best = c.id; } }
    return best;
  };
  const places = [], placeIx = new Map(), cityIds = [], cityIx = new Map();
  const place = (pl) => {
    const key = pl.q ?? `${pl.en}@${pl.at}`;
    if (placeIx.has(key)) return placeIx.get(key);
    const city = cityOf(pl);
    let ci = -1;
    if (city) { if (!cityIx.has(city)) { cityIx.set(city, cityIds.length); cityIds.push(city); } ci = cityIx.get(city); }
    const k = places.push([pl.en, pl.es === pl.en ? 0 : pl.es, pl.at[0], pl.at[1], ci]) - 1;
    placeIx.set(key, k);
    return k;
  };
  const people = [];
  for (const p of raw) {
    if ((p.occ.length && p.occ.every((o) => DROP.test(o.toLowerCase()))) || DROP_DESC.test(p.den)) continue;
    // A life written for Lives on the map says its own field.
    const f = FIELDS.indexOf(LIFE_FIELD.get(p.id) ?? fieldOf(p.den, p.occ));
    // A death before the birth, or a life of over 120 years, is a mistake in the data: keep the birth only.
    const d = p.d != null && p.d >= p.b && p.d - p.b <= 120 ? p.d : null;
    people.push([p.id, p.en, p.es === p.en ? 0 : p.es, p.b, d, place(p.born), f, p.sl, d != null && p.died ? place(p.died) : -1, p.den || 0, p.des || 0]);
  }
  return {
    about: 'Who was born here? People with articles in many Wikipedias and where they were born, from Wikidata (CC0). people: [Wikidata id, name, nombre (0: the same), year born, year died (null: living or unknown), birthplace (index in places), field (index in fields), Wikipedias, place of death (index in places, or -1), what they were, qué fue (0: not said)]. places: [name, nombre (0: the same), lon, lat, guide city (index in cities, or -1)].',
    fields: FIELDS, cities: cityIds, places, people,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (args.includes('--fetch')) await fetchAll();
  else {
    const out = build();
    const text = JSON.stringify(out);
    if (args.includes('--check')) {
      if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== text) { console.error('FAIL public/data/born/people.json is out of date; run node scripts/data/born/build-born.mjs'); process.exit(1); }
      const who = (q) => out.people.find((p) => p[0] === q);
      const born = (q) => { const p = who(q); return p ? out.places[p[5]] : null; };
      const city = (q) => { const pl = born(q); return pl && pl[4] >= 0 ? out.cities[pl[4]] : null; };
      const field = (q) => { const p = who(q); return p ? out.fields[p[6]] : null; };
      const checks = [
        [out.people.length >= 9000, `${out.people.length} people`],
        [born('Q254')?.[0] === 'Salzburg' && who('Q254')[3] === 1756 && who('Q254')[4] === 1791 && field('Q254') === 'music', 'Mozart: born in Salzburg in 1756, died in 1791, music'],
        [city('Q297') === 'seville' && field('Q297') === 'arts', 'Velázquez: born in Seville (the guide city), art'],
        [field('Q937') === 'science' && born('Q937')?.[0] === 'Ulm', 'Einstein: science, born in Ulm'],
        [field('Q5682') === 'letters', 'Cervantes: a writer'],
        [field('Q12897') === 'sport', 'Pelé: sport'],
        [field('Q91') === 'leaders', 'Lincoln: a leader'],
        [out.people.every((p) => p[3] != null && out.places[p[5]]), 'everyone has a year and a place of birth'],
        [out.people.filter((p) => p[4] == null).every((p) => p[8] === -1), 'no place of death for anyone without a year of death'],
      ];
      let bad = 0;
      for (const [ok, msg] of checks) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} born: ${msg}`); }
      process.exit(bad ? 1 : 0);
    }
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, text);
    const n = new Map();
    for (const p of out.people) n.set(out.fields[p[6]], (n.get(out.fields[p[6]]) ?? 0) + 1);
    console.log(`people.json: ${out.people.length} people, ${out.places.length} places, ${out.cities.length} guide cities, ${(text.length / 1024).toFixed(0)} KB; ${[...n].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  }
}
