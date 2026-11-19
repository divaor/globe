#!/usr/bin/env node
// Counts the app's bilingual texts by shape (v0.41.0): L('en', 'es') calls, `es ? 'es' : 'en'` choices and
// { en, es } objects, to plan their move into per-language files.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

const files = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p); } })('src');

const strip = (n) => { const c = { ...n }; delete c.start; delete c.end; delete c.loc; delete c.extra; delete c.range; return c; };
// Same shape, string literals aside.
function sameShape(a, b) {
  if (!a || !b || typeof a !== 'object') return a === b;
  if (a.type !== b.type) return false;
  if (a.type === 'StringLiteral' || a.type === 'TemplateElement') return true;
  for (const k of Object.keys(a)) {
    if (['start', 'end', 'loc', 'extra', 'range', 'leadingComments', 'trailingComments', 'innerComments'].includes(k)) continue;
    const x = a[k], y = b[k];
    if (Array.isArray(x)) { if (!Array.isArray(y) || x.length !== y.length || !x.every((v, i) => sameShape(v, y[i]))) return false; }
    else if (x && typeof x === 'object') { if (!sameShape(x, y)) return false; }
    else if (x !== y && k !== 'value' && k !== 'raw' && k !== 'cooked') return false;
  }
  return true;
}
const counts = { lit: 0, tplSame: 0, tplShape: 0, other: 0, ternary: 0, objects: 0 };
const others = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let ast;
  try { ast = parse(src, { sourceType: 'module', plugins: ['typescript'] }); } catch (e) { console.error('parse', f, e.message); continue; }
  const text = (n) => src.slice(n.start, n.end);
  (function visit(n, parent) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach((x) => visit(x, parent)); return; }
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'L' && n.arguments.length === 2) {
      const [a, b] = n.arguments;
      if (a.type === 'StringLiteral' && b.type === 'StringLiteral') counts.lit++;
      else if (a.type === 'TemplateLiteral' && b.type === 'TemplateLiteral' && a.expressions.length === b.expressions.length && a.expressions.every((e, i) => text(e) === text(b.expressions[i]))) counts.tplSame++;
      else if (a.type === 'TemplateLiteral' && b.type === 'TemplateLiteral' && a.expressions.length === b.expressions.length && a.expressions.every((e, i) => sameShape(e, b.expressions[i]))) counts.tplShape++;
      else { counts.other++; others.push(`${f}:${n.loc.start.line} ${text(n).slice(0, 140)}`); }
    }
    if (n.type === 'ConditionalExpression' && /^(es|es\(\)|app\.lang === 'es'|this\.app\.lang === 'es'|lang\(\) === 'es'|es2)$/.test(text(n.test)) && (n.consequent.type === 'StringLiteral' || n.consequent.type === 'TemplateLiteral')) counts.ternary++;
    if (n.type === 'ObjectExpression' && n.properties.some((p) => p.key?.name === 'en') && n.properties.some((p) => p.key?.name === 'es')) counts.objects++;
    for (const k of Object.keys(n)) if (!['loc', 'start', 'end'].includes(k)) visit(n[k], n);
  })(ast.program);
}
console.log(counts);
fs.writeFileSync(process.argv[2] ?? '/dev/null', others.join('\n'));
