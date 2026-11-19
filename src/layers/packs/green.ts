// Green planet (v0.31.0): Plants of the world, Botanical gardens, Famous trees, Ecoregions, The breathing planet,
// Nature's calendar and Where our food first grew (public/data/green).
//
// Plants of the world is a carpet of about 300 plants (../carpet.ts, as Animals of the world), each drawn where it
// grows wild (GBIF's sightings shared under open licences, no garden plants, in squares of 1.40625°). A plant's card
// can "show where it grows": its squares in green, darker where more people saw it, and its best parks and gardens as
// numbered stars. The breathing planet plays NASA's twelve monthly pictures of how green the land is.
import { geoArea, geoContains, geoDistance, geoInterpolate } from 'd3-geo';
import type { Topology } from 'topojson-specification';
import { lang, fmtCompact, L, Lc, tx } from '../../app/i18n';
import { h } from '../../ui/dom';
import { LC } from '../context';
import { loadJSON, shapesFrom, dataUrl, type Shape } from '../../data/store';
import type { App } from '../../app/app';
import type { Shell } from '../../ui/shell';
import type { LayerDef, LayerHit, LayerInstance, LayerTapUi, Legend, RenderCtx } from '../types';
import type { RasterTexture } from '../../engine/gl';
import { crowdOf } from '../crowd';
import { Carpet, drawRange, glyph, pickDrawn, rangeView, distanceKm, cellAt, cellCenter, DEG, type Drawn } from '../carpet';
import { loadParks, loadWild, STATUS, threatened, statusName, type Park } from '../../wild/data';
import { parkCard, type CardFn } from '../../wild/cards';
import { links as wildLinks, wildData } from './wild';
import {
  loadGreen, loadGardens, loadTrees, loadCalendar, loadCrops, plantRelatives, nm, tt, monthName, MONTHS_EN, MONTHS_ES, PLANT_GROUPS, plantGroupName, yearText,
  BIOMES, biomeName, PROTECTION,
  type Plant, type PlantGroup, type Garden, type FamousTree, type Spectacle, type Crop, type GreenData,
} from '../../green/data';
import { plantCard, gardenCard, treeCard, ecoCard, spectacleCard, cropCard, plantStatusBadge, spectacleKind, monthsText, type GreenLinks } from '../../green/cards';

const es = () => lang() === 'es';
let APP: App | null = null;
let SHELL: Shell | null = null;
let data: GreenData | null = null;
let gardens: Garden[] | null = null;
let trees: FamousTree[] | null = null;
let parks: Park[] | null = null;
let calendar: Spectacle[] | null = null;
let crops: Crop[] | null = null;

// ---- Plants of the world --------------------------------------------------------------------------------------
/** A plant's best place: a park (wild/parks.json) or a garden. */
export type Place = { kind: 'park'; p: Park } | { kind: 'garden'; g: Garden };
export const placeAt = (pl: Place) => (pl.kind === 'park' ? pl.p.at : pl.g.at);
export const placeName = (pl: Place) => (pl.kind === 'park' ? nm(pl.p) : nm(pl.g));

/** Something whose range is shown on its own: one of our plants, or any plant the finder looked up live. */
export interface PlantFocus { id: string; name: string; e: string; cells: Int32Array; counts: Uint8Array; plant?: Plant; best?: Place[]; note?: string }
let focus: PlantFocus | null = null;

const showOf = (inst: LayerInstance) => String(inst.options.show ?? 'all') as 'all' | PlantGroup;
const statusOf = (inst: LayerInstance) => String(inst.options.status ?? 'all') as 'all' | 'endangered';
/** A view's own plants (an ambient playlist's: the deserts' cacti), by scientific name, comma-separated. */
const pickOf = (inst: LayerInstance) => String(inst.options.pick ?? '');
function okFor(inst: LayerInstance): (p: Plant) => boolean {
  const show = showOf(inst), status = statusOf(inst), pick = pickOf(inst);
  if (focus?.plant) { const f = focus.plant; return (p) => p === f; }
  if (pick) { const only = new Set(pick.split(',')); return (p) => only.has(p.sci); }
  return (p) => (status === 'all' || threatened(p.st)) && (show === 'all' || p.g === show);
}
const keyOf = (inst: LayerInstance) => (focus ? `focus:${focus.id}` : `${showOf(inst)}|${statusOf(inst)}|${pickOf(inst)}`);

/** How much a plant stands for a place: its fame, and much more for plants of a small range (the saguaro in the
 * Sonoran desert) than for those found on whole continents. */
const GROUP_WEIGHT: Record<PlantGroup, number> = { trees: 1, flowers: 0.85, cacti: 1.1, strange: 1.15, food: 0.95 };
const weightOf = (p: Plant) => p.sl * GROUP_WEIGHT[p.g] * Math.max(0.3, Math.min(2.5, Math.sqrt(300 / Math.max(1, p.cells.length))));
const carpet = new Carpet<Plant>(weightOf);

interface Star { pl: Place; n: number; x: number; y: number }

function drawCarpet(rc: RenderCtx, inst: LayerInstance) {
  if (!data) return;
  const status = statusOf(inst), dark = rc.theme.dark;
  const fill = dark ? 'rgba(8,24,14,0.55)' : 'rgba(250,255,245,0.7)';
  inst.state.drawn = carpet.draw(rc, data.byCell, okFor(inst), keyOf(inst), (p) => {
    if ((status === 'endangered' || focus) && p.st && STATUS[p.st] && threatened(p.st)) return { fill, ring: STATUS[p.st].color, ringWidth: 2.4 };
    return { fill };
  });
}

function drawStars(rc: RenderCtx, inst: LayerInstance) {
  const stars: Star[] = [];
  if (focus?.best?.length) {
    const { ctx } = rc;
    focus.best.forEach((pl, i) => {
      const at = placeAt(pl), xy = rc.project(at[0], at[1]);
      if (!xy) return;
      ctx.beginPath(); ctx.arc(xy[0], xy[1], 11, 0, Math.PI * 2);
      ctx.fillStyle = pl.kind === 'garden' ? '#f783ac' : '#ffd43b'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke();
      ctx.fillStyle = '#1c222e'; ctx.font = '800 12px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), xy[0], xy[1] + 0.5);
      rc.labels.reserve(xy[0] - 11, xy[1] - 11, xy[0] + 11, xy[1] + 11);
      stars.push({ pl, n: i + 1, x: xy[0], y: xy[1] });
    });
  }
  inst.state.stars = stars;
}

const cardFn: CardFn = (...a) => { APP?.select(null); SHELL?.card.showCustom(...a); };

async function placesOf(ids: string[]): Promise<Place[]> {
  parks ??= await loadParks();
  gardens ??= await loadGardens();
  const out: Place[] = [];
  for (const id of ids) {
    const g = gardens?.find((x) => x.id === id);
    if (g) { out.push({ kind: 'garden', g }); continue; }
    const p = parks?.find((x) => x.id === id);
    if (p) out.push({ kind: 'park', p });
  }
  return out;
}

/** Shows where a plant grows: its squares, the carpet showing only it, its best parks and gardens. */
export async function showPlantFocus(f: PlantFocus | null, fly = true) {
  if (!APP) return;
  focus = f;
  carpet.clear();
  if (f && !APP.isActive('plants')) await APP.activate('plants');
  const v = f && fly ? rangeView(f) : null;
  if (v) APP.flyTo(v.lon, v.lat, v.zoom);
  APP.renderer.requestRender();
  LC.notify?.();
  // (Before anything else is awaited: a card opened right after, by the search, must not be cleared by it.)
  APP.emit('layers');
  // Its best parks and gardens as numbered stars, once they are loaded.
  if (f?.plant && !f.best) {
    f.best = (await placesOf(f.plant.best)).slice(0, 6);
    if (focus === f) { APP.renderer.requestRender(); LC.notify?.(); }
  }
}
export const currentPlantFocus = () => focus;
/** Shows one plant's range by its id (a tour's stop), or every plant again (null); the map does not fly. */
export async function focusPlant(id: string | null) {
  data ??= await loadGreen();
  const p = id ? data?.byId.get(id) : null;
  await showPlantFocus(p ? plantFocusOf(p) : null, false);
}
const plantFocusOf = (p: Plant): PlantFocus => ({ id: p.id, name: nm(p), e: p.e, cells: p.cells, counts: p.counts, plant: p });

export const greenLinks: GreenLinks = {
  showRange: (p) => { SHELL?.card.hide(); void showPlantFocus(plantFocusOf(p)); },
  bestPlaces: (p) => void bestPlaces(p),
  relatives: (p) => void relativesPanel(p),
  openPlant: (p) => { SHELL?.sheet.close(); plantCard(cardFn, p, greenLinks); },
  plantById: (id) => data?.byId.get(id) ?? null,
  openCrop: (id) => void openCrop(id),
  // (A crop's story step is numbered from 1, as in the stories' own files; the event takes an index from 0.)
  openStory: (collection, id, step) => { SHELL?.card.hide(); APP?.emit('open-story', collection, id, step - 1); },
  openAnimal: (sci) => {
    const a = wildData()?.animals.find((x) => x.sci.toLowerCase() === sci.toLowerCase());
    if (!a) { void loadWild(); return false; }
    wildLinks.openAnimal(a);
    return true;
  },
  countryName: (id) => APP?.data.name(id, APP.lang) ?? id,
  planTrip: (at, label) => wildLinks.planTrip(at, label),
  toast: (msg) => SHELL?.toast(msg, 4000),
};

function row(ic: string, title: string, sub: string, onClick: () => void, attrs: Record<string, string> = {}, badge?: HTMLElement | null): HTMLElement {
  const r = h('button', { type: 'button', class: 'guide-item', ...attrs }, h('span', { class: 'guide-item-ic' }, ic),
    h('span', { class: 'guide-item-text' }, h('span', { class: 'guide-item-title' }, title), sub ? h('span', { class: 'guide-item-sub' }, sub) : null), badge ?? null);
  r.addEventListener('click', onClick);
  return r;
}

/**
 * The parks and gardens in a range's squares, those in the squares with most sightings first (for plants we don't
 * keep).
 */
export async function placesInRange(cells: Int32Array, counts: Uint8Array): Promise<Place[]> {
  parks ??= await loadParks();
  gardens ??= await loadGardens();
  const m = new Map<number, number>();
  cells.forEach((c, i) => m.set(c, counts[i]));
  const all: [Place, number, number][] = [];
  for (const p of parks ?? []) { const n = m.get(cellAt(p.at[0], p.at[1])); if (n != null) all.push([{ kind: 'park', p }, n, p.sl]); }
  for (const g of gardens ?? []) { const n = m.get(cellAt(g.at[0], g.at[1])); if (n != null) all.push([{ kind: 'garden', g }, n, g.sl]); }
  all.sort((a, b) => b[1] - a[1] || b[2] - a[2]);
  // Wild places first (up to four parks), then up to two gardens; more of either when the other is short.
  const ps = all.filter((x) => x[0].kind === 'park').map((x) => x[0]), gs = all.filter((x) => x[0].kind === 'garden').map((x) => x[0]);
  const np = Math.max(4, 6 - Math.min(2, gs.length));
  return [...ps.slice(0, np), ...gs.slice(0, 6 - Math.min(np, ps.length))].slice(0, 6);
}

/** Opens a place's card: a park's (Wildlife parks) or a garden's. */
export function openPlace(pl: Place) {
  if (pl.kind === 'park') parkCard(cardFn, pl.p, wildData(), wildLinks);
  else gardenCard(cardFn, pl.g, data, greenLinks);
}

async function bestPlaces(p: Plant) {
  const f = plantFocusOf(p);
  await showPlantFocus(f);
  SHELL?.card.hide();
  const body = h('div', { class: 'guide wild-panel', 'data-green': 'best', 'data-plant': p.id });
  body.append(h('p', { class: 'muted small' }, L('Parks, reserves and botanical gardens where {0} grows wild, those where people have shared the most sightings first. The numbers match the stars on the map (gardens in pink).', 'Parques, reservas y jardines botánicos donde {1} crece silvestre, primero aquellos donde más avistamientos se han compartido. Los números coinciden con las estrellas del mapa (jardines en rosa).', nm(p), nm(p).toLowerCase())));
  const list = h('div', { class: 'guide-list' });
  (f.best ?? []).forEach((pl, i) => {
    const sub = pl.kind === 'park' ? [pl.p.k === 'np' ? L('National park', 'Parque nacional') : L('Nature reserve', 'Reserva natural'), pl.p.cc ? greenLinks.countryName(pl.p.cc) : ''] : [L('Botanical garden', 'Jardín botánico'), pl.g.cc ? greenLinks.countryName(pl.g.cc) : ''];
    list.append(row(`${i + 1}`, placeName(pl), sub.filter(Boolean).join(' · '), () => {
      SHELL?.sheet.close(); const at = placeAt(pl); APP?.flyTo(at[0], at[1], 40); openPlace(pl);
    }, { [pl.kind === 'park' ? 'data-park' : 'data-garden']: pl.kind === 'park' ? pl.p.id : pl.g.id }));
  });
  if (!f.best?.length) list.append(h('p', { class: 'muted small' }, L('No park or garden of ours lies in its range.', 'Ningún parque o jardín de los nuestros está en su área.')));
  body.append(list);
  SHELL?.openPanel('green-best', `${p.e} ${Lc('a plant', 'Best places to see it', 'Mejores lugares para verla')}`, body);
}

async function relativesPanel(p: Plant) {
  if (!data) return;
  SHELL?.card.hide();
  const rel = plantRelatives(data, p);
  const body = h('div', { class: 'guide wild-panel', 'data-green': 'relatives', 'data-plant': p.id });
  body.append(h('p', { class: 'muted small' }, p.fam && rel.some((b) => b.fam === p.fam) ? L('{0} and its family, {1}, among our plants.', '{0} y su familia, {1}, entre nuestras plantas.', nm(p), p.fam) : L('Its closest relatives among our plants (order {0}).', 'Sus parientes más cercanos entre nuestras plantas (orden {0}).', p.ord)));
  const list = h('div', { class: 'guide-list' });
  for (const b of rel.slice(0, 30)) list.append(row(b.e, nm(b), b.sci, () => greenLinks.openPlant(b), { 'data-plant': b.id }, plantStatusBadge(b)));
  if (!rel.length) list.append(h('p', { class: 'muted small' }, L('None of its relatives is among our plants.', 'Ninguno de sus parientes está entre nuestras plantas.')));
  body.append(list);
  SHELL?.openPanel('green-relatives', `${p.e} ${L('Its relatives', 'Sus parientes')}`, body);
}

export const plantsOfTheWorld: LayerDef = {
  id: 'plants', category: 'flora', icon: '🌿', kind: 'overlay', stackOrder: 4,
  name: { en: 'Plants of the world', es: 'Plantas del mundo' },
  desc: { en: 'About 300 plants, each where it grows wild: trees, flowers, cacti, carnivorous plants and the wild forms of our food. Tap one for its card, when it flowers and the best places to see it.', es: 'Unas 300 plantas, cada una donde crece silvestre: árboles, flores, cactus, plantas carnívoras y las formas silvestres de nuestros alimentos. Toca una para ver su ficha, cuándo florece y los mejores lugares para verla.' },
  keywords: 'plants flora flowers trees cactus succulents carnivorous wild where grow bloom plantas flores arboles cactus suculentas carnivoras silvestres donde crecen florecen',
  credit: 'GBIF.org (CC0 and CC BY records), Wikidata (CC0)',
  options: [
    { id: 'show', label: { en: 'Show', es: 'Mostrar' }, type: 'select', default: 'all', choices: [{ value: 'all', label: { en: 'All plants', es: 'Todas las plantas' }, icon: '🌿' }, ...(Object.keys(PLANT_GROUPS) as PlantGroup[]).map((g) => ({ value: g, label: PLANT_GROUPS[g].name, icon: PLANT_GROUPS[g].icon }))] },
    { id: 'status', label: { en: 'Status', es: 'Estado' }, type: 'select', default: 'all', choices: [
      { value: 'all', label: { en: 'All', es: 'Todas', ctx: 'all plants' } },
      { value: 'endangered', label: { en: 'Threatened (vulnerable, endangered, critically)', es: 'Amenazadas (vulnerables, en peligro, en peligro crítico)' }, icon: '⚠️' },
    ] },
  ],
  async load() { data ??= await loadGreen(); if (!data) throw new Error('no data'); void loadParks().then((p) => { parks = p; }); void loadGardens().then((g) => { gardens = g; }); },
  onOptionsChanged() { focus = null; carpet.clear(); LC.requestRender(); },
  onDeactivate() { focus = null; carpet.clear(); },
  drawOverlay(rc, inst) {
    if (!data) return;
    if (focus) drawRange(rc, focus, 'plant');
    drawCarpet(rc, inst);
    drawStars(rc, inst);
  },
  labels(rc, inst) {
    const drawn = (inst.state.drawn as Drawn<Plant>[] | undefined) ?? [];
    if (rc.webZoom >= 3.2 || focus) for (const d of drawn) rc.labels.add({ text: nm(d.a), x: d.x, y: d.y + d.r + 7, priority: 260 + Math.min(300, d.a.sl), size: 10.5, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
    for (const s of (inst.state.stars as Star[] | undefined) ?? []) rc.labels.add({ text: placeName(s.pl), x: s.x, y: s.y + 18, priority: 700 - s.n, size: 10.5, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
  },
  legend(inst): Legend | null {
    if (!data) return null;
    if (focus) {
      return {
        kind: 'categories', title: L('{0}: where it grows', '{0}: dónde crece', focus.name),
        items: [
          { color: 'rgb(43,138,62)', label: L('Many sightings', 'Muchos avistamientos'), shape: 'square' },
          { color: 'rgba(105,219,124,0.55)', label: L('A few sightings', 'Pocos avistamientos'), shape: 'square' },
          ...(focus.best?.some((b) => b.kind === 'park') ? [{ color: '#ffd43b', label: L('Best parks to see it', 'Mejores parques para verla'), shape: 'dot' as const }] : []),
          ...(focus.best?.some((b) => b.kind === 'garden') ? [{ color: '#f783ac', label: L('Botanical gardens where it grows wild', 'Jardines botánicos donde crece silvestre'), shape: 'dot' as const }] : []),
        ],
        note: focus.note ?? L('Squares of about 150 km where people have shared sightings of it growing wild since 1970 (GBIF, open-licence records; no garden plants). Darker: more sightings, which also means more people looking.', 'Cuadros de unos 150 km donde se han compartido avistamientos de ella creciendo silvestre desde 1970 (GBIF, registros con licencia abierta; sin plantas de jardín). Más oscuro: más avistamientos, lo que también significa más gente observando.'),
        actions: [
          { label: L('All plants', 'Todas las plantas'), icon: '🌿', onClick: () => void showPlantFocus(null, false), primary: true },
          ...(focus.plant ? [{ label: L('Its card', 'Su ficha'), icon: focus.e, onClick: () => greenLinks.openPlant(focus!.plant!) }] : []),
        ],
      };
    }
    const shown = data.plants.filter(okFor(inst));
    if (statusOf(inst) === 'endangered') {
      return {
        kind: 'categories', title: L('{0} threatened plants', '{0} plantas amenazadas', shown.length),
        items: (['CR', 'EN', 'VU'] as const).map((s) => ({ color: STATUS[s].color, label: `${statusName(s)} (${shown.filter((p) => p.st === s).length})`, shape: 'dot' as const })),
        note: L('The ring shows its IUCN Red List category.', 'El anillo muestra su categoría en la Lista Roja de la UICN.'),
      };
    }
    const n = new Map<PlantGroup, number>();
    for (const p of shown) n.set(p.g, (n.get(p.g) ?? 0) + 1);
    return {
      kind: 'categories', title: L('{0} plants where they grow', '{0} plantas donde crecen', shown.length),
      items: (Object.keys(PLANT_GROUPS) as PlantGroup[]).filter((g) => n.get(g)).map((g) => ({ color: PLANT_GROUPS[g].color, icon: PLANT_GROUPS[g].icon, shape: 'emoji' as const, label: `${plantGroupName(g)} (${n.get(g)})` })),
      note: L('Each plant where people have seen it growing wild. Zoomed out, the best known of each area; zoom in for more. From GBIF sightings shared under open licences.', 'Cada planta donde se ha visto creciendo silvestre. De lejos, la más conocida de cada zona; acerca el mapa para ver más. A partir de avistamientos de GBIF compartidos con licencias abiertas.'),
    };
  },
  tap(_lon, _lat, inst, ui: LayerTapUi) {
    for (const s of (inst.state.stars as Star[] | undefined) ?? []) if (Math.hypot(s.x - ui.x, s.y - ui.y) < 14) { if (s.pl.kind === 'park') parkCard(ui.card, s.pl.p, wildData(), wildLinks); else gardenCard(ui.card, s.pl.g, data, greenLinks); return true; }
    const best = pickDrawn(inst.state.drawn as Drawn<Plant>[] | undefined, ui.x, ui.y);
    if (!best) return false;
    plantCard(ui.card, best.a, greenLinks);
    return true;
  },
  // The search box finds the plants by their names in English, Spanish or Latin, and shows where each grows.
  searchHint: { en: 'plants', es: 'plantas' },
  async searchLoad() { data ??= await loadGreen(); },
  search(match) {
    if (!data) return [];
    const out: LayerHit[] = [];
    for (const p of data.plants) {
      const s = Math.max(match(p.n[0]), match(p.n[1]), match(p.sci) - 6);
      if (s <= 0) continue;
      const top = p.cells[p.counts.indexOf(Math.max(...p.counts))] ?? p.cells[0];
      const [lon, lat] = top != null ? cellCenter(top) : [0, 0];
      out.push({
        label: nm(p), sub: `${p.sci} · ${plantGroupName(p.g)}`, icon: p.e, lon, lat, score: s + Math.min(10, p.sl / 25), wz: 3,
        prepare: () => void showPlantFocus(plantFocusOf(p), false),
        open: (ui) => plantCard(ui.card, p, greenLinks),
      });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 8);
  },
};

// ---- Botanical gardens and Famous trees -----------------------------------------------------------------------
const least = (z: number) => (z < 2 ? 40 : z < 3 ? 25 : z < 4 ? 14 : z < 5 ? 8 : z < 6 ? 4 : 0);

export const botanicalGardens: LayerDef = {
  id: 'gardens', category: 'flora', icon: '🌺', kind: 'overlay', stackOrder: 5,
  name: { en: 'Botanical gardens', es: 'Jardines botánicos' },
  desc: { en: 'About 1,300 botanical gardens and arboretums around the world, from Padua (1545) to today.', es: 'Unos 1300 jardines botánicos y arboretos de todo el mundo, desde Padua (1545) hasta hoy.' },
  keywords: 'botanical garden arboretum greenhouse plants jardin botanico arboreto invernadero plantas',
  credit: 'Wikidata (CC0)',
  options: [{ id: 'kind', label: { en: 'Show', es: 'Mostrar' }, type: 'select', default: 'all', choices: [
    { value: 'all', label: { en: 'All', es: 'Todos' } },
    { value: 'bg', label: { en: 'Botanical gardens', es: 'Jardines botánicos' }, icon: '🌺' },
    { value: 'arb', label: { en: 'Arboretums', es: 'Arboretos' }, icon: '🌳' },
  ] }],
  async load() { gardens ??= await loadGardens(); if (!gardens) throw new Error('no data'); data ??= await loadGreen(); },
  onOptionsChanged() { LC.requestRender(); },
  drawOverlay(rc, inst) {
    if (!gardens) return;
    const kind = String(inst.options.kind ?? 'all'), min = least(rc.webZoom);
    const crowd = crowdOf<Garden>(inst, 8);
    const placed = crowd.place(rc, () => gardens!.filter((g) => g.sl >= min && (kind === 'all' || g.k === kind)), (g) => g.at, () => 9, (g) => g.sl, kind);
    crowd.leaders(rc, (g) => (g.k === 'arb' ? '#2f9e44' : '#e64980'));
    const { ctx } = rc;
    for (const p of placed) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = p.it.k === 'arb' ? '#2f9e44' : '#e64980'; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
      const g = glyph(p.it.k === 'arb' ? '🌳' : '🌺', 12, rc.dpr), gs = g.width / rc.dpr;
      ctx.drawImage(g, p.x - gs / 2, p.y - gs / 2, gs, gs);
    }
  },
  labels(rc, inst) {
    if (rc.webZoom < 2.6) return;
    const crowd = crowdOf<Garden>(inst, 8);
    for (const p of crowd.placed) crowd.name(rc, p, { text: nm(p.it), priority: 200 + Math.min(300, p.it.sl * 4), size: 10.5, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
  },
  legend(inst) {
    const list = gardens ?? [];
    const kind = String(inst.options.kind ?? 'all');
    const n = (k: string) => list.filter((g) => g.k === k).length;
    return {
      kind: 'categories', title: L('{0} gardens', '{0} jardines', fmtCompact(list.filter((g) => kind === 'all' || g.k === kind).length)),
      items: [['bg', '#e64980', '🌺', L('Botanical gardens', 'Jardines botánicos')], ['arb', '#2f9e44', '🌳', L('Arboretums', 'Arboretos')]].filter(([k]) => kind === 'all' || k === kind)
        .map(([k, color, icon, label]) => ({ color, icon, label: `${label} (${fmtCompact(n(k))})`, shape: 'dot' as const })),
      note: L('From Wikidata. A garden’s card lists the plants of ours that grow wild around it.', 'De Wikidata. La ficha de cada jardín enumera las plantas nuestras que crecen silvestres a su alrededor.'),
    };
  },
  tap(_lon, _lat, inst, ui) {
    const hit = crowdOf<Garden>(inst, 8).pick(ui);
    if (!hit) return false;
    gardenCard(ui.card, hit, data, greenLinks);
    return true;
  },
  searchHint: { en: 'gardens', es: 'jardines' },
  async searchLoad() { gardens ??= await loadGardens(); data ??= await loadGreen(); },
  search(match) {
    const out: LayerHit[] = [];
    for (const g of gardens ?? []) {
      const s = Math.max(match(g.n[0]), match(g.n[1]));
      if (s < 50) continue;
      out.push({ label: nm(g), sub: [g.k === 'arb' ? '🌳' : '🌺', g.cc ? greenLinks.countryName(g.cc) : ''].join(' '), icon: g.k === 'arb' ? '🌳' : '🌺', lon: g.at[0], lat: g.at[1], score: s + Math.min(8, g.sl / 4), wz: 9, dot: g,
        prepare: (i) => { if (i.options.kind !== 'all' && i.options.kind !== g.k) APP?.setOption('gardens', 'kind', 'all'); }, open: (ui) => gardenCard(ui.card, g, data, greenLinks) });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 6);
  },
};

const treeColor = (t: FamousTree) => (t.rec ? '#f59f00' : t.status === 'gone' || t.status === 'fallen' ? '#868e96' : '#2b8a3e');
export const famousTrees: LayerDef = {
  id: 'trees', category: 'flora', icon: '🌳', kind: 'overlay', stackOrder: 5,
  name: { en: 'Famous trees', es: 'Árboles famosos' },
  desc: { en: 'The tallest, oldest, widest and best-loved trees: Hyperion, Methuselah, General Sherman, the Árbol del Tule, the Bodhi tree and hundreds more.', es: 'Los árboles más altos, viejos, anchos y queridos: Hyperion, Matusalén, el General Sherman, el Árbol del Tule, el árbol Bodhi y cientos más.' },
  keywords: 'tree famous oldest tallest record sequoia baobab olive yew arbol famoso mas viejo mas alto record secuoya baobab olivo tejo',
  credit: 'Wikidata (CC0); record holders checked by hand (sources on each card)',
  options: [{ id: 'kind', label: { en: 'Show', es: 'Mostrar' }, type: 'select', default: 'all', choices: [
    { value: 'all', label: { en: 'All', es: 'Todos' } },
    { value: 'records', label: { en: 'Record holders', es: 'Récords' }, icon: '🏆' },
    { value: 'others', label: { en: 'Remarkable trees', es: 'Árboles notables' }, icon: '🌳' },
  ] }],
  async load() { trees ??= await loadTrees(); if (!trees) throw new Error('no data'); data ??= await loadGreen(); },
  onOptionsChanged() { LC.requestRender(); },
  drawOverlay(rc, inst) {
    if (!trees) return;
    const kind = String(inst.options.kind ?? 'all'), min = least(rc.webZoom);
    const crowd = crowdOf<FamousTree>(inst, 8);
    const placed = crowd.place(rc, () => trees!.filter((t) => (t.rec ? true : t.sl >= min) && (kind === 'all' || (kind === 'records') === !!t.rec)), (t) => t.at, (t) => (t.rec ? 10 : 8), (t) => (t.rec ? 1000 : 0) + t.sl, kind);
    crowd.leaders(rc, treeColor);
    const { ctx } = rc;
    for (const p of placed) {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = treeColor(p.it); ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
      if (p.it.secret) { ctx.setLineDash([2, 2]); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      const g = glyph(p.it.rec ? '🏆' : '🌳', p.it.rec ? 13 : 11, rc.dpr), gs = g.width / rc.dpr;
      ctx.drawImage(g, p.x - gs / 2, p.y - gs / 2, gs, gs);
    }
  },
  labels(rc, inst) {
    const crowd = crowdOf<FamousTree>(inst, 8);
    for (const p of crowd.placed) if (p.it.rec || rc.webZoom >= 2.6) crowd.name(rc, p, { text: nm(p.it), priority: (p.it.rec ? 600 : 200) + Math.min(300, p.it.sl * 4), size: 10.5, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
  },
  legend(inst) {
    const list = trees ?? [];
    const kind = String(inst.options.kind ?? 'all');
    const recs = list.filter((t) => t.rec);
    return {
      kind: 'categories', title: L('{0} famous trees', '{0} árboles famosos', fmtCompact(list.filter((t) => kind === 'all' || (kind === 'records') === !!t.rec).length)),
      items: [
        ...(kind !== 'others' ? [{ color: '#f59f00', icon: '🏆', label: L('Record holders ({0})', 'Récords ({0})', recs.length), shape: 'dot' as const }] : []),
        ...(kind !== 'records' ? [{ color: '#2b8a3e', icon: '🌳', label: L('Remarkable trees', 'Árboles notables'), shape: 'dot' as const }, { color: '#868e96', icon: '🌳', label: L('Fallen or gone', 'Caídos o desaparecidos'), shape: 'dot' as const }] : []),
      ],
      note: L('A dashed ring: kept secret to protect it, drawn at its park. Trees from Wikidata; the record holders checked by hand.', 'Anillo punteado: se mantiene en secreto para protegerlo y se dibuja en su parque. Árboles de Wikidata; los récords, revisados a mano.'),
    };
  },
  tap(_lon, _lat, inst, ui) {
    const hit = crowdOf<FamousTree>(inst, 8).pick(ui);
    if (!hit) return false;
    treeCard(ui.card, hit, greenLinks);
    return true;
  },
  searchHint: { en: 'trees', es: 'árboles' },
  async searchLoad() { trees ??= await loadTrees(); data ??= await loadGreen(); },
  search(match) {
    const out: LayerHit[] = [];
    for (const t of trees ?? []) {
      const s = Math.max(match(t.n[0]), match(t.n[1]));
      if (s < 50) continue;
      out.push({ label: nm(t), sub: [t.rec ? `🏆 ${tt(t.rec)}` : '🌳', t.cc ? greenLinks.countryName(t.cc) : ''].filter(Boolean).join(' · '), icon: t.rec ? '🏆' : '🌳', lon: t.at[0], lat: t.at[1], score: s + (t.rec ? 10 : Math.min(8, t.sl / 4)), wz: 9, dot: t,
        prepare: (i) => { if (i.options.kind !== 'all') APP?.setOption('trees', 'kind', 'all'); }, open: (ui) => treeCard(ui.card, t, greenLinks) });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 6);
  },
};

// ---- Ecoregions -----------------------------------------------------------------------------------------------
interface EcoProps { i: number; n: string; es?: string; b: number; r: string; c: string; h: number }
let eco: Shape<EcoProps>[] = [];
async function loadEco() {
  if (eco.length) return;
  const topo = await loadJSON<Topology>('green/ecoregions.json');
  eco = shapesFrom<EcoProps>(topo, 'eco', (p) => String(p.i));
}
const inBox = (b: [number, number, number, number], lon: number, lat: number) => lat >= b[1] && lat <= b[3] && (b[0] <= b[2] ? lon >= b[0] && lon <= b[2] : lon >= b[0] || lon <= b[2]);
function ecoAt(lon: number, lat: number): Shape<EcoProps> | null {
  for (const s of eco) if (inBox(s.bbox, lon, lat) && geoContains(s.feature as never, [lon, lat])) return s;
  return null;
}
/** The squares of the grid whose middle lies in an ecoregion. */
function cellsIn(s: Shape<EcoProps>): number[] {
  const [w, so, e, n] = s.bbox, out: number[] = [];
  const east = e < w ? e + 360 : e;
  for (let lat = Math.floor((so + 90) / DEG) * DEG - 90 + DEG / 2; lat <= n; lat += DEG) {
    for (let lon = Math.floor((w + 180) / DEG) * DEG - 180 + DEG / 2; lon <= east; lon += DEG) {
      const l = lon > 180 ? lon - 360 : lon;
      if (geoContains(s.feature as never, [l, lat])) out.push(cellAt(l, lat));
    }
  }
  // A small ecoregion holds no square's middle: the square it lies in.
  if (!out.length) out.push(cellAt((w + (e < w ? e + 360 : e)) / 2 > 180 ? (w + e + 360) / 2 - 360 : (w + (e < w ? e + 360 : e)) / 2, (so + n) / 2));
  return out;
}
async function openEco(s: Shape<EcoProps>, ui: Pick<LayerTapUi, 'card'>) {
  data ??= await loadGreen();
  const wild = wildData() ?? await loadWild();
  const cells = cellsIn(s);
  const score = <T extends { cells: Int32Array; sl: number }>(list: T[]) => list.map((x) => [x, cells.filter((c) => { let lo = 0, hi = x.cells.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (x.cells[m] === c) return true; if (x.cells[m] < c) lo = m + 1; else hi = m - 1; } return false; }).length] as const)
    .filter(([, n]) => n > 0).sort((a, b) => b[1] / Math.sqrt(a[0].cells.length) - a[1] / Math.sqrt(b[0].cells.length) || b[0].sl - a[0].sl).map(([x]) => x);
  const plants = data ? score(data.plants) : [];
  const animals = wild ? score(wild.animals.filter((a) => !a.gone)) : [];
  const km2 = geoArea(s.feature as never) * 6371 * 6371;
  ecoCard(ui.card, s.feature.properties, km2, plants, animals, greenLinks);
}

const colorOf = (p: EcoProps, by: string) => (by === 'protection' ? PROTECTION[p.h]?.color ?? '#dee2e6' : by === 'own' ? p.c : BIOMES[p.b]?.color ?? '#e9ecef');
export const ecoregions: LayerDef = {
  id: 'ecoregions', category: 'flora', icon: '🗺️', kind: 'fill', defaultOpacity: 0.85, bakeable: true,
  name: { en: 'Ecoregions', es: 'Ecorregiones' },
  desc: { en: '846 ecoregions, each with its own mix of plants and animals, in 14 biomes: from the Amazon’s moist forests to the Namib’s fog desert. Tap one for what lives there.', es: '846 ecorregiones, cada una con su propia mezcla de plantas y animales, en 14 biomas: de los bosques húmedos del Amazonas al desierto de niebla del Namib. Toca una para ver qué vive allí.' },
  keywords: 'ecoregion biome habitat forest desert grassland tundra mangrove protected ecorregion bioma habitat bosque desierto pastizal tundra manglar protegida',
  credit: 'RESOLVE Ecoregions 2017 (Dinerstein et al., CC BY 4.0)',
  options: [{ id: 'by', label: { en: 'Colour by', es: 'Colorear por' }, type: 'select', default: 'biome', choices: [
    { value: 'biome', label: { en: 'Biome', es: 'Bioma' }, icon: '🌿' },
    { value: 'own', label: { en: 'Each ecoregion', es: 'Cada ecorregión' }, icon: '🎨' },
    { value: 'protection', label: { en: 'How protected', es: 'Cuánto está protegida' }, icon: '🛡️' },
  ] },
  // One biome in its colours and named (the deserts, the rainforests), the others dimmed (v0.31.3).
  { id: 'only', label: { en: 'Highlight', es: 'Resaltar' }, type: 'select', default: 'all', choices: [
    { value: 'all', label: { en: 'All biomes', es: 'Todos los biomas' } },
    ...Object.keys(BIOMES).map((b) => ({ value: b, label: { en: BIOMES[Number(b)].en, es: BIOMES[Number(b)].es } })),
  ] }],
  load: loadEco,
  onOptionsChanged() { LC.requestRender(); },
  drawFill(rc, inst) {
    const { ctx, path } = rc;
    const by = String(inst.options.by ?? 'biome');
    const only = Number(inst.options.only ?? 0) || 0;
    const dim = rc.theme.dark ? 'rgba(62,72,88,0.55)' : 'rgba(196,201,209,0.6)';
    const groups = new Map<string, Shape<EcoProps>[]>();
    for (const s of rc.visibleShapes(eco)) {
      const c = only && s.feature.properties.b !== only ? dim : colorOf(s.feature.properties, by);
      (groups.get(c) ?? groups.set(c, []).get(c)!).push(s);
    }
    for (const [c, list] of groups) {
      ctx.beginPath();
      for (const s of list) path(s.feature as never);
      ctx.fillStyle = c; ctx.fill();
    }
    ctx.lineWidth = 0.5; ctx.strokeStyle = rc.theme.dark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    for (const s of rc.visibleShapes(eco)) path(s.feature as never);
    ctx.stroke();
  },
  labels(rc, inst) {
    // With a biome highlighted, only its ecoregions are named, before the plants and animals on them; a view of its
    // own (an ambient playlist's) may name just a few, by their English names, comma-separated.
    const only = Number(inst.options.only ?? 0) || 0;
    const named = inst.options.named ? new Set(String(inst.options.named).split(',')) : null;
    if (rc.webZoom < (only ? 2.6 : 3.4)) return;
    for (const s of rc.visibleShapes(eco)) {
      const p = s.feature.properties;
      if ((only && p.b !== only) || (named && !named.has(p.n))) continue;
      const [w, so, e, n] = s.bbox;
      const span = (e < w ? e + 360 : e) - w;
      if (span < 32 / rc.webZoom ** 2 && rc.webZoom < 5) continue;
      const lon = w + span / 2, at = rc.project(lon > 180 ? lon - 360 : lon, (so + n) / 2);
      // A highlighted one may sit just beside its middle when a plant's disc is there.
      if (at) rc.labels.add({ text: es() && p.es ? p.es : p.n, x: at[0], y: at[1], priority: (only ? 520 : 120) + Math.min(200, span * 4), size: only ? 10.5 : 10, weight: only ? 700 : 600, color: rc.theme.label, halo: rc.theme.labelHalo, ...(only ? { gap: 2, avoid: [] } : {}) });
    }
  },
  legend(inst) {
    const by = String(inst.options.by ?? 'biome');
    if (by === 'protection') return {
      kind: 'categories', title: L('How much of each ecoregion is protected', 'Cuánto de cada ecorregión está protegido'),
      items: [1, 2, 3, 4].map((k) => ({ color: PROTECTION[k].color, label: `${tt(PROTECTION[k])} (${eco.filter((s) => s.feature.properties.h === k).length})` })),
      note: L('“Half protected”: at least half of it is protected land. “Imperiled”: little natural land left to save (RESOLVE, Nature Needs Half).', '“Protegida en la mitad”: al menos la mitad es tierra protegida. “En peligro”: queda poca tierra natural que salvar (RESOLVE, Nature Needs Half).'),
    };
    const only = Number(inst.options.only ?? 0) || 0;
    return {
      kind: 'categories', title: L('Ecoregions by biome', 'Ecorregiones por bioma'),
      items: Object.keys(BIOMES).map(Number).filter((b) => !only || b === only).map((b) => ({ color: BIOMES[b].color, label: `${biomeName(b)} (${eco.filter((s) => s.feature.properties.b === b).length})` }))
        .concat(only ? [{ color: '#5a6476', label: L('The other biomes', 'Los demás biomas') }] : []),
      note: by === 'own' ? L('Each ecoregion in its own colour from RESOLVE’s map. Tap one for what lives there.', 'Cada ecorregión con su propio color del mapa de RESOLVE. Toca una para ver qué vive allí.') : L('Tap an ecoregion for its plants and animals.', 'Toca una ecorregión para ver sus plantas y animales.'),
    };
  },
  tap(lon, lat, _inst, ui) {
    const s = ecoAt(lon, lat);
    if (!s) return false;
    void openEco(s, ui);
    return true;
  },
  searchHint: { en: 'ecoregions', es: 'ecorregiones' },
  searchLoad: loadEco,
  search(match) {
    const out: LayerHit[] = [];
    for (const s of eco) {
      const p = s.feature.properties;
      const sc = Math.max(match(p.n), match(p.es));
      if (sc < 55) continue;
      const [w, so, e, n] = s.bbox, lon = w + ((e < w ? e + 360 : e) - w) / 2;
      out.push({ label: es() && p.es ? p.es : p.n, sub: `🌿 ${biomeName(p.b)}`, icon: '🗺️', lon: lon > 180 ? lon - 360 : lon, lat: (so + n) / 2, score: sc, wz: 4, open: (ui) => void openEco(s, ui) });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 5);
  },
};

// ---- The breathing planet -------------------------------------------------------------------------------------
/** A year of greenness goes by in this many milliseconds. */
const GREEN_YEAR_MS = 24000;
const frames: (RasterTexture | null)[] = Array(12).fill(null);
const greenMonthOf = (inst: LayerInstance, now: number) => {
  const m = String(inst.options.month ?? 'play');
  return m === 'play' ? ((now % GREEN_YEAR_MS) / GREEN_YEAR_MS) * 12 : Number(m) - 1;
};
const NDVI_STOPS = ['#c8b48c', '#e8e3a0', '#a6d96a', '#66bd63', '#1a9850', '#006837'];

export const breathingPlanet: LayerDef = {
  id: 'greenness', category: 'flora', icon: '🫁', kind: 'raster', defaultOpacity: 0.9,
  animated: (inst) => String(inst.options.month ?? 'play') === 'play',
  name: { en: 'The breathing planet', es: 'El planeta que respira' },
  desc: { en: 'How green the land is, month by month, from NASA satellites: spring sweeps north in April and May, then south in October. The planet breathing in and out.', es: 'Qué tan verde está la tierra mes a mes, según satélites de la NASA: la primavera sube al norte en abril y mayo, y baja al sur en octubre. El planeta inhalando y exhalando.' },
  keywords: 'ndvi greenness vegetation seasons spring satellite nasa months green verdor vegetacion estaciones primavera satelite meses verde',
  credit: 'NASA Earth Observations: MODIS Terra NDVI, monthly 2024 (GIBS, public domain)',
  options: [{ id: 'month', label: { en: 'Month', es: 'Mes' }, type: 'select', default: 'play', choices: [
    { value: 'play', label: { en: 'All year (playing)', es: 'Todo el año (en marcha)' }, icon: '▶️' },
    ...MONTHS_EN.map((en, i) => ({ value: String(i + 1), label: { en, es: MONTHS_ES[i].charAt(0).toUpperCase() + MONTHS_ES[i].slice(1) } })),
  ] }],
  async load(ctx, inst) {
    if (!ctx.gl) throw new Error('WebGL2 is needed for this filter');
    const gl = ctx.gl;
    const want = (i: number) => (frames[i] ? Promise.resolve() : gl.load(dataUrl(`green/ndvi/${String(i + 1).padStart(2, '0')}.webp`)).then((t) => { frames[i] = t; ctx.requestRender(); }));
    // The month to show first, then the rest of the year one after another.
    const m = Math.floor(greenMonthOf(inst, performance.now()));
    await want(m);
    void (async () => { for (let k = 1; k < 12; k++) await want((m + k) % 12).catch(() => undefined); })();
  },
  onOptionsChanged() { LC.requestRender(); LC.notify?.(); },
  raster(rc, inst) {
    const t = greenMonthOf(inst, rc.now), i = Math.floor(t) % 12, j = (i + 1) % 12, f = t - Math.floor(t);
    const a = frames[i], b = frames[j];
    if (!a) return null;
    if (String(inst.options.month ?? 'play') === 'play') { const m = i; if (inst.state.shownMonth !== m) { inst.state.shownMonth = m; LC.notify?.(); } }
    // Playing: each month fades into the next.
    return b && f > 0.5 ? [{ texture: a, opacity: inst.opacity }, { texture: b, opacity: inst.opacity * Math.min(1, (f - 0.5) * 2) }] : [{ texture: a, opacity: inst.opacity }];
  },
  legend(inst) {
    const playing = String(inst.options.month ?? 'play') === 'play';
    const m = Math.floor(greenMonthOf(inst, performance.now()));
    const step = (by: number) => window.atlas?.app.setOption('greenness', 'month', String(((m + by + 12) % 12) + 1));
    return {
      kind: 'gradient', title: L('The breathing planet · {0}', 'El planeta que respira · {0}', monthName(m)),
      stops: NDVI_STOPS, min: L('Bare', 'Sin plantas'), max: L('Lush', 'Exuberante'),
      note: playing ? L('A year goes by in 24 seconds (2024). Pick a month to stop. Greener: more leaves, from NASA’s MODIS vegetation index.', 'Un año pasa en 24 segundos (2024). Elige un mes para detenerte. Más verde: más hojas, según el índice de vegetación MODIS de la NASA.')
        : L('Greener: more leaves, from NASA’s MODIS vegetation index (2024). Blank: no reading (snow, cloud, the polar night).', 'Más verde: más hojas, según el índice de vegetación MODIS de la NASA (2024). En blanco: sin lectura (nieve, nubes, la noche polar).'),
      actions: [
        { label: '◀', onClick: () => step(-1) },
        { label: '▶', onClick: () => step(1) },
        ...(playing ? [] : [{ label: L('▶ Play the year', '▶ Reproducir el año'), onClick: () => window.atlas?.app.setOption('greenness', 'month', 'play'), primary: true }]),
      ],
    };
  },
};

// ---- Nature's calendar ----------------------------------------------------------------------------------------
const thisMonth = () => new Date().getMonth() + 1;
const calMonthOf = (inst: LayerInstance) => { const m = String(inst.options.month ?? 'now'); return m === 'now' ? thisMonth() : Number(m); };
const KIND_COLOR: Record<Spectacle['kind'], string> = { bloom: '#f06595', autumn: '#e8590c', green: '#40c057', animal: '#4dabf7' };

/** What's on in a month, the nearest to a place first. */
function whatsOn(m: number, at: [number, number]): Spectacle[] {
  return (calendar ?? []).filter((s) => s.months.includes(m)).sort((a, b) => geoDistance(a.at, at) - geoDistance(b.at, at));
}
async function whatsOnPanel(m: number, at?: [number, number]) {
  calendar ??= await loadCalendar();
  data ??= await loadGreen();
  const from: [number, number] = at ?? APP?.renderer.view.center() ?? [0, 0];
  const list = whatsOn(m, from);
  const body = h('div', { class: 'guide wild-panel', 'data-green': 'whats-on', 'data-month': String(m) });
  const head = h('div', { class: 'chip-row' });
  for (const by of [-1, 1]) {
    const b = h('button', { type: 'button', class: 'pill sm', 'data-green-step': String(by) }, by < 0 ? `◀ ${monthName((m + 10) % 12)}` : `${monthName(m % 12)} ▶`);
    b.addEventListener('click', () => { APP?.setOption('calendar', 'month', String(((m - 1 + by + 12) % 12) + 1)); void whatsOnPanel(((m - 1 + by + 12) % 12) + 1, from); });
    head.append(b);
  }
  body.append(head, h('p', { class: 'muted small' }, L('{0} of nature’s spectacles in {1}, the nearest to the middle of the map first.', '{0} espectáculos de la naturaleza en {1}, primero los más cercanos al centro del mapa.', list.length, monthName(m - 1))));
  const rows = h('div', { class: 'guide-list' });
  for (const s of list) {
    const km = Math.round(geoDistance(s.at, from) * 6371);
    rows.append(row(s.e, tt(s.n), [tt(s.place), `${fmtCompact(km)} km`, s.peak === m ? L('at its best', 'en su mejor momento') : ''].filter(Boolean).join(' · '), () => {
      SHELL?.sheet.close(); APP?.flyTo(s.at[0], s.at[1], 8); spectacleCard(cardFn, s, greenLinks, (sci) => data?.bySci.get(sci.toLowerCase()) ?? null);
    }, { 'data-spectacle': s.id }));
  }
  body.append(rows);
  SHELL?.openPanel('green-whats-on', `📅 ${L('What’s on in {0}', 'Qué hay en {0}', monthName(m - 1))}`, body);
}

export const naturesCalendar: LayerDef = {
  id: 'calendar', category: 'flora', icon: '📅', kind: 'overlay', stackOrder: 5,
  name: { en: 'Nature’s calendar', es: 'Calendario de la naturaleza' },
  desc: { en: 'About 150 of nature’s spectacles and when to see them: cherry blossom, deserts in flower, autumn forests, the great herds and the firefly nights. Pick a month.', es: 'Unos 150 espectáculos de la naturaleza y cuándo verlos: cerezos en flor, desiertos floridos, bosques de otoño, las grandes manadas y las noches de luciérnagas. Elige un mes.' },
  keywords: 'calendar season bloom blossom flowers autumn fall colours spectacle month when festival calendario temporada floracion flores otoño colores espectaculo mes cuando',
  credit: 'Compiled from park services, tourism boards and scientific papers (sources on each card)',
  options: [{ id: 'month', label: { en: 'Month', es: 'Mes' }, type: 'select', default: 'now', choices: [
    { value: 'now', label: { en: 'This month', es: 'Este mes' }, icon: '📍' },
    ...MONTHS_EN.map((en, i) => ({ value: String(i + 1), label: { en, es: MONTHS_ES[i].charAt(0).toUpperCase() + MONTHS_ES[i].slice(1) } })),
  ] }],
  async load() { calendar ??= await loadCalendar(); if (!calendar) throw new Error('no data'); data ??= await loadGreen(); },
  onOptionsChanged() { LC.requestRender(); LC.notify?.(); },
  drawOverlay(rc, inst) {
    if (!calendar) return;
    const m = calMonthOf(inst);
    const crowd = crowdOf<Spectacle>(inst, 10);
    const placed = crowd.place(rc, () => calendar!.filter((s) => s.months.includes(m)), (s) => s.at, (s) => (s.peak === m ? 12 : 10), (s) => (s.peak === m ? 10 : 0), String(m));
    crowd.leaders(rc, (s) => KIND_COLOR[s.kind]);
    const { ctx } = rc;
    for (const p of placed) {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = rc.theme.dark ? 'rgba(10,20,40,0.72)' : 'rgba(255,255,255,0.85)'; ctx.fill();
      ctx.lineWidth = p.it.peak === m ? 3 : 2; ctx.strokeStyle = KIND_COLOR[p.it.kind]; ctx.stroke();
      const g = glyph(p.it.e, p.r * 1.25, rc.dpr), gs = g.width / rc.dpr;
      ctx.drawImage(g, p.x - gs / 2, p.y - gs / 2, gs, gs);
    }
  },
  labels(rc, inst) {
    if (rc.webZoom < 2.4) return;
    const crowd = crowdOf<Spectacle>(inst, 10);
    for (const p of crowd.placed) crowd.name(rc, p, { text: tt(p.it.n), priority: 400, size: 10.5, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
  },
  legend(inst) {
    const m = calMonthOf(inst);
    const on = (calendar ?? []).filter((s) => s.months.includes(m));
    const step = (by: number) => APP?.setOption('calendar', 'month', String(((m - 1 + by + 12) % 12) + 1));
    return {
      kind: 'categories', title: L('Nature’s calendar · {0}', 'Calendario de la naturaleza · {0}', monthName(m - 1)),
      items: (['bloom', 'autumn', 'green', 'animal'] as const).map((k) => ({ color: KIND_COLOR[k], icon: spectacleKind(k).icon, shape: 'dot' as const, label: `${tx(spectacleKind(k))} (${on.filter((s) => s.kind === k).length})` })),
      note: L('A thick ring: at its best this month. Tap one for when and how to see it.', 'Anillo grueso: en su mejor momento este mes. Toca uno para ver cuándo y cómo verlo.'),
      actions: [
        { label: '◀', onClick: () => step(-1) },
        { label: '▶', onClick: () => step(1) },
        { label: L('What’s on this month', 'Qué hay este mes'), icon: '📅', onClick: () => void whatsOnPanel(m), primary: true },
      ],
    };
  },
  tap(_lon, _lat, inst, ui) {
    const hit = crowdOf<Spectacle>(inst, 10).pick(ui);
    if (!hit) return false;
    spectacleCard(ui.card, hit, greenLinks, (sci) => data?.bySci.get(sci.toLowerCase()) ?? null);
    return true;
  },
  searchHint: { en: 'spectacles', es: 'espectáculos' },
  async searchLoad() { calendar ??= await loadCalendar(); data ??= await loadGreen(); },
  search(match) {
    return (calendar ?? []).map((s) => {
      const sc = Math.max(match(s.n.en), match(s.n.es), match(s.place.en) - 8, match(s.place.es) - 8);
      return { label: tt(s.n), sub: `${s.e} ${monthsText(s)}`, icon: s.e, lon: s.at[0], lat: s.at[1], score: sc, wz: 7, dot: s,
        prepare: (i: LayerInstance) => { if (!s.months.includes(calMonthOf(i))) APP?.setOption('calendar', 'month', String(s.peak)); },
        open: (ui: LayerTapUi) => spectacleCard(ui.card, s, greenLinks, (sci) => data?.bySci.get(sci.toLowerCase()) ?? null) };
    }).filter((x) => x.score >= 50).sort((a, b) => b.score - a.score).slice(0, 6);
  },
};

/** Nature's spectacles near a place in a month (the travel guide's Facts tab): the nearest first, within `km`. */
export async function spectaclesNear(at: [number, number], km = 600, month = thisMonth()): Promise<{ s: Spectacle; km: number; now: boolean }[]> {
  calendar ??= await loadCalendar();
  return (calendar ?? []).map((s) => ({ s, km: geoDistance(s.at, at) * 6371, now: s.months.includes(month) })).filter((x) => x.km <= km)
    .sort((a, b) => Number(b.now) - Number(a.now) || a.km - b.km);
}
export const openSpectacle = (s: Spectacle) => spectacleCard(cardFn, s, greenLinks, (sci) => data?.bySci.get(sci.toLowerCase()) ?? null);

// ---- Where our food first grew --------------------------------------------------------------------------------
let cropFocus: Crop | null = null;
async function openCrop(id: string) {
  crops ??= await loadCrops();
  const c = crops?.find((x) => x.id === id);
  if (!c || !APP) return;
  if (!APP.isActive('crops')) await APP.activate('crops');
  cropFocus = c;
  APP.flyTo(c.origin.at[0], c.origin.at[1], 3);
  LC.requestRender(); LC.notify?.();
  cropCard(cardFn, c, greenLinks, () => showCrop(c));
}
function showCrop(c: Crop) {
  SHELL?.card.hide();
  cropFocus = c;
  // Far enough out to see its whole journey.
  let far = 0;
  for (const s of c.spread) far = Math.max(far, geoDistance(c.origin.at, s.to));
  APP?.flyTo(c.origin.at[0], c.origin.at[1], Math.max(1, Math.min(4, 2.2 / Math.max(0.3, far))));
  LC.requestRender(); LC.notify?.();
}

/** An arrow along the great circle from a to b. */
function arrow(rc: RenderCtx, a: [number, number], b: [number, number], color: string, width: number) {
  const { ctx, path } = rc;
  ctx.beginPath(); path({ type: 'LineString', coordinates: [a, b] });
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  const tip = rc.project(b[0], b[1]), back = rc.project(...(geoInterpolate(a, b)(0.94) as [number, number]));
  if (!tip || !back) return;
  const ang = Math.atan2(tip[1] - back[1], tip[0] - back[0]), s = 5 + width * 1.6;
  ctx.beginPath(); ctx.moveTo(tip[0], tip[1]);
  ctx.lineTo(tip[0] - s * Math.cos(ang - 0.45), tip[1] - s * Math.sin(ang - 0.45));
  ctx.lineTo(tip[0] - s * Math.cos(ang + 0.45), tip[1] - s * Math.sin(ang + 0.45));
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}

export const firstCrops: LayerDef = {
  id: 'crops', category: 'flora', icon: '🌾', kind: 'overlay', stackOrder: 5,
  name: { en: 'Where our food first grew', es: 'Dónde se cultivaron nuestros alimentos' },
  desc: { en: 'About 60 crops where people first grew them, and how they spread: wheat in the Fertile Crescent, maize in Mexico, potatoes in the Andes, rice on the Yangtze, coffee in Ethiopia.', es: 'Unos 60 cultivos donde se cultivaron por primera vez y cómo se extendieron: el trigo en el Creciente Fértil, el maíz en México, la papa en los Andes, el arroz en el Yangtsé, el café en Etiopía.' },
  keywords: 'crops domestication origin farming agriculture wheat maize rice potato food cultivos domesticacion origen agricultura trigo maiz arroz papa comida',
  credit: 'Compiled from archaeobotany papers and FAO (sources on each card)',
  options: [{ id: 'arrows', label: { en: 'Journeys', es: 'Viajes' }, type: 'toggle', default: false }],
  async load() { crops ??= await loadCrops(); if (!crops) throw new Error('no data'); data ??= await loadGreen(); },
  onOptionsChanged() { LC.requestRender(); },
  onDeactivate() { cropFocus = null; },
  drawOverlay(rc, inst) {
    if (!crops) return;
    const { ctx } = rc;
    const dark = rc.theme.dark;
    // The journeys: every crop's faintly (when asked), the chosen crop's boldly.
    if (inst.options.arrows) for (const c of crops) if (c !== cropFocus) for (const s of c.spread) arrow(rc, s.from, s.to, dark ? 'rgba(255,212,59,0.28)' : 'rgba(230,119,0,0.3)', 1.2);
    if (cropFocus) {
      for (const s of cropFocus.spread) arrow(rc, s.from, s.to, dark ? '#ffd43b' : '#e67700', 2.6);
      // Its homeland: a circle of its radius.
      const r = cropFocus.origin.km / 6371 * rc.view.pxPerRadian, p = rc.project(cropFocus.origin.at[0], cropFocus.origin.at[1]);
      if (p) { ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(14, r), 0, Math.PI * 2); ctx.fillStyle = dark ? 'rgba(255,212,59,0.18)' : 'rgba(230,119,0,0.16)'; ctx.fill(); ctx.setLineDash([5, 4]); ctx.strokeStyle = dark ? '#ffd43b' : '#e67700'; ctx.lineWidth = 1.6; ctx.stroke(); ctx.setLineDash([]); }
    }
    const crowd = crowdOf<Crop>(inst, 10);
    const placed = crowd.place(rc, () => crops!, (c) => c.origin.at, (c) => (c === cropFocus ? 14 : 11), (c) => (c === cropFocus ? 100 : 0) - c.date / 1000);
    crowd.leaders(rc, () => (dark ? '#ffd43b' : '#e67700'));
    for (const p of placed) {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = dark ? 'rgba(10,20,40,0.75)' : 'rgba(255,250,235,0.92)'; ctx.fill();
      ctx.lineWidth = p.it === cropFocus ? 3 : 1.6; ctx.strokeStyle = dark ? '#ffd43b' : '#e67700'; ctx.stroke();
      const g = glyph(p.it.e, p.r * 1.3, rc.dpr), gs = g.width / rc.dpr;
      ctx.drawImage(g, p.x - gs / 2, p.y - gs / 2, gs, gs);
    }
  },
  labels(rc, inst) {
    const crowd = crowdOf<Crop>(inst, 10);
    for (const p of crowd.placed) if (rc.webZoom >= 2.2 || p.it === cropFocus) crowd.name(rc, p, { text: tt(p.it.n), sub: yearText(p.it.date), priority: p.it === cropFocus ? 900 : 400, size: 10.5, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
    if (cropFocus) for (const s of cropFocus.spread) {
      const at = rc.project(s.to[0], s.to[1]);
      if (at) rc.labels.add({ text: tt(s.label), sub: yearText(s.date), x: at[0], y: at[1] + 12, priority: 700, size: 10, weight: 600, color: rc.theme.label, halo: rc.theme.labelHalo });
    }
  },
  legend() {
    const list = crops ?? [];
    if (cropFocus) return {
      kind: 'categories', title: `${cropFocus.e} ${tt(cropFocus.n)}: ${L('its journey', 'su viaje')}`,
      items: [{ color: '#e67700', label: L('First grown about {0}', 'Primer cultivo hacia {0}', yearText(cropFocus.date)), shape: 'dot' }, ...cropFocus.spread.map((s) => ({ color: '#ffd43b', label: `${tt(s.label)} · ${yearText(s.date)}`, shape: 'line' as const }))],
      actions: [{ label: L('All crops', 'Todos los cultivos'), icon: '🌾', onClick: () => { cropFocus = null; LC.requestRender(); LC.notify?.(); }, primary: true }, { label: L('Its card', 'Su ficha'), icon: cropFocus.e, onClick: () => void openCrop(cropFocus!.id) }],
    };
    const old = list.filter((c) => c.date <= -5000).length;
    return {
      kind: 'categories', title: L('{0} crops where they were first grown', '{0} cultivos donde se cultivaron por primera vez', list.length),
      items: [{ color: '#e67700', label: L('{0} of them more than 7,000 years ago', '{0} de ellos hace más de 7000 años', old), shape: 'dot' }],
      note: L('Tap a crop for when and where it was first grown, and its journey around the world. Turn on Journeys to see them all.', 'Toca un cultivo para ver cuándo y dónde se cultivó por primera vez, y su viaje por el mundo. Activa Viajes para verlos todos.'),
    };
  },
  tap(_lon, _lat, inst, ui) {
    const hit = crowdOf<Crop>(inst, 10).pick(ui);
    if (!hit) return false;
    cropFocus = hit; LC.requestRender(); LC.notify?.();
    cropCard(ui.card, hit, greenLinks, () => showCrop(hit));
    return true;
  },
  searchHint: { en: 'crops', es: 'cultivos' },
  async searchLoad() { crops ??= await loadCrops(); data ??= await loadGreen(); },
  search(match) {
    return (crops ?? []).map((c) => ({ label: tt(c.n), sub: `${c.sci} · ${L('first grown', 'primer cultivo')} ${yearText(c.date)}`, icon: c.e, lon: c.origin.at[0], lat: c.origin.at[1], score: Math.max(match(c.n.en), match(c.n.es), match(c.sci) - 6), wz: 4, dot: c,
      prepare: () => { cropFocus = c; }, open: (ui: LayerTapUi) => cropCard(ui.card, c, greenLinks, () => showCrop(c)) })).filter((x) => x.score >= 50).sort((a, b) => b.score - a.score).slice(0, 5);
  },
};

// ---- For the quizzes, the finder and the guide ----------------------------------------------------------------
/** A plant's range on any map (the quizzes). */
export function drawPlantRange(rc: RenderCtx, p: Plant) { drawRange(rc, p, 'plant'); }
/** How far a point is from where a plant grows, in km: 0 inside one of its squares. */
export const plantRangeKm = (p: Plant, at: [number, number]) => distanceKm(p.cells, at);
/** The plants that grow in a place (our 300, offline): the best known first. */
export async function plantsAt(lon: number, lat: number): Promise<Plant[]> {
  data ??= await loadGreen();
  return data?.byCell.get(cellAt(lon, lat)) ?? [];
}
export const greenData = () => data;
export const openPlantCard = (p: Plant) => plantCard(cardFn, p, greenLinks);
export const openGardenCard = (g: Garden) => gardenCard(cardFn, g, data, greenLinks);
export { whatsOnPanel, openCrop };

export default function register(app: App, shell: Shell) {
  APP = app; SHELL = shell;
  app.register([plantsOfTheWorld, botanicalGardens, famousTrees, ecoregions, breathingPlanet, naturesCalendar, firstCrops]);
}
