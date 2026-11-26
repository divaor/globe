#!/usr/bin/env node
// The stores' screenshots (v0.48.0; the Sun scene since v0.54.2): the same seven scenes in every listing language, for the sizes the stores ask for:
// iPhone 6.9" (1320×2868), iPad 13" (2064×2752), an Android phone (1080×2160), and Google Play's feature graphic
// (1024×500). Each screenshot is the app as a phone shows it, under a short caption in the listing's language.
// They are made from a running copy of the site and are not kept in git (store/screenshots/ is ignored).
//   npm run build && npx vite preview --port 4173 &
//   node scripts/store/screenshots.mjs [--url http://localhost:4173/] [--out store/screenshots] [--only en-US,fr-FR]
//                                      [--devices iphone,ipad,android] [--scenes globe,maps]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(require.resolve('playwright', { paths: [process.env.NODE_PATH || '', '/opt/node-tools/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules'] }))); }

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const URL_ = arg('url', 'http://localhost:4173/');
const OUT = arg('out', 'store/screenshots');
const list = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : null);

/** The listing languages: the app's language for each, and its locale for dates and numbers. */
const LOCALES = {
  'en-US': { lang: 'en', locale: 'en-US' },
  'es-419': { lang: 'es', locale: 'es-MX' },
  'es-ES': { lang: 'es-ES', locale: 'es-ES' },
  'pt-BR': { lang: 'pt', locale: 'pt-BR' },
  'fr-FR': { lang: 'fr', locale: 'fr-FR' },
  'de-DE': { lang: 'de', locale: 'de-DE' },
};
/** The stores' sizes: the page's size in CSS pixels times the device's pixel ratio. */
const DEVICES = {
  iphone: { w: 440, h: 956, dpr: 3, mobile: true },
  ipad: { w: 1032, h: 1376, dpr: 2, mobile: true },
  android: { w: 360, h: 720, dpr: 3, mobile: true },
};
/** The scenes, in the listing's order, and how each is set up in the app. */
const SCENES = [
  { id: 'globe', hash: '#p=globe&l=political&c=15,20,1.15' },
  { id: 'maps', hash: '#p=globe&l=koppen&c=20,10,1.2' },
  // From the Sun, following the Earth: the Sun's top below, the Earth ahead and named, and the count of its year after
  // a few weeks of play.
  // (The Sun's note under its name is left out, to leave room for the Sun.)
  { id: 'space', hash: '#world=sun', wait: 1500, css: '.worldbar .wd-note{display:none}', run: async () => {
    const until = async (f, ms) => { for (let t = 0; t < ms && !f(); t += 100) await new Promise((r) => setTimeout(r, 100)); };
    await until(() => window.atlas.space.surface?.id === 'sun' && window.atlas.around.info.sunlit, 20000);
    await new Promise((r) => setTimeout(r, 1500));
    const a = window.atlas.around;
    a.setLock('follow', 'earth');
    await new Promise((r) => setTimeout(r, 2500));
    a.play(3);
    await until(() => (a.info.orbit?.day ?? 0) > 60, 15000);
    a.pause();
  } },
  { id: 'deeptime', hash: '#deeptime=66&p=globe', wait: 5000 },
  { id: 'today', hash: '#p=globe&l=political&c=-40,20,1.1', run: () => window.atlas.today.openPanel() },
  { id: 'master', hash: '#p=globe&l=political&c=-60,-15,1.4', run: () => window.atlas.master.start('learn', { scope: 'SA', reverse: false }) },
  { id: 'guide', hash: '#p=globe&l=political&c=135.7,35,3', run: () => window.atlas.guide.openCity('kyoto') },
];
/** The captions: two short lines each. */
const CAPTIONS = {
  globe: { 'en-US': 'The whole world\non one globe', 'es-419': 'Todo el mundo\nen un solo globo', 'es-ES': 'Todo el mundo\nen un solo globo', 'pt-BR': 'O mundo inteiro\nem um só globo', 'fr-FR': 'Le monde entier\nsur un seul globe', 'de-DE': 'Die ganze Welt\nauf einem Globus' },
  space: { 'en-US': 'Follow the planets\nround the Sun', 'es-419': 'Sigue a los planetas\nalrededor del Sol', 'es-ES': 'Sigue a los planetas\nalrededor del Sol', 'pt-BR': 'Siga os planetas\nao redor do Sol', 'fr-FR': 'Suivez les planètes\nautour du Soleil', 'de-DE': 'Folge den Planeten\num die Sonne' },
  maps: { 'en-US': 'More than 170 maps\nof the world', 'es-419': 'Más de 170 mapas\ndel mundo', 'es-ES': 'Más de 170 mapas\ndel mundo', 'pt-BR': 'Mais de 170 mapas\ndo mundo', 'fr-FR': 'Plus de 170 cartes\ndu monde', 'de-DE': 'Über 170 Karten\nder Welt' },
  deeptime: { 'en-US': 'From the Big Bang\nto today', 'es-419': 'Del Big Bang\nhasta hoy', 'es-ES': 'Del Big Bang\nhasta hoy', 'pt-BR': 'Do Big Bang\naté hoje', 'fr-FR': 'Du Big Bang\nà aujourd’hui', 'de-DE': 'Vom Urknall\nbis heute' },
  today: { 'en-US': 'Something new\nto play every day', 'es-419': 'Algo nuevo\npara jugar cada día', 'es-ES': 'Algo nuevo\npara jugar cada día', 'pt-BR': 'Algo novo\npara jogar todo dia', 'fr-FR': 'Du nouveau\nà jouer chaque jour', 'de-DE': 'Jeden Tag\netwas Neues zum Spielen' },
  master: { 'en-US': 'Learn every country,\ncapital and flag', 'es-419': 'Aprende cada país,\ncapital y bandera', 'es-ES': 'Aprende cada país,\ncapital y bandera', 'pt-BR': 'Aprenda cada país,\ncapital e bandeira', 'fr-FR': 'Apprenez chaque pays,\ncapitale et drapeau', 'de-DE': 'Lerne jedes Land,\njede Hauptstadt, jede Flagge' },
  guide: { 'en-US': 'A travel guide\nto 700 cities', 'es-419': 'Una guía de viaje\nde 700 ciudades', 'es-ES': 'Una guía de viaje\nde 700 ciudades', 'pt-BR': 'Um guia de viagem\nde 700 cidades', 'fr-FR': 'Un guide de voyage\nde 700 villes', 'de-DE': 'Ein Reiseführer\nfür 700 Städte' },
};
/** Google Play's feature graphic: the name and one line. */
const TAGLINE = { 'en-US': 'The world on one globe', 'es-419': 'El mundo en un solo globo', 'es-ES': 'El mundo en un solo globo', 'pt-BR': 'O mundo em um só globo', 'fr-FR': 'Le monde sur un seul globe', 'de-DE': 'Die Welt auf einem Globus' };

const locales = list(arg('only')) ?? Object.keys(LOCALES);
const devices = list(arg('devices')) ?? Object.keys(DEVICES);
const scenes = SCENES.filter((s) => !list(arg('scenes')) || list(arg('scenes')).includes(s.id));
for (const l of locales) if (!LOCALES[l]) throw new Error(`unknown locale ${l}`);
for (const s of scenes) for (const l of locales) if (!CAPTIONS[s.id]?.[l]) throw new Error(`no caption for ${s.id} in ${l}`);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const browser = await chromium.launch();
const icon = fs.readFileSync('public/icons/icon-512.png').toString('base64');

/** The app at a device's size, in a language, set up for a scene: its picture as PNG bytes. */
async function appShot(dev, loc, scene) {
  const d = DEVICES[dev], L = LOCALES[loc];
  const ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.dpr, isMobile: d.mobile, hasTouch: true, locale: L.locale, colorScheme: 'dark' });
  await ctx.addInitScript(() => { try { localStorage.setItem('atlas-globe:welcomed', '1'); localStorage.setItem('atlas-globe:hinted', '1'); } catch { /* */ } });
  if (scene.css) await ctx.addInitScript((css) => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = css; document.head.append(st); }); }, scene.css);
  const page = await ctx.newPage();
  const hash = `${scene.hash}${scene.hash.includes('lang=') ? '' : `&lang=${L.lang}`}`;
  await page.goto(URL_ + hash, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  await page.waitForFunction(() => window.atlas, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  if (scene.run) { await page.evaluate(scene.run).catch((e) => console.warn(`${scene.id}: ${e.message}`)); }
  await page.waitForTimeout(scene.wait ?? 3000);
  const png = await page.screenshot();
  await ctx.close();
  return png;
}

/** The store's picture: a gradient, the caption, and the app's picture below it with rounded corners. */
async function compose(dev, loc, scene, png) {
  const d = DEVICES[dev];
  const ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.dpr });
  const page = await ctx.newPage();
  const big = dev === 'ipad';
  await page.setContent(`<!doctype html><html><head><style>
    html,body{margin:0;width:${d.w}px;height:${d.h}px;overflow:hidden}
    body{background:radial-gradient(120% 80% at 50% 0%,#1d3b78 0%,#0b1630 45%,#060b18 100%);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;display:flex;flex-direction:column;align-items:center}
    h1{margin:${big ? 56 : 34}px 24px ${big ? 32 : 20}px;font-size:${big ? 54 : 31}px;line-height:1.15;font-weight:800;text-align:center;letter-spacing:-.01em;white-space:pre;align-self:stretch;overflow:hidden}
    .shot{width:${big ? 80 : 84}%;border-radius:${big ? 28 : 22}px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.55),0 0 0 2px rgba(255,255,255,.12)}
    .shot img{display:block;width:100%}
  </style></head><body><h1>${esc(CAPTIONS[scene.id][loc])}</h1><div class="shot"><img src="data:image/png;base64,${png.toString('base64')}"></div></body></html>`);
  // Each caption stays on its two lines: a line too long for the width makes the whole caption smaller.
  await page.evaluate(() => { const h = document.querySelector('h1'); let s = parseFloat(getComputedStyle(h).fontSize); while (h.scrollWidth > h.clientWidth && s > 16) h.style.fontSize = `${--s}px`; });
  await page.waitForTimeout(200);
  const out = await page.screenshot();
  await ctx.close();
  return out;
}

/** Google Play's feature graphic (1024×500): the icon, the name and the line, beside the globe. */
async function featureGraphic(loc, globe) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(`<!doctype html><html><head><style>
    html,body{margin:0;width:1024px;height:500px;overflow:hidden}
    body{background:radial-gradient(90% 120% at 75% 50%,#1d3b78 0%,#0b1630 50%,#060b18 100%);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;position:relative}
    .t{position:absolute;left:64px;top:50%;transform:translateY(-50%);max-width:480px}
    .t img{width:96px;height:96px;border-radius:22px;display:block;margin-bottom:24px}
    .t b{display:block;font-size:72px;font-weight:800;letter-spacing:-.02em}
    .t span{display:block;font-size:34px;opacity:.9;margin-top:8px;line-height:1.2}
    .g{position:absolute;right:-60px;top:50%;width:560px;height:560px;transform:translateY(-50%);border-radius:50%;overflow:hidden;background:url(data:image/png;base64,${globe.toString('base64')}) center/cover}
  </style></head><body><div class="g"></div><div class="t"><img src="data:image/png;base64,${icon}"><b>Mundora</b><span>${esc(TAGLINE[loc])}</span></div></body></html>`);
  await page.waitForTimeout(200);
  const out = await page.screenshot();
  await ctx.close();
  return out;
}

/** A square picture of the globe alone, for the feature graphic. */
async function globeOnly(loc) {
  const ctx = await browser.newContext({ viewport: { width: 700, height: 700 }, deviceScaleFactor: 1, locale: LOCALES[loc].locale, colorScheme: 'dark' });
  await ctx.addInitScript(() => { try { localStorage.setItem('atlas-globe:welcomed', '1'); localStorage.setItem('atlas-globe:hinted', '1'); } catch { /* */ } });
  const page = await ctx.newPage();
  await page.goto(`${URL_}#p=globe&l=political&c=-20,15,1.0&lang=${LOCALES[loc].lang}`, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  await page.waitForFunction(() => window.atlas, null, { timeout: 60000 });
  await page.addStyleTag({ content: '#app > :not(canvas):not(.globe-wrap){visibility:hidden!important} .sheet,.dock,.topbar,.chips,.legend,.zoom{visibility:hidden!important}' });
  await page.waitForTimeout(3000);
  const png = await page.screenshot();
  await ctx.close();
  return png;
}

let n = 0;
for (const loc of locales) {
  for (const dev of devices) {
    const dir = path.join(OUT, loc, dev);
    fs.mkdirSync(dir, { recursive: true });
    for (const [i, scene] of scenes.entries()) {
      const shot = await compose(dev, loc, scene, await appShot(dev, loc, scene));
      const f = path.join(dir, `${String(i + 1).padStart(2, '0')}-${scene.id}.png`);
      fs.writeFileSync(f, shot);
      n++;
      console.log(f);
    }
  }
  if (devices.includes('android')) {
    const f = path.join(OUT, loc, 'android', 'feature-graphic.png');
    fs.writeFileSync(f, await featureGraphic(loc, await globeOnly(loc)));
    n++;
    console.log(f);
  }
}
await browser.close();
console.log(`${n} pictures in ${OUT}/`);
