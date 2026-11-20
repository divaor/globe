// Links to other sites in the apps (v0.43.0): opened in the phone's browser, never inside the app (an in-app browser
// would count as unrestricted web access and raise the App Store's age rating). Links within the app stay in it.
import { AppLauncher } from '@capacitor/app-launcher';
import { isOutside as outside } from './urls';
import { bridged } from './platform';

const isOutside = (href: string) => outside(href, location.href);

let browserOpen: typeof window.open = (u, t, f) => window.open(u, t, f);

export async function openOutside(url: string) {
  // (The smoke test's pretend app: the browser's own new tab.)
  if (!bridged()) { browserOpen(url, '_blank', 'noopener'); return; }
  try { await AppLauncher.openUrl({ url }); } catch (e) { console.warn('open link', e); }
}

export function installLinks() {
  // Every tap on a link (the page's links are made by many features): another site goes to the browser.
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || a.hasAttribute('download') || !isOutside(a.href)) return;
    e.preventDefault();
    void openOutside(a.href);
  }, true);
  const open = window.open.bind(window);
  browserOpen = open;
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const href = url == null ? '' : String(url);
    if (href && isOutside(href)) { void openOutside(new URL(href, location.href).href); return null; }
    return open(url, target, features);
  }) as typeof window.open;
}
