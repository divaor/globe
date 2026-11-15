// Facts for Lives on the map (v0.28.0), from Wikidata (CC0): for each person of _people.json, their Wikidata id,
// names and Wikipedia titles, dates of birth and death (with their precision), where they were born, died and are
// buried, the other places Wikidata ties them to (homes, schools, employers, places of work), museums and memorials
// named after them, and their notable works. The lives are written by hand from fuller sources; these facts seed
// them and check them (build-conflicts.mjs --kind lives --lint).
//
//   node scripts/data/lives/fetch-facts.mjs            asks Wikidata (a few dozen short questions) and writes _facts.json
//   node scripts/data/lives/fetch-facts.mjs --sheets <dir>   writes one readable sheet per person from _facts.json
//
// The answers are kept in .cache/lives (delete a file there to ask again). See wdqs.mjs for where they come from.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask as askIn, askFor } from './wdqs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const CACHE = path.join(ROOT, '.cache/lives');
const people = JSON.parse(fs.readFileSync(path.join(HERE, '_people.json'), 'utf8'));
const ask = (name, query) => askIn(CACHE, name, query);

const v = (b, k) => b[k]?.value;
const qid = (u) => u?.replace(/^.*\//, '');
const point = (wkt) => { const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/i.exec(wkt ?? ''); return m ? [Math.round(Number(m[1]) * 1e4) / 1e4, Math.round(Number(m[2]) * 1e4) / 1e4] : null; };
/** A Wikidata time and its precision (9 a year, 10 a month, 11 a day) as "1907-07-06", "1907-07", "1907" or "-0286". */
function dateOf(time, precision) {
  const m = /^(-?)(\d+)-(\d\d)-(\d\d)T/.exec(time ?? '');
  if (!m) return null;
  // Wikidata's years BC are astronomical in RDF (-0286 is 287 BC): the stories write the historical year.
  const year = m[1] ? Number(m[2]) + 1 : Number(m[2]);
  const y = `${m[1]}${String(year).padStart(4, '0')}`;
  const p = Number(precision);
  return { date: p >= 11 ? `${y}-${m[3]}-${m[4]}` : p === 10 ? `${y}-${m[3]}` : y, approx: p < 9 };
}

async function fetchAll() {
  // Who: each English Wikipedia title's item. Then one simple question at a time about those items.
  const titles = people.map((p) => JSON.stringify(p.wiki) + '@en').join(' ');
  const ids = await ask('ids', `SELECT ?title ?p WHERE { VALUES ?title { ${titles} } ?art schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title ; schema:about ?p . }`);
  const qids = ids.map((b) => qid(v(b, 'p')));
  const titleOf = new Map(ids.map((b) => [qid(v(b, 'p')), v(b, 'title')]));
  const T = (b, k = 'p') => titleOf.get(qid(v(b, k)));
  const label = async (name, variable, list, lang) => new Map((await askFor(CACHE, `${name}-${lang}`, variable, list, `?${variable} ?l`, `?${variable} rdfs:label ?l . FILTER(LANG(?l) = "${lang}")`)).map((b) => [qid(v(b, variable)), v(b, 'l')]));
  const coords = async (name, list) => new Map((await askFor(CACHE, `${name}-at`, 'x', list, '?x ?c', '?x wdt:P625 ?c .')).map((b) => [qid(v(b, 'x')), point(v(b, 'c'))]));
  const en = await label('who', 'p', qids, 'en'), es = await label('who', 'p', qids, 'es');
  const eswiki = new Map((await askFor(CACHE, 'eswiki', 'p', qids, '?p ?name', '?a schema:about ?p ; schema:isPartOf <https://es.wikipedia.org/> ; schema:name ?name .')).map((b) => [qid(v(b, 'p')), v(b, 'name')]));
  const dates = async (prop) => askFor(CACHE, `date-${prop}`, 'p', qids, '?p ?t ?prec ?rank', `?p p:${prop} ?s . ?s psv:${prop} ?val ; wikibase:rank ?rank . ?val wikibase:timeValue ?t ; wikibase:timePrecision ?prec .`);
  const born = await dates('P569'), died = await dates('P570');
  const PLACE_PROPS = ['P19', 'P20', 'P119', 'P551', 'P69', 'P108', 'P937', 'P7153'];
  const placeRows = [];
  for (const prop of PLACE_PROPS) {
    for (const b of await askFor(CACHE, `place-${prop}`, 'p', qids, '?p ?st ?place ?rank', `?p p:${prop} ?st . ?st ps:${prop} ?place ; wikibase:rank ?rank .`)) placeRows.push({ b, prop });
  }
  const stIds = placeRows.map(({ b }) => `<${v(b, 'st')}>`);
  const qual = async (pq) => new Map((await askFor(CACHE, `qual-${pq}`, 'st', stIds, '?st ?t', `?st pq:${pq} ?t .`, 200)).map((b) => [v(b, 'st'), v(b, 't')]));
  const from = await qual('P580'), to = await qual('P582'), at = await qual('P585');
  const linkedRows = [];
  for (const prop of ['P138', 'P547', 'P825']) linkedRows.push(...await askFor(CACHE, `linked-${prop}`, 'p', qids, '?p ?m ?c ?sl', `?m wdt:${prop} ?p ; wdt:P625 ?c ; wikibase:sitelinks ?sl . FILTER(?sl >= 2)`));
  const workRows = await askFor(CACHE, 'works', 'p', qids, '?p ?w', '?p wdt:P800 ?w .');
  const workIds = workRows.map((b) => qid(v(b, 'w')));
  const made = new Map((await askFor(CACHE, 'work-made', 'w', workIds, '?w ?t', '?w wdt:P571 ?t .')).map((b) => [qid(v(b, 'w')), v(b, 't')]));
  const workLoc = new Map();
  for (const prop of ['P276', 'P195']) for (const b of await askFor(CACHE, `work-${prop}`, 'w', workIds, '?w ?loc', `?w wdt:${prop} ?loc .`)) if (!workLoc.has(qid(v(b, 'w')))) workLoc.set(qid(v(b, 'w')), qid(v(b, 'loc')));
  const linkedIds = linkedRows.map((b) => qid(v(b, 'm')));
  const types = new Map();
  for (const b of await askFor(CACHE, 'linked-type', 'm', linkedIds, '?m ?t', '?m wdt:P31 ?t .')) types.set(qid(v(b, 'm')), [...(types.get(qid(v(b, 'm'))) ?? []), qid(v(b, 't'))]);
  // Names (and coordinates) of everything named: places, memorials, works, where the works are, and the kinds of memorial.
  const things = [...new Set([...placeRows.map(({ b }) => qid(v(b, 'place'))), ...linkedIds, ...workIds, ...workLoc.values(), ...[...types.values()].flat()])];
  const tEn = await label('thing', 'x', things, 'en'), tEs = await label('thing', 'x', things, 'es');
  const tAt = await coords('thing', [...new Set([...placeRows.map(({ b }) => qid(v(b, 'place'))), ...workLoc.values()])]);
  const RANK = (r) => (/PreferredRank$/.test(r ?? '') ? 2 : /NormalRank$/.test(r ?? '') ? 1 : 0);

  const byTitle = new Map(people.map((p) => [p.wiki, { id: p.id, qid: null, name: {}, wiki: { en: p.wiki }, born: null, died: null, places: [], linked: [], works: [] }]));
  for (const b of ids) {
    const f = byTitle.get(v(b, 'title')), q = qid(v(b, 'p'));
    f.qid = q;
    if (en.get(q)) f.name.en = en.get(q);
    if (es.get(q)) f.name.es = es.get(q);
    if (eswiki.get(q)) f.wiki.es = eswiki.get(q);
  }
  // Dates: the preferred statements, or else the normal ones; the most precise first.
  const setDates = (rows, key) => {
    const by = new Map();
    for (const b of rows) { const t = T(b); if (t && RANK(v(b, 'rank'))) by.set(t, [...(by.get(t) ?? []), b]); }
    for (const [t, list] of by) {
      const top = Math.max(...list.map((b) => RANK(v(b, 'rank'))));
      const seen = [];
      for (const b of list.filter((x) => RANK(v(x, 'rank')) === top)) { const d = dateOf(v(b, 't'), v(b, 'prec')); if (d && !seen.some((x) => x.date === d.date)) seen.push(d); }
      byTitle.get(t)[key] = seen.sort((a, c) => c.date.length - a.date.length);
    }
  };
  setDates(born, 'born'); setDates(died, 'died');
  const PROPS = { P19: 'born', P20: 'died', P119: 'buried', P551: 'lived', P69: 'studied', P108: 'worked for', P937: 'worked in', P7153: 'significant place' };
  const year = (t) => (t ? dateOf(t, 9)?.date ?? null : null);
  for (const { b, prop } of placeRows) {
    const f = byTitle.get(T(b));
    if (!f || !RANK(v(b, 'rank'))) continue;
    const q = qid(v(b, 'place'));
    if (!tEn.get(q)) continue;
    const row = { what: PROPS[prop], qid: q, name: { en: tEn.get(q), es: tEs.get(q) ?? tEn.get(q) }, at: tAt.get(q) ?? null };
    const st = v(b, 'st');
    if (from.get(st)) row.from = year(from.get(st));
    if (to.get(st)) row.to = year(to.get(st));
    if (at.get(st)) row.in = year(at.get(st));
    if (!f.places.some((x) => x.what === row.what && x.qid === row.qid)) f.places.push(row);
  }
  const KEEP = /museum|memorial|monument|mausoleum|tomb|grave|house|home|birthplace|statue|cemetery|library|archive|shrine|chapel|cenotaph|historic site|heritage/i;
  for (const b of linkedRows) {
    const f = byTitle.get(T(b)), q = qid(v(b, 'm'));
    const type = (types.get(q) ?? []).map((t) => tEn.get(t)).filter(Boolean).join(', ');
    if (!f || !tEn.get(q) || (!KEEP.test(type) && !KEEP.test(tEn.get(q)))) continue;
    if (!f.linked.some((x) => x.qid === q)) f.linked.push({ qid: q, name: { en: tEn.get(q), es: tEs.get(q) ?? tEn.get(q) }, at: point(v(b, 'c')), type, sl: Number(v(b, 'sl')) });
  }
  for (const b of workRows) {
    const f = byTitle.get(T(b)), q = qid(v(b, 'w'));
    if (!f || !tEn.get(q) || f.works.some((x) => x.qid === q)) continue;
    const loc = workLoc.get(q);
    f.works.push({ qid: q, name: { en: tEn.get(q), es: tEs.get(q) ?? tEn.get(q) }, made: year(made.get(q)), where: loc ? tEn.get(loc) ?? null : null, at: loc ? tAt.get(loc) ?? null : null });
  }
  const out = {};
  for (const f of byTitle.values()) {
    if (!f.qid) { console.warn(`  no Wikidata item for "${f.wiki.en}": check the title in _people.json`); continue; }
    f.linked.sort((a, b) => b.sl - a.sl); f.linked = f.linked.slice(0, 12);
    f.works = f.works.slice(0, 20);
    const { id, ...rest } = f;
    out[id] = rest;
  }
  fs.writeFileSync(path.join(HERE, '_facts.json'), `${JSON.stringify(out, null, 1)}\n`);
  console.log(`wrote _facts.json: ${Object.keys(out).length} of ${people.length} people`);
}

/** A readable sheet per person, for whoever writes the life. */
function sheets(dir) {
  const facts = JSON.parse(fs.readFileSync(path.join(HERE, '_facts.json'), 'utf8'));
  fs.mkdirSync(dir, { recursive: true });
  const at = (p) => (p ? `[${p[0]}, ${p[1]}]` : 'no coordinates');
  for (const p of people) {
    const f = facts[p.id];
    if (!f) continue;
    const span = (r) => [r.from && `from ${r.from}`, r.to && `to ${r.to}`, r.in && `in ${r.in}`].filter(Boolean).join(' ');
    const lines = [
      `# ${f.name.en ?? p.wiki}  (id: ${p.id}, field: ${p.field})`,
      `Wikidata: ${f.qid}   Spanish name on Wikidata: ${f.name.es ?? `${f.name.en ?? p.wiki} (the same as in English, unless Spanish has its own)`}`,
      `Wikipedia: en "${f.wiki.en}"   es "${f.wiki.es ?? '?'}"`,
      `Born (Wikidata): ${(f.born ?? []).map((d) => d.date + (d.approx ? ' (imprecise)' : '')).join(' or ') || '?'}`,
      `Died (Wikidata): ${(f.died ?? []).map((d) => d.date + (d.approx ? ' (imprecise)' : '')).join(' or ') || '?'}`,
      '', 'Places Wikidata ties to this person (check each against your reading; Wikidata has gaps and errors):',
      ...f.places.map((r) => `- ${r.what}: ${r.name.en}${r.name.es && r.name.es !== r.name.en ? ` / ${r.name.es}` : ''}  ${at(r.at)}  ${span(r)}`.trimEnd()),
      '', 'Museums, houses, graves and memorials named after them (candidates for "visit"):',
      ...(f.linked.length ? f.linked.map((r) => `- ${r.name.en}${r.name.es && r.name.es !== r.name.en ? ` / ${r.name.es}` : ''}  ${at(r.at)}  (${r.type || 'place'})`) : ['- none found']),
      '', 'Notable works on Wikidata:',
      ...(f.works.length ? f.works.map((r) => `- ${r.name.en}${r.made ? ` (${r.made})` : ''}${r.where ? `, now in ${r.where} ${at(r.at)}` : ''}`) : ['- none listed']),
      '',
    ];
    fs.writeFileSync(path.join(dir, `${p.id}.txt`), lines.join('\n'));
  }
  console.log(`wrote ${people.filter((p) => facts[p.id]).length} sheets to ${dir}`);
}

const i = process.argv.indexOf('--sheets');
if (i >= 0) sheets(process.argv[i + 1]);
else await fetchAll();
