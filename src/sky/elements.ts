// Where the elements come from (v0.21.0): the periodic table coloured by the share of each element in the Solar System
// that each process made (after Jennifer Johnson, 2019): the Big Bang, cosmic rays, dying low-mass stars, exploding
// massive stars, exploding white dwarfs, merging neutron stars, and people. A tap opens an element's card: where it is
// made in the sky, where it is mined on Earth (the resources filter) and where it was discovered (the globe).
import { X } from 'lucide';
import { h, icon, clear } from '../ui/dom';
import { loadJSON } from '../data/store';
import { wikiThumb } from '../modes/stories';
import { tr, L, type Text } from './data';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { Space } from '../space/space';
import type { Sky } from './sky';
import type { InfoRow } from '../layers/types';
import type { Hit } from '../ui/search';

export interface Element {
  z: number; symbol: string; name: Text;
  origin: Record<string, number>;
  made?: Text; sky?: string; earth?: Text; mined?: string;
  discovered?: { year?: number; who?: Text; place?: Text; at?: [number, number] };
  uses?: Text; fact?: Text; wiki?: Text;
}
interface Mineral { en: string; es: string; emoji: string; year: number; producers: [string, number][]; elements?: string[] }

export const ORIGINS: { id: string; color: string; name: Text; short: Text }[] = [
  { id: 'bigbang', color: '#6f8dff', name: { en: 'The Big Bang', es: 'El Big Bang' }, short: { en: 'Big Bang', es: 'Big Bang' } },
  { id: 'cosmic', color: '#ff7eb6', name: { en: 'Cosmic rays splitting atoms', es: 'Rayos cósmicos que parten átomos' }, short: { en: 'Cosmic rays', es: 'Rayos cósmicos' } },
  { id: 'lowmass', color: '#6fd39a', name: { en: 'Dying low-mass stars', es: 'Estrellas de poca masa al morir' }, short: { en: 'Dying small stars', es: 'Estrellas pequeñas al morir' } },
  { id: 'massive', color: '#ffcf5c', name: { en: 'Exploding massive stars', es: 'Estrellas masivas que estallan' }, short: { en: 'Exploding big stars', es: 'Estrellas grandes que estallan' } },
  { id: 'wd', color: '#86e3ff', name: { en: 'Exploding white dwarfs', es: 'Enanas blancas que estallan' }, short: { en: 'Exploding white dwarfs', es: 'Enanas blancas que estallan' } },
  { id: 'ns', color: '#b98cff', name: { en: 'Merging neutron stars', es: 'Choques de estrellas de neutrones' }, short: { en: 'Neutron star mergers', es: 'Choques de estrellas de neutrones' } },
  { id: 'human', color: '#9aa3b5', name: { en: 'Made by people', es: 'Hecho por las personas' }, short: { en: 'Made by people', es: 'Hecho por personas' } },
  { id: 'none', color: '#454c5c', name: { en: 'Too short-lived to last from stars', es: 'Duran demasiado poco para quedar de las estrellas' }, short: { en: 'Short-lived', es: 'De vida corta' } },
];
const ORIGIN_ICON: Record<string, string> = { bigbang: '💥', cosmic: '☄️', lowmass: '🌫️', massive: '🌟', wd: '⚪', ns: '💫', human: '🧪', none: '⏳' };
export const originName = (id: string) => tr(ORIGINS.find((o) => o.id === id)?.name);

/** Row and column of an element in an 18-column table, with the lanthanides and actinides in rows 9 and 10. */
export function cellOf(z: number): [number, number] {
  if (z === 1) return [1, 1];
  if (z === 2) return [1, 18];
  const starts = [[3, 2], [11, 3], [19, 4], [37, 5], [55, 6], [87, 7]];
  if (z >= 57 && z <= 71) return [9, z - 57 + 3];
  if (z >= 89 && z <= 103) return [10, z - 89 + 3];
  for (let i = starts.length - 1; i >= 0; i--) {
    const [z0, row] = starts[i];
    if (z < z0) continue;
    const k = z - z0;
    if (row <= 3) return [row, k < 2 ? k + 1 : k + 11];
    if (row <= 5) return [row, k + 1];
    // Periods 6 and 7: the s-block, then (after the 15 of the f-block, shown below) groups 4 to 18.
    return [row, k < 2 ? k + 1 : k - 13];
  }
  return [1, 1];
}

/** The element's main origin (the largest share). */
export const mainOrigin = (e: Element) => Object.entries(e.origin).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';

export class Elements {
  private el: HTMLElement | null = null;
  private els: Element[] | null = null;
  private minerals: Record<string, Mineral> | null = null;
  private filter: string | null = null;
  private mark: string | null = null;
  info = { open: false, cells: 0, filter: null as string | null };

  constructor(private app: App, private shell: Shell, private space: Space, private sky: Sky) {
    space.openElements = (sym?: string) => void this.open(sym);
    space.closers.push({ owner: this, close: () => this.close() });
    // Elements in search: the first search loads them (they show from the next letter on).
    shell.search.extra.push((q, score) => { if (!this.els) { void this.load().catch(() => {}); return []; } return this.els.flatMap((e): Hit[] => {
      const sc = Math.max(score(e.name.en), score(e.name.es), e.symbol.toLowerCase() === q ? 95 : 0);
      return sc > 0 ? [{ kind: 'place', lon: 0, lat: 0, label: `${tr(e.name)} (${e.symbol})`, sub: `${L('Element', 'Elemento')} ${e.z} · ${originName(mainOrigin(e))}`, score: sc + 2, icon: '⚗️', pick: () => void this.open(e.symbol) }] : [];
    }); });
  }

  get isOpen() { return !!this.el; }

  async load(): Promise<Element[]> {
    if (!this.els) this.els = (await loadJSON<{ elements: Element[] }>('sky/elements.json')).elements;
    return this.els;
  }

  async open(symbol?: string) {
    if (!this.el) {
      this.space.closeOverlays(this);
      this.shell.sheet.close();
      this.shell.card.hide();
      const body = h('div', { class: 'elm-body' });
      const close = h('button', { type: 'button', class: 'icon-btn orr-close elm-close', 'aria-label': L('Close the table', 'Cerrar la tabla') }, icon(X, 20));
      close.addEventListener('click', () => this.close());
      this.el = h('div', { class: 'orr elm', role: 'dialog', 'aria-label': L('Where the elements come from', 'De dónde vienen los elementos') },
        h('div', { class: 'orr-head glass' }, h('strong', null, `⚗️ ${L('Where the elements come from', 'De dónde vienen los elementos')}`), h('span', { class: 'orr-date' }), close),
        body);
      document.documentElement.classList.add('orrery-open');
      this.app.root.append(this.el);
      window.addEventListener('keydown', this.onKey);
      this.info.open = true;
    }
    const els = await this.load().catch(() => [] as Element[]);
    if (!this.el) return;
    this.render(els);
    if (symbol) { const e = els.find((x) => x.symbol === symbol); if (e) void this.card(e); }
  }

  /** For tours: the table with one origin highlighted and one element marked, without a card. */
  async show(origin: string | null, mark: string | null) {
    this.filter = origin; this.mark = mark;
    await this.open();
    this.shell.card.hide();
  }

  private onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(); };

  close() {
    if (!this.el) return;
    this.el.remove(); this.el = null; this.mark = null;
    this.info.open = false;
    document.documentElement.classList.remove('orrery-open');
    window.removeEventListener('keydown', this.onKey);
    this.shell.card.hide();
  }

  private render(els: Element[]) {
    const body = this.el!.querySelector('.elm-body')!;
    clear(body);
    const legend = h('div', { class: 'chip-row elm-legend' });
    for (const o of ORIGINS) {
      if (!els.some((e) => (e.origin[o.id] ?? 0) > 0)) continue;
      const b = h('button', { type: 'button', class: `chip elm-chip${this.filter === o.id ? ' on' : ''}`, 'data-origin': o.id }, h('span', { class: 'elm-dot', style: `background:${o.color}` }), tr(o.short));
      b.addEventListener('click', () => { this.filter = this.filter === o.id ? null : o.id; this.render(els); });
      legend.append(b);
    }
    const grid = h('div', { class: 'elm-grid' });
    for (const e of els) {
      const [row, col] = cellOf(e.z);
      // The cell is filled from the bottom with each origin's share, in the legend's order.
      let acc = 0;
      const stops: string[] = [];
      for (const o of ORIGINS) {
        const f = e.origin[o.id] ?? 0;
        if (f <= 0) continue;
        stops.push(`${o.color} ${Math.round(acc * 100)}% ${Math.round((acc + f) * 100)}%`);
        acc += f;
      }
      if (acc < 0.999) stops.push(`#2a303c ${Math.round(acc * 100)}% 100%`);
      const dim = this.filter && (e.origin[this.filter] ?? 0) < 0.25;
      const c = h('button', { type: 'button', class: `elm-cell${dim ? ' dim' : ''}${this.mark === e.symbol ? ' mark' : ''}`, 'data-z': String(e.z), title: tr(e.name), style: `grid-row:${row};grid-column:${col};background:linear-gradient(to top, ${stops.join(', ')})` },
        h('span', { class: 'elm-z' }, String(e.z)), h('span', { class: 'elm-sym' }, e.symbol));
      c.addEventListener('click', () => void this.card(e));
      grid.append(c);
    }
    // The gaps that hold the lanthanides and actinides.
    grid.append(h('div', { class: 'elm-gap', style: 'grid-row:6;grid-column:3' }, '57–71'), h('div', { class: 'elm-gap', style: 'grid-row:7;grid-column:3' }, '89–103'));
    const note = h('p', { class: 'muted small elm-note' }, L(
      'Each square is filled with the share of that element in the Solar System made by each process, after Jennifer A. Johnson (2019). Tap an element.',
      'Cada casilla se llena con la parte de ese elemento del sistema solar que hizo cada proceso, según Jennifer A. Johnson (2019). Toca un elemento.'));
    body.append(legend, h('div', { class: 'elm-scroll' }, grid), note);
    this.info.cells = els.length; this.info.filter = this.filter;
  }

  private async mineral(key: string): Promise<Mineral | null> {
    if (!this.minerals) this.minerals = await loadJSON<Record<string, Mineral>>('attributes/minerals.json').catch(() => ({}));
    return this.minerals[key] ?? null;
  }

  async card(e: Element) {
    const rows: InfoRow[] = [];
    rows.push({ icon: '🔢', label: L('Atomic number', 'Número atómico'), value: String(e.z) });
    for (const [id, f] of Object.entries(e.origin).sort((a, b) => b[1] - a[1])) {
      if (f <= 0) continue;
      const o = ORIGINS.find((x) => x.id === id);
      rows.push({ icon: o ? ORIGIN_ICON[o.id] ?? '●' : '●', label: tr(o?.name), value: `${Math.round(f * 100)} %` });
    }
    const links: { label: string; href?: string; onClick?: () => void }[] = [];
    if (e.sky === 'CMB') links.push({ label: L('See the oldest light', 'Ver la luz más antigua'), onClick: () => { this.close(); this.sky.open({ frame: 'celestial', target: 'HUDF', fov: 60 }); } });
    else if (e.sky) links.push({ label: L('Where it is made, in the sky', 'Dónde se forma, en el cielo'), onClick: () => { this.close(); this.sky.open({ frame: 'celestial', target: e.sky, fov: 40 }); } });
    const m = e.mined ? await this.mineral(e.mined) : null;
    if (m) {
      const top = m.producers.slice(0, 4).map(([id, p]) => `${this.app.data.name(id, this.app.lang)} ${Math.round(p)} %`).join(', ');
      rows.push({ icon: m.emoji, label: L(`Mined (${m.year})`, `Producción (${m.year})`), value: top });
      links.push({ label: L('Show who mines it', 'Ver quién lo extrae'), onClick: () => this.showMined(e.mined!) });
    }
    const d = e.discovered;
    if (d) {
      // Known since ancient times: the text says so ("Known since antiquity; ...").
      const when = d.year == null ? '' : d.year < 0 ? (d.who ? '' : L('ancient times', 'la Antigüedad')) : String(d.year);
      const who = d.who ? tr(d.who) : '';
      rows.push({ icon: '🔬', label: L('Discovered', 'Descubrimiento'), value: [when, who, d.place ? tr(d.place) : ''].filter(Boolean).join(' · ') });
      if (d.at) links.push({ label: L('Where it was discovered', 'Dónde se descubrió'), onClick: () => { this.close(); this.app.flyTo(d.at![0], d.at![1], 7); } });
    }
    if (e.uses) rows.push({ icon: '🛠️', label: L('Uses', 'Usos'), value: tr(e.uses) });
    if (e.wiki?.en) links.push({ label: 'Wikipedia', href: `https://${tr(e.wiki) ? L('en', 'es') : 'en'}.wikipedia.org/wiki/${encodeURIComponent((tr(e.wiki) || e.wiki.en).replace(/ /g, '_'))}` });
    const notes = [e.made ? `✨ ${tr(e.made)}` : '', e.earth ? `🌍 ${tr(e.earth)}` : '', e.fact ? `💡 ${tr(e.fact)}` : ''].filter(Boolean);
    this.shell.card.showCustom(e.symbol, tr(e.name), originName(mainOrigin(e)), rows, links, notes, e.wiki ? wikiThumb(e.wiki) : undefined);
  }

  /** Closes the table and shows the producers of a commodity with the resources filter. */
  private showMined(key: string) {
    this.close();
    const app = this.app;
    if (app.layers.some((l) => l.def.id === 'resources')) app.setOption('resources', 'res', key);
    else void app.activate('resources', { options: { res: key } });
  }
}
