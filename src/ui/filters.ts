// The Filters panel: active stack (opacity, options, order) + every available filter by category.
import { ArrowUp, ArrowDown, X, Search, Check } from 'lucide';
import { h, icon, toggle, slider, normalize, clear } from './dom';
import { t, tx } from '../app/i18n';
import type { App } from '../app/app';
import type { CategoryId, LayerDef, LayerInstance } from '../layers/types';

export const CATEGORY_ORDER: { id: CategoryId; icon: string }[] = [
  { id: 'political', icon: '🗺️' }, { id: 'people', icon: '👥' }, { id: 'nature', icon: '🏔️' },
  { id: 'climate', icon: '🌦️' }, { id: 'flora', icon: '🌳' }, { id: 'fauna', icon: '🐾' },
  { id: 'earth', icon: '🌋' }, { id: 'economy', icon: '💹' }, { id: 'culture', icon: '🎭' },
  { id: 'fun', icon: '🎲' }, { id: 'imagery', icon: '🛰️' }, { id: 'live', icon: '📡' },
];

export function filtersPanel(app: App): HTMLElement {
  const root = h('div', { class: 'filters' });
  let query = '';
  const search = h('input', { class: 'search-input', type: 'search', placeholder: t('searchFilters'), 'aria-label': t('searchFilters') }) as HTMLInputElement;
  search.addEventListener('input', () => { query = normalize(search.value.trim()); renderList(); });
  const searchRow = h('div', { class: 'search-row' }, icon(Search, 18), search);
  const active = h('div', { class: 'active-stack' });
  const labelsRow = h('div', { class: 'chip-row' });
  const list = h('div', { class: 'cat-list' });
  root.append(searchRow, h('h3', { class: 'sec-title' }, t('activeFilters')), active, h('h3', { class: 'sec-title' }, t('labels')), labelsRow, list);

  const renderActive = () => {
    clear(active);
    const layers = [...app.layers].reverse(); // top of the stack first
    if (!layers.length) active.append(h('p', { class: 'muted small' }, t('noFilters')));
    for (const inst of layers) active.append(activeRow(app, inst));
  };

  const renderLabels = () => {
    clear(labelsRow);
    const s = app.renderer.settings;
    const chip = (label: string, on: boolean, set: (v: boolean) => void) => {
      const b = h('button', { type: 'button', class: `chip${on ? ' on' : ''}`, 'aria-pressed': String(on) }, on ? icon(Check, 14) : null, label);
      b.addEventListener('click', () => { set(!on); app.renderer.requestRender(); app.save(); renderLabels(); });
      return b;
    };
    labelsRow.append(
      chip(t('labelCountries'), s.labels.countries, (v) => (s.labels.countries = v)),
      chip(t('labelCapitals'), s.labels.capitals, (v) => (s.labels.capitals = v)),
      chip(t('labelCities'), s.labels.cities, (v) => (s.labels.cities = v)),
      chip(t('labelSeas'), s.labels.seas, (v) => (s.labels.seas = v)),
      chip(t('graticule'), s.graticule, (v) => (s.graticule = v)),
    );
  };

  const matches = (d: LayerDef) => {
    if (!query) return true;
    const hay = normalize(`${d.name.en} ${d.name.es} ${d.desc.en} ${d.desc.es} ${d.keywords ?? ''} ${t(`cat.${d.category}`)}`);
    return query.split(/\s+/).every((w) => hay.includes(w));
  };

  const renderList = () => {
    clear(list);
    for (const cat of CATEGORY_ORDER) {
      const defs = [...app.registry.values()].filter((d) => d.category === cat.id && matches(d));
      if (!defs.length) continue;
      const grid = h('div', { class: 'card-grid' });
      for (const d of defs) grid.append(filterCard(app, d, () => { renderActive(); renderList(); }));
      list.append(h('section', { class: 'cat' }, h('h3', { class: 'cat-title' }, h('span', { class: 'cat-icon' }, cat.icon), t(`cat.${cat.id}`), h('span', { class: 'cat-count' }, String(defs.length))), grid));
    }
    if (!list.childElementCount) list.append(h('p', { class: 'muted' }, t('noResults')));
  };

  renderActive(); renderLabels(); renderList();
  const off1 = app.on('layers', () => { renderActive(); updateCards(list, app); });
  const off2 = app.on('lang', () => { /* the shell re-opens the panel on language change */ });
  (root as unknown as { dispose: () => void }).dispose = () => { off1(); off2(); };
  return root;
}

function updateCards(list: HTMLElement, app: App) {
  list.querySelectorAll<HTMLElement>('.fcard').forEach((c) => {
    const on = app.isActive(c.dataset.id!);
    c.classList.toggle('on', on);
    c.setAttribute('aria-pressed', String(on));
  });
}

function filterCard(app: App, d: LayerDef, after: () => void): HTMLElement {
  const on = app.isActive(d.id);
  const card = h('button', { type: 'button', class: `fcard${on ? ' on' : ''}`, 'data-id': d.id, 'aria-pressed': String(on), title: tx(d.desc) },
    h('span', { class: 'fcard-icon' }, d.icon),
    h('span', { class: 'fcard-text' }, h('span', { class: 'fcard-name' }, tx(d.name)), h('span', { class: 'fcard-desc' }, tx(d.desc))),
    h('span', { class: 'fcard-check' }, icon(Check, 14)));
  card.addEventListener('click', () => { app.toggle(d.id); after(); });
  return card;
}

function activeRow(app: App, inst: LayerInstance): HTMLElement {
  const d = inst.def;
  const status = inst.error ? h('span', { class: 'badge err' }, t('dataError')) : !inst.ready ? h('span', { class: 'badge' }, t('dataLoading')) : null;
  const row = h('div', { class: 'arow' },
    h('div', { class: 'arow-head' },
      h('span', { class: 'arow-icon' }, d.icon),
      h('span', { class: 'arow-name' }, tx(d.name)),
      status,
      h('span', { class: 'arow-tools' },
        iconBtn(ArrowUp, 'Up', () => app.move(d.id, 1)),
        iconBtn(ArrowDown, 'Down', () => app.move(d.id, -1)),
        iconBtn(X, t('remove'), () => app.deactivate(d.id)))),
    h('div', { class: 'arow-opacity' }, h('span', { class: 'small muted' }, t('opacity')),
      slider(inst.opacity, 0.1, 1, 0.05, (v) => app.setOpacity(d.id, v))));
  for (const o of d.options ?? []) {
    if (o.type === 'select') {
      const sel = h('select', { class: 'select' }) as HTMLSelectElement;
      for (const c of o.choices) sel.append(h('option', { value: c.value }, `${c.icon ? c.icon + ' ' : ''}${tx(c.label)}`));
      sel.value = String(inst.options[o.id]);
      sel.addEventListener('change', () => app.setOption(d.id, o.id, sel.value));
      row.append(h('label', { class: 'arow-opt' }, h('span', { class: 'small muted' }, tx(o.label)), sel));
    } else {
      row.append(h('div', { class: 'arow-opt' }, toggle(Boolean(inst.options[o.id]), (v) => app.setOption(d.id, o.id, v), tx(o.label))));
    }
  }
  return row;
}

function iconBtn(node: Parameters<typeof icon>[0], title: string, onClick: () => void) {
  const b = h('button', { type: 'button', class: 'icon-btn sm', title, 'aria-label': title }, icon(node, 16));
  b.addEventListener('click', onClick);
  return b;
}
