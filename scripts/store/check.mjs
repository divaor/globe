#!/usr/bin/env node
// Store listings (v0.42.0): store/listings/<locale>.json for the App Store and Google Play, each field within both
// stores' limits (the shorter of the two where they share a field).
import fs from 'node:fs';
import path from 'node:path';
const DIR = 'store/listings';
const LIMIT = { name: 30, subtitle: 30, short: 80, promo: 170, keywords: 100, description: 4000, whatsNew: 500 };
let bad = 0;
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json')).sort()) {
  const l = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const out = [];
  for (const [k, max] of Object.entries(LIMIT)) {
    const n = [...(l[k] ?? '')].length;
    if (!n) { out.push(`${k} missing`); bad++; } else if (n > max) { out.push(`${k} ${n}/${max}`); bad++; }
  }
  if (/, /.test(l.keywords ?? '')) { out.push('keywords: no space after commas'); bad++; }
  console.log(`${f}: ${out.length ? out.join('; ') : 'ok'}`);
}
process.exit(bad ? 1 : 0);
