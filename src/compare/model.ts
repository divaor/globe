// The data behind Compare two filters: which country facts can be compared, their values, and the
// analysis of a pair: two numbers (thirds, correlation, trend, exceptions), a category with a number
// (each group's median), two categories (a cross table), or a ratio of two totals.
import { loadJSON } from '../data/store';
import { both, tx } from '../app/i18n';
import { CURATED, P } from '../layers/factsCurated';
import { categorical } from '../engine/colors';
import { spearman, pearson, linreg, thirds, pValue, cramersV, median, quantile, ranks } from './stats';
import type { CategoryId, I18nText } from '../layers/types';

export interface Field {
  label_en: string; label_es: string; group: string; type: 'number' | 'category' | 'list' | 'boolean' | 'text';
  unit?: string; unit_es?: string; year?: number; scale?: 'linear' | 'log'; higherIs?: string; measure?: 'total';
  categories?: Record<string, { en: string; es: string; emoji?: string; color?: string }>;
}
export interface Dataset { fields: Record<string, Field>; data: Record<string, Record<string, unknown>> }

let DS: Dataset | null = null;
let loading: Promise<Dataset> | null = null;
/** The country facts (public/data/attributes/countries.json), loaded once. */
export function loadFacts(): Promise<Dataset> {
  loading ??= loadJSON<Dataset>('attributes/countries.json').then((d) => (DS = d));
  return loading;
}
export const facts = () => DS;

// ---- What can be compared ------------------------------------------------------------------------
/** Number fields left out: Europe-only VAT, a share that is not a filter, the capital's clock. */
const NUM_EXCLUDE = new Set(['vat_rate', 'religion_pct', 'utc_offset']);
/** Category fields worth comparing: few categories, most countries, a meaning beyond trivia. */
const CAT_FIELDS = ['continent', 'income_group', 'religion', 'language_family', 'government_type', 'main_power_source', 'landlocked', 'monarchy', 'federal',
  'driving_side', 'un_member', 'independent', 'compulsory_voting', 'space_agency', 'daylight_saving', 'clock_format', 'mains_voltage', 'speed_unit'];
const GROUP_CAT: Record<string, CategoryId> = { people: 'people', economy: 'economy', culture: 'culture', geography: 'political', politics: 'political', nature: 'nature', energy: 'economy', fun: 'fun' };
const TOPICS: CategoryId[] = ['people', 'economy', 'political', 'nature', 'climate', 'flora', 'culture', 'fun'];
/** A field needs this many countries with a value to be offered. */
const MIN_COUNTRIES = 25;

export interface Choice { key: string; kind: 'num' | 'cat'; name: I18nText; icon: string; topic: CategoryId }

export function fieldName(key: string): I18nText {
  const f = DS?.fields[key];
  return f ? { en: f.label_en, es: f.label_es } : { en: key, es: key };
}
export const fieldIcon = (key: string) => CURATED[key]?.icon ?? (key === 'continent' ? '🌍' : '📊');
export const isNum = (key: string) => DS?.fields[key]?.type === 'number';

/** Every field that can be A or B, by topic (numbers first in each). */
export function choices(): Choice[] {
  if (!DS) return [];
  const count = (k: string) => Object.values(DS!.data).filter((d) => d[k] !== undefined && d[k] !== null && d[k] !== '').length;
  const out: Choice[] = [];
  for (const [key, f] of Object.entries(DS.fields)) {
    const num = f.type === 'number' && !NUM_EXCLUDE.has(key);
    const cat = CAT_FIELDS.includes(key) && (f.type === 'category' || f.type === 'boolean');
    if ((!num && !cat) || count(key) < MIN_COUNTRIES) continue;
    out.push({ key, kind: num ? 'num' : 'cat', name: fieldName(key), icon: fieldIcon(key), topic: CURATED[key]?.cat ?? GROUP_CAT[f.group] ?? 'fun' });
  }
  const topic = (c: Choice) => TOPICS.indexOf(c.topic) < 0 ? 99 : TOPICS.indexOf(c.topic);
  return out.sort((a, b) => topic(a) - topic(b) || (a.kind === b.kind ? 0 : a.kind === 'num' ? -1 : 1) || tx(a.name).localeCompare(tx(b.name)));
}
export const topicName = (c: CategoryId) => both(`cat.${c}`);

// ---- Values ----------------------------------------------------------------------------------------
/** A country's facts by ISO code; map shapes of territories carry their ISO code in `iso`. */
export function row(iso: string): Record<string, unknown> | undefined { return DS?.data[iso]; }

export function num(key: string, iso: string): number | undefined {
  const v = DS?.data[iso]?.[key];
  return typeof v === 'number' && isFinite(v) ? v : undefined;
}

export function cat(key: string, iso: string): string | undefined {
  const v = DS?.data[iso]?.[key];
  if (v === true) return 'yes';
  if (v === false) return 'no';
  if (Array.isArray(v)) return v.length ? String(v[0]) : undefined;
  return typeof v === 'string' && v ? v : undefined;
}

/** A category's name and colour (booleans are Yes and No). */
export function catLabel(key: string, k: string): I18nText {
  if (k === OTHER) return { en: 'Other', es: 'Otros' };
  const f = DS?.fields[key];
  if (f?.type === 'boolean') return k === 'yes' ? { en: 'Yes', es: 'Sí' } : { en: 'No', es: 'No' };
  const c = f?.categories?.[k];
  return c ? { en: `${c.emoji ? c.emoji + ' ' : ''}${c.en}`, es: `${c.emoji ? c.emoji + ' ' : ''}${c.es}` } : { en: k, es: k };
}

const OTHER = '_other';
/** Up to this many categories keep their own colour and row; the rest are "Other". */
const MAX_CATS = 7;

/** A category field's categories in use: by count, the smallest grouped as "Other", each with a colour. */
export function catGroups(key: string, isos: string[]): { keys: string[]; of: (iso: string) => string | undefined; color: (k: string) => string } {
  const counts = new Map<string, number>();
  for (const iso of isos) { const c = cat(key, iso); if (c) counts.set(c, (counts.get(c) ?? 0) + 1); }
  const cur = CURATED[key];
  let keys = cur?.order?.filter((k) => counts.has(k)) ?? [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)!);
  for (const k of counts.keys()) if (!keys.includes(k)) keys.push(k);
  const keep = new Set(keys.length > MAX_CATS + 1 ? keys.slice(0, MAX_CATS) : keys);
  if (keep.size < keys.length) keys = [...keep, OTHER];
  const auto = categorical(keys.length, 18);
  const f = DS?.fields[key];
  const colors = new Map(keys.map((k, i) => [k, k === OTHER ? '#adb5bd' : cur?.colors?.[k] ?? f?.categories?.[k]?.color ?? (f?.type === 'boolean' ? (k === 'yes' ? '#51cf66' : '#868e96') : auto[i])]));
  return {
    keys,
    of: (iso) => { const c = cat(key, iso); return c === undefined ? undefined : keep.has(c) ? c : OTHER; },
    color: (k) => colors.get(k) ?? '#adb5bd',
  };
}

// ---- Scales for charts -----------------------------------------------------------------------------
/** How an axis is drawn: plain, logarithmic, or logarithmic of 1 + v (when zeros must show too). */
export type Transform = 'lin' | 'log' | 'log1p';
export function transformOf(key: string, values: number[]): Transform {
  if (DS?.fields[key]?.scale !== 'log' || !values.length) return 'lin';
  const min = Math.min(...values);
  return min > 0 ? 'log' : min === 0 ? 'log1p' : 'lin';
}
export const fwd = (t: Transform, v: number) => (t === 'log' ? Math.log10(v) : t === 'log1p' ? Math.log10(1 + v) : v);

// ---- Ratios ----------------------------------------------------------------------------------------
/** What a total can be divided by, with readable steps ("per million people"). */
const DENOMS: Record<string, { f: number; per: I18nText }[]> = {
  population: [
    { f: 1, per: { en: 'per person', es: 'por persona' } },
    { f: 1e3, per: { en: 'per 1,000 people', es: 'por cada 1000 personas' } },
    { f: 1e6, per: { en: 'per million people', es: 'por millón de personas' } },
  ],
  area_km2: [
    { f: 1, per: { en: 'per km²', es: 'por km²' } },
    { f: 1e3, per: { en: 'per 1,000 km²', es: 'por cada 1000 km²' } },
    { f: 1e6, per: { en: 'per million km²', es: 'por millón de km²' } },
  ],
  gdp_usd: [
    { f: 1e6, per: { en: 'per million US$ of GDP', es: 'por millón de US$ del PIB' } },
    { f: 1e9, per: { en: 'per billion US$ of GDP', es: 'por cada mil millones de US$ del PIB' } },
  ],
};
/** Totals that make no sense on top of a ratio (area per person is one over density). */
const NOT_NUMERATOR = new Set(['population', 'area_km2']);
/** Ratios that are already filters of their own. */
const SAME_AS: Record<string, string> = { 'gdp_usd/population': 'gdp_per_capita', 'co2_mt/population': 'co2_per_capita', 'population/area_km2': 'pop_density' };

export type RatioCheck = { ok: true; num: string; den: string } | { ok: false; same?: string };
/** Whether "A per B" (or "B per A") is a meaningful ratio: a total divided by people, area or GDP. */
export function ratioPair(a: string, b: string): RatioCheck {
  const F = DS?.fields ?? {};
  for (const [n, d] of [[a, b], [b, a]]) {
    if (SAME_AS[`${n}/${d}`]) return { ok: false, same: SAME_AS[`${n}/${d}`] };
  }
  for (const [n, d] of [[a, b], [b, a]]) {
    if (n !== d && F[n]?.measure === 'total' && !NOT_NUMERATOR.has(n) && DENOMS[d]) return { ok: true, num: n, den: d };
  }
  return { ok: false };
}

// ---- Analyses --------------------------------------------------------------------------------------
export interface Pt { iso: string; x: number; y: number }
export interface NumNum {
  kind: 'nn'; a: string; b: string; pts: Pt[]; n: number;
  tx: Transform; ty: Transform;
  /** Spearman's rho, Pearson's r on the drawn scales, and the chance of a rho this strong by luck. */
  rho: number; r: number; p: number;
  /** The trend line on the drawn scales: fwd(ty, y) = a + b · fwd(tx, x). */
  line: { a: number; b: number };
  thA: ReturnType<typeof thirds>; thB: ReturnType<typeof thirds>;
  /** The square of the 3 × 3 grid of each country: A's third + 3 × B's third. */
  cell: Map<string, number>;
  /** The countries (over a million people) furthest from the trend. */
  exceptions: string[];
}
export interface Group { k: string; isos: string[]; vals: number[]; median: number }
export interface CatNum {
  kind: 'cn'; a: string; b: string; catKey: string; numKey: string; n: number;
  groups: Group[]; color: (k: string) => string; groupOf: (iso: string) => string | undefined;
  /** Share of the ranks' spread between the groups (eta squared on ranks, 0–1). */
  eta2: number; tnum: Transform;
}
export interface CatCat {
  kind: 'cc'; a: string; b: string; n: number;
  rows: string[]; cols: string[]; table: number[][]; isos: string[][][];
  /** Cramér's V (0–1). */
  V: number;
  rowColor: (k: string) => string; rowOf: (iso: string) => string | undefined; colOf: (iso: string) => string | undefined;
}
export interface Ratio {
  kind: 'ratio'; a: string; b: string; num: string; den: string; factor: number; per: I18nText;
  vals: Map<string, number>; sorted: number[]; rank: Map<string, number>; n: number;
  log: boolean; lo: number; hi: number; palette: string[];
}
export type Analysis = NumNum | CatNum | CatCat | Ratio;

let cache: { key: string; an: Analysis | null } | null = null;

/** The analysis of A and B ("both": the pair as it is; "ratio": A per B, when it makes sense). */
export function analyse(a: string, b: string, view: string): Analysis | null {
  const key = `${a}|${b}|${view}`;
  if (cache?.key === key) return cache.an;
  const an = DS && a && b && a !== b && DS.fields[a] && DS.fields[b] ? compute(a, b, view) : null;
  cache = { key, an };
  return an;
}

function compute(a: string, b: string, view: string): Analysis | null {
  const isos = Object.keys(DS!.data);
  if (view === 'ratio') {
    const rp = ratioPair(a, b);
    if (rp.ok) return ratio(a, b, rp.num, rp.den, isos);
  }
  const na = isNum(a), nb = isNum(b);
  if (na && nb) return numNum(a, b, isos);
  if (na !== nb) return catNum(a, b, na ? b : a, na ? a : b, isos);
  return catCat(a, b, isos);
}

function numNum(a: string, b: string, isos: string[]): NumNum | null {
  const pts: Pt[] = [];
  for (const iso of isos) {
    const x = num(a, iso), y = num(b, iso);
    if (x !== undefined && y !== undefined) pts.push({ iso, x, y });
  }
  if (pts.length < 10) return null;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const tx = transformOf(a, xs), ty = transformOf(b, ys);
  const X = xs.map((v) => fwd(tx, v)), Y = ys.map((v) => fwd(ty, v));
  const rho = spearman(xs, ys), r = pearson(X, Y);
  const thA = thirds(xs), thB = thirds(ys);
  const cell = new Map(pts.map((p, i) => [p.iso, thA.cls[i] + 3 * thB.cls[i]]));
  // Exceptions: furthest from the trend, measured in standard deviations on the drawn scales.
  const sd = (v: number[]) => { const m = v.reduce((s, x) => s + x, 0) / v.length; return [m, Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length) || 1] as const; };
  const [mx, sx] = sd(X), [my, sy] = sd(Y);
  const rr = isFinite(r) ? r : 0;
  const big = pts.map((p, i) => ({ iso: p.iso, res: Math.abs((Y[i] - my) / sy - rr * ((X[i] - mx) / sx)), pop: num('population', p.iso) ?? 0 }))
    .filter((e) => e.pop >= 1e6).sort((p, q) => q.res - p.res);
  return { kind: 'nn', a, b, pts, n: pts.length, tx, ty, rho, r, p: pValue(rho, pts.length), line: linreg(X, Y), thA, thB, cell, exceptions: big.slice(0, 3).map((e) => e.iso) };
}

function catNum(a: string, b: string, catKey: string, numKey: string, isos: string[]): CatNum | null {
  const have = isos.filter((iso) => cat(catKey, iso) !== undefined && num(numKey, iso) !== undefined);
  if (have.length < 10) return null;
  const g = catGroups(catKey, have);
  const all = have.map((iso) => num(numKey, iso)!);
  const rk = ranks(all);
  const meanRank = (have.length + 1) / 2;
  let ssb = 0, sst = 0;
  const groups: Group[] = g.keys.map((k) => ({ k, isos: [], vals: [], median: NaN }));
  have.forEach((iso, i) => {
    const grp = groups.find((x) => x.k === g.of(iso))!;
    grp.isos.push(iso); grp.vals.push(all[i]);
    sst += (rk[i] - meanRank) ** 2;
  });
  for (const grp of groups) {
    grp.median = median(grp.vals);
    const mr = grp.isos.reduce((s, iso) => s + rk[have.indexOf(iso)], 0) / (grp.isos.length || 1);
    ssb += grp.isos.length * (mr - meanRank) ** 2;
  }
  const kept = groups.filter((x) => x.isos.length);
  kept.sort((p, q) => q.median - p.median);
  return { kind: 'cn', a, b, catKey, numKey, n: have.length, groups: kept, color: g.color, groupOf: g.of, eta2: sst ? ssb / sst : 0, tnum: transformOf(numKey, all) };
}

function catCat(a: string, b: string, isos: string[]): CatCat | null {
  const have = isos.filter((iso) => cat(a, iso) !== undefined && cat(b, iso) !== undefined);
  if (have.length < 10) return null;
  const ga = catGroups(a, have), gb = catGroups(b, have);
  const table = ga.keys.map(() => gb.keys.map(() => 0));
  const lists = ga.keys.map(() => gb.keys.map(() => [] as string[]));
  for (const iso of have) {
    const i = ga.keys.indexOf(ga.of(iso)!), j = gb.keys.indexOf(gb.of(iso)!);
    table[i][j]++; lists[i][j].push(iso);
  }
  return { kind: 'cc', a, b, n: have.length, rows: ga.keys, cols: gb.keys, table, isos: lists, V: cramersV(table), rowColor: ga.color, rowOf: ga.of, colOf: gb.of };
}

function ratio(a: string, b: string, numKey: string, den: string, isos: string[]): Ratio | null {
  const raw = new Map<string, number>();
  for (const iso of isos) {
    const n = num(numKey, iso), d = num(den, iso);
    if (n !== undefined && d !== undefined && d > 0) raw.set(iso, n / d);
  }
  if (raw.size < 10) return null;
  const mid = median([...raw.values()]);
  const steps = DENOMS[den];
  const step = steps.find((s) => mid * s.f >= 1) ?? steps[steps.length - 1];
  const vals = new Map([...raw].map(([k, v]) => [k, v * step.f]));
  const sorted = [...vals.values()].sort((x, y) => x - y);
  const order = [...vals].sort((x, y) => y[1] - x[1]);
  const rank = new Map(order.map(([k], i) => [k, i + 1]));
  const lo = quantile(sorted, 0.02), hi = quantile(sorted, 0.98);
  // Spread over more than two orders of magnitude: colour on a log scale (zeros take the lowest colour).
  const pos = sorted.filter((v) => v > 0);
  const log = pos.length > 5 && quantile(pos, 0.98) / Math.max(quantile(pos, 0.02), 1e-12) > 100;
  return {
    kind: 'ratio', a, b, num: numKey, den, factor: step.f, per: step.per, vals, sorted, rank, n: vals.size,
    log, lo: log ? Math.max(quantile(pos, 0.02), 1e-12) : lo, hi: log ? quantile(pos, 0.98) : hi > lo ? hi : lo + 1,
    palette: CURATED[numKey]?.palette ?? P.viridis,
  };
}

/** The rank of a country for a number field, 1 = highest, among the countries with a value. */
const rankCache = new Map<string, { rank: Map<string, number>; n: number }>();
export function rankOf(key: string, iso: string): { r: number; n: number } | null {
  let c = rankCache.get(key);
  if (!c && DS) {
    const list = Object.keys(DS.data).map((k) => [k, num(key, k)] as const).filter((e): e is readonly [string, number] => e[1] !== undefined).sort((p, q) => q[1] - p[1]);
    // Tied values share the better rank.
    const rank = new Map<string, number>();
    list.forEach(([k, v], i) => rank.set(k, i > 0 && list[i - 1][1] === v ? rank.get(list[i - 1][0])! : i + 1));
    c = { rank, n: list.length };
    rankCache.set(key, c);
  }
  const r = c?.rank.get(iso);
  return c && r ? { r, n: c.n } : null;
}
