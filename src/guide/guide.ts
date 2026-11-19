// The travel guide (v0.26.0): pick the cities you want to visit and, for each one, what to eat, what to see, its
// museums, what the stories tell of it and the practical facts (languages, money, plugs, the clock, the weather month
// by month). The trip is drawn on the map in order, can be put in the best order, kept on this device, shared as a
// link and printed. Wikivoyage's "Eat" overview is read live in the browser and credited (it is not stored here).
// Data: public/data/guide (scripts/data/guide/build-guide.mjs).
import { recordFeat } from '../learn/progress';
import { Luggage, Plus, Check, X, ArrowUp, ArrowDown, Map as MapIcon, Shuffle, Share2, Printer, Trash2, Star, ExternalLink, ChevronLeft, Compass } from 'lucide';
import { geoInterpolate } from 'd3-geo';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { TimeTravel } from '../modes';
import type { Learn } from '../learn/learn';
import type { RenderCtx } from '../layers/types';
import type { ArtGuide } from '../artguide/artguide';
import type { Wild } from '../wild/finder';
import type { StoryKind } from '../modes/stories';
import { storyKind } from '../modes/stories';
import { TOURS } from '../learn/tours';
import { h, icon, clear } from '../ui/dom';
import { lang, flagEmoji, fmtNumber, fmtCompact, L, dataLang, tx, Lc } from '../app/i18n';
import { loadJSON } from '../data/store';
import { km, bestMonths, monthRanges, sunTimes, tzOffset, hhmm, flightHours, hoursText, bestOrder, tripKm, tripHash, readTrip, type Climate } from './logic';
import { planHooks, planStar, placesOf, allPlaces, movePlace, removePlace, dropCity, setPlan, tripDetails, PLACE_ICONS, type Place, type PlaceSpec } from './plan';
import { tripPanelExtras, packPlaces, unpackPlaces } from './export';
import { appLocale } from '../app/i18n';

const es = () => lang() === 'es';
const KEY = 'atlas-globe:trip';

export interface GuideCity {
  id: string; name: string; es: string; at: [number, number]; country: string; pop: number; capital: number; admin1: string; tz: string;
  qid: string | null; wv: { en: string | null; es: string | null }; wp: { en: string | null; es: string | null }; climate: Climate | null;
  /** Other names it goes by ("Cusco" for Cuzco). */
  also: string[];
}
/** [id, where (here, country, near, crop), km, icon, name, nombre, cat, story, step, place, lugar, date, lon, lat] */
type Dish = [string, string, number, string, string, string, string, string, number, string, string, string, number, number];
/** [ref, km, name, nombre, cat (c, n, m), year listed, lon, lat, picture, Wikipedia en, es] */
type Site = [number, number, string, string, string, number, number, number, string | null, string | null, string | null];
/** [collection, story, step, icon, name, nombre, lon, lat, date, km] */
type Ref = [StoryKind, string, number, string, string, string, number, number, string, number];
/** [Wikidata id, name, nombre, kind (art, history, science, other), visitors a year, Wikipedias, [lon, lat], website] */
type Museum = [string, string, string, string, number, number, [number, number] | null, string | null];
export interface CityGuide { id: string; eat: Dish[]; grown: Dish[]; whs: Site[]; trips: Site[]; sights: Ref[]; history: Ref[]; museums: Museum[] }

export type Tab = 'eat' | 'see' | 'museums' | 'art' | 'buildings' | 'people' | 'facts' | 'history' | 'more';
const TABS: [Tab, string, { en: string; es: string }][] = [
  ['eat', '🍽️', { en: 'Eat', es: 'Comer' }], ['see', '🏛️', { en: 'See', es: 'Ver' }], ['museums', '🖼️', { en: 'Museums', es: 'Museos' }],
  ['art', '🎨', { en: 'Art', es: 'Arte' }], ['buildings', '📐', { en: 'Buildings', es: 'Edificios' }], ['people', '👤', { en: 'People', es: 'Personas' }],
  ['facts', 'ℹ️', { en: 'Facts', es: 'Datos' }], ['history', '📜', { en: 'History here', es: 'Historia aquí' }], ['more', '📖', { en: 'Read more', es: 'Más' }],
];
const MONTHS = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] };
const MONTH_NAMES = { en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] };
const MUSEUM_KINDS: [string, { en: string; es: string }][] = [['art', { en: 'Art', es: 'Arte' }], ['history', { en: 'History and archaeology', es: 'Historia y arqueología' }], ['science', { en: 'Science and nature', es: 'Ciencia y naturaleza' }], ['other', { en: 'More museums', es: 'Más museos' }]];
const commons = (file: string, w = 120) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=${w}`;
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export class TravelGuide {
  private index: GuideCity[] | null = null;
  private byId = new Map<string, GuideCity>();
  private guides = new Map<string, Promise<CityGuide | null>>();
  private attrs: Record<string, Record<string, unknown>> | null = null;
  /** The cities of your trip, in order (kept on this device). */
  trip: string[] = [];
  /** The guide is open: its cities are dots on the map, and a tap on one opens its guide. */
  private picking = false;
  /** The trip stays drawn on the map after the guide is closed ("Show on the map"). */
  private onMap = false;
  private pin: { at: [number, number]; text: string } | null = null;
  /** The panel is closing to show something on the map: the dots and the pin stay. */
  private keep = false;
  /** The guide moved the map's centre up, above its panel (phones). */
  private insetSet = false;
  private query = '';
  private city: string | null = null;
  private tab: Tab = 'eat';
  private wv = new Map<string, Promise<{ paras: string[]; url: string; lang: string } | null>>();
  /** The art and architecture guide (v0.27.0): the Art and Buildings tabs. */
  art: ArtGuide | null = null;
  /** Wild world (v0.30.0): the See tab's Wildlife nearby. */
  wild: Wild | null = null;
  /** Green planet (v0.31.0): nature's spectacles near the city, in its Facts tab. */
  plants: { spectaclesNearby(el: HTMLElement, at: [number, number], city: string, cityId?: string): Promise<void> } | null = null;
  /** Lives on the map (v0.28.0): the People tab (who was born here, the lives that pass through). */
  lives: { peopleTab(el: HTMLElement, c: GuideCity, name: string): Promise<void> } | null = null;
  /** For the smoke test: what the guide shows. */
  get info() { return { trip: [...this.trip], city: this.city, tab: this.tab, picking: this.picking, onMap: this.onMap, pin: this.pin }; }

  constructor(private app: App, private shell: Shell, private time: TimeTravel, private learn: Learn) {
    try { const t = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(t)) this.trip = t.filter((x) => typeof x === 'string'); } catch { /* private mode */ }
    shell.addMenu({ id: 'guide', icon: Luggage, label: () => L('Travel guide', 'Guía de viaje'), order: 28, group: 'explore', onClick: () => void this.open() });
    // "Plan a trip" on a country's card: the guide, searching that country's cities.
    shell.card.actions.push((id) => {
      const b = h('button', { type: 'button', class: 'pill', 'data-guide': 'plan' }, icon(Luggage, 16), L('Plan a trip', 'Planear un viaje'));
      b.addEventListener('click', () => void this.open(this.app.data.name(id, lang())));
      return b;
    });
    app.renderer.overlays.add((rc) => this.draw(rc));
    shell.tapHandlers.unshift((x, y) => this.tap(x, y));
    // The trip's places (v0.31.2): their city is the guide city nearest to them, within a day trip.
    planHooks.nearestCity = async (at) => {
      const idx = await this.load();
      let best: GuideCity | null = null, bd = 160;
      for (const c of idx ?? []) { const d = km(c.at, at); if (d < bd) { bd = d; best = c; } }
      return best?.id ?? null;
    };
    planHooks.city = (id) => { const c = this.byId.get(id); return c ? { at: c.at, name: this.cityName(c) } : null; };
    planHooks.addCity = (id) => this.add(id);
    planHooks.toast = (m) => this.shell.toast(m, 2600);
    app.on('lang', () => {
      if (this.shell.sheet.isOpen('guide')) void this.open(this.query);
      else if (this.shell.sheet.isOpen('guide-city') && this.city) void this.openCity(this.city, this.tab);
    });
  }

  // ---- Data -----------------------------------------------------------------------------------------------------
  async load(): Promise<GuideCity[] | null> {
    if (this.index) return this.index;
    try {
      const d = await loadJSON<{ cities: unknown[][] }>('guide/index.json');
      this.index = d.cities.map((r) => ({
        id: r[0] as string, name: r[1] as string, es: r[2] as string, at: [r[3] as number, r[4] as number], country: r[5] as string, pop: r[6] as number,
        capital: r[7] as number, admin1: r[8] as string, tz: r[9] as string, qid: r[10] as string | null,
        wv: { en: r[11] as string | null, es: r[12] as string | null }, wp: { en: r[13] as string | null, es: r[14] as string | null }, climate: r[15] as Climate | null,
        also: r[16] ? String(r[16]).split('|') : [],
      }));
      for (const c of this.index) this.byId.set(c.id, c);
      this.trip = this.trip.filter((id) => this.byId.has(id));
      return this.index;
    } catch { return null; }
  }
  cityGuide(id: string): Promise<CityGuide | null> {
    if (!this.guides.has(id)) this.guides.set(id, loadJSON<CityGuide>(`guide/c/${id}.json`).catch(() => { this.guides.delete(id); return null; }));
    return this.guides.get(id)!;
  }
  private async facts(country: string) {
    if (!this.attrs) { try { this.attrs = (await loadJSON<{ data: Record<string, Record<string, unknown>> }>('attributes/countries.json')).data; } catch { this.attrs = {}; } }
    return this.attrs[country] ?? {};
  }
  cityName(c: GuideCity) { return es() ? c.es : c.name; }
  /** A guide city's name, by its id (null when the guide does not know it). */
  cityLabel(id: string): string | null { const c = this.byId.get(id); return c ? this.cityName(c) : null; }
  private countryName(id: string) { return this.app.data.name(id, lang()); }
  private flag(id: string) { return flagEmoji(this.app.data.meta[id]?.a2); }

  // ---- The trip ------------------------------------------------------------------------------------------------
  private save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.trip)); } catch { /* private mode */ }
    this.app.renderer.requestRender();
    // A trip across three continents earns a badge.
    const conts = new Set(this.trip.map((id) => this.app.data.meta[this.byId.get(id)?.country ?? '']?.ct).filter(Boolean));
    if (conts.size >= 3) {
      const got = recordFeat('trip-3cont');
      if (got.length) this.shell.toast(`${got[0].icon} ${L('New badge: {0}', 'Nueva insignia: {0}', tx(got[0]))}`, 4000);
    }
  }
  add(id: string) { if (this.byId.has(id) && !this.trip.includes(id)) { this.trip.push(id); this.save(); } }
  remove(id: string) { this.trip = this.trip.filter((x) => x !== id); dropCity(id); this.save(); }
  move(id: string, by: number) {
    const i = this.trip.indexOf(id), j = i + by;
    if (i < 0 || j < 0 || j >= this.trip.length) return;
    [this.trip[i], this.trip[j]] = [this.trip[j], this.trip[i]];
    this.save();
  }
  /** Puts the trip in the shortest order from its first city. */
  bestOrder() {
    const pts = this.trip.map((id) => this.byId.get(id)!.at);
    const before = tripKm(pts);
    const order = bestOrder(pts);
    this.trip = order.map((i) => this.trip[i]);
    this.save();
    return { before, after: tripKm(order.map((i) => pts[i])) };
  }
  /** The countries on your Want to go list: each one's capital (or biggest guide city) joins the trip. */
  addWishList(): number {
    let wish: string[] = [];
    try { wish = JSON.parse(localStorage.getItem('atlas-globe:personal') || '{}').wish ?? []; } catch { /* none */ }
    let n = 0;
    for (const cc of wish) {
      const here = this.index?.filter((c) => c.country === cc) ?? [];
      const pick = here.find((c) => c.capital === 2) ?? here.sort((a, b) => b.pop - a.pop)[0];
      if (pick && !this.trip.includes(pick.id)) { this.trip.push(pick.id); n++; }
    }
    this.save();
    return n;
  }
  shareUrl() { return `${location.origin}${location.pathname}#${tripHash(this.trip)}`; }
  /** The share link, with the trip's places (packed small) when it has some. */
  async shareUrlWithPlaces(): Promise<string> {
    const places = this.trip.flatMap((id) => placesOf(id));
    return places.length ? `${this.shareUrl()}&tp=${await packPlaces(places)}` : this.shareUrl();
  }

  /** A shared trip (#trip=…): it becomes your trip (the one you had can be put back). */
  async openShared(value: string, packed?: string | null) {
    await this.load();
    const ids = readTrip(value, (id) => this.byId.has(id));
    if (!ids.length) return;
    const before = [...this.trip];
    this.trip = ids; this.save();
    // Its places, when the link carries them.
    if (packed) {
      const got = await unpackPlaces(packed);
      if (got) {
        const by: Record<string, Place[]> = {};
        for (const p of got) if (ids.includes(p.city)) (by[p.city] ??= []).push(p);
        setPlan(by);
      }
    } else if (before.join() !== ids.join()) setPlan({});
    await this.open();
    if (before.length && before.join() !== ids.join()) {
      this.shell.toast(L('A shared trip is now your trip.', 'Un viaje compartido es ahora tu viaje.'), 4000);
      try { localStorage.setItem(`${KEY}-before`, JSON.stringify(before)); } catch { /* ignore */ }
    }
  }

  // ---- The guide panel: your trip, and cities to add ------------------------------------------------------------------
  async open(query = '') {
    const idx = await this.load();
    if (!idx) { this.shell.toast(L('The travel guide needs its data; check your connection.', 'La guía de viaje necesita sus datos; revisa tu conexión.')); return; }
    this.query = query; this.picking = true; this.onMap = false; this.city = null;
    this.hideBack();
    const body = h('div', { class: 'guide' });
    body.append(h('p', { class: 'muted small' }, L('Pick the cities you want to visit: for each one, what to eat, what to see, its museums and the practical facts. {0} cities; tap a dot on the map, or search.', 'Elige las ciudades que quieres visitar: de cada una, qué comer, qué ver, sus museos y los datos prácticos. {0} ciudades; toca un punto en el mapa o busca.', idx.length)));
    // Search.
    const input = h('input', { type: 'search', class: 'guide-search', placeholder: L('A city or a country…', 'Una ciudad o un país…'), 'aria-label': L('Search the guide', 'Buscar en la guía'), value: query }) as HTMLInputElement;
    const results = h('div', { class: 'guide-results' });
    const showResults = () => {
      this.query = input.value;
      clear(results);
      for (const c of this.search(input.value)) results.append(this.cityRow(c, () => void this.open(this.query)));
    };
    input.addEventListener('input', showResults);
    body.append(input, results);
    showResults();
    // The trip.
    body.append(h('h3', { class: 'sec-title' }, `${L('Your trip', 'Tu viaje')} · ${this.trip.length}`));
    if (!this.trip.length) {
      body.append(h('p', { class: 'muted small' }, L('No cities yet. Add some with +, or start from your Want to go list.', 'Todavía no hay ciudades. Agrégalas con + o empieza por tu lista de Quiero ir.')));
      const tryRow = h('div', { class: 'chip-row' });
      for (const id of ['lima', 'madrid', 'kyoto', 'mexico-city']) {
        const c = this.byId.get(id);
        if (!c) continue;
        const b = h('button', { type: 'button', class: 'chip', 'data-try': id }, `${this.flag(c.country)} ${this.cityName(c)}`);
        b.addEventListener('click', () => void this.openCity(id));
        tryRow.append(b);
      }
      body.append(tryRow);
    } else {
      const list = h('ol', { class: 'guide-trip' });
      this.trip.forEach((id, i) => {
        const c = this.byId.get(id)!;
        const name = h('button', { type: 'button', class: 'guide-trip-name', 'data-trip-city': id }, `${this.flag(c.country)} ${this.cityName(c)}`, h('span', { class: 'muted' }, ` · ${this.countryName(c.country)}`));
        name.addEventListener('click', () => void this.openCity(id));
        const btn = (ic: Parameters<typeof icon>[0], label: string, fn: () => void, dis = false) => {
          const b = h('button', { type: 'button', class: 'icon-btn sm', title: label, 'aria-label': label, disabled: dis }, icon(ic, 15));
          b.addEventListener('click', () => { fn(); void this.open(this.query); });
          return b;
        };
        const li = h('li', { class: 'guide-trip-row' }, name, h('span', { class: 'guide-trip-btns' },
          btn(ArrowUp, L('Earlier', 'Antes'), () => this.move(id, -1), i === 0), btn(ArrowDown, L('Later', 'Después'), () => this.move(id, 1), i === this.trip.length - 1), btn(X, L('Remove', 'Quitar'), () => this.remove(id))));
        list.append(li);
        // Its places, in order (☆ in the city's guide or on a card puts them here).
        const ps = placesOf(id);
        if (ps.length) list.append(h('li', { class: 'guide-trip-places' }, h('ol', { 'data-trip-places': id }, ...ps.map((p, k) => this.placeRow(id, p, k, ps.length)))));
        if (i < this.trip.length - 1) {
          const d = km(c.at, this.byId.get(this.trip[i + 1])!.at);
          list.append(h('li', { class: 'guide-leg' }, `✈️ ${fmtNumber(Math.round(d))} km · ${L('about', 'unas')} ${hoursText(flightHours(d))}`));
        }
      });
      body.append(list);
      const total = tripKm(this.trip.map((id) => this.byId.get(id)!.at));
      if (this.trip.length > 1) body.append(h('p', { class: 'muted small', 'data-guide': 'total' }, L('{0} km in all.', '{0} km en total.', fmtNumber(Math.round(total)))));
      const act = (ic: Parameters<typeof icon>[0], label: string, attr: string, fn: () => void, primary = false) => {
        const b = h('button', { type: 'button', class: `pill sm${primary ? ' primary' : ''}`, 'data-guide': attr }, icon(ic, 15), label);
        b.addEventListener('click', fn);
        return b;
      };
      body.append(h('div', { class: 'tool-actions guide-actions' },
        act(MapIcon, L('Show on the map', 'Ver en el mapa'), 'map', () => this.showOnMap(), true),
        this.trip.length > 2 ? act(Shuffle, L('Best order', 'Mejor orden'), 'best', () => {
          const r = this.bestOrder();
          this.shell.toast(r.after < r.before - 1 ? L('Best order: {0} km instead of {1}.', 'Mejor orden: {0} km en vez de {1}.', fmtNumber(Math.round(r.after)), fmtNumber(Math.round(r.before))) : L('This is already the shortest order.', 'Este ya es el orden más corto.'));
          void this.open(this.query);
        }) : null,
        act(Share2, L('Share', 'Compartir'), 'share', () => void this.share()),
        act(Printer, L('Print', 'Imprimir'), 'print', () => this.print()),
        act(Trash2, Lc('to empty the trip', 'Clear', 'Vaciar'), 'clear', () => { this.trip = []; setPlan({}); this.save(); void this.open(this.query); })));
      // The trip's details and the plan to take anywhere (export.ts).
      body.append(tripPanelExtras(this.exportTrip(), (m) => this.shell.toast(m, 3500)));
    }
    // From the Want to go list.
    let wish: string[] = [];
    try { wish = JSON.parse(localStorage.getItem('atlas-globe:personal') || '{}').wish ?? []; } catch { /* none */ }
    if (wish.length) {
      const b = h('button', { type: 'button', class: 'pill sm', 'data-guide': 'wish' }, icon(Star, 15), L('Add my Want to go countries ({0})', 'Agregar mis países de Quiero ir ({0})', wish.length));
      b.addEventListener('click', () => { const n = this.addWishList(); this.shell.toast(L('{0} cities added.', '{0} ciudades agregadas.', n)); void this.open(this.query); });
      body.append(h('div', { class: 'tool-actions' }, b));
    }
    body.append(h('p', { class: 'muted small guide-note' }, L('Not in the guide: hotels, restaurants by name, prices, visas and safety advice, which change too often to keep right. Wikivoyage and official sites have them.', 'No están en la guía: hoteles, restaurantes por nombre, precios, visados ni consejos de seguridad, que cambian demasiado para mantenerlos al día. Wikivoyage y los sitios oficiales los tienen.')));
    this.shell.openPanel('guide', L('Travel guide', 'Guía de viaje'), body, () => this.closed());
    requestAnimationFrame(() => this.inset(true));
  }

  /** On a phone the panel covers the lower part of the screen: the map centres in the part above it. */
  private inset(on: boolean) {
    const v = this.app.renderer.view;
    if (on && !this.app.mode) {
      const r = document.querySelector('.sheet:not([hidden])')?.getBoundingClientRect();
      v.insetBottom = r && r.left < 40 && r.top > 80 ? Math.max(0, Math.round(window.innerHeight - r.top)) : 0;
      this.insetSet = true;
    } else if (!on && this.insetSet) { v.insetBottom = 0; this.insetSet = false; }
    this.app.renderer.requestRender();
  }

  private closed() {
    const fromTap = performance.now() - this.leftAt < 2000, city = this.city, tab = this.tab;
    this.leftAt = 0;
    // A city's guide or the map view may follow: they decide what stays drawn.
    setTimeout(() => {
      if (this.shell.sheet.isOpen('guide') || this.shell.sheet.isOpen('guide-city')) return;
      // Closed by a tap inside a city's guide (not by its X): "← Montreal" brings the reader back to it.
      if (fromTap && city) this.showBack(city, tab);
      this.inset(false);
      if (this.keep) { this.keep = false; return; }
      this.picking = false;
      if (!this.onMap) this.pin = null;
      this.app.renderer.requestRender();
    }, 0);
  }

  /** When a tap in a city's guide last took the reader away from it. */
  private leftAt = 0;
  /** "← Montreal": back to the city's guide, at the tab it was on, after a tap in it showed something else. */
  private backChip: HTMLElement | null = null;
  private showBack(id: string, tab: Tab) {
    const c = this.byId.get(id);
    if (!c) return;
    this.hideBack();
    const label = L('Back to {0}', 'Volver a {0}', this.cityName(c));
    const go = h('button', { type: 'button', class: 'guide-back-go', title: label, 'aria-label': label, 'data-guide-back': id }, icon(ChevronLeft, 16), h('span', null, `${this.flag(c.country)} ${this.cityName(c)}`));
    // What it showed goes (a card, a story), and the city's guide comes back at its tab.
    go.addEventListener('click', () => void (async () => {
      this.hideBack();
      this.shell.card.hide();
      if (this.app.mode) await this.time.modes.find((m) => m.id === this.app.mode)?.exit();
      await this.openCity(id, tab);
    })());
    const x = h('button', { type: 'button', class: 'guide-back-x', title: L('Close', 'Cerrar'), 'aria-label': L('Close', 'Cerrar') }, icon(X, 14));
    x.addEventListener('click', () => this.hideBack());
    this.backChip = h('div', { class: 'guide-back glass', role: 'navigation', 'aria-label': L('Travel guide', 'Guía de viaje') }, go, x);
    this.app.root.append(this.backChip);
  }
  private hideBack() { this.backChip?.remove(); this.backChip = null; }

  /** The guide's cities matching what is typed: by name (English or Spanish) or by country. */
  search(q: string): GuideCity[] {
    const s = fold(q.trim());
    if (!s || !this.index) return [];
    const out: [number, GuideCity][] = [];
    for (const c of this.index) {
      const names = [c.name, c.es, ...c.also].map(fold), cn = [this.app.data.name(c.country, 'en'), this.app.data.name(c.country, 'es')].map(fold);
      let score = -1;
      if (names.some((n) => n === s)) score = 100;
      else if (names.some((n) => n.startsWith(s))) score = 60;
      else if (s.length >= 3 && names.some((n) => n.includes(s))) score = 30;
      else if (cn.some((n) => n === s || (s.length >= 3 && n.startsWith(s)))) score = 20 + (c.capital === 2 ? 5 : 0);
      if (score >= 0) out.push([score + Math.log10(Math.max(10, c.pop)), c]);
    }
    return out.sort((a, b) => b[0] - a[0]).slice(0, 14).map((x) => x[1]);
  }

  private cityRow(c: GuideCity, after: () => void): HTMLElement {
    const inTrip = this.trip.includes(c.id);
    const name = h('button', { type: 'button', class: 'guide-city-name', 'data-guide-city': c.id }, h('span', null, `${this.flag(c.country)} ${this.cityName(c)}`),
      h('span', { class: 'muted small' }, `${c.admin1 && c.admin1 !== c.name ? `${c.admin1}, ` : ''}${this.countryName(c.country)}${c.capital === 2 ? ' · 🏛️' : ''}`));
    name.addEventListener('click', () => void this.openCity(c.id));
    const add = h('button', { type: 'button', class: `icon-btn sm${inTrip ? ' on' : ''}`, 'data-add': c.id, title: inTrip ? L('In your trip', 'En tu viaje') : L('Add to trip', 'Agregar al viaje'), 'aria-label': inTrip ? L('In your trip', 'En tu viaje') : L('Add to trip', 'Agregar al viaje') }, icon(inTrip ? Check : Plus, 16));
    add.addEventListener('click', () => { if (inTrip) this.remove(c.id); else this.add(c.id); after(); });
    return h('div', { class: 'guide-row' }, name, add);
  }

  private showOnMap() {
    this.onMap = true;
    this.picking = false;
    this.shell.sheet.close();
    const pts = this.trip.map((id) => this.byId.get(id)!.at);
    this.fit(pts);
    this.shell.toast(L('Your trip is on the map. Open the Travel guide to change it.', 'Tu viaje está en el mapa. Abre la Guía de viaje para cambiarlo.'), 3500);
  }

  private fit(pts: [number, number][]) {
    if (!pts.length) return;
    let x = 0, y = 0, z = 0;
    for (const [lo, la] of pts) { const p = (lo * Math.PI) / 180, q = (la * Math.PI) / 180; x += Math.cos(q) * Math.cos(p); y += Math.cos(q) * Math.sin(p); z += Math.sin(q); }
    const lon = (Math.atan2(y, x) * 180) / Math.PI, lat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
    let span = 0;
    for (const p of pts) for (const q of pts) span = Math.max(span, km(p, q) / 111);
    const zoom = Math.max(1.05, Math.min(9, 140 / Math.max(3, span * 1.5))) * (window.innerWidth < 600 ? 0.85 : 1);
    this.app.renderer.view.flyTo({ lon, lat, zoom });
  }

  private async share() {
    const url = await this.shareUrlWithPlaces();
    const names = this.trip.map((id) => this.cityName(this.byId.get(id)!)).join(' → ');
    const text = `🧳 ${L('My trip', 'Mi viaje')}: ${names}`;
    if (navigator.share) { try { await navigator.share({ text, url }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); this.shell.toast(L('Link copied: paste it anywhere', 'Enlace copiado: pégalo donde quieras')); } catch { prompt('', url); }
  }

  // ---- A city's guide ----------------------------------------------------------------------------------------------
  async openCity(id: string, tab: Tab = this.city === id ? this.tab : 'eat') {
    await this.load();
    const c = this.byId.get(id);
    if (!c) return;
    const opening = this.city !== id || !this.shell.sheet.isOpen('guide-city');
    this.city = id; this.tab = tab; this.picking = true;
    this.hideBack();
    const body = h('div', { class: 'guide guide-city', 'data-city': id });
    // A tap on something in the city's guide that takes the reader away from it (an animal, a park, a site on the map,
    // a story…) leaves a way back to it (see closed()).
    body.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest?.('button, [role="button"]')) this.leftAt = performance.now(); }, true);
    const inTrip = this.trip.includes(id);
    const back = h('button', { type: 'button', class: 'pill sm', 'data-guide': 'back' }, icon(ChevronLeft, 15), L('Your trip', 'Tu viaje'));
    back.addEventListener('click', () => void this.open(this.query));
    const addB = h('button', { type: 'button', class: `pill sm${inTrip ? '' : ' primary'}`, 'data-guide': 'add' }, icon(inTrip ? Check : Plus, 15), inTrip ? L('In your trip', 'En tu viaje') : L('Add to trip', 'Agregar al viaje'));
    addB.addEventListener('click', () => { if (inTrip) this.remove(id); else this.add(id); void this.openCity(id, this.tab); });
    const flyB = h('button', { type: 'button', class: 'pill sm', 'data-guide': 'fly' }, icon(MapIcon, 15), L('On the map', 'En el mapa'));
    flyB.addEventListener('click', () => { this.pin = null; this.keep = true; this.picking = true; this.app.renderer.view.flyTo({ lon: c.at[0], lat: c.at[1], zoom: 7 }); this.shell.sheet.close(); this.app.renderer.requestRender(); });
    body.append(
      h('div', { class: 'guide-head' }, h('span', { class: 'guide-flag' }, this.flag(c.country)), h('div', null,
        h('div', { class: 'guide-title' }, this.cityName(c)),
        h('div', { class: 'muted small' }, `${c.admin1 && c.admin1 !== c.name ? `${c.admin1} · ` : ''}${this.countryName(c.country)}${c.capital === 2 ? ` · ${L('capital', 'capital')}` : ''} · ${fmtCompact(c.pop)} ${L('people', 'habitantes')}`))),
      h('div', { class: 'tool-actions' }, back, addB, flyB));
    const tabs = h('div', { class: 'chip-row guide-tabs', role: 'tablist' });
    const content = h('div', { class: 'guide-tab' });
    for (const [t, ic, label] of TABS) {
      const b = h('button', { type: 'button', class: `chip${t === tab ? ' on' : ''}`, 'data-tab': t, role: 'tab', 'aria-selected': String(t === tab) }, `${ic} ${es() ? label.es : label.en}`);
      b.addEventListener('click', () => void this.openCity(id, t));
      tabs.append(b);
    }
    body.append(tabs, content);
    this.shell.openPanel('guide-city', `${this.flag(c.country)} ${this.cityName(c)}`, body, () => this.closed());
    // The city comes into view, above the panel on a phone (once, when its guide opens).
    if (opening) requestAnimationFrame(() => { this.inset(true); this.app.renderer.view.flyTo({ lon: c.at[0], lat: c.at[1], zoom: Math.max(this.app.renderer.view.zoom, 4.5) }); });
    content.append(h('p', { class: 'muted small' }, L('Loading…', 'Cargando…')));
    const g = await this.cityGuide(id);
    if (this.city !== id || this.tab !== tab || !content.isConnected) return;
    clear(content);
    if (!g) { content.append(h('p', { class: 'muted small' }, L('This city’s guide could not be loaded; check your connection.', 'No se pudo cargar la guía de esta ciudad; revisa tu conexión.'))); return; }
    if (tab === 'eat') await this.eatTab(content, c, g);
    else if (tab === 'see') this.seeTab(content, c, g);
    else if (tab === 'museums') this.museumsTab(content, c, g);
    else if (tab === 'art') await this.art?.artTab(content, c.id, this.cityName(c));
    else if (tab === 'buildings') await this.art?.buildingsTab(content, c.id, this.cityName(c));
    else if (tab === 'people') await this.lives?.peopleTab(content, c, this.cityName(c));
    else if (tab === 'facts') await this.factsTab(content, c);
    else if (tab === 'history') this.historyTab(content, g);
    else this.moreTab(content, c);
    this.app.renderer.requestRender();
  }

  /** A row of the guide: an icon (or a picture), a name, a line under it; a tap does something. */
  private row(ic: string | HTMLElement, title: string, sub: string, onClick: (() => void) | null, attrs: Record<string, string> = {}, plan?: PlaceSpec): HTMLElement {
    const r = h(onClick ? 'button' : 'div', { class: 'guide-item', ...(onClick ? { type: 'button' } : {}), ...attrs }, h('span', { class: 'guide-item-ic' }, ic), h('span', { class: 'guide-item-text' }, h('span', { class: 'guide-item-title' }, title), sub ? h('span', { class: 'guide-item-sub' }, sub) : null));
    if (onClick) r.addEventListener('click', onClick);
    // ☆: into the trip, under this city.
    return plan ? h('div', { class: 'guide-item-wrap' }, r, planStar(plan)) : r;
  }

  /** A place of the trip under its city: up, down, out; a tap shows it on the map. */
  private placeRow(city: string, p: Place, k: number, n: number): HTMLElement {
    const why = (p.why ?? []).map((w) => (es() ? w.t[1] : w.t[0])).join(' · ');
    const name = h('button', { type: 'button', class: 'guide-place-name', 'data-trip-place': p.id }, h('span', { class: 'guide-place-ic' }, PLACE_ICONS[p.kind]), h('span', { class: 'guide-place-text' }, h('span', null, es() ? p.n[1] : p.n[0]), why ? h('span', { class: 'muted small' }, why) : null));
    if (p.at) name.addEventListener('click', () => this.showPlace(p.at!, es() ? p.n[1] : p.n[0], 14));
    const btn = (ic: Parameters<typeof icon>[0], label: string, fn: () => void, dis = false) => {
      const b = h('button', { type: 'button', class: 'icon-btn xs', title: label, 'aria-label': label, disabled: dis }, icon(ic, 13));
      b.addEventListener('click', () => { fn(); void this.open(this.query); });
      return b;
    };
    return h('li', { class: 'guide-place-row' }, name, h('span', { class: 'guide-trip-btns' },
      btn(ArrowUp, L('Earlier', 'Antes'), () => movePlace(city, p.id, -1), k === 0), btn(ArrowDown, L('Later', 'Después'), () => movePlace(city, p.id, 1), k === n - 1), btn(X, L('Take it out', 'Quitarlo'), () => removePlace(p.id))));
  }

  /** The trip as the export writes it (export.ts): its cities in order, their places and the way between them. */
  exportTrip() {
    return {
      cities: this.trip.map((id, i) => {
        const c = this.byId.get(id)!;
        const prev = i > 0 ? this.byId.get(this.trip[i - 1]) : null;
        return {
          id, name: this.cityName(c), country: this.countryName(c.country), at: c.at,
          wiki: c.qid ? `https://www.wikidata.org/wiki/Special:GoToLinkedPage/${lang()}wiki/${c.qid}` : undefined,
          places: placesOf(id), km: prev ? Math.round(km(prev.at, c.at)) : undefined,
        };
      }),
      link: this.shareUrl(),
      places: allPlaces(),
    };
  }
  private section(el: HTMLElement, title: string, rows: HTMLElement[]) { if (rows.length) el.append(h('h3', { class: 'sec-title' }, title), h('div', { class: 'guide-list' }, ...rows)); }
  /** Opens an item in its Time travel story (the guide closes; Travel guide in More brings it back). */
  private openStory(kind: StoryKind, story: string, step: number, name: string, at: [number, number]) {
    this.picking = false; this.pin = null;
    this.shell.sheet.close();
    void this.time.stories[kind]?.open(story, step, { name, at }).catch(() => {});
  }
  /** Shows a place on the map with a pin. */
  showPlace(at: [number, number], text: string, zoom = 9) {
    this.pin = { at, text };
    this.picking = true;
    this.keep = true;
    this.shell.sheet.close();
    this.app.renderer.view.flyTo({ lon: at[0], lat: at[1], zoom });
    this.app.renderer.requestRender();
  }

  private async eatTab(el: HTMLElement, c: GuideCity, g: CityGuide) {
    const f = await this.facts(c.country);
    if (typeof f.national_dish === 'string' && f.national_dish) el.append(h('p', { class: 'guide-national' }, `🍽️ ${L('{0}’s national dish', 'Plato nacional de {0}', this.countryName(c.country))}: `, h('strong', null, f.national_dish)));
    const dishRow = (d: Dish) => this.row(d[3], es() ? d[5] : d[4], [es() ? d[10] : d[9], d[11] ? this.year(d[11]) : '', d[1] === 'here' ? '' : `${fmtNumber(d[2])} km`].filter(Boolean).join(' · '),
      () => this.openStory('food', d[7], d[8], es() ? d[5] : d[4], [d[12], d[13]]), { 'data-dish': d[0] },
      { id: `dish:${d[0]}`, kind: 'dish', city: c.id, n: [d[4], d[5]], why: [{ t: [`To try: from ${d[9]}`, `Para probar: de ${d[10]}`] }] });
    const name = this.cityName(c), cn = this.countryName(c.country);
    this.section(el, Lc('dishes that come from a place', 'From {0}', 'De {0}', name), g.eat.filter((d) => d[1] === 'here').map(dishRow));
    this.section(el, L('From the rest of {0}', 'Del resto de {0}', cn), g.eat.filter((d) => d[1] === 'country').map(dishRow));
    this.section(el, L('From nearby countries', 'De países cercanos'), g.eat.filter((d) => d[1] === 'near').map(dishRow));
    this.section(el, L('First grown here or nearby', 'Cultivados aquí o cerca por primera vez'), g.grown.map(dishRow));
    if (!g.eat.length) el.append(h('p', { class: 'muted small' }, L('Our food stories have no dish from here yet.', 'Nuestras historias de comida aún no tienen platos de aquí.')));
    el.append(h('p', { class: 'muted small' }, L('Tap a dish for its story.', 'Toca un plato para ver su historia.')));
    // Wikivoyage's Eat overview, live.
    const box = h('div', { class: 'guide-wv', 'data-wv': 'eat' }, h('p', { class: 'muted small' }, L('Wikivoyage: loading…', 'Wikivoyage: cargando…')));
    el.append(box);
    const wv = await this.wikivoyage(c, 'eat');
    clear(box);
    if (!wv?.paras.length) { box.append(h('p', { class: 'muted small' }, L('Wikivoyage’s “Eat” section could not be read (offline, or no page for this city).', 'No se pudo leer la sección “Comer” de Wikivoyage (sin conexión o sin página para esta ciudad).'))); return; }
    box.append(h('div', { class: 'guide-wv-head' }, '📖 ', h('strong', null, L('From Wikivoyage', 'De Wikivoyage')), wv.lang !== lang() ? h('span', { class: 'muted small' }, ` (${wv.lang === 'en' ? L('in English', 'en inglés') : L('in Spanish', 'en español')})`) : null),
      ...wv.paras.map((p) => h('p', null, p)),
      h('p', { class: 'muted small' }, h('a', { href: wv.url, target: '_blank', rel: 'noopener' }, L('Read it all on Wikivoyage', 'Leerlo todo en Wikivoyage')), ' · ', L('text CC BY-SA, by Wikivoyage’s writers', 'texto CC BY-SA, de los autores de Wikivoyage')));
  }

  private year(date: string): string {
    const y = Number(/^-?\d+/.exec(date)?.[0]);
    if (!Number.isFinite(y)) return date;
    return y < 0 ? L('{0} BC', '{0} a. C.', -y) : String(y);
  }

  private seeTab(el: HTMLElement, c: GuideCity, g: CityGuide) {
    // The city's tour, if there is one.
    const plain = (s: string) => fold(s).replace(/[’']/g, '');
    const names = [c.name, ...c.also].map(plain);
    const tour = TOURS.find((t) => t.group === 'cities' && names.some((n) => plain(t.en) === `${n} through time`));
    if (tour) {
      const b = h('button', { type: 'button', class: 'pill primary sm', 'data-guide': 'tour' }, icon(Compass, 15), `${tour.icon} ${es() ? tour.es : tour.en}`);
      b.addEventListener('click', () => { this.picking = false; this.leftAt = 0; this.shell.sheet.close(); void this.learn.startTour(tour); });
      el.append(h('div', { class: 'tool-actions' }, b), h('p', { class: 'muted small' }, L('A guided tour of {0} through its history, {1} stops.', 'Una visita guiada por la historia de {0}, {1} paradas.', this.cityName(c), tour.steps.length)));
    }
    const site = (s: Site, far: boolean) => {
      const img = s[8] ? h('img', { class: 'guide-thumb', src: commons(s[8]), alt: '', loading: 'lazy' }) : null;
      img?.addEventListener('error', () => img.replaceWith(document.createTextNode(s[4] === 'n' ? '🌿' : s[4] === 'm' ? '🏞️' : '🏛️')));
      return this.row(img ?? (s[4] === 'n' ? '🌿' : '🏛️'), es() ? s[3] : s[2], [L('World Heritage since {0}', 'Patrimonio Mundial desde {0}', s[5]), far ? `${fmtNumber(s[1])} km` : ''].filter(Boolean).join(' · '),
        () => this.showPlace([s[6], s[7]], es() ? s[3] : s[2], far ? 7 : 10), { 'data-whs': String(s[0]) },
        { id: `whs:${s[0]}`, kind: 'whs', city: c.id, n: [s[2], s[3]], at: [s[6], s[7]], url: `https://whc.unesco.org/${dataLang()}/list/${s[0]}`,
          why: [{ t: [`World Heritage since ${s[5]}${far ? ` · ${s[1]} km away` : ''}`, `Patrimonio Mundial desde ${s[5]}${far ? ` · a ${s[1]} km` : ''}`] }] });
    };
    this.section(el, L('World Heritage in the city', 'Patrimonio Mundial en la ciudad'), g.whs.map((s) => site(s, false)));
    this.section(el, L('Great structures', 'Grandes construcciones'), g.sights.map((r) => this.row(r[3], es() ? r[5] : r[4], [this.year(r[8]), r[9] >= 2 ? `${fmtNumber(Math.round(r[9]))} km` : ''].filter(Boolean).join(' · '),
      () => this.openStory(r[0], r[1], r[2], es() ? r[5] : r[4], [r[6], r[7]]), { 'data-sight': r[1] },
      { id: `sight:${r[0]}/${r[1]}`, kind: 'sight', city: c.id, n: [r[4], r[5]], at: [r[6], r[7]] })));
    this.section(el, L('A day trip away', 'A una excursión de distancia'), g.trips.map((s) => site(s, true)));
    // Wildlife nearby (v0.30.0): parks and reserves within reach, with the animals each is best for.
    if (this.wild) { const box = h('div', { 'data-guide': 'wildlife' }); el.append(box); void this.wild.wildlifeNearby(box, c.at, this.cityName(c), c.id); }
    if (!g.whs.length && !g.sights.length && !g.trips.length && !tour) el.append(h('p', { class: 'muted small' }, L('No World Heritage site or great structure of ours is near here; Wikivoyage (Read more) has what to see.', 'Ningún sitio del Patrimonio Mundial ni gran construcción nuestra está cerca; Wikivoyage (Más) tiene qué ver.')));
    else el.append(h('p', { class: 'muted small' }, L('Tap a site to see where it is; a structure opens its story.', 'Toca un sitio para ver dónde está; una construcción abre su historia.')));
  }

  private museumsTab(el: HTMLElement, c: GuideCity, g: CityGuide) {
    if (!g.museums.length) { el.append(h('p', { class: 'muted small' }, L('Wikidata lists no museum near the centre of this city.', 'Wikidata no tiene museos cerca del centro de esta ciudad.'))); return; }
    for (const [k, label] of MUSEUM_KINDS) {
      const rows = g.museums.filter((m) => m[3] === k).map((m) => {
        const name = es() ? m[2] : m[1];
        const sub = m[4] ? L('{0} visitors a year', '{0} visitantes al año', fmtCompact(m[4])) : '';
        const r = this.row('🏛️', name, sub, m[6] ? () => this.showPlace(m[6]!, name, 12) : null, { 'data-museum': m[0] });
        const links = h('span', { class: 'guide-links' },
          h('a', { href: `https://www.wikidata.org/wiki/Special:GoToLinkedPage/${lang()}wiki/${m[0]}`, target: '_blank', rel: 'noopener', title: 'Wikipedia' }, 'W'),
          m[7] ? h('a', { href: m[7], target: '_blank', rel: 'noopener', title: L('Official site', 'Sitio oficial') }, icon(ExternalLink, 13)) : null);
        return h('div', { class: 'guide-item-wrap' }, r, links, planStar({ id: `museum:${m[0]}`, kind: 'museum', city: c.id, n: [m[1], m[2]], at: m[6] ?? undefined, url: m[7] ?? `https://www.wikidata.org/wiki/Special:GoToLinkedPage/${lang()}wiki/${m[0]}` }));
      });
      this.section(el, es() ? label.es : label.en, rows);
    }
    el.append(h('p', { class: 'muted small' }, L('Museums within a few km of the centre, the best known first (from Wikidata, CC0). Visitor numbers where Wikidata has them.', 'Museos a pocos km del centro, los más conocidos primero (de Wikidata, CC0). Visitantes cuando Wikidata los tiene.')));
  }

  private async factsTab(el: HTMLElement, c: GuideCity) {
    const f = await this.facts(c.country);
    const rows: [string, string, string][] = [];
    const ln = (code: string) => { try { const n = new Intl.DisplayNames([lang()], { type: 'language' }).of(code); return n && n !== code ? n : code; } catch { return code; } };
    const langs = (f.languages as string[] | undefined) ?? [];
    if (langs.length) rows.push(['🗣️', L('Languages', 'Idiomas'), langs.map(ln).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')]);
    const cur = (f.currency as string[] | undefined) ?? [];
    if (cur.length) rows.push(['💱', L('Money', 'Moneda'), cur.map((x) => { try { return `${new Intl.DisplayNames([lang()], { type: 'currency' }).of(x)} (${x})`; } catch { return x; } }).join(', ')]);
    const plugs = (f.plug_types as string[] | undefined) ?? [];
    if (plugs.length) rows.push(['🔌', L('Plugs', 'Enchufes'), `${L('type', 'tipo')} ${plugs.join(', ')}${f.mains_volts ? ` · ${String(f.mains_volts).replace(/\s*V$/i, '')} V` : ''}${f.mains_frequency ? ` · ${f.mains_frequency} Hz` : ''}`]);
    if (f.driving_side) rows.push(['🚗', L('Driving', 'Se conduce'), f.driving_side === 'left' ? L('on the left', 'por la izquierda') : L('on the right', 'por la derecha')]);
    if (f.calling_code) rows.push(['📞', L('Calling code', 'Prefijo telefónico'), String(f.calling_code)]);
    // The clock: the time there now, and against yours.
    if (c.tz) {
      const now = new Date();
      const there = tzOffset(c.tz, now), mine = -now.getTimezoneOffset();
      const diff = (there - mine) / 60;
      const local = now.toLocaleTimeString(appLocale(), { timeZone: c.tz, hour: '2-digit', minute: '2-digit' });
      rows.push(['🕐', L('Time there now', 'Hora allí ahora'), `${local} · ${diff === 0 ? L('the same as yours', 'la misma que la tuya') : (diff > 0 ? L('{0} h ahead of you', '{0} h más que tú', diff) : L('{0} h behind you', '{0} h menos que tú', -diff))}`]);
      const sun = sunTimes(now, c.at[1], c.at[0]);
      rows.push(['🌅', L('Sunrise and sunset today', 'Amanecer y atardecer hoy'), 'polar' in sun ? (sun.polar === 'day' ? L('the sun does not set', 'el sol no se pone') : L('the sun does not rise', 'el sol no sale')) : `${hhmm(sun.rise + there)} · ${hhmm(sun.set + there)}`]);
    }
    // From the city before it in the trip.
    const i = this.trip.indexOf(c.id);
    if (i > 0) { const p = this.byId.get(this.trip[i - 1])!; const d = km(p.at, c.at); rows.push(['✈️', L('From {0}', 'Desde {0}', this.cityName(p)), `${fmtNumber(Math.round(d))} km · ${L('about', 'unas')} ${hoursText(flightHours(d))} ${L('by air', 'en avión')}`]); }
    el.append(h('div', { class: 'rows guide-facts' }, ...rows.map(([ic, label, value]) => h('div', { class: 'row' }, h('span', { class: 'row-ic' }, ic), h('span', { class: 'row-label' }, label), h('span', { class: 'row-value' }, value)))));
    if (c.climate) el.append(this.weather(c.climate));
    if (this.plants) { const box = h('div', { 'data-guide': 'spectacles' }); el.append(box); void this.plants.spectaclesNearby(box, c.at, this.cityName(c), c.id); }
  }

  /** Temperature and rain by month, the best months marked. */
  private weather(cl: Climate): HTMLElement {
    const best = bestMonths(cl);
    const W = 320, H = 150, top = 18, bottom = 22, left = 6, cw = (W - left * 2) / 12;
    const maxP = Math.max(100, ...cl.p);
    const hi = cl.t.map((t, i) => (t + (cl.r ? cl.r[i] / 2 : 0)) / 10), lo = cl.t.map((t, i) => (t - (cl.r ? cl.r[i] / 2 : 0)) / 10);
    const tMin = Math.min(0, ...lo) - 2, tMax = Math.max(30, ...hi) + 2;
    const ty = (t: number) => top + (1 - (t - tMin) / (tMax - tMin)) * (H - top - bottom);
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'guide-chart'); svg.setAttribute('role', 'img');
    const el = (tag: string, a: Record<string, string | number>, text?: string) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v)); if (text) e.textContent = text; svg.append(e); return e; };
    const m = es() ? MONTHS.es : MONTHS.en;
    for (let i = 0; i < 12; i++) {
      const x = left + i * cw;
      if (best.includes(i)) el('rect', { x: x + 1, y: 2, width: cw - 2, height: H - bottom + 2, rx: 4, class: 'gc-best' });
      const bh = (cl.p[i] / maxP) * (H - top - bottom) * 0.9;
      el('rect', { x: x + cw * 0.22, y: H - bottom - bh, width: cw * 0.56, height: bh, rx: 2, class: 'gc-rain' });
      el('line', { x1: x + cw / 2, x2: x + cw / 2, y1: ty(hi[i]), y2: ty(lo[i]), class: 'gc-range' });
      el('text', { x: x + cw / 2, y: H - 8, 'text-anchor': 'middle', class: 'gc-month' }, m[i].slice(0, es() ? 3 : 1));
      el('text', { x: x + cw / 2, y: ty(hi[i]) - 4, 'text-anchor': 'middle', class: 'gc-temp' }, String(Math.round(cl.t[i] / 10)));
    }
    el('polyline', { points: cl.t.map((t, i) => `${left + i * cw + cw / 2},${ty(t / 10)}`).join(' '), class: 'gc-line' });
    const names = es() ? MONTH_NAMES.es : MONTH_NAMES.en;
    const ranges = monthRanges(best).map(([a, b]) => (a === b ? names[a] : `${names[a]}–${names[b]}`));
    const hot = Math.max(...hi), cold = Math.min(...lo), rain = cl.p.reduce((s, x) => s + x, 0);
    return h('div', { class: 'guide-weather', 'data-guide': 'weather' },
      h('h3', { class: 'sec-title' }, L('Weather by month', 'El clima mes a mes')),
      svg,
      h('p', { class: 'small' }, ranges.length ? L('Best months to go: {0} (shaded).', 'Mejores meses para ir: {0} (sombreados).', ranges.join(', ')) : L('No month is mild and dry here.', 'Aquí ningún mes es templado y seco.'),
        ' ', L('Mean temperature by month (°C), the bars are rain ({0} mm a year); days from about {1} °C to {2} °C.', 'Temperatura media por mes (°C); las barras son la lluvia ({0} mm al año); días de unos {1} °C a {2} °C.', fmtNumber(rain), Math.round(cold), Math.round(hot))),
      h('p', { class: 'muted small' }, L('Averages of 1961–1990 (CRU CL 2.0, University of East Anglia).', 'Promedios de 1961–1990 (CRU CL 2.0, Universidad de East Anglia).')));
  }

  private historyTab(el: HTMLElement, g: CityGuide) {
    if (!g.history.length) { el.append(h('p', { class: 'muted small' }, L('Our Time travel stories do not stop here yet.', 'Nuestras historias de Viaje en el tiempo aún no pasan por aquí.'))); return; }
    const kinds = [...new Set(g.history.map((r) => r[0]))];
    for (const k of kinds) {
      const info = storyKind(k);
      this.section(el, `${info.icon} ${es() ? info.name.es : info.name.en}`, g.history.filter((r) => r[0] === k).map((r) => this.row(r[3], es() ? r[5] : r[4], this.year(r[8]),
        () => this.openStory(r[0], r[1], r[2], es() ? r[5] : r[4], [r[6], r[7]]), { 'data-history': `${r[0]}/${r[1]}` })));
    }
    el.append(h('p', { class: 'muted small' }, L('What the Time travel stories tell of this place: tap one to open its story at that step.', 'Lo que cuentan de este lugar las historias de Viaje en el tiempo: toca una para abrirla en ese paso.')));
  }

  private moreTab(el: HTMLElement, c: GuideCity) {
    const links: HTMLElement[] = [];
    const wv = (l: 'en' | 'es') => c.wv[l] ? h('a', { class: 'pill sm', href: `https://${l}.wikivoyage.org/wiki/${encodeURIComponent(c.wv[l]!.replace(/ /g, '_'))}`, target: '_blank', rel: 'noopener', 'data-link': `wv-${l}` }, icon(ExternalLink, 14), `Wikivoyage (${l === 'en' ? L('English', 'inglés') : L('Spanish', 'español')})`) : null;
    const wp = (l: 'en' | 'es') => c.wp[l] ? h('a', { class: 'pill sm', href: `https://${l}.wikipedia.org/wiki/${encodeURIComponent(c.wp[l]!.replace(/ /g, '_'))}`, target: '_blank', rel: 'noopener', 'data-link': `wp-${l}` }, icon(ExternalLink, 14), `Wikipedia (${l === 'en' ? L('English', 'inglés') : L('Spanish', 'español')})`) : null;
    const first: ('en' | 'es')[] = es() ? ['es', 'en'] : ['en', 'es'];
    for (const l of first) { const a = wv(l); if (a) links.push(a); }
    for (const l of first) { const a = wp(l); if (a) links.push(a); }
    el.append(h('p', { class: 'small' }, L('Wikivoyage is a free travel guide written by travellers: where to stay, how to get around, restaurants, prices and safety, kept up to date by its writers.', 'Wikivoyage es una guía de viaje libre escrita por viajeros: dónde dormir, cómo moverse, restaurantes, precios y seguridad, al día gracias a sus autores.')),
      links.length ? h('div', { class: 'tool-actions guide-more' }, ...links) : h('p', { class: 'muted small' }, L('No Wikivoyage or Wikipedia page is linked to this city on Wikidata.', 'Ninguna página de Wikivoyage o Wikipedia está enlazada a esta ciudad en Wikidata.')));
  }

  // ---- Wikivoyage, read live -------------------------------------------------------------------------------------
  /** A section of the city's Wikivoyage page ("Eat"): its first paragraphs of prose (not its listings). */
  wikivoyage(c: GuideCity, section: 'eat'): Promise<{ paras: string[]; url: string; lang: string } | null> {
    const key = `${c.id}:${section}:${lang()}`;
    if (!this.wv.has(key)) this.wv.set(key, (async () => {
      const order: ('en' | 'es')[] = es() ? ['es', 'en'] : ['en', 'es'];
      for (const l of order) {
        const title = c.wv[l];
        if (!title) continue;
        try {
          const api = `https://${l}.wikivoyage.org/w/api.php?format=json&origin=*&redirects=1&page=${encodeURIComponent(title)}`;
          const secs = (await (await fetch(`${api}&action=parse&prop=sections`)).json()) as { parse?: { sections: { line: string; index: string; anchor: string }[] } };
          const s = secs.parse?.sections.find((x) => /^(eat|comer|gastronom[ií]a)$/i.test(x.line.replace(/<[^>]+>/g, '').trim()));
          if (!s) continue;
          const page = (await (await fetch(`${api}&action=parse&prop=text&disableeditsection=1&section=${s.index}`)).json()) as { parse?: { text: { '*': string } } };
          const html = page.parse?.text['*'];
          if (!html) continue;
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const paras: string[] = [];
          let len = 0;
          for (const p of doc.querySelectorAll('.mw-parser-output > p')) {
            const t = (p.textContent ?? '').replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
            if (t.length < 40) continue;
            paras.push(t.length > 700 ? `${t.slice(0, 680).replace(/\s\S*$/, '')}…` : t);
            len += t.length;
            if (paras.length >= 3 || len > 1200) break;
          }
          if (paras.length) return { paras, url: `https://${l}.wikivoyage.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}#${s.anchor}`, lang: l };
        } catch { /* offline, or the page moved */ }
      }
      return null;
    })());
    return this.wv.get(key)!;
  }

  // ---- Print -----------------------------------------------------------------------------------------------------
  /** A printable page of the trip: each city with its facts, weather, dishes, sights and museums. */
  async printView(): Promise<HTMLElement> {
    await this.load();
    const page = h('div', { class: 'guide-print', 'data-guide': 'print-view' }, h('h1', null, `🧳 ${L('My trip', 'Mi viaje')}: ${this.trip.map((id) => this.cityName(this.byId.get(id)!)).join(' → ')}`));
    for (const [i, id] of this.trip.entries()) {
      const c = this.byId.get(id)!, g = await this.cityGuide(id);
      const days = tripDetails().days?.[id];
      const sec = h('section', null, h('h2', null, `${i + 1}. ${this.cityName(c)}, ${this.countryName(c.country)}${days ? ` · ${days} ${days === 1 ? L('day', 'día') : L('days', 'días')}` : ''}`));
      // The places chosen in it, with what for.
      const ps = placesOf(id);
      if (ps.length) sec.append(h('p', null, h('strong', null, `★ ${L('My places', 'Mis lugares')}: `), ps.map((p) => { const w = (p.why ?? []).map((x) => (es() ? x.t[1] : x.t[0])).join(', '); return `${PLACE_ICONS[p.kind]} ${es() ? p.n[1] : p.n[0]}${w ? ` (${w})` : ''}`; }).join(' · ')));
      if (i > 0) { const d = km(this.byId.get(this.trip[i - 1])!.at, c.at); sec.append(h('p', null, `✈️ ${fmtNumber(Math.round(d))} km · ${L('about', 'unas')} ${hoursText(flightHours(d))}`)); }
      if (c.climate) {
        const best = monthRanges(bestMonths(c.climate)).map(([a, b]) => { const n = es() ? MONTH_NAMES.es : MONTH_NAMES.en; return a === b ? n[a] : `${n[a]}–${n[b]}`; });
        const m = es() ? MONTHS.es : MONTHS.en;
        sec.append(h('p', null, `${L('Best months', 'Mejores meses')}: ${best.join(', ') || '—'} · ${c.climate.t.map((t, k) => `${m[k]} ${Math.round(t / 10)}°`).join(' ')}`));
      }
      if (g) {
        const list = (title: string, items: string[]): HTMLElement | null => (items.length ? h('p', null, h('strong', null, `${title}: `), items.join(', ')) : null);
        sec.append(...[
          list(L('Eat', 'Comer'), g.eat.slice(0, 12).map((d) => (es() ? d[5] : d[4]))),
          list(L('World Heritage', 'Patrimonio de la Humanidad'), g.whs.map((s) => (es() ? s[3] : s[2]))),
          list(L('Great structures', 'Grandes construcciones'), g.sights.map((r) => (es() ? r[5] : r[4]))),
          list(L('Museums', 'Museos'), g.museums.slice(0, 8).map((m) => (es() ? m[2] : m[1]))),
          list(L('Day trips', 'Excursiones'), g.trips.slice(0, 5).map((s) => `${es() ? s[3] : s[2]} (${s[1]} km)`)),
        ].filter((x): x is HTMLElement => !!x));
      }
      page.append(sec);
    }
    page.append(h('p', { class: 'small' }, L('From Atlas Globe’s travel guide. Weather: CRU CL 2.0, 1961–1990. Museums: Wikidata.', 'De la guía de viaje de Atlas Globe. Clima: CRU CL 2.0, 1961–1990. Museos: Wikidata.')));
    return page;
  }
  print() {
    void (async () => {
      const view = await this.printView();
      document.querySelector('.guide-print')?.remove();
      document.body.append(view);
      document.documentElement.classList.add('printing');
      const done = () => { document.documentElement.classList.remove('printing'); view.remove(); window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done);
      try { window.print(); } catch { done(); }
      // Some browsers never send afterprint: the view goes once the page has focus again.
      setTimeout(() => { if (document.hasFocus()) done(); }, 60000);
    })();
  }

  // ---- The map ---------------------------------------------------------------------------------------------------
  private tap(x: number, y: number): boolean {
    if (!this.picking || !this.index) return false;
    let best: GuideCity | null = null, bd = 16;
    for (const c of this.index) {
      const p = this.app.renderer.view.project(c.at[0], c.at[1]);
      if (!p) continue;
      const d = Math.hypot(p[0] - x, p[1] - y);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) {
      // A tap elsewhere, with the guide closed, puts away its dots and pin (the trip stays if it was put on the map).
      if (!this.shell.sheet.isOpen()) { this.picking = false; this.pin = null; this.app.renderer.requestRender(); }
      return false;
    }
    void this.openCity(best.id);
    return true;
  }

  private draw(rc: RenderCtx) {
    const { ctx } = rc;
    const show = (this.picking || this.onMap) && this.trip.length && this.index;
    if (this.picking && this.index) {
      // Every guide city, a small dot.
      ctx.save();
      for (const c of this.index) {
        if (this.trip.includes(c.id)) continue;
        const p = rc.project(c.at[0], c.at[1]);
        if (!p) continue;
        ctx.beginPath(); ctx.arc(p[0], p[1], c.id === this.city ? 6 : 3.2, 0, Math.PI * 2);
        ctx.fillStyle = c.id === this.city ? '#f5c542' : 'rgba(255,255,255,0.9)'; ctx.fill();
        ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
        if (c.id === this.city) rc.labels.add({ text: this.cityName(c), x: p[0] + 8, y: p[1], align: 'left', priority: 3100, size: 13, weight: 800, color: '#fff', halo: 'rgba(0,0,0,0.85)' });
      }
      ctx.restore();
    }
    if (show) {
      const pts = this.trip.map((id) => this.byId.get(id)!.at);
      ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const [w, col] of [[5, 'rgba(0,0,0,0.45)'], [2.5, '#f5c542']] as const) {
        ctx.beginPath();
        for (let i = 1; i < pts.length; i++) {
          const f = geoInterpolate(pts[i - 1], pts[i]);
          let pen = false;
          for (let k = 0; k <= 40; k++) {
            const q = rc.project(...(f(k / 40) as [number, number]));
            if (!q) { pen = false; continue; }
            if (pen) ctx.lineTo(q[0], q[1]); else { ctx.moveTo(q[0], q[1]); pen = true; }
          }
        }
        ctx.lineWidth = w; ctx.strokeStyle = col; ctx.setLineDash(w < 3 ? [8, 6] : []); ctx.stroke();
      }
      ctx.setLineDash([]);
      this.trip.forEach((id, i) => {
        const c = this.byId.get(id)!;
        const p = rc.project(c.at[0], c.at[1]);
        if (!p) return;
        ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, Math.PI * 2);
        ctx.fillStyle = id === this.city ? '#f5c542' : '#e8590c'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), p[0], p[1] + 0.5);
        rc.labels.add({ text: this.cityName(c), x: p[0] + 13, y: p[1], align: 'left', priority: 3200, size: 13, weight: 800, color: '#fff', halo: 'rgba(0,0,0,0.85)' });
      });
      // Each city's places: small dots, numbered in their order, named once the map is close.
      for (const id of this.trip) {
        placesOf(id).forEach((pl, k) => {
          if (!pl.at) return;
          const p = rc.project(pl.at[0], pl.at[1]);
          if (!p) return;
          ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, Math.PI * 2);
          ctx.fillStyle = '#1098ad'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.font = '800 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(k + 1), p[0], p[1] + 0.5);
          if (rc.webZoom >= 9) rc.labels.add({ text: es() ? pl.n[1] : pl.n[0], x: p[0] + 10, y: p[1], align: 'left', priority: 3150, size: 11.5, weight: 700, color: '#fff', halo: 'rgba(0,0,0,0.85)' });
        });
      }
      ctx.restore();
    }
    if (this.pin && (this.picking || this.onMap)) {
      const p = rc.project(this.pin.at[0], this.pin.at[1]);
      if (p) {
        ctx.save();
        ctx.beginPath(); ctx.arc(p[0], p[1], 8, 0, Math.PI * 2); ctx.fillStyle = '#ff6b6b'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.restore();
        rc.labels.add({ text: this.pin.text, x: p[0] + 12, y: p[1], align: 'left', priority: 3300, size: 13, weight: 800, color: '#fff', halo: 'rgba(0,0,0,0.85)' });
      }
    }
  }
}
