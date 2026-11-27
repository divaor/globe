#!/usr/bin/env node
// The apps' rules (v0.43.0), with Node: the reminders scheduled ahead (src/today/remind-plan.ts), links (which open
// the phone's browser, and the place a shared link opens), file names, saved tiles' file names, and the native
// projects' settings (ids, permissions, the privacy manifest, the version from package.json).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { rolldown } = await import('rolldown');
async function load(file) {
  const b = await rolldown({ input: path.join(ROOT, file), platform: 'neutral', logLevel: 'silent' });
  const { output } = await b.generate({ format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
}
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };

// ---- Reminders planned ahead
const P = await load('src/today/remind-plan.ts');
const snap = {
  off: false, time: '19:00', chosen: ['daily', 'master:capitals', 'fill'],
  done: { daily: '2026-11-20' },
  days: { '2026-11-20': { 'master:capitals': { t: '🏛️ Capitals', b: '12 to review' } }, '2026-11-21': { daily: { t: '🗓️ Daily challenge #300', b: 'Eight questions' } } },
  generic: { daily: { t: '🗓️ Daily challenge', b: 'Still waiting' }, 'master:capitals': { t: '🏛️ Capitals', b: 'Still waiting' }, fill: { t: '🖍️ Region', b: 'Still waiting' } },
  more: '+{n} more',
};
const morning = new Date(2026, 10, 20, 9, 0);
const plan = P.planReminders(snap, morning);
check(plan.length === 8 && plan[0].day === '2026-11-20' && plan[0].at.getHours() === 19 && plan.every((r, i) => r.id === 4300 + i),
  `eight days ahead at 19:00, from today (${plan.map((r) => r.day.slice(5)).join(' ')})`);
check(plan[0].source !== 'daily' && plan[0].title === '🏛️ Capitals' && plan[0].body === '12 to review · +1 more',
  `today: one of those not done yet, with "+1 more" (${plan[0].title}: ${plan[0].body})`);
check(plan[1].source === 'fill' && plan[1].body === 'Still waiting · +2 more' && plan[2].source === 'daily' && plan[2].title === '🗓️ Daily challenge' && plan[3].source === 'master:capitals',
  `the days after take turns (${plan.slice(0, 4).map((r) => r.source).join(', ')})`);
const evening = P.planReminders(snap, new Date(2026, 10, 20, 20, 0));
check(evening.length === 7 && evening[0].day === '2026-11-21', 'after today\'s time: from tomorrow');
const allDone = P.planReminders({ ...snap, done: { daily: '2026-11-20', 'master:capitals': '2026-11-20', fill: '2026-11-20' } }, morning);
check(allDone.length === 7 && allDone[0].day === '2026-11-21', 'everything done today: nothing today, the next days still come');
check(P.planReminders({ ...snap, off: true }, morning).length === 0 && P.planReminders({ ...snap, chosen: [] }, morning).length === 0 && P.planReminders(null, morning).length === 0,
  'all off, or nothing chosen: nothing scheduled');
const late = P.planReminders({ ...snap, time: '7:30' }, morning);
check(late[0].day === '2026-11-21' && late[0].at.getHours() === 7 && late[0].at.getMinutes() === 30, 'a morning time already gone today: from tomorrow at 7:30');

// ---- Links, names, tiles
const U = await load('src/native/urls.ts');
const app = 'https://localhost/index.html';
check(U.isOutside('https://en.wikipedia.org/wiki/Lima', app) && U.isOutside('mailto:a@b.c', app) && !U.isOutside('#war=ww2', app) && !U.isOutside('/data/x.json', app) && !U.isOutside('https://localhost/other', app),
  'other sites and mail go to the phone; the app\'s own pages stay');
check(U.hashOf('https://divaor.github.io/globe/#war=ww2&step=3') === '#war=ww2&step=3' && U.hashOf('https://divaor.github.io/globe/') === null && U.hashOf('not a url') === null,
  'a shared link\'s place: its hash');
check(U.safeName('My trip: Lima/Cusco?.md') === 'My trip- Lima-Cusco-.md' && U.safeName('..') === 'atlas', `file names the phone accepts (${U.safeName('My trip: Lima/Cusco?.md')})`);
const a = U.tileFile('https://tiles.example/10/512/300.jpg'), b = U.tileFile('https://tiles.example/10/512/301.jpg');
check(/^tiles\/[0-9a-f]{16}\.bin$/.test(a) && a !== b && a === U.tileFile('https://tiles.example/10/512/300.jpg'), `saved tiles: one stable file each (${a})`);

// ---- The native projects
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const cfg = fs.readFileSync(path.join(ROOT, 'capacitor.config.ts'), 'utf8');
const gradle = fs.readFileSync(path.join(ROOT, 'android/app/build.gradle'), 'utf8');
const manifest = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
const plist = fs.readFileSync(path.join(ROOT, 'ios/App/App/Info.plist'), 'utf8');
const pbx = fs.readFileSync(path.join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
const privacy = fs.readFileSync(path.join(ROOT, 'ios/App/App/PrivacyInfo.xcprivacy'), 'utf8');
const id = /appId: '([^']+)'/.exec(cfg)?.[1];
check(id === 'io.github.divaor.globe' && gradle.includes(`applicationId "${id}"`) && (pbx.match(new RegExp(`PRODUCT_BUNDLE_IDENTIFIER = ${id.replace(/\./g, '\\.')};`, 'g')) ?? []).length === 2,
  `one app id on both (${id})`);
const appName = /appName: '([^']+)'/.exec(cfg)?.[1];
const strings = fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/values/strings.xml'), 'utf8');
const listings = fs.readdirSync(path.join(ROOT, 'store/listings')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'store/listings', f), 'utf8')).name);
check(!!appName && strings.includes(`<string name="app_name">${appName}</string>`) && new RegExp(`CFBundleDisplayName</key>\\s*<string>${appName}</string>`).test(plist)
  && listings.length === 6 && listings.every((n) => n.startsWith(appName)),
  `one name under the icon on both, and in every store listing (${appName}; ${listings.join(' / ')})`);
check(gradle.includes('versionName pkg.version') && (pbx.match(new RegExp(`MARKETING_VERSION = ${pkg.version.replace(/\./g, '\\.')};`, 'g')) ?? []).length === 2,
  `the version from package.json (${pkg.version})`);
check(/POST_NOTIFICATIONS/.test(manifest) && /ACCESS_COARSE_LOCATION/.test(manifest) && !/ACCESS_FINE_LOCATION|SCHEDULE_EXACT_ALARM|USE_EXACT_ALARM/.test(manifest),
  'Android: notifications and approximate location only (no precise location, no exact alarms)');
check(/android:host="divaor.github.io" android:pathPrefix="\/globe"/.test(manifest), 'Android: links to the website open the app');
check(/NSLocationWhenInUseUsageDescription/.test(plist) && /ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(plist) && /arm64/.test(plist) && !/armv7/.test(plist),
  'iOS: the location reason, no export encryption, arm64');
check(/NSPrivacyTracking<\/key>\s*<false\/>/.test(privacy) && /CA92\.1/.test(privacy) && /PrivacyInfo\.xcprivacy in Resources/.test(pbx) && /CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/.test(pbx),
  'iOS: the privacy manifest in the app, and the links entitlement');
for (const f of ['resources/icon-only.png', 'resources/icon-foreground.png', 'resources/icon-background.png', 'resources/splash.png', 'android/app/src/main/res/drawable/ic_stat_globe.xml']) {
  if (!fs.existsSync(path.join(ROOT, f))) check(false, `missing ${f}`);
}
check(fs.existsSync(path.join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset')) && fs.readdirSync(path.join(ROOT, 'android/app/src/main/res')).some((d) => d.startsWith('mipmap-')),
  'the icon on both');
// The splash (v0.54.3): the page's orb and name on Android's splash (288 dp at each density), the same in the middle of
// the launch screen before Android 12 (no launch pictures of a fixed shape left), and the phone's splash giving way to
// the page's as soon as the page is up.
{
  const RES = path.join(ROOT, 'android/app/src/main/res');
  const styles = fs.readFileSync(path.join(RES, 'values/styles.xml'), 'utf8');
  const sizes = { mdpi: 288, hdpi: 432, xhdpi: 576, xxhdpi: 864, xxxhdpi: 1152 };
  const sharp = (await import('sharp')).default;
  const wrong = [];
  for (const [d, px] of Object.entries(sizes)) {
    const f = path.join(RES, `drawable-${d}/splash_icon.png`);
    const m = fs.existsSync(f) ? await sharp(f).metadata() : null;
    if (!m || m.width !== px || m.height !== px || !m.hasAlpha) wrong.push(d);
  }
  const pictures = fs.readdirSync(RES).filter((d) => d.startsWith('drawable') && fs.existsSync(path.join(RES, d, 'splash.png')));
  const layer = fs.readFileSync(path.join(RES, 'drawable/splash.xml'), 'utf8');
  check(/windowSplashScreenAnimatedIcon">@drawable\/splash_icon</.test(styles) && !wrong.length && !pictures.length && /@drawable\/splash_icon/.test(layer) && /@color\/mundora_space/.test(layer),
    `Android's splash: the orb and the name at every density${wrong.length ? ` (wrong: ${wrong.join(', ')})` : ''}, and in the middle of the older launch screen${pictures.length ? ` (launch pictures left: ${pictures.join(', ')})` : ''}`);
  const boot = fs.readFileSync(path.join(ROOT, 'src/native/boot.ts'), 'utf8');
  const early = /export async function early\(\) \{([\s\S]*?)\n\}/.exec(boot)?.[1] ?? '', ready = /export function ready\([^)]*\) \{([\s\S]*?)\n\}/.exec(boot)?.[1] ?? '';
  check(/hideSplash\(\)/.test(early) && !/hideSplash/.test(ready), 'the phone\'s splash gives way to the page\'s as soon as the page is up, not once the app has loaded');
  // The screen's fastest rate while touched (MainActivity, v0.54.3).
  const act = fs.readFileSync(path.join(ROOT, 'android/app/src/main/java/io/github/divaor/globe/MainActivity.java'), 'utf8');
  check(/preferredDisplayModeId/.test(act) && /dispatchTouchEvent/.test(act) && /getAlternativeRefreshRates/.test(act) && /onPause/.test(act),
    'Android: the screen\'s fastest refresh rate while the map is touched, back to the phone\'s choice after and when the app leaves');
}

// ---- The apps' copy of your data (src/native/storage.ts; v0.50.2): with a slow stand-in for the app's storage, what
// is missing from the page comes back at launch, and a flush (what bringing back a backup waits for before starting
// the page again) returns only once every change, removals too, is in the app's storage.
{
  class Store {
    constructor() { this.m = new Map(); }
    get length() { return this.m.size; }
    key(i) { return [...this.m.keys()][i] ?? null; }
    getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
    setItem(k, v) { this.m.set(k, String(v)); }
    removeItem(k) { this.m.delete(k); }
    clear() { this.m.clear(); }
  }
  const prefs = new Map([['ls:atlas-globe:trip', '["paris"]'], ['ls:atlas-globe:old', 'x']]);
  const slow = () => new Promise((ok) => setTimeout(ok, 25));
  globalThis.__prefs = { prefs, slow };
  globalThis.Storage = Store;
  globalThis.window = { localStorage: new Store(), setTimeout, clearTimeout };
  const V = {
    '\0entry': `export { keepStorage, flushStorage } from ${JSON.stringify(path.join(ROOT, 'src/native/storage.ts'))}; export { persist } from ${JSON.stringify(path.join(ROOT, 'src/app/persist.ts'))};`,
    '@capacitor/preferences': `const { prefs, slow } = globalThis.__prefs; export const Preferences = {
      keys: async () => ({ keys: [...prefs.keys()] }), get: async ({ key }) => ({ value: prefs.has(key) ? prefs.get(key) : null }),
      set: async ({ key, value }) => { await slow(); prefs.set(key, value); }, remove: async ({ key }) => { await slow(); prefs.delete(key); } };`,
    '@capacitor/app': 'export const App = { addListener: async () => ({ remove() {} }) };',
  };
  const b = await rolldown({ input: '\0entry', platform: 'neutral', logLevel: 'silent', plugins: [{ name: 'stand-ins', resolveId: (id) => (id in V ? id : null), load: (id) => V[id] ?? null }] });
  const N = await import(`data:text/javascript;base64,${Buffer.from((await b.generate({ format: 'esm' })).output[0].code).toString('base64')}`);
  const ls = window.localStorage;
  ls.setItem('atlas-globe:settings', '{"theme":"dark"}');
  ls.setItem('atlas-globe:old', 'x');
  const { restored } = await N.keepStorage();
  check(restored === 1 && ls.getItem('atlas-globe:trip') === '["paris"]', `at launch, what the page lost comes back from the app's storage (${restored})`);
  // A backup brought back: one key replaced, one removed, a big one added; then the wait before starting again.
  ls.setItem('atlas-globe:trip', '["lima","cusco"]');
  ls.removeItem('atlas-globe:old');
  ls.setItem('atlas-globe:master', 'm'.repeat(200000));
  const t0 = Date.now();
  await N.persist.flush();
  const took = Date.now() - t0;
  check(prefs.get('ls:atlas-globe:trip') === '["lima","cusco"]' && !prefs.has('ls:atlas-globe:old') && prefs.get('ls:atlas-globe:master')?.length === 200000 && prefs.get('ls:atlas-globe:settings') === '{"theme":"dark"}' && took >= 75,
    `bringing back a backup waits until the app's storage has every change, the removal too (${took} ms of slow writes)`);
  delete globalThis.window; delete globalThis.Storage; delete globalThis.__prefs;
}

console.log(failed ? `\n${failed} native check(s) failed` : '\nnative checks passed');
process.exit(failed ? 1 : 0);
