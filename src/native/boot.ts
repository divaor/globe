// The apps' side of the start (v0.43.0), loaded only inside the iOS and Android apps (main.ts asks platform.ts
// first). `early` runs before the app is built: the stored progress is put back, a shared link's place goes into
// the address, and the page is given the phone's share menu, clipboard, file saving, browser, location and (on
// Android) voices. `ready` runs once the app is up: the native splash goes, the status bar follows the theme, the
// back button and links work, and a tapped reminder opens Today.
import { keepStorage } from './storage';
import { installShare } from './share';
import { installLinks } from './links';
import { installGeo } from './geo';
import { installSpeech } from './tts';
import { backButton, followTheme, hideSplash, laterLinks, launchLink } from './chrome';
import { onReminderTap } from './notify';
import { bridged, platform } from './platform';
import { watchAnswers } from './haptics';

export async function early() {
  document.documentElement.classList.add('native', `native-${platform()}`);
  await keepStorage();
  await launchLink();
  installShare();
  installLinks();
  installGeo();
  if (platform() === 'android' && bridged()) installSpeech();
}

export function ready(o: { back: () => boolean; openToday: () => void }) {
  hideSplash();
  followTheme();
  backButton(o.back);
  laterLinks();
  onReminderTap(o.openToday);
  watchAnswers();
}
