// Master the world (v0.34.0): the questions Wikidata (CC0) answers, kept in .cache/master. Through QLever, as the
// other data scripts (scripts/data/lives/wdqs.mjs).
//   node scripts/data/master/fetch-master.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask } from '../lives/wdqs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const CACHE = path.join(ROOT, '.cache/master');

/** The 193 members of the United Nations, Vatican City and Palestine: ISO codes, capitals, sitelinks. */
export async function countries() {
  return ask(CACHE, 'countries', `
SELECT ?c ?iso2 ?iso3 ?links ?cap ?capGn ?capLabel ?capEs ?capCoord WHERE {
  { ?c wdt:P463 wd:Q1065 . } UNION { VALUES ?c { wd:Q237 wd:Q219060 } }
  ?c wdt:P297 ?iso2 ; wdt:P298 ?iso3 ; wikibase:sitelinks ?links .
  OPTIONAL { ?c p:P36 ?st . ?st ps:P36 ?cap . FILTER NOT EXISTS { ?st pq:P582 ?end } 
    OPTIONAL { ?cap wdt:P1566 ?capGn } OPTIONAL { ?cap wdt:P625 ?capCoord }
    OPTIONAL { ?cap rdfs:label ?capLabel FILTER(LANG(?capLabel) = "en") } OPTIONAL { ?cap rdfs:label ?capEs FILTER(LANG(?capEs) = "es") } }
}`);
}

/** The English and Spanish names of places by their GeoNames id. */
export async function namesByGeonames(ids, tag) {
  const values = ids.map((g) => `"${g}"`).join(' ');
  return ask(CACHE, `names-${tag}`, `
SELECT ?gn ?item ?en ?es WHERE {
  VALUES ?gn { ${values} }
  ?item wdt:P1566 ?gn .
  OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?item rdfs:label ?es FILTER(LANG(?es) = "es") }
}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = await countries();
  const iso = new Set(rows.map((r) => r.iso3.value));
  console.log(`${rows.length} rows, ${iso.size} countries`);
}
