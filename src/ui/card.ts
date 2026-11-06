// Country card: flag, name, key facts and the values of every active filter. With a filter on, a
// tapped country first gets a compact strip (flag, name, the filters' values) so you can tap from
// country to country with the map in view; the flag or name opens the full panel.
import { X, Navigation, ExternalLink, ChevronUp, ChevronDown } from 'lucide';
import { h, icon, clear, add } from './dom';
import { t, tx, fmtCompact, fmtMoney, flagEmoji, subregion } from '../app/i18n';
import type { App } from '../app/app';
import type { InfoRow } from '../layers/types';
import { dataUrl } from '../data/store';

export class CountryCard {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private pickRows: { title: string; rows: InfoRow[] }[] = [];
  extraRows: ((id: string) => InfoRow[] | null)[] = [];
  /** Set by the country-facts pack: newer population and GDP figures than Natural Earth's. */
  factsProvider = false;
  /** Extra buttons from tools (compare, visited...). */
  actions: ((id: string) => HTMLElement | null)[] = [];
  /** The full panel was asked for (from the compact strip); a new country starts compact again. */
  private expanded = false;

  constructor(private app: App, root: HTMLElement) {
    this.body = h('div', { class: 'card-body' });
    const close = h('button', { type: 'button', class: 'icon-btn card-close', title: t('close'), 'aria-label': t('close') }, icon(X, 18));
    // Hidden here too: in Time travel nothing is selected, so deselecting alone left the card open.
    close.addEventListener('click', () => { this.hide(); app.select(null); });
    this.el = h('aside', { class: 'country-card glass', hidden: true, 'aria-live': 'polite' }, close, this.body);
    root.append(this.el);
    app.on('select', () => { this.expanded = false; this.render(); });
    app.on('layers', () => this.render());
    app.on('lang', () => this.render());
  }

  setPicks(p: { title: string; rows: InfoRow[] }[]) { this.pickRows = p; }

  hide() {
    this.el.hidden = true;
    this.setCompact(false);
  }

  private setCompact(on: boolean) {
    this.el.classList.toggle('compact', on);
    document.documentElement.classList.toggle('has-cc', on && !this.el.hidden);
    if (on) requestAnimationFrame(() => document.documentElement.style.setProperty('--cc-h', `${this.el.offsetHeight}px`));
  }

  /** Shows arbitrary content (historical polities, battles, quiz feedback...) in the card; `notes` are paragraphs under the rows. */
  showCustom(iconText: string, title: string, sub: string, rows: InfoRow[], links: { label: string; href?: string; onClick?: () => void }[] = [], notes: string[] = [], image?: Promise<string | null>) {
    clear(this.body);
    // A picture (from Wikipedia) appears on top once it has loaded, if the card is still open.
    const img = image ? (h('img', { class: 'card-img', alt: '', hidden: true }) as HTMLImageElement) : null;
    if (img) {
      img.addEventListener('load', () => { img.hidden = false; });
      void image!.then((src) => { if (src && img.isConnected) img.src = src; });
    }
    const actions = h('div', { class: 'card-actions' });
    for (const l of links) {
      const el = l.href ? h('a', { class: 'pill', href: l.href, target: '_blank', rel: 'noopener' }, icon(ExternalLink, 16), l.label)
        : h('button', { type: 'button', class: 'pill' }, l.label);
      if (l.onClick) el.addEventListener('click', l.onClick);
      actions.append(el);
    }
    add(this.body,
      img,
      h('div', { class: 'card-head' }, h('span', { class: 'flag-emoji' }, iconText), h('div', null, h('div', { class: 'card-title' }, title), h('div', { class: 'card-sub' }, sub))),
      h('div', { class: 'rows' }, rows.map(rowEl)),
      ...notes.map((n) => h('p', { class: 'card-note' }, n)),
      links.length ? actions : null);
    this.el.hidden = false;
    this.setCompact(false);
  }

  render() {
    if (this.app.mode) return;
    const id = this.app.selection;
    if (!id) { this.hide(); return; }
    const m = this.app.data.meta[id];
    if (!m) { this.hide(); return; }
    const es = this.app.lang === 'es';
    clear(this.body);
    const name = es ? m.es : m.n;
    const flagCode = (m.a2 || '').toLowerCase();
    const flag = flagCode
      ? h('img', { class: 'flag', src: dataUrl(`../flags/${flagCode}.svg`), alt: '', width: 48, height: 36, onerror: (e: Event) => { (e.target as HTMLElement).replaceWith(h('span', { class: 'flag-emoji' }, flagEmoji(m.a2))); } })
      : h('span', { class: 'flag-emoji' }, '🏳️');

    // The active filters' values for this country (top filter first) and what lies under the tap.
    const filterInfo: InfoRow[] = [];
    for (const inst of [...this.app.layers].reverse()) {
      if (!inst.ready || !inst.def.info) continue;
      const r = inst.def.info(id, inst, this.app.lang);
      if (!r?.length) continue;
      for (const row of r) filterInfo.push({ ...row, icon: row.icon ?? inst.def.icon });
    }
    const pickInfo = this.pickRows.flatMap((p) => p.rows);
    // Political map alone has nothing filter-specific to show: the full panel stays the default then.
    const filterOn = this.app.layers.some((l) => l.ready && !l.def.hidden && l.def.id !== 'political' && (l.def.info || l.def.pick));
    if (filterOn && !this.expanded && filterInfo.length + pickInfo.length > 0) {
      this.renderCompact(name, flag, [...pickInfo, ...filterInfo]);
      return;
    }

    const capital = this.app.data.cities.find((c) => c.country === id && c.capital === 2 && !(c.flags & 4));
    const rows: InfoRow[] = [];
    if (capital) rows.push({ label: t('capital'), value: es && capital.es ? capital.es : capital.name, icon: '🏛️' });
    if (m.pop && !this.factsProvider) rows.push({ label: t('population'), value: fmtCompact(m.pop), icon: '👥' });
    if (m.gdp && m.pop && !this.factsProvider) rows.push({ label: t('gdpPerCapita'), value: fmtMoney((m.gdp * 1e6) / m.pop), icon: '💰' });
    rows.push({ label: t('continent'), value: t(`cont.${m.ct}`), icon: '🌍' });
    if (m.type && /dependency|indeterminate|disputed|lease/i.test(m.type) && m.sov && m.sov !== m.n) rows.push({ label: t('sovereign'), value: m.sov, icon: '🔗' });
    for (const fn of this.extraRows) { const r = fn(id); if (r) rows.push(...r); }

    const filterRows = filterInfo.map(rowEl);
    const shown = new Set(filterInfo.map((r) => r.label));
    const keep = rows.filter((r) => !shown.has(r.label));
    rows.length = 0; rows.push(...keep);
    const pickEls = pickInfo.map(rowEl);

    const wiki = `https://${es ? 'es' : 'en'}.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(name)}`;
    const fly = h('button', { type: 'button', class: 'pill' }, icon(Navigation, 16), t('flyTo'));
    fly.addEventListener('click', () => this.app.flyToCountry(id));
    const actions = h('div', { class: 'card-actions' }, fly,
      h('a', { class: 'pill', href: wiki, target: '_blank', rel: 'noopener' }, icon(ExternalLink, 16), t('wikipedia')));
    for (const a of this.actions) { const el = a(id); if (el) actions.append(el); }
    let less: HTMLElement | null = null;
    if (filterOn) {
      less = h('button', { type: 'button', class: 'icon-btn card-less', title: t('showLess'), 'aria-label': t('showLess') }, icon(ChevronDown, 18));
      less.addEventListener('click', () => { this.expanded = false; this.render(); });
    }

    add(this.body,
      less,
      h('div', { class: 'card-head' }, flag, h('div', null, h('div', { class: 'card-title' }, name), h('div', { class: 'card-sub' }, `${t(`cont.${m.ct}`)} · ${subregion(m.sr)}`))),
      filterRows.length ? h('div', { class: 'rows filter-rows' }, filterRows) : null,
      pickEls.length ? h('div', { class: 'rows pick-rows' }, pickEls) : null,
      h('div', { class: 'rows' }, rows.map(rowEl)),
      actions,
    );
    this.el.hidden = false;
    this.setCompact(false);
  }

  /** One strip: flag and name (both open the full panel) with up to three filter values. */
  private renderCompact(name: string, flag: HTMLElement, rows: InfoRow[]) {
    const open = () => { this.expanded = true; this.render(); };
    const label = `${t('showAll')}: ${name}`;
    const flagBtn = h('button', { type: 'button', class: 'cc-flag', title: label, 'aria-label': label }, flag);
    flagBtn.addEventListener('click', open);
    const title = h('button', { type: 'button', class: 'cc-title', title: label }, name);
    title.addEventListener('click', open);
    const more = h('button', { type: 'button', class: 'icon-btn cc-more', title: label, 'aria-label': label }, icon(ChevronUp, 18));
    more.addEventListener('click', open);
    add(this.body,
      flagBtn,
      h('div', { class: 'cc-main' }, title,
        rows.slice(0, 3).map((r) => h('div', { class: 'cc-row' },
          h('span', { class: 'cc-label' }, `${r.icon ? r.icon + ' ' : ''}${r.label}`),
          h('span', { class: 'cc-value' }, r.value)))),
      more);
    this.el.hidden = false;
    this.setCompact(true);
  }
}

function rowEl(r: InfoRow): HTMLElement {
  return h('div', { class: 'row' }, h('span', { class: 'row-icon' }, r.icon ?? '•'), h('span', { class: 'row-label' }, r.label), h('span', { class: 'row-value' }, r.value));
}

export { tx };
