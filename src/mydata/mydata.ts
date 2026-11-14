// Your own data on the map: each table read by parse.ts becomes a filter of its own (category "Your data"), kept
// in this browser (IndexedDB) and nowhere else. Countries are coloured by a number or a category; regions inside
// a country are filled the same way; points are drawn as dots, sized by a number or coloured by a category. A
// table with years shows one year at a time and can play them. Number columns by country are offered to Compare.
import { geoBounds, geoContains } from 'd3-geo';
import type { Topology } from 'topojson-specification';
import { numericLayer, categoricalLayer } from '../layers/choropleth';
import { SEQUENTIAL, categorical, samplePalette } from '../engine/colors';
import { fmtNumber, fmtCompact, lang } from '../app/i18n';
import { loadJSON, shapesFrom, type Shape } from '../data/store';
import { setExtraField } from '../compare/model';
import type { App } from '../app/app';
import type { LayerDef, LayerInstance, Legend, LegendAction, RenderCtx, InfoRow } from '../layers/types';
import type { Built, Geo, RegionMeta } from './parse';
import { regionId } from './parse';

/** A table kept on this device. */
export interface MySet {
  id: string; name: string; file: string; created: number;
  geo: Geo;
  columns: Built['columns'];
  years: number[];
  values: Built['values'];
  points: Built['points'];
  header: string[];
  labels: Record<string, string>;
  /** The colours for numbers (a palette of engine/colors' SEQUENTIAL) and how values are spread over them. */
  palette: string;
  scale: 'auto' | 'linear' | 'log' | 'quantile';
  /** What was found, for its card in the panel. */
  stats: { rows: number; matched: number; unmatched: string[]; groups: number; parts: string[] };
}

export const PALETTES = ['viridis', 'ylorrd', 'blues', 'greens', 'purples', 'magma', 'rdylgn', 'spectral', 'rdbu'];
const L = (en: string, es: string) => (lang() === 'es' ? es : en);

// ---- Storage (IndexedDB: tables can be large) -----------------------------------------------------
const DB = 'atlas-mydata', STORE = 'sets';
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => {
    const q = fn(d.transaction(STORE, mode).objectStore(STORE));
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}

// ---- Scales --------------------------------------------------------------------------------------
function pct(sorted: number[], q: number) { return sorted.length ? sorted[Math.max(0, Math.min(sorted.length - 1, Math.round(q * (sorted.length - 1))))] : 0; }
/** Skewed positive numbers (population, money) read best on a log scale. */
function autoScale(vals: number[]): 'log' | 'linear' {
  const s = vals.filter((v) => isFinite(v)).sort((a, b) => a - b);
  if (s.length < 4 || s[0] <= 0) return 'linear';
  return pct(s, 0.98) / Math.max(pct(s, 0.02), 1e-9) > 60 ? 'log' : 'linear';
}
const fmt = (v: number) => (Math.abs(v) >= 1e5 ? fmtCompact(v) : fmtNumber(v, Math.abs(v) < 10 && !Number.isInteger(v) ? 2 : Math.abs(v) < 100 && !Number.isInteger(v) ? 1 : 0));

/** Colours for a column of numbers: a function value → colour, and its legend. */
function numberScale(vals: number[], set: MySet) {
  const sorted = vals.filter((v) => isFinite(v)).sort((a, b) => a - b);
  const kind = set.scale === 'auto' ? autoScale(sorted) : set.scale;
  const stops = SEQUENTIAL[set.palette] ?? SEQUENTIAL.viridis;
  const lo = pct(sorted, 0.02), hi0 = pct(sorted, 0.98), hi = hi0 > lo ? hi0 : lo + 1;
  const norm = (v: number) => {
    if (kind === 'log' && lo > 0) return (Math.log(Math.max(v, 1e-9)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
    if (kind === 'quantile') { let a = 0, b = sorted.length - 1; while (a < b) { const m = (a + b) >> 1; if (sorted[m] < v) a = m + 1; else b = m; } return sorted.length > 1 ? a / (sorted.length - 1) : 0.5; }
    return (v - lo) / (hi - lo);
  };
  const mid = kind === 'quantile' ? pct(sorted, 0.5) : kind === 'log' && lo > 0 ? Math.sqrt(lo * hi) : (lo + hi) / 2;
  return { color: (v: number) => samplePalette(stops, Math.max(0, Math.min(1, norm(v)))), stops, lo, hi, mid, kind };
}
/** Colours for a column of words, the most common first. */
function categoryScale(vals: string[]) {
  const counts = new Map<string, number>();
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  const order = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
  const pal = categorical(order.length, 200);
  const colors = Object.fromEntries(order.map((k, i) => [k, pal[i]]));
  return { order, colors, counts };
}

// ---- The filter for a table ------------------------------------------------------------------------
interface RegionShape extends Shape<RegionMeta> { rid: string }
let regionShapes: Promise<RegionShape[]> | null = null;
function loadRegions(): Promise<RegionShape[]> {
  regionShapes ??= loadJSON<Topology>('base/admin1.json').then((topo) =>
    shapesFrom<RegionMeta>(topo, 'admin1').filter((s) => s.feature.properties.n).map((s) => ({ ...s, rid: regionId(s.feature.properties) })));
  return regionShapes;
}

export class MyData {
  sets: MySet[] = [];
  private playTimer = 0;

  constructor(private app: App) {}

  /** Loads the tables kept on this device and puts their filters in the list (a saved map turns them on again). */
  async init() {
    try { this.sets = (await tx<MySet[]>('readonly', (s) => s.getAll() as IDBRequest<MySet[]>)).sort((a, b) => a.created - b.created); } catch { this.sets = []; }
    this.app.register(this.sets.map((s) => this.layer(s)));
    for (const s of this.sets) this.offerToCompare(s);
  }

  /** Keeps a new table, adds its filter and turns it on. */
  async add(set: MySet) {
    try { await tx('readwrite', (s) => s.put(set)); } catch { /* private mode: kept until the page closes */ }
    this.sets = [...this.sets.filter((x) => x.id !== set.id), set];
    this.app.register([this.layer(set)]);
    this.offerToCompare(set);
    await this.app.activate(layerId(set));
  }

  /** Forgets a table (and turns its filter off). */
  async remove(id: string) {
    const set = this.sets.find((s) => s.id === id);
    if (!set) return;
    this.app.deactivate(layerId(set));
    try { await tx('readwrite', (s) => s.delete(id)); } catch { /* not kept anyway */ }
    this.sets = this.sets.filter((s) => s.id !== id);
    for (const c of set.columns) setExtraField(`my:${set.id}:${c.key}`, null);
    this.app.registry.delete(layerId(set));
    this.app.emit('registry');
  }

  /** Number columns by country (their latest year) can be A or B in Compare two filters. */
  private offerToCompare(set: MySet) {
    if (set.geo !== 'country') return;
    for (const c of set.columns) {
      if (c.kind !== 'number') continue;
      const byYear = set.values[c.key] ?? {};
      const y = set.years.length ? String(set.years[set.years.length - 1]) : '';
      const values = byYear[y] as Record<string, number> | undefined;
      if (!values || Object.keys(values).length < 10) continue;
      const label = set.columns.length > 1 ? `${set.name}: ${c.name}` : set.name;
      setExtraField(`my:${set.id}:${c.key}`, { field: { label_en: label, label_es: label, group: 'fun', type: 'number', ...(y ? { year: Number(y) } : {}) }, values });
    }
  }

  /** The filter that shows a table. */
  layer(set: MySet): LayerDef {
    const cols = set.columns;
    const options: LayerDef['options'] = [];
    if (cols.length > 1) options.push({ id: 'col', label: { en: 'Column', es: 'Columna' }, type: 'select', default: cols[0].key, choices: cols.map((c) => ({ value: c.key, label: { en: c.name, es: c.name } })) });
    if (set.years.length > 1) options.push({ id: 'year', label: { en: 'Year', es: 'Año' }, type: 'select', default: String(set.years[set.years.length - 1]), choices: [...set.years].reverse().map((y) => ({ value: String(y), label: { en: String(y), es: String(y) } })) });
    const colOf = (inst: LayerInstance) => cols.find((c) => c.key === inst.options.col) ?? cols[0];
    const yearOf = (inst: LayerInstance) => (set.years.length ? String(inst.options.year ?? set.years[set.years.length - 1]) : '');
    const valuesOf = (inst: LayerInstance) => set.values[colOf(inst)?.key ?? '']?.[yearOf(inst)] ?? {};
    const base = {
      id: layerId(set), category: 'mine' as const, icon: set.geo === 'points' ? '📍' : set.geo === 'region' ? '🗾' : '📊',
      name: { en: set.name, es: set.name },
      desc: { en: describe(set, 'en'), es: describe(set, 'es') },
      keywords: `my data your data mis datos tus datos csv ${set.file}`,
      credit: L('Your data', 'Tus datos'),
      options,
    };
    const actions = (inst: LayerInstance): LegendAction[] => set.years.length > 1 ? [{
      label: this.playTimer && this.playing === base.id ? L('⏸ Stop', '⏸ Detener') : L('▶ Play the years', '▶ Ver los años'),
      onClick: () => this.playYears(base.id, set, inst),
    }] : [];
    const withActions = (l: Legend | null, inst: LayerInstance): Legend | null => {
      if (!l) return l;
      const year = yearOf(inst);
      return { ...l, title: `${l.title ?? set.name}${year ? ` · ${year}` : ''}`, actions: [...(l.actions ?? []), ...actions(inst)] };
    };

    if (set.geo === 'country') {
      // One inner filter per column (a number or categories); the outer one hands each call to the column shown.
      const inner = new Map<string, LayerDef>();
      for (const c of cols) {
        const label = { en: c.name, es: c.name };
        if (c.kind === 'number') {
          const all = Object.values(set.values[c.key] ?? {}).flatMap((o) => Object.values(o) as number[]);
          inner.set(c.key, numericLayer({ ...base, label, values: (inst) => valuesOf(inst) as Record<string, number>, palette: SEQUENTIAL[set.palette] ?? SEQUENTIAL.viridis, scale: set.scale === 'auto' ? autoScale(all) : set.scale, format: fmt }));
        } else {
          const sc = categoryScale(Object.values(set.values[c.key] ?? {}).flatMap((o) => Object.values(o) as string[]));
          inner.set(c.key, categoricalLayer({ ...base, label, values: (inst) => valuesOf(inst) as Record<string, string>, categories: () => Object.fromEntries(sc.order.map((k) => [k, { en: k, es: k, color: sc.colors[k] }])), order: sc.order }));
        }
      }
      const pick = (inst: LayerInstance) => inner.get(colOf(inst).key)!;
      return {
        ...base, kind: 'fill', bakeable: true,
        countryColor: (id, inst, rc) => pick(inst).countryColor?.(id, inst, rc),
        legend: (inst, l) => withActions(pick(inst).legend?.(inst, l) ?? null, inst),
        info: (id, inst, l) => {
          const rows = pick(inst).info?.(id, inst, l) ?? null;
          const y = yearOf(inst);
          return rows && y ? rows.map((r) => ({ ...r, label: `${r.label} (${y})` })) : rows;
        },
        valueLabel: (id, inst) => pick(inst).valueLabel?.(id, inst) ?? null,
        onOptionsChanged: (inst) => { delete inst.state.cache; },
      };
    }

    // Regions and points: colours from the column shown.
    const scaleOf = (inst: LayerInstance) => {
      const key = `${colOf(inst)?.key}|${yearOf(inst)}`;
      let s = inst.state.scale as { key: string; color: (v: number | string) => string; legend: Legend } | undefined;
      if (s?.key === key) return s;
      const c = colOf(inst);
      const vals = Object.values(valuesOf(inst));
      if (!c) s = { key, color: () => '#4dabf7', legend: { kind: 'categories', title: set.name, items: [] } };
      else if (c.kind === 'number') {
        const n = numberScale(vals as number[], set);
        s = { key, color: (v) => n.color(v as number), legend: { kind: 'gradient', title: c.name, stops: n.stops, min: fmt(n.lo), max: fmt(n.hi), mid: fmt(n.mid) } };
      } else {
        const k = categoryScale(vals as string[]);
        s = { key, color: (v) => k.colors[v as string] ?? '#888', legend: { kind: 'categories', title: c.name, items: k.order.slice(0, 16).map((x) => ({ color: k.colors[x], label: `${x} (${k.counts.get(x)})` })) } };
      }
      inst.state.scale = s;
      return s;
    };

    if (set.geo === 'region') {
      let shapes: RegionShape[] = [];
      const wanted = new Set(Object.values(set.values).flatMap((byYear) => Object.values(byYear).flatMap((o) => Object.keys(o))));
      const regionAt = (lon: number, lat: number) => shapes.find((r) => {
        const [[w, s], [e, n]] = geoBounds(r.feature as never);
        if (lat < s || lat > n || (w <= e ? lon < w || lon > e : lon < w && lon > e)) return false;
        return geoContains(r.feature as never, [lon, lat]);
      }) ?? null;
      return {
        ...base, kind: 'fill', bakeable: true,
        load: async () => { shapes = (await loadRegions()).filter((r) => wanted.has(r.rid)); },
        drawFill(rc: RenderCtx, inst) {
          const sc = scaleOf(inst), vals = valuesOf(inst);
          const groups = new Map<string, RegionShape[]>();
          for (const r of rc.visibleShapes(shapes)) {
            const v = vals[r.rid];
            if (v === undefined) continue;
            const col = sc.color(v);
            let g = groups.get(col);
            if (!g) groups.set(col, (g = []));
            g.push(r);
          }
          for (const [col, list] of groups) {
            rc.ctx.beginPath();
            for (const r of list) rc.path(r.feature as never);
            rc.ctx.fillStyle = col;
            rc.ctx.fill();
          }
          rc.ctx.lineWidth = 0.6;
          rc.ctx.strokeStyle = rc.theme.dark ? 'rgba(255,255,255,0.35)' : 'rgba(20,20,30,0.3)';
          rc.ctx.beginPath();
          for (const r of rc.visibleShapes(shapes)) if (vals[r.rid] !== undefined) rc.path(r.feature as never);
          rc.ctx.stroke();
        },
        legend: (inst) => withActions(scaleOf(inst).legend, inst),
        pick: (lon, lat, inst) => {
          const r = regionAt(lon, lat);
          if (!r) return null;
          const v = valuesOf(inst)[r.rid];
          const p = r.feature.properties;
          const rows: InfoRow[] = [{ icon: '🗾', label: L('Region', 'Región'), value: (lang() === 'es' ? p.es : p.n) ?? p.n }];
          if (v !== undefined) rows.push({ label: `${colOf(inst).name}${yearOf(inst) ? ` (${yearOf(inst)})` : ''}`, value: typeof v === 'number' ? fmt(v) : v });
          return rows;
        },
        onOptionsChanged: (inst) => { delete inst.state.scale; },
      };
    }

    // Points.
    const sizeCol = cols.find((c) => c.kind === 'number');
    const sizeMax = (() => { const v = sizeCol ? Object.values(set.values[sizeCol.key]?.[''] ?? {}) as number[] : []; return v.length ? Math.max(...v.map(Math.abs)) : 0; })();
    const radius = (i: number) => {
      if (!sizeCol || !sizeMax) return 5;
      const v = set.values[sizeCol.key]?.['']?.[`p${i}`] as number | undefined;
      return v === undefined ? 3.5 : 3.5 + 13 * Math.sqrt(Math.abs(v) / sizeMax);
    };
    return {
      ...base, kind: 'overlay',
      drawOverlay(rc: RenderCtx, inst) {
        const c = colOf(inst), sc = scaleOf(inst), vals = valuesOf(inst);
        const { ctx } = rc;
        const order = set.points.map((p, i) => ({ p, i, r: radius(i) })).sort((a, b) => b.r - a.r);
        ctx.lineWidth = 1.2;
        for (const { p, i, r } of order) {
          const xy = rc.project(p.lon, p.lat);
          if (!xy) continue;
          const v = vals[`p${i}`];
          ctx.beginPath();
          ctx.arc(xy[0], xy[1], r, 0, Math.PI * 2);
          ctx.fillStyle = c?.kind === 'category' && v !== undefined ? sc.color(v) : c?.kind === 'number' && v !== undefined && c !== sizeCol ? sc.color(v) : 'rgba(255, 146, 43, 0.85)';
          ctx.globalAlpha = 0.85;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = rc.theme.dark ? 'rgba(255,255,255,0.85)' : 'rgba(20,20,30,0.7)';
          ctx.stroke();
        }
        // Names of the biggest (or, zoomed in, of all that fit).
        ctx.font = `600 ${11.5 * (rc.dpr ? 1 : 1)}px system-ui, sans-serif`;
        ctx.textBaseline = 'middle';
        const placed: [number, number, number, number][] = [];
        for (const { p, r } of order) {
          if (!p.label) continue;
          const xy = rc.project(p.lon, p.lat);
          if (!xy) continue;
          const w = ctx.measureText(p.label).width, x = xy[0] + r + 4, y = xy[1];
          if (placed.some((q) => x < q[2] && x + w > q[0] && y - 7 < q[3] && y + 7 > q[1])) continue;
          placed.push([x, y - 7, x + w, y + 7]);
          ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = rc.theme.dark ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.85)';
          ctx.strokeText(p.label, x, y);
          ctx.fillStyle = rc.theme.dark ? '#fff' : '#1b2333';
          ctx.fillText(p.label, x, y);
        }
      },
      legend: (inst) => {
        const c = colOf(inst);
        const lg = c?.kind === 'category' || (c?.kind === 'number' && c !== sizeCol) ? scaleOf(inst).legend : { kind: 'categories' as const, title: set.name, items: [{ color: 'rgba(255, 146, 43, 0.85)', shape: 'dot' as const, label: L(`${set.points.length} places`, `${set.points.length} lugares`) }] };
        return withActions({ ...lg, note: sizeCol ? L(`Size: ${sizeCol.name}`, `Tamaño: ${sizeCol.name}`) : undefined }, inst);
      },
      tap: (lon, lat, inst, ui) => {
        let best = -1, bd = 16;
        set.points.forEach((p, i) => {
          const xy = ui.project(p.lon, p.lat);
          if (!xy) return;
          const d = Math.hypot(xy[0] - ui.x, xy[1] - ui.y) - radius(i) + 4;
          if (d < bd) { bd = d; best = i; }
        });
        if (best < 0) return false;
        const p = set.points[best];
        const rows: InfoRow[] = set.header.map((name, j) => ({ label: name, value: p.row[j] ?? '' })).filter((r) => r.value !== '');
        ui.card('📍', p.label || `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`, set.name, rows);
        return true;
      },
      onOptionsChanged: (inst) => { delete inst.state.scale; },
    };
  }

  /** Plays a table's years on the map, about one a second (a second tap stops). */
  private playing = '';
  private playYears(id: string, set: MySet, inst: LayerInstance) {
    clearInterval(this.playTimer);
    if (this.playTimer && this.playing === id) { this.playTimer = 0; this.playing = ''; this.app.emit('layers'); return; }
    const years = set.years.map(String);
    let i = years.indexOf(String(inst.options.year));
    if (i < 0 || i === years.length - 1) i = -1;
    this.playing = id;
    const step = () => {
      if (!this.app.isActive(id)) { clearInterval(this.playTimer); this.playTimer = 0; return; }
      i++;
      if (i >= years.length) { clearInterval(this.playTimer); this.playTimer = 0; this.playing = ''; this.app.emit('layers'); return; }
      this.app.setOption(id, 'year', years[i]);
    };
    this.playTimer = window.setInterval(step, 1100);
    step();
  }
}

export const layerId = (s: MySet) => `my-${s.id}`;

/** One line about a table: what it covers and its years. */
export function describe(s: MySet, l: 'en' | 'es'): string {
  const es = l === 'es';
  const what = s.geo === 'points' ? (es ? `${s.stats.matched} lugares` : `${s.stats.matched} places`)
    : s.geo === 'region' ? (es ? `${s.stats.matched} regiones` : `${s.stats.matched} regions`)
    : (es ? `${s.stats.matched} países` : `${s.stats.matched} countries`);
  const years = s.years.length > 1 ? `, ${s.years[0]}–${s.years[s.years.length - 1]}` : s.years.length ? `, ${s.years[0]}` : '';
  return `${es ? 'Tus datos' : 'Your data'} (${s.file}): ${what}${years}.`;
}
