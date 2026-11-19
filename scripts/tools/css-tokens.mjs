#!/usr/bin/env node
// The design kit (v0.40.0): puts every text size and corner radius of src/styles/main.css on the kit's tokens.
//   node scripts/tools/css-tokens.mjs          rewrites the file
//   node scripts/tools/css-tokens.mjs --check  fails if a px font size or a single px radius is left
// Text: 6 sizes in rem (they follow the phone's text size). Icons and emoji have their own 4 sizes. Radii: 4 steps
// and the pill. Sizes inside @keyframes and comments are left alone.
import fs from 'node:fs';

const FILE = new URL('../../src/styles/main.css', import.meta.url);
const ICON = /(icon|emoji|flag|stars|-sym\b|thumb)/;

export function textToken(px) {
  if (px <= 11.5) return 'var(--fs-xs)';
  if (px <= 13) return 'var(--fs-sm)';
  if (px <= 14.5) return 'var(--fs-md)';
  if (px <= 17) return 'var(--fs-lg)';
  if (px <= 21) return 'var(--fs-xl)';
  return 'var(--fs-2xl)';
}
export function iconToken(px) {
  if (px <= 19) return 'var(--icon-sm)';
  if (px <= 24) return 'var(--icon-md)';
  if (px <= 30) return 'var(--icon-lg)';
  return 'var(--icon-xl)';
}
export function radiusToken(px) {
  if (px <= 5) return 'var(--r-xs)';
  if (px <= 9) return 'var(--r-sm)';
  if (px <= 16) return 'var(--r-md)';
  if (px < 100) return 'var(--r-lg)';
  return 'var(--r-pill)';
}

/** Rewrites one stylesheet's text: each rule's selector decides text or icon sizes. */
export function tokenize(css) {
  let out = '', i = 0, changed = 0;
  // Walk rule by rule: selector { declarations }.
  const re = /([^{}]*)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    out += css.slice(i, m.index);
    const [whole, sel, body] = m;
    if (/:root/.test(sel) || /^\s*(from|to|\d+%)/.test(sel.trim())) { out += whole; i = m.index + whole.length; continue; }
    const icon = ICON.test(sel);
    const b2 = body
      .replace(/font-size:\s*(\d+(?:\.\d+)?)px/g, (_, n) => { changed++; return `font-size: ${icon && +n >= 18 ? iconToken(+n) : textToken(+n)}`; })
      .replace(/border-radius:\s*(\d+(?:\.\d+)?)px(\s*[;}]|\s*$|\s*!important)/g, (_, n, end) => { changed++; return `border-radius: ${radiusToken(+n)}${end}`; });
    out += sel + '{' + b2 + '}';
    i = m.index + whole.length;
  }
  out += css.slice(i);
  return { css: out, changed };
}

function leftovers(css) {
  const bad = [];
  const re = /([^{}]*)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    if (/:root/.test(m[1]) || /^\s*(from|to|\d+%)/.test(m[1].trim())) continue;
    for (const d of m[2].matchAll(/(font-size:\s*\d+(?:\.\d+)?px|border-radius:\s*\d+(?:\.\d+)?px\s*(?:;|$))/g)) bad.push(`${m[1].trim().slice(-60)} { ${d[1]} }`);
  }
  return bad;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const css = fs.readFileSync(FILE, 'utf8');
  if (process.argv.includes('--check')) {
    const bad = leftovers(css);
    if (bad.length) { console.error(`${bad.length} sizes off the kit:\n${bad.slice(0, 20).join('\n')}`); process.exit(1); }
    console.log('every text size and radius is on the kit');
  } else {
    const r = tokenize(css);
    fs.writeFileSync(FILE, r.css);
    console.log(`${r.changed} sizes and radii put on the kit`);
  }
}
