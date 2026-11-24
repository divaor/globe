// Wild world (v0.30.0): More → Nature. The animal finder ("Where can I see…?"): any animal by its English, Spanish
// or Latin name. Our 400 work offline; any other of GBIF's species is looked up live, and its range is GBIF's own
// live map of every sighting shared (in the same squares as ours). For each: the best parks to see it (ranked by
// sightings), when to go (sightings by month, live from iNaturalist), and a trip. What lives here?: tap the map or
// press Near me for the animals people have seen most within 50 km (live from iNaturalist's checked sightings),
// or, offline, those of our 400 that live there.
import { PawPrint } from 'lucide';
import { geoDistance } from 'd3-geo';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import { h, icon, clear } from '../ui/dom';
import { planStar } from '../guide/plan';
import { wikiOf } from '../artguide/data';
import { lang, fmtCompact, L, dataLang, tx, inatLocale } from '../app/i18n';
import { matcher } from '../ui/match';
import { COLS, ROWS, cellAt, loadWild, loadParks, nm, groupName, GROUPS, type Animal, type Park, type WildData } from './data';
import { animalCard, parkCard, statusBadge, type CardFn } from './cards';
import { decodeTile } from './mvt';
import { months, monthBars } from './inat';
import { links, showFocus, currentFocus, type Focus } from '../layers/packs/wild';
import { outside } from '../data/outside';

const BASIS = ['HUMAN_OBSERVATION', 'PRESERVED_SPECIMEN', 'MACHINE_OBSERVATION', 'OCCURRENCE', 'MATERIAL_SAMPLE'];

/** A species from GBIF's search. */
export interface Live { key: number; sci: string; name: string; cls: string | null; family: string | null }

/** GBIF's live map of a species (every sighting shared, no zoo animals), in our grid's squares. */
export async function liveRange(key: number): Promise<{ cells: Int32Array; counts: Uint8Array } | null> {
  const q = new URLSearchParams({ srs: 'EPSG:4326', taxonKey: String(key), bin: 'square', squareSize: '32' });
  for (const b of BASIS) q.append('basisOfRecord', b);
  const tiles = await Promise.all([0, 1].map(async (x) => {
    const r = await outside(`https://api.gbif.org/v2/map/occurrence/density/0/${x}/0.mvt?${q}`);
    if (r.status === 204) return [] as [number, number][];
    if (!r.ok) throw new Error(String(r.status));
    const out: [number, number][] = [];
    for (const layer of decodeTile(new Uint8Array(await r.arrayBuffer()))) {
      const unit = layer.extent / 128; // 128 squares of 1.40625° across 180°
      for (const f of layer.feats) {
        if (!f.first) continue;
        const col = x * 128 + Math.floor((f.first[0] + 0.5) / unit), rowFromTop = Math.floor((f.first[1] + 0.5) / unit);
        if (col < 0 || col >= COLS || rowFromTop < 0 || rowFromTop >= ROWS) continue;
        out.push([(ROWS - 1 - rowFromTop) * COLS + col, Number(f.props.total) || 1]);
      }
    }
    return out;
  }));
  const m = new Map<number, number>();
  for (const [c, n] of tiles.flat()) m.set(c, Math.max(m.get(c) ?? 0, n));
  if (!m.size) return null;
  const cells = Int32Array.from([...m.keys()].sort((a, b) => a - b));
  return { cells, counts: Uint8Array.from(cells, (c) => Math.min(9, Math.floor(Math.log2(Math.max(1, m.get(c)!))))) };
}

const ICONIC: Record<string, { icon: string; en: string; es: string; taxa: string }> = {
  all: { icon: '🐾', en: 'All', es: 'Todos', taxa: 'Mammalia,Aves,Reptilia,Amphibia,Actinopterygii,Mollusca,Arachnida,Insecta' },
  mammals: { icon: '🦁', en: 'Mammals', es: 'Mamíferos', taxa: 'Mammalia' },
  birds: { icon: '🦜', en: 'Birds', es: 'Aves', taxa: 'Aves' },
  reptiles: { icon: '🐊', en: 'Reptiles and amphibians', es: 'Reptiles y anfibios', taxa: 'Reptilia,Amphibia' },
  sea: { icon: '🐟', en: 'Fish and sea life', es: 'Peces y vida marina', taxa: 'Actinopterygii,Mollusca' },
  small: { icon: '🦋', en: 'Insects and spiders', es: 'Insectos y arañas', taxa: 'Insecta,Arachnida' },
};
const ICONIC_EMOJI: Record<string, string> = { Mammalia: '🐾', Aves: '🐦', Reptilia: '🦎', Amphibia: '🐸', Actinopterygii: '🐟', Mollusca: '🐚', Arachnida: '🕷️', Insecta: '🦋' };

/** Animals or plants: the switch at the top of the Nature panel (v0.31.0). */
export function natureTabs(on: 'animals' | 'plants', animals: () => void, plants: () => void): HTMLElement {
  const row = h('div', { class: 'seg nature-tabs', role: 'tablist' });
  for (const [k, ic, en, sp, go] of [['animals', '🐾', 'Animals', 'Animales', animals], ['plants', '🌿', 'Plants', 'Plantas', plants]] as const) {
    const b = h('button', { type: 'button', class: `seg-btn${k === on ? ' on' : ''}`, role: 'tab', 'aria-selected': String(k === on), 'data-nature-tab': k }, `${ic} ${tx({ en, es: sp })}`);
    b.addEventListener('click', () => { if (k !== on) go(); });
    row.append(b);
  }
  return row;
}

export class Wild {
  /** The plant finder (green/finder.ts), for the switch at the top of the panel. */
  plants: { open(query?: string): Promise<void> } | null = null;
  private data: WildData | null = null;
  private parks: Park[] | null = null;
  /** What lives here?: waiting for a tap on the map. */
  private picking = false;
  private here: { at: [number, number]; group: string } | null = null;
  get info() { return { picking: this.picking, here: this.here, focus: currentFocus()?.id ?? null }; }

  constructor(private app: App, private shell: Shell) {
    shell.addMenu({ id: 'nature', icon: PawPrint, label: () => L('Nature', 'Naturaleza'), order: 28.7, group: 'explore', onClick: () => void this.open() });
    shell.tapHandlers.unshift((_x, _y, g) => {
      if (!this.picking || app.mode) return false;
      this.picking = false;
      if (g) void this.whatLivesHere(g);
      return true;
    });
    app.renderer.overlays.add((rc) => {
      if (!this.here) return;
      const p = rc.project(this.here.at[0], this.here.at[1]);
      if (!p) return;
      const { ctx } = rc;
      const r = (50 / 6371) * rc.view.pxPerRadian;
      ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(8, r), 0, Math.PI * 2);
      ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.strokeStyle = rc.theme.dark ? '#ffd43b' : '#e8590c'; ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, Math.PI * 2); ctx.fillStyle = rc.theme.dark ? '#ffd43b' : '#e8590c'; ctx.fill();
    });
  }

  private cardFn: CardFn = (...a) => { this.app.select(null); this.shell.card.showCustom(...a); };
  private async load() {
    this.data ??= await loadWild();
    this.parks ??= await loadParks();
    return this.data;
  }

  private row(ic: string | HTMLElement, title: string, sub: string, onClick: () => void, attrs: Record<string, string> = {}, tail?: HTMLElement | null): HTMLElement {
    const r = h('button', { type: 'button', class: 'guide-item', ...attrs }, h('span', { class: 'guide-item-ic' }, ic),
      h('span', { class: 'guide-item-text' }, h('span', { class: 'guide-item-title' }, title), sub ? h('span', { class: 'guide-item-sub' }, sub) : null), tail ?? null);
    r.addEventListener('click', onClick);
    return r;
  }

  // ---- The Nature panel: the finder, What lives here? and the map filters -----------------------------------------
  async open(query = '') {
    const d = await this.load();
    if (!d) { this.shell.toast(L('Nature needs its data; check your connection.', 'Naturaleza necesita sus datos; revisa tu conexión.')); return; }
    const body = h('div', { class: 'guide wild-panel', 'data-wild': 'nature' });
    body.append(natureTabs('animals', () => void this.open(), () => void this.plants?.open()));
    body.append(h('p', { class: 'muted small' }, L('Where animals live and where to go to see them: {0} animals on the map, any other species live from GBIF.', 'Dónde viven los animales y adónde ir a verlos: {0} animales en el mapa y cualquier otra especie en vivo desde GBIF.', d.animals.length)));
    const filters = h('div', { class: 'chip-row' });
    for (const [id, ic, en, sp] of [['wild', '🐾', 'Animals of the world', 'Animales del mundo'], ['wild-parks', '🏞️', 'Wildlife parks', 'Parques de vida silvestre'], ['wild-zoos', '🦓', 'Zoos and aquariums', 'Zoológicos y acuarios'], ['migrations', '🦋', 'Great migrations', 'Grandes migraciones']]) {
      const b = h('button', { type: 'button', class: `chip${this.app.isActive(id) ? ' on' : ''}`, 'data-wild-filter': id }, `${ic} ${tx({ en, es: sp })}`);
      b.addEventListener('click', () => { this.shell.sheet.close(); void this.app.activate(id); });
      filters.append(b);
    }
    body.append(h('h3', { class: 'sec-title' }, L('On the map', 'En el mapa')), filters);
    // What lives here?
    const tap = h('button', { type: 'button', class: 'pill', 'data-wild': 'here-tap' }, `👆 ${L('Tap the map', 'Toca el mapa')}`);
    const near = h('button', { type: 'button', class: 'pill', 'data-wild': 'here-near' }, `📍 ${L('Near me', 'Cerca de mí')}`);
    tap.addEventListener('click', () => { this.shell.sheet.close(); this.picking = true; this.shell.toast(L('Tap anywhere on the map: what lives there?', 'Toca cualquier lugar del mapa: ¿qué vive allí?'), 3500); });
    near.addEventListener('click', () => {
      if (!navigator.geolocation) { this.shell.toast(L('This device can’t tell where you are.', 'Este dispositivo no puede saber dónde estás.')); return; }
      // Your place, to about 10 km (v0.43.0): the nature services never get more than that.
      navigator.geolocation.getCurrentPosition((p) => void this.whatLivesHere([Math.round(p.coords.longitude * 10) / 10, Math.round(p.coords.latitude * 10) / 10]), () => this.shell.toast(L('Couldn’t find where you are.', 'No se pudo saber dónde estás.')), { timeout: 10000, maximumAge: 600000 });
    });
    body.append(h('h3', { class: 'sec-title' }, L('What lives here?', '¿Qué vive aquí?')), h('p', { class: 'muted small' }, L('The animals people have seen most within 50 km of a place, with photos.', 'Los animales más vistos a menos de 50 km de un lugar, con fotos.')), h('div', { class: 'chip-row' }, tap, near));
    // The finder.
    const input = h('input', { type: 'search', class: 'guide-search', 'data-wild': 'find', placeholder: L('An animal: jaguar, puffin, Panthera onca…', 'Un animal: jaguar, frailecillo, Panthera onca…'), 'aria-label': L('Find an animal', 'Buscar un animal'), value: query }) as HTMLInputElement;
    const ours = h('div', { class: 'guide-list', 'data-wild': 'ours' }), live = h('div', { class: 'guide-list', 'data-wild': 'live' });
    let timer = 0;
    const fill = () => {
      clear(ours); clear(live);
      const q = input.value.trim();
      if (!q) {
        // Some favourites to start with: the best known of each group.
        for (const g of Object.keys(GROUPS) as (keyof typeof GROUPS)[]) for (const a of d.animals.filter((x) => x.g === g && !x.gone).slice(0, 3)) ours.append(this.animalRow(a));
        return;
      }
      const m = matcher(q);
      const hits = d.animals.map((a) => [a, Math.max(m(a.n[0]), m(a.n[1]), m(a.sci))] as const).filter(([, s]) => s > 0).sort((x, y) => y[1] - x[1] || y[0].sl - x[0].sl).slice(0, 12);
      for (const [a] of hits) ours.append(this.animalRow(a));
      if (!hits.length) ours.append(h('p', { class: 'muted small' }, L('None of our animals by that name. Other species from GBIF:', 'Ninguno de nuestros animales con ese nombre. Otras especies de GBIF:')));
      // Any other species, live (after a pause in the typing).
      clearTimeout(timer);
      if (q.length < 3) return;
      timer = window.setTimeout(() => void this.liveSearch(q, d).then((list) => {
        if (input.value.trim() !== q) return;
        clear(live);
        const known = new Set(d.animals.map((a) => a.sci.toLowerCase()));
        const others = (list ?? []).filter((s) => !known.has(s.sci.toLowerCase()));
        if (list === null) live.append(h('p', { class: 'muted small' }, L('Other species need the internet.', 'Las demás especies necesitan internet.')));
        for (const s of others.slice(0, 8)) live.append(this.row('🔎', s.name, `${s.sci}${s.family ? ` · ${s.family}` : ''} · GBIF`, () => void this.openLive(s), { 'data-gbif': String(s.key) }));
      }), 450);
    };
    input.addEventListener('input', fill);
    body.append(h('h3', { class: 'sec-title' }, L('Where can I see…?', '¿Dónde puedo ver…?')), input, ours, live);
    fill();
    this.shell.openPanel('nature', L('Nature', 'Naturaleza'), body);
    if (!query) setTimeout(() => input.focus({ preventScroll: true }), 50);
  }

  private animalRow(a: Animal): HTMLElement {
    return this.row(a.e, nm(a), `${a.sci} · ${a.gone ? L('gone, {0}', 'desaparecido, {0}', a.gone) : groupName(a.g)}`, () => void this.openAnimal(a), { 'data-animal': a.id }, statusBadge(a));
  }

  /** GBIF's species whose name matches (scientific or common, in any language), animals only. */
  private async liveSearch(q: string, _d: WildData): Promise<Live[] | null> {
    try {
      const r = await outside(`https://api.gbif.org/v1/species/search?q=${encodeURIComponent(q)}&rank=SPECIES&status=ACCEPTED&highertaxonKey=1&datasetKey=d7dddbf4-2cf0-4f39-9b2a-bb099caae36c&limit=12`);
      if (!r.ok) return null;
      const j = (await r.json()) as { results?: { key: number; nubKey?: number; canonicalName?: string; scientificName: string; class?: string; family?: string; vernacularNames?: { vernacularName: string; language?: string }[] }[] };
      const want = L('eng', 'spa');
      return (j.results ?? []).map((s) => {
        const vn = s.vernacularNames ?? [];
        const name = vn.find((v) => v.language === want)?.vernacularName ?? vn.find((v) => v.language === 'eng')?.vernacularName ?? s.canonicalName ?? s.scientificName;
        return { key: s.nubKey ?? s.key, sci: s.canonicalName ?? s.scientificName, name: name.charAt(0).toUpperCase() + name.slice(1), cls: s.class ?? null, family: s.family ?? null };
      });
    } catch { return null; }
  }

  /** Our animal: its card, where it lives on the map, and the finder's page for it. */
  async openAnimal(a: Animal) {
    await this.load();
    await showFocus({ id: a.id, name: nm(a), e: a.e, cells: a.cells, counts: a.counts, animal: a });
    this.page({ name: nm(a), sci: a.sci, e: a.e, animal: a, best: currentFocus()?.best ?? [] });
  }

  /** Any other species: GBIF's live map, its best parks from that map, and its months. */
  async openLive(s: Live) {
    await this.load();
    // A species found by name only (What lives here?): its GBIF key first.
    if (!s.key) {
      const r = await outside(`https://api.gbif.org/v1/species/match?kingdom=Animalia&name=${encodeURIComponent(s.sci)}`).catch(() => null);
      const j = r?.ok ? ((await r.json()) as { usageKey?: number; acceptedUsageKey?: number; family?: string }) : null;
      if (!j?.usageKey) { this.shell.toast(L('GBIF didn’t answer; check your connection.', 'GBIF no respondió; revisa tu conexión.')); return; }
      s = { ...s, key: j.acceptedUsageKey ?? j.usageKey, family: j.family ?? null };
    }
    let range: Awaited<ReturnType<typeof liveRange>> = null;
    try { range = await liveRange(s.key); } catch { this.shell.toast(L('GBIF didn’t answer; check your connection.', 'GBIF no respondió; revisa tu conexión.')); return; }
    if (!range) { this.shell.toast(L('No sightings of {0} with a place on GBIF.', 'No hay avistamientos de {0} con lugar en GBIF.', s.name)); return; }
    const best = this.bestParks(range.cells, range.counts);
    const f: Focus = { id: `gbif:${s.key}`, name: s.name, e: ICONIC_EMOJI[s.cls ?? ''] ?? '🔎', cells: range.cells, counts: range.counts, best,
      note: L('GBIF’s live map: every sighting of it shared on GBIF, in squares of about 150 km. Darker: more sightings.', 'El mapa en vivo de GBIF: cada avistamiento compartido en GBIF, en cuadros de unos 150 km. Más oscuro: más avistamientos.') };
    await showFocus(f);
    this.page({ name: s.name, sci: s.sci, e: f.e, best, gbif: s.key });
  }

  /** The parks in a range's squares, those in the squares with most sightings first (for species we don't keep). */
  private bestParks(cells: Int32Array, counts: Uint8Array): Park[] {
    const m = new Map<number, number>();
    cells.forEach((c, i) => m.set(c, counts[i]));
    return (this.parks ?? []).map((p) => [p, m.get(cellAt(p.at[0], p.at[1]))] as const).filter((x): x is readonly [Park, number] => x[1] != null)
      .sort((a, b) => b[1] - a[1] || b[0].sl - a[0].sl).slice(0, 6).map((x) => x[0]);
  }

  /** The finder's page for one species: its card (ours), the best places, when to go, a trip. */
  private page(o: { name: string; sci: string; e: string; animal?: Animal; best: Park[]; gbif?: number }) {
    const body = h('div', { class: 'guide wild-panel', 'data-wild': 'page', 'data-sci': o.sci });
    const back = h('button', { type: 'button', class: 'pill sm', 'data-wild': 'back' }, `‹ ${L('Nature', 'Naturaleza')}`);
    back.addEventListener('click', () => void this.open());
    body.append(back, h('p', { class: 'wild-page-head' }, h('span', { class: 'wild-page-emoji' }, o.e), h('span', {}, h('strong', {}, o.name), h('br'), h('em', { class: 'muted small' }, o.sci))));
    if (o.animal) {
      const b = h('button', { type: 'button', class: 'pill sm', 'data-wild': 'card' }, `${o.e} ${L('Its card', 'Su ficha')}`);
      b.addEventListener('click', () => { this.shell.sheet.close(); animalCard(this.cardFn, o.animal!, links); });
      body.append(b);
    } else body.append(h('p', { class: 'muted small' }, L('Not one of our 400 animals: its map is GBIF’s live map, and needs the internet.', 'No es uno de nuestros 400 animales: su mapa es el mapa en vivo de GBIF y necesita internet.')));
    // When to go: worldwide, or at the place chosen below.
    const when = h('div', { class: 'wild-when', 'data-wild': 'when' }, h('p', { class: 'muted small' }, L('Asking iNaturalist…', 'Preguntando a iNaturalist…')));
    const whenTitle = h('h3', { class: 'sec-title' }, L('When to go', 'Cuándo ir'));
    const showMonths = (at?: [number, number], label?: string) => {
      clear(when); when.append(h('p', { class: 'muted small' }, L('Asking iNaturalist…', 'Preguntando a iNaturalist…')));
      whenTitle.textContent = label ? L('When to go: {0}', 'Cuándo ir: {0}', label) : L('When to go', 'Cuándo ir');
      void months(o.sci, at).then((v) => {
        clear(when);
        if (!v) { when.append(h('p', { class: 'muted small' }, L('When to go needs the internet (iNaturalist).', 'Cuándo ir necesita internet (iNaturalist).'))); return; }
        when.append(monthBars(v));
      });
    };
    // The best places.
    const list = h('div', { class: 'guide-list', 'data-wild': 'best' });
    o.best.forEach((p, i) => list.append(this.row(String(i + 1), nm(p), p.cc ? this.app.data.name(p.cc, this.app.lang) : '', () => {
      this.app.flyTo(p.at[0], p.at[1], 30);
      showMonths(p.at, nm(p));
      parkCard(this.cardFn, p, this.data, links);
    }, { 'data-park': p.id })));
    if (!o.best.length) list.append(h('p', { class: 'muted small' }, L('No park of ours lies where it has been seen.', 'Ningún parque de los nuestros está donde se ha visto.')));
    body.append(h('h3', { class: 'sec-title' }, L('Best places to see it', 'Mejores lugares para verlo')), list);
    if (o.best[0]) {
      const trip = h('button', { type: 'button', class: 'pill sm', 'data-wild': 'trip' }, `🧳 ${L('Plan a trip to {0}', 'Planear un viaje a {0}', nm(o.best[0]))}`);
      trip.addEventListener('click', () => links.planTrip(o.best[0].at, nm(o.best[0])));
      body.append(trip);
    }
    body.append(whenTitle, when, h('p', { class: 'muted small' }, L('Sightings: GBIF.org and iNaturalist, by the people who shared them.', 'Avistamientos: GBIF.org e iNaturalist, de las personas que los compartieron.')));
    showMonths();
    this.shell.openPanel('nature', `${o.e} ${o.name}`, body);
  }

  // ---- The travel guide's Wildlife nearby ------------------------------------------------------------------------
  /** Parks and reserves within about 150 km of a city, the nearest first, with the animals each is best for. */
  async wildlifeNearby(el: HTMLElement, at: [number, number], city: string, cityId?: string) {
    const d = await this.load();
    if (!d || !this.parks) return;
    const near = this.parks.map((p) => [p, geoDistance(p.at, at) * 6371] as const).filter(([, km]) => km <= 150)
      .sort((a, b) => (a[1] < 25 ? 0 : 1) - (b[1] < 25 ? 0 : 1) || b[0].sl - a[0].sl).slice(0, 6);
    const around = (d.byCell.get(cellAt(at[0], at[1])) ?? []).filter((a) => !a.gone).slice(0, 10);
    if (!near.length && !around.length) return;
    el.append(h('h3', { class: 'sec-title' }, L('Wildlife nearby', 'Vida silvestre cerca')));
    if (near.length) {
      const list = h('div', { class: 'guide-list' });
      for (const [p, km] of near) {
        const best = p.f.map((id) => d.byId.get(id)).filter((a): a is Animal => !!a).slice(0, 4);
        const r = this.row(p.k === 'np' ? '🏞️' : '🌿', nm(p), [`${fmtCompact(Math.round(km))} km`, best.map((a) => a.e).join(' ')].filter(Boolean).join(' · '), () => {
          this.shell.sheet.close(); this.app.flyTo(p.at[0], p.at[1], 30); parkCard(this.cardFn, p, d, links);
        }, { 'data-park': p.id });
        // ☆: into the trip, under this city.
        list.append(cityId ? h('div', { class: 'guide-item-wrap' }, r, planStar({ id: `park:${p.id}`, kind: 'park', city: cityId, n: p.n, at: p.at, url: wikiOf(p.id), ...(best.length ? { why: [{ t: [best.map((a) => a.n[0]).join(', '), best.map((a) => a.n[1]).join(', ')] }] } : {}) })) : r);
      }
      el.append(list);
    }
    if (around.length) {
      const chips = h('div', { class: 'wild-chips' });
      for (const a of around) {
        const b = h('button', { type: 'button', class: 'chip', 'data-animal': a.id }, `${a.e} ${nm(a)}`);
        b.addEventListener('click', () => { this.shell.sheet.close(); animalCard(this.cardFn, a, links); });
        chips.append(b);
      }
      el.append(h('p', { class: 'muted small' }, L('Animals that live around {0}:', 'Animales que viven cerca de {0}:', city)), chips);
    }
  }

  // ---- What lives here? ------------------------------------------------------------------------------------------
  async whatLivesHere(at: [number, number], group = 'all') {
    const d = await this.load();
    this.here = { at, group };
    this.app.renderer.requestRender();
    const body = h('div', { class: 'guide wild-panel', 'data-wild': 'here' });
    const chips = h('div', { class: 'chip-row' });
    for (const [k, g] of Object.entries(ICONIC)) {
      const b = h('button', { type: 'button', class: `chip${k === group ? ' on' : ''}`, 'data-here-group': k }, `${g.icon} ${tx(g)}`);
      b.addEventListener('click', () => void this.whatLivesHere(at, k));
      chips.append(b);
    }
    const list = h('div', { class: 'guide-list', 'data-wild': 'here-list' }, h('p', { class: 'muted small' }, L('Asking iNaturalist…', 'Preguntando a iNaturalist…')));
    const where = this.app.renderer.countryAt(at[0], at[1]);
    body.append(h('p', { class: 'muted small' }, L('Within 50 km of {0}°, {1}°{2}: the animals people have seen most.', 'A menos de 50 km de {0}°, {1}°{2}: los animales más vistos.', at[1].toFixed(2), at[0].toFixed(2), where ? `, ${this.app.data.name(where, this.app.lang)}` : '')), chips, list);
    this.shell.openPanel('nature-here', L('What lives here?', '¿Qué vive aquí?'), body, () => { this.here = null; this.app.renderer.requestRender(); });
    this.app.flyTo(at[0], at[1], Math.max(this.app.renderer.view.zoom, 12));
    const known = new Map((d?.animals ?? []).map((a) => [a.sci.toLowerCase(), a]));
    try {
      const r = await outside(`https://api.inaturalist.org/v1/observations/species_counts?lat=${at[1]}&lng=${at[0]}&radius=50&quality_grade=research&iconic_taxa=${ICONIC[group].taxa}&per_page=30&locale=${inatLocale()}`);
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { results?: { count: number; taxon: { id: number; name: string; preferred_common_name?: string; iconic_taxon_name?: string; default_photo?: { square_url?: string; attribution?: string } } }[] };
      clear(list);
      for (const x of j.results ?? []) {
        const t = x.taxon, ours = known.get(t.name.toLowerCase());
        const name = t.preferred_common_name ? t.preferred_common_name.charAt(0).toUpperCase() + t.preferred_common_name.slice(1) : t.name;
        const img = t.default_photo?.square_url ? h('img', { class: 'guide-thumb', src: t.default_photo.square_url, alt: '', loading: 'lazy', title: t.default_photo.attribution ?? '' }) : (ICONIC_EMOJI[t.iconic_taxon_name ?? ''] ?? '🐾');
        list.append(this.row(img, ours ? `${ours.e} ${name}` : name, `${t.name} · ${L('{0} sightings', '{0} avistamientos', fmtCompact(x.count))}`, () => {
          if (ours) { this.shell.sheet.close(); animalCard(this.cardFn, ours, links); } else void this.openLive({ key: 0, sci: t.name, name, cls: t.iconic_taxon_name ?? null, family: null }).catch(() => undefined);
        }, { 'data-inat': String(t.id) }));
      }
      if (!j.results?.length) list.append(h('p', { class: 'muted small' }, L('No checked sightings within 50 km yet.', 'Aún no hay avistamientos verificados a menos de 50 km.')));
      list.append(h('p', { class: 'muted small' }, L('Photos and sightings: iNaturalist, by the people who shared them.', 'Fotos y avistamientos: iNaturalist, de las personas que los compartieron.')));
    } catch {
      // Offline: those of our animals that live in this square.
      clear(list); list.append(h('p', { class: 'muted small' }, L('Offline: the animals of ours that live around here.', 'Sin conexión: nuestros animales que viven por aquí.')));
      const c = cellAt(at[0], at[1]);
      const here = (d?.byCell.get(c) ?? []).filter((a) => !a.gone && (group === 'all' || a.g === group || a.g2 === group));
      for (const a of here.slice(0, 30)) list.append(this.animalRow(a));
      if (!here.length) list.append(h('p', { class: 'muted small' }, L('None of our animals lives right here.', 'Ninguno de nuestros animales vive justo aquí.')));
    }
  }
}
