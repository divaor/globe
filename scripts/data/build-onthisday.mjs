#!/usr/bin/env node
/**
 * On this day, from the stories: every story step and item with a full date (day, month and year), by day of the
 * year, so the app can list what the Time travel stories tell of any date and open each at its step.
 *
 *   node scripts/data/build-onthisday.mjs [--check]
 *
 * Reads the built stories in public/data/<collection>/ and writes public/data/onthisday/01.json ... 12.json:
 *   { "stories": { "<collection>/<story id>": [icon, name en, name es] },
 *     "days": { "13": [["<collection>/<story id>", step (from 0), "1918-11-11", icon, title en, title es], ...] } }
 * An item is listed when its date is not already its step's (the step's own entry covers it).
 * With --check, fails if the files are out of date (run after building stories).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = path.join(ROOT, 'public/data');
const OUT = path.join(DATA, 'onthisday');
const check = process.argv.includes('--check');
const DIRS = { wars: 'conflicts', eras: 'eras', food: 'food', structures: 'structures', people: 'people', life: 'life', games: 'games', journeys: 'journeys', beliefs: 'beliefs', writing: 'writing', plagues: 'plagues', disasters: 'disasters', music: 'music', books: 'books', art: 'art', inventions: 'inventions', heritage: 'heritage', space: 'space' };
const FULL = /^(-?\d+)-(\d\d)-(\d\d)/;

const months = Array.from({ length: 12 }, () => ({ stories: {}, days: {} }));
let n = 0;
for (const [kind, dir] of Object.entries(DIRS)) {
  const idx = JSON.parse(fs.readFileSync(path.join(DATA, dir, 'index.json'), 'utf8'));
  for (const meta of idx.stories ?? idx.conflicts) {
    const file = path.join(DATA, dir, `${meta.id}.json`);
    if (!fs.existsSync(file)) continue;
    const st = JSON.parse(fs.readFileSync(file, 'utf8'));
    const key = `${kind}/${st.id}`;
    const add = (date, step, icon, title) => {
      const m = FULL.exec(date);
      if (!m) return;
      const mm = Number(m[2]), dd = String(Number(m[3]));
      if (mm < 1 || mm > 12) return;
      const month = months[mm - 1];
      month.stories[key] = [st.icon, st.name.en, st.name.es];
      (month.days[dd] ??= []).push([key, step, date.slice(0, m[0].length), icon, title.en, title.es]);
      n++;
    };
    st.steps.forEach((s, i) => add(s.date, i, st.icon, s.title));
    // Items: their first step, unless that step has the same day (then the step says it).
    for (const it of st.items ?? []) {
      const step = it.first ?? 0;
      const sd = FULL.exec(st.steps[step]?.date ?? '');
      const id = FULL.exec(it.date ?? '');
      if (!id || (sd && sd[0] === id[0])) continue;
      add(it.date, step, it.icon ?? st.icon, it.name);
    }
  }
}
// Oldest first within a day, then by collection and story (stable across runs).
const year = (d) => Number(FULL.exec(d)[1]);
for (const m of months) for (const d of Object.keys(m.days)) m.days[d].sort((a, b) => year(a[2]) - year(b[2]) || a[2].localeCompare(b[2]) || a[0].localeCompare(b[0]) || a[1] - b[1]);

let stale = 0;
if (!check) fs.mkdirSync(OUT, { recursive: true });
months.forEach((m, i) => {
  const f = path.join(OUT, `${String(i + 1).padStart(2, '0')}.json`);
  const text = JSON.stringify(m);
  if (check) { if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== text) { stale++; console.error(`${path.relative(ROOT, f)} is out of date`); } }
  else fs.writeFileSync(f, text);
});
const days = months.reduce((a, m) => a + Object.keys(m.days).length, 0);
if (check && stale) { console.error('run node scripts/data/build-onthisday.mjs'); process.exit(1); }
console.log(`${check ? 'checked' : 'wrote'} public/data/onthisday: ${n} dated steps and items on ${days} days of the year`);
