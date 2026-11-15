// Art and architecture, what's where (v0.27.0): the best-known works of about 200 museums, the artists behind them,
// where our own art items are now, and notable buildings with their architects and styles. All from Wikidata (CC0),
// fetched once and kept in scripts/data/artguide/ (wikidata-*.json), then built into public/data/artguide/.
//
//   node scripts/data/artguide/build-artguide.mjs --fetch   fetch from Wikidata (museums' works, labels, buildings, Now in)
//   node scripts/data/artguide/build-artguide.mjs --labels  fetch again only the names that came back without English
//   node scripts/data/artguide/build-artguide.mjs           build public/data/artguide/
//   node scripts/data/artguide/build-artguide.mjs --check   in check:data: fails if the files are out of date or a
//                                                           known museum, work or architect is missing
//
// Museums: those near the travel guide's cities (scripts/data/guide/wikidata-museums.json) with articles in 20
// Wikipedias or more, minus science museums; each keeps its works now in its collection (or a part of it, such as
// the Louvre's Department of Paintings), with articles in 5 Wikipedias or more, the best known first. A museum with
// fewer than 3 such works is left out (a monument listed as a museum holds none).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HERE = path.join(ROOT, 'scripts/data/artguide');
const OUT = path.join(ROOT, 'public/data/artguide');
const UA = 'AtlasGlobe-research/1.0 (https://example.org)';
const args = process.argv.slice(2);
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const cache = (name) => path.join(HERE, `wikidata-${name}.json`);
const load = (name, def) => (fs.existsSync(cache(name)) ? read(cache(name)) : def);
const save = (name, v) => fs.writeFileSync(cache(name), `${JSON.stringify(v)}\n`);
const r3 = (v) => Math.round(v * 1000) / 1000;
const qid = (u) => (u && /\/entity\/Q\d+$/.test(u) ? u.split('/').pop() : null);
const km = (a, b) => {
  const r = Math.PI / 180;
  const s = Math.sin(((b[1] - a[1]) * r) / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
};
const year = (v) => { const m = /^([+-]?\d{1,4})-/.exec(v ?? ''); return m ? Number(m[1]) : null; };

async function sparql(q) {
  for (let tries = 0; tries < 6; tries++) {
    try {
      const res = await fetch('https://query.wikidata.org/sparql', { method: 'POST', headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: `query=${encodeURIComponent(q)}` });
      if (res.ok) return (await res.json()).results.bindings;
    } catch { /* a dropped connection: try again */ }
    await new Promise((r) => setTimeout(r, 5000 * (tries + 1)));
  }
  throw new Error('Wikidata did not answer');
}

// ---- The guide's cities and the candidate museums -----------------------------------------------------------------
const guide = read(path.join(ROOT, 'public/data/guide/index.json'));
const gcol = (k) => guide.fields.indexOf(k);
const cities = guide.cities.map((c) => ({ id: c[0], name: c[1], es: c[2], at: [c[3], c[4]], country: c[5], pop: c[6] }));
const nearestCity = (at, max = 30) => { let best = null, bd = max; for (const c of cities) { const d = km(at, c.at); if (d < bd) { bd = d; best = c; } } return best; };

function candidates() {
  const all = new Map();
  for (const [city, list] of Object.entries(read(path.join(ROOT, 'scripts/data/guide/wikidata-museums.json')))) {
    for (const m of list) {
      const t = m.types.join(' ').toLowerCase();
      if (m.sl < 20 || !m.at || all.has(m.id)) continue;
      if (/natural history|science|planetarium|aquarium|zoo|botanic|railway|transport|aviation|computer|space/.test(t)) continue;
      all.set(m.id, { ...m, city });
    }
  }
  return [...all.values()];
}

// ---- Fetch ---------------------------------------------------------------------------------------------------------
const worksQuery = (m) => `SELECT ?w ?sl ?type ?typeLabel ?creator ?inc ?img WHERE {
  ?w p:P195 ?st . ?st ps:P195 ?col . ?col wdt:P361* wd:${m} . FILTER NOT EXISTS { ?st pq:P582 [] }
  ?w wikibase:sitelinks ?sl . FILTER(?sl >= 5)
  OPTIONAL { ?w wdt:P31 ?type } OPTIONAL { ?w wdt:P170 ?creator } OPTIONAL { ?w wdt:P571 ?inc } OPTIONAL { ?w wdt:P18 ?img }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} ORDER BY DESC(?sl) LIMIT 160`;

async function fetchWorks(museums) {
  const works = load('works', {});
  const left = museums.filter((m) => !works[m.id]);
  let n = 0;
  const one = async () => {
    for (let m = left.shift(); m; m = left.shift()) {
      const by = {};
      for (const b of await sparql(worksQuery(m.id))) {
        const id = qid(b.w.value);
        const w = (by[id] ??= { sl: Number(b.sl.value), types: [], creator: null, year: null, img: null });
        if (b.typeLabel?.value && !w.types.includes(b.typeLabel.value)) w.types.push(b.typeLabel.value);
        w.creator ??= qid(b.creator?.value);
        w.year ??= year(b.inc?.value);
        w.img ??= b.img ? decodeURIComponent(b.img.value.split('/').pop()) : null;
      }
      works[m.id] = Object.entries(by).sort((a, b) => b[1].sl - a[1].sl).slice(0, 30).map(([id, w]) => ({ id, ...w }));
      if (++n % 25 === 0) { console.log(`works: ${n}`); save('works', works); }
      await new Promise((r) => setTimeout(r, 250));
    }
  };
  await Promise.all([one(), one()]);
  save('works', works);
  return works;
}

/** English and Spanish labels (and how many Wikipedias write about each), 150 items a query. */
async function fetchLabels(ids) {
  const labels = load('labels', {});
  // Names the same in most languages are kept by Wikidata as "mul" (multilingual): Albrecht Dürer has no "en".
  const todo = [...new Set(ids)].filter((x) => x && (!labels[x] || (!labels[x].en && !labels[x].mul)));
  for (let i = 0; i < todo.length; i += 150) {
    const vals = todo.slice(i, i + 150).map((x) => `wd:${x}`).join(' ');
    for (const b of await sparql(`SELECT ?x ?en ?es ?mul ?sl WHERE { VALUES ?x { ${vals} } OPTIONAL { ?x rdfs:label ?en FILTER(lang(?en)='en') } OPTIONAL { ?x rdfs:label ?es FILTER(lang(?es)='es') } OPTIONAL { ?x rdfs:label ?mul FILTER(lang(?mul)='mul') } OPTIONAL { ?x wikibase:sitelinks ?sl } }`)) {
      const id = qid(b.x.value), mul = b.mul?.value ?? null;
      labels[id] = { en: b.en?.value ?? mul, es: b.es?.value ?? null, mul, sl: b.sl ? Number(b.sl.value) : 0 };
    }
    for (const x of todo.slice(i, i + 150)) labels[x] ??= { en: null, es: null, mul: null, sl: 0 };
    for (const x of todo.slice(i, i + 150)) labels[x].mul ??= null;
    if ((i / 150) % 5 === 4) { console.log(`labels: ${Math.min(i + 150, todo.length)}/${todo.length}`); save('labels', labels); }
  }
  save('labels', labels);
  return labels;
}

async function fetchBuildings() {
  if (fs.existsSync(cache('buildings'))) return read(cache('buildings'));
  const by = {};
  const add = (rows) => {
    for (const b of rows) {
      const id = qid(b.b.value);
      const pt = b.coord?.value.match(/Point\(([-\d.e]+) ([-\d.e]+)\)/);
      if (!id || !pt) continue;
      const x = (by[id] ??= { sl: Number(b.sl.value), at: [r3(Number(pt[1])), r3(Number(pt[2]))], arch: [], style: [], year: null, img: null });
      const a = qid(b.arch?.value), s = qid(b.style?.value);
      if (a && !x.arch.includes(a)) x.arch.push(a);
      if (s && !x.style.includes(s)) x.style.push(s);
      x.year ??= year(b.inc?.value);
      x.img ??= b.img ? decodeURIComponent(b.img.value.split('/').pop()) : null;
    }
  };
  // With an architect, in 15 Wikipedias or more; with a style and no architect named, in 25 or more.
  add(await sparql(`SELECT ?b ?sl ?arch ?style ?coord ?inc ?img WHERE { ?b wdt:P84 ?arch ; wikibase:sitelinks ?sl ; wdt:P625 ?coord . FILTER(?sl >= 15) OPTIONAL { ?b wdt:P149 ?style } OPTIONAL { ?b wdt:P571 ?inc } OPTIONAL { ?b wdt:P18 ?img } }`));
  console.log(`buildings with an architect: ${Object.keys(by).length}`);
  add(await sparql(`SELECT ?b ?sl ?style ?coord ?inc ?img WHERE { ?b wdt:P149 ?style ; wikibase:sitelinks ?sl ; wdt:P625 ?coord . FILTER(?sl >= 25) FILTER NOT EXISTS { ?b wdt:P84 [] } OPTIONAL { ?b wdt:P571 ?inc } OPTIONAL { ?b wdt:P18 ?img } }`));
  console.log(`and with a style: ${Object.keys(by).length}`);
  save('buildings', by);
  return by;
}

/** Where our own art items are now: their Wikipedia article's Wikidata item, and its collection today. */
async function fetchNowIn(items) {
  const now = load('nowin', {});
  const todo = items.filter((x) => x.wiki?.en && !(x.id in now));
  for (let i = 0; i < todo.length; i += 60) {
    const part = todo.slice(i, i + 60);
    const vals = part.map((x) => `"${x.wiki.en.replace(/"/g, '\\"')}"@en`).join(' ');
    const rows = await sparql(`SELECT ?t ?w ?col ?colTop WHERE { VALUES ?t { ${vals} } ?a schema:about ?w ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?t .
      OPTIONAL { ?w p:P195 ?st . ?st ps:P195 ?col . FILTER NOT EXISTS { ?st pq:P582 [] } OPTIONAL { ?col wdt:P361 ?colTop } } }`);
    for (const x of part) {
      const r = rows.filter((b) => b.t.value === x.wiki.en);
      now[x.id] = r.length ? { w: qid(r[0].w.value), cols: [...new Set(r.flatMap((b) => [qid(b.col?.value), qid(b.colTop?.value)]).filter(Boolean))] } : null;
    }
  }
  save('nowin', now);
  return now;
}

// ---- Kinds of works and styles ---------------------------------------------------------------------------------------
function workKind(types) {
  const t = types.join(' ').toLowerCase();
  if (/painting|tondo|triptych|diptych|polyptych|fresco|altarpiece|panel|portrait|canvas|icon\b|miniature|drawing|print|watercolor|pastel/.test(t)) return 'painting';
  if (/sculpt|statue|bust|relief|figurine|bronze|marble/.test(t)) return 'sculpture';
  if (/archaeolog|artefact|artifact|stele|stela|inscription|mummy|sarcophag|tablet|seal|papyrus|coin|vase|amphora|antiquit/.test(t)) return 'antiquity';
  return 'object';
}
const STYLES = [
  ['contemporary', /postmodern|deconstructiv|high-tech|contemporary|neo-futur|parametric|blobitecture|critical regional/, '#ff6ec7'],
  ['nouveau', /art nouveau|modernisme|jugendstil|secession|liberty style|catalan modernism/, '#69db7c'],
  ['deco', /art deco|streamline/, '#ffd43b'],
  ['modern', /modern(ism|ist)?\b|international style|bauhaus|brutalis|functionalis|expressionis|constructivis|organic architecture|prairie|metabolis|rationalis|stalinist|socialist/, '#4dabf7'],
  ['revival', /revival|eclectic|beaux-arts|historicis|neo-|victorian|edwardian|second empire|national romantic|romanesque revival/, '#e599f7'],
  ['neoclassical', /neoclassic|palladian|georgian|empire style|federal|greek revival/, '#a5d8ff'],
  ['baroque', /baroque|rococo|churrigueresque|mannerism/, '#ffa94d'],
  ['renaissance', /renaissance|plateresque|manueline|elizabethan|tudor/, '#e8590c'],
  ['gothic', /gothic|isabelline/, '#868e96'],
  ['romanesque', /romanesque|norman|pre-romanesque|carolingian|ottonian/, '#a9805a'],
  ['islamic', /islamic|moorish|mud[eé]jar|mughal|ottoman|persian|mamluk|timurid|safavid|seljuk|nasrid|almohad|fatimid|indo-islamic/, '#20c997'],
  ['byzantine', /byzantine|russian|armenian|georgian church|orthodox/, '#c92a2a'],
  ['asian', /chinese|japanese|buddhist|hindu|dravidian|khmer|korean|nagara|vesara|thai|burmese|tibetan|shinto|newar/, '#f08c00'],
  ['ancient', /ancient|roman architecture|greek|egyptian|classical architecture|hellenistic|etruscan|maya|aztec|inca|pre-columbian|mesopotamian|achaemenid|nabataean/, '#d4a373'],
];
const STYLE_NAMES = {
  contemporary: ['Contemporary', 'Contemporánea'], modern: ['Modern', 'Moderna'], deco: ['Art Deco', 'Art déco'], nouveau: ['Art Nouveau', 'Art nouveau y modernismo'],
  revival: ['Revivals and eclecticism', 'Historicismo y eclecticismo'], neoclassical: ['Neoclassical', 'Neoclásica'], baroque: ['Baroque', 'Barroca'], renaissance: ['Renaissance', 'Renacentista'],
  gothic: ['Gothic', 'Gótica'], romanesque: ['Romanesque', 'Románica'], islamic: ['Islamic', 'Islámica'], byzantine: ['Byzantine and Orthodox', 'Bizantina y ortodoxa'],
  asian: ['Asian traditions', 'Tradiciones asiáticas'], ancient: ['Ancient', 'Antigua'], other: ['Other', 'Otras'],
};
function styleFamily(labels) {
  const t = labels.join(' | ').toLowerCase();
  if (!t) return null;
  for (const [key, re] of STYLES) if (re.test(t)) return key;
  return 'other';
}

// ---- Build ---------------------------------------------------------------------------------------------------------
async function main() {
  const fetchNow = args.includes('--fetch');
  const cands = candidates();
  const artItems = read(path.join(ROOT, 'public/data/art/items.json')).items.filter((x) => x.type === 'work' && x.wiki?.en);
  if (args.includes('--labels')) {
    // Only the labels again (for those without an English name), from the works and buildings already fetched.
    const w = load('works', {}), b = load('buildings', {}), n = load('nowin', {});
    await fetchLabels([...cands.map((m) => m.id), ...Object.values(w).flat().flatMap((x) => [x.id, x.creator]), ...Object.entries(b).flatMap(([id, x]) => [id, ...x.arch, ...x.style]), ...Object.values(n).filter(Boolean).flatMap((x) => [x.w, ...x.cols])]);
  }
  if (fetchNow) {
    const works = await fetchWorks(cands);
    const ids = Object.values(works).flat().flatMap((w) => [w.id, w.creator]);
    const bld = await fetchBuildings();
    const nowin = await fetchNowIn(artItems);
    const bids = Object.entries(bld).flatMap(([id, b]) => [id, ...b.arch, ...b.style]);
    const nids = Object.values(nowin).filter(Boolean).flatMap((x) => [x.w, ...x.cols]);
    await fetchLabels([...cands.map((m) => m.id), ...ids, ...bids, ...nids]);
  }
  const works = load('works', {}), labels = load('labels', {}), bld = load('buildings', {}), nowin = load('nowin', {});
  const L = (id) => labels[id] ?? { en: null, es: null, sl: 0 };
  // A Spanish name the same as the English one is kept as 0 (the app copies the English one).
  const name = (id) => { const l = L(id); const en = l.en ?? l.es ?? id, es = l.es ?? l.en ?? id; return [en, es === en ? 0 : es]; };
  const known = (id) => !!(L(id).en || L(id).es);

  // Museums with three works or more, the best known first.
  const museums = cands.map((m) => ({ ...m, works: (works[m.id] ?? []).filter((w) => known(w.id)) })).filter((m) => m.works.length >= 3)
    .sort((a, b) => b.works.slice(0, 10).reduce((s, w) => s + w.sl, 0) - a.works.slice(0, 10).reduce((s, w) => s + w.sl, 0));
  // A work in two museums' lists (a collection that is part of both) stays with the first one.
  const seen = new Set();
  for (const m of museums) m.works = m.works.filter((w) => !seen.has(w.id) && seen.add(w.id)).slice(0, 25);
  const kept = museums.filter((m) => m.works.length >= 3).slice(0, 220);
  // Artists: everyone with a work kept, the best known first.
  const artistIds = [...new Set(kept.flatMap((m) => m.works.map((w) => w.creator)).filter((x) => x && known(x)))].sort((a, b) => L(b).sl - L(a).sl || a.localeCompare(b));
  const ai = new Map(artistIds.map((x, i) => [x, i]));
  const museumRows = kept.map((m) => { const [en, es] = name(m.id); return [m.id, en, es, m.at[0], m.at[1], m.city, m.v || 0, m.sl, m.web ?? null]; });
  const workRows = [];
  kept.forEach((m, mi) => { for (const w of m.works) { const [en, es] = name(w.id); workRows.push([w.id, en, es, workKind(w.types), mi, ai.has(w.creator) ? ai.get(w.creator) : -1, w.year, w.img, w.sl]); } });
  const artistRows = artistIds.map((x) => { const [en, es] = name(x); return [x, en, es, L(x).sl]; });
  const collections = { about: 'Museums and their best-known works, from Wikidata (CC0), by scripts/data/artguide/build-artguide.mjs (a nombre of 0 is the same as name). museums: [qid, name, nombre, lon, lat, guide city, visitors a year, Wikipedias, website]; works: [qid, name, nombre, kind, museum, artist (-1: unknown), year, Commons picture, Wikipedias]; artists: [qid, name, nombre, Wikipedias].', museums: museumRows, works: workRows, artists: artistRows };

  // Buildings, near a guide city or not, with their architects and style.
  const styleOf = (b) => styleFamily(b.style.map((s) => L(s).en ?? '').filter(Boolean));
  const blist = Object.entries(bld).filter(([id]) => known(id)).sort((a, b) => b[1].sl - a[1].sl || a[0].localeCompare(b[0]));
  const archIds = [...new Set(blist.flatMap(([, b]) => b.arch).filter((x) => known(x)))].sort((a, b) => L(b).sl - L(a).sl || a.localeCompare(b));
  const ri = new Map(archIds.map((x, i) => [x, i]));
  const buildingRows = blist.map(([id, b]) => { const [en, es] = name(id); return [id, en, es, b.at[0], b.at[1], nearestCity(b.at, 30)?.id ?? null, b.arch.filter((x) => ri.has(x)).map((x) => ri.get(x)), styleOf(b), b.year, b.img, b.sl]; });
  const architecture = {
    about: 'Notable buildings with their architects and styles, from Wikidata (CC0), by scripts/data/artguide/build-artguide.mjs. buildings: [qid, name, nombre (0: as name), lon, lat, guide city, [architects], style, year, Commons picture, Wikipedias]; architects: [qid, name, nombre, Wikipedias]; styles: [key, name, nombre, colour].',
    styles: [...STYLES.map(([k, , c]) => [k, ...STYLE_NAMES[k], c]), ['other', ...STYLE_NAMES.other, '#adb5bd']],
    architects: archIds.map((x) => { const [en, es] = name(x); return [x, en, es, L(x).sl]; }),
    buildings: buildingRows,
  };

  // Now in: where our art items are today (a museum of the list, or the collection Wikidata names, with its city).
  const nowRows = {};
  const mi = new Map(kept.map((m, i) => [m.id, i]));
  for (const x of artItems) {
    const n = nowin[x.id];
    if (!n) continue;
    const inList = n.cols.find((c) => mi.has(c));
    const full = (id) => { const [en, es] = name(id); return [en, es || en]; };
    if (inList) { const m = kept[mi.get(inList)]; nowRows[x.id] = [m.id, ...full(m.id), m.city]; continue; }
    const c = n.cols.find((c) => known(c) && !/collection|department|départe|gallery \d|room/i.test(L(c).en ?? ''));
    if (c) nowRows[x.id] = [c, ...full(c), null];
  }
  const nowFile = { about: 'Where the art items of the stories are now (their collection on Wikidata): item id → [Wikidata id, name, nombre, guide city when the museum is in the list].', items: nowRows };

  const files = { 'collections.json': JSON.stringify(collections), 'architecture.json': JSON.stringify(architecture), 'nowin.json': JSON.stringify(nowFile) };
  // Checks: museums, works and architects that must be there.
  const problems = [];
  const has = (rows, id) => rows.some((r) => r[0] === id);
  for (const [id, what] of [['Q19675', 'the Louvre'], ['Q160112', 'the Prado'], ['Q160236', 'the Met'], ['Q6373', 'the British Museum'], ['Q51252', 'the Uffizi'], ['Q190804', 'the Rijksmuseum']]) if (!has(museumRows, id)) problems.push(`museum missing: ${what} (${id})`);
  for (const [id, what] of [['Q12418', 'the Mona Lisa'], ['Q208758', 'Las Meninas'], ['Q48584', 'the Rosetta Stone'], ['Q219831', 'The Night Watch']]) if (!has(workRows, id)) problems.push(`work missing: ${what} (${id})`);
  if (!architecture.architects.some((a) => /Gaudí/.test(a[1]))) problems.push('architect missing: Gaudí');
  const noEs = workRows.filter((w) => !L(w[0]).es).length;
  // The --check below compares with the files written by the last build.
  console.log(`${kept.length} museums (of ${cands.length} candidates), ${workRows.length} works by ${artistRows.length} artists (${noEs} without a Spanish name, shown in English); ${buildingRows.length} buildings by ${archIds.length} architects, ${buildingRows.filter((b) => b[7]).length} with a style; Now in for ${Object.keys(nowRows).length} of ${artItems.length} art items`);
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  if (args.includes('--check')) {
    const stale = Object.entries(files).filter(([f, s]) => !fs.existsSync(path.join(OUT, f)) || fs.readFileSync(path.join(OUT, f), 'utf8') !== s);
    if (stale.length) { console.error(`public/data/artguide is out of date (${stale.map(([f]) => f).join(', ')}): run node scripts/data/artguide/build-artguide.mjs`); process.exit(1); }
    console.log('art guide data is up to date');
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const [f, s] of Object.entries(files)) fs.writeFileSync(path.join(OUT, f), s);
  console.log(`wrote public/data/artguide (${Object.entries(files).map(([f, s]) => `${f} ${(s.length / 1024).toFixed(0)} KB`).join(', ')})`);
}
await main();
