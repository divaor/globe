// How well a name matches what was typed in a search box (v0.29.0). Accents and case are ignored, the words can come
// in any order ("Nadal Rafael"), each may be the start of a word ("rafa nadal") and a longer one may have a typo or
// two ("rafael nadl", "Pikaso"). Scores keep the old scale: 100 the whole name, 80 its start, 75 the words together
// inside it, about 60 every word found by its start, under 50 with typos, 30 anywhere inside the name. No browser code: scripts/test/search.mjs
// checks it with Node.

/** Lower case, without accents. */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SPLIT = /[\s,.;:/\-–—'’()"&]+/;

const cache = new Map<string, { n: string; w: string[] }>();
function prep(name: string) {
  let c = cache.get(name);
  if (!c) {
    const n = fold(name).trim();
    c = { n, w: n.split(SPLIT).filter(Boolean) };
    if (cache.size > 120000) cache.clear();
    cache.set(name, c);
  }
  return c;
}

/** Edits (a letter changed, added, dropped, or two swapped) from a to b; more than max returns max + 1. */
export function editDistance(a: string, b: string, max: number): number {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev2: number[] = [], prev = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < low) low = v;
    }
    if (low > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[lb];
}

/** One typed word against one word of a name: 10 the same, 8 its start, 5 the word with a typo, 4 its start with a typo. */
export function wordScore(t: string, w: string): number {
  if (w === t) return 10;
  if (w.startsWith(t)) return t.length >= 2 ? 8 : 6;
  if (t.length >= 4 && t[0] === w[0] || t.length >= 5) {
    // Two typos only between long words ("pikaso", "picasso"); one from four letters.
    const k = t.length >= 6 && w.length >= 6 ? 2 : t.length >= 4 ? 1 : 0;
    if (!k) return 0;
    if (Math.abs(w.length - t.length) <= k && editDistance(t, w, k) <= k) return 5;
    // The start of a longer word with a typo, from six letters typed ("velasq": Velázquez).
    if (t.length >= 6 && w.length > t.length && editDistance(t, w.slice(0, t.length), k) <= k) return 4;
  }
  return 0;
}

/** A scorer for what was typed: name → 0 (no match) to 100. */
export function matcher(raw: string): (name: string | null | undefined) => number {
  const q = fold(raw).trim();
  const words = q.split(SPLIT).filter(Boolean);
  return (name) => {
    if (!name || !q) return 0;
    const { n, w } = prep(name);
    if (n === q) return 100;
    if (n.startsWith(q)) return 80;
    // The words typed, together, inside the name ("sagrada familia" in "Templo Expiatorio de la Sagrada Familia").
    if (words.length > 1 && ` ${w.join(' ')} `.includes(` ${words.join(' ')} `)) return 75;
    // Every typed word matches a different word of the name, in any order.
    if (words.length && w.length >= words.length) {
      const used: number[] = [];
      let total = 0, inOrder = true, last = -1;
      for (const t of words) {
        let best = 0, at = -1;
        for (let i = 0; i < w.length; i++) {
          if (used.includes(i)) continue;
          const s = wordScore(t, w[i]);
          if (s > best) { best = s; at = i; if (s === 10) break; }
        }
        if (!best) { total = 0; break; }
        used.push(at);
        if (at < last) inOrder = false;
        last = at;
        total += best;
      }
      if (total) return Math.round(30 + (total / words.length) * 3.5 + (inOrder ? 3 : 0) - Math.min(6, (w.length - words.length) * 0.5));
    }
    if (q.length >= 3 && n.includes(q)) return 30;
    return 0;
  };
}

/** "40.4, -3.7", "40.4 -3.7", "40°24′N 3°42′W": [lat, lon], or null. */
export function parseCoords(q: string): [number, number] | null {
  const s = q.trim().replace(/,/g, ' ').replace(/\s+/g, ' ');
  const dec = /^(-?\d{1,2}(?:\.\d+)?)\s*°?\s*([NS])?\s+(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([EWO])?$/i.exec(s);
  const dms = /^(\d{1,2})°\s*(\d{1,2})?['′]?\s*(\d{1,2}(?:\.\d+)?)?["″]?\s*([NS])\s+(\d{1,3})°\s*(\d{1,2})?['′]?\s*(\d{1,2}(?:\.\d+)?)?["″]?\s*([EWO])$/i.exec(s);
  let lat: number, lon: number;
  if (dec) {
    lat = Number(dec[1]) * (/s/i.test(dec[2] ?? '') ? -1 : 1);
    lon = Number(dec[3]) * (/[wo]/i.test(dec[4] ?? '') ? -1 : 1);
  } else if (dms) {
    lat = (Number(dms[1]) + Number(dms[2] ?? 0) / 60 + Number(dms[3] ?? 0) / 3600) * (/s/i.test(dms[4]) ? -1 : 1);
    lon = (Number(dms[5]) + Number(dms[6] ?? 0) / 60 + Number(dms[7] ?? 0) / 3600) * (/[wo]/i.test(dms[8]) ? -1 : 1);
  } else return null;
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(Number.isInteger(lat) && Number.isInteger(lon) && !/[.°NSEWO]/i.test(s)) ? [lat, lon] : null;
}

export function fmtCoords([lat, lon]: [number, number]): string {
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
}
