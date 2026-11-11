// Small statistics for comparing two filters: ranks, correlation (Spearman's rho and Pearson's r),
// a least-squares line, cut points into thirds, how likely a link is to be chance, and Cramér's V
// for two sets of categories. Pure functions, no DOM.

/** Ranks from 1 (smallest), ties sharing their average rank. */
export function ranks(v: number[]): number[] {
  const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(v.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

/** Pearson's correlation coefficient (NaN with fewer than 3 points or no spread). */
export function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return NaN;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
}

/** Spearman's rank correlation: Pearson's r on the ranks, so skewed data and outliers weigh less. */
export function spearman(x: number[], y: number[]): number {
  return pearson(ranks(x), ranks(y));
}

/** The least-squares line y = a + b·x. */
export function linreg(x: number[], y: number[]): { a: number; b: number } {
  const n = x.length;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const b = sxx ? sxy / sxx : 0;
  return { a: my - b * mx, b };
}

/** The value at quantile q (0–1) of an ascending list, interpolated. */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const p = (sorted.length - 1) * Math.max(0, Math.min(1, q));
  const i = Math.floor(p), f = p - i;
  return i + 1 < sorted.length ? sorted[i] + (sorted[i + 1] - sorted[i]) * f : sorted[i];
}

/** The median of a list (any order). */
export function median(v: number[]): number {
  return quantile([...v].sort((a, b) => a - b), 0.5);
}

/**
 * Splits values into thirds: 0 (low), 1 (middle), 2 (high), cut at the values a third and two
 * thirds of the way up. Tied values stay together, so a third can hold more or fewer countries.
 * When both cuts fall on one value (most countries vote at 18), the thirds become below it, at it
 * and above it (`tie`).
 */
export function thirds(values: number[]): { cls: number[]; cuts: [number, number]; tie: boolean } {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  const lo = s[Math.min(n - 1, Math.floor(n / 3))] ?? 0;
  const hi = s[Math.min(n - 1, Math.floor((2 * n) / 3))] ?? 0;
  const tie = lo === hi;
  const cls = values.map((v) => (tie ? (v < lo ? 0 : v === lo ? 1 : 2) : v < lo ? 0 : v < hi ? 1 : 2));
  return { cls, cuts: [lo, hi], tie };
}

/** Standard normal cumulative distribution (Abramowitz and Stegun 26.2.17, error below 1e-7). */
function phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

/**
 * The chance of a correlation at least this strong if the two had nothing to do with each other
 * (two-sided p-value, from the t statistic with a normal approximation, fine above ~30 countries).
 */
export function pValue(r: number, n: number): number {
  if (!isFinite(r) || n < 4) return 1;
  if (Math.abs(r) >= 1) return 0;
  const t = r * Math.sqrt((n - 2) / (1 - r * r));
  return 2 * (1 - phi(Math.abs(t)));
}

/** How strong a correlation is, in words: by the size of |r|. */
export type Strength = 'none' | 'weak' | 'moderate' | 'strong' | 'veryStrong';
export function strength(r: number): Strength {
  const a = Math.abs(r);
  return a < 0.1 ? 'none' : a < 0.3 ? 'weak' : a < 0.5 ? 'moderate' : a < 0.7 ? 'strong' : 'veryStrong';
}

/**
 * Cramér's V: how linked two sets of categories are, from 0 (independent) to 1 (one tells the
 * other), from the chi-squared statistic of their cross table.
 */
export function cramersV(table: number[][]): number {
  const rows = table.length, cols = table[0]?.length ?? 0;
  if (rows < 2 || cols < 2) return NaN;
  const rs = table.map((r) => r.reduce((a, b) => a + b, 0));
  const cs = table[0].map((_, j) => table.reduce((a, r) => a + r[j], 0));
  const n = rs.reduce((a, b) => a + b, 0);
  if (!n) return NaN;
  let chi = 0;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const e = (rs[i] * cs[j]) / n;
    if (e > 0) chi += (table[i][j] - e) ** 2 / e;
  }
  return Math.sqrt(chi / n / Math.max(1, Math.min(rows - 1, cols - 1)));
}
