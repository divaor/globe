// The apps' small rules, kept apart from the native plugins so Node can test them (scripts/test/native.mjs).

/**
 * The part of a link to the website that says where to go: "#war=ww2&step=3" from
 * https://<site>/globe/#war=ww2&step=3 (the same hash the website reads at start).
 */
export function hashOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hash && u.hash.length > 1 ? u.hash : null;
  } catch { return null; }
}

/** Another site (or mail, a phone number), not the app's own pages: opened in the phone's browser. */
export function isOutside(href: string, base: string): boolean {
  try {
    const u = new URL(href, base);
    if (/^(mailto|tel|sms):$/.test(u.protocol)) return true;
    return /^https?:$/.test(u.protocol) && u.origin !== new URL(base).origin;
  } catch { return false; }
}

/** A file name the phone accepts (no slashes or odd characters). */
export const safeName = (name: string) => (name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/^\.+/, '').slice(0, 120) || 'atlas');

/** FNV-1a, 64 bits as two halves: a short, stable file name for a saved tile's address. */
export function tileFile(url: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ url.length;
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x0100019d) >>> 0;
  }
  return `tiles/${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}.bin`;
}
