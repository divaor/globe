// The search box (v0.29.0): countries, cities, states and provinces, coordinates, and what the filters show — the people
// of Who was born here?, museums, masterpieces, buildings, World Heritage sites… — first those of the filters that are
// on, then those of filters that are off (choosing one turns it on). With a filter whose legend lists categories on,
// its entries too ("Portuguese" with Languages). Names match in any word order, by their start, with a typo or two,
// in English or Spanish (ui/match.ts). A result takes you there: close to a dot, ringed, with its card. An empty box
// shows your last searches.
import { Search, X, History } from 'lucide';
import { h, icon, clear } from './dom';
import { t, tx, fmtCompact, flagEmoji, L } from '../app/i18n';
import { matcher, parseCoords, fmtCoords } from './match';
import { regions, loadRegions, regionType, type Region } from '../engine/regions';
import { geoBounds } from 'd3-geo';
import type { App } from '../app/app';
import type { LayerDef, LayerHit, LayerInstance, LegendItem } from '../layers/types';

export interface Hit {
  kind: 'country' | 'city' | 'place'; id?: string; lon: number; lat: number; label: string; sub: string; score: number; zoom?: number;
  /** Its own icon, and what choosing it does (another world's places). */
  icon?: string; pick?: () => void;
  /** Where it comes from, shown beside it ("👶 Who was born here?"). */
  tag?: string;
}
/** Another source of places (another world's names): returns hits, or null to search the Earth. */
export type SearchProvider = { hint: () => string; search: (q: string, score: (name: string) => number) => Hit[] } | null;

const RECENT_KEY = 'atlas-globe:recent-search';
const MAX = 14;

export class SearchBox {
  readonly el: HTMLElement;
  private input: HTMLInputElement;
  private results: HTMLElement;
  private hits: Hit[] = [];
  private active = 0;
  /** Called with the chosen place (e.g. to pulse a marker). */
  onPick: ((lon: number, lat: number) => void) | null = null;
  /** Set while another world is on the globe (space/space.ts). */
  provider: () => SearchProvider = () => null;
  /** More things to find from the Earth: the sky's stars, constellations and objects, the elements (sky/), lives. */
  extra: ((q: string, score: (name: string) => number) => Hit[])[] = [];
  /** What a filter's result does (the shell: turn the filter on if it is off, fly, ring the dot, open its card). */
  onLayerHit: ((def: LayerDef, inst: LayerInstance | null, hit: LayerHit) => void) | null = null;
  /** A legend entry chosen: highlight its countries (the shell's legend). */
  onLegendItem: ((inst: LayerInstance, item: LegendItem) => void) | null = null;
  /** A state chosen: fly there and outline it (the shell). */
  onRegion: ((r: Region) => void) | null = null;
  /** Filters that are off whose data is loading for the search. */
  private loading = new Set<string>();

  constructor(private app: App) {
    this.input = h('input', { type: 'search', class: 'search-field', placeholder: t('searchHint'), 'aria-label': t('search'), autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
    this.results = h('div', { class: 'search-results', role: 'listbox' });
    const closeBtn = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': t('close') }, icon(X, 16));
    closeBtn.addEventListener('click', () => this.close());
    this.el = h('div', { class: 'search-pop glass', hidden: true }, h('div', { class: 'search-bar' }, icon(Search, 18), this.input, closeBtn), this.results);
    this.input.addEventListener('input', () => this.update());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { this.active = Math.min(this.hits.length - 1, this.active + 1); this.draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { this.active = Math.max(0, this.active - 1); this.draw(); e.preventDefault(); }
      else if (e.key === 'Enter') { const hit = this.hits[this.active]; if (hit) this.choose(hit); }
      else if (e.key === 'Escape') this.close();
    });
  }

  get isOpen() { return !this.el.hidden; }

  open(text = '') {
    this.el.hidden = false;
    this.input.placeholder = this.provider()?.hint() ?? this.hint();
    this.input.value = text;
    // States and provinces are searched too: their shapes load in the background (once).
    if (!this.provider() && !regions()) void loadRegions().then(() => this.refresh(), () => {});
    this.update();
    setTimeout(() => this.input.focus(), 30);
  }

  close() { this.el.hidden = true; this.input.blur(); }

  /** Searches again (a source's data has arrived). */
  refresh() { if (this.isOpen) { const a = this.active; this.update(); this.active = Math.min(a, Math.max(0, this.hits.length - 1)); this.draw(); } }

  /** "Search places and countries", plus what the filters on add ("people born there, museums"). */
  private hint(): string {
    const es = this.app.lang === 'es';
    const more = this.app.layers.filter((l) => l.ready && l.def.searchHint).map((l) => (tx(l.def.searchHint!)));
    if (!more.length) return t('searchHint');
    return `${L('Places', 'Lugares')}, ${[...new Set(more)].slice(0, 3).join(', ')}…`;
  }

  private update() {
    const q = this.input.value.trim();
    this.hits = q.length < 1 ? [] : this.search(q);
    this.active = 0;
    this.draw();
  }

  /** The results for q, the best first. */
  search(q: string): Hit[] {
    const score = matcher(q);
    const other = this.provider();
    if (other) return other.search(q, score).sort((a, b) => b.score - a.score).slice(0, 12);
    const es = this.app.lang === 'es';
    const out: Hit[] = [];
    const coords = parseCoords(q);
    if (coords) out.push({ kind: 'place', lon: coords[1], lat: coords[0], label: fmtCoords(coords), sub: L('Coordinates', 'Coordenadas'), score: 200, zoom: 30, icon: '📍' });
    for (const [id, m] of Object.entries(this.app.data.meta)) {
      const s = Math.max(score(m.n), score(m.es), m.ab ? score(m.ab) * 0.6 : 0, id.toLowerCase() === q.toLowerCase() ? 90 : 0);
      if (s > 0) out.push({ kind: 'country', id, lon: m.lx, lat: m.ly, label: es ? m.es : m.n, sub: `${flagEmoji(m.a2)} ${t(`cont.${m.ct}`)}`, score: s + 15 + Math.max(0, 6 - m.lr) });
    }
    for (const c of this.app.data.cities) {
      const s = Math.max(score(c.name), c.es ? score(c.es) : 0);
      if (s <= 0) continue;
      const country = this.app.data.meta[c.country];
      const cname = country ? (es ? country.es : country.n) : c.country;
      out.push({
        kind: 'city', lon: c.lon, lat: c.lat, label: es && c.es ? c.es : c.name,
        sub: `${c.capital === 2 ? '🏛️ ' : ''}${c.admin1 ? c.admin1 + ', ' : ''}${cname} · ${fmtCompact(c.pop)}`,
        score: s + Math.log10(Math.max(10, c.pop)) * 2 + (c.capital === 2 ? 6 : 0), zoom: c.pop > 5e6 ? 14 : c.pop > 1e6 ? 22 : 34,
      });
    }
    // States and provinces.
    const rg = regions();
    if (rg) {
      for (const r of rg.regions) {
        const s = Math.max(score(r.name), score(r.es));
        if (s < 45) continue;
        const country = this.app.data.meta[r.country];
        const kind = regionType(r, es);
        out.push({
          kind: 'place', lon: r.lon, lat: r.lat, label: es ? r.es : r.name, icon: '🗺️',
          sub: `${kind ?? (L('Region', 'Región'))}${country ? `, ${es ? country.es : country.n}` : ''}`,
          score: s + Math.min(10, r.size * 60), pick: () => this.onRegion?.(r),
        });
      }
    }
    // What the filters show: those on first, then those off (choosing one turns it on).
    const on = new Map(this.app.layers.filter((l) => l.ready).map((l) => [l.def.id, l]));
    for (const def of this.app.registry.values()) {
      if (!def.search || def.hidden) continue;
      const inst = on.get(def.id) ?? null;
      if (!inst) {
        // A filter that is off: searched once its data is here (asked for the first time something of 3 letters is typed).
        if (q.length < 3 || !def.searchLoad) continue;
        if (!this.loaded.has(def.id)) {
          if (!this.loading.has(def.id)) {
            this.loading.add(def.id);
            void def.searchLoad().then(() => { this.loaded.add(def.id); this.refresh(); }, () => {}).finally(() => this.loading.delete(def.id));
          }
          continue;
        }
      }
      const stand = inst ?? this.standIn(def);
      let hits: LayerHit[] = [];
      try { hits = def.search(score, stand, this.app.lang); } catch (e) { console.error('search', def.id, e); }
      const name = tx(def.name);
      for (const hit of hits) {
        out.push({
          kind: 'place', lon: hit.lon, lat: hit.lat, label: hit.label, sub: hit.sub, icon: hit.icon,
          // What the filters on show comes first, unless it only matched with typos.
          score: hit.score + (inst ? (hit.score >= 55 ? 22 : 6) : 0), tag: inst ? `${def.icon} ${name}` : `${def.icon} ${name} · ${L('turns it on', 'lo enciende')}`,
          pick: () => this.onLayerHit?.(def, inst, hit),
        });
      }
    }
    // A filter's legend entries (its categories): highlight their countries.
    for (const inst of on.values()) {
      if (!inst.def.legend || inst.def.hidden) continue;
      let lg;
      try { lg = inst.def.legend(inst, this.app.lang); } catch { continue; }
      if (!lg || lg.kind !== 'categories') continue;
      for (const it of lg.items) {
        if (!it.ids?.length) continue;
        const s = score(it.label.replace(/\s*\([\d.,\s KkMm%]+\)\s*$/, ''));
        if (s < 50) continue;
        const n = it.count ?? it.ids.length;
        out.push({
          kind: 'place', lon: 0, lat: 0, label: it.label, icon: it.icon && it.shape === 'emoji' ? it.icon : '🎨',
          sub: L('{0, plural, one {# country} other {# countries}} on the map', '{0, plural, one {# país} other {# países}} en el mapa', n),
          score: s + 18, tag: `${inst.def.icon} ${tx(inst.def.name)}`, pick: () => this.onLegendItem?.(inst, it),
        });
      }
    }
    for (const f of this.extra) out.push(...f(q, score));
    // The best first; the same name and place only once; with a strong match, no far-fetched ones (typos) after it.
    const seen = new Set<string>();
    out.sort((a, b) => b.score - a.score);
    const floor = out.length && out[0].score >= 90 ? out[0].score * 0.55 : 0;
    return out.filter((x) => {
      if (x.score < floor) return false;
      const k = `${x.label}|${Math.round(x.lon * 10)}|${Math.round(x.lat * 10)}|${x.tag ?? ''}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, MAX);
  }

  /** Filters that are off whose data has arrived. */
  private loaded = new Set<string>();
  /** A filter that is off, as its search sees it: its default options. */
  private standIn(def: LayerDef): LayerInstance {
    const options: Record<string, string | boolean> = {};
    for (const o of def.options ?? []) options[o.id] = o.default;
    return { def, opacity: 1, options, ready: true, state: {} };
  }

  private recent(): string[] {
    try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 6) : []; } catch { return []; }
  }
  private remember(text: string) {
    const list = [text, ...this.recent().filter((x) => x.toLowerCase() !== text.toLowerCase())].slice(0, 6);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* private mode */ }
  }

  private draw() {
    clear(this.results);
    if (!this.hits.length) {
      if (this.input.value.trim()) {
        const busy = this.loading.size > 0;
        this.results.append(h('div', { class: 'search-empty muted' }, busy ? (L('Searching…', 'Buscando…')) : t('noResults')));
        return;
      }
      // An empty box: the last searches.
      const recent = this.provider() ? [] : this.recent();
      if (recent.length) {
        this.results.append(h('div', { class: 'search-group muted' }, L('Recent searches', 'Búsquedas recientes')));
        for (const text of recent) {
          const item = h('button', { type: 'button', class: 'search-item recent', 'data-recent': text }, h('span', { class: 'si-icon' }, icon(History, 16)), h('span', { class: 'si-text' }, h('span', { class: 'si-label' }, text)));
          item.addEventListener('click', () => { this.input.value = text; this.update(); this.input.focus(); });
          this.results.append(item);
        }
      }
      return;
    }
    this.hits.forEach((hit, i) => {
      const item = h('button', { type: 'button', class: `search-item${i === this.active ? ' on' : ''}`, role: 'option' },
        h('span', { class: 'si-icon' }, hit.icon ?? (hit.kind === 'country' ? '🏳️' : '📍')),
        h('span', { class: 'si-text' }, h('span', { class: 'si-label' }, hit.label), h('span', { class: 'si-sub' }, hit.sub),
          hit.tag ? h('span', { class: 'si-tag' }, hit.tag) : null));
      item.addEventListener('click', () => this.choose(hit));
      this.results.append(item);
    });
  }

  private choose(hit: Hit) {
    if (!this.provider()) this.remember(hit.label);
    this.close();
    if (hit.pick) { hit.pick(); return; }
    if (hit.kind === 'country' && hit.id) this.app.flyToCountry(hit.id);
    else {
      const flat = this.app.renderer.view.current.kind === 'flat';
      this.app.flyTo(hit.lon, hit.lat, flat ? (hit.zoom ?? 20) * 0.6 : hit.zoom);
      const id = this.app.renderer.countryAt(hit.lon, hit.lat);
      if (id) this.app.select(id);
    }
    this.onPick?.(hit.lon, hit.lat);
  }
}

/** The bounds of a state, for the camera. */
export function regionView(r: Region): { lon: number; lat: number; span: number } {
  const [[w, s], [e, n]] = geoBounds(r.shape.feature);
  const dLon = ((e - w + 360) % 360) || 1;
  return { lon: r.lon, lat: r.lat, span: Math.max(dLon * Math.cos(((s + n) / 2) * Math.PI / 180), n - s) };
}
