#!/usr/bin/env node
// Google Play's store listing from the repository (v0.54.2), through the Play Developer API with the service account
// the Apps workflow already uploads with (the PLAY_SERVICE_ACCOUNT_JSON secret; its account needs "Manage store
// presence" in Play Console's Users and permissions).
//
//   node scripts/store/play.mjs status     what Play has now: each track's releases, the listings' languages and
//                                         titles, how many pictures each has, the contact details (changes nothing)
//   node scripts/store/play.mjs listing [--shots store/screenshots] [--only en-US,es-419] [--dry]
//                                         sends every language's name and descriptions (store/listings/*.json), the
//                                         icon, the feature graphic and the phone screenshots (made by
//                                         scripts/store/screenshots.mjs --devices android), and the contact details
//                                         (store/forms.md), then commits them; with --dry it only checks the files
//
// The texts are checked first (scripts/store/check.mjs's limits). Pictures replace what the language had. Play shows
// a listing change after its review, like an app update. Runs in the Store workflow (.github/workflows/store.yml).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const PKG = 'io.github.divaor.globe';
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;
const UPLOAD = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PKG}`;
const ICON = 'public/icons/icon-512.png';
const LIMITS = { name: 30, short: 80, description: 4000 };

const mode = process.argv[2];
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const SHOTS = arg('shots', 'store/screenshots');
const DRY = process.argv.includes('--dry');
if (!['status', 'listing'].includes(mode)) { console.error('usage: play.mjs status | listing [--shots dir] [--only en-US,…] [--dry]'); process.exit(2); }

// ---- the listing as the repository has it ----------------------------------------------------------

const only = arg('only')?.split(',').map((s) => s.trim()).filter(Boolean);
const langs = fs.readdirSync('store/listings').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
  .filter((l) => !only || only.includes(l));
/** A row of store/forms.md's addresses table, by its first cell. */
const formsRow = (name) => {
  const m = new RegExp(`^\\| ${name} \\| \`?([^\`|\\s]+)`, 'm').exec(fs.readFileSync('store/forms.md', 'utf8'));
  if (!m) throw new Error(`store/forms.md has no "${name}" row`);
  return m[1];
};

/** Every language's texts and pictures, checked: what would be sent. */
async function planListing() {
  const out = [];
  for (const lang of langs) {
    const j = JSON.parse(fs.readFileSync(`store/listings/${lang}.json`, 'utf8'));
    for (const [k, max] of Object.entries(LIMITS)) {
      if (!j[k]) throw new Error(`${lang}: no ${k}`);
      if ([...j[k]].length > max) throw new Error(`${lang}: ${k} is ${[...j[k]].length} characters (Play allows ${max})`);
    }
    const dir = path.join(SHOTS, lang, 'android');
    const phone = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d\d-.+\.png$/.test(f)).sort().map((f) => path.join(dir, f)) : [];
    const feature = path.join(dir, 'feature-graphic.png');
    if (phone.length < 2 || phone.length > 8) throw new Error(`${lang}: ${phone.length} phone screenshots in ${dir} (Play takes 2 to 8; make them with scripts/store/screenshots.mjs --devices android)`);
    if (!fs.existsSync(feature)) throw new Error(`${lang}: no ${feature}`);
    for (const f of phone) {
      const m = await sharp(f).metadata();
      const [a, b] = [Math.min(m.width, m.height), Math.max(m.width, m.height)];
      if (a < 320 || b > 3840 || b > 2 * a) throw new Error(`${f}: ${m.width}×${m.height} (Play: 320 to 3840 px, at most 2:1)`);
    }
    const fm = await sharp(feature).metadata();
    if (fm.width !== 1024 || fm.height !== 500) throw new Error(`${feature}: ${fm.width}×${fm.height} (Play: 1024×500)`);
    out.push({ lang, title: j.name, shortDescription: j.short, fullDescription: j.description, phone, feature });
  }
  const im = await sharp(ICON).metadata();
  if (im.width !== 512 || im.height !== 512) throw new Error(`${ICON}: ${im.width}×${im.height} (Play: 512×512)`);
  return out;
}

/** Play takes screenshots and the feature graphic without transparency: the same picture, flattened, as 24-bit PNG. */
const opaque = (f) => sharp(f).flatten({ background: '#060b18' }).png({ compressionLevel: 9 }).toBuffer();

// ---- Play --------------------------------------------------------------------------------------------

const b64url = (b) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** An access token for the service account (a signed JWT exchanged at Google's token address). */
async function token() {
  const raw = process.env.PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('PLAY_SERVICE_ACCOUNT_JSON is not set (it is a repository secret; this runs in the Store workflow)');
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const aud = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud, iat: now, exp: now + 3600 }));
  const sig = b64url(crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(sa.private_key));
  const r = await fetch(aud, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${sig}` }) });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`token: ${r.status} ${j.error ?? ''} ${j.error_description ?? ''}`);
  return j.access_token;
}

let AUTH = '';
/** One call to the API: JSON back, or an error with Play's own message. */
async function call(method, url, body, type = 'application/json') {
  const r = await fetch(url, { method, headers: { authorization: `Bearer ${AUTH}`, ...(body != null ? { 'content-type': type } : {}) },
    body: body == null ? undefined : type === 'application/json' ? JSON.stringify(body) : body });
  const text = await r.text();
  if (!r.ok) {
    let msg = text;
    try { msg = JSON.parse(text).error?.message ?? text; } catch { /* not JSON */ }
    throw new Error(`${method} ${url.replace(/^https:\/\/[^/]+/, '')}: ${r.status} ${msg}`);
  }
  return text ? JSON.parse(text) : {};
}

async function status() {
  const edit = await call('POST', `${API}/edits`, {});
  const E = `${API}/edits/${edit.id}`;
  try {
    const { tracks = [] } = await call('GET', `${E}/tracks`);
    console.log('Tracks:');
    for (const t of tracks) {
      const rel = (t.releases ?? []).map((r) => `${r.name ?? '(no name)'} [${(r.versionCodes ?? []).join(',')}] ${r.status}${r.userFraction ? ` ${Math.round(r.userFraction * 100)}%` : ''}`);
      console.log(`  ${t.track}: ${rel.join('; ') || 'nothing'}`);
    }
    const { listings = [] } = await call('GET', `${E}/listings`);
    console.log('Listings:');
    for (const l of listings) {
      const n = {};
      for (const t of ['icon', 'featureGraphic', 'phoneScreenshots']) n[t] = (await call('GET', `${E}/listings/${l.language}/${t}`)).images?.length ?? 0;
      console.log(`  ${l.language}: "${l.title}" · short ${[...(l.shortDescription ?? '')].length} · full ${[...(l.fullDescription ?? '')].length} characters · icon ${n.icon}, feature graphic ${n.featureGraphic}, phone screenshots ${n.phoneScreenshots}`);
    }
    if (!listings.length) console.log('  none yet');
    const d = await call('GET', `${E}/details`);
    console.log(`Details: default language ${d.defaultLanguage ?? '-'} · website ${d.contactWebsite ?? '-'} · email ${d.contactEmail ? 'set' : '-'}`);
  } finally {
    await call('DELETE', E).catch(() => {});
  }
}

async function listing(plan) {
  const edit = await call('POST', `${API}/edits`, {});
  const E = `${API}/edits/${edit.id}`, U = `${UPLOAD}/edits/${edit.id}`;
  const put = async (lang, type, bytes) => call('POST', `${U}/listings/${lang}/${type}?uploadType=media`, bytes, 'image/png');
  try {
    await call('PATCH', `${E}/details`, { defaultLanguage: 'en-US', contactEmail: formsRow('Support email'), contactWebsite: formsRow('Marketing / website') });
    const icon = fs.readFileSync(ICON);
    for (const p of plan) {
      await call('PUT', `${E}/listings/${p.lang}`, { language: p.lang, title: p.title, shortDescription: p.shortDescription, fullDescription: p.fullDescription });
      for (const t of ['icon', 'featureGraphic', 'phoneScreenshots']) await call('DELETE', `${E}/listings/${p.lang}/${t}`);
      await put(p.lang, 'icon', icon);
      await put(p.lang, 'featureGraphic', await opaque(p.feature));
      for (const f of p.phone) await put(p.lang, 'phoneScreenshots', await opaque(f));
      console.log(`${p.lang}: "${p.title}", ${p.phone.length} phone screenshots, feature graphic, icon`);
    }
    // Some apps' changes can't go to review on their own (Play then says to commit with changesNotSentForReview).
    try { await call('POST', `${E}:commit`); }
    catch (e) {
      if (!/changesNotSentForReview/.test(e.message)) throw e;
      await call('POST', `${E}:commit?changesNotSentForReview=true`);
      console.log('Committed without sending for review: send the changes for review in Play Console (Publishing overview).');
    }
    console.log(`Sent ${plan.length} listings to Play.`);
  } catch (e) {
    await call('DELETE', E).catch(() => {});
    throw e;
  }
}

try {
  if (mode === 'listing') {
    const plan = await planListing();
    console.log(`${plan.length} listings checked: ${plan.map((p) => `${p.lang} (${p.phone.length} screenshots)`).join(', ')}`);
    if (!DRY) { AUTH = await token(); await listing(plan); }
  } else {
    AUTH = await token();
    await status();
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
