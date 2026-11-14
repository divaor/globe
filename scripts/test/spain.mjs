// Checks Spain's Spanish (src/app/spain.ts, v0.23.0): its samples, and every Spanish text in the app (the data's
// "es" fields and the Spanish in src/) for words left without agreement ("la ordenador", "los judías"). With
// --list, prints each change with its context, for review.
// Usage: node scripts/test/spain.mjs [--list [word]]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { rolldown } = await import('rolldown');
const bundle = await rolldown({ input: path.join(ROOT, 'src/app/spain.ts'), platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
const S = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };

for (const [from, to] of S.SPAIN_SAMPLES) {
  const got = S.toSpain(from);
  check(got === to, `"${from}" → "${got}"${got === to ? '' : ` (expected "${to}")`}`);
}

// Every Spanish text in the app.
const texts = new Set();
const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if ((k === 'es' || k.endsWith('_es')) && typeof v === 'string') texts.add(v); else walk(v); } };
const files = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(d, e.name)) : [path.join(d, e.name)]));
for (const f of files(path.join(ROOT, 'public/data')).filter((f) => f.endsWith('.json') && !/countries-|admin1|land-|world_|paleo|raster|-areas|regions[\\/]/.test(f))) {
  try { walk(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch { /* not JSON */ }
}
for (const f of files(path.join(ROOT, 'src')).filter((f) => f.endsWith('.ts') && !f.endsWith('spain.ts'))) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/es: '((?:[^'\\]|\\.)*)'/g)) texts.add(m[1]);
  for (const m of s.matchAll(/L\(\s*(?:'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)\s*,\s*(?:'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`)\s*\)/g)) texts.add(m[1] ?? m[2]);
  for (const m of s.matchAll(/\[\s*'(?:[^'\\]|\\.)*'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\]/g)) texts.add(m[1]);
}
let changed = 0;
const bad = [];
const BAD = [
  /\b(la|una|esta|esa|las|unas|estas|esas|primera|primeras|nueva|nuevas)\s+(ordenador(es)?|superordenador(es)?|guisantes?|aparcamiento|vídeos?|móvil(es)?|cacahuetes?|melocotón|boniato|penaltis?)\b/i,
  /\b(el|un|los|unos|este|ese|estos|esos|primer|primeros|nuevo|nuevos)\s+(judías?|gafas|patatas?|informática|prórroga)\b/i,
  /\b(ordenador(es)?)\s+(electrónica|mecánica|analógica|moderna|doméstica|universitaria|compartida|unida|cuántica)s?\b/i,
  /\b(judías?)\s+(blancos|negros|guisados|rojos|portugueses|mágicos)\b/i,
];
const list = process.argv.includes('--list');
const only = list ? process.argv[process.argv.indexOf('--list') + 1] : undefined;
const shown = new Set();
for (const t of texts) {
  const s = S.toSpain(t);
  if (s === t) continue;
  changed++;
  for (const re of BAD) { const m = s.match(re); if (m) bad.push(`${m[0]}  ←  …${s.slice(Math.max(0, m.index - 40), m.index + 60)}…`); }
  if (list) {
    // The changed words, with some context.
    const a = t.split(/(\s+)/), b = s.split(/(\s+)/);
    let i = 0; while (i < a.length && a[i] === b[i]) i++;
    const ctx = `${a.slice(Math.max(0, i - 8), i + 10).join('')}  ⇒  ${b.slice(Math.max(0, i - 8), i + 12).join('')}`;
    if ((!only || ctx.includes(only)) && !shown.has(ctx)) { shown.add(ctx); console.log(`  ${ctx}`); }
  }
}
check(!bad.length, `${texts.size} Spanish texts, ${changed} with Spain's words; ${bad.length} without agreement${bad.length ? `:\n    ${[...new Set(bad)].slice(0, 30).join('\n    ')}` : ''}`);
console.log(fails ? `\n${fails} check(s) failed` : '\nSpain checks passed');
process.exit(fails ? 1 : 0);
