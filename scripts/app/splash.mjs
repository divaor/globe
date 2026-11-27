#!/usr/bin/env node
// The apps' launch screens (v0.54.3), drawn from the page's own splash (index.html #splash, src/styles/main.css): the
// colour orb with the name under it. The phone's splash and the page's are then one picture: the name is there from
// the first moment, and when the page's splash takes over (src/native/boot.ts), the orb and the name stay where they
// are and "Loading the world…" comes in under them.
//   Android 12 and later: the splash icon, res/drawable-<dpi>/splash_icon.png, 288 dp square, of which Android shows
//     the middle 192 dp circle (everything is inside it, and the orb's glow fades out before its edge).
//   Android 11 and older: res/drawable/splash.xml, the space colour with the same icon in the middle (made here; the
//     launch pictures @capacitor/assets makes are removed, so it can't be stretched to the screen's shape).
//   iOS: Assets.xcassets/Splash.imageset, filled to the screen (LaunchScreen.storyboard), sized for today's iPhones.
//   resources/splash.png and splash-dark.png: the same, for @capacitor/assets.
// Needs Playwright's Chromium, and the fonts the phones use for the page's text: Roboto for Android, Inter (close to
// the iPhone's own) for iOS (fonts-roboto-unhinted, fonts-inter).
//   node scripts/app/splash.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(require.resolve('playwright', { paths: [process.env.NODE_PATH || '', '/opt/node-tools/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules'] }))); }

const RES = 'android/app/src/main/res';
const IOS = 'ios/App/App/Assets.xcassets/Splash.imageset';
/** The page's splash background (main.css #splash), set for a phone's screen: about 440 × 956 points. */
const SPACE = 'radial-gradient(circle 570px at 50% calc(50% - 48px), #0f2244 0, #02050c 400px)';

/**
 * The page's splash at w × h CSS px (dp, points), `scale` pixels each: the orb and the name, with the line under them
 * kept (hidden) so they sit where the page puts them. `fade`: the radius (CSS px) where everything has faded out
 * around the middle, for Android's round crop.
 */
function html({ w, h, font, bg, fade }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${bg ?? 'transparent'}}
  #splash{position:fixed;inset:0;display:grid;place-content:center;justify-items:center;gap:14px;color:#eaf2ff;
    font-family:${font};-webkit-font-smoothing:antialiased;
    ${fade ? `-webkit-mask-image:radial-gradient(circle at 50% 50%,#000 ${fade - 9}px,transparent ${fade}px);mask-image:radial-gradient(circle at 50% 50%,#000 ${fade - 9}px,transparent ${fade}px);` : ''}}
  .splash-globe{position:relative;width:92px;height:92px;border-radius:50%;background:
    radial-gradient(circle at 34% 30%,rgba(255,255,255,.8),rgba(255,255,255,0) 30%),
    conic-gradient(from 0deg,#2fc4d9,#39d98a,#ffd166,#ff6b6b,#8c6cff,#2fc4d9)}
  /* The page's glow (box-shadow: 0 0 60px rgba(63,208,224,.5)) as a gradient of the same fall-off: a big blurred shadow
     here comes out in tiles with faint seams between them. */
  .splash-globe::before{content:'';position:absolute;z-index:-1;left:-90px;top:-90px;width:272px;height:272px;
    background:radial-gradient(circle 136px,rgba(63,208,224,.5) 30px,rgba(63,208,224,.25) 46px,rgba(63,208,224,.154) 61px,
      rgba(63,208,224,.08) 76px,rgba(63,208,224,.033) 91px,rgba(63,208,224,.011) 106px,rgba(63,208,224,0) 136px)}
  .splash-name{font-size:26px;font-weight:800;letter-spacing:.02em}
  .splash-text{font-size:14px;opacity:.7;visibility:hidden}
</style></head><body><div id="splash"><div class="splash-globe"></div><div class="splash-name">Mundora</div><div class="splash-text">Loading the world…</div></div></body></html>`;
}

const browser = await chromium.launch();
/** The splash as PNG bytes, and where the orb and the name are against the middle (CSS px). */
async function render(o) {
  const ctx = await browser.newContext({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: o.scale });
  const page = await ctx.newPage();
  await page.setContent(html(o));
  await page.evaluate(() => document.fonts.ready);
  const at = await page.evaluate(() => {
    const mid = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2 - innerWidth / 2, r.top + r.height / 2 - innerHeight / 2, r.width, r.height]; };
    return { orb: mid('.splash-globe'), name: mid('.splash-name'), font: getComputedStyle(document.querySelector('.splash-name')).fontFamily };
  });
  const png = await page.screenshot({ omitBackground: !o.bg });
  await ctx.close();
  return { png, at };
}
const round = (a) => a.map((v) => Math.round(v * 10) / 10).join(', ');

// Android 12+: the splash icon at each density.
const DPI = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
let at;
for (const [dpi, scale] of Object.entries(DPI)) {
  const r = await render({ w: 288, h: 288, scale, font: 'Roboto, system-ui, sans-serif', fade: 95 });
  fs.mkdirSync(path.join(RES, `drawable-${dpi}`), { recursive: true });
  fs.writeFileSync(path.join(RES, `drawable-${dpi}`, 'splash_icon.png'), r.png);
  at = r.at;
}
console.log(`Android icon: orb ${round(at.orb)}, name ${round(at.name)} (x, y from the middle; width, height) in ${at.font}`);

// Android 11 and older: the same icon in the middle of the space colour, instead of pictures of a fixed shape.
let gone = 0;
for (const dir of fs.readdirSync(RES)) {
  if (!dir.startsWith('drawable')) continue;
  const f = path.join(RES, dir, 'splash.png');
  if (fs.existsSync(f)) { fs.rmSync(f); gone++; }
}
fs.writeFileSync(path.join(RES, 'drawable', 'splash.xml'), `<?xml version="1.0" encoding="utf-8"?>
<!-- The launch screen behind Android 11 and older's splash (made by scripts/app/splash.mjs): the space colour and, in
     the middle, the same orb and name as Android 12's splash icon and the page's own splash. -->
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/mundora_space" />
    <item>
        <bitmap android:gravity="center" android:src="@drawable/splash_icon" />
    </item>
</layer-list>
`);
console.log(`Android launch screen: drawable/splash.xml (${gone} launch pictures removed)`);

// iOS and @capacitor/assets: 2732 px squares, filled to the screen. On today's iPhones (about 930 points tall, three
// pixels a point) a point of the picture is about 1.03 points of the screen: 2.9 pixels a point.
const SIDE = 2732, pts = 942;
const ios = await render({ w: pts, h: pts, scale: SIDE / pts, font: 'Inter, system-ui, sans-serif', bg: SPACE });
for (const f of fs.readdirSync(IOS).filter((f) => /^Default@\dx~universal~anyany(-dark)?\.png$/.test(f))) fs.writeFileSync(path.join(IOS, f), ios.png);
for (const f of ['resources/splash.png', 'resources/splash-dark.png']) fs.writeFileSync(f, ios.png);
console.log(`iOS launch picture and resources/splash*.png: ${SIDE} px, orb ${round(ios.at.orb)}, name ${round(ios.at.name)} in ${ios.at.font}`);
await browser.close();
