// Search countries and cities (English and Spanish names, accent-insensitive) and fly there.
import { Search, X } from 'lucide';
import { h, icon, clear, normalize } from './dom';
import { t, fmtCompact, flagEmoji } from '../app/i18n';
import type { App } from '../app/app';

interface Hit { kind: 'country' | 'city'; id?: string; lon: number; lat: number; label: string; sub: string; score: number; zoom?: number }

export class SearchBox {
  readonly el: HTMLElement;
  private input: HTMLInputElement;
  private results: HTMLElement;
  private hits: Hit[] = [];
  private active = 0;
  /** Called with the chosen place (e.g. to pulse a marker). */
  onPick: ((lon: number, lat: number) => void) | null = null;

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

  open() {
    this.el.hidden = false;
    this.input.placeholder = t('searchHint');
    this.input.value = '';
    this.update();
    setTimeout(() => this.input.focus(), 30);
  }

  close() { this.el.hidden = true; this.input.blur(); }

  private update() {
    const q = normalize(this.input.value.trim());
    this.hits = q.length < 1 ? [] : this.search(q);
    this.active = 0;
    this.draw();
  }

  private search(q: string): Hit[] {
    const out: Hit[] = [];
    const score = (name: string) => {
      const n = normalize(name);
      if (n === q) return 100;
      if (n.startsWith(q)) return 80;
      if (n.split(/[\s\-'’(]+/).some((w) => w.startsWith(q))) return 60;
      if (q.length >= 3 && n.includes(q)) return 30;
      return 0;
    };
    const es = this.app.lang === 'es';
    for (const [id, m] of Object.entries(this.app.data.meta)) {
      const s = Math.max(score(m.n), score(m.es), m.ab ? score(m.ab) * 0.6 : 0, id.toLowerCase() === q ? 90 : 0);
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
    return out.sort((a, b) => b.score - a.score).slice(0, 12);
  }

  private draw() {
    clear(this.results);
    if (!this.hits.length) {
      if (this.input.value.trim()) this.results.append(h('div', { class: 'search-empty muted' }, t('noResults')));
      return;
    }
    this.hits.forEach((hit, i) => {
      const item = h('button', { type: 'button', class: `search-item${i === this.active ? ' on' : ''}`, role: 'option' },
        h('span', { class: 'si-icon' }, hit.kind === 'country' ? '🏳️' : '📍'),
        h('span', { class: 'si-text' }, h('span', { class: 'si-label' }, hit.label), h('span', { class: 'si-sub' }, hit.sub)));
      item.addEventListener('click', () => this.choose(hit));
      this.results.append(item);
    });
  }

  private choose(hit: Hit) {
    this.close();
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
