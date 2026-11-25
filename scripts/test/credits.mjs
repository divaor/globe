// Checks the credits (public/data/credits/credits.json, v0.47.0), the content of the credits screen, with Node and
// nothing fetched:
//   - the app's own licence and address, as package.json and the README's Licence section give them;
//   - the groups: known ids, in their order, none empty; ids unique; every item with its fields and a plain sentence
//     in the five languages (non-empty, at most 160 characters, no file names or jargon, each language's own usage);
//   - every link https, and an address for the licence text wherever the licence has one;
//   - every source the SOURCES.md files name is credited: each row of their tables' Source and Dataset columns names
//     a known source (or is the app's own work, in the exceptions below), and every known source named anywhere in
//     a SOURCES.md, in the README's Data section or in a filter's credit line (src/) is covered by an item (loose,
//     case-insensitive match on the item's name, maker, id and address);
//   - every outside service the app calls (https addresses in src/), every library it ships (package.json) and every
//     font in public/data/fonts is credited.
// Usage: node scripts/test/credits.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const C = JSON.parse(read('public/data/credits/credits.json'));
const pkg = JSON.parse(read('package.json'));

let failed = 0;
const check = (ok, msg, why = []) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (ok) return;
  failed++;
  for (const w of why.slice(0, 25)) console.log(`       ${w}`);
  if (why.length > 25) console.log(`       … and ${why.length - 25} more`);
};

const GROUPS = ['maps', 'nature', 'earth', 'space', 'history', 'words', 'pictures', 'live', 'code'];
const LANGS = ['en', 'es', 'pt', 'fr', 'de'];
const REQUIRED = ['id', 'name', 'what', 'licence', 'url'];
const OPTIONAL = ['by', 'licenceUrl'];
const MAX = 160;
/** Licences the screen shows, in the short form; those before the break have a licence text to link to. */
const WITH_TEXT = ['CC0', 'CC BY 4.0', 'CC BY-SA 4.0', 'CC BY-IGO 3.0', 'CC0 and CC BY 4.0', 'Public domain and CC BY-SA 4.0', 'ODbL 1.0',
  'ODC-By 1.0', 'GPL-3.0', 'MIT', 'ISC', 'BSD 3-Clause', 'OFL 1.1', 'Unicode License v3', 'Each file’s own licence', 'Each photo’s own licence'];
const LICENCES = [...WITH_TEXT, 'Public domain', 'Free to use', 'Free to use with attribution', 'Free to use with citation', 'Cited as a source'];

// ---- The app.
const licenceSection = read('README.md').split(/^## /m).find((s) => s.startsWith('Licence')) ?? '';
check(C.app?.licence === pkg.license && licenceSection.includes(pkg.license),
  `the app's licence is ${C.app?.licence}, as package.json and the README's Licence section say`);

// ---- Groups and items.
const groups = C.groups ?? [];
const gids = groups.map((g) => g.id);
check(gids.length > 0 && gids.every((g) => GROUPS.includes(g)), `group ids are from the list (${gids.join(', ')})`, gids.filter((g) => !GROUPS.includes(g)));
check(gids.every((g, i) => i === 0 || GROUPS.indexOf(g) > GROUPS.indexOf(gids[i - 1])), 'groups are in their order, each once');
check(groups.every((g) => Array.isArray(g.items) && g.items.length > 0), 'no group is empty');
const items = groups.flatMap((g) => (g.items ?? []).map((it) => ({ ...it, group: g.id })));
const byId = new Map();
for (const it of items) byId.set(it.id, [...(byId.get(it.id) ?? []), it]);
const dup = [...byId].filter(([, l]) => l.length > 1).map(([id]) => id);
check(!dup.length, `${items.length} items, ids unique`, dup);
const badIds = items.filter((it) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(it.id ?? '')).map((it) => String(it.id));
check(!badIds.length, 'ids are lowercase words joined by hyphens', badIds);

const fieldErrs = [];
for (const it of items) {
  for (const f of REQUIRED) if (it[f] == null || it[f] === '') fieldErrs.push(`${it.id}: no ${f}`);
  for (const f of ['name', 'licence', 'url', ...OPTIONAL]) if (it[f] != null && (typeof it[f] !== 'string' || !it[f].trim() || it[f] !== it[f].trim())) fieldErrs.push(`${it.id}: ${f} is not a trimmed, non-empty string`);
  for (const f of Object.keys(it)) if (![...REQUIRED, ...OPTIONAL, 'group'].includes(f)) fieldErrs.push(`${it.id}: unknown field ${f}`);
  if (it.what && typeof it.what === 'object') {
    for (const l of LANGS) if (typeof it.what[l] !== 'string' || !it.what[l].trim()) fieldErrs.push(`${it.id}: no ${l}`);
    for (const l of Object.keys(it.what)) if (!LANGS.includes(l)) fieldErrs.push(`${it.id}: unknown language ${l}`);
  } else fieldErrs.push(`${it.id}: "what" is not an object of languages`);
}
check(!fieldErrs.length, `every item has ${REQUIRED.join(', ')} (and maybe ${OPTIONAL.join(', ')}), with ${LANGS.join(', ')}`, fieldErrs);

const texts = items.flatMap((it) => LANGS.map((l) => ({ id: it.id, l, s: it.what?.[l] ?? '' })));
const long = texts.filter((t) => t.s.length > MAX);
const longest = texts.reduce((a, t) => (t.s.length > a.s.length ? t : a), texts[0]);
check(!long.length, `every sentence has at most ${MAX} characters (longest: ${longest.id}/${longest.l}, ${longest.s.length}; over 140: ${texts.filter((t) => t.s.length > 140).length})`,
  long.map((t) => `${t.id}/${t.l} (${t.s.length}): ${t.s}`));
const notSentence = texts.filter((t) => t.s !== t.s.trim() || !/^\p{Lu}/u.test(t.s) || !/[.!?]$/.test(t.s) || /\s{2,}/.test(t.s));
check(!notSentence.length, 'every sentence starts with a capital and ends with a full stop', notSentence.map((t) => `${t.id}/${t.l}: ${t.s}`));
const JARGON = [/\b[\w-]+\.(json|md|csv|png|jpe?g|webp|mjs|ts|tif|nc|zip|svg|woff2)\b|\b(TopoJSON|GeoJSON|JSON|APIs?|WMTS?|SPARQL|CSV|URL|SDK|MVT|dataset|raster|npm|repo)\b/i, /SOURCES/];
const jargon = texts.filter((t) => JARGON.some((re) => re.test(t.s)));
check(!jargon.length, 'no file names, "SOURCES.md" or jargon in the sentences', jargon.map((t) => `${t.id}/${t.l}: ${t.s}`));
const straight = texts.filter((t) => /'/.test(t.s));
check(!straight.length, 'apostrophes are typographic (’)', straight.map((t) => `${t.id}/${t.l}: ${t.s}`));
/** Each language's own usage: British English, Latin American Spanish, Brazilian Portuguese, French of France. */
/** Any of these as a whole word (accented letters count as letters, which \b does not know). */
const words = (list, flags = 'iu') => new RegExp(`(?<!\\p{L})(${list})(?!\\p{L})`, flags);
const USAGE = {
  en: [[words('colors?|centers?|licenses?|meters?|neighbors?|favorites?|gray|organizations?|kilometers?|catalogs?|traveling|analyze')], 'American spelling'],
  es: [[words('vosotr[oa]s|vuestr[oa]s?|os|ordenador(es)?|móvil(es)?|coches?|conducir'), /\p{L}(áis|éis)(?!\p{L})/u], 'Spanish of Spain'],
  pt: [[words('ecrã|telemóve(l|is)|utilizador(es)?|facto|registo|equipa|descarregar|ficheiros?|autocarro|comboio')], 'Portuguese of Portugal'],
  fr: [[/[^  ][:;?!]/, words('vous|votre|vos')], 'a missing non-breaking space before : ; ? ! or "vous" (the app says "tu")'],
  de: [[words('Sie|Ihre?[mnrs]?', 'u')], '"Sie" (the app says "du")'],
};
for (const l of LANGS) {
  const bad = texts.filter((t) => t.l === l && USAGE[l][0].some((re) => re.test(t.s)));
  check(!bad.length, `${l}: no ${USAGE[l][1]}`, bad.map((t) => `${t.id}: ${t.s}`));
}

// ---- Links and licences.
const isHttps = (u) => { try { return new URL(u).protocol === 'https:'; } catch { return false; } };
const badUrls = items.flatMap((it) => ['url', 'licenceUrl'].filter((f) => it[f] != null && !isHttps(it[f])).map((f) => `${it.id}: ${f} ${it[f]}`));
check(!badUrls.length && isHttps(C.app?.url), 'every url and licenceUrl is https', badUrls);
const unknownLicences = items.filter((it) => !LICENCES.includes(it.licence)).map((it) => `${it.id}: ${it.licence}`);
check(!unknownLicences.length, `licences are in their short forms (${[...new Set(items.map((it) => it.licence))].length} different)`, unknownLicences);
const noText = items.filter((it) => WITH_TEXT.includes(it.licence) && !it.licenceUrl).map((it) => `${it.id}: ${it.licence}`);
check(!noText.length, 'every licence with a text links to it', noText);

// ---- Coverage of the sources.
/** Lowercase, without accents, words only, padded with spaces: "Köppen–Geiger" → " koppen geiger ". */
const norm = (s) => ` ${String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
const hay = new Map(items.map((it) => [it.id, norm([it.name, it.by ?? '', it.id, it.url].join(' '))]));
/** The sources the app's data names, each a set of spellings ("a|b"): found in a text by any of them, credited when
 *  an item's name, maker, id or address holds any of them. */
const KNOWN = [
  // Maps and country facts.
  'natural earth', 'ocha|humanitarian data exchange', 'geonames', 'blue marble', 'stockli', 'basemap', 'tom patterson|shadedrelief', 'etopo', 'amante',
  'terrain tiles', 'mapzen|tilezen', 'aws', '3dep', 'srtm', 'gmted2010|gmted', 'arcticdem', 'eu dem', 'copernicus',
  'geoscience australia', 'open government licence canada', 'offene daten osterreichs', 'inegi', 'land information new zealand|linz',
  'kartverket', 'environment agency', 'sentinel 2 cloudless', 'eox', 'gibs', 'worldview', 'eosdis', 'modis', 'viirs', 'amsr2',
  'factbook', 'mledoze', 'world bank', 'datahub', 'our world in data|owid', 'global carbon project', 'ember', 'energy institute',
  'undp', 'world happiness report', 'wellbeing research centre', 'gallup', 'ncd risc', 'country coder', 'openstreetmap',
  'iana|tz database', 'countries ruby gem|countries gem', 'samayo|country json', 'olympedia', 'keithgalli|keith galli',
  'mineral commodity summaries', 'world nuclear association', 'kimberley process',
  // Nature.
  'gbif', 'resolve', 'dinerstein', 'gebco', 'iho', 'wallace', 'olson', 'conservation international',
  // The Earth.
  'anss|comcat', 'smithsonian|global volcanism program', 'crust1 0', 'laske', 'world magnetic model', 'gufm1', 'igrf', 'pb2002',
  'nordpil', 'ahlenius', 'bird 2003|peter bird', 'nnr morvel56', 'argus', 'merdith', 'gplates', 'chronostratigraphic', 'cgmw',
  'paleobiology database', 'planck', 'fixsen', 'gough', 'connelly', 'kruijer', 'dauphas', 'wang et al', 'era interim', 'ecmwf',
  'dee', 'gpcp', 'adler', 'huffman', 'ersst', 'huang', 'koppen', 'kottek', 'rubel', 'beck', 'koppen climate lookup', 'cru cl',
  'climatic research unit', 'university of east anglia', 'new et al|new m',
  // Space.
  'solar system treks|trek', 'astrogeology', 'planetary nomenclature', 'iau', 'solar system scope', 'jhuapl', 'carnegie',
  'arizona state university', 'dlr', 'space science institute', 'swri', 'gsfc', 'jpl', 'messenger', 'magellan', 'lro', 'viking',
  'mgs', 'galileo', 'voyager', 'cassini', 'dawn', 'new horizons', 'lola', 'mola', 'pds geosciences', 'cgi moon kit', 'standish',
  'small body database', 'd3 celestial', 'olaf frohn', 'xhip', 'kostjuk', 'davenhall', 'vizier', 'seds', 'stellarium', 'eso',
  'brunier', 'hurt', 'johnson', 'astronomical almanac', 'lieske', 'mallama',
  // History and the cards' own sources.
  'historical basemaps', 'ourednik', 'thinkquest', 'unesco|world heritage list', 'slavevoyages|trans atlantic slave trade database',
  'unaids', 'fao', 'whoi', 'mbari', 'schmidt ocean institute', 'interridge', 'earth impact database', 'cnsa', 'isro', 'jaxa', 'esa',
  // Code and fonts that the README and the credit lines name.
  'flag icons|lipiridis', 'noto', 'jigmo',
  // Words, pictures and what is read live.
  'wikidata', 'qlever', 'cldr', 'wikisource', 'idescat', 'istat', 'citypopulation', 'wikipedia', 'wikimedia commons', 'wikivoyage',
  'usgs|u s geological survey', 'open meteo', 'wheretheiss|where the iss', 'inaturalist', 'obis', 'macrostrat', 'nasa', 'noaa', 'ncei',
].map((k) => ({ k, alts: k.split('|').map(norm) }));
const found = (text, n) => n.alts.some((a) => text.includes(a));
const covered = (n) => [...hay.values()].some((h) => found(h, n));
/** Table rows that name no source of their own: the app's own work, or its own files credited through their sources. */
const OWN = [
  [/written for the app|compiled|computed|sorted by hand|atlas globe research|peer-reviewed compilations/i, 'written or worked out for the app'],
  [/the app['’]s (own|country facts)|public\/data\/|the sources listed for each/i, 'the app’s own data, credited through its own sources'],
  [/^same (data|grid)$/i, 'the row above’s source'],
  [/^[—-]?$/, 'no source: an invented example'],
];
const own = (cell) => OWN.some(([re]) => re.test(cell.trim()));

/** Markdown tables: [{ head: [...], rows: [[...], ...] }]. */
function tables(md) {
  const out = [];
  let cur = null;
  for (const line of md.split('\n')) {
    if (!line.trim().startsWith('|')) { cur = null; continue; }
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (!cur) { cur = { head: cells.map((c) => c.toLowerCase()), rows: [] }; out.push(cur); } else if (!cells.every((c) => /^:?-+:?$/.test(c))) cur.rows.push(cells);
  }
  return out;
}
const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? walk(p) : [p];
});
const sourcesFiles = walk('public/data').filter((p) => path.basename(p) === 'SOURCES.md').sort();
check(sourcesFiles.length >= 13, `${sourcesFiles.length} SOURCES.md files read`);

const unrecognised = [];
const missing = new Map(); // known source → where it is named
const need = (n, where) => { if (!covered(n)) missing.set(n.k, [...(missing.get(n.k) ?? []), where]); };
let rows = 0;
for (const f of sourcesFiles) {
  const md = read(f);
  for (const t of tables(md)) {
    const cols = t.head.map((h, i) => (/^(source|dataset)$/.test(h) ? i : -1)).filter((i) => i >= 0);
    for (const r of t.rows) for (const i of cols) {
      const cell = r[i] ?? '';
      rows++;
      const names = KNOWN.filter((n) => found(norm(cell), n));
      if (!names.length && !own(cell)) unrecognised.push(`${f}: ${cell}`);
    }
  }
  for (const n of KNOWN) if (found(norm(md), n)) need(n, f);
}
check(!unrecognised.length, `each of the ${rows} Source and Dataset cells of the SOURCES.md tables names a known source or is the app’s own`, unrecognised);

const dataSection = read('README.md').split(/^## /m).find((s) => s.startsWith('Data')) ?? '';
check(dataSection.length > 1000, 'the README has a Data section');
for (const n of KNOWN) if (found(norm(dataSection), n)) need(n, 'README.md (Data)');

const srcFiles = walk('src').filter((p) => /\.(ts|mts|js)$/.test(p));
check(isHttps(C.app?.url) && srcFiles.some((f) => read(f).includes(C.app.url)), `the app's address is ${C.app?.url}, as the app links it`);
const creditLines = [];
for (const f of srcFiles) for (const m of read(f).matchAll(/\bcredit:\s*(['`])((?:\\.|(?!\1)[^\\])*)\1/g)) if (m[2].trim()) creditLines.push({ f, s: m[2] });
const OWN_CREDIT = /computed from|your own data|curated from|compiled|schematic|from dated rocks|approximate areas from published|^your data$/i;
/** A line made of other credits (`${o.credit}; zoomed in: ${…}`) is checked where those are written. */
const glue = (s) => s.includes('${') && s.replace(/\$\{[^}]*\}/g, '').replace(/[^\p{L}]+/gu, ' ').trim().length < 20;
const strayCredits = creditLines.filter((c) => !glue(c.s) && !KNOWN.some((n) => found(norm(c.s), n)) && !OWN_CREDIT.test(c.s)).map((c) => `${c.f}: ${c.s}`);
check(!strayCredits.length, `each of the ${creditLines.length} filters' credit lines in src/ names a known source or the app’s own work`, strayCredits);
for (const c of creditLines) for (const n of KNOWN) if (found(norm(c.s), n)) need(n, c.f);

check(!missing.size, `every known source named in the SOURCES.md files, the README’s Data section and the credit lines is credited (${KNOWN.length} names)`,
  [...missing].map(([k, w]) => `${k}: named in ${[...new Set(w)].join(', ')}`));
const allText = norm([...sourcesFiles.map(read), dataSection, ...creditLines.map((c) => c.s)].join('\n'));
const stale = KNOWN.filter((n) => !found(allText, n)).map((n) => n.k);
check(!stale.length, 'every name on the test’s list of known sources is named somewhere (no stale names)', stale);

// ---- Outside services the app calls.
/** Hosts whose credit is under another address. */
const ALIAS = {
  'upload.wikimedia.org': 'wikimedia-commons', 'api.wikimedia.org': 'wikipedia', 'tiles.maps.eox.at': 'sentinel-2-cloudless',
  's3.amazonaws.com': 'terrain-tiles', 'gibs.earthdata.nasa.gov': 'nasa-gibs',
};
const itemHosts = items.map((it) => { try { return new URL(it.url).hostname.replace(/^www\./, ''); } catch { return ''; } });
const hosts = new Map();
for (const f of srcFiles) {
  for (const m of read(f).matchAll(/https:\/\/(?:\$\{[^}]*\}\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)([^\s'"`)]*)/gi)) {
    if (`https://${m[1]}${m[2]}`.startsWith(C.app.url)) continue;
    const h = m[1].toLowerCase();
    hosts.set(h, [...(hosts.get(h) ?? []), f]);
  }
}
/** Hosts that are not sources (v0.48.0): the app's own website (its privacy and help pages) and its donation page. */
const NOT_SOURCES = new Set(['divaor.github.io', 'ko-fi.com']);
const hostOk = (h) => NOT_SOURCES.has(h) || (ALIAS[h] && byId.has(ALIAS[h])) || itemHosts.some((i) => i && (h.replace(/^www\./, '') === i || h.endsWith(`.${i}`)));
const uncredited = [...hosts].filter(([h]) => !hostOk(h)).map(([h, f]) => `${h} (${[...new Set(f)].join(', ')})`);
check(hosts.size > 10 && !uncredited.length, `each of the ${hosts.size} outside hosts the app calls is credited`, uncredited);

// ---- Code libraries and fonts.
const code = items.filter((it) => it.group === 'code').map((it) => hay.get(it.id));
/** flag-icons' flags are copied into public/flags; vite-plugin-pwa ships Workbox in the service worker. */
const shipped = [...Object.keys(pkg.dependencies ?? {}), 'flag-icons', 'workbox-window'];
const libKey = (name) => norm(name.startsWith('@') ? name.slice(1).split('/')[0] : name.split('-')[0]);
const noLib = shipped.filter((p) => !code.some((h) => h.includes(libKey(p))));
check(!noLib.length, `each of the ${shipped.length} libraries the app ships is credited under code`, noLib);
const licErr = [];
for (const p of shipped) {
  const lic = JSON.parse(read(`node_modules/${p}/package.json`)).license;
  const it = items.find((i) => i.group === 'code' && hay.get(i.id).includes(libKey(p)));
  if (it && !norm(it.licence).includes(norm(lic === 'BSD-3-Clause' ? 'BSD 3-Clause' : lic))) licErr.push(`${p}: ${lic}, credited as ${it.licence}`);
}
check(!licErr.length, 'their licences match their package.json', licErr);
const fonts = fs.readdirSync(path.join(ROOT, 'public/data/fonts')).filter((f) => f.endsWith('.woff2'));
const families = [...new Set(fonts.map((f) => f.match(/^[A-Z][a-z]+/)?.[0] ?? f))];
const noFont = families.filter((fam) => !code.some((h) => h.includes(norm(fam))));
check(fonts.length > 0 && !noFont.length, `the ${fonts.length} fonts (${families.join(', ')}) are credited under code`, noFont);

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log(`\ncredits: all good (${items.length} items in ${groups.length} groups)`);
