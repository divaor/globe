// Checks the art and architecture guide's data (v0.27.0, public/data/artguide): known museums hold their best-known
// works; our art items say where they are now; artists' and architects' trails; styles; Spanish names; and every
// museum and building that belongs to a guide city names one the guide knows.
// Usage: node scripts/test/artguide.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const C = read('artguide/collections.json'), A = read('artguide/architecture.json'), N = read('artguide/nowin.json').items;
const guide = new Set(read('guide/index.json').cities.map((c) => c[0]));
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
const es = (r) => r[2] || r[1];
const museum = (q) => C.museums.findIndex((m) => m[0] === q);
const worksOf = (q) => C.works.filter((w) => w[4] === museum(q));
const has = (q, work) => worksOf(q).some((w) => w[0] === work);

// Museums and their works.
check(has('Q19675', 'Q12418') && has('Q19675', 'Q151952') && has('Q160112', 'Q208758') && has('Q6373', 'Q48584') && has('Q190804', 'Q219831') && has('Q51252', 'Q151047'),
  'the Louvre holds the Mona Lisa and the Venus de Milo; the Prado, Las Meninas; the British Museum, the Rosetta Stone; the Rijksmuseum, The Night Watch; the Uffizi, The Birth of Venus');
const louvre = worksOf('Q19675');
check(louvre[0][0] === 'Q12418' && louvre.every((w, i) => i === 0 || w[8] <= louvre[i - 1][8]) && louvre.length >= 10, `the Louvre's ${louvre.length} works, the best known first: ${louvre.slice(0, 4).map((w) => w[1]).join(', ')}…`);
const kinds = {};
for (const w of C.works) kinds[w[3]] = (kinds[w[3]] ?? 0) + 1;
check(C.museums.length >= 150 && C.works.length >= 1800 && kinds.painting > 800 && kinds.sculpture > 100 && kinds.antiquity > 50, `${C.museums.length} museums, ${C.works.length} works (${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ')})`);
check(new Set(C.works.map((w) => w[0])).size === C.works.length && C.museums.every((m) => guide.has(m[5])), 'each work in one museum only; every museum in a city the travel guide knows');
const pics = C.works.filter((w) => w[7]).length;
check(pics / C.works.length > 0.85, `${pics} of ${C.works.length} works have a picture on Commons`);

// Artists.
const artist = (re) => C.artists.findIndex((a) => re.test(a[1]));
const trail = (i) => { const ws = C.works.filter((w) => w[5] === i); return { works: ws.length, museums: new Set(ws.map((w) => w[4])).size, cities: new Set(ws.map((w) => C.museums[w[4]][5])) }; };
const velaz = trail(artist(/^Diego Velázquez$/)), vg = trail(artist(/^Vincent van Gogh$/)), durer = C.artists[artist(/Dürer/)];
check(velaz.cities.has('madrid') && velaz.works >= 5 && vg.cities.has('amsterdam') && vg.museums >= 10 && durer && durer[1] === 'Albrecht Dürer' && es(durer) === 'Alberto Durero',
  `trails: Velázquez, ${velaz.works} works (Madrid among ${velaz.cities.size} cities); Van Gogh, ${vg.works} works in ${vg.museums} museums; Dürer named in English and Spanish (from Wikidata's multilingual label)`);

// Now in: where our art items are today.
const now = (id) => N[id] ?? [];
check(now('mona-lisa')[0] === 'Q19675' && now('mona-lisa')[3] === 'paris' && now('las-meninas')[3] === 'madrid' && now('guernica')[1].includes('Reina Sofía') && now('the-night-watch')[3] === 'amsterdam' && Object.keys(N).length >= 70,
  `Now in for ${Object.keys(N).length} art items: the Mona Lisa in the ${now('mona-lisa')[1]}, Guernica in the ${now('guernica')[1]}`);

// Architecture.
const arch = (re) => A.architects.findIndex((a) => re.test(a[1]));
const gaudi = A.buildings.filter((b) => b[6].includes(arch(/^Antoni Gaudí$/)));
const sagrada = A.buildings.find((b) => b[0] === 'Q48435');
const styles = {};
for (const b of A.buildings) if (b[7]) styles[b[7]] = (styles[b[7]] ?? 0) + 1;
check(gaudi.length >= 8 && gaudi.filter((b) => b[5] === 'barcelona').length >= 6 && sagrada?.[7] === 'nouveau', `Gaudí: ${gaudi.length} buildings, ${gaudi.filter((b) => b[5] === 'barcelona').length} in Barcelona; the Sagrada Família is Art Nouveau (Catalan modernism)`);
check(A.styles.length === 15 && Object.keys(styles).length >= 14 && A.buildings.filter((b) => b[7]).length > 2000 && A.buildings.every((b) => !b[5] || guide.has(b[5])), `${A.buildings.length} buildings, ${A.buildings.filter((b) => b[7]).length} with a style (${Object.entries(styles).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} ${n}`).join(', ')}…)`);

// Spanish.
const monaEs = es(C.works.find((w) => w[0] === 'Q12418')), louvreEs = es(C.museums[museum('Q19675')]);
const ownEs = C.works.filter((w) => w[2]).length;
check(/Gioconda/.test(monaEs) && /Louvre/.test(louvreEs) && ownEs > C.works.length * 0.4, `Spanish names: "${monaEs}", "${louvreEs}"; ${ownEs} works have a Spanish name of their own, the rest show their English (or multilingual) name`);

console.log(fails ? `\n${fails} check(s) failed` : '\nart guide checks passed');
process.exit(fails ? 1 : 0);
