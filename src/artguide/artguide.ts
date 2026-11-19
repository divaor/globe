// Art and architecture, what's where (v0.27.0). More → Art and architecture: the artists and architects with their
// trails (every museum that holds an artist's best-known works, every building of an architect), the three map
// filters, and "Plan a trip" into the travel guide. The travel guide gains two tabs for each city, Art ("In Madrid
// you can see…", museum by museum, by kind, period and artist) and Buildings (by architect and style). The cards of
// our art items say where each work is now.
import { Palette, Map as MapIcon, Luggage, ChevronLeft, X } from 'lucide';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { RenderCtx } from '../layers/types';
import type { TravelGuide } from '../guide/guide';
import { h, icon, clear } from '../ui/dom';
import { lang, fmtCompact, L, tx } from '../app/i18n';
import { nowInHook } from '../modes/stories';
import { loadArt, loadArch, loadNowIn, nm, yearText, commons, kindIcon, KINDS, PERIODS, museumPlace, workWhy, buildingPlace, type Work, type Building, type Museum, type ArtData } from './data';
import { planStar, planHooks, addPlace, type PlaceSpec } from '../guide/plan';
import { workCard, buildingCard, museumCard } from './cards';

const es = () => lang() === 'es';
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A dot of a trail on the map: a museum (with how many of the artist's works) or a building; a tap opens its card. */
interface TrailPoint { at: [number, number]; n: number; label: string; open?: () => void }

export class ArtGuide {
  /** A trail on the map: an artist's museums or an architect's buildings. */
  private trail: { title: string; pts: TrailPoint[] } | null = null;
  private filter = { kind: 'all', period: 'all', artist: '' };
  private styleFilter = 'all';
  get info() { return { trail: this.trail ? { title: this.trail.title, n: this.trail.pts.length } : null }; }

  constructor(private app: App, private shell: Shell, private guide: TravelGuide) {
    shell.addMenu({ id: 'art', icon: Palette, label: () => L('Art and architecture', 'Arte y arquitectura'), order: 28.5, group: 'explore', onClick: () => void this.open() });
    app.renderer.overlays.add((rc) => this.draw(rc));
    // A tap on a trail's dot opens its card (a museum and the artist's works there, or a building).
    shell.tapHandlers.unshift((x, y) => this.tap(x, y));
    // A city's guide from a card ("The city's art guide").
    app.on('open-guide', (city: unknown, tab: unknown) => void this.guide.openCity(String(city), (tab as 'art') ?? 'art'));
    // Our art items' cards: where each work is now.
    void loadNowIn().then((now) => {
      nowInHook.get = (id) => {
        const r = now[id];
        if (!r) return null;
        const city = r[3] ? this.guide.cityLabel(r[3]) : null;
        return { name: `${es() ? r[2] : r[1]}${city ? `, ${city}` : ''}`, open: r[3] ? () => void this.guide.openCity(r[3]!, 'art') : null };
      };
    });
  }

  private cardFn = (...a: Parameters<Shell['card']['showCustom']>) => { this.app.select(null); this.shell.card.showCustom(...a); };
  private openCity = (city: string) => { this.shell.card.hide(); void this.guide.openCity(city, 'art'); };
  showWork(w: Work) { workCard(this.cardFn, w, this.guide.cityLabel(w.museum.city), this.openCity, () => this.showAt(w.museum.at, nm(w.museum), () => this.showWork(w))); }
  showBuilding(b: Building) { buildingCard(this.cardFn, b, b.city ? this.guide.cityLabel(b.city) : null, (c) => { this.shell.card.hide(); void this.guide.openCity(c, 'buildings'); }, () => this.showAt(b.at, nm(b), () => this.showBuilding(b))); }
  showMuseum(m: Museum, works: Work[]) { museumCard(this.cardFn, m, works, this.guide.cityLabel(m.city), this.openCity, () => this.showAt(m.at, nm(m), () => this.showMuseum(m, works))); }

  /** "Show on the map": the card goes and the map flies to the place, drawn as a dot that opens the card again (on the
   * trail on screen, if it is one of its dots; else on its own). */
  private showAt(at: [number, number], label: string, open: () => void) {
    const onTrail = this.trail?.pts.some((p) => Math.abs(p.at[0] - at[0]) < 1e-6 && Math.abs(p.at[1] - at[1]) < 1e-6);
    if (!onTrail) this.setTrail({ title: label, pts: [{ at, n: 1, label, open }] });
    this.shell.card.hide();
    this.shell.sheet.close();
    this.app.renderer.view.flyTo({ lon: at[0], lat: at[1], zoom: Math.max(this.app.renderer.view.zoom, 13) });
    this.app.renderer.requestRender();
  }

  /** A tap on a trail's dot. */
  private tap(x: number, y: number): boolean {
    const t = this.trail;
    if (!t || this.app.mode) return false;
    const v = this.app.renderer.view;
    let best: TrailPoint | null = null, bestD = Infinity;
    for (const p of t.pts) {
      if (!p.open) continue;
      const q = v.project(p.at[0], p.at[1]);
      if (!q) continue;
      const d = Math.hypot(q[0] - x, q[1] - y), r = 6 + Math.min(10, Math.sqrt(p.n) * 3) + 10;
      if (d <= r && d < bestD) { best = p; bestD = d; }
    }
    if (!best) return false;
    best.open!();
    return true;
  }

  // ---- The panel ------------------------------------------------------------------------------------------------
  async open() {
    await this.guide.load();
    const [art, arch] = await Promise.all([loadArt(), loadArch()]);
    if (!art || !arch) { this.shell.toast(L('Art and architecture needs its data; check your connection.', 'Arte y arquitectura necesita sus datos; revisa tu conexión.')); return; }
    this.setTrail(null);
    const body = h('div', { class: 'guide art-menu' });
    body.append(h('p', { class: 'muted small' }, L('Which masterpieces and buildings you can see in which city: {0} best-known works in {1} museums, and {2} buildings with their architects and styles (from Wikidata).', 'Qué obras maestras y edificios puedes ver en qué ciudad: {0} obras muy conocidas en {1} museos y {2} edificios con sus arquitectos y estilos (de Wikidata).', art.works.length, art.museums.length, arch.buildings.length)));
    // The map filters.
    const filters = h('div', { class: 'chip-row' });
    for (const [id, ic, en, sp] of [['art-museums', '🏛️', 'Art museums', 'Museos de arte'], ['masterpieces', '🖼️', 'Masterpieces', 'Obras maestras'], ['architecture', '📐', 'Architectural styles', 'Estilos arquitectónicos']]) {
      const b = h('button', { type: 'button', class: `chip${this.app.isActive(id) ? ' on' : ''}`, 'data-art-filter': id }, `${ic} ${es() ? sp : en}`);
      b.addEventListener('click', () => { this.shell.sheet.close(); void this.app.activate(id); });
      filters.append(b);
    }
    body.append(h('h3', { class: 'sec-title' }, L('On the map', 'En el mapa')), filters);
    // Artists and architects, searchable.
    const input = h('input', { type: 'search', class: 'guide-search', placeholder: L('An artist or an architect…', 'Un artista o un arquitecto…'), 'aria-label': L('Search artists and architects', 'Buscar artistas y arquitectos') }) as HTMLInputElement;
    const artists = h('div', { class: 'guide-list', 'data-art': 'artists' }), architects = h('div', { class: 'guide-list', 'data-art': 'architects' });
    const fill = () => {
      clear(artists); clear(architects);
      const q = fold(input.value.trim());
      const match = (x: { name: [string, string] }) => !q || fold(x.name[0]).includes(q) || fold(x.name[1]).includes(q);
      const as = art.artists.filter((a) => match(a) && (art.byArtist.get(a.id)?.length ?? 0) >= (q ? 1 : 3))
        .sort((a, b) => (art.byArtist.get(b.id)!.length - art.byArtist.get(a.id)!.length) || b.sl - a.sl).slice(0, q ? 20 : 24);
      for (const a of as) {
        const ws = art.byArtist.get(a.id)!, ms = new Set(ws.map((w) => w.museum.id)).size;
        artists.append(this.row('🧑‍🎨', nm(a), L('{0} works in {1} museums', '{0} obras en {1} museos', ws.length, ms), () => this.openArtist(a.id, art), { 'data-artist': a.id }));
      }
      const rs = arch.architects.filter((a) => match(a) && (arch.byArchitect.get(a.id)?.length ?? 0) >= (q ? 1 : 3))
        .sort((a, b) => (arch.byArchitect.get(b.id)!.length - arch.byArchitect.get(a.id)!.length) || b.sl - a.sl).slice(0, q ? 20 : 18);
      for (const a of rs) {
        const bs = arch.byArchitect.get(a.id)!, cs = new Set(bs.map((b) => b.city ?? `${Math.round(b.at[0])},${Math.round(b.at[1])}`)).size;
        architects.append(this.row('📐', nm(a), L('{0} buildings in {1} places', '{0} edificios en {1} lugares', bs.length, cs), () => void this.openArchitect(a.id), { 'data-architect': a.id }));
      }
      if (!as.length) artists.append(h('p', { class: 'muted small' }, L('No artist by that name in the guide.', 'Ningún artista con ese nombre en la guía.')));
      if (!rs.length) architects.append(h('p', { class: 'muted small' }, L('No architect by that name in the guide.', 'Ningún arquitecto con ese nombre en la guía.')));
    };
    input.addEventListener('input', fill);
    body.append(input, h('h3', { class: 'sec-title' }, L('Artist trails', 'Rutas de artistas')), artists, h('h3', { class: 'sec-title' }, L('Architect trails', 'Rutas de arquitectos')), architects);
    fill();
    this.shell.openPanel('art', L('Art and architecture', 'Arte y arquitectura'), body);
  }

  private row(ic: string | HTMLElement, title: string, sub: string, onClick: () => void, attrs: Record<string, string> = {}, star?: HTMLElement): HTMLElement {
    const r = h('button', { type: 'button', class: 'guide-item', ...attrs }, h('span', { class: 'guide-item-ic' }, ic), h('span', { class: 'guide-item-text' }, h('span', { class: 'guide-item-title' }, title), sub ? h('span', { class: 'guide-item-sub' }, sub) : null));
    r.addEventListener('click', onClick);
    // ☆: into the trip (a work: its museum, with the work as the reason to go).
    return star ? h('div', { class: 'guide-item-wrap' }, r, star) : r;
  }
  private thumb(file: string | null, fallback: string): HTMLElement | string {
    if (!file) return fallback;
    const img = h('img', { class: 'guide-thumb', src: commons(file, 96), alt: '', loading: 'lazy' }) as HTMLImageElement;
    img.addEventListener('error', () => img.replaceWith(document.createTextNode(fallback)));
    return img;
  }
  private back(): HTMLElement {
    const b = h('button', { type: 'button', class: 'pill sm', 'data-art': 'back' }, icon(ChevronLeft, 15), L('Art and architecture', 'Arte y arquitectura'));
    b.addEventListener('click', () => void this.open());
    return b;
  }
  private trailButtons(cities: string[], pts: TrailPoint[], title: string, places: PlaceSpec[] = []): HTMLElement {
    const show = h('button', { type: 'button', class: 'pill sm primary', 'data-art': 'map' }, icon(MapIcon, 15), L('Show on the map', 'Ver en el mapa'));
    show.addEventListener('click', () => { this.setTrail({ title, pts }); this.shell.sheet.close(); this.fit(pts.map((p) => p.at)); this.app.renderer.requestRender(); });
    const plan = h('button', { type: 'button', class: 'pill sm', 'data-art': 'plan' }, icon(Luggage, 15), L('Plan a trip', 'Planear un viaje'));
    plan.addEventListener('click', () => {
      void (async () => {
        const before = this.guide.trip.length;
        for (const c of cities) this.guide.add(c);
        if (!before && this.guide.trip.length > 2) this.guide.bestOrder();
        // Each city comes with its places: the artist's museums with the works there, or the architect's buildings.
        let n = 0;
        for (const p of places) {
          const city = p.city ?? (p.at ? await planHooks.nearestCity?.(p.at) : null);
          if (!city) continue;
          addPlace({ ...p, city });
          n++;
        }
        this.shell.toast(L('{0} cities and {1} places added to your trip.', '{0} ciudades y {1} lugares agregados a tu viaje.', this.guide.trip.length - before, n));
        void this.guide.open();
      })();
    });
    return h('div', { class: 'tool-actions' }, show, plan);
  }

  /** An artist's trail: every museum that holds their best-known works. */
  async openArtist(id: string, data?: ArtData) {
    const art = data ?? (await loadArt());
    const a = art?.artists.find((x) => x.id === id);
    if (!art || !a) return;
    const ws = art.byArtist.get(id) ?? [];
    const byM = new Map<string, Work[]>();
    for (const w of ws) (byM.get(w.museum.id) ?? byM.set(w.museum.id, []).get(w.museum.id)!).push(w);
    const museums = [...byM.entries()].sort((x, y) => y[1].length - x[1].length || y[1][0].sl - x[1][0].sl);
    const body = h('div', { class: 'guide art-trail', 'data-trail': id });
    body.append(this.back(), h('div', { class: 'guide-title' }, `🧑‍🎨 ${nm(a)}`),
      h('p', { class: 'muted small' }, L('{0} best-known works in {1} museums in {2} cities.', '{0} obras muy conocidas en {1} museos de {2} ciudades.', ws.length, museums.length, new Set(museums.map(([m]) => art.museumById.get(m)!.city)).size)));
    const pts: TrailPoint[] = museums.map(([mid, list]) => { const m = art.museumById.get(mid)!; return { at: m.at, n: list.length, label: nm(m), open: () => this.showMuseum(m, art.byMuseum.get(m.id) ?? []) }; });
    body.append(this.trailButtons([...new Set(museums.map(([m]) => art.museumById.get(m)!.city))], pts, nm(a), museums.map(([mid, list]) => museumPlace(art.museumById.get(mid)!, list))));
    for (const [mid, list] of museums) {
      const m = art.museumById.get(mid)!;
      const head = this.row('🏛️', nm(m), `${this.guide.cityLabel(m.city) ?? ''} · ${L('{0} works', '{0} obras', list.length)}`, () => this.showMuseum(m, art.byMuseum.get(m.id) ?? []), { 'data-trail-museum': m.id }, planStar(museumPlace(m)));
      body.append(h('h3', { class: 'sec-title' }, nm(m)), h('div', { class: 'guide-list' }, head, ...list.map((w) => this.row(this.thumb(w.img, kindIcon(w.kind)), nm(w), yearText(w.year), () => this.showWork(w), { 'data-work': w.id }, planStar(museumPlace(m), workWhy(w))))));
    }
    this.shell.openPanel('art-trail', `🧑‍🎨 ${nm(a)}`, body);
  }

  /** An architect's trail: their buildings, city by city. */
  async openArchitect(id: string) {
    const arch = await loadArch();
    const a = arch?.architects.find((x) => x.id === id);
    if (!arch || !a) return;
    const bs = (arch.byArchitect.get(id) ?? []).slice().sort((x, y) => y.sl - x.sl);
    const body = h('div', { class: 'guide art-trail', 'data-trail': id });
    body.append(this.back(), h('div', { class: 'guide-title' }, `📐 ${nm(a)}`), h('p', { class: 'muted small' }, L('{0} buildings.', '{0} edificios.', bs.length)));
    const pts: TrailPoint[] = bs.map((b) => ({ at: b.at, n: 1, label: nm(b), open: () => this.showBuilding(b) }));
    body.append(this.trailButtons([...new Set(bs.map((b) => b.city).filter((c): c is string => !!c))], pts, nm(a), bs.map((b) => ({ ...buildingPlace(b), self: true }))));
    body.append(h('div', { class: 'guide-list' }, ...bs.map((b) => this.row(this.thumb(b.img, '🏛️'), nm(b), [b.city ? this.guide.cityLabel(b.city) : '', b.style ? nm(b.style) : '', yearText(b.year)].filter(Boolean).join(' · '), () => this.showBuilding(b), { 'data-building': b.id }, planStar(buildingPlace(b))))));
    this.shell.openPanel('art-trail', `📐 ${nm(a)}`, body);
  }

  // ---- The travel guide's tabs ---------------------------------------------------------------------------------------
  /** "In Madrid you can see…": the city's museums of the guide, each with its best-known works, filtered. */
  async artTab(el: HTMLElement, city: string, cityName: string) {
    const art = await loadArt();
    if (!art) { el.append(h('p', { class: 'muted small' }, L('The art guide could not be loaded.', 'No se pudo cargar la guía de arte.'))); return; }
    const museums = art.museums.filter((m) => m.city === city);
    if (!museums.length) { el.append(h('p', { class: 'muted small' }, L('None of {0}’s museums is among the {1} of the art guide; Museums lists them all.', 'Ninguno de los museos de {0} está entre los {1} de la guía de arte; Museos los muestra todos.', cityName, art.museums.length))); return; }
    const all = museums.flatMap((m) => art.byMuseum.get(m.id) ?? []);
    const f = this.filter;
    const period = PERIODS.find((p) => p[0] === f.period) ?? PERIODS[0];
    const shown = (w: Work) => (f.kind === 'all' || w.kind === f.kind) && (f.period === 'all' || (w.year != null && w.year >= period[2] && w.year < period[3])) && (!f.artist || w.artist?.id === f.artist);
    el.append(h('p', { class: 'guide-national' }, L('In {0} you can see {1} of the world’s best-known works, in {2} museums.', 'En {0} puedes ver {1} de las obras más conocidas del mundo, en {2} museos.', cityName, all.length, museums.length)));
    const redraw = () => { clear(el); void this.artTab(el, city, cityName); };
    const chips = <T extends string>(list: [T, { en: string; es: string }, ...unknown[]][], cur: string, set: (v: T) => void, attr: string) => {
      const row = h('div', { class: 'chip-row art-filters' });
      for (const [v, label] of list) {
        if (attr === 'kind' && v !== 'all' && !all.some((w) => w.kind === v)) continue;
        const b = h('button', { type: 'button', class: `chip sm${cur === v ? ' on' : ''}`, [`data-${attr}`]: v }, tx(label));
        b.addEventListener('click', () => { set(v); redraw(); });
        row.append(b);
      }
      return row;
    };
    el.append(chips(KINDS, f.kind, (v) => { f.kind = v; }, 'kind'), chips(PERIODS.map((p) => [p[0], p[1]] as [string, { en: string; es: string }]), f.period, (v) => { f.period = v; }, 'period'));
    const artists = [...new Map(all.filter((w) => w.artist).map((w) => [w.artist!.id, w.artist!])).values()].sort((a, b) => nm(a).localeCompare(nm(b)));
    if (artists.length > 1) {
      const sel = h('select', { class: 'art-artist-select', 'aria-label': L('Artist', 'Artista') }, h('option', { value: '' }, L('Every artist', 'Todos los artistas')), ...artists.map((a) => h('option', { value: a.id, selected: f.artist === a.id }, nm(a)))) as HTMLSelectElement;
      sel.addEventListener('change', () => { f.artist = sel.value; redraw(); });
      el.append(sel);
    }
    let any = false;
    for (const m of museums) {
      const ws = (art.byMuseum.get(m.id) ?? []).filter(shown);
      if (!ws.length) continue;
      any = true;
      const head = h('button', { type: 'button', class: 'art-museum-head', 'data-art-museum': m.id }, `🏛️ ${nm(m)}`, m.visitors ? h('span', { class: 'muted small' }, ` · ${L('{0} visitors a year', '{0} visitantes al año', fmtCompact(m.visitors))}`) : null);
      head.addEventListener('click', () => { this.guide.showPlace(m.at, nm(m), 12); museumCard(this.cardFn, m, art.byMuseum.get(m.id) ?? [], cityName, null); });
      el.append(h('h3', { class: 'sec-title art-museum' }, head, planStar(museumPlace(m))), h('div', { class: 'guide-list' }, ...ws.map((w) => this.row(this.thumb(w.img, kindIcon(w.kind)), nm(w), [w.artist ? nm(w.artist) : '', yearText(w.year)].filter(Boolean).join(' · '), () => { this.guide.showPlace(m.at, nm(m), 12); this.showWork(w); }, { 'data-work': w.id }, planStar(museumPlace(m), workWhy(w))))));
    }
    if (!any) el.append(h('p', { class: 'muted small' }, L('Nothing matches those filters here.', 'Nada coincide con esos filtros aquí.')));
    el.append(h('p', { class: 'muted small' }, L('The best-known works first (by how many Wikipedias write about them). Tap one for its card and picture.', 'Las obras más conocidas primero (según cuántas Wikipedias escriben sobre ellas). Toca una para ver su ficha y su imagen.')));
  }

  /** The city's notable buildings, by style, with their architects. */
  async buildingsTab(el: HTMLElement, city: string, cityName: string) {
    const arch = await loadArch();
    if (!arch) { el.append(h('p', { class: 'muted small' }, L('The architecture guide could not be loaded.', 'No se pudo cargar la guía de arquitectura.'))); return; }
    const all = arch.buildings.filter((b) => b.city === city);
    if (!all.length) { el.append(h('p', { class: 'muted small' }, L('Wikidata names no architect for {0}’s best-known buildings.', 'Wikidata no nombra arquitectos para los edificios más conocidos de {0}.', cityName))); return; }
    const styles = arch.styles.filter((s) => all.some((b) => b.style?.key === s.key));
    if (this.styleFilter !== 'all' && !styles.some((s) => s.key === this.styleFilter)) this.styleFilter = 'all';
    el.append(h('p', { class: 'guide-national' }, L('{0} notable buildings in {1}, with their architects and styles.', '{0} edificios destacados en {1}, con sus arquitectos y estilos.', all.length, cityName)));
    const row = h('div', { class: 'chip-row art-filters' });
    for (const [key, label, color] of [['all', L('Every style', 'Todos los estilos'), ''], ...styles.map((s) => [s.key, nm(s), s.color])]) {
      const b = h('button', { type: 'button', class: `chip sm${this.styleFilter === key ? ' on' : ''}`, 'data-style': key }, color ? h('span', { class: 'art-dot', style: `background:${color}` }) : null, label);
      b.addEventListener('click', () => { this.styleFilter = key; clear(el); void this.buildingsTab(el, city, cityName); });
      row.append(b);
    }
    el.append(row);
    const shown = all.filter((b) => this.styleFilter === 'all' || b.style?.key === this.styleFilter);
    el.append(h('div', { class: 'guide-list' }, ...shown.map((b) => this.row(this.thumb(b.img, '🏛️'), nm(b), [b.architects.map(nm).join(', '), b.style ? nm(b.style) : '', yearText(b.year)].filter(Boolean).join(' · '),
      () => { this.guide.showPlace(b.at, nm(b), 13); this.showBuilding(b); }, { 'data-building': b.id }, planStar({ ...buildingPlace(b), city: b.city ?? city })))));
    el.append(h('p', { class: 'muted small' }, L('From Wikidata: buildings that name their architect, the best known first. More → Explore → Art and architecture has each architect’s trail.', 'De Wikidata: edificios que nombran a su arquitecto, los más conocidos primero. Más → Explorar → Arte y arquitectura tiene la ruta de cada arquitecto.')));
  }

  // ---- The map -----------------------------------------------------------------------------------------------------
  private fit(pts: [number, number][]) {
    if (!pts.length) return;
    let x = 0, y = 0, z = 0;
    for (const [lo, la] of pts) { const p = (lo * Math.PI) / 180, q = (la * Math.PI) / 180; x += Math.cos(q) * Math.cos(p); y += Math.cos(q) * Math.sin(p); z += Math.sin(q); }
    const lon = (Math.atan2(y, x) * 180) / Math.PI, lat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
    const r = Math.PI / 180;
    let span = 0;
    for (const p of pts) for (const q of pts) span = Math.max(span, Math.acos(Math.min(1, Math.sin(p[1] * r) * Math.sin(q[1] * r) + Math.cos(p[1] * r) * Math.cos(q[1] * r) * Math.cos((p[0] - q[0]) * r))) / r);
    this.app.renderer.view.flyTo({ lon, lat, zoom: Math.max(1.05, Math.min(9, 140 / Math.max(3, span * 1.5))) * (window.innerWidth < 600 ? 0.85 : 1) });
  }

  private draw(rc: RenderCtx) {
    const t = this.trail;
    if (!t) return;
    const { ctx } = rc;
    ctx.save();
    for (const p of t.pts) {
      const q = rc.project(p.at[0], p.at[1]);
      if (!q) continue;
      const r = 6 + Math.min(10, Math.sqrt(p.n) * 3);
      ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, Math.PI * 2);
      ctx.fillStyle = '#7c5cff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      if (p.n > 1) { ctx.fillStyle = '#fff'; ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(p.n), q[0], q[1] + 0.5); }
      rc.labels.add({ text: p.label, x: q[0] + r + 4, y: q[1], align: 'left', priority: 2900, size: 12, weight: 750, color: '#fff', halo: 'rgba(0,0,0,0.85)' });
    }
    ctx.restore();
  }
  /** Puts the trail away (from the guide or a tap elsewhere). */
  clearTrail() { if (this.trail) this.setTrail(null); }

  /** The trail on the map, and its chip at the top ("📐 Archibald Leitch · 23 ✕"): its ✕ puts it away. */
  private chip: HTMLElement | null = null;
  private setTrail(t: { title: string; pts: TrailPoint[] } | null) {
    this.trail = t;
    this.chip?.remove();
    this.chip = null;
    if (t) {
      const x = h('button', { type: 'button', class: 'art-trail-x', title: L('Take it off the map', 'Quitarlo del mapa'), 'aria-label': L('Take it off the map', 'Quitarlo del mapa') }, icon(X, 14));
      x.addEventListener('click', () => this.clearTrail());
      this.chip = h('div', { class: 'art-trail-chip glass', role: 'status' }, h('span', { class: 'art-trail-name' }, `📍 ${t.title}${t.pts.length > 1 ? ` · ${t.pts.length}` : ''}`), x);
      this.app.root.append(this.chip);
    }
    this.app.renderer.requestRender();
  }
}
