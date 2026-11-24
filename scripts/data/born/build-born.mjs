// Who was born here? (v0.28.0): where well-known people were born, from Wikidata (CC0), in two files.
//
//   node scripts/data/born/build-born.mjs --fetch   asks Wikidata (answers kept in .cache/born) and writes
//                                                   scripts/data/born/wikidata-people.json and wikidata-more.json
//   node scripts/data/born/build-born.mjs           builds public/data/born/people.json and more.json
//   node scripts/data/born/build-born.mjs --check   in check:data: fails if those files are out of date, or a known
//                                                   person is missing or misplaced
//
// people.json, the first file the app loads:
//  - the world's best known: every human with articles in MIN Wikipedias or more (48 in November 2026, picked to keep
//    the list near TARGET);
//  - everyone the app features elsewhere, whatever their fame: the lives of Lives on the map, the people of the
//    Time travel stories and of the legacies, the art guide's artists and architects (any Wikidata id or Wikipedia
//    article named in public/data that is a human on Wikidata).
// more.json, loaded after it: each country's own best-known people below the global list (by the current country,
// P17, of their birthplace), down to FLOOR Wikipedias and up to a share scaled to the country's population (capOf),
// and the people readers asked for by name (ASKED) when they reach the floor.
// Everyone needs a year of birth and a place of birth. A birthplace with no coordinates of its own takes the point
// of the nearest place it lies in (P131, up to three steps up: Coyoacán takes Mexico City's), and keeps its own name.
// Each keeps a name in English and Spanish, the years of birth and death, where they were born and (if they have
// died) where they died, and a field worked out from their occupations. Living people are listed by birthplace
// only: never where they live.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ask, askFor, val, qidOf, point, yearOf } from '../lives/wdqs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HERE = path.join(ROOT, 'scripts/data/born');
const CACHE = path.join(ROOT, '.cache/born');
const OUT = path.join(ROOT, 'public/data/born/people.json');
const OUT_MORE = path.join(ROOT, 'public/data/born/more.json');
const RAW = path.join(HERE, 'wikidata-people.json');
const RAW_MORE = path.join(HERE, 'wikidata-more.json');
const args = process.argv.slice(2);
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const TARGET = 13_000;
/** The second file goes down to people with articles in this many Wikipedias. */
const FLOOR = 8;
/**
 * A country's share of the second file: 35 people, and 2.5 more for each million people living there, up to 400
 * (Mexico, 132 million: 366). A base of 40 made the file 2.6 MB; 35 keeps it at 2.5.
 */
export const capOf = (pop) => Math.round(Math.min(400, Math.max(35, 35 + (2.5 * (pop || 0)) / 1e6)));
/** The second file's size, at most (bytes): about 2.5 MB, with a little room for the next fetch. */
const MORE_MAX = 2_600_000;
/** People readers asked for by name: in the second file whatever their country's share, if they reach the floor. */
const ASKED = { Q524664: 'Andrés Quintana Roo', Q2832483: 'Aleks Syntek', Q2454225: 'Carlos Loret de Mola' };
/** Folders of public/data not searched for featured people: this list itself, and what is built from it. */
const NOT_FEATURED = new Set(['born', 'fill', 'i18n']);

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

/** Names Wikidata gets wrong just now (a slip in a label): [name, nombre]. */
const NAME_FIX = {
  Q84284: ['Christian Doppler', 'Christian Doppler'],
  Q131248: ['Lee Kuan Yew', 'Lee Kuan Yew'],
  // Labels vandalised just now (another person's name, an insult, letters typed at random), set back to the name of
  // the person's Wikipedia article (November 2026).
  Q298547: ['Mukesh Ambani', 'Mukesh Ambani'],
  Q230497: ['Tariq ibn Ziyad', 'Táriq ibn Ziyad'],
  Q157255: ['Merton Miller', 'Merton Miller'],
  Q318493: ['Najib Mikati', 'Najib Mikati'],
  Q30089624: ['Lucas Paquetá', 'Lucas Paquetá'],
  Q738404: ['Juan Gabriel', 'Juan Gabriel'],
  Q127609: ['Bernard Etxepare', 'Bernat Dechepare'],
  Q294204: ['Joaquín Sánchez', 'Joaquín Sánchez Rodríguez'],
  Q270685: ['Princess Astrid of Norway', 'Astrid de Noruega'],
  Q561833: ['José Emilio Pacheco', 'José Emilio Pacheco'],
  Q335443: ["Al-Mu'izz li-Din Allah", "Ma'ad al-Muizz Li-Dinillah"],
  Q293549: ["Al-Qa'im bi-Amr Allah", "Muhammad al-Qa'im Bi-Amrillah"],
  Q17490: ['Jean Marie Dongou', 'Jean Marie Dongou'],
  Q20645743: ['Álvaro Montero', 'Álvaro Montero'],
  Q14602686: ['Gabriel Paulista', 'Gabriel Paulista'],
  Q261230: ['Omayra Sánchez', 'Omaira Sánchez'],
  Q98053664: ['Mark Phillips', 'Mark Phillips'],
  Q2118086: ['Alfredo Talavera', 'Alfredo Talavera'],
  Q732137: ['Salah Jadid', 'Salah Jadid'],
  Q5441662: ['Feleti Teo', 'Feleti Teo'],
  Q10557534: ['Kahraba', 'Kahraba'],
  Q145424: ['Enrique Gil', 'Enrique Gil'],
};
/** Descriptions vandalised just now: [what they were, qué fue]. */
const DESC_FIX = {
  Q158314: ['mother of Adolf Hitler', 'madre de Adolf Hitler'],
  Q313209: ['Portuguese football player and manager', 'futbolista y entrenador portugués'],
  Q230123: ['Spanish model and actress', 'actriz, modelo y productora española'],
  Q127609: ['Navarrese Basque-language writer and priest', 'escritor y sacerdote navarro en lengua vasca'],
};
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

/** A short fingerprint of a list: a list that has changed is asked again instead of read from an old answer. */
const tag = (list) => crypto.createHash('sha1').update([...new Set(list)].sort().join(' ')).digest('hex').slice(0, 8);
const askMany = (name, variable, ids, select, body, size = 2500) => askFor(CACHE, `${name}-${tag(ids)}`, variable, ids, select, body, size);
const langOf = (b, k) => b[k]?.['xml:lang'];
const qn = (q) => Number(String(q).slice(1));
const note = (m, k, v) => (m.get(k) ?? m.set(k, new Set()).get(k)).add(v);

/** The Wikidata items of Wikipedia articles, by title ("Frida Kahlo"), in one language. */
async function askTitles(lang, titles) {
  const list = [...new Set(titles)].sort(), t = tag(list), size = 800, out = new Map();
  for (let i = 0; i < list.length; i += size) {
    const values = list.slice(i, i + size).map((s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"@${lang}`).join(' ');
    const rows = await ask(CACHE, `title-${lang}-${t}-${String(i / size).padStart(2, '0')}`, `SELECT ?t ?p WHERE { VALUES ?t { ${values} } ?a schema:name ?t ; schema:isPartOf <https://${lang}.wikipedia.org/> ; schema:about ?p . }`);
    for (const b of rows) { const p = qidOf(val(b, 'p')); if (p) out.set(val(b, 't'), p); }
  }
  return out;
}

/**
 * Everyone the app names elsewhere, with where: the Wikidata ids (the art guide's artists and architects, the lives)
 * and the Wikipedia articles (a story item's or a legacy's `wiki`, a story's sources) anywhere in public/data. Most
 * are not people (buildings, species, battles); Wikidata says which are.
 */
export function featuredRefs() {
  const ids = new Map(), titles = { en: new Map(), es: new Map() };
  const DATA = path.join(ROOT, 'public/data');
  const files = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p); else if (f.name.endsWith('.json')) files.push(p);
    }
  })(DATA);
  for (const file of files) {
    const folder = path.relative(DATA, file).split(path.sep)[0];
    if (NOT_FEATURED.has(folder)) continue;
    let j;
    try { j = read(file); } catch { continue; }
    const title = (lang, s, src) => { const t = s.replace(/_/g, ' ').split('#')[0].trim(); if (t) note(titles[lang], t, src); };
    const visit = (v, key, top) => {
      const src = `${folder} ${top ?? 'list'}`;
      if (typeof v === 'string') {
        if (/^Q[1-9]\d*(,Q[1-9]\d*)*$/.test(v)) for (const q of v.split(',')) note(ids, q, src);
        for (const m of v.matchAll(/https?:\/\/(en|es)\.wikipedia\.org\/wiki\/([^\s"#?]+)/g)) {
          let t = m[2];
          try { t = decodeURIComponent(t); } catch { /* as it is */ }
          title(m[1], t, src);
        }
        if (key === 'wiki') title('en', v, src);
      } else if (Array.isArray(v)) for (const x of v) visit(x, key, top);
      else if (v && typeof v === 'object') {
        if (key === 'wiki') for (const lang of ['en', 'es']) if (typeof v[lang] === 'string') title(lang, v[lang], src);
        for (const [k, x] of Object.entries(v)) visit(x, k, top ?? k);
      }
    };
    visit(j, '', null);
  }
  return { ids, titles };
}

/** For places with no coordinates of their own: the point of the nearest place each lies in (P131), up to three steps up. */
async function pointsUp(places) {
  const up = new Map();
  let front = new Map(places.map((x) => [x, [x]]));
  for (let step = 1; step <= 3 && front.size; step++) {
    const rows = await askMany(`up${step}`, 'x', [...front.keys()], '?x ?y ?c', '?x wdt:P131 ?y . OPTIONAL { ?y wdt:P625 ?c }', 2000);
    const parents = new Map();
    for (const b of rows) {
      const x = qidOf(val(b, 'x')), y = qidOf(val(b, 'y'));
      if (!x || !y || x === y) continue;
      const l = parents.get(x) ?? parents.set(x, new Map()).get(x);
      if (!l.get(y)) l.set(y, point(val(b, 'c'), 3));
    }
    const next = new Map();
    for (const [x, from] of front) {
      // Several places above (a town in a district and a province): the one with the lowest id, a stable choice.
      const ps = [...(parents.get(x) ?? [])].sort((a, b) => qn(a[0]) - qn(b[0]));
      const hit = ps.find(([, at]) => at);
      if (hit) { for (const f of from) if (!up.has(f)) up.set(f, { q: hit[0], at: hit[1] }); continue; }
      for (const [y] of ps) (next.get(y) ?? next.set(y, []).get(y)).push(...from.filter((f) => !up.has(f)));
    }
    front = next;
  }
  return up;
}

async function fetchAll() {
  // ---- 1. The world's best known: everyone with articles in MIN Wikipedias or more.
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
  // Every place of birth and death, with or without coordinates of its own.
  const bornIn = await q('born-in', '?p ?x', '?p wdt:P19 ?x .'), diedIn = await q('died-in', '?p ?x', '?p wdt:P20 ?x .');
  const global = new Set(ids.map((b) => qidOf(val(b, 'p'))).filter(Boolean));

  // ---- 2. Everyone the app features elsewhere, whatever their fame.
  const refs = featuredRefs();
  const from = new Map([...refs.ids].map(([k, v]) => [k, new Set(v)]));
  for (const lang of ['en', 'es']) {
    const items = await askTitles(lang, [...refs.titles[lang].keys()]);
    for (const [t, srcs] of refs.titles[lang]) { const p = items.get(t); if (p) for (const s of srcs) note(from, p, s); }
  }
  const humans = new Set((await askMany('human', 'p', [...from.keys()], '?p', '?p wdt:P31 wd:Q5 .', 2000)).map((b) => qidOf(val(b, 'p'))));
  const featured = [...from.keys()].filter((p) => humans.has(p)).sort((a, b) => qn(a) - qn(b));

  // ---- 3. Each country's own best known, below the global list: how many there are at each number of Wikipedias,
  // and so how far down each country's share reaches (with a margin for those left out later).
  const levels = await ask(CACHE, `country-levels-${FLOOR}`, `SELECT ?cty ?sl (COUNT(DISTINCT ?p) AS ?n) WHERE { ?p wikibase:sitelinks ?sl . FILTER(?sl >= ${FLOOR}) ?p wdt:P31 wd:Q5 . ?p wdt:P19 ?x . ?x wdt:P17 ?cty . } GROUP BY ?cty ?sl`);
  const ctyIds = [...new Set(levels.map((b) => qidOf(val(b, 'cty'))).filter(Boolean))];
  const today = new Set((await askMany('country-kind', 'c', ctyIds, '?c', '?c wdt:P31 ?t . FILTER(?t = wd:Q6256 || ?t = wd:Q3624078)', 2000)).map((b) => qidOf(val(b, 'c'))));
  for (const b of await askMany('country-end', 'c', ctyIds, '?c', '?c wdt:P576 ?e .', 2000)) today.delete(qidOf(val(b, 'c')));
  const pop = new Map();
  for (const b of await askMany('country-pop', 'c', ctyIds, '?c ?n', '?c wdt:P1082 ?n .', 2000)) { const c = qidOf(val(b, 'c')); pop.set(c, Math.max(pop.get(c) ?? 0, Math.round(Number(val(b, 'n')) || 0))); }
  const cName = new Map((await askMany('country-name', 'c', ctyIds, '?c ?l', '?c rdfs:label ?l . FILTER(LANG(?l) = "en")', 2000)).map((b) => [qidOf(val(b, 'c')), val(b, 'l')]));
  const lv = new Map();
  for (const b of levels) { const c = qidOf(val(b, 'cty')), sl = Number(val(b, 'sl')); if (sl < min) (lv.get(c) ?? lv.set(c, []).get(c)).push([sl, Number(val(b, 'n'))]); }
  // Today's countries only: a place also given as in the Ottoman Empire counts for Türkiye.
  const countries = {};
  for (const c of ctyIds.filter((x) => today.has(x)).sort((a, b) => qn(a) - qn(b))) {
    const need = Math.ceil(capOf(pop.get(c)) * 1.2) + 10;
    let n = 0, cut = FLOOR;
    for (const [sl, k] of (lv.get(c) ?? []).sort((a, b) => b[0] - a[0])) { n += k; cut = sl; if (n >= need) break; }
    if (n < need) cut = FLOOR;
    countries[c] = [pop.get(c) ?? 0, cName.get(c) ?? c, cut];
  }
  const depth = new Map();
  const add = (p, sl, c) => { const d = depth.get(p) ?? depth.set(p, { sl, ctys: new Set() }).get(p); if (c) d.ctys.add(c); };
  const pairs = Object.entries(countries), pt = tag(pairs.map(([c, x]) => `${c}:${x[2]}`));
  for (let i = 0; i < pairs.length; i += 25) {
    const values = pairs.slice(i, i + 25).map(([c, x]) => `(wd:${c} ${x[2]})`).join(' ');
    const rows = await ask(CACHE, `country-people-${pt}-${String(i / 25).padStart(2, '0')}`, `SELECT DISTINCT ?p ?sl ?cty WHERE { VALUES (?cty ?min) { ${values} } ?x wdt:P17 ?cty . ?p wdt:P19 ?x . ?p wikibase:sitelinks ?sl . FILTER(?sl >= ?min && ?sl < ${min}) ?p wdt:P31 wd:Q5 . }`);
    for (const b of rows) { const p = qidOf(val(b, 'p')); if (p && !global.has(p)) add(p, Number(val(b, 'sl')), qidOf(val(b, 'cty'))); }
  }
  for (const b of await askMany('asked', 'p', Object.keys(ASKED), '?p ?cty', '?p wdt:P19 ?x . ?x wdt:P17 ?cty .')) add(qidOf(val(b, 'p')), 0, qidOf(val(b, 'cty')));
  for (const p of Object.keys(ASKED)) add(p, 0, null);

  // ---- 4. What Wikidata says of everyone outside the global list.
  const others = [...new Set([...featured, ...depth.keys()])].filter((p) => !global.has(p)).sort((a, b) => qn(a) - qn(b));
  const X = (name, select, body) => askMany(`x-${name}`, 'p', others, select, body);
  const xSl = await X('sl', '?p ?sl', '?p wikibase:sitelinks ?sl .');
  const xName = await X('name', '?p ?l', '?p rdfs:label ?l . FILTER(LANG(?l) = "en" || LANG(?l) = "es" || LANG(?l) = "mul")');
  const xBorn = await X('born', '?p ?t', '?p wdt:P569 ?t .'), xDied = await X('died', '?p ?t', '?p wdt:P570 ?t .');
  const xBornIn = await X('born-in', '?p ?x ?c', '?p wdt:P19 ?x . OPTIONAL { ?x wdt:P625 ?c }');
  const xDiedIn = await X('died-in', '?p ?x ?c', '?p wdt:P20 ?x . OPTIONAL { ?x wdt:P625 ?c }');
  const xOcc = await X('occ', '?p ?l', '?p wdt:P106 ?o . ?o rdfs:label ?l . FILTER(LANG(?l) = "en")');
  const xDesc = await X('desc', '?p ?d', '?p schema:description ?d . FILTER(LANG(?d) = "en" || LANG(?d) = "es")');
  const xPlaces = [...new Set([...xBornIn, ...xDiedIn].map((b) => qidOf(val(b, 'x'))).filter(Boolean))];
  const xpn = { en: new Map(), es: new Map(), mul: new Map() };
  for (const b of await askMany('x-place-name', 'x', xPlaces, '?x ?l', '?x rdfs:label ?l . FILTER(LANG(?l) = "en" || LANG(?l) = "es" || LANG(?l) = "mul")')) {
    const m = xpn[langOf(b, 'l')], x = qidOf(val(b, 'x'));
    if (m && x && !m.has(x)) m.set(x, val(b, 'l'));
  }

  // ---- 5. A point for each place with none of its own.
  const own = new Set([...bornAt, ...diedAt].map((b) => qidOf(val(b, 'x'))));
  for (const b of [...xBornIn, ...xDiedIn]) if (val(b, 'c')) own.add(qidOf(val(b, 'x')));
  const bare = [...new Set([...bornIn, ...diedIn, ...xBornIn, ...xDiedIn].map((b) => qidOf(val(b, 'x'))))].filter((x) => x && !own.has(x)).sort((a, b) => qn(a) - qn(b));
  const up = await pointsUp(bare);
  console.log(`places with no coordinates of their own: ${bare.length}; a point from a place they lie in: ${up.size}`);

  // ---- 6. The people.
  const people = new Map();
  // Names the same in every language are kept once on Wikidata, as "mul".
  for (const b of ids) {
    const id = qidOf(val(b, 'p'));
    const name = en.get(id) ?? mul.get(id);
    if (id && name) people.set(id, { id, sl: Number(val(b, 'sl')), en: name, es: es.get(id) ?? name, b: null, d: null, born: null, died: null, occ: [], den: trim(dEn.get(id)), des: trim(dEs.get(id)) });
  }
  const xSls = new Map(xSl.map((b) => [qidOf(val(b, 'p')), Number(val(b, 'sl'))]));
  const xn = { en: new Map(), es: new Map(), mul: new Map() }, xd = { en: new Map(), es: new Map() };
  for (const b of xName) { const m = xn[langOf(b, 'l')], p = qidOf(val(b, 'p')); if (m && p && !m.has(p)) m.set(p, val(b, 'l')); }
  for (const b of xDesc) { const m = xd[langOf(b, 'd')], p = qidOf(val(b, 'p')); if (m && p && !m.has(p)) m.set(p, val(b, 'd')); }
  for (const id of others) {
    const name = xn.en.get(id) ?? xn.mul.get(id);
    if (name) people.set(id, { id, sl: xSls.get(id) ?? depth.get(id)?.sl ?? 0, en: name, es: xn.es.get(id) ?? name, b: null, d: null, born: null, died: null, occ: [], den: trim(xd.en.get(id)), des: trim(xd.es.get(id)) });
  }
  // Several statements (two dates, two birthplaces): keep the first of each, a place with coordinates of its own first.
  for (const b of [...born, ...xBorn]) { const p = people.get(qidOf(val(b, 'p'))); const y = yearOf(val(b, 't')); if (p && p.b == null && y != null) p.b = y; }
  for (const b of [...died, ...xDied]) { const p = people.get(qidOf(val(b, 'p'))); const y = yearOf(val(b, 't')); if (p && p.d == null && y != null) p.d = y; }
  // Place names: those of the global list's own questions for its people, the later ones for everyone else.
  const gpn = { en: pEn, es: pEs, mul: pMul };
  const placeOf = (names, x, at) => { const name = names.en.get(x) ?? names.mul.get(x); return name && at ? { q: x, en: name, es: names.es.get(x) ?? name, at } : null; };
  const borrowed = (names, x) => { const u = !own.has(x) && up.get(x); const pl = u ? placeOf(names, x, u.at) : null; if (pl) pl.up = u.q; return pl; };
  const placed = (rows, names, key, coords) => {
    for (const b of rows) { const p = people.get(qidOf(val(b, 'p'))); if (p && !p[key]) p[key] = placeOf(names, qidOf(val(b, 'x')), coords && point(val(b, 'c'), 3)); }
  };
  const lent = (rows, names, key) => {
    for (const b of rows) { const p = people.get(qidOf(val(b, 'p'))); if (p && !p[key]) p[key] = borrowed(names, qidOf(val(b, 'x'))); }
  };
  placed(bornAt, gpn, 'born', true); placed(diedAt, gpn, 'died', true);
  placed(xBornIn.filter((b) => val(b, 'c')), xpn, 'born', true); placed(xDiedIn.filter((b) => val(b, 'c')), xpn, 'died', true);
  lent(bornIn, gpn, 'born'); lent(diedIn, gpn, 'died'); lent(xBornIn, xpn, 'born'); lent(xDiedIn, xpn, 'died');
  for (const b of [...occ, ...xOcc]) { const p = people.get(qidOf(val(b, 'p'))); const o = val(b, 'l'); if (p && o && !p.occ.includes(o)) p.occ.push(o); }

  // ---- 7. The two lists: the global one with everyone featured, and the rest.
  const isFeatured = new Set(featured);
  const ok = (p) => p.born?.at && p.b != null;
  const order = (a, b) => b.sl - a.sl || a.id.localeCompare(b.id);
  const first = [...people.values()].filter((p) => ok(p) && (global.has(p.id) || isFeatured.has(p.id))).sort(order);
  const second = [...people.values()].filter((p) => ok(p) && !global.has(p.id) && !isFeatured.has(p.id)).sort(order);
  fs.mkdirSync(HERE, { recursive: true });
  // A row: id, Wikipedias, name, nombre (0: the same), year born, year died, [place id, name, nombre, lon, lat, (the
  // place whose point it takes)] born, the same died (or 0), occupations, description, descripción; in the second
  // file, then the countries of the place of birth.
  const write = (file, rows, head, countriesOf) => {
    const jobs = [...new Set(rows.flatMap((p) => p.occ))].sort();
    const jobIx = new Map(jobs.map((j, i) => [j, i]));
    const pl = (x) => (x ? [x.q, x.en, x.es === x.en ? 0 : x.es, x.at[0], x.at[1], ...(x.up ? [x.up] : [])] : 0);
    const row = (p) => [p.id, p.sl, p.en, p.es === p.en ? 0 : p.es, p.b, p.d, pl(p.born), pl(p.died), p.occ.map((o) => jobIx.get(o)).sort((a, b) => a - b), p.den || 0, p.des || 0, ...(countriesOf ? [countriesOf(p)] : [])];
    fs.writeFileSync(file, `{${head}"occupations":${JSON.stringify(jobs)},\n"people":[\n${rows.map((p) => JSON.stringify(row(p))).join(',\n')}\n]}\n`);
  };
  write(RAW, first, `"min":${min},\n"featured":${JSON.stringify(featured)},\n`);
  write(RAW_MORE, second, `"floor":${FLOOR},\n"countries":${JSON.stringify(countries)},\n`, (p) => [...(depth.get(p.id)?.ctys ?? [])].sort((a, b) => qn(a) - qn(b)));
  // Where the featured people come from, and how many of them the global list had left out.
  const srcs = new Map();
  for (const p of featured) for (const s of from.get(p)) { const n = srcs.get(s) ?? srcs.set(s, [0, 0, 0]).get(s); n[0]++; if (!global.has(p)) { n[1]++; if (people.get(p) && ok(people.get(p))) n[2]++; } }
  console.log(`featured people: ${featured.length}, ${featured.filter((p) => !global.has(p)).length} of them outside the global list, ${featured.filter((p) => !global.has(p) && people.get(p) && ok(people.get(p))).length} with a place and year of birth`);
  for (const [s, n] of [...srcs].sort((a, b) => b[1][0] - a[1][0])) console.log(`  ${s}: ${n[0]} people, ${n[1]} outside the global list, ${n[2]} of those placed`);
  console.log(`wrote wikidata-people.json: ${first.length} people; wikidata-more.json: ${second.length} people, ${Object.keys(countries).length} countries`);
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

/** A raw file, its people as objects. */
function readRaw(file) {
  const j = read(file);
  const pl = (x) => (x ? { q: x[0], en: x[1], es: x[2] || x[1], at: [x[3], x[4]] } : null);
  j.people = j.people.map((r) => ({ id: r[0], sl: r[1], en: r[2], es: r[3] || r[2], b: r[4], d: r[5], born: pl(r[6]), died: pl(r[7]), occ: r[8].map((i) => j.occupations[i]), den: r[9] || '', des: r[10] || '', ctys: r[11] ?? [] }));
  return j;
}
/** People known above all for a crime are left off the list. */
const dropped = (p) => (p.occ.length && p.occ.every((o) => DROP.test(o.toLowerCase()))) || DROP_DESC.test(p.den);
const ROWS = 'people: [Wikidata id, name, nombre (0: the same), year born, year died (null: living or unknown), birthplace (index in places), field (index in fields), Wikipedias, place of death (index in places, or -1), what they were, qué fue (0: not said)]. places: [name, nombre (0: the same), lon, lat, guide city (index in cities, or -1)].';

export function build() {
  const first = readRaw(RAW), second = readRaw(RAW_MORE);
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
  /** A file's own tables: its places (each with its guide city) and the guide cities they are in. */
  const tables = () => {
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
    return { places, cityIds, place };
  };
  const rowsOf = (list, t) => list.map((p) => {
    if (NAME_FIX[p.id]) [p.en, p.es] = NAME_FIX[p.id];
    if (DESC_FIX[p.id]) [p.den, p.des] = DESC_FIX[p.id];
    // A life written for Lives on the map says its own field.
    const f = FIELDS.indexOf(LIFE_FIELD.get(p.id) ?? fieldOf(p.den, p.occ));
    // A death before the birth, or a life of over 120 years, is a mistake in the data: keep the birth only.
    const d = p.d != null && p.d >= p.b && p.d - p.b <= 120 ? p.d : null;
    return [p.id, p.en, p.es === p.en ? 0 : p.es, p.b, d, t.place(p.born), f, p.sl, d != null && p.died ? t.place(p.died) : -1, p.den || 0, p.des || 0];
  });
  // The first file: the world's best known and everyone the app features.
  const a = tables();
  const main = rowsOf(first.people.filter((p) => !dropped(p)), a);
  const listed = new Set(main.map((r) => r[0]));
  // The second: each country's best known below the global list, up to its share (the best known first, then the
  // older Wikidata item), and the people readers asked for.
  const cands = second.people.filter((p) => !listed.has(p.id) && p.sl >= FLOOR && !dropped(p));
  const byCountry = new Map();
  for (const p of cands) for (const c of p.ctys) (byCountry.get(c) ?? byCountry.set(c, []).get(c)).push(p);
  const chosen = new Set(), shares = {};
  for (const [c, [pop]] of Object.entries(second.countries)) {
    const list = (byCountry.get(c) ?? []).sort((x, y) => y.sl - x.sl || qn(x.id) - qn(y.id)).slice(0, capOf(pop));
    for (const p of list) chosen.add(p.id);
    shares[c] = list.length;
  }
  for (const p of cands) if (ASKED[p.id]) chosen.add(p.id);
  const b = tables();
  const more = rowsOf(second.people.filter((p) => chosen.has(p.id)), b);
  return {
    main: {
      about: `Who was born here? The world's best-known people (articles in ${first.min} Wikipedias or more) and everyone the app features elsewhere, and where they were born, from Wikidata (CC0); more.json adds each country's own. A birthplace with no coordinates takes those of the place it lies in. ${ROWS}`,
      fields: FIELDS, cities: a.cityIds, places: a.places, people: main,
    },
    more: {
      about: `Who was born here? More people, loaded after people.json: each country's own best known below the world's list, down to ${FLOOR} Wikipedias and up to a share scaled to its population, from Wikidata (CC0). The same rows as people.json, with places and cities of its own. ${ROWS}`,
      fields: FIELDS, cities: b.cityIds, places: b.places, people: more,
    },
    first, second, shares,
  };
}

/** The country (ISO code) whose shape holds a point, from the app's map of countries. */
async function countryAt() {
  const { createRequire } = await import('node:module');
  const require = createRequire(path.join(ROOT, 'package.json'));
  const { feature } = require('topojson-client');
  const { geoContains } = require('d3-geo');
  const topo = read(path.join(ROOT, 'public/data/base/countries-50m.json'));
  const shapes = feature(topo, topo.objects.countries).features;
  return (lon, lat) => shapes.find((f) => f.geometry && geoContains(f, [lon, lat]))?.id ?? null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (args.includes('--fetch')) await fetchAll();
  else {
    const { main: out, more, first, second, shares } = build();
    const text = JSON.stringify(out), moreText = JSON.stringify(more);
    if (args.includes('--check')) {
      if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== text) { console.error('FAIL public/data/born/people.json is out of date; run node scripts/data/born/build-born.mjs'); process.exit(1); }
      if (!fs.existsSync(OUT_MORE) || fs.readFileSync(OUT_MORE, 'utf8') !== moreText) { console.error('FAIL public/data/born/more.json is out of date; run node scripts/data/born/build-born.mjs'); process.exit(1); }
      const who = (q) => out.people.find((p) => p[0] === q);
      const born = (q) => { const p = who(q); return p ? out.places[p[5]] : null; };
      const city = (q) => { const pl = born(q); return pl && pl[4] >= 0 ? out.cities[pl[4]] : null; };
      const field = (q) => { const p = who(q); return p ? out.fields[p[6]] : null; };
      /** A person in either file: their row, and their place of birth. */
      const find = (q) => { for (const f of [out, more]) { const r = f.people.find((p) => p[0] === q); if (r) return { r, at: f.places[r[5]], file: f === out ? 'people.json' : 'more.json' }; } return null; };
      const at = await countryAt();
      const mexican = (q) => { const x = find(q); return !!x && at(x.at[2], x.at[3]) === 'MEX'; };
      const where = (q) => { const x = find(q); return x ? `${x.at[0]}, ${x.r[7]} Wikipedias, in ${x.file}` : 'missing'; };
      const raw = new Map([...first.people, ...second.people].map((p) => [p.id, p]));
      const featured = first.featured.filter((q) => raw.has(q) && !dropped(raw.get(q)));
      const inMain = new Set(out.people.map((p) => p[0]));
      const loret = raw.get('Q2454225');
      const short = Object.entries(second.countries).filter(([c, [pop, , cut]]) => shares[c] < capOf(pop) && cut > FLOOR).map(([, x]) => x[1]);
      const checks = [
        [out.people.length >= 9000, `${out.people.length} people`],
        [born('Q254')?.[0] === 'Salzburg' && who('Q254')[3] === 1756 && who('Q254')[4] === 1791 && field('Q254') === 'music', 'Mozart: born in Salzburg in 1756, died in 1791, music'],
        [city('Q297') === 'seville' && field('Q297') === 'arts', 'Velázquez: born in Seville (the guide city), art'],
        [field('Q937') === 'science' && born('Q937')?.[0] === 'Ulm', 'Einstein: science, born in Ulm'],
        [field('Q5682') === 'letters', 'Cervantes: a writer'],
        [field('Q12897') === 'sport', 'Pelé: sport'],
        [field('Q91') === 'leaders', 'Lincoln: a leader'],
        [born('Q5588')?.[0] === 'Coyoacán' && city('Q5588') === 'mexico-city' && mexican('Q5588') && field('Q5588') === 'arts', `Frida Kahlo: born in Coyoacán (no coordinates of its own: Mexico City's), in the guide's Mexico City, art`],
        [inMain.has('Q738404') && mexican('Q738404'), `Juan Gabriel (a life in Lives on the map): ${where('Q738404')}, Mexico`],
        ...[['Q1453045', 'Armando Manzanero'], ['Q2832483', 'Aleks Syntek'], ['Q524664', 'Andrés Quintana Roo']].map(([q, n]) => [mexican(q), `${n}: ${where(q)}, Mexico`]),
        [!!loret && (!!find('Q2454225') === loret.sl >= FLOOR), `Carlos Loret de Mola: ${loret ? `${loret.sl} Wikipedias, ${find('Q2454225') ? `listed (${where('Q2454225')})` : `below the floor of ${FLOOR}, not listed`}` : 'not asked'}`],
        [featured.every((q) => inMain.has(q)), `everyone the app features with a place and year of birth is in people.json (${featured.length} of ${first.featured.length})`],
        [out.people.every((p) => p[3] != null && out.places[p[5]]) && more.people.every((p) => p[3] != null && more.places[p[5]]), 'everyone has a year and a place of birth'],
        [[out, more].every((f) => f.people.filter((p) => p[4] == null).every((p) => p[8] === -1)), 'no place of death for anyone without a year of death'],
        [more.people.every((p) => !inMain.has(p[0]) && p[7] >= FLOOR), `more.json: ${more.people.length} people, none of them in people.json, each in ${FLOOR} Wikipedias or more`],
        [!short.length, `each country's share is full, or goes down to ${FLOOR} Wikipedias${short.length ? ` (not: ${short.slice(0, 5).join(', ')}; run --fetch again)` : ''}`],
        [Buffer.byteLength(moreText) <= MORE_MAX, `more.json: ${(Buffer.byteLength(moreText) / 1e6).toFixed(2)} MB (at most ${(MORE_MAX / 1e6).toFixed(1)})`],
      ];
      let bad = 0;
      for (const [ok, msg] of checks) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} born: ${msg}`); }
      process.exit(bad ? 1 : 0);
    }
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, text);
    fs.writeFileSync(OUT_MORE, moreText);
    for (const [name, f, t] of [['people.json', out, text], ['more.json', more, moreText]]) {
      const n = new Map();
      for (const p of f.people) n.set(f.fields[p[6]], (n.get(f.fields[p[6]]) ?? 0) + 1);
      console.log(`${name}: ${f.people.length} people, ${f.places.length} places, ${f.cities.length} guide cities, ${(Buffer.byteLength(t) / 1e6).toFixed(2)} MB; ${[...n].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    }
  }
}
