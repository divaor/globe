#!/usr/bin/env node
// One voice (v0.41.0), run once: every bilingual text in src/ becomes L('English', 'Spanish', ...args), with {0}, {1}…
// where a text has numbers or names in it, so that a translator can reorder them. It
//   - turns L(`a ${x} b`, `c ${x} d`) into L('a {0} b', 'c {0} d', x) (the Spanish may use the values in another order);
//   - turns `es ? 'Spanish' : 'English'` (and lang() === 'es', app.lang === 'es'…) into L('English', 'Spanish');
//   - replaces the 33 copies of the helper with the one in src/app/i18n.ts.
// What it cannot turn (the Spanish computes something the English does not) is listed for a hand to do.
//   node scripts/i18n/codemod.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

const DRY = process.argv.includes('--dry');
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (p.endsWith('.ts') && !p.endsWith('.d.ts')) files.push(p); } })('src');

/** A JS string in single quotes. */
export const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t').replace(/[\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`)}'`;
const ES_TEST = /^(!?)\(?(es|es\(\)|lang\(\) === 'es'|app\.lang === 'es'|this\.app\.lang === 'es'|LC\.lang\(\) === 'es')\)?$/;
/** A file where a variable `es` is not the app's language (a parameter, another language): its `es ? … : …` are left to a hand. */
const OTHER_ES = /\bes: boolean|\(es\)\s*=>|const es = (?!(app\.lang|this\.app\.lang|lang\(\)|this\.lang) === 'es'|\(\) =>)/;

const manual = [];
let changed = 0, files_ = 0;
for (const f of files) {
  if (f.endsWith('app/i18n.ts')) continue;
  let src = fs.readFileSync(f, 'utf8');
  let ast;
  try { ast = parse(src, { sourceType: 'module', plugins: ['typescript'] }); } catch (e) { console.error('parse', f, e.message); continue; }
  const text = (n) => src.slice(n.start, n.end);
  const otherEs = OTHER_ES.test(src);
  const edits = [];
  /** A template's or string's pattern: its text with {i} for each value, the values added to args. */
  const pattern = (node, args, other) => {
    if (node.type === 'StringLiteral') return node.value;
    if (node.type !== 'TemplateLiteral') return null;
    let out = '';
    for (let i = 0; i < node.quasis.length; i++) {
      const s = node.quasis[i].value.cooked;
      if (s == null || /\{\d/.test(s)) return null;
      out += s;
      if (i < node.expressions.length) {
        const t = text(node.expressions[i]);
        let k = args.indexOf(t);
        if (k < 0) { if (other) return null; args.push(t); k = args.length - 1; }
        out += `{${k}}`;
      }
    }
    return out;
  };
  const pair = (enNode, esNode, n, kind) => {
    const args = [];
    const en = pattern(enNode, args, false);
    const es = en == null ? null : pattern(esNode, args, true);
    if (en == null || es == null) { manual.push(`${f}:${n.loc.start.line} [${kind}] ${text(n).slice(0, 160)}`); return; }
    if (!args.length && enNode.type === 'StringLiteral' && esNode.type === 'StringLiteral' && kind === 'L') return; // already plain
    edits.push([n.start, n.end, `L(${[q(en), q(es), ...args].join(', ')})`]);
  };
  (function visit(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'L' && n.arguments.length === 2) {
      pair(n.arguments[0], n.arguments[1], n, 'L');
      return; // a pattern's values are kept as written
    }
    if (n.type === 'ConditionalExpression' && ES_TEST.test(text(n.test)) && !(otherEs && /^!?\(?es\)?$/.test(text(n.test))) && ['StringLiteral', 'TemplateLiteral'].includes(n.consequent.type) && ['StringLiteral', 'TemplateLiteral'].includes(n.alternate.type)) {
      const neg = text(n.test).startsWith('!');
      pair(neg ? n.consequent : n.alternate, neg ? n.alternate : n.consequent, n, '?:');
      return;
    }
    for (const k of Object.keys(n)) if (!['loc', 'start', 'end', 'leadingComments', 'trailingComments'].includes(k)) visit(n[k]);
  })(ast.program);
  // The helper's copies: the shared one instead.
  const rel = path.relative(path.dirname(f), 'src/app/i18n').replace(/\\/g, '/');
  const imp = rel.startsWith('.') ? rel : `./${rel}`;
  let helper = false, exported = false;
  for (const m of src.matchAll(/^(export )?const L = \(en: string, (?:es|sp): string\) => \((?:lang\(\) === 'es' \? es : en|es\(\) \? sp : en)\);\n/gm)) {
    helper = true; exported = !!m[1];
    edits.push([m.index, m.index + m[0].length, exported ? 'export { L };\n' : '']);
  }
  if (!edits.length) continue;
  edits.sort((a, b) => b[0] - a[0]);
  for (const [s, e, r] of edits) src = src.slice(0, s) + r + src.slice(e);
  // L imported from i18n where the file now uses the shared one (or used it through a ternary).
  const needs = /\bL\(/.test(src) && !/import \{[^}]*\bL\b[^}]*\} from '[^']*'/.test(src);
  if (needs || helper) {
    const re = new RegExp(`import \\{([^}]*)\\} from '${imp.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}';`);
    if (re.test(src)) src = src.replace(re, (all, names) => /\bL\b/.test(names) ? all : `import {${names.replace(/\s*$/, '')}, L } from '${imp}';`);
    else {
      const last = [...src.matchAll(/^import [^;]+;\n/gm)].pop();
      const at = last ? last.index + last[0].length : 0;
      src = src.slice(0, at) + `import { L } from '${imp}';\n` + src.slice(at);
    }
  }
  changed += edits.length; files_++;
  if (!DRY) fs.writeFileSync(f, src);
}
console.log(`${changed} texts and helpers changed in ${files_} files; ${manual.length} for a hand`);
fs.writeFileSync('/tmp/i18n-manual.txt', manual.join('\n'));
