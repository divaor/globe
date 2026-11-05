// Helpers that turn "a value per country" into a complete filter (colours, legend, card rows).
// Most data filters are one call to numericLayer() or categoricalLayer().
import { categorical, samplePalette } from '../engine/colors';
import { fmtCompact, fmtNumber, t, tx } from '../app/i18n';
import { LC } from './context';
import type { CategoryId, I18nText, LayerDef, Legend, LegendItem, LayerOptionDef, LayerInstance } from './types';

interface Common {
  id: string;
  category: CategoryId;
  icon: string;
  name: I18nText;
  desc: I18nText;
  keywords?: string;
  credit?: string;
  /** Loads whatever the values need (called once when the filter is first turned on). */
  load?: () => Promise<void>;
  options?: LayerOptionDef[];
  note?: I18nText;
  defaultOpacity?: number;
}

export interface NumericSpec extends Common {
  values: (inst: LayerInstance) => Record<string, number | null | undefined>;
  palette: string[];
  scale?: 'log' | 'linear' | 'quantile' | 'sqrt';
  unit?: I18nText;
  format?: (v: number) => string;
  /** Fixed domain instead of the 2nd–98th percentile. */
  domain?: [number, number];
  label?: I18nText; // label of the value in the country card (default: name)
}

export interface CategoryInfo { en: string; es: string; color?: string; icon?: string }

export interface CategoricalSpec extends Common {
  values: (inst: LayerInstance) => Record<string, string | string[] | null | undefined>;
  categories: (inst: LayerInstance) => Record<string, CategoryInfo>;
  /** Fixed legend order; otherwise by number of countries. */
  order?: string[];
  maxLegend?: number;
  label?: I18nText;
  /** Join several values in the card (lists like languages). */
  listInCard?: boolean;
}

const optKey = (inst: LayerInstance) => JSON.stringify(inst.options);

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const i = Math.max(0, Math.min(sorted.length - 1, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

export function numericLayer(spec: NumericSpec): LayerDef {
  type Cache = { key: string; vals: Record<string, number>; lo: number; hi: number; sorted: number[] };
  const cache = (inst: LayerInstance): Cache => {
    const key = optKey(inst);
    let c = inst.state.cache as Cache | undefined;
    if (c && c.key === key) return c;
    const raw = spec.values(inst);
    const vals: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && isFinite(v) && (spec.scale !== 'log' || v > 0)) vals[k] = v;
    const sorted = Object.values(vals).sort((a, b) => a - b);
    const lo = spec.domain ? spec.domain[0] : quantile(sorted, 0.02);
    const hi = spec.domain ? spec.domain[1] : quantile(sorted, 0.98);
    c = { key, vals, lo, hi: hi > lo ? hi : lo + 1, sorted };
    inst.state.cache = c;
    return c;
  };
  const norm = (c: Cache, v: number) => {
    switch (spec.scale) {
      case 'log': return (Math.log(Math.max(v, 1e-9)) - Math.log(Math.max(c.lo, 1e-9))) / (Math.log(c.hi) - Math.log(Math.max(c.lo, 1e-9)));
      case 'sqrt': return (Math.sqrt(Math.max(0, v)) - Math.sqrt(Math.max(0, c.lo))) / (Math.sqrt(c.hi) - Math.sqrt(Math.max(0, c.lo)));
      case 'quantile': {
        let lo = 0, hi = c.sorted.length - 1;
        while (lo < hi) { const m = (lo + hi) >> 1; if (c.sorted[m] < v) lo = m + 1; else hi = m; }
        return c.sorted.length > 1 ? lo / (c.sorted.length - 1) : 0.5;
      }
      default: return (v - c.lo) / (c.hi - c.lo);
    }
  };
  const fmt = (v: number) => (spec.format ? spec.format(v) : Math.abs(v) >= 1e5 ? fmtCompact(v) : fmtNumber(v, Math.abs(v) < 10 ? 1 : 0));
  return {
    id: spec.id, category: spec.category, icon: spec.icon, name: spec.name, desc: spec.desc,
    keywords: spec.keywords, credit: spec.credit, kind: 'fill', options: spec.options,
    defaultOpacity: spec.defaultOpacity,
    load: spec.load ? async () => { await spec.load!(); } : undefined,
    countryColor(id, inst) {
      const c = cache(inst);
      const v = c.vals[id] ?? (LC.data.meta[id]?.iso ? c.vals[LC.data.meta[id].iso!] : undefined);
      if (v === undefined) return null;
      return samplePalette(spec.palette, Math.max(0, Math.min(1, norm(c, v))));
    },
    legend(inst): Legend {
      const c = cache(inst);
      const unit = spec.unit ? ` ${tx(spec.unit)}` : '';
      const mid = spec.scale === 'quantile' ? quantile(c.sorted, 0.5) : spec.scale === 'log' ? Math.sqrt(c.lo * c.hi) : (c.lo + c.hi) / 2;
      return {
        kind: 'gradient', title: tx(spec.label ?? spec.name), stops: spec.palette,
        min: fmt(c.lo) + unit, max: fmt(c.hi) + unit, mid: fmt(mid), note: spec.note ? tx(spec.note) : undefined,
      };
    },
    info(id, inst) {
      const c = cache(inst);
      const v = c.vals[id];
      return [{ label: tx(spec.label ?? spec.name), value: v === undefined ? t('noData') : fmt(v) + (spec.unit ? ` ${tx(spec.unit)}` : '') }];
    },
    onOptionsChanged(inst) { delete inst.state.cache; },
  };
}

export function categoricalLayer(spec: CategoricalSpec): LayerDef {
  type Cache = { key: string; vals: Record<string, string[]>; colors: Record<string, string>; counts: Map<string, number> };
  const cache = (inst: LayerInstance): Cache => {
    const key = optKey(inst);
    let c = inst.state.cache as Cache | undefined;
    if (c && c.key === key) return c;
    const raw = spec.values(inst);
    const cats = spec.categories(inst);
    const vals: Record<string, string[]> = {};
    const counts = new Map<string, number>();
    for (const [k, v] of Object.entries(raw)) {
      if (v === null || v === undefined || v === '') continue;
      const list = (Array.isArray(v) ? v : [v]).filter((x) => x !== null && x !== undefined && x !== '').map(String);
      if (!list.length) continue;
      vals[k] = list;
      counts.set(list[0], (counts.get(list[0]) ?? 0) + 1);
    }
    const order = spec.order ?? [...counts.keys()].sort((a, b) => (counts.get(b)! - counts.get(a)!));
    const auto = categorical(order.length, 18);
    const colors: Record<string, string> = {};
    order.forEach((k, i) => { colors[k] = cats[k]?.color ?? auto[i]; });
    for (const k of counts.keys()) if (!colors[k]) colors[k] = cats[k]?.color ?? '#999999';
    c = { key, vals, colors, counts };
    inst.state.cache = c;
    return c;
  };
  const labelOf = (inst: LayerInstance, k: string) => {
    const info = spec.categories(inst)[k];
    return info ? tx(info) : k;
  };
  return {
    id: spec.id, category: spec.category, icon: spec.icon, name: spec.name, desc: spec.desc,
    keywords: spec.keywords, credit: spec.credit, kind: 'fill', options: spec.options,
    defaultOpacity: spec.defaultOpacity,
    load: spec.load ? async () => { await spec.load!(); } : undefined,
    countryColor(id, inst) {
      const c = cache(inst);
      const v = c.vals[id] ?? (LC.data.meta[id]?.iso ? c.vals[LC.data.meta[id].iso!] : undefined);
      return v ? c.colors[v[0]] : null;
    },
    legend(inst): Legend {
      const c = cache(inst);
      const cats = spec.categories(inst);
      const keys = (spec.order ?? [...c.counts.keys()].sort((a, b) => c.counts.get(b)! - c.counts.get(a)!)).filter((k) => c.counts.has(k));
      const max = spec.maxLegend ?? 14;
      const items: LegendItem[] = keys.slice(0, max).map((k) => ({
        color: c.colors[k], label: labelOf(inst, k), icon: cats[k]?.icon,
        ids: Object.keys(c.vals).filter((id) => c.vals[id][0] === k),
      }));
      const rest = keys.length - items.length;
      return {
        kind: 'categories', title: tx(spec.label ?? spec.name), items,
        note: [rest > 0 ? (LC.lang() === 'es' ? `+${rest} más` : `+${rest} more`) : '', spec.note ? tx(spec.note) : ''].filter(Boolean).join(' · ') || undefined,
      };
    },
    info(id, inst) {
      const c = cache(inst);
      const v = c.vals[id];
      if (!v) return [{ label: tx(spec.label ?? spec.name), value: t('noData') }];
      const cats = spec.categories(inst);
      const shown = spec.listInCard ? v : v.slice(0, 1);
      return [{ label: tx(spec.label ?? spec.name), value: shown.map((k) => `${cats[k]?.icon ? cats[k].icon + ' ' : ''}${labelOf(inst, k)}`).join(', ') }];
    },
    onOptionsChanged(inst) { delete inst.state.cache; },
  };
}
