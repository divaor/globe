// Colour helpers: OKLCH (perceptual) to sRGB, palettes, and the political map colouring.

export function oklch(L: number, C: number, hDeg: number, alpha = 1): string {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const gam = (x: number) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(0, x), 1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(1, v)) * 255);
  };
  if (alpha < 1) return `rgba(${gam(r)},${gam(g)},${gam(bb)},${alpha})`;
  return '#' + [gam(r), gam(g), gam(bb)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

export function withAlpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function mix(c1: string, c2: string, t: number): string {
  const a = hexToRgb(c1), b = hexToRgb(c2);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/** Small deterministic hash in [0, 1) for jittering colours per id. */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

// --- Political map ---------------------------------------------------------------------------
// Each continent has its own hue family; Natural Earth's MAPCOLOR9 (1-9, chosen so that
// neighbours differ) picks the shade inside the family, plus a tiny per-country jitter so that
// every country is unique.
export const CONTINENT_HUES: Record<string, { hue: number; chroma: number; name: string }> = {
  EU: { hue: 252, chroma: 0.13, name: 'Europe' },
  AS: { hue: 86, chroma: 0.15, name: 'Asia' },
  AF: { hue: 42, chroma: 0.15, name: 'Africa' },
  NA: { hue: 302, chroma: 0.13, name: 'North America' },
  SA: { hue: 352, chroma: 0.15, name: 'South America' },
  OC: { hue: 152, chroma: 0.13, name: 'Oceania' },
  AN: { hue: 225, chroma: 0.025, name: 'Antarctica' },
  SS: { hue: 195, chroma: 0.09, name: 'Seven seas' },
};

const SHADES = [
  { l: 0.80, h: -9, c: 0.92 }, { l: 0.66, h: 7, c: 1.1 }, { l: 0.74, h: 13, c: 0.95 },
  { l: 0.61, h: -4, c: 1.05 }, { l: 0.85, h: 3, c: 0.75 }, { l: 0.70, h: -13, c: 1.0 },
  { l: 0.64, h: 11, c: 1.15 }, { l: 0.78, h: -6, c: 0.85 }, { l: 0.69, h: 0, c: 1.0 },
];

export function politicalColor(continent: string, mapcolor: number, id: string, dark: boolean): string {
  const fam = CONTINENT_HUES[continent] ?? CONTINENT_HUES.SS;
  const s = SHADES[((mapcolor || 1) - 1) % SHADES.length];
  const j = hash01(id) - 0.5;
  const L = (continent === 'AN' ? 0.93 : s.l + j * 0.035) * (dark ? 0.96 : 1);
  const C = fam.chroma * s.c;
  return oklch(Math.min(0.95, L), C, fam.hue + s.h + j * 6);
}

export function continentSwatch(continent: string): string {
  const fam = CONTINENT_HUES[continent] ?? CONTINENT_HUES.SS;
  return oklch(continent === 'AN' ? 0.92 : 0.72, fam.chroma * 1.05, fam.hue);
}

/** Categorical palette for an arbitrary number of classes (well separated hues, alternating lightness). */
export function categorical(n: number, offset = 0): string[] {
  const out: string[] = [];
  const golden = 137.508;
  for (let i = 0; i < n; i++) {
    const h = (offset + i * golden) % 360;
    const L = [0.72, 0.62, 0.8, 0.67][i % 4];
    out.push(oklch(L, 0.14, h));
  }
  return out;
}

/** Sequential palettes as colour stops (0..1). */
export const SEQUENTIAL: Record<string, string[]> = {
  viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
  magma: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'],
  inferno: ['#000004', '#420a68', '#932667', '#dd513a', '#fca50a', '#fcffa4'],
  plasma: ['#0d0887', '#6a00a8', '#b12a90', '#e16462', '#fca636', '#f0f921'],
  cividis: ['#00224e', '#35456c', '#666970', '#948e77', '#c8b866', '#fee838'],
  turbo: ['#30123b', '#4662d7', '#36aaf9', '#1ae4b6', '#72fe5e', '#c8ef34', '#faba39', '#f66b19', '#ca2a04', '#7a0403'],
  greens: ['#f7fcf5', '#c7e9c0', '#74c476', '#238b45', '#00441b'],
  blues: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b'],
  oranges: ['#fff5eb', '#fdd0a2', '#fd8d3c', '#d94801', '#7f2704'],
  reds: ['#fff5f0', '#fcbba1', '#fb6a4a', '#cb181d', '#67000d'],
  purples: ['#fcfbfd', '#dadaeb', '#9e9ac8', '#6a51a3', '#3f007d'],
  ylgnbu: ['#ffffd9', '#c7e9b4', '#41b6c4', '#225ea8', '#081d58'],
  ylorrd: ['#ffffcc', '#fed976', '#fd8d3c', '#e31a1c', '#800026'],
  rdylgn: ['#a50026', '#f46d43', '#fee08b', '#d9ef8b', '#66bd63', '#006837'],
  spectral: ['#9e0142', '#f46d43', '#fee08b', '#e6f598', '#66c2a5', '#5e4fa2'],
  rdbu: ['#67001f', '#d6604d', '#fddbc7', '#d1e5f0', '#4393c3', '#053061'],
  thermal: ['#042333', '#2c3395', '#744992', '#b15f82', '#eb7958', '#fbb43d', '#e8fa5b'],
  earth: ['#1a3a5c', '#2f6f8f', '#7fb7a4', '#e9d8a6', '#c97b47', '#8a3b2e'],
};

export function samplePalette(stops: string[], t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[i], stops[i + 1], x - i);
}

export function paletteStops(stops: string[]): [number, string][] {
  return stops.map((c, i) => [i / (stops.length - 1), c]);
}
