// Country facts (public/data/attributes/countries.json): every field in the manifest becomes a
// filter automatically, so adding a field to the dataset adds a filter. Curated settings below
// give the important ones better icons, palettes and categories; a few get special filters.
import { SEQUENTIAL, categorical } from '../../engine/colors';
import { loadJSON, dataUrl } from '../../data/store';
import { lang, fmtNumber, fmtCompact, fmtMoney, tx, t } from '../../app/i18n';
import { categoricalLayer, numericLayer, type CategoryInfo } from '../choropleth';
import { LC } from '../context';
import type { App } from '../../app/app';
import type { Shell } from '../../ui/shell';
import type { CategoryId, InfoRow, LayerDef, LayerInstance, RenderCtx } from '../types';

interface Field {
  label_en: string; label_es: string; group: string; type: 'number' | 'category' | 'list' | 'boolean' | 'text';
  unit?: string; unit_es?: string; year?: number; scale?: 'linear' | 'log'; higherIs?: 'good' | 'bad' | 'neutral';
  categories?: Record<string, CategoryInfo & { emoji?: string; color?: string }>; source?: string; license?: string; note?: string;
}
interface Dataset { fields: Record<string, Field>; data: Record<string, Record<string, unknown>> }
interface Mineral { en: string; es: string; emoji: string; unit: string; unit_es?: string; year: number; source: string; producers: [string, number][] }

let DS: Dataset = { fields: {}, data: {} };
let MINERALS: Record<string, Mineral> = {};

const GROUP_CAT: Record<string, CategoryId> = {
  people: 'people', economy: 'economy', culture: 'culture', geography: 'political', politics: 'political',
  nature: 'nature', energy: 'economy', fun: 'fun',
};

interface Curated { icon?: string; cat?: CategoryId; palette?: string[]; scale?: 'log' | 'linear' | 'quantile' | 'sqrt'; colors?: Record<string, string>; order?: string[]; skip?: boolean; keywords?: string }
const P = SEQUENTIAL;
const CURATED: Record<string, Curated> = {
  population: { icon: '👥', palette: P.ylorrd }, pop_density: { icon: '🏙️', palette: P.magma.slice(1) }, median_age: { icon: '🎂', palette: P.viridis },
  life_expectancy: { icon: '❤️', palette: P.rdylgn }, fertility_rate: { icon: '👶', palette: P.purples }, urban_pct: { icon: '🌆', palette: P.blues },
  literacy_pct: { icon: '📚', palette: P.ylgnbu }, obesity_pct: { icon: '🍔', palette: P.oranges }, alcohol_litres: { icon: '🍷', palette: P.purples },
  tobacco_pct: { icon: '🚬', palette: P.reds }, internet_users_pct: { icon: '🌐', palette: P.ylgnbu }, mobile_per_100: { icon: '📱', palette: P.blues },
  hdi: { icon: '📈', palette: P.rdylgn }, happiness: { icon: '😊', palette: P.spectral.slice().reverse() },
  gdp_ppp_per_capita: { icon: '💵', palette: P.viridis }, gini: { icon: '⚖️', palette: P.ylorrd }, unemployment_pct: { icon: '🧑‍💼', palette: P.oranges },
  gdp_usd: { icon: '🏦', palette: P.cividis }, gdp_per_capita: { icon: '💰', palette: P.viridis, keywords: 'rich poor wealth riqueza' },
  income_group: { icon: '💼', order: ['high', 'upper-middle', 'lower-middle', 'low'], colors: { high: '#1a9850', 'upper-middle': '#a6d96a', 'lower-middle': '#fdae61', low: '#d73027' } },
  currency: { icon: '💱' }, vat_rate: { skip: true }, top_export: { icon: '📦' }, top_export_partner: { icon: '🤝' }, unesco_sites: { icon: '🏛️', palette: P.ylorrd },
  languages: { skip: true }, language_family: { skip: true }, language_branch: { skip: true }, start_of_week: { icon: '📅' },
  measurement_system: { icon: '📏', colors: { metric: '#4dabf7', imperial: '#ff6b6b', mixed: '#ffd43b' } }, clock_format: { icon: '🕐' },
  religion: { icon: '🛐' }, religion_pct: { skip: true }, national_colors: { skip: true }, continent: { skip: true }, subregion: { icon: '🧭' },
  area_km2: { icon: '📐', palette: P.ylgnbu }, landlocked: { icon: '🏜️', colors: { yes: '#e8590c', no: '#74c0fc' } }, borders: { skip: true },
  neighbours_count: { icon: '🫂', palette: P.plasma }, coastline_km: { icon: '🏖️', cat: 'nature', palette: P.blues }, mean_elevation_m: { icon: '⛰️', cat: 'nature', palette: P.earth },
  agricultural_land_pct: { icon: '🌾', cat: 'nature', palette: P.greens }, highest_point_m: { icon: '🏔️', cat: 'nature', palette: P.earth }, lowest_point_m: { icon: '⬇️', cat: 'nature', palette: P.blues.slice().reverse() },
  utc_offset: { skip: true }, daylight_saving: { icon: '☀️', colors: { yes: '#fab005', no: '#868e96' } }, avg_temperature: { icon: '🌡️', cat: 'climate', palette: P.thermal },
  un_member: { icon: '🇺🇳', colors: { yes: '#4dabf7', no: '#ff8787' } }, independent: { icon: '🗽', colors: { yes: '#51cf66', no: '#ffa94d' } }, dependency_of: { icon: '🔗' },
  military_spending_pct: { icon: '🛡️', palette: P.reds }, voting_age: { icon: '🗳️', palette: P.plasma }, compulsory_voting: { icon: '🗳️', colors: { yes: '#7950f2', no: '#adb5bd' } },
  government_type: { icon: '🏛️' }, monarchy: { icon: '👑', colors: { yes: '#f59f00', no: '#74c0fc' } }, federal: { icon: '🧩', colors: { yes: '#12b886', no: '#adb5bd' } },
  independence_year: { icon: '🎆', palette: P.turbo }, independence_from: { icon: '🕊️' }, organizations: { skip: true },
  nuclear_weapons: { icon: '☢️', colors: { declared: '#fa5252', undeclared: '#ff922b' } },
  forest_pct: { icon: '🌲', cat: 'flora', palette: P.greens }, national_animal: { skip: true }, national_plant: { icon: '🌸', cat: 'flora' }, natural_resources: { skip: true },
  electricity_access_pct: { icon: '💡', palette: P.ylgnbu }, oil_production: { icon: '🛢️', palette: P.oranges }, gas_production: { icon: '🔥', palette: P.oranges },
  coal_production: { icon: '⛏️', palette: P.purples }, nuclear_reactors: { icon: '⚛️', palette: P.purples }, co2_per_capita: { icon: '🏭', palette: P.reds },
  co2_mt: { icon: '🌫️', palette: P.reds }, renewables_share_elec: { icon: '♻️', palette: P.greens }, low_carbon_share_elec: { icon: '🍃', palette: P.greens },
  nuclear_share_elec: { icon: '⚛️', palette: P.purples }, energy_per_capita: { icon: '⚡', palette: P.ylorrd }, electricity_per_capita: { icon: '🔌', palette: P.ylorrd },
  main_power_source: { icon: '🏭', colors: { coal: '#495057', gas: '#ff922b', oil: '#8d5524', nuclear: '#9775fa', hydro: '#4dabf7', wind: '#38d9a9', solar: '#ffd43b', bioenergy: '#69db7c', other: '#ced4da' } },
  airports: { icon: '✈️', palette: P.blues }, railways_km: { icon: '🚆', palette: P.purples }, space_agency: { icon: '🚀', colors: { yes: '#7950f2', no: '#495057' } },
  space_launch_site: { icon: '🛰️', colors: { yes: '#f06595', no: '#495057' } }, height_male_cm: { icon: '🧍‍♂️', palette: P.viridis }, height_female_cm: { icon: '🧍‍♀️', palette: P.viridis },
  calling_zone: { icon: '☎️' }, paper_size: { icon: '📄', colors: { a4: '#4dabf7', 'us-letter': '#ff6b6b' } }, driving_side: { icon: '🚗', colors: { left: '#e64980', right: '#228be6' }, keywords: 'drive car road left right conducir coche' },
  speed_unit: { icon: '🚦', colors: { kmh: '#20c997', mph: '#fd7e14' } }, world_cup_titles: { icon: '⚽', palette: P.ylorrd }, womens_world_cup_titles: { icon: '⚽', palette: P.purples },
  olympic_medals: { icon: '🏅', palette: P.ylorrd }, olympic_golds: { icon: '🥇', palette: P.ylorrd },
};

const es = () => lang() === 'es';
const unitOf = (f: Field) => (es() ? f.unit_es ?? f.unit : f.unit) ?? '';
const credit = (f: Field) => `${f.source ?? ''}${f.license ? ` (${f.license})` : ''}`;
const values = (key: string) => () => Object.fromEntries(Object.entries(DS.data).map(([id, d]) => [id, d[key] as never]));

function fieldLayer(key: string, f: Field): LayerDef | null {
  const c = CURATED[key] ?? {};
  if (c.skip || f.type === 'text') return null;
  const base = {
    id: `fact-${key}`, category: c.cat ?? GROUP_CAT[f.group] ?? 'fun', icon: c.icon ?? '📊',
    name: { en: f.label_en, es: f.label_es },
    desc: { en: `${f.label_en}${f.year ? ` (${f.year})` : ''}.${f.unit ? ` In ${f.unit}.` : ''}`, es: `${f.label_es}${f.year ? ` (${f.year})` : ''}.${f.unit_es ?? f.unit ? ` En ${f.unit_es ?? f.unit}.` : ''}` },
    keywords: `${key.replace(/_/g, ' ')} ${c.keywords ?? ''}`, credit: credit(f),
    note: f.note ? { en: f.note, es: f.note } : undefined,
  };
  if (f.type === 'number') {
    const unit = { en: f.unit ?? '', es: f.unit_es ?? f.unit ?? '' };
    const big = (v: number) => (Math.abs(v) >= 1e5 ? fmtCompact(v) : fmtNumber(v, Math.abs(v) < 10 && !Number.isInteger(v) ? 1 : 0));
    return numericLayer({
      ...base, note: undefined, values: values(key), palette: c.palette ?? (f.higherIs === 'bad' ? P.ylorrd : f.higherIs === 'good' ? P.viridis : P.plasma),
      scale: c.scale ?? (f.scale === 'log' ? 'log' : 'linear'), unit: unit.en.length < 22 ? unit : undefined, format: big,
      label: { en: f.label_en, es: f.label_es },
    });
  }
  if (f.type === 'boolean') {
    return categoricalLayer({
      ...base, values: () => Object.fromEntries(Object.entries(DS.data).map(([id, d]) => [id, d[key] === true ? 'yes' : d[key] === false ? 'no' : null])),
      categories: () => ({ yes: { en: 'Yes', es: 'Sí', color: c.colors?.yes ?? '#51cf66' }, no: { en: 'No', es: 'No', color: c.colors?.no ?? '#868e96' } }),
      order: ['yes', 'no'],
    });
  }
  const cats = () => Object.fromEntries(Object.entries(f.categories ?? {}).map(([k, v]) => [k, { ...v, color: c.colors?.[k] ?? v.color, icon: v.emoji ?? v.icon }]));
  return categoricalLayer({ ...base, values: values(key), categories: cats, order: c.order, listInCard: f.type === 'list' });
}

// ---- Special filters -------------------------------------------------------------------------
function languagesLayer(): LayerDef {
  const view = (inst: LayerInstance) => String(inst.options.view ?? 'main');
  const field = (inst: LayerInstance) => (view(inst) === 'family' ? 'language_family' : view(inst) === 'branch' ? 'language_branch' : 'languages');
  return categoricalLayer({
    id: 'languages', category: 'culture', icon: '🗣️',
    name: { en: 'Languages', es: 'Idiomas' },
    desc: { en: 'Main language, language families and branches of every country.', es: 'Lengua principal, familias y ramas lingüísticas de cada país.' },
    keywords: 'language spoken official family idioma lengua familia',
    credit: credit(DS.fields.languages ?? ({} as Field)),
    options: [{ id: 'view', type: 'select', label: { en: 'Show', es: 'Mostrar' }, default: 'main', choices: [
      { value: 'main', label: { en: 'Main language', es: 'Lengua principal' } },
      { value: 'family', label: { en: 'Language family', es: 'Familia lingüística' } },
      { value: 'branch', label: { en: 'Branch', es: 'Rama' } }] }],
    values: (inst) => {
      const k = field(inst);
      return Object.fromEntries(Object.entries(DS.data).map(([id, d]) => [id, k === 'languages' ? ((d.languages as string[]) ?? []).slice(0, 1) : (d[k] as string)]));
    },
    categories: (inst) => DS.fields[field(inst)]?.categories ?? {},
    label: { en: 'Language', es: 'Idioma' },
  });
}

function pickerLayer(o: { id: string; field: string; icon: string; cat: CategoryId; name: { en: string; es: string }; desc: { en: string; es: string }; keywords: string; color: string }): LayerDef {
  const f = DS.fields[o.field];
  const cats = f?.categories ?? {};
  const counts = new Map<string, number>();
  for (const d of Object.values(DS.data)) for (const v of (d[o.field] as string[] | undefined) ?? []) counts.set(v, (counts.get(v) ?? 0) + 1);
  const keys = Object.keys(cats).sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  return categoricalLayer({
    id: o.id, category: o.cat, icon: o.icon, name: o.name, desc: o.desc, keywords: o.keywords, credit: f ? credit(f) : '',
    options: [{ id: 'pick', type: 'select', label: { en: 'Choose', es: 'Elige' }, default: keys[0] ?? '', choices: keys.map((k) => ({ value: k, label: { en: cats[k].en, es: cats[k].es } })) }],
    values: (inst) => Object.fromEntries(Object.entries(DS.data).map(([id, d]) => [id, ((d[o.field] as string[]) ?? []).includes(String(inst.options.pick)) ? 'yes' : null])),
    categories: (inst) => ({ yes: { en: cats[String(inst.options.pick)]?.en ?? '', es: cats[String(inst.options.pick)]?.es ?? '', color: o.color } }),
  });
}

function mineralsLayer(): LayerDef {
  const keys = Object.keys(MINERALS);
  const PAL: Record<string, string[]> = {
    oil: P.oranges, 'natural-gas': P.oranges, coal: P.purples, gold: ['#fff9db', '#ffe066', '#fab005', '#e67700'], silver: ['#f8f9fa', '#ced4da', '#868e96', '#343a40'],
    copper: ['#fff4e6', '#ffa94d', '#d9480f', '#7f2704'], lithium: ['#e3fafc', '#66d9e8', '#1098ad', '#0b7285'], diamonds: ['#f3f0ff', '#b197fc', '#7048e8', '#5f3dc4'],
  };
  const share = (inst: LayerInstance) => {
    const m = MINERALS[String(inst.options.res)];
    return m ? Object.fromEntries(m.producers.map(([id, pct]) => [id, pct])) : {};
  };
  const base = numericLayer({
    id: 'resources', category: 'economy', icon: '⛏️',
    name: { en: 'Natural resources: top producers', es: 'Recursos naturales: mayores productores' },
    desc: { en: 'Who produces the world’s oil, gas, coal, gold, lithium, cobalt, rare earths, diamonds and more.', es: 'Quién produce el petróleo, gas, carbón, oro, litio, cobalto, tierras raras, diamantes y más del mundo.' },
    keywords: 'resources minerals mining oil gold lithium cobalt recursos minerales mineria petroleo oro litio',
    credit: 'Our World in Data (energy) and USGS Mineral Commodity Summaries (approximate shares)',
    options: [{ id: 'res', type: 'select', label: { en: 'Resource', es: 'Recurso' }, default: keys.includes('lithium') ? 'lithium' : keys[0], choices: keys.map((k) => ({ value: k, icon: MINERALS[k].emoji, label: { en: MINERALS[k].en, es: MINERALS[k].es } })) }],
    values: share, palette: P.ylorrd, scale: 'sqrt', domain: [0, 40],
    format: (v) => `${fmtNumber(v, v < 10 ? 1 : 0)}%`, label: { en: 'Share of world production', es: 'Parte de la producción mundial' },
  });
  return {
    ...base,
    countryColor(id, inst, rc) {
      const pal = PAL[String(inst.options.res)];
      if (!pal) return base.countryColor!(id, inst, rc);
      const v = share(inst)[id];
      if (v === undefined) return null;
      const t = Math.min(1, Math.sqrt(v / 40));
      return pal[Math.min(pal.length - 1, Math.round(t * (pal.length - 1)))];
    },
    labels(rc: RenderCtx, inst: LayerInstance) {
      const m = MINERALS[String(inst.options.res)];
      if (!m) return;
      for (const [id, pct] of m.producers.slice(0, 8)) {
        const meta = LC.data.meta[id];
        if (!meta) continue;
        const p = rc.project(meta.lx, meta.ly);
        if (p) rc.labels.add({ text: `${m.emoji} ${fmtNumber(pct, pct < 10 ? 1 : 0)}%`, x: p[0], y: p[1] + 16, priority: 980 + pct, size: 12.5, weight: 800, color: rc.theme.label, halo: rc.theme.labelHalo });
      }
    },
    legend(inst) {
      const m = MINERALS[String(inst.options.res)];
      const lg = base.legend!(inst, lang());
      if (lg && m) {
        const top = m.producers.slice(0, 5).map(([id, p]) => `${LC.data.name(id, lang())} ${fmtNumber(p, p < 10 ? 1 : 0)}%`).join(' · ');
        return { ...lg, title: `${m.emoji} ${es() ? m.es : m.en} (${m.year})`, note: `${es() ? 'Mayores productores' : 'Top producers'}: ${top}` };
      }
      return lg;
    },
  };
}

function nationalAnimals(): LayerDef {
  const f = DS.fields.national_animal;
  const cats = f?.categories ?? {};
  const layer = categoricalLayer({
    id: 'national-animals', category: 'fauna', icon: '🦁',
    name: { en: 'National animals', es: 'Animales nacionales' },
    desc: { en: 'The national animal of each country, shown with its emoji.', es: 'El animal nacional de cada país, con su emoji.' },
    keywords: 'national animal symbol eagle lion animal nacional simbolo aguila leon',
    credit: f ? credit(f) : '', values: values('national_animal'), categories: () => Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, { ...v, icon: v.emoji }])),
    maxLegend: 12,
  });
  return {
    ...layer,
    labels(rc: RenderCtx) {
      for (const [id, d] of Object.entries(DS.data)) {
        const k = d.national_animal as string | undefined;
        const emoji = k ? cats[k]?.emoji : undefined;
        if (!emoji) continue;
        const ids = LC.data.meta[id] ? [id] : Object.keys(LC.data.meta).filter((x) => LC.data.meta[x].iso === id);
        for (const nid of ids.slice(0, 1)) {
          const m = LC.data.meta[nid];
          if (!m || rc.webZoom < m.ml - 1.5) continue;
          const p = rc.project(m.lx, m.ly);
          if (p) rc.labels.add({ text: emoji, x: p[0], y: p[1] - 14, priority: 990 - m.lr * 10, size: 18, weight: 400, color: '#000', halo: 'rgba(255,255,255,0.0)' });
        }
      }
    },
  };
}

// Flags drawn inside the countries (pre-rendered once per flag).
const flagCache = new Map<string, HTMLCanvasElement | null>();
function flagImage(a2: string, requestRender: () => void): HTMLCanvasElement | null {
  if (flagCache.has(a2)) return flagCache.get(a2)!;
  flagCache.set(a2, null);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = 160; c.height = 120;
    c.getContext('2d')!.drawImage(img, 0, 0, 160, 120);
    flagCache.set(a2, c);
    requestRender();
  };
  img.src = dataUrl(`../flags/${a2.toLowerCase()}.svg`);
  return null;
}

const flagsLayer: LayerDef = {
  id: 'flags', category: 'fun', icon: '🏳️', kind: 'fill',
  name: { en: 'Flags on the map', es: 'Banderas en el mapa' },
  desc: { en: 'Every country painted with its own flag.', es: 'Cada país pintado con su propia bandera.' },
  keywords: 'flag flags bandera banderas',
  credit: 'flag-icons by Panayiotis Lipiridis (MIT)',
  drawFill(rc) {
    const { ctx, path } = rc;
    for (const s of rc.visibleShapes(rc.level.countries)) {
      const m = LC.data.meta[s.id];
      if (!m?.a2) continue;
      const img = flagImage(m.a2, () => LC.requestRender());
      const b = path.bounds(s.feature as never);
      const w = b[1][0] - b[0][0], h = b[1][1] - b[0][1];
      if (!isFinite(w) || w < 2 || h < 2 || w > rc.view.w * 3) continue;
      ctx.save();
      ctx.beginPath(); path(s.feature as never); ctx.clip();
      if (img) {
        // Cover the country's box keeping the flag's aspect ratio.
        const k = Math.max(w / 4, h / 3);
        ctx.drawImage(img, b[0][0] + w / 2 - 2 * k, b[0][1] + h / 2 - 1.5 * k, 4 * k, 3 * k);
      } else { ctx.fillStyle = rc.theme.land; ctx.fill(); }
      ctx.restore();
    }
  },
};

function nationalColours(): LayerDef {
  const f = DS.fields.national_colors;
  const cats = f?.categories ?? {};
  return {
    id: 'national-colours', category: 'culture', icon: '🎨', kind: 'fill',
    name: { en: 'National colours', es: 'Colores nacionales' },
    desc: { en: 'Each country striped with its national colours.', es: 'Cada país a rayas con sus colores nacionales.' },
    keywords: 'colours colors flag colores bandera',
    credit: f ? credit(f) : '',
    drawFill(rc) {
      const { ctx, path } = rc;
      for (const s of rc.visibleShapes(rc.level.countries)) {
        const d = DS.data[s.id] ?? DS.data[LC.data.meta[s.id]?.iso ?? ''];
        const cols = ((d?.national_colors as string[]) ?? []).map((k) => cats[k]?.color).filter(Boolean) as string[];
        if (!cols.length) continue;
        const b = path.bounds(s.feature as never);
        const w = b[1][0] - b[0][0];
        if (!isFinite(w) || w < 1) continue;
        ctx.save(); ctx.beginPath(); path(s.feature as never); ctx.clip();
        cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(b[0][0] + (w * i) / cols.length, b[0][1], w / cols.length + 1, b[1][1] - b[0][1]); });
        ctx.restore();
      }
    },
    legend() {
      return { kind: 'categories', title: es() ? 'Colores' : 'Colours', items: Object.values(cats).slice(0, 12).map((c) => ({ color: c.color ?? '#999', label: tx(c) })) };
    },
  };
}

// ---- Country card rows -----------------------------------------------------------------------
function cardRows(id: string): InfoRow[] {
  const iso = LC.data.meta[id]?.iso;
  const d = DS.data[id] ?? (iso ? DS.data[iso] : undefined);
  if (!d) return [];
  const f = DS.fields;
  const cat = (k: string, v: unknown) => (typeof v === 'string' && f[k]?.categories?.[v] ? tx(f[k].categories![v]) : String(v));
  const rows: InfoRow[] = [];
  const add = (icon: string, k: string, value: string | undefined | null) => { if (value) rows.push({ icon, label: es() ? f[k]?.label_es ?? k : f[k]?.label_en ?? k, value }); };
  const meta = LC.data.meta[id];
  const pop = typeof d.population === 'number' ? d.population : meta?.pop;
  if (pop) rows.push({ icon: '👥', label: t('population'), value: fmtCompact(pop) });
  if (typeof d.gdp_per_capita === 'number') rows.push({ icon: '💰', label: t('gdpPerCapita'), value: fmtMoney(d.gdp_per_capita) });
  add('🗣️', 'languages', ((d.languages as string[]) ?? []).slice(0, 3).map((x) => cat('languages', x)).join(', '));
  add('💱', 'currency', ((d.currency as string[]) ?? []).map((x) => cat('currency', x)).join(', '));
  add('📐', 'area_km2', typeof d.area_km2 === 'number' ? `${fmtNumber(d.area_km2)} km²` : null);
  add('❤️', 'life_expectancy', typeof d.life_expectancy === 'number' ? `${fmtNumber(d.life_expectancy, 1)} ${es() ? 'años' : 'years'}` : null);
  add('🛐', 'religion', d.religion ? cat('religion', d.religion) : null);
  add('🏛️', 'government_type', d.government_type ? cat('government_type', d.government_type) : null);
  add('🎆', 'independence_year', d.independence_year ? `${d.independence_year}${d.independence_from ? ` (${cat('independence_from', d.independence_from)})` : ''}` : null);
  if (f.highest_point_name) f.highest_point_name = { ...f.highest_point_name, label_en: 'Highest point', label_es: 'Punto más alto' };
  add('🏔️', 'highest_point_name', d.highest_point_name ? `${d.highest_point_name}${d.highest_point_m ? `, ${fmtNumber(d.highest_point_m as number)} m` : ''}` : null);
  add('🚗', 'driving_side', d.driving_side ? cat('driving_side', d.driving_side) : null);
  add('🍽️', 'national_dish', d.national_dish as string);
  add('☎️', 'calling_code', d.calling_code as string);
  add('🌐', 'tld', d.tld as string);
  return rows;
}

export default async function register(app: App, shell: Shell) {
  try {
    [DS, MINERALS] = await Promise.all([
      loadJSON<Dataset>('attributes/countries.json'),
      loadJSON<Record<string, Mineral>>('attributes/minerals.json').catch(() => ({})),
    ]);
  } catch (e) {
    console.warn('country facts unavailable', e);
    return;
  }
  const defs: LayerDef[] = [languagesLayer(), nationalAnimals(), flagsLayer, nationalColours()];
  if (Object.keys(MINERALS).length) defs.push(mineralsLayer());
  if (DS.fields.organizations) defs.push(pickerLayer({ id: 'organizations', field: 'organizations', icon: '🤝', cat: 'political', color: '#4dabf7',
    name: { en: 'Alliances and organisations', es: 'Alianzas y organizaciones' },
    desc: { en: 'Members of the EU, NATO, G20, BRICS, OPEC, ASEAN, the Commonwealth and more.', es: 'Miembros de la UE, OTAN, G20, BRICS, OPEP, ASEAN, la Commonwealth y más.' },
    keywords: 'eu nato g7 g20 brics opec asean commonwealth ue otan opep' }));
  if (DS.fields.natural_resources) defs.push(pickerLayer({ id: 'resource-finder', field: 'natural_resources', icon: '💎', cat: 'economy', color: '#f59f00',
    name: { en: 'Where is it found?', es: '¿Dónde se encuentra?' },
    desc: { en: 'Pick a natural resource and see every country that has it.', es: 'Elige un recurso natural y mira todos los países que lo tienen.' },
    keywords: 'resource mineral find recurso mineral' }));
  for (const [key, f] of Object.entries(DS.fields)) {
    const l = fieldLayer(key, f);
    if (l) defs.push(l);
  }
  app.register(defs);
  shell.card.extraRows.unshift(cardRows);
  shell.card.factsProvider = true;
  app.renderer.requestRender();
}

export { categorical };
