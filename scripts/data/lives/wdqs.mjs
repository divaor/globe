// Questions to Wikidata (CC0), in SPARQL. They go to QLever, the University of Freiburg's public copy of Wikidata
// (https://qlever.dev/wikidata, refreshed from Wikidata's own dumps): Wikidata's query service limits the shared
// address of this build machine to a request a minute, for everyone on it. Each answer is kept in a cache folder,
// and questions are spaced a few seconds apart across every script that uses this file.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const STAMP = path.join(ROOT, '.cache/sparql-last');
const UA = 'AtlasGlobe-research/1.0 (https://example.org)';
const ENDPOINT = 'https://qlever.dev/api/wikidata';
const GAP = 4_000;
const PREFIXES = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX ps: <http://www.wikidata.org/prop/statement/>
PREFIX psv: <http://www.wikidata.org/prop/statement/value/>
PREFIX pq: <http://www.wikidata.org/prop/qualifier/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX schema: <http://schema.org/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function turn() {
  for (;;) {
    const last = fs.existsSync(STAMP) ? Number(fs.readFileSync(STAMP, 'utf8')) || 0 : 0;
    const wait = last + GAP - Date.now();
    if (wait <= 0) break;
    await sleep(Math.min(wait, 5_000));
  }
  fs.mkdirSync(path.dirname(STAMP), { recursive: true });
  fs.writeFileSync(STAMP, String(Date.now()));
}

/**
 * The rows of a SPARQL question, from `dir/<name>.json` when it was asked before. `optional`: a question that
 * fails returns null instead of stopping the script.
 */
export async function ask(dir, name, query, { optional = false, tries = 3 } = {}) {
  const file = path.join(dir, `${name}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')).results.bindings;
  fs.mkdirSync(dir, { recursive: true });
  const qf = path.join(dir, `${name}.rq`);
  fs.writeFileSync(qf, PREFIXES + query);
  let why = '';
  for (let attempt = 1; attempt <= tries; attempt++) {
    await turn();
    let out = '';
    try {
      out = execFileSync('curl', ['-sS', '--max-time', '90', '-A', UA, '-H', 'Accept: application/sparql-results+json', '--data-urlencode', `query@${qf}`, ENDPOINT], { maxBuffer: 1024 * 1024 * 1024 }).toString();
    } catch (e) { out = String(e.message).slice(0, 300); }
    try {
      const j = JSON.parse(out);
      if (!j.results?.bindings) throw new Error(j.exception ?? 'no results');
      fs.writeFileSync(file, out);
      console.log(`${name}: ${j.results.bindings.length} rows`);
      return j.results.bindings;
    } catch (e) {
      why = (/"exception":\s*"([^"]{0,300})/.exec(out)?.[1] ?? e.message ?? out.slice(0, 200)).replace(/\s+/g, ' ');
      console.warn(`${name}: no answer (${why})${attempt < tries ? '; trying again' : ''}`);
      if (attempt < tries) await sleep(20_000 * attempt);
    }
  }
  if (optional) return null;
  throw new Error(`no answer to "${name}": ${why}`);
}

/**
 * The same question for many items: `body` is asked with `VALUES ?<name of the variable> { wd:Q1 wd:Q2 ... }` in
 * front, a few hundred items at a time, and the rows are put together. The mirror answers simple patterns on a
 * given list of items at once; long chains of OPTIONALs over all of Wikidata time out.
 */
export async function askFor(dir, name, variable, ids, select, body, size = 250) {
  const rows = [];
  // Wikidata ids, or full addresses in angle brackets (a statement); an unknown value (a blank node) is left out.
  const list = [...new Set(ids)].filter((q) => typeof q === 'string' && (/^Q\d+$/.test(q) || /^<[^<>\s"]+>$/.test(q)));
  for (let i = 0; i < list.length; i += size) {
    const values = list.slice(i, i + size).map((q) => (/^Q\d+$/.test(q) ? `wd:${q}` : q)).join(' ');
    rows.push(...await ask(dir, `${name}-${String(i / size).padStart(2, '0')}`, `SELECT ${select} WHERE { VALUES ?${variable} { ${values} } ${body} }`));
  }
  return rows;
}

export const val = (b, k) => b[k]?.value;
export const qidOf = (u) => (u && /\/entity\/Q\d+$/.test(u) ? u.split('/').pop() : null);
export const point = (wkt, digits = 4) => {
  const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/i.exec(wkt ?? '');
  if (!m) return null;
  const k = 10 ** digits;
  return [Math.round(Number(m[1]) * k) / k, Math.round(Number(m[2]) * k) / k];
};
/** The historical year of a Wikidata time ("-0286-01-01T00:00:00Z" is 287 BC: -287; there is no year 0). */
export const yearOf = (time) => {
  const m = /^(-?)(\d+)-/.exec(time ?? '');
  if (!m) return null;
  return m[1] ? -(Number(m[2]) + 1) : Number(m[2]);
};
