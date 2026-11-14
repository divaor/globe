// The Filters panel: active stack (opacity, options, order) + every available filter by category.
import { ArrowUp, ArrowDown, X, Search, Check } from 'lucide';
import { h, icon, toggle, slider, normalize, clear, fillSelect } from './dom';
import { t, tx } from '../app/i18n';
import type { App } from '../app/app';
import type { CategoryId, LayerDef, LayerInstance } from '../layers/types';

export const CATEGORY_ORDER: { id: CategoryId; icon: string }[] = [
  { id: 'political', icon: '🗺️' }, { id: 'people', icon: '👥' }, { id: 'nature', icon: '🏔️' },
  { id: 'climate', icon: '🌦️' }, { id: 'flora', icon: '🌳' }, { id: 'fauna', icon: '🐾' },
  { id: 'earth', icon: '🌋' }, { id: 'economy', icon: '💹' }, { id: 'culture', icon: '🎭' },
  { id: 'fun', icon: '🎲' }, { id: 'imagery', icon: '🛰️' }, { id: 'live', icon: '📡' },
];

/** The panel, its search box (shown above the list so the list never scrolls under it) and cleanup. */
export type FiltersPanel = HTMLElement & { bar: HTMLElement; dispose: () => void };

/** The search text, kept between openings so the list comes back as you left it (the sheet keeps the scroll). */
let keptQuery = '';

export function filtersPanel(app: App): FiltersPanel {
  const root = h('div', { class: 'filters' });
  let query = normalize(keptQuery.trim());
  const search = h('input', { class: 'search-input', type: 'search', placeholder: t('searchFilters'), 'aria-label': t('searchFilters') }) as HTMLInputElement;
  search.value = keptQuery;
  search.addEventListener('input', () => { keptQuery = search.value; query = normalize(search.value.trim()); renderList(); });
  const searchRow = h('div', { class: 'search-row' }, icon(Search, 18), search);
  const active = h('div', { class: 'active-stack' });
  const labelsRow = h('div', { class: 'chip-row' });
  const list = h('div', { class: 'cat-list' });
  root.append(h('h3', { class: 'sec-title' }, t('activeFilters')), active, h('h3', { class: 'sec-title' }, t('labels')), labelsRow, list);

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
    // Tools that work with the other filters (Compare two filters) come first.
    const featured = [...app.registry.values()].filter((d) => d.featured && !d.hidden && matches(d));
    if (featured.length) {
      const grid = h('div', { class: 'card-grid' });
      for (const d of featured) grid.append(filterCard(app, d, tap));
      list.append(h('section', { class: 'cat cat-featured' }, h('h3', { class: 'cat-title' }, h('span', { class: 'cat-icon' }, '✨'), t('featured')), grid));
    }
    // Your own data: your tables' filters, and a button to add one.
    {
      const mine = [...app.registry.values()].filter((d) => !d.hidden && d.category === 'mine' && matches(d));
      if (mine.length || !query || matches({ name: { en: 'your data csv', es: 'tus datos csv' }, desc: { en: 'add', es: 'agregar' }, category: 'mine' } as LayerDef)) {
        const grid = h('div', { class: 'card-grid' });
        for (const d of mine) grid.append(filterCard(app, d, tap));
        const addCard = h('button', { type: 'button', class: 'fcard fcard-add', 'data-id': 'my-add' },
          h('span', { class: 'fcard-icon' }, '➕'),
          h('span', { class: 'fcard-text' }, h('span', { class: 'fcard-name' }, t('myDataAdd')), h('span', { class: 'fcard-desc' }, t('myDataAddDesc'))));
        addCard.addEventListener('click', () => app.emit('mydata'));
        grid.append(addCard);
        list.append(h('section', { class: 'cat cat-mine' }, h('h3', { class: 'cat-title' }, h('span', { class: 'cat-icon' }, '📁'), t('cat.mine'), mine.length ? h('span', { class: 'cat-count' }, String(mine.length)) : null), grid));
      }
    }
    for (const cat of CATEGORY_ORDER) {
      const defs = [...app.registry.values()].filter((d) => !d.hidden && !d.featured && d.category === cat.id && matches(d));
      if (!defs.length) continue;
      const grid = h('div', { class: 'card-grid' });
      for (const d of defs) grid.append(filterCard(app, d, tap));
      list.append(h('section', { class: 'cat' }, h('h3', { class: 'cat-title' }, h('span', { class: 'cat-icon' }, cat.icon), t(`cat.${cat.id}`), h('span', { class: 'cat-count' }, String(defs.length))), grid));
    }
    if (!list.childElementCount) list.append(h('p', { class: 'muted' }, t('noResults')));
  };

  /**
   * Re-renders without moving the list: the card `id` (the one just tapped), or else the first card
   * in view, stays where it was on screen while the active filters above it grow or shrink. At the
   * very top nothing is held, so a filter that finishes loading shows up there as usual.
   */
  const steady = (fn: () => void, id?: string) => {
    const body = root.parentElement;
    if (!body || !root.isConnected || (!id && body.scrollTop <= 0)) { fn(); return; }
    const top = body.getBoundingClientRect().top;
    const cards = [...list.querySelectorAll<HTMLElement>('.fcard')];
    const ref = id ? cards.find((c) => c.dataset.id === id) : cards.find((c) => c.getBoundingClientRect().bottom > top);
    const key = ref?.dataset.id;
    const before = ref?.getBoundingClientRect().top;
    fn();
    const now = key ? list.querySelector<HTMLElement>(`.fcard[data-id="${CSS.escape(key)}"]`) : null;
    if (before !== undefined && now) body.scrollTop += now.getBoundingClientRect().top - before;
  };
  let tapping = false;
  function tap(id: string) {
    // Compare two filters starts with its chart open (and the sheet out of the way on a phone).
    if (id === 'compare' && !app.isActive(id)) { app.emit('compare'); return; }
    tapping = true;
    try { steady(() => { app.toggle(id); renderActive(); renderList(); }, id); } finally { tapping = false; }
  }

  renderActive(); renderLabels(); renderList();
  const off1 = app.on('layers', () => {
    const update = () => { renderActive(); updateCards(list, app); };
    if (tapping) update(); else steady(update);
  });
  const off2 = app.on('registry', () => steady(renderList));
  return Object.assign(root, { bar: searchRow, dispose: () => { off1(); off2(); } });
}

function updateCards(list: HTMLElement, app: App) {
  list.querySelectorAll<HTMLElement>('.fcard').forEach((c) => {
    const on = app.isActive(c.dataset.id!);
    c.classList.toggle('on', on);
    c.setAttribute('aria-pressed', String(on));
  });
}

function filterCard(app: App, d: LayerDef, onTap: (id: string) => void): HTMLElement {
  const on = app.isActive(d.id);
  const card = h('button', { type: 'button', class: `fcard${on ? ' on' : ''}`, 'data-id': d.id, 'aria-pressed': String(on), title: tx(d.desc) },
    h('span', { class: 'fcard-icon' }, d.icon),
    h('span', { class: 'fcard-text' }, h('span', { class: 'fcard-name' }, tx(d.name)), h('span', { class: 'fcard-desc' }, tx(d.desc))),
    h('span', { class: 'fcard-check' }, icon(Check, 14)));
  card.addEventListener('click', () => onTap(d.id));
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
      fillSelect(sel, o.choices.map((c) => ({ value: c.value, label: `${c.icon ? c.icon + ' ' : ''}${tx(c.label)}`, group: c.group ? tx(c.group) : undefined })));
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
