#!/usr/bin/env node
/**
 * Fonts for the scripts the stories show: the `sample` text of an item (a script's first letters, a word
 * in a language, an inscription) and markers whose icon is a letter.
 *
 * Phones lack fonts for many of these scripts (cuneiform, hieroglyphs, Phoenician, N'Ko, Cherokee...), and
 * the test browser lacks even common ones. This script collects every character the stories show in a
 * sample or a marker (and the Writing systems filter's legend), finds the Noto font of its script, keeps
 * only those characters, and writes them as small woff2 files to public/data/fonts/, with fonts.json.
 * The app registers each file as part of one family, "Atlas Scripts", with its unicode-range, so the
 * browser fetches a file only when one of its characters is on screen (src/app/scriptFonts.ts).
 *
 *   node scripts/data/build-fonts.mjs           build (downloads the Noto fonts into .cache/fonts)
 *   node scripts/data/build-fonts.mjs --check   fail when a character has no font (then run the build)
 *
 * Latin, Greek and Cyrillic letters, punctuation and emoji are left to the system's fonts.
 * The Noto fonts are under the SIL Open Font License 1.1 (public/data/fonts/OFL.txt).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';
import { Blob, Face } from 'harfbuzzjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'public/data/fonts');
const CACHE = path.join(ROOT, '.cache/fonts');
const CHECK = process.argv.includes('--check');

const NOTO = 'https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts';
const CJK = 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF';
/** Unicode blocks → the Noto font for them: [first, last, font]. CJK fonts come from noto-cjk. */
const BLOCKS = [
  [0x0530, 0x058f, 'NotoSansArmenian'], [0xfb13, 0xfb17, 'NotoSansArmenian'],
  [0x0590, 0x05ff, 'NotoSansHebrew'], [0xfb1d, 0xfb4f, 'NotoSansHebrew'],
  [0x0600, 0x06ff, 'NotoNaskhArabic'], [0x0750, 0x077f, 'NotoNaskhArabic'], [0x08a0, 0x08ff, 'NotoNaskhArabic'],
  [0xfb50, 0xfdff, 'NotoNaskhArabic'], [0xfe70, 0xfeff, 'NotoNaskhArabic'],
  [0x0700, 0x074f, 'NotoSansSyriac'], [0x0780, 0x07bf, 'NotoSansThaana'], [0x07c0, 0x07ff, 'NotoSansNKo'],
  [0x0800, 0x083f, 'NotoSansSamaritan'], [0x0840, 0x085f, 'NotoSansMandaic'],
  [0x0900, 0x097f, 'NotoSansDevanagari'], [0xa8e0, 0xa8ff, 'NotoSansDevanagari'],
  [0x0980, 0x09ff, 'NotoSansBengali'], [0x0a00, 0x0a7f, 'NotoSansGurmukhi'], [0x0a80, 0x0aff, 'NotoSansGujarati'],
  [0x0b00, 0x0b7f, 'NotoSansOriya'], [0x0b80, 0x0bff, 'NotoSansTamil'], [0x0c00, 0x0c7f, 'NotoSansTelugu'],
  [0x0c80, 0x0cff, 'NotoSansKannada'], [0x0d00, 0x0d7f, 'NotoSansMalayalam'], [0x0d80, 0x0dff, 'NotoSansSinhala'],
  [0x0e00, 0x0e7f, 'NotoSansThai'], [0x0e80, 0x0eff, 'NotoSansLao'], [0x0f00, 0x0fff, 'NotoSerifTibetan'],
  [0x1000, 0x109f, 'NotoSansMyanmar'],
  [0x10a0, 0x10ff, 'NotoSansGeorgian'], [0x1c90, 0x1cbf, 'NotoSansGeorgian'], [0x2d00, 0x2d2f, 'NotoSansGeorgian'],
  [0x1200, 0x139f, 'NotoSansEthiopic'], [0x2d80, 0x2ddf, 'NotoSansEthiopic'], [0xab00, 0xab2f, 'NotoSansEthiopic'],
  [0x13a0, 0x13ff, 'NotoSansCherokee'], [0xab70, 0xabbf, 'NotoSansCherokee'],
  [0x1400, 0x167f, 'NotoSansCanadianAboriginal'], [0x18b0, 0x18ff, 'NotoSansCanadianAboriginal'],
  [0x1680, 0x169f, 'NotoSansOgham'], [0x16a0, 0x16ff, 'NotoSansRunic'], [0x1700, 0x171f, 'NotoSansTagalog'],
  [0x1780, 0x17ff, 'NotoSansKhmer'], [0x19e0, 0x19ff, 'NotoSansKhmer'], [0x1800, 0x18af, 'NotoSansMongolian'],
  [0x1b00, 0x1b7f, 'NotoSansBalinese'], [0x1c50, 0x1c7f, 'NotoSansOlChiki'], [0xa980, 0xa9df, 'NotoSansJavanese'],
  [0x2800, 0x28ff, 'NotoSansSymbols2'],
  [0x2c00, 0x2c5f, 'NotoSansGlagolitic'], [0x1e000, 0x1e02f, 'NotoSansGlagolitic'],
  [0x2c80, 0x2cff, 'NotoSansCoptic'], [0x2d30, 0x2d7f, 'NotoSansTifinagh'],
  [0xa000, 0xa4cf, 'NotoSansYi'], [0xa500, 0xa63f, 'NotoSansVai'],
  [0xa6a0, 0xa6ff, 'NotoSansBamum'], [0x16800, 0x16a3f, 'NotoSansBamum'], [0xa840, 0xa87f, 'NotoSansPhagsPa'],
  [0x10000, 0x100ff, 'NotoSansLinearB'], [0x10300, 0x1032f, 'NotoSansOldItalic'], [0x10330, 0x1034f, 'NotoSansGothic'],
  [0x10380, 0x1039f, 'NotoSansUgaritic'], [0x103a0, 0x103df, 'NotoSansOldPersian'], [0x10480, 0x104af, 'NotoSansOsmanya'],
  [0x10600, 0x1077f, 'NotoSansLinearA'], [0x10800, 0x1083f, 'NotoSansCypriot'], [0x10840, 0x1085f, 'NotoSansImperialAramaic'],
  [0x10880, 0x108af, 'NotoSansNabataean'], [0x10900, 0x1091f, 'NotoSansPhoenician'],
  [0x10980, 0x109ff, 'NotoSansMeroitic'], [0x10a00, 0x10a5f, 'NotoSansKharoshthi'], [0x10a60, 0x10a7f, 'NotoSansOldSouthArabian'],
  [0x10b00, 0x10b3f, 'NotoSansAvestan'], [0x10b60, 0x10b7f, 'NotoSansInscriptionalPahlavi'],
  [0x10c00, 0x10c4f, 'NotoSansOldTurkic'], [0x10c80, 0x10cff, 'NotoSansOldHungarian'],
  [0x10f00, 0x10f2f, 'NotoSansOldSogdian'], [0x10f30, 0x10f6f, 'NotoSansSogdian'], [0x10f70, 0x10faf, 'NotoSansOldUyghur'],
  [0x11000, 0x1107f, 'NotoSansBrahmi'], [0x12000, 0x1254f, 'NotoSansCuneiform'],
  [0x13000, 0x1345f, 'NotoSansEgyptianHieroglyphs'], [0x14400, 0x1467f, 'NotoSansAnatolianHieroglyphs'],
  [0x16ad0, 0x16aff, 'NotoSansBassaVah'], [0x16b00, 0x16b8f, 'NotoSansPahawhHmong'],
  [0x17000, 0x18aff, 'NotoSerifTangut'], [0x1b170, 0x1b2ff, 'NotoSansNushu'],
  [0x1e800, 0x1e8df, 'NotoSansMendeKikakui'], [0x1e900, 0x1e95f, 'NotoSansAdlam'],
  // East Asia (noto-cjk): Hangul, kana, and the Chinese characters with their punctuation.
  [0x1100, 0x11ff, 'cjk:KR'], [0x3130, 0x318f, 'cjk:KR'], [0xa960, 0xa97f, 'cjk:KR'], [0xac00, 0xd7ff, 'cjk:KR'],
  [0x3040, 0x30ff, 'cjk:JP'], [0x31f0, 0x31ff, 'cjk:JP'], [0xff65, 0xff9f, 'cjk:JP'],
  [0x2e80, 0x2fdf, 'cjk:SC'], [0x3000, 0x303f, 'cjk:SC'], [0x3100, 0x312f, 'cjk:SC'], [0x3400, 0x4dbf, 'cjk:SC'],
  [0x4e00, 0x9fff, 'cjk:SC'], [0xf900, 0xfaff, 'cjk:SC'], [0xff00, 0xff64, 'cjk:SC'], [0x20000, 0x2fa1f, 'cjk:SC'],
];
/** What the system's fonts show well enough: Latin, IPA, Greek, Cyrillic, punctuation, symbols, emoji. */
const SYSTEM = [[0x0000, 0x052f], [0x1d00, 0x1dbf], [0x1e00, 0x1fff], [0x2000, 0x27ff], [0x2900, 0x2bff], [0x2c60, 0x2c7f],
  [0xa720, 0xa7ff], [0xfe00, 0xfe0f], [0xfe20, 0xfe2f], [0x1f000, 0x1faff], [0xe0000, 0xe007f]];
const inRanges = (cp, list) => list.some(([a, b]) => cp >= a && cp <= b);
const fontOf = (cp) => BLOCKS.find(([a, b]) => cp >= a && cp <= b)?.[2];
const fileName = (font) => `${font.startsWith('cjk:') ? `NotoSansCJK${font.slice(4)}` : font}.woff2`;
const displayName = (font) => (font.startsWith('cjk:') ? `Noto Sans CJK ${font.slice(4)}` : font.replace(/([a-z])([A-Z])/g, '$1 $2').replace('N Ko', "N'Ko"));

/** Every text the app shows in a script font, with where it comes from. */
function collect() {
  const texts = [];
  const walk = (v, where) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') {
      if (typeof v.sample?.text === 'string') texts.push([v.sample.text, `${where}.sample`]);
      if (typeof v.icon === 'string' && v.name) texts.push([v.icon, `${where}.icon`]);
      for (const [k, x] of Object.entries(v)) if (k !== 'sample') walk(x, `${where}.${k}`);
    }
  };
  for (const dir of fs.readdirSync(path.join(ROOT, 'scripts/data'))) {
    const d = path.join(ROOT, 'scripts/data', dir);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.json')).sort()) {
      try { walk(JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')), `${dir}/${f}`); } catch { /* not a story */ }
    }
  }
  // The Writing systems filter shows a letter of each script in its legend.
  try {
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/attributes/countries.json'), 'utf8'));
    for (const [k, v] of Object.entries(c.fields.script?.categories ?? {})) if (v.emoji) texts.push([v.emoji, `countries.json script.${k}`]);
  } catch { /* no attributes yet */ }
  return texts;
}

/** The characters each font must hold. Unknown scripts are reported. */
function needs(texts) {
  const by = new Map();
  const unknown = [];
  for (const [t, where] of texts) {
    for (const ch of t) {
      const cp = ch.codePointAt(0);
      if (inRanges(cp, SYSTEM)) continue;
      const font = fontOf(cp);
      if (!font) { unknown.push(`U+${cp.toString(16).toUpperCase()} (${ch}) in ${where}`); continue; }
      if (!by.has(font)) by.set(font, new Set());
      by.get(font).add(cp);
    }
  }
  return { by, unknown };
}

/** U+10900-10903,U+1090C: the code points as compact ranges. */
function ranges(cps) {
  const list = [...cps].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    let j = i;
    while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
    const hex = (n) => n.toString(16).toUpperCase();
    out.push(i === j ? `U+${hex(list[i])}` : `U+${hex(list[i])}-${hex(list[j])}`);
    i = j;
  }
  return out.join(',');
}

async function download(font) {
  fs.mkdirSync(CACHE, { recursive: true });
  const local = path.join(CACHE, font.replace(':', '-') + (font.startsWith('cjk:') ? '.otf' : '.ttf'));
  if (fs.existsSync(local)) return fs.readFileSync(local);
  const urls = font.startsWith('cjk:')
    ? [`${CJK}/${font.slice(4)}/NotoSans${font.slice(4)}-Regular.otf`]
    : ['hinted', 'unhinted', 'full'].map((v) => `${NOTO}/${font}/${v}/ttf/${font}-Regular.ttf`);
  for (const u of urls) {
    const r = await fetch(u);
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(local, buf);
      console.log(`  downloaded ${font} (${Math.round(buf.length / 1024)} KB)`);
      return buf;
    }
  }
  throw new Error(`no download for ${font} (${urls.join(' , ')})`);
}

async function main() {
  const { by, unknown } = needs(collect());
  if (unknown.length) {
    console.error(`No font for these characters (add their Unicode block to BLOCKS in build-fonts.mjs):\n  ${unknown.join('\n  ')}`);
    process.exit(1);
  }
  const manifestPath = path.join(OUT, 'fonts.json');
  const old = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { fonts: [] };
  if (CHECK) {
    // Each character must be in the range of a built font file.
    const have = new Map(old.fonts.map((f) => [f.file, f.range]));
    const missing = [];
    for (const [font, cps] of by) {
      const range = have.get(fileName(font));
      const covered = new Set();
      for (const part of (range ?? '').split(',').filter(Boolean)) {
        const [a, b] = part.slice(2).split('-').map((x) => parseInt(x, 16));
        for (let cp = a; cp <= (b ?? a); cp++) covered.add(cp);
      }
      const lack = [...cps].filter((cp) => !covered.has(cp));
      if (lack.length || !fs.existsSync(path.join(OUT, fileName(font)))) missing.push(`${font}: ${lack.map((cp) => String.fromCodePoint(cp)).join('') || 'file missing'}`);
    }
    if (missing.length) {
      console.error(`Script fonts are out of date; run node scripts/data/build-fonts.mjs\n  ${missing.join('\n  ')}`);
      process.exit(1);
    }
    console.log(`script fonts: ${by.size} fonts cover every sample`);
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  const fonts = [];
  let total = 0;
  for (const font of [...by.keys()].sort()) {
    const cps = by.get(font);
    const src = await download(font);
    // Keep only the characters the font really has: a wrong code point in a sample shows here.
    const has = new Set(new Face(new Blob(src)).collectUnicodes());
    const lack = [...cps].filter((cp) => !has.has(cp));
    if (lack.length) console.warn(`  warn ${font} has no glyph for ${lack.map((cp) => `U+${cp.toString(16).toUpperCase()} ${String.fromCodePoint(cp)}`).join(', ')}`);
    const keep = [...cps].filter((cp) => has.has(cp));
    if (!keep.length) continue;
    const text = keep.map((cp) => String.fromCodePoint(cp)).join('');
    const out = await subsetFont(src, text, { targetFormat: 'woff2' });
    fs.writeFileSync(path.join(OUT, fileName(font)), out);
    total += out.length;
    fonts.push({ file: fileName(font), name: displayName(font), range: ranges(keep) });
  }
  // Fonts no longer needed are removed.
  for (const f of fs.readdirSync(OUT).filter((x) => x.endsWith('.woff2'))) if (!fonts.some((x) => x.file === f)) fs.unlinkSync(path.join(OUT, f));
  fs.writeFileSync(manifestPath, JSON.stringify({ family: 'Atlas Scripts', license: 'SIL Open Font License 1.1 (OFL.txt)', fonts }, null, 1) + '\n');
  const ofl = path.join(OUT, 'OFL.txt');
  if (!fs.existsSync(ofl)) {
    const r = await fetch('https://raw.githubusercontent.com/notofonts/phoenician/main/OFL.txt');
    const text = (await r.text()).replace(/^Copyright .*$/m, 'Copyright The Noto Project Authors (https://github.com/notofonts)');
    if (r.ok) fs.writeFileSync(ofl, `The fonts in this folder are subsets of the Noto fonts (https://notofonts.github.io/,\nhttps://github.com/notofonts/noto-cjk), made by scripts/data/build-fonts.mjs. Their licence:\n\n${text}`);
  }
  console.log(`script fonts: ${fonts.length} files, ${Math.round(total / 1024)} KB in all`);
}

await main();
