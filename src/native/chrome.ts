// The apps' frame (v0.43.0): the status bar's icons light or dark with the app's theme and map, the native splash
// screen hidden as soon as the page's own is, Android's back button, and links to the website opening the app at
// the same place (app links and universal links).
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { platform } from './platform';
import { hashOf } from './urls';

/** Light icons over the dark theme and the dark maps; dark icons over the light ones. */
function barsStyle(): SystemBarsStyle {
  const root = document.documentElement;
  // The light theme's globe floats in dark space (v0.49.0): light icons there.
  const light = (root.dataset.theme === 'light' && !root.classList.contains('space-dark')) || root.classList.contains('map-light');
  return light ? SystemBarsStyle.Light : SystemBarsStyle.Dark;
}

export function followTheme() {
  let last = '';
  const apply = () => {
    const s = barsStyle();
    if (s === last) return;
    last = s;
    void SystemBars.setStyle({ style: s }).catch(() => {});
  };
  apply();
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
}

export function hideSplash() { void SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {}); }

/**
 * Android's back button: closes what is on top (the bottom bar's list, a panel, a game or quiz, a country's card…,
 * as `back` decides), and leaves the app (to the home screen, as Android apps do) when nothing is left to close.
 */
export function backButton(back: () => boolean) {
  if (platform() !== 'android') return;
  void App.addListener('backButton', () => {
    if (back()) return;
    void App.minimizeApp().catch(() => void App.exitApp());
  }).catch(() => {});
}


/** The app opened by a link: at launch, the link's place goes into the address before the app reads it. */
export async function launchLink(): Promise<void> {
  try {
    const r = await App.getLaunchUrl();
    const hash = r?.url ? hashOf(r.url) : null;
    if (hash) history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
  } catch { /* no link */ }
}

/** A link tapped while the app is open: the app starts again at the link's place (as the website would). */
export function laterLinks() {
  void App.addListener('appUrlOpen', ({ url }) => {
    const hash = hashOf(url);
    if (!hash) return;
    history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
    location.reload();
  }).catch(() => {});
}
