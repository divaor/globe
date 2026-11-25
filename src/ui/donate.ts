// Supporting Mundora (v0.48.0): a donation button on the website only. The iOS and Android apps have none, because
// both stores ask for their own payments for tips to a developer. The Ko-fi page's name is in src/app/donate.json;
// with none there, nothing shows. Also the website's own pages (privacy policy, help), opened in the browser from the
// apps (with ?app=1, so they show no donation parts either).
import donate from '../app/donate.json';
import { isNative } from '../native/platform';
import { lang } from '../app/i18n';

const SITE = 'https://divaor.github.io/globe/';

/** The Ko-fi page, or null in the apps or while there is none. (The smoke test sets window.__atlasKofi.) */
export function donateUrl(): string | null {
  const test = (window as unknown as { __atlasKofi?: string }).__atlasKofi;
  const name = (test ?? (donate as { kofi?: string }).kofi ?? '').trim();
  return name && !isNative() ? `https://ko-fi.com/${name}` : null;
}

/** One of the website's own pages in the app's language: beside the app on the website, the website's in the apps. */
export function sitePage(page: 'privacy' | 'support' | 'credits'): string {
  const l = lang();
  const file = l === 'en' ? `${page}.html?lang=en` : `${page}.${l}.html`;
  return isNative() ? `${SITE}${file}${file.includes('?') ? '&' : '?'}app=1` : file;
}
