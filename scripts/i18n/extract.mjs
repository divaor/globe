#!/usr/bin/env node
// The app's texts (v0.41.0, One voice): every L('English', 'Spanish', ...values) in src/, every { en, es } object of
// plain texts and the STRINGS table of src/app/i18n.ts, written to i18n/messages.json for translators (the English,
// the Spanish as a second reference, where each is used). A new language is public/i18n/<lang>.json, an object of
// English text → translation, and is shipped by adding it to SHIPPED below.
//   node scripts/i18n/extract.mjs           writes i18n/messages.json
//   node scripts/i18n/extract.mjs --check   fails when:
//     - an L(...) is not two plain texts (a pattern with {0}, {1}… and its values after them);
//     - a pattern names a value it is not given, or is given a value it never uses, or its braces do not close;
//     - a text still picks its language by hand (`es ? 'Hola' : 'Hello'`);
//     - a shipped language misses a text, or its translation does not use the same values;
//     - i18n/messages.json is not up to date.
//   It also lists English texts with more than one Spanish (the glossary: one word for one thing).
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

const CHECK = process.argv.includes('--check');
const VERBOSE = process.argv.includes('--glossary');
/** Languages shipped beyond English and Spanish (their files are public/i18n/<lang>.json). */
const SHIPPED = [];

const files = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (p.endsWith('.ts') && !p.endsWith('.d.ts')) files.push(p); } })('src');
files.sort();

const ES_TEST = /^(!?)\(?(es|es\(\)|lang\(\) === 'es'|app\.lang === 'es'|this\.app\.lang === 'es'|APP\?\.lang === 'es'|LC\.lang\(\) === 'es')\)?$/;
const errors = [];
/** English → { es: Set, where: [] }. */
const msgs = new Map();
/** The key of a text: its English, or its context + U+0004 + its English (gettext's msgctxt). */
const SEP = '\u0004';
const add = (en, es, where, ctx = null) => {
  if (!en.trim()) return;
  const key = ctx ? `${ctx}${SEP}${en}` : en;
  let m = msgs.get(key);
  if (!m) msgs.set(key, (m = { es: new Map(), where: [] }));
  m.es.set(es, (m.es.get(es) ?? 0) + 1);
  if (m.where.length < 5) m.where.push(where);
};

/** The value numbers a pattern uses, or an error. */
function usage(p) {
  const used = new Set();
  let depth = 0;
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '{') {
      depth++;
      const m = /^\{(\d+)\s*(,\s*(plural|select)\s*,)?/.exec(p.slice(i));
      if (m) used.add(+m[1]);
      if (m?.[3] === 'plural' && !/other\s*\{/.test(p.slice(i))) return { error: 'a plural with no "other" case' };
    } else if (p[i] === '}') { if (--depth < 0) return { error: 'a } with no {' }; }
  }
  if (depth !== 0) return { error: 'a { that does not close' };
  return { used };
}
function checkPattern(en, es, n, where) {
  for (const [lang, p] of [['English', en], ['Spanish', es]]) {
    const u = usage(p);
    if (u.error) { errors.push(`${where}: the ${lang} has ${u.error}: ${p.slice(0, 90)}`); continue; }
    for (const k of u.used) if (k >= n) errors.push(`${where}: the ${lang} uses {${k}} but ${n} value${n === 1 ? ' is' : 's are'} given: ${p.slice(0, 90)}`);
  }
  if (n) {
    const a = usage(en).used ?? new Set(), b = usage(es).used ?? new Set();
    for (let k = 0; k < n; k++) if (!a.has(k) && !b.has(k)) errors.push(`${where}: value {${k}} is given but neither text uses it: ${en.slice(0, 90)}`);
  }
}

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let ast;
  try { ast = parse(src, { sourceType: 'module', plugins: ['typescript'] }); } catch (e) { errors.push(`${f}: does not parse (${e.message})`); continue; }
  const text = (n) => src.slice(n.start, n.end);
  const lines = src.split('\n');
  const isI18n = f.endsWith(path.join('app', 'i18n.ts'));
  const str = (n) => (n?.type === 'StringLiteral' ? n.value : n?.type === 'TemplateLiteral' && !n.expressions.length ? n.quasis[0].value.cooked : null);
  (function visit(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    const where = n.loc ? `${f}:${n.loc.start.line}` : f;
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && (n.callee.name === 'L' || n.callee.name === 'Lc') && n.arguments.length >= 2) {
      const c = n.callee.name === 'Lc' ? 1 : 0;
      const ctx = c ? str(n.arguments[0]) : null;
      const en = str(n.arguments[c]), es = str(n.arguments[c + 1]);
      if (en == null || es == null || (c && ctx == null)) errors.push(`${where}: ${n.callee.name}() needs plain texts, with {0}, {1}… for the values: ${text(n).slice(0, 110)}`);
      else { checkPattern(en, es, n.arguments.length - 2 - c, where); add(en, es, where, ctx); }
    }
    // A line marked "i18n: by hand" (or the line above it) writes a language's grammar in code on purpose.
    const byHand = n.loc && /i18n: by hand/.test(lines.slice(Math.max(0, n.loc.start.line - 2), n.loc.start.line).join('\n'));
    if (n.type === 'ConditionalExpression' && !byHand && ES_TEST.test(text(n.test)) && [n.consequent, n.alternate].every((x) => x.type === 'StringLiteral' || x.type === 'TemplateLiteral')) {
      errors.push(`${where}: a text that picks its language by hand (use L): ${text(n).slice(0, 110)}`);
    }
    if (n.type === 'ObjectExpression') {
      const p = (k) => n.properties.find((x) => x.type === 'ObjectProperty' && (x.key.name ?? x.key.value) === k);
      const en = str(p('en')?.value), es = str(p('es')?.value);
      if (en != null && es != null) add(en, es, where, str(p('ctx')?.value));
    }
    // The STRINGS table: key: ['English', 'Spanish'].
    if (isI18n && n.type === 'VariableDeclarator' && n.id.name === 'STRINGS') {
      for (const prop of n.init.properties) {
        const [a, b, c] = prop.value.elements ?? [];
        if (str(a) != null && str(b) != null) add(str(a), str(b), `${f}:${prop.loc.start.line}`, c ? str(c) : null);
      }
    }
    for (const k of Object.keys(n)) if (!['loc', 'start', 'end', 'leadingComments', 'trailingComments', 'innerComments'].includes(k)) visit(n[k]);
  })(ast.program);
}

const list = [...msgs.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([key, m]) => {
  const es = [...m.es.entries()].sort((a, b) => b[1] - a[1]);
  const [ctx, en] = key.includes(SEP) ? key.split(SEP) : [null, key];
  return { ...(ctx ? { ctx, key } : {}), en, es: es[0][0], ...(es.length > 1 ? { esAlso: es.slice(1).map((x) => x[0]) } : {}), where: m.where };
});
const json = `${JSON.stringify({ about: 'The app\'s texts, by their English (scripts/i18n/extract.mjs). A language file, public/i18n/<lang>.json, maps each "en" (or "key", for a text with a context: the same English with another meaning) to its translation; "es" is the Spanish, for reference.', count: list.length, messages: list }, null, 1)}\n`;

// The shipped languages: every text, with the same values.
for (const lang of SHIPPED) {
  const file = `public/i18n/${lang}.json`;
  const cat = JSON.parse(fs.readFileSync(file, 'utf8'));
  let missing = 0;
  for (const { en, key } of list) {
    const tr = cat[key ?? en];
    if (tr == null || tr === '') { missing++; if (missing <= 10) errors.push(`${file}: no translation for "${en.slice(0, 80)}"`); continue; }
    const a = usage(en).used ?? new Set(), b = usage(tr);
    if (b.error) errors.push(`${file}: "${en.slice(0, 60)}": the translation has ${b.error}`);
    else if ([...b.used].some((k) => !a.has(k)) && ![...b.used].every((k) => k < 10)) errors.push(`${file}: "${en.slice(0, 60)}": the translation uses a value the English does not`);
  }
  if (missing > 10) errors.push(`${file}: …and ${missing - 10} more texts with no translation`);
}

const glossary = list.filter((m) => m.esAlso);
if (CHECK) {
  const cur = fs.existsSync('i18n/messages.json') ? fs.readFileSync('i18n/messages.json', 'utf8') : '';
  if (cur !== json) errors.push('i18n/messages.json is not up to date: run node scripts/i18n/extract.mjs');
  // The glossary: one English, one Spanish (an English with two meanings takes a context: Lc, or ctx in { en, es }).
  for (const m of glossary) errors.push(`"${m.en}" has more than one Spanish (${[m.es, ...m.esAlso].join(' / ')}): use one, or Lc() with a context if they mean different things (${m.where.join(', ')})`);
  if (errors.length) { console.error(errors.join('\n')); console.error(`\n${errors.length} text problem${errors.length === 1 ? '' : 's'}`); process.exit(1); }
  console.log(`texts: ${list.length}, all patterns well formed${SHIPPED.length ? `, ${SHIPPED.join(', ')} complete` : ''}; ${glossary.length} English texts with more than one Spanish`);
} else {
  fs.mkdirSync('i18n', { recursive: true });
  fs.writeFileSync('i18n/messages.json', json);
  console.log(`i18n/messages.json: ${list.length} texts; ${glossary.length} English texts with more than one Spanish${errors.length ? `; ${errors.length} problems (--check lists them)` : ''}`);
}
if (VERBOSE) for (const m of glossary) console.log(`${m.ctx ? `[${m.ctx}] ` : ''}${m.en}\n   ${m.es}\n   ${m.esAlso.join('\n   ')}`);
