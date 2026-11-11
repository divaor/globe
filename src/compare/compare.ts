// Compare two filters: any two country facts at once. The map gets a two-colour grid (3 × 3), a card
// at the top shows the scatter plot and the correlation, linked to the globe both ways; a total can
// become a ratio ("Olympic medals per million people"); a category with a number, or two categories,
// get their own charts. It is one filter ("compare") whose options A and B are field keys.
import { ChartScatter, X, ChevronDown, Map as MapIcon } from 'lucide';
import { h, icon, clear, add, fillSelect } from '../ui/dom';
import { t, tx, lang, fmtNumber, fmtCompact, flagEmoji } from '../app/i18n';
import { samplePalette, categorical } from '../engine/colors';
import * as M from './model';
import { drawScatter, drawGroups, groupsHeight, type Dot, type HitTest } from './chart';
import { strength, type Strength } from './stats';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { TimeTravel } from '../modes';
import type { InfoRow, LayerDef, LayerInstance, Legend, LegendAction, LegendItem } from '../layers/types';

const es = () => lang() === 'es';
const L = (en: string, sp: string) => (es() ? sp : en);
/** Screens wide and tall enough for the card beside the map (in the Filters panel's place). */
const WIDE = matchMedia('(min-width: 1200px) and (min-height: 600px)');

/** The 3 × 3 colours (Joshua Stevens' scheme): A across in reds, B up in blues; index a + 3 · b. */
export const BIV = ['#e8e8e8', '#e4acac', '#c85a5a', '#b0d5df', '#ad9ea5', '#985356', '#64acbe', '#627f8c', '#574249'];
const CONTINENT_COLORS: Record<string, string> = { africa: '#f59f00', asia: '#e64980', europe: '#4dabf7', 'north-america': '#9775fa', 'south-america': '#51cf66', oceania: '#22b8cf' };
const DEFAULT = { a: 'gdp_per_capita', b: 'life_expectancy' };
/** What a filter is first compared with: wealth, or (for wealth) how long people live. */
const partner = (a: string) => (['gdp_per_capita', 'gdp_ppp_per_capita', 'hdi'].includes(a) ? 'life_expectancy' : 'gdp_per_capita');

/** "12.3", "0.734", "1.4M": as many digits as the size needs. */
export function fmtVal(v: number): string {
  const a = Math.abs(v);
  return a >= 1e5 ? fmtCompact(v) : fmtNumber(v, a === 0 ? 0 : a < 1 ? 3 : a < 10 ? 1 : 0);
}
const ordinal = (n: number) => (es() ? `${n}.º` : `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`);
const name = (key: string) => tx(M.fieldName(key));
const label = (key: string) => `${M.fieldIcon(key)} ${name(key)}`;
const unitOf = (key: string) => { const f = M.facts()?.fields[key]; return (es() ? f?.unit_es ?? f?.unit : f?.unit) ?? ''; };
/** A unit short enough to follow a value, without its bracketed detail ("US$ (current)" → "US$"); an index has none. */
const shortUnit = (key: string) => {
  const u = unitOf(key).replace(/\s*\([^)]*\)\s*$/, '');
  return /^(index|índice)$/i.test(u) || u.length > 24 ? '' : u;
};
const nCountries = (n: number) => `${n} ${n === 1 ? L('country', 'país') : L('countries', 'países')}`;

/** A link's strength in words. */
export function strengthWords(s: Strength): string {
  return {
    none: L('little or no link', 'casi ninguna relación'), weak: L('a weak link', 'una relación débil'), moderate: L('a moderate link', 'una relación moderada'),
    strong: L('a strong link', 'una relación fuerte'), veryStrong: L('a very strong link', 'una relación muy fuerte'),
  }[s];
}
/** How likely a link this strong is by chance, in words. */
export function chanceWords(p: number): string {
  return p < 0.001 ? L('very unlikely to be chance', 'muy poco probable que sea casualidad') : p < 0.05 ? L('unlikely to be chance', 'poco probable que sea casualidad') : L('could be chance', 'podría ser casualidad');
}
/** "Where A is higher, B tends to be higher too." */
export function direction(a: string, b: string, rho: number): string {
  if (strength(rho) === 'none') return L(`${label(a)} and ${label(b)} show little or no link.`, `${label(a)} y ${label(b)} casi no muestran relación.`);
  return rho > 0
    ? L(`Where ${label(a)} is higher, ${label(b)} tends to be higher too.`, `Donde ${label(a)} es mayor, ${label(b)} suele ser mayor también.`)
    : L(`Where ${label(a)} is higher, ${label(b)} tends to be lower.`, `Donde ${label(a)} es mayor, ${label(b)} suele ser menor.`);
}
/** A correlation with two decimals always (0.60, not 0.6), with the language's decimal mark. */
export const fmtR = (r: number) => (isFinite(r) ? (es() ? r.toFixed(2).replace('.', ',') : r.toFixed(2)).replace('-', '−') : '—');

export class Compare {
  private card: HTMLElement;
  private open = false;
  private fold = false;
  private bySize = false;
  private hit: HitTest | null = null;
  /** The filter Compare was started from, turned back on when the card's close button ends it. */
  private from: string | null = null;
  private mapIds = new Map<string, string>();

  constructor(private app: App, private shell: Shell, private time: TimeTravel) {
    this.card = h('section', { class: 'compare-card glass', hidden: true, 'aria-label': L('Compare two filters', 'Comparar dos filtros') });
    app.root.append(this.card);
    new ResizeObserver(() => this.syncInset()).observe(this.card);
    // Wide screens show the card beside the map; narrower ones above it. Crossing over redraws it.
    WIDE.addEventListener('change', () => { if (this.open) this.renderCard(); else this.syncInset(); });
    shell.addMenu({ id: 'compare-filters', icon: ChartScatter, label: () => L('Compare two filters', 'Comparar dos filtros'), order: 23, onClick: () => void this.start() });
    // From a filter's legend (A), the Filters panel (nothing) or the quiz (A and B).
    app.on('compare', (a, b) => void this.start(typeof a === 'string' ? a : undefined, typeof b === 'string' ? b : undefined));
    app.on('layers', () => { if (this.open) this.renderCard(); });
    app.on('select', () => { if (this.open && !this.fold) this.renderCard(); });
    app.on('highlight', () => { if (this.open && !this.fold) this.renderCard(); });
    app.on('lang', () => { if (this.open) this.renderCard(); });
    app.on('theme', () => { if (this.open) this.renderCard(); });
    // Time travel replaces today's map; a quiz or a tour takes the top of the screen.
    app.on('mode', () => { if (app.mode) this.closeCard(); });
    void M.loadFacts().then(() => {
      for (const [id, m] of Object.entries(app.data.meta)) if (!this.mapIds.has(m.iso ?? id)) this.mapIds.set(m.iso ?? id, id);
      for (const id of Object.keys(app.data.meta)) this.mapIds.set(id, id);
      app.register([this.layer()]);
    }).catch((e) => console.warn('compare: country facts unavailable', e));
    const learnCard = () => document.querySelector<HTMLElement>('.learn-card');
    new MutationObserver(() => { if (this.open && learnCard() && !learnCard()!.hidden) this.closeCard(); })
      .observe(app.root, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  }

  // ---- Starting and stopping -------------------------------------------------------------------
  /** Turns Compare on with A (and B), opening the chart; from a filter's legend, A is that filter. */
  async start(a?: string, b?: string) {
    await M.loadFacts();
    if (this.app.mode) await this.time.modes.find((m) => m.id === this.app.mode)?.exit();
    const inst = this.app.instance('compare');
    const A = a ?? String(inst?.options.a ?? DEFAULT.a);
    const B = b ?? (a ? partner(a) : String(inst?.options.b ?? DEFAULT.b));
    // Started from a filter: Compare takes its place, and gives it back when closed from the card.
    this.from = a && this.app.isActive(`fact-${a}`) ? `fact-${a}` : null;
    if (this.from) this.app.deactivate(this.from);
    if (inst) this.set({ a: A, b: B === A ? partner(A) : B, view: 'both' });
    else await this.app.activate('compare', { opacity: 1, options: { a: A, b: B === A ? partner(A) : B, view: 'both' } });
    // The card takes the Filters panel's place on wide screens and covers it elsewhere.
    this.shell.sheet.close();
    this.openCard();
  }

  /** Ends Compare from its card: the filter it was started from comes back. */
  private stop() {
    const back = this.from;
    this.closeCard();
    this.app.deactivate('compare');
    if (back) void this.app.activate(back);
    this.from = null;
  }

  private set(o: Record<string, string>) {
    const inst = this.app.instance('compare');
    if (!inst) return;
    Object.assign(inst.options, o);
    this.app.renderer.requestRender();
    this.app.emit('layers');
    this.app.save();
  }

  private an(inst?: LayerInstance) {
    const i = inst ?? this.app.instance('compare');
    return i ? M.analyse(String(i.options.a ?? ''), String(i.options.b ?? ''), String(i.options.view ?? 'both')) : null;
  }

  /** The country facts' code of a map shape (territories drawn by Natural Earth carry it in `iso`). */
  private isoOf(id: string): string | undefined {
    if (M.row(id)) return id;
    const iso = this.app.data.meta[id]?.iso;
    return iso && M.row(iso) ? iso : undefined;
  }
  private mapId = (iso: string) => this.mapIds.get(iso) ?? iso;

  // ---- The filter -----------------------------------------------------------------------------------
  private layer(): LayerDef {
    const ch = M.choices();
    const opt = (c: M.Choice) => ({ value: c.key, icon: c.icon, label: c.name, group: M.topicName(c.topic) });
    return {
      id: 'compare', category: 'fun', icon: '📊', kind: 'fill', featured: true,
      name: { en: 'Compare two filters', es: 'Comparar dos filtros' },
      desc: {
        en: 'Any two country filters at once: a two-colour map, a scatter plot with the correlation, ratios such as medals per million people, and charts for categories.',
        es: 'Dos filtros de países a la vez: un mapa de dos colores, un diagrama de dispersión con la correlación, cocientes como medallas por millón de personas y gráficos para categorías.',
      },
      keywords: 'compare correlation correlate scatter plot ratio bivariate two filters relation link comparar correlacion relacion dispersion cociente bivariado dos filtros',
      options: [
        { id: 'a', type: 'select', label: { en: 'A →', es: 'A →' }, default: DEFAULT.a, choices: ch.map(opt) },
        { id: 'b', type: 'select', label: { en: 'B ↑', es: 'B ↑' }, default: DEFAULT.b, choices: ch.map(opt) },
      ],
      load: async () => { await M.loadFacts(); },
      countryColor: (id, inst) => this.color(id, inst),
      legend: (inst) => this.legend(inst),
      info: (id, inst) => this.info(id, inst),
      valueLabel: (id, inst) => this.valueLabel(id, inst),
      onOptionsChanged: () => { /* the analysis is cached by its options */ },
      onDeactivate: () => this.closeCard(),
    };
  }

  private combos(an: M.CatCat): { key: string; label: string; color: string; isos: string[] }[] {
    const all: { key: string; i: number; j: number; isos: string[] }[] = [];
    an.table.forEach((r, i) => r.forEach((n, j) => { if (n) all.push({ key: `${an.rows[i]}|${an.cols[j]}`, i, j, isos: an.isos[i][j] }); }));
    all.sort((p, q) => q.isos.length - p.isos.length);
    const top = all.slice(0, all.length > 10 ? 9 : 10);
    const pal = categorical(top.length, 4);
    const out = top.map((c, k) => ({ key: c.key, label: `${tx(M.catLabel(an.a, an.rows[c.i]))} · ${tx(M.catLabel(an.b, an.cols[c.j]))}`, color: pal[k], isos: c.isos }));
    const rest = all.slice(top.length).flatMap((c) => c.isos);
    if (rest.length) out.push({ key: '_rest', label: L('Other combinations', 'Otras combinaciones'), color: '#adb5bd', isos: rest });
    return out;
  }

  private color(id: string, inst: LayerInstance): string | null {
    const an = this.an(inst);
    const iso = an && this.isoOf(id);
    if (!an || !iso) return null;
    switch (an.kind) {
      case 'nn': { const c = an.cell.get(iso); return c === undefined ? null : BIV[c]; }
      case 'ratio': {
        const v = an.vals.get(iso);
        if (v === undefined) return null;
        const k = an.log ? (v <= 0 ? 0 : (Math.log(v) - Math.log(an.lo)) / (Math.log(an.hi) - Math.log(an.lo))) : (v - an.lo) / (an.hi - an.lo);
        return samplePalette(an.palette, Math.max(0, Math.min(1, k)));
      }
      case 'cn': { const g = an.groupOf(iso); return g && M.num(an.numKey, iso) !== undefined ? an.color(g) : null; }
      case 'cc': return this.combos(an).find((c) => c.isos.includes(iso))?.color ?? null;
    }
  }

  private legend(inst: LayerInstance): Legend {
    const a = String(inst.options.a ?? ''), b = String(inst.options.b ?? ''), view = String(inst.options.view ?? 'both');
    const actions: LegendAction[] = [];
    const chartLabel = this.open ? L('Chart open', 'Gráfico abierto') : L('Chart', 'Gráfico');
    actions.push({ icon: '📈', label: chartLabel, primary: !this.open, onClick: () => this.openCard() });
    actions.push({ icon: '⇄', label: L('Swap', 'Intercambiar'), onClick: () => this.set({ a: b, b: a }) });
    if (a === b) return { kind: 'html', html: '', note: L('Pick two different filters.', 'Elige dos filtros distintos.'), actions };
    const rp = M.ratioPair(a, b);
    if (view === 'ratio') actions.push({ icon: '◧', label: L('Two colours', 'Dos colores'), onClick: () => this.set({ view: 'both' }) });
    else if (rp.ok) {
      const r = M.analyse(a, b, 'ratio');
      if (r?.kind === 'ratio') { const per = tx(r.per); actions.push({ icon: '÷', label: per.charAt(0).toUpperCase() + per.slice(1), onClick: () => this.set({ view: 'ratio' }) }); }
    } else if (rp.same) {
      const same = rp.same;
      actions.push({ icon: M.fieldIcon(same), label: name(same), onClick: () => { this.closeCard(); this.app.deactivate('compare'); void this.app.activate(`fact-${same}`); } });
    }
    const an = this.an(inst);
    if (!an) return { kind: 'html', html: '', title: `${name(a)} × ${name(b)}`, note: L('Too few countries have both.', 'Muy pocos países tienen ambos datos.'), actions };
    const years = this.years(a, b);
    switch (an.kind) {
      case 'nn': {
        const word = (th: M.NumNum['thA'], k: number, key: string) => {
          const [lo, hi] = th.cuts;
          // Short units ride along ("< 28 years"); long ones are on the axis of the chart.
          const u = unitOf(key), us = u && u.length <= 8 ? ` ${u}` : '';
          if (th.tie) return [L(`below ${fmtVal(lo)}${us}`, `menos de ${fmtVal(lo)}${us}`), `${fmtVal(lo)}${us}`, L(`above ${fmtVal(lo)}${us}`, `más de ${fmtVal(lo)}${us}`)][k];
          return [`${L('bottom third', 'tercio inferior')} (< ${fmtVal(lo)}${us})`, `${L('middle third', 'tercio medio')} (${fmtVal(lo)}–${fmtVal(hi)}${us})`, `${L('top third', 'tercio superior')} (≥ ${fmtVal(hi)}${us})`][k];
        };
        const cells: (LegendItem & { count: number })[] = [];
        for (let k = 0; k < 9; k++) {
          const ia = k % 3, ib = Math.floor(k / 3);
          const isos = an.pts.filter((p) => an.cell.get(p.iso) === k).map((p) => p.iso);
          cells.push({ color: BIV[k], count: isos.length, ids: this.toMapIds(isos), label: `${name(a)}: ${word(an.thA, ia, a)} · ${name(b)}: ${word(an.thB, ib, b)}` });
        }
        return {
          kind: 'bivariate', title: `${name(a)} × ${name(b)}`, cells, x: label(a), y: label(b), actions,
          note: `ρ = ${fmtR(an.rho)}: ${strengthWords(strength(an.rho))} · ${nCountries(an.n)}${years ? ` · ${years}` : ''}`,
        };
      }
      case 'ratio': {
        const mid = an.log ? Math.sqrt(an.lo * an.hi) : (an.lo + an.hi) / 2;
        return {
          kind: 'gradient', title: `${name(an.num)} ${tx(an.per)}`, stops: an.palette, min: fmtVal(an.lo), mid: fmtVal(mid), max: fmtVal(an.hi), actions,
          note: `${L('A total divided by another', 'Un total dividido entre otro')}: ${name(an.num)} ÷ ${name(an.den)} · ${nCountries(an.n)}${years ? ` · ${years}` : ''}`,
        };
      }
      case 'cn': {
        const items: LegendItem[] = an.groups.map((g) => ({ color: an.color(g.k), label: `${tx(M.catLabel(an.catKey, g.k))} (${g.isos.length})`, ids: this.toMapIds(g.isos) }));
        return { kind: 'categories', title: `${name(an.catKey)} × ${name(an.numKey)}`, items, actions, note: L(`The chart shows ${name(an.numKey)} in each group, with its median.`, `El gráfico muestra ${name(an.numKey)} en cada grupo, con su mediana.`) };
      }
      case 'cc': {
        const items: LegendItem[] = this.combos(an).map((c) => ({ color: c.color, label: `${c.label} (${c.isos.length})`, ids: this.toMapIds(c.isos) }));
        return { kind: 'categories', title: `${name(a)} × ${name(b)}`, items, actions, note: `V = ${fmtR(an.V)}: ${this.vWords(an.V)} · ${nCountries(an.n)}` };
      }
    }
  }

  /** "Years: alcohol 2019, median age 2025" when they differ. */
  private years(a: string, b: string): string {
    const F = M.facts()?.fields ?? {};
    const ya = F[a]?.year, yb = F[b]?.year;
    return ya && yb && ya !== yb ? `${L('years', 'años')}: ${ya} / ${yb}` : '';
  }
  private vWords(V: number) { return V < 0.1 ? L('little or no link', 'casi ninguna relación') : V < 0.25 ? L('a weak link', 'una relación débil') : V < 0.4 ? L('a moderate link', 'una relación moderada') : L('a strong link', 'una relación fuerte'); }
  private etaWords(e: number) { return e < 0.06 ? L('The groups differ a little.', 'Los grupos difieren poco.') : e < 0.14 ? L('The groups differ moderately.', 'Los grupos difieren moderadamente.') : L('The groups differ a lot.', 'Los grupos difieren mucho.'); }

  private toMapIds(isos: string[]): string[] {
    const out = new Set<string>();
    for (const iso of isos) { out.add(this.mapId(iso)); }
    // Territories drawn as their own shapes share their ISO code's facts.
    for (const [id, m] of Object.entries(this.app.data.meta)) if (m.iso && isos.includes(m.iso)) out.add(id);
    return [...out];
  }

  private valueText(key: string, iso: string): string {
    if (M.isNum(key)) {
      const v = M.num(key, iso);
      if (v === undefined) return t('noData');
      const u = shortUnit(key);
      const rk = M.rankOf(key, iso);
      return `${fmtVal(v)}${u ? ` ${u}` : ''}${rk ? ` · ${ordinal(rk.r)} ${L('of', 'de')} ${rk.n}` : ''}`;
    }
    const c = M.cat(key, iso);
    return c ? tx(M.catLabel(key, c)) : t('noData');
  }

  private info(id: string, inst: LayerInstance): InfoRow[] | null {
    const iso = this.isoOf(id);
    const a = String(inst.options.a ?? ''), b = String(inst.options.b ?? '');
    if (!iso || !a || !b) return null;
    const rows: InfoRow[] = [];
    const an = this.an(inst);
    if (an?.kind === 'ratio') {
      const v = an.vals.get(iso), rk = an.rank.get(iso);
      rows.push({ icon: '÷', label: `${name(an.num)} ${tx(an.per)}`, value: v === undefined ? t('noData') : `${fmtVal(v)}${rk ? ` · ${ordinal(rk)} ${L('of', 'de')} ${an.n}` : ''}` });
    }
    rows.push({ icon: M.fieldIcon(a), label: name(a), value: this.valueText(a, iso) });
    if (b !== a) rows.push({ icon: M.fieldIcon(b), label: name(b), value: this.valueText(b, iso) });
    return rows;
  }

  private valueLabel(id: string, inst: LayerInstance): string | null {
    const an = this.an(inst);
    const iso = an && this.isoOf(id);
    if (!an || !iso) return null;
    if (an.kind === 'ratio') { const v = an.vals.get(iso); return v === undefined ? null : fmtVal(v); }
    if (an.kind === 'cn') { const v = M.num(an.numKey, iso); return v === undefined ? null : fmtVal(v); }
    return null;
  }

  // ---- The chart card --------------------------------------------------------------------------------
  openCard() {
    if (!this.app.instance('compare')) return;
    this.open = true; this.fold = false;
    this.renderCard();
    this.app.emit('legend');
  }

  closeCard() {
    if (!this.open && this.card.hidden) return;
    this.open = false;
    this.card.hidden = true;
    this.hit = null;
    this.syncInset();
    this.app.emit('legend');
  }

  private renderCard() {
    const inst = this.app.instance('compare');
    if (!inst || !this.open) { this.closeCard(); return; }
    const a = String(inst.options.a ?? ''), b = String(inst.options.b ?? '');
    const an = this.an(inst);
    clear(this.card);
    this.card.hidden = false;
    // Beside the map there is nothing to fold away for.
    if (WIDE.matches) this.fold = false;
    this.card.classList.toggle('peek', this.fold);
    const foldLabel = this.fold ? L('Show the chart', 'Mostrar el gráfico') : L('See the map', 'Ver el mapa');
    const fold = h('button', { type: 'button', class: `pill sm cmp-fold${this.fold ? ' on' : ''}`, title: foldLabel, 'aria-label': foldLabel, 'aria-expanded': String(!this.fold) },
      icon(this.fold ? ChevronDown : MapIcon, 15), this.fold ? L('Chart', 'Gráfico') : L('Map', 'Mapa'));
    fold.addEventListener('click', () => { this.fold = !this.fold; this.renderCard(); });
    const close = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': t('close'), title: t('close') }, icon(X, 16));
    close.addEventListener('click', () => this.stop());
    const title = an?.kind === 'ratio' ? `÷ ${name(an.num)} ${tx(an.per)}` : `${label(a)} × ${label(b)}`;
    add(this.card, h('div', { class: 'tool-head' }, h('strong', { class: 'cmp-title' }, title), WIDE.matches ? null : fold, close));
    if (!this.fold) add(this.card, this.pickers(a, b));
    if (!an) {
      add(this.card, h('div', { class: 'tool-hint' }, a === b ? L('Pick two different filters in the legend.', 'Elige dos filtros distintos en la leyenda.') : L('Too few countries have both.', 'Muy pocos países tienen ambos datos.')));
      requestAnimationFrame(() => this.syncInset());
      return;
    }
    // The chart fills the card: its width less the padding (14 px each side).
    const width = (this.card.clientWidth || Math.min(520, window.innerWidth - 24)) - 28;
    if (an.kind === 'nn') this.renderNumNum(an, width);
    else if (an.kind === 'cn') this.renderCatNum(an, width);
    else if (an.kind === 'cc') this.renderCatCat(an);
    else this.renderRatio(an);
    requestAnimationFrame(() => this.syncInset());
  }

  /** A and B, as in the legend (which a phone hides while the chart is open), and a swap. */
  private pickers(a: string, b: string): HTMLElement {
    const items = M.choices().map((c) => ({ value: c.key, label: `${c.icon} ${tx(c.name)}`, group: tx(M.topicName(c.topic)) }));
    const pick = (id: 'a' | 'b', text: string, value: string) => {
      const sel = h('select', { class: 'lg-select', 'aria-label': `${L('Filter', 'Filtro')} ${id.toUpperCase()}`, 'data-pick': id }) as HTMLSelectElement;
      fillSelect(sel, items);
      sel.value = value;
      sel.addEventListener('change', () => this.set({ [id]: sel.value }));
      return h('label', { class: 'cmp-pick' }, h('span', { class: 'cmp-pick-l' }, text), sel);
    };
    const swap = h('button', { type: 'button', class: 'icon-btn sm cmp-swap', title: L('Swap A and B', 'Intercambiar A y B'), 'aria-label': L('Swap A and B', 'Intercambiar A y B') }, '⇄');
    swap.addEventListener('click', () => this.set({ a: b, b: a }));
    return h('div', { class: 'cmp-picks' }, pick('a', 'A →', a), pick('b', 'B ↑', b), swap);
  }

  private dark() { return this.app.themeId === 'dark'; }
  private selectedIso() { const s = this.app.selection; return s ? this.isoOf(s) : undefined; }
  private dimmed(iso: string) { const hl = this.app.renderer.highlight; return !!hl && !hl.has(this.mapId(iso)); }
  private go(iso: string) { this.app.flyToCountry(this.mapId(iso)); }

  private canvas(width: number, height: number, draw: (c: HTMLCanvasElement) => HitTest): HTMLCanvasElement {
    const c = h('canvas', { class: 'cmp-canvas', role: 'img' }) as HTMLCanvasElement;
    c.style.width = `${width}px`; c.style.height = `${height}px`;
    this.hit = draw(c);
    c.addEventListener('click', (e) => {
      const r = c.getBoundingClientRect();
      const iso = this.hit?.(e.clientX - r.left, e.clientY - r.top);
      if (iso) this.go(iso);
    });
    return c;
  }

  private axisFmt = (v: number) => (Math.abs(v) >= 1e4 ? fmtCompact(v) : fmtNumber(v, Math.abs(v) < 1 && v !== 0 ? 2 : Math.abs(v) < 10 && !Number.isInteger(v) ? 1 : 0));
  private caption(key: string) {
    const f = M.facts()?.fields[key];
    const u = unitOf(key);
    return `${label(key)}${u || f?.year ? ` (${[u, f?.year].filter(Boolean).join(', ')})` : ''}`;
  }
  private countryButton(iso: string, extra = '', rank = '') {
    const m = this.app.data.meta[this.mapId(iso)];
    const b = h('button', { type: 'button', class: 'pill sm cmp-country' }, rank ? h('span', { class: 'cmp-rk' }, rank) : null, `${flagEmoji(m?.a2)} ${this.app.data.name(this.mapId(iso), lang())}${extra}`);
    b.addEventListener('click', () => this.go(iso));
    return b;
  }

  private renderNumNum(an: M.NumNum, width: number) {
    const sel = this.selectedIso();
    add(this.card,
      h('div', { class: 'cmp-sum' }, h('strong', null, `${strengthWords(strength(an.rho)).replace(/^./, (c) => c.toUpperCase())}. `), direction(an.a, an.b, an.rho)));
    if (this.fold) return;
    const maxPop = Math.max(...an.pts.map((p) => M.num('population', p.iso) ?? 0), 1);
    const dots: Dot[] = an.pts.map((p) => {
      const cont = String(M.row(p.iso)?.continent ?? '');
      const pop = M.num('population', p.iso) ?? 0;
      return {
        iso: p.iso, x: p.x, y: p.y, color: CONTINENT_COLORS[cont] ?? '#adb5bd',
        r: this.bySize ? 2 + 9 * Math.sqrt(pop / maxPop) : 3.4, dim: this.dimmed(p.iso), sel: p.iso === sel,
        label: p.iso === sel ? this.app.data.name(this.mapId(p.iso), lang()) : undefined,
      };
    });
    const height = matchMedia('(max-width: 720px)').matches ? 190 : 240;
    const canvas = this.canvas(width, height, (c) => drawScatter(c, { w: width, h: height, dark: this.dark(), dots, ax: { t: an.tx, fmt: this.axisFmt }, ay: { t: an.ty, fmt: this.axisFmt }, line: an.line }));
    canvas.setAttribute('aria-label', `${name(an.a)} × ${name(an.b)}: ρ = ${fmtR(an.rho)}`);
    const size = h('button', { type: 'button', class: `chip sm${this.bySize ? ' on' : ''}`, 'aria-pressed': String(this.bySize) }, L('Size: population', 'Tamaño: población'));
    size.addEventListener('click', () => { this.bySize = !this.bySize; this.renderCard(); });
    const conts = Object.entries(CONTINENT_COLORS).map(([k, c]) => h('span', { class: 'cmp-key' }, h('span', { class: 'cmp-dot', style: { background: c } }), tx(M.catLabel('continent', k))));
    add(this.card,
      h('div', { class: 'cmp-ycap' }, `↑ ${this.caption(an.b)}`),
      canvas,
      h('div', { class: 'cmp-xcap' }, `→ ${this.caption(an.a)}`),
      h('div', { class: 'cmp-keys' }, conts, size),
      h('div', { class: 'cmp-stats' }, `${L("Spearman's", 'ρ de Spearman')}${es() ? '' : ' ρ'} = ${fmtR(an.rho)} · ${L("Pearson's", 'r de Pearson')}${es() ? '' : ' r'} = ${fmtR(an.r)}${an.tx !== 'lin' || an.ty !== 'lin' ? L(' (log scale)', ' (escala log.)') : ''} · ${nCountries(an.n)} · ${chanceWords(an.p)}`),
      an.exceptions.length ? h('div', { class: 'cmp-exc' }, h('span', { class: 'cmp-exc-t' }, L('Furthest from the trend:', 'Más lejos de la tendencia:')), an.exceptions.map((iso) => this.countryButton(iso))) : null,
      h('p', { class: 'cmp-note' }, [L('Correlation is not causation: a third factor, such as wealth, can drive both.', 'Correlación no es causalidad: un tercer factor, como la riqueza, puede influir en ambos.'), this.years(an.a, an.b)].filter(Boolean).join(' · ')));
  }

  private renderCatNum(an: M.CatNum, width: number) {
    add(this.card, h('div', { class: 'cmp-sum' }, h('strong', null, this.etaWords(an.eta2)), ' ', L(`${label(an.numKey)} by ${label(an.catKey)}: each dot is a country, the bar its group's median.`, `${label(an.numKey)} según ${label(an.catKey)}: cada punto es un país y la barra, la mediana de su grupo.`)));
    if (this.fold) return;
    const sel = this.selectedIso();
    const rows = an.groups.map((g) => ({
      label: `${tx(M.catLabel(an.catKey, g.k))} (${g.isos.length})`, color: an.color(g.k), median: g.median,
      dots: g.isos.map((iso, i) => ({ iso, x: g.vals[i], y: 0, color: an.color(g.k), r: 3, dim: this.dimmed(iso), sel: iso === sel } as Dot)),
    }));
    const height = groupsHeight(rows.length);
    add(this.card,
      this.canvas(width, height, (c) => drawGroups(c, { w: width, h: height, dark: this.dark(), rows, ax: { t: an.tnum, fmt: this.axisFmt } })),
      h('div', { class: 'cmp-xcap' }, `→ ${this.caption(an.numKey)}`),
      h('div', { class: 'cmp-stats' }, `${L('Medians', 'Medianas')}: ${an.groups.slice(0, 4).map((g) => `${tx(M.catLabel(an.catKey, g.k))} ${fmtVal(g.median)}`).join(' · ')}${an.groups.length > 4 ? ' …' : ''} · η² = ${fmtR(an.eta2)} · ${nCountries(an.n)}`),
      h('p', { class: 'cmp-note' }, L('Correlation is not causation: a third factor, such as wealth, can drive both.', 'Correlación no es causalidad: un tercer factor, como la riqueza, puede influir en ambos.')));
  }

  private renderCatCat(an: M.CatCat) {
    add(this.card, h('div', { class: 'cmp-sum' }, h('strong', null, `V = ${fmtR(an.V)}: ${this.vWords(an.V)}. `), L('Each square counts the countries in both groups; tap one to see them on the map.', 'Cada casilla cuenta los países que están en ambos grupos; tócala para verlos en el mapa.')));
    if (this.fold) return;
    const head = h('tr', null, h('th', null, ''), ...an.cols.map((c) => h('th', { scope: 'col' }, tx(M.catLabel(an.b, c)))));
    const max = Math.max(...an.table.flat(), 1);
    const body = an.rows.map((r, i) => h('tr', null, h('th', { scope: 'row' }, tx(M.catLabel(an.a, r))), ...an.cols.map((_, j) => {
      const n = an.table[i][j];
      const td = h('td', null, n ? h('button', { type: 'button', class: 'cmp-cell', style: { background: `color-mix(in srgb, var(--accent) ${Math.round((n / max) * 70)}%, transparent)` } }, String(n)) : '·');
      td.querySelector('button')?.addEventListener('click', () => {
        this.shell.legend.clearHighlight();
        this.app.renderer.highlight = new Set(this.toMapIds(an.isos[i][j]));
        this.app.renderer.requestRender();
        this.shell.toast(`${tx(M.catLabel(an.a, r))} · ${tx(M.catLabel(an.b, an.cols[j]))}: ${nCountries(n)}`);
      });
      return td;
    })));
    add(this.card,
      h('div', { class: 'cmp-table-wrap' }, h('table', { class: 'cmp-table' }, h('caption', null, `${label(an.a)} ↓ · ${label(an.b)} →`), h('thead', null, head), h('tbody', null, body))),
      h('div', { class: 'cmp-stats' }, `${L("Cramér's V", 'V de Cramér')} = ${fmtR(an.V)} · ${nCountries(an.n)}`));
  }

  private renderRatio(an: M.Ratio) {
    add(this.card, h('div', { class: 'cmp-sum' }, L(`${label(an.num)} divided by ${label(an.den)}: who has the most for their size.`, `${label(an.num)} dividido entre ${label(an.den)}: quién tiene más para su tamaño.`)));
    if (this.fold) return;
    const order = [...an.vals].sort((p, q) => q[1] - p[1]);
    const list = (items: [string, number][], from: number) => h('div', { class: 'cmp-rank', role: 'list' },
      items.map(([iso, v], i) => h('div', { role: 'listitem' }, this.countryButton(iso, ` · ${fmtVal(v)}`, `${from + i}.`))));
    add(this.card,
      h('div', { class: 'cmp-rank-t' }, L('Highest', 'Más alto')), list(order.slice(0, 10), 1),
      h('div', { class: 'cmp-rank-t' }, L('Lowest', 'Más bajo')), list(order.slice(-4), order.length - 3),
      h('p', { class: 'cmp-note' }, [`${L('Ratio', 'Cociente')}: ${name(an.num)} ÷ ${name(an.den)}${an.factor !== 1 ? ` × ${fmtCompact(an.factor)}` : ''}`, this.years(an.num, an.den), nCountries(an.n)].filter(Boolean).join(' · ')));
  }

  /**
   * The map centres below the card (and above the dock, chips and legend on a phone), easing there,
   * as for the quiz and tour card. A shown quiz or tour card owns the inset instead.
   */
  private insetGoal = 0;
  private bottomGoal = 0;
  private insetRaf = 0;
  private syncInset() {
    const shown = !this.card.hidden;
    const learn = document.querySelector<HTMLElement>('.learn-card');
    if (!shown && learn && !learn.hidden) return;
    // Beside the map (wide screens) the card covers no part of it that needs moving.
    const side = shown && WIDE.matches;
    const r = shown && !side ? this.card.getBoundingClientRect() : null;
    this.insetGoal = r && r.height ? Math.round(r.bottom + 8) : 0;
    document.documentElement.classList.toggle('has-topcard', shown && !side);
    document.documentElement.classList.toggle('has-sidecard', side);
    document.documentElement.classList.toggle('topcard-full', shown && !side && !this.fold);
    document.documentElement.style.setProperty('--topcard-b', `${this.insetGoal}px`);
    let bottom = 0;
    if (shown && matchMedia('(max-width: 720px)').matches) {
      const tops = ['.dock', '.chips', '.legend'].map((q) => document.querySelector<HTMLElement>(q)?.getBoundingClientRect())
        .filter((b): b is DOMRect => !!b && b.height > 0).map((b) => b.top);
      if (tops.length) bottom = Math.max(0, Math.round(window.innerHeight - Math.min(...tops) + 6));
    }
    this.bottomGoal = bottom;
    if (!this.insetRaf) this.insetRaf = requestAnimationFrame(this.easeInset);
  }
  private easeInset = () => {
    const v = this.app.renderer.view;
    const ease = (from: number, to: number) => (Math.abs(to - from) < 1 ? to : from + (to - from) * 0.3);
    v.insetTop = ease(v.insetTop, this.insetGoal);
    let done = v.insetTop === this.insetGoal;
    if (!this.app.mode) { v.insetBottom = ease(v.insetBottom, this.bottomGoal); done &&= v.insetBottom === this.bottomGoal; }
    this.app.renderer.requestRender();
    this.insetRaf = done ? 0 : requestAnimationFrame(this.easeInset);
  };
}

