#!/usr/bin/env node
/**
 * Downloads the wikitext of the English Wikipedia articles behind "Games of the world" (games.mjs)
 * into .cache/games/wiki/, one JSON file per article: { title, requested, revid, timestamp, wikitext }.
 * Articles already downloaded are kept unless --refresh is given. Wikipedia limits how fast a client
 * may ask, so the articles are fetched 20 at a time with a pause, and the script waits and tries
 * again (up to about 30 minutes) when it is told to slow down.
 *
 *   node scripts/data/games/fetch-wiki.mjs                 fetch what is missing
 *   node scripts/data/games/fetch-wiki.mjs --refresh       fetch everything again
 *   node scripts/data/games/fetch-wiki.mjs "Title" ...     fetch these articles (and keep the rest)
 *   node scripts/data/games/fetch-wiki.mjs --coords "Title" ...      their coordinates → .cache/games/coords.json
 *   node scripts/data/games/fetch-wiki.mjs --langlinks "Title" ...   their Spanish titles → .cache/games/langlinks.json
 *
 * Behind an HTTPS proxy, run Node with NODE_USE_ENV_PROXY=1 so that fetch() uses it.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allTitles } from './games.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const CACHE = path.join(ROOT, '.cache/games/wiki');
const API = 'https://en.wikipedia.org/w/api.php';
const UA = 'AtlasGlobe/0.11 (https://github.com/divaor/globe; data build for an educational map)';
const BATCH = 20, PAUSE = 4000;

/** The cache file of an article. */
export const fileOf = (title) => path.join(CACHE, `${title.replace(/[/\\:*?"<>|]/g, '_')}.json`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CONTENT = { prop: 'revisions', rvprop: 'content|ids|timestamp', rvslots: 'main' };

/** One batch of titles (the article texts, or other `props`), retrying when Wikipedia asks to slow down. */
export async function fetchBatch(titles, props = CONTENT) {
  const body = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', redirects: '1', titles: titles.join('|'), maxlag: '5', ...props });
  for (let attempt = 0, wait = 30000; ; attempt++, wait = Math.min(wait * 2, 480000)) {
    let res, text;
    try {
      res = await fetch(API, { method: 'POST', body, headers: { 'User-Agent': UA, 'Api-User-Agent': UA } });
      text = await res.text();
      if (res.ok && text.startsWith('{')) {
        const d = JSON.parse(text);
        if (!d.error) return d.query;
        if (d.error.code !== 'maxlag') throw new Error(`${d.error.code}: ${d.error.info}`);
      }
    } catch (e) {
      if (attempt >= 6) throw e;
      console.warn(`  ${e.message}; waiting ${wait / 1000} s`);
      await sleep(wait);
      continue;
    }
    if (attempt >= 6) throw new Error(`gave up after ${attempt + 1} tries (HTTP ${res?.status})`);
    console.warn(`  HTTP ${res?.status}${text?.startsWith('You are making too many requests') ? ' (too many requests)' : ''}; waiting ${wait / 1000} s`);
    await sleep(wait);
  }
}

/** Follows a batch's normalisation and redirects back to the titles that were asked for. */
function askedOf(q, titles) {
  const back = new Map(titles.map((t) => [t, t]));
  for (const n of q.normalized ?? []) back.set(n.to, back.get(n.from) ?? n.from);
  for (const r of q.redirects ?? []) back.set(r.to, back.get(r.from) ?? r.from);
  return (title) => back.get(title) ?? title;
}

/** Coordinates or Spanish titles of articles, added to a JSON file of the cache. */
async function lookup(mode, titles) {
  const file = path.join(CACHE, '..', mode === 'coords' ? 'coords.json' : 'langlinks.json');
  const have = JSON.parse(await fs.readFile(file, 'utf8').catch(() => '{}'));
  const props = mode === 'coords' ? { prop: 'coordinates', colimit: 'max', coprimary: 'primary' } : { prop: 'langlinks', lllang: 'es', lllimit: 'max' };
  const want = titles.filter((t) => !(t in have));
  console.log(`${want.length} title(s) to look up`);
  for (let i = 0; i < want.length; i += 50) {
    const batch = want.slice(i, i + 50);
    const q = await fetchBatch(batch, props);
    const asked = askedOf(q, batch);
    for (const p of q.pages ?? []) {
      const t = asked(p.title);
      if (mode === 'coords') have[t] = p.coordinates?.[0] ? [p.coordinates[0].lon, p.coordinates[0].lat] : null;
      else have[t] = p.langlinks?.[0]?.title ?? null;
    }
    if (i + 50 < want.length) await sleep(PAUSE);
  }
  await fs.writeFile(file, `${JSON.stringify(have, null, 1)}\n`);
  const none = titles.filter((t) => have[t] == null);
  if (none.length) console.warn(`none found for: ${none.join('; ')}`);
}

async function main() {
  const args = process.argv.slice(2);
  for (const mode of ['coords', 'langlinks']) {
    if (args[0] === `--${mode}`) return lookup(mode, args.slice(1));
  }
  const refresh = args.includes('--refresh');
  const named = args.filter((a) => !a.startsWith('--'));
  await fs.mkdir(CACHE, { recursive: true });
  const want = [];
  for (const t of named.length ? named : allTitles()) {
    if (!refresh && !named.length) { try { await fs.access(fileOf(t)); continue; } catch { /* missing */ } }
    want.push(t);
  }
  console.log(`${want.length} article(s) to fetch`);
  const missing = [];
  for (let i = 0; i < want.length; i += BATCH) {
    const titles = want.slice(i, i + BATCH);
    const q = await fetchBatch(titles);
    const askedFor = askedOf(q, titles);
    for (const p of q.pages ?? []) {
      const asked = askedFor(p.title);
      if (p.missing || !p.revisions) { missing.push(asked); continue; }
      const rev = p.revisions[0];
      await fs.writeFile(fileOf(asked), JSON.stringify({ title: p.title, requested: asked, revid: rev.revid, timestamp: rev.timestamp, wikitext: rev.slots.main.content }));
    }
    console.log(`  ${Math.min(i + BATCH, want.length)}/${want.length}`);
    if (i + BATCH < want.length) await sleep(PAUSE);
  }
  if (missing.length) { console.error(`missing on Wikipedia: ${missing.join('; ')}`); process.exitCode = 1; }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
