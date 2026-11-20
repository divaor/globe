// The iOS and Android apps (v0.43.0) or the website? The apps' native side puts window.Capacitor on the page before it
// loads, so this needs no import: the website never loads the apps' code (src/native/boot.ts is imported only in the
// apps). The smoke test pretends to be an app with window.__atlasNative ('android' or 'ios'): the native code then
// runs on Capacitor's web stand-ins.
export type Platform = 'ios' | 'android' | 'web';

interface Bridge { isNativePlatform?: () => boolean; getPlatform?: () => string }

export function platform(): Platform {
  if (typeof window === 'undefined') return 'web';
  const w = window as unknown as { Capacitor?: Bridge; __atlasNative?: Platform };
  if (w.__atlasNative === 'ios' || w.__atlasNative === 'android') return w.__atlasNative;
  const c = w.Capacitor;
  if (!c?.isNativePlatform?.()) return 'web';
  const p = c.getPlatform?.();
  return p === 'ios' || p === 'android' ? p : 'web';
}

/** Inside the iOS or Android app. */
export const isNative = () => platform() !== 'web';

/**
 * A real app, with the phone's plugins behind the page. (The smoke test's pretend app is not: there the page's own
 * browser functions stay in place of the plugins, whose web stand-ins would call them back.)
 */
export const bridged = () => typeof window !== 'undefined' && !!(window as unknown as { Capacitor?: Bridge }).Capacitor?.isNativePlatform?.();
