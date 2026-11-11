// "Atlas Scripts": small subsets of the Noto fonts for the scripts the stories show (cuneiform, Phoenician,
// N'Ko, Cherokee, Hangul...), built by scripts/data/build-fonts.mjs. Each file is registered with its
// unicode-range, so the browser fetches it only when one of its letters is on screen. Put the family first in a
// font stack: Latin text and emoji fall through to the fonts after it.
import { loadJSON, dataUrl } from '../data/store';

export const SCRIPT_FONT = '"Atlas Scripts"';
let registered: Promise<void> | null = null;

export function registerScriptFonts(): Promise<void> {
  registered ??= (async () => {
    if (typeof FontFace === 'undefined' || !document.fonts) return;
    try {
      const m = await loadJSON<{ fonts: { file: string; range: string }[] }>('fonts/fonts.json');
      for (const f of m.fonts) {
        document.fonts.add(new FontFace('Atlas Scripts', `url(${dataUrl(`fonts/${f.file}`)}) format('woff2')`, { unicodeRange: f.range, display: 'swap' }));
      }
    } catch { /* offline before the first visit: the system's fonts */ }
  })();
  return registered;
}

/** Loads the faces some text needs. The map's canvas doesn't start a font download itself, so a story asks
 *  for its markers' letters and draws again once they are in. True when a face was loaded. */
export async function loadGlyphs(text: string): Promise<boolean> {
  await registerScriptFonts();
  if (!text || typeof document === 'undefined' || !document.fonts) return false;
  try { return (await document.fonts.load(`16px ${SCRIPT_FONT}`, text)).length > 0; } catch { return false; }
}

/** Mongolian and ʼPhags-pa are written in columns, top to bottom. */
export const isVertical = (text: string) => /[᠀-᢯ꡀ-꡿]/u.test(text);
