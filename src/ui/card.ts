// Country card: flag, name, key facts and the values of every active filter.
import { X, Navigation, ExternalLink } from 'lucide';
import { h, icon, clear, add } from './dom';
import { t, tx, fmtCompact, fmtMoney, flagEmoji } from '../app/i18n';
import type { App } from '../app/app';
import type { InfoRow } from '../layers/types';
import { dataUrl } from '../data/store';

export class CountryCard {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private pickRows: { title: string; rows: InfoRow[] }[] = [];
  extraRows: ((id: string) => InfoRow[] | null)[] = [];
  /** Extra buttons from tools (compare, visited...). */
  actions: ((id: string) => HTMLElement | null)[] = [];

  constructor(private app: App, root: HTMLElement) {
    this.body = h('div', { class: 'card-body' });
    const close = h('button', { type: 'button', class: 'icon-btn card-close', title: t('close'), 'aria-label': t('close') }, icon(X, 18));
    close.addEventListener('click', () => app.select(null));
    this.el = h('aside', { class: 'country-card glass', hidden: true, 'aria-live': 'polite' }, close, this.body);
    root.append(this.el);
    app.on('select', () => this.render());
    app.on('layers', () => this.render());
    app.on('lang', () => this.render());
  }

  setPicks(p: { title: string; rows: InfoRow[] }[]) { this.pickRows = p; }

  hide() { this.el.hidden = true; }

  /** Shows arbitrary content (historical polities, quiz feedback...) in the card. */
  showCustom(iconText: string, title: string, sub: string, rows: InfoRow[], links: { label: string; href?: string; onClick?: () => void }[] = []) {
    clear(this.body);
    const actions = h('div', { class: 'card-actions' });
    for (const l of links) {
      const el = l.href ? h('a', { class: 'pill', href: l.href, target: '_blank', rel: 'noopener' }, icon(ExternalLink, 16), l.label)
        : h('button', { type: 'button', class: 'pill' }, l.label);
      if (l.onClick) el.addEventListener('click', l.onClick);
      actions.append(el);
    }
    add(this.body,
      h('div', { class: 'card-head' }, h('span', { class: 'flag-emoji' }, iconText), h('div', null, h('div', { class: 'card-title' }, title), h('div', { class: 'card-sub' }, sub))),
      h('div', { class: 'rows' }, rows.map(rowEl)),
      links.length ? actions : null);
    this.el.hidden = false;
  }

  render() {
    if (this.app.mode) return;
    const id = this.app.selection;
    if (!id) { this.el.hidden = true; return; }
    const m = this.app.data.meta[id];
    if (!m) { this.el.hidden = true; return; }
    const es = this.app.lang === 'es';
    clear(this.body);
    const name = es ? m.es : m.n;
    const flagCode = (m.a2 || '').toLowerCase();
    const flag = flagCode
      ? h('img', { class: 'flag', src: dataUrl(`../flags/${flagCode}.svg`), alt: '', width: 48, height: 36, onerror: (e: Event) => { (e.target as HTMLElement).replaceWith(h('span', { class: 'flag-emoji' }, flagEmoji(m.a2))); } })
      : h('span', { class: 'flag-emoji' }, '🏳️');
    const capital = this.app.data.cities.find((c) => c.country === id && c.capital === 2 && !(c.flags & 4));
    const rows: InfoRow[] = [];
    if (capital) rows.push({ label: t('capital'), value: es && capital.es ? capital.es : capital.name, icon: '🏛️' });
    if (m.pop) rows.push({ label: t('population'), value: fmtCompact(m.pop), icon: '👥' });
    if (m.gdp && m.pop) rows.push({ label: t('gdpPerCapita'), value: fmtMoney((m.gdp * 1e6) / m.pop), icon: '💰' });
    rows.push({ label: t('continent'), value: t(`cont.${m.ct}`), icon: '🌍' });
    if (m.type && /dependency|indeterminate|disputed|lease/i.test(m.type) && m.sov && m.sov !== m.n) rows.push({ label: t('sovereign'), value: m.sov, icon: '🔗' });
    for (const fn of this.extraRows) { const r = fn(id); if (r) rows.push(...r); }

    const filterRows: HTMLElement[] = [];
    for (const inst of [...this.app.layers].reverse()) {
      if (!inst.ready || !inst.def.info) continue;
      const r = inst.def.info(id, inst, this.app.lang);
      if (!r?.length) continue;
      for (const row of r) filterRows.push(rowEl({ ...row, icon: row.icon ?? inst.def.icon }));
    }
    const shown = new Set(filterRows.map((el) => el.querySelector('.row-label')?.textContent));
    const keep = rows.filter((r) => !shown.has(r.label));
    rows.length = 0; rows.push(...keep);
    const pickEls: HTMLElement[] = [];
    for (const p of this.pickRows) for (const row of p.rows) pickEls.push(rowEl(row));

    const wiki = `https://${es ? 'es' : 'en'}.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(name)}`;
    const fly = h('button', { type: 'button', class: 'pill' }, icon(Navigation, 16), t('flyTo'));
    fly.addEventListener('click', () => this.app.flyToCountry(id));
    const actions = h('div', { class: 'card-actions' }, fly,
      h('a', { class: 'pill', href: wiki, target: '_blank', rel: 'noopener' }, icon(ExternalLink, 16), t('wikipedia')));
    for (const a of this.actions) { const el = a(id); if (el) actions.append(el); }

    add(this.body,
      h('div', { class: 'card-head' }, flag, h('div', null, h('div', { class: 'card-title' }, name), h('div', { class: 'card-sub' }, `${t(`cont.${m.ct}`)} · ${m.sr}`))),
      h('div', { class: 'rows' }, rows.map(rowEl)),
      filterRows.length ? h('div', { class: 'rows filter-rows' }, filterRows) : null,
      pickEls.length ? h('div', { class: 'rows pick-rows' }, pickEls) : null,
      actions,
    );
    this.el.hidden = false;
  }
}

function rowEl(r: InfoRow): HTMLElement {
  return h('div', { class: 'row' }, h('span', { class: 'row-icon' }, r.icon ?? '•'), h('span', { class: 'row-label' }, r.label), h('span', { class: 'row-value' }, r.value));
}

export { tx };
