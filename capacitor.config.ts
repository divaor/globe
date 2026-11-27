// The iOS and Android apps (v0.43.0): Capacitor wraps the same build as the website (dist/, with all of its data, so
// the apps work offline from the first launch). The native projects are ios/ and android/; `npm run app:sync` copies
// a fresh build into both. src/native/ is the app's side: storage, notifications, share and save, read aloud, links,
// the back button, haptics and the screen edges.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // The apps' permanent id (users never see it; it can't change once in the stores).
  appId: 'io.github.divaor.globe',
  // The name under the icon: the apps' store name (decision P1, Mundora); the website is Mundora too (v0.43.5).
  appName: 'Mundora',
  webDir: 'dist',
  backgroundColor: '#0b1220',
  android: {
    // The page is served from https://localhost; nothing is loaded over plain http.
    allowMixedContent: false,
  },
  ios: {
    // The page draws under the status bar and the home indicator itself (env(safe-area-inset-*)).
    contentInset: 'never',
    backgroundColor: '#0b1220',
  },
  plugins: {
    // The phone's splash is the page's own drawn as a picture (scripts/app/splash.mjs, v0.54.3): the orb and the name.
    // It gives way to the page's as soon as the page is up (src/native/boot.ts), which then shows while the app loads.
    SplashScreen: { launchAutoHide: false, backgroundColor: '#0b1220', showSpinner: false, androidScaleType: 'CENTER_CROP' },
    LocalNotifications: { smallIcon: 'ic_stat_globe', iconColor: '#3fd0e0' },
    // Edge to edge (Capacitor 8's own system bars): the page draws under the status bar and the navigation bar and
    // keeps clear of them with env(safe-area-inset-*); older Android web views get the app padded instead.
    SystemBars: { insetsHandling: 'native', initialViewportFitValueHint: 'cover', style: 'DARK' },
  },
};

export default config;
