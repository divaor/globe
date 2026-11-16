// Green planet (v0.31.0): More → Nature → Plants. The plant finder ("Where does it grow?"): any plant by its English,
// Spanish or Latin name. Our 300 work offline; any other of GBIF's plants is looked up live, and its range is GBIF's
// own live map of every sighting shared (no garden plants). For each: the best parks and botanical gardens to see it,
// when it flowers (iNaturalist's sightings marked in flower, worldwide or at a chosen place), and a trip. What grows
// here?: tap the map or press Near me for the plants people have seen most within 50 km (iNaturalist). Also the map's
// green filters, and what's on in nature this month.
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import { h, clear } from '../ui/dom';
import { lang, fmtCompact } from '../app/i18n';
import { matcher } from '../ui/match';
import { liveRange, natureTabs, type Live, type Wild } from '../wild/finder';
import { cellAt } from '../layers/carpet';
import { floweringEl } from '../wild/inat';
import { loadGreen, nm, tt, PLANT_GROUPS, plantGroupName, monthName, type Plant, type PlantGroup, type GreenData } from './data';
import { plantStatusBadge, monthsText } from './cards';
import {
  showPlantFocus, currentPlantFocus, greenLinks, openPlantCard, placesInRange, placeAt, placeName, openPlace, whatsOnPanel, spectaclesNear, openSpectacle,
  type Place, type PlantFocus,
} from '../layers/packs/green';

const es = () => lang() === 'es';
const L = (en: string, sp: string) => (es() ? sp : en);
/** Emoji for a plant GBIF found, by its class or family. */
const CLASS_EMOJI: Record<string, string> = { Pinopsida: '🌲', Polypodiopsida: '🌿', Liliopsida: '🌾', Bryopsida: '🌱', Magnoliopsida: '🌼', Cycadopsida: '🌴', Ginkgoopsida: '🍂' };
const FAMILY_EMOJI: Record<string, string> = { Cactaceae: '🌵', Arecaceae: '🌴', Orchidaceae: '🌺', Rosaceae: '🌸', Asteraceae: '🌼', Fagaceae: '🌳', Pinaceae: '🌲', Poaceae: '🌾', Fabaceae: '🌳' };

export class Plants {
  private data: GreenData | null = null;
  /** What grows here?: waiting for a tap on the map. */
  private picking = false;
  private here: [number, number] | null = null;
  get info() { return { picking: this.picking, here: this.here, focus: currentPlantFocus()?.id ?? null }; }

  constructor(private app: App, private shell: Shell, private wild: Wild) {
    wild.plants = this;
    shell.tapHandlers.unshift((_x, _y, g) => {
      if (!this.picking || app.mode) return false;
      this.picking = false;
      if (g) void this.whatGrowsHere(g);
      return true;
    });
    app.renderer.overlays.add((rc) => {
      if (!this.here) return;
      const p = rc.project(this.here[0], this.here[1]);
      if (!p) return;
      const { ctx } = rc;
      const r = (50 / 6371) * rc.view.pxPerRadian;
      ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(8, r), 0, Math.PI * 2);
      ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.strokeStyle = rc.theme.dark ? '#8ce99a' : '#2b8a3e'; ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, Math.PI * 2); ctx.fillStyle = rc.theme.dark ? '#8ce99a' : '#2b8a3e'; ctx.fill();
    });
  }

  private async load() { this.data ??= await loadGreen(); return this.data; }

  private row(ic: string | HTMLElement, title: string, sub: string, onClick: () => void, attrs: Record<string, string> = {}, tail?: HTMLElement | null): HTMLElement {
    const r = h('button', { type: 'button', class: 'guide-item', ...attrs }, h('span', { class: 'guide-item-ic' }, ic),
      h('span', { class: 'guide-item-text' }, h('span', { class: 'guide-item-title' }, title), sub ? h('span', { class: 'guide-item-sub' }, sub) : null), tail ?? null);
    r.addEventListener('click', onClick);
    return r;
  }

  // ---- The Nature panel's plants: the finder, What grows here?, the green filters and this month -----------------
  async open(query = '') {
    const d = await this.load();
    if (!d) { this.shell.toast(L('Plants need their data; check your connection.', 'Las plantas necesitan sus datos; revisa tu conexión.')); return; }
    const body = h('div', { class: 'guide wild-panel', 'data-green': 'nature' });
    body.append(natureTabs('plants', () => void this.wild.open(), () => void this.open()));
    body.append(h('p', { class: 'muted small' }, L(`Where plants grow wild and where to go to see them: ${d.plants.length} plants on the map, any other plant live from GBIF.`, `Dónde crecen silvestres las plantas y adónde ir a verlas: ${d.plants.length} plantas en el mapa y cualquier otra en vivo desde GBIF.`)));
    const filters = h('div', { class: 'chip-row' });
    for (const [id, ic, en, sp] of [['plants', '🌿', 'Plants of the world', 'Plantas del mundo'], ['trees', '🌳', 'Famous trees', 'Árboles famosos'], ['gardens', '🌺', 'Botanical gardens', 'Jardines botánicos'],
      ['ecoregions', '🗺️', 'Ecoregions', 'Ecorregiones'], ['greenness', '🫁', 'The breathing planet', 'El planeta que respira'], ['calendar', '📅', 'Nature’s calendar', 'Calendario de la naturaleza'], ['crops', '🌾', 'Where our food first grew', 'Dónde se cultivaron nuestros alimentos']]) {
      const b = h('button', { type: 'button', class: `chip${this.app.isActive(id) ? ' on' : ''}`, 'data-green-filter': id }, `${ic} ${es() ? sp : en}`);
      b.addEventListener('click', () => { this.shell.sheet.close(); void this.app.activate(id); });
      filters.append(b);
    }
    body.append(h('h3', { class: 'sec-title' }, L('On the map', 'En el mapa')), filters);
    // This month.
    const m = new Date().getMonth() + 1;
    const on = h('button', { type: 'button', class: 'pill', 'data-green': 'whats-on-open' }, `📅 ${L(`What’s on in ${monthName(m - 1)}`, `Qué hay en ${monthName(m - 1)}`)}`);
    on.addEventListener('click', () => { void this.app.activate('calendar'); void whatsOnPanel(m); });
    body.append(h('h3', { class: 'sec-title' }, L('This month', 'Este mes')), h('p', { class: 'muted small' }, L('Blossoms, autumn forests and animal spectacles happening now, the nearest first.', 'Floraciones, bosques de otoño y espectáculos animales que ocurren ahora, primero los más cercanos.')), h('div', { class: 'chip-row' }, on));
    // What grows here?
    const tap = h('button', { type: 'button', class: 'pill', 'data-green': 'here-tap' }, `👆 ${L('Tap the map', 'Toca el mapa')}`);
    const near = h('button', { type: 'button', class: 'pill', 'data-green': 'here-near' }, `📍 ${L('Near me', 'Cerca de mí')}`);
    tap.addEventListener('click', () => { this.shell.sheet.close(); this.picking = true; this.shell.toast(L('Tap anywhere on the map: what grows there?', 'Toca cualquier lugar del mapa: ¿qué crece allí?'), 3500); });
    near.addEventListener('click', () => {
      if (!navigator.geolocation) { this.shell.toast(L('This device can’t tell where you are.', 'Este dispositivo no puede saber dónde estás.')); return; }
      navigator.geolocation.getCurrentPosition((p) => void this.whatGrowsHere([p.coords.longitude, p.coords.latitude]), () => this.shell.toast(L('Couldn’t find where you are.', 'No se pudo saber dónde estás.')), { timeout: 10000, maximumAge: 600000 });
    });
    body.append(h('h3', { class: 'sec-title' }, L('What grows here?', '¿Qué crece aquí?')), h('p', { class: 'muted small' }, L('The plants people have seen most within 50 km of a place, with photos.', 'Las plantas más vistas a menos de 50 km de un lugar, con fotos.')), h('div', { class: 'chip-row' }, tap, near));
    // The finder.
    const input = h('input', { type: 'search', class: 'guide-search', 'data-green': 'find', placeholder: L('A plant: baobab, edelweiss, Quercus robur…', 'Una planta: baobab, edelweiss, Quercus robur…'), 'aria-label': L('Find a plant', 'Buscar una planta'), value: query }) as HTMLInputElement;
    const ours = h('div', { class: 'guide-list', 'data-green': 'ours' }), live = h('div', { class: 'guide-list', 'data-green': 'live' });
    let timer = 0;
    const fill = () => {
      clear(ours); clear(live);
      const q = input.value.trim();
      if (!q) {
        for (const g of Object.keys(PLANT_GROUPS) as PlantGroup[]) for (const p of d.plants.filter((x) => x.g === g).slice(0, 3)) ours.append(this.plantRow(p));
        return;
      }
      const mt = matcher(q);
      const hits = d.plants.map((p) => [p, Math.max(mt(p.n[0]), mt(p.n[1]), mt(p.sci))] as const).filter(([, s]) => s > 0).sort((x, y) => y[1] - x[1] || y[0].sl - x[0].sl).slice(0, 12);
      for (const [p] of hits) ours.append(this.plantRow(p));
      if (!hits.length) ours.append(h('p', { class: 'muted small' }, L('None of our plants by that name. Other plants from GBIF:', 'Ninguna de nuestras plantas con ese nombre. Otras plantas de GBIF:')));
      clearTimeout(timer);
      if (q.length < 3) return;
      timer = window.setTimeout(() => void this.liveSearch(q).then((list) => {
        if (input.value.trim() !== q) return;
        clear(live);
        const known = new Set(d.plants.map((p) => p.sci.toLowerCase()));
        if (list === null) live.append(h('p', { class: 'muted small' }, L('Other plants need the internet.', 'Las demás plantas necesitan internet.')));
        for (const s of (list ?? []).filter((x) => !known.has(x.sci.toLowerCase())).slice(0, 8)) live.append(this.row('🔎', s.name, `${s.sci}${s.family ? ` · ${s.family}` : ''} · GBIF`, () => void this.openLive(s), { 'data-gbif': String(s.key) }));
      }), 450);
    };
    input.addEventListener('input', fill);
    body.append(h('h3', { class: 'sec-title' }, L('Where does it grow?', '¿Dónde crece?')), input, ours, live);
    fill();
    this.shell.openPanel('nature', L('Nature', 'Naturaleza'), body);
    if (!query) setTimeout(() => input.focus({ preventScroll: true }), 50);
  }

  private plantRow(p: Plant): HTMLElement {
    return this.row(p.e, nm(p), `${p.sci} · ${plantGroupName(p.g)}`, () => void this.openPlant(p), { 'data-plant': p.id }, plantStatusBadge(p));
  }

  /** GBIF's plant species whose name matches (scientific or common, in any language). */
  private async liveSearch(q: string): Promise<Live[] | null> {
    try {
      const r = await fetch(`https://api.gbif.org/v1/species/search?q=${encodeURIComponent(q)}&rank=SPECIES&status=ACCEPTED&highertaxonKey=6&datasetKey=d7dddbf4-2cf0-4f39-9b2a-bb099caae36c&limit=12`);
      if (!r.ok) return null;
      const j = (await r.json()) as { results?: { key: number; nubKey?: number; canonicalName?: string; scientificName: string; class?: string; family?: string; vernacularNames?: { vernacularName: string; language?: string }[] }[] };
      const want = es() ? 'spa' : 'eng';
      return (j.results ?? []).map((s) => {
        const vn = s.vernacularNames ?? [];
        const name = vn.find((v) => v.language === want)?.vernacularName ?? vn.find((v) => v.language === 'eng')?.vernacularName ?? s.canonicalName ?? s.scientificName;
        return { key: s.nubKey ?? s.key, sci: s.canonicalName ?? s.scientificName, name: name.charAt(0).toUpperCase() + name.slice(1), cls: s.family ?? s.class ?? null, family: s.family ?? null };
      });
    } catch { return null; }
  }

  /** Our plant: where it grows on the map, and the finder's page for it. */
  async openPlant(p: Plant) {
    await this.load();
    await showPlantFocus({ id: p.id, name: nm(p), e: p.e, cells: p.cells, counts: p.counts, plant: p });
    this.page({ name: nm(p), sci: p.sci, e: p.e, plant: p, best: currentPlantFocus()?.best ?? [] });
  }

  /** Any other plant: GBIF's live map, its best parks and gardens from that map, and when it flowers. */
  async openLive(s: Live) {
    await this.load();
    if (!s.key) {
      const r = await fetch(`https://api.gbif.org/v1/species/match?kingdom=Plantae&name=${encodeURIComponent(s.sci)}`).catch(() => null);
      const j = r?.ok ? ((await r.json()) as { usageKey?: number; acceptedUsageKey?: number; family?: string }) : null;
      if (!j?.usageKey) { this.shell.toast(L('GBIF didn’t answer; check your connection.', 'GBIF no respondió; revisa tu conexión.')); return; }
      s = { ...s, key: j.acceptedUsageKey ?? j.usageKey, family: j.family ?? null };
    }
    let range: Awaited<ReturnType<typeof liveRange>> = null;
    try { range = await liveRange(s.key); } catch { this.shell.toast(L('GBIF didn’t answer; check your connection.', 'GBIF no respondió; revisa tu conexión.')); return; }
    if (!range) { this.shell.toast(L(`No sightings of ${s.name} with a place on GBIF.`, `No hay avistamientos de ${s.name} con lugar en GBIF.`)); return; }
    const best = await placesInRange(range.cells, range.counts);
    const e = FAMILY_EMOJI[s.family ?? ''] ?? CLASS_EMOJI[s.cls ?? ''] ?? '🌱';
    const f: PlantFocus = { id: `gbif:${s.key}`, name: s.name, e, cells: range.cells, counts: range.counts, best,
      note: L('GBIF’s live map: every sighting of it shared on GBIF, in squares of about 150 km, gardens included. Darker: more sightings.', 'El mapa en vivo de GBIF: cada avistamiento compartido en GBIF, en cuadros de unos 150 km, jardines incluidos. Más oscuro: más avistamientos.') };
    await showPlantFocus(f);
    this.page({ name: s.name, sci: s.sci, e, best });
  }

  /** The finder's page for one plant: its card (ours), the best places, when it flowers, a trip. */
  private page(o: { name: string; sci: string; e: string; plant?: Plant; best: Place[] }) {
    const body = h('div', { class: 'guide wild-panel', 'data-green': 'page', 'data-sci': o.sci });
    const back = h('button', { type: 'button', class: 'pill sm', 'data-green': 'back' }, `‹ ${L('Plants', 'Plantas')}`);
    back.addEventListener('click', () => void this.open());
    body.append(back, h('p', { class: 'wild-page-head' }, h('span', { class: 'wild-page-emoji' }, o.e), h('span', {}, h('strong', {}, o.name), h('br'), h('em', { class: 'muted small' }, o.sci))));
    if (o.plant) {
      const b = h('button', { type: 'button', class: 'pill sm', 'data-green': 'card' }, `${o.e} ${L('Its card', 'Su ficha')}`);
      b.addEventListener('click', () => { this.shell.sheet.close(); openPlantCard(o.plant!); });
      body.append(b);
    } else body.append(h('p', { class: 'muted small' }, L('Not one of our plants: its map is GBIF’s live map, and needs the internet.', 'No es una de nuestras plantas: su mapa es el mapa en vivo de GBIF y necesita internet.')));
    // When it flowers: worldwide, or at the place chosen below.
    const whenBox = h('div', { 'data-green': 'when' });
    const whenTitle = h('h3', { class: 'sec-title' }, L('When it flowers', 'Cuándo florece'));
    const showMonths = (at?: [number, number], label?: string) => {
      whenTitle.textContent = label ? L(`When it flowers: ${label}`, `Cuándo florece: ${label}`) : L('When it flowers', 'Cuándo florece');
      clear(whenBox); whenBox.append(floweringEl(o.sci, at));
    };
    const list = h('div', { class: 'guide-list', 'data-green': 'best' });
    o.best.forEach((pl, i) => {
      const cc = pl.kind === 'park' ? pl.p.cc : pl.g.cc;
      const kind = pl.kind === 'park' ? (pl.p.k === 'np' ? L('National park', 'Parque nacional') : L('Nature reserve', 'Reserva natural')) : L('Botanical garden', 'Jardín botánico');
      list.append(this.row(String(i + 1), placeName(pl), [kind, cc ? this.app.data.name(cc, this.app.lang) : ''].filter(Boolean).join(' · '), () => {
        const at = placeAt(pl);
        this.app.flyTo(at[0], at[1], 30);
        showMonths(at, placeName(pl));
        openPlace(pl);
      }, { [pl.kind === 'park' ? 'data-park' : 'data-garden']: pl.kind === 'park' ? pl.p.id : pl.g.id }));
    });
    if (!o.best.length) list.append(h('p', { class: 'muted small' }, L('No park or garden of ours lies where it has been seen.', 'Ningún parque o jardín de los nuestros está donde se ha visto.')));
    body.append(h('h3', { class: 'sec-title' }, L('Best places to see it', 'Mejores lugares para verla')), list);
    if (o.best[0]) {
      const first = o.best[0];
      const trip = h('button', { type: 'button', class: 'pill sm', 'data-green': 'trip' }, `🧳 ${L(`Plan a trip to ${placeName(first)}`, `Planear un viaje a ${placeName(first)}`)}`);
      trip.addEventListener('click', () => greenLinks.planTrip(placeAt(first), placeName(first)));
      body.append(trip);
    }
    body.append(whenTitle, whenBox, h('p', { class: 'muted small' }, L('Sightings: GBIF.org and iNaturalist, by the people who shared them.', 'Avistamientos: GBIF.org e iNaturalist, de las personas que los compartieron.')));
    showMonths();
    this.shell.openPanel('nature', `${o.e} ${o.name}`, body);
  }

  // ---- What grows here? ------------------------------------------------------------------------------------------
  async whatGrowsHere(at: [number, number]) {
    const d = await this.load();
    this.here = at;
    this.app.renderer.requestRender();
    const body = h('div', { class: 'guide wild-panel', 'data-green': 'here' });
    const list = h('div', { class: 'guide-list', 'data-green': 'here-list' }, h('p', { class: 'muted small' }, L('Asking iNaturalist…', 'Preguntando a iNaturalist…')));
    const where = this.app.renderer.countryAt(at[0], at[1]);
    body.append(h('p', { class: 'muted small' }, L(`Within 50 km of ${at[1].toFixed(2)}°, ${at[0].toFixed(2)}°${where ? `, ${this.app.data.name(where, this.app.lang)}` : ''}: the plants people have seen most.`, `A menos de 50 km de ${at[1].toFixed(2)}°, ${at[0].toFixed(2)}°${where ? `, ${this.app.data.name(where, this.app.lang)}` : ''}: las plantas más vistas.`)), list);
    this.shell.openPanel('nature-here', L('What grows here?', '¿Qué crece aquí?'), body, () => { this.here = null; this.app.renderer.requestRender(); });
    this.app.flyTo(at[0], at[1], Math.max(this.app.renderer.view.zoom, 12));
    const known = new Map((d?.plants ?? []).map((p) => [p.sci.toLowerCase(), p]));
    try {
      const r = await fetch(`https://api.inaturalist.org/v1/observations/species_counts?lat=${at[1]}&lng=${at[0]}&radius=50&quality_grade=research&iconic_taxa=Plantae&per_page=30&locale=${es() ? 'es' : 'en'}`);
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { results?: { count: number; taxon: { id: number; name: string; preferred_common_name?: string; default_photo?: { square_url?: string; attribution?: string } } }[] };
      clear(list);
      for (const x of j.results ?? []) {
        const t = x.taxon, ours = known.get(t.name.toLowerCase());
        const name = t.preferred_common_name ? t.preferred_common_name.charAt(0).toUpperCase() + t.preferred_common_name.slice(1) : t.name;
        const img = t.default_photo?.square_url ? h('img', { class: 'guide-thumb', src: t.default_photo.square_url, alt: '', loading: 'lazy', title: t.default_photo.attribution ?? '' }) : '🌱';
        list.append(this.row(img, ours ? `${ours.e} ${name}` : name, `${t.name} · ${L(`${fmtCompact(x.count)} sightings`, `${fmtCompact(x.count)} avistamientos`)}`, () => {
          if (ours) { this.shell.sheet.close(); openPlantCard(ours); } else void this.openLive({ key: 0, sci: t.name, name, cls: null, family: null }).catch(() => undefined);
        }, { 'data-inat': String(t.id) }));
      }
      if (!j.results?.length) list.append(h('p', { class: 'muted small' }, L('No checked sightings within 50 km yet.', 'Aún no hay avistamientos verificados a menos de 50 km.')));
      list.append(h('p', { class: 'muted small' }, L('Photos and sightings: iNaturalist, by the people who shared them.', 'Fotos y avistamientos: iNaturalist, de las personas que los compartieron.')));
    } catch {
      clear(list); list.append(h('p', { class: 'muted small' }, L('Offline: the plants of ours that grow around here.', 'Sin conexión: nuestras plantas que crecen por aquí.')));
      const here = d?.byCell.get(cellAt(at[0], at[1])) ?? [];
      for (const p of here.slice(0, 30)) list.append(this.plantRow(p));
      if (!here.length) list.append(h('p', { class: 'muted small' }, L('None of our plants grows right here.', 'Ninguna de nuestras plantas crece justo aquí.')));
    }
  }

  // ---- The travel guide: nature's spectacles near a city ---------------------------------------------------------
  /** Nature's spectacles within about 600 km of a city: those on this month first, then the nearest. */
  async spectaclesNearby(el: HTMLElement, at: [number, number], city: string) {
    const near = (await spectaclesNear(at, 600)).slice(0, 6);
    if (!near.length) return;
    const m = new Date().getMonth() + 1;
    el.append(h('h3', { class: 'sec-title' }, L('Nature’s calendar nearby', 'Calendario de la naturaleza cerca')));
    const list = h('div', { class: 'guide-list' });
    for (const { s, km, now } of near) {
      list.append(this.row(s.e, tt(s.n), [monthsText(s), `${fmtCompact(Math.round(km))} km`, now ? (s.peak === m ? L('at its best now', 'en su mejor momento ahora') : L('on now', 'ahora')) : ''].filter(Boolean).join(' · '), () => {
        this.shell.sheet.close(); this.app.flyTo(s.at[0], s.at[1], 8); openSpectacle(s);
      }, { 'data-spectacle': s.id }));
    }
    el.append(list, h('p', { class: 'muted small' }, L(`Blossoms, autumn colours and animal spectacles within reach of ${city}.`, `Floraciones, colores de otoño y espectáculos animales al alcance de ${city}.`)));
  }
}
