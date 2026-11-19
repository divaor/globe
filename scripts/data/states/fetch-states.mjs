// States and provinces (v0.38.0): what Wikidata (CC0) says about the first-level divisions of the twelve countries
// with capitals (their capital, area and population), kept in .cache/states. Through QLever, as the other data
// scripts (scripts/data/lives/wdqs.mjs). Matched by ISO 3166-2 code (P300).
//   node scripts/data/states/fetch-states.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask } from '../lives/wdqs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const CACHE = path.join(ROOT, '.cache/states');

const values = (codes) => codes.map((c) => `"${c}"`).join(' ');

/** Each division by its code: the item, its names, and its capital now (GeoNames id, point, names). */
export async function divisions(codes) {
  return ask(CACHE, 'divisions', `
SELECT ?code ?s ?en ?es ?cap ?capGn ?capCoord ?capEn ?capEs WHERE {
  VALUES ?code { ${values(codes)} }
  ?s wdt:P300 ?code .
  FILTER NOT EXISTS { ?s wdt:P576 ?gone }
  OPTIONAL { ?s rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?s rdfs:label ?es FILTER(LANG(?es) = "es") }
  OPTIONAL { ?s p:P36 ?st . ?st ps:P36 ?cap . FILTER NOT EXISTS { ?st pq:P582 ?end }
    OPTIONAL { ?cap wdt:P1566 ?capGn } OPTIONAL { ?cap wdt:P625 ?capCoord }
    OPTIONAL { ?cap rdfs:label ?capEn FILTER(LANG(?capEn) = "en") } OPTIONAL { ?cap rdfs:label ?capEs FILTER(LANG(?capEs) = "es") } }
}`);
}

/** Their populations, each with its date and rank. */
export async function populations(codes) {
  return ask(CACHE, 'populations', `
SELECT ?code ?pop ?date ?rank WHERE {
  VALUES ?code { ${values(codes)} }
  ?s wdt:P300 ?code .
  FILTER NOT EXISTS { ?s wdt:P576 ?gone }
  ?s p:P1082 ?st . ?st ps:P1082 ?pop ; wikibase:rank ?rank .
  OPTIONAL { ?st pq:P585 ?date }
}`);
}

/** Their areas, each with its unit and rank. */
export async function areas(codes) {
  return ask(CACHE, 'areas', `
SELECT ?code ?amount ?unit ?rank WHERE {
  VALUES ?code { ${values(codes)} }
  ?s wdt:P300 ?code .
  FILTER NOT EXISTS { ?s wdt:P576 ?gone }
  ?s p:P2046 ?st . ?st psv:P2046 ?v ; wikibase:rank ?rank . ?v wikibase:quantityAmount ?amount ; wikibase:quantityUnit ?unit .
}`);
}

/** The English and Spanish names of places by their GeoNames id, and their people (each count with its date). */
export async function namesByGeonames(ids, tag) {
  return ask(CACHE, tag, `
SELECT ?gn ?item ?en ?es ?pop ?date WHERE {
  VALUES ?gn { ${values(ids)} }
  ?item wdt:P1566 ?gn .
  OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?item rdfs:label ?es FILTER(LANG(?es) = "es") }
  OPTIONAL { ?item p:P1082 ?ps . ?ps ps:P1082 ?pop ; wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank) OPTIONAL { ?ps pq:P585 ?date } }
}`);
}

/** v0.38.1: the people of the place an item lies in (P131), with that place's English name: a GeoNames town can be
 *  its own item with no count, while its municipality, of the same name, has it (Londrina, Joinville). */
export async function upPeople(items, tag) {
  return ask(CACHE, tag, `
SELECT ?item ?up ?upEn ?pop ?date WHERE {
  VALUES ?item { ${items.map((q) => `wd:${q}`).join(' ')} }
  ?item wdt:P131 ?up .
  ?up rdfs:label ?upEn FILTER(LANG(?upEn) = "en")
  ?up p:P1082 ?ps . ?ps ps:P1082 ?pop ; wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank) OPTIONAL { ?ps pq:P585 ?date }
}`);
}

/** v0.38.1: places by name (each name in English and the country's languages), with a point and people, for the
 *  GeoNames towns no item points to; the build keeps the one within 10 km. */
export async function peopleByName(names, tag) {
  return ask(CACHE, tag, `
SELECT ?name ?item ?coord ?pop ?date WHERE {
  VALUES ?name { ${names.map(([n, lang]) => `${JSON.stringify(n)}@${lang}`).join(' ')} }
  ?item rdfs:label ?name ; wdt:P625 ?coord .
  ?item p:P1082 ?ps . ?ps ps:P1082 ?pop ; wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank) OPTIONAL { ?ps pq:P585 ?date }
}`);
}
