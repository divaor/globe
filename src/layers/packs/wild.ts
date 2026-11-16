// Wild world (v0.30.0): Animals of the world, Wildlife parks, and Zoos and aquariums (public/data/wild).
//
// Animals of the world is a carpet of about 400 animals (../carpet.ts), each drawn where it lives (GBIF's sightings
// shared under open licences, in squares of 1.40625°). An animal's card can "show where it lives": its squares,
// darker where more people saw it, with the carpet showing only it, and its best parks as numbered stars.
import { geoDistance } from 'd3-geo';
import { lang, fmtCompact } from '../../app/i18n';
import { h } from '../../ui/dom';
import { LC } from '../context';
import type { App } from '../../app/app';
import type { Shell } from '../../ui/shell';
import type { LayerDef, LayerHit, LayerInstance, LayerTapUi, Legend, RenderCtx } from '../types';
import { crowdOf } from '../crowd';
import { Carpet, drawRange, glyph, pickDrawn, rangeView, distanceKm, type Drawn } from '../carpet';
import {
  cellAt, cellCenter, loadWild, loadParks, loadZoos, livesIn, relatives, nm, groupName, statusName, threatened,
  GROUPS, STATUS, type Animal, type Park, type Zoo, type WildData, type Group,
} from '../../wild/data';
import { animalCard, parkCard, zooCard, statusBadge, placeIcon, type WildLinks, type CardFn } from '../../wild/cards';

const es = () => lang() === 'es';
const L = (en: string, sp: string) => (es() ? sp : en);
let APP: App | null = null;
let SHELL: Shell | null = null;
let data: WildData | null = null;
let parks: Park[] | null = null;
let zoos: Zoo[] | null = null;

// ---- What the carpet shows --------------------------------------------------------------------------------------
/** Something whose range is shown on its own: one of our animals, or any species the finder looked up live. */
export interface Focus { id: string; name: string; e: string; cells: Int32Array; counts: Uint8Array; animal?: Animal; best?: Park[]; note?: string }
let focus: Focus | null = null;

const showOf = (inst: LayerInstance) => String(inst.options.show ?? 'all') as 'all' | Group;
const statusOf = (inst: LayerInstance) => String(inst.options.status ?? 'all') as 'all' | 'endangered' | 'gone';
/** A view's own animals (an ambient playlist's: the Serengeti's), by scientific name, comma-separated. */
const pickOf = (inst: LayerInstance) => String(inst.options.pick ?? '');
function okFor(inst: LayerInstance): (a: Animal) => boolean {
  const show = showOf(inst), status = statusOf(inst), pick = pickOf(inst);
  if (focus?.animal) { const f = focus.animal; return (a) => a === f; }
  if (pick) { const only = new Set(pick.split(',')); return (a) => only.has(a.sci); }
  return (a) => (status === 'gone' ? !!a.gone : !a.gone && (status === 'all' || threatened(a.st))) && (show === 'all' || a.g === show || a.g2 === show);
}
const keyOf = (inst: LayerInstance) => (focus ? `focus:${focus.id}` : `${showOf(inst)}|${statusOf(inst)}|${pickOf(inst)}`);

/**
 * How much an animal stands for a place: its fame, a little less for birds and small creatures (seen almost
 * everywhere), and more for animals of a small range than for those found on every continent.
 */
const GROUP_WEIGHT: Record<Group, number> = { mammals: 1, reptiles: 0.9, sea: 0.85, birds: 0.6, small: 0.6 };
const weightOf = (a: Animal) => a.sl * GROUP_WEIGHT[a.g] * Math.max(0.3, Math.min(1.6, Math.sqrt(400 / Math.max(1, a.cells.length))));
const carpet = new Carpet<Animal>(weightOf);

interface Star { p: Park; n: number; x: number; y: number }

function drawCarpet(rc: RenderCtx, inst: LayerInstance) {
  if (!data) return;
  const status = statusOf(inst), dark = rc.theme.dark;
  inst.state.drawn = carpet.draw(rc, data.byCell, okFor(inst), keyOf(inst), (a) => {
    const st = a.st;
    const fill = a.gone ? (dark ? 'rgba(40,40,46,0.8)' : 'rgba(225,222,215,0.85)') : dark ? 'rgba(10,20,40,0.5)' : 'rgba(255,255,255,0.66)';
    if ((status === 'endangered' || focus) && st && STATUS[st] && threatened(st)) return { fill, ring: STATUS[st].color, ringWidth: 2.4 };
    if (a.gone) return { fill, ring: dark ? '#adb5bd' : '#495057', ringWidth: 1.6, alpha: 0.8 };
    return { fill };
  });
}

function drawStars(rc: RenderCtx, inst: LayerInstance) {
  const stars: Star[] = [];
  if (focus?.best?.length) {
    const { ctx } = rc;
    focus.best.forEach((p, i) => {
      const xy = rc.project(p.at[0], p.at[1]);
      if (!xy) return;
      ctx.beginPath(); ctx.arc(xy[0], xy[1], 11, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd43b'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke();
      ctx.fillStyle = '#1c222e'; ctx.font = '800 12px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), xy[0], xy[1] + 0.5);
      rc.labels.reserve(xy[0] - 11, xy[1] - 11, xy[0] + 11, xy[1] + 11);
      stars.push({ p, n: i + 1, x: xy[0], y: xy[1] });
    });
  }
  inst.state.stars = stars;
}

// ---- Links for the cards --------------------------------------------------------------------------------------
const cardFn: CardFn = (...a) => { APP?.select(null); SHELL?.card.showCustom(...a); };

/** Shows where an animal (or a species the finder looked up) lives: its squares, the carpet showing only it, its best parks. */
export async function showFocus(f: Focus | null, fly = true) {
  if (!APP) return;
  focus = f;
  carpet.clear();
  if (f && !APP.isActive('wild')) await APP.activate('wild');
  if (f?.animal && !f.best) { parks ??= await loadParks(); f.best = (f.animal.best ?? []).map((id) => parks?.find((p) => p.id === id)).filter((p): p is Park => !!p).slice(0, 6); }
  // Fly to the middle of its squares, weighted by sightings, close enough to see them all (but not too far out).
  const v = f && fly ? rangeView(f) : null;
  if (v) APP.flyTo(v.lon, v.lat, v.zoom);
  APP.renderer.requestRender();
  LC.notify?.();
  APP.emit('layers');
}
export const currentFocus = () => focus;
/** Shows one animal's range by its id (a tour's stop), or every animal again (null); the map does not fly. */
export async function focusAnimal(id: string | null) {
  data ??= await loadWild();
  const a = id ? data?.byId.get(id) : null;
  await showFocus(a ? { id: a.id, name: nm(a), e: a.e, cells: a.cells, counts: a.counts, animal: a } : null, false);
}

export const links: WildLinks = {
  showRange: (a) => { SHELL?.card.hide(); void showFocus({ id: a.id, name: nm(a), e: a.e, cells: a.cells, counts: a.counts, animal: a }); },
  bestPlaces: (a) => void bestPlaces(a),
  relatives: (a) => void relativesPanel(a),
  openAnimal: (a) => { SHELL?.sheet.close(); animalCard(cardFn, a, links); },
  openStory: (step) => { SHELL?.card.hide(); APP?.emit('open-story', 'life', 'lost-and-saved', step - 1); },
  countryName: (id) => APP?.data.name(id, APP.lang) ?? id,
  planTrip: (at, label) => void planTrip(at, label),
  toast: (msg) => SHELL?.toast(msg, 4000),
};

/** Adds the travel-guide city nearest a park or zoo to the trip. */
async function planTrip(at: [number, number], label: string) {
  const g = window.atlas?.guide;
  const cities = g ? await g.load() : null;
  if (!g || !cities?.length) return;
  let best = cities[0], bd = Infinity;
  for (const c of cities) { const d = geoDistance(c.at, at); if (d < bd) { bd = d; best = c; } }
  const km = Math.round(bd * 6371);
  g.add(best.id);
  SHELL?.toast(L(`${g.cityName(best)} (${fmtCompact(km)} km from ${label}) is in your trip. More → Travel guide.`, `${g.cityName(best)} (a ${fmtCompact(km)} km de ${label}) está en tu viaje. Más → Guía de viaje.`), 5000);
}

function row(ic: string, title: string, sub: string, onClick: () => void, attrs: Record<string, string> = {}, badge?: HTMLElement | null): HTMLElement {
  const r = h('button', { type: 'button', class: 'guide-item', ...attrs }, h('span', { class: 'guide-item-ic' }, ic),
    h('span', { class: 'guide-item-text' }, h('span', { class: 'guide-item-title' }, title), sub ? h('span', { class: 'guide-item-sub' }, sub) : null), badge ?? null);
  r.addEventListener('click', onClick);
  return r;
}

async function bestPlaces(a: Animal) {
  parks ??= await loadParks();
  const f: Focus = { id: a.id, name: nm(a), e: a.e, cells: a.cells, counts: a.counts, animal: a };
  await showFocus(f);
  SHELL?.card.hide();
  const body = h('div', { class: 'guide wild-panel', 'data-wild': 'best', 'data-animal': a.id });
  body.append(h('p', { class: 'muted small' }, L(`National parks and reserves where ${nm(a)} lives, those where people have shared the most sightings first. The numbers match the stars on the map.`, `Parques nacionales y reservas donde vive ${nm(a).toLowerCase()}, primero aquellos donde más avistamientos se han compartido. Los números coinciden con las estrellas del mapa.`)));
  const list = h('div', { class: 'guide-list' });
  (f.best ?? []).forEach((p, i) => {
    const others = p.f.filter((id) => id !== a.id).map((id) => data?.byId.get(id)).filter((x): x is Animal => !!x).slice(0, 3);
    list.append(row(`${i + 1}`, nm(p), [p.cc ? links.countryName(p.cc) : '', others.length ? `${L('also', 'también')} ${others.map((x) => x.e).join(' ')}` : ''].filter(Boolean).join(' · '),
      () => { SHELL?.sheet.close(); APP?.flyTo(p.at[0], p.at[1], 40); parkCard(cardFn, p, data, links); }, { 'data-park': p.id }));
  });
  if (!f.best?.length) list.append(h('p', { class: 'muted small' }, L('No park of ours lies in its range.', 'Ningún parque de los nuestros está en su área.')));
  body.append(list);
  SHELL?.openPanel('wild-best', `${a.e} ${L('Best places to see it', 'Mejores lugares para verlo')}`, body);
}

async function relativesPanel(a: Animal) {
  if (!data) return;
  SHELL?.card.hide();
  const rel = relatives(data, a);
  const body = h('div', { class: 'guide wild-panel', 'data-wild': 'relatives', 'data-animal': a.id });
  body.append(h('p', { class: 'muted small' }, a.fam && rel.some((b) => b.fam === a.fam) ? L(`${nm(a)} and its family, ${a.fam}, among our animals.`, `${nm(a)} y su familia, ${a.fam}, entre nuestros animales.`) : L(`Its closest relatives among our animals (order ${a.ord}).`, `Sus parientes más cercanos entre nuestros animales (orden ${a.ord}).`)));
  const list = h('div', { class: 'guide-list' });
  for (const b of rel.slice(0, 30)) list.append(row(b.e, nm(b), b.sci, () => links.openAnimal(b), { 'data-animal': b.id }, statusBadge(b)));
  if (!rel.length) list.append(h('p', { class: 'muted small' }, L('None of its relatives is among our animals.', 'Ninguno de sus parientes está entre nuestros animales.')));
  body.append(list);
  SHELL?.openPanel('wild-relatives', `${a.e} ${L('Its relatives', 'Sus parientes')}`, body);
}

// ---- Animals of the world ---------------------------------------------------------------------------------------
export const animalsOfTheWorld: LayerDef = {
  id: 'wild', category: 'fauna', icon: '🐾', kind: 'overlay', stackOrder: 4, featured: false,
  name: { en: 'Animals of the world', es: 'Animales del mundo' },
  desc: { en: 'About 400 animals, each where it lives in the wild, from millions of sightings. Zoom in for more; tap one for its card, where it lives and the best places to see it.', es: 'Unos 400 animales, cada uno donde vive en libertad, a partir de millones de avistamientos. Acerca el mapa para ver más; toca uno para ver su ficha, dónde vive y los mejores lugares para verlo.' },
  keywords: 'animals wildlife fauna species where live range endangered extinct gone mammals birds reptiles fish insects animales fauna especies donde viven amenazados extintos mamiferos aves reptiles peces insectos',
  credit: 'GBIF.org (CC0 and CC BY records), Wikidata (CC0)',
  options: [
    { id: 'show', label: { en: 'Show', es: 'Mostrar' }, type: 'select', default: 'all', choices: [{ value: 'all', label: { en: 'All animals', es: 'Todos los animales' }, icon: '🐾' }, ...(Object.keys(GROUPS) as Group[]).map((g) => ({ value: g, label: GROUPS[g].name, icon: GROUPS[g].icon }))] },
    { id: 'status', label: { en: 'Status', es: 'Estado' }, type: 'select', default: 'all', choices: [
      { value: 'all', label: { en: 'All', es: 'Todos' } },
      { value: 'endangered', label: { en: 'Endangered (vulnerable, endangered, critically)', es: 'Amenazados (vulnerables, en peligro, en peligro crítico)' }, icon: '⚠️' },
      { value: 'gone', label: { en: 'Gone (lost in the last 500 years)', es: 'Desaparecidos (en los últimos 500 años)' }, icon: '🕯️' },
    ] },
  ],
  async load() { data ??= await loadWild(); if (!data) throw new Error('no data'); void loadParks().then((p) => { parks = p; }); },
  onOptionsChanged() { focus = null; carpet.clear(); LC.requestRender(); },
  onDeactivate() { focus = null; carpet.clear(); },
  drawOverlay(rc, inst) {
    if (!data) return;
    if (focus) drawRange(rc, focus);
    drawCarpet(rc, inst);
    drawStars(rc, inst);
  },
  labels(rc, inst) {
    const drawn = (inst.state.drawn as Drawn<Animal>[] | undefined) ?? [];
    if (rc.webZoom >= 3.2 || focus) for (const d of drawn) rc.labels.add({ text: nm(d.a), x: d.x, y: d.y + d.r + 7, priority: 260 + Math.min(300, d.a.sl), size: 10.5, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
    for (const s of (inst.state.stars as Star[] | undefined) ?? []) rc.labels.add({ text: nm(s.p), x: s.x, y: s.y + 18, priority: 700 - s.n, size: 10.5, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
  },
  legend(inst): Legend | null {
    if (!data) return null;
    if (focus) {
      return {
        kind: 'categories', title: L(`${focus.name}: where it lives`, `${focus.name}: dónde vive`),
        items: [
          { color: 'rgb(240,110,20)', label: L('Many sightings', 'Muchos avistamientos'), shape: 'square' },
          { color: 'rgba(255,190,60,0.55)', label: L('A few sightings', 'Pocos avistamientos'), shape: 'square' },
          ...(focus.best?.length ? [{ color: '#ffd43b', label: L('Best places to see it', 'Mejores lugares para verlo'), shape: 'dot' as const }] : []),
        ],
        note: focus.note ?? (focus.animal?.gone ? L(`Where it lived until ${focus.animal.gone}, after historical records.`, `Dónde vivía hasta ${focus.animal.gone}, según los registros históricos.`)
          : L('Squares of about 150 km where people have shared sightings since 1970 (GBIF, open-licence records; no zoo animals). Darker: more sightings, which also means more people looking.', 'Cuadros de unos 150 km donde se han compartido avistamientos desde 1970 (GBIF, registros con licencia abierta; sin animales de zoológico). Más oscuro: más avistamientos, lo que también significa más gente observando.')),
        actions: [
          { label: L('All animals', 'Todos los animales'), icon: '🐾', onClick: () => void showFocus(null, false), primary: true },
          ...(focus.animal ? [{ label: L('Its card', 'Su ficha'), icon: focus.e, onClick: () => links.openAnimal(focus!.animal!) }] : []),
        ],
      };
    }
    const ok = okFor(inst);
    const shown = data.animals.filter(ok);
    if (statusOf(inst) === 'gone') {
      return {
        kind: 'categories', title: L(`${shown.length} animals gone since 1500`, `${shown.length} animales desaparecidos desde 1500`),
        items: shown.slice().sort((a, b) => (a.gone ?? 0) - (b.gone ?? 0)).map((a) => ({ color: 'transparent', icon: a.e, shape: 'emoji' as const, label: `${nm(a)} · ${a.gone}` })),
        note: L('Each where it lived, after historical records. Tap one for its story.', 'Cada uno donde vivía, según los registros históricos. Toca uno para ver su historia.'),
      };
    }
    if (statusOf(inst) === 'endangered') {
      return {
        kind: 'categories', title: L(`${shown.length} threatened animals`, `${shown.length} animales amenazados`),
        items: (['CR', 'EN', 'VU'] as const).map((s) => ({ color: STATUS[s].color, label: `${statusName(s)} (${shown.filter((a) => a.st === s).length})`, shape: 'dot' as const })),
        note: L('The ring shows its IUCN Red List category.', 'El anillo muestra su categoría en la Lista Roja de la UICN.'),
      };
    }
    const n = new Map<Group, number>();
    for (const a of shown) n.set(a.g, (n.get(a.g) ?? 0) + 1);
    return {
      kind: 'categories', title: L(`${shown.length} animals where they live`, `${shown.length} animales donde viven`),
      items: (Object.keys(GROUPS) as Group[]).filter((g) => n.get(g)).map((g) => ({ color: GROUPS[g].color, icon: GROUPS[g].icon, shape: 'emoji' as const, label: `${groupName(g)} (${n.get(g)})` })),
      note: L('Each animal where people have seen it in the wild. Zoomed out, the best known of each area; zoom in for more. From GBIF sightings shared under open licences.', 'Cada animal donde se ha visto en libertad. De lejos, el más conocido de cada zona; acerca el mapa para ver más. A partir de avistamientos de GBIF compartidos con licencias abiertas.'),
    };
  },
  tap(_lon, _lat, inst, ui: LayerTapUi) {
    for (const s of (inst.state.stars as Star[] | undefined) ?? []) if (Math.hypot(s.x - ui.x, s.y - ui.y) < 14) { parkCard(ui.card, s.p, data, links); return true; }
    const best = pickDrawn(inst.state.drawn as Drawn<Animal>[] | undefined, ui.x, ui.y);
    if (!best) return false;
    animalCard(ui.card, best.a, links);
    return true;
  },
  // The search box finds the animals by their names in English, Spanish or Latin, and shows where each lives.
  searchHint: { en: 'animals', es: 'animales' },
  async searchLoad() { data ??= await loadWild(); },
  search(match) {
    if (!data) return [];
    const out: LayerHit[] = [];
    for (const a of data.animals) {
      const s = Math.max(match(a.n[0]), match(a.n[1]), match(a.sci) - 6);
      if (s <= 0) continue;
      const top = a.cells[a.counts.indexOf(Math.max(...a.counts))] ?? a.cells[0];
      const [lon, lat] = top != null ? cellCenter(top) : [0, 0];
      out.push({
        label: nm(a), sub: `${a.sci} · ${a.gone ? L(`gone, ${a.gone}`, `desaparecido, ${a.gone}`) : groupName(a.g)}`, icon: a.e, lon, lat,
        score: s + Math.min(10, a.sl / 25), wz: 3,
        prepare: (i) => {
          if (i.options.status === 'gone' && !a.gone) APP?.setOption('wild', 'status', 'all');
          if (a.gone && i.options.status !== 'gone') APP?.setOption('wild', 'status', 'gone');
          void showFocus({ id: a.id, name: nm(a), e: a.e, cells: a.cells, counts: a.counts, animal: a }, false);
        },
        open: (ui) => animalCard(ui.card, a, links),
      });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 8);
  },
};

// ---- Wildlife parks, and zoos and aquariums ---------------------------------------------------------------------
const least = (z: number) => (z < 2 ? 40 : z < 3 ? 25 : z < 4 ? 14 : z < 5 ? 8 : z < 6 ? 4 : 0);

function placeLayer<T extends Park | Zoo>(o: {
  id: string; icon: string; name: { en: string; es: string }; desc: { en: string; es: string }; keywords: string; hint: { en: string; es: string };
  load: () => Promise<T[] | null>; get: () => T[] | null; kinds: [T['k'], { en: string; es: string }][]; color: Record<string, string>; note: { en: string; es: string };
  open: (card: CardFn, p: T) => void;
}): LayerDef {
  return {
    id: o.id, category: 'fauna', icon: o.icon, kind: 'overlay', stackOrder: 5, name: o.name, desc: o.desc, keywords: o.keywords, credit: 'Wikidata (CC0)',
    options: [{ id: 'kind', label: { en: 'Show', es: 'Mostrar' }, type: 'select', default: 'all', choices: [{ value: 'all', label: { en: 'All', es: 'Todos' } }, ...o.kinds.map(([value, label]) => ({ value, label, icon: placeIcon(value) }))] }],
    async load() { const d = await o.load(); if (!d) throw new Error('no data'); data ??= await loadWild(); },
    onOptionsChanged() { LC.requestRender(); },
    drawOverlay(rc, inst) {
      const list = o.get();
      if (!list) return;
      const kind = String(inst.options.kind ?? 'all'), min = least(rc.webZoom);
      const crowd = crowdOf<T>(inst, 8);
      const placed = crowd.place(rc, () => list.filter((p) => p.sl >= min && (kind === 'all' || p.k === kind)), (p) => p.at, () => 9, (p) => p.sl, `${kind}`);
      crowd.leaders(rc, (p) => o.color[p.k]);
      const { ctx } = rc;
      for (const p of placed) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = o.color[p.it.k]; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
        const g = glyph(placeIcon(p.it.k), 12, rc.dpr), gs = g.width / rc.dpr;
        ctx.drawImage(g, p.x - gs / 2, p.y - gs / 2, gs, gs);
      }
    },
    labels(rc, inst) {
      if (rc.webZoom < 2.6) return;
      const crowd = crowdOf<T>(inst, 8);
      for (const p of crowd.placed) crowd.name(rc, p, { text: nm(p.it), priority: 200 + Math.min(300, p.it.sl * 4), size: 10.5, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
    },
    legend(inst) {
      const list = o.get() ?? [];
      const kind = String(inst.options.kind ?? 'all');
      return {
        kind: 'categories', title: L(`${fmtCompact(list.filter((p) => kind === 'all' || p.k === kind).length)} places`, `${fmtCompact(list.filter((p) => kind === 'all' || p.k === kind).length)} lugares`),
        items: o.kinds.filter(([k]) => kind === 'all' || k === kind).map(([k, label]) => ({ color: o.color[k], icon: placeIcon(k), label: `${es() ? label.es : label.en} (${fmtCompact(list.filter((p) => p.k === k).length)})`, shape: 'dot' as const })),
        note: es() ? o.note.es : o.note.en,
      };
    },
    tap(_lon, _lat, inst, ui) {
      const hit = crowdOf<T>(inst, 8).pick(ui);
      if (!hit) return false;
      o.open(ui.card, hit);
      return true;
    },
    searchHint: o.hint,
    async searchLoad() { await o.load(); data ??= await loadWild(); },
    search(match) {
      const out: LayerHit[] = [];
      for (const p of o.get() ?? []) {
        const s = Math.max(match(p.n[0]), match(p.n[1]));
        if (s < 50) continue;
        out.push({ label: nm(p), sub: [placeIcon(p.k), p.cc ? links.countryName(p.cc) : ''].join(' '), icon: placeIcon(p.k), lon: p.at[0], lat: p.at[1], score: s + Math.min(8, p.sl / 4), wz: 9, dot: p,
          prepare: (i) => { if (i.options.kind !== 'all' && i.options.kind !== p.k) APP?.setOption(o.id, 'kind', 'all'); }, open: (ui) => o.open(ui.card, p) });
      }
      return out.sort((a, b) => b.score - a.score).slice(0, 6);
    },
  };
}

export const wildParks = placeLayer<Park>({
  id: 'wild-parks', icon: '🏞️', name: { en: 'Wildlife parks', es: 'Parques de vida silvestre' },
  desc: { en: 'About 2,100 national parks and nature reserves, each with the animals it is one of the best places to see.', es: 'Unos 2100 parques nacionales y reservas naturales, cada uno con los animales que mejor se pueden ver allí.' },
  keywords: 'national park nature reserve wildlife safari protected area parque nacional reserva natural vida silvestre safari area protegida',
  hint: { en: 'parks', es: 'parques' }, load: async () => (parks ??= await loadParks()), get: () => parks,
  kinds: [['np', { en: 'National parks', es: 'Parques nacionales' }], ['res', { en: 'Nature reserves', es: 'Reservas naturales' }]],
  color: { np: '#2f9e44', res: '#94d82d' },
  note: { en: 'From Wikidata. A park’s card lists the animals it is one of the best places to see, from where people share the most sightings.', es: 'De Wikidata. La ficha de cada parque enumera los animales que mejor se ven allí, según dónde se comparten más avistamientos.' },
  open: (card, p) => parkCard(card, p, data, links),
});

export const wildZoos = placeLayer<Zoo>({
  id: 'wild-zoos', icon: '🦓', name: { en: 'Zoos and aquariums', es: 'Zoológicos y acuarios' },
  desc: { en: 'About 1,300 zoos, safari parks and aquariums around the world.', es: 'Unos 1300 zoológicos, safaris y acuarios de todo el mundo.' },
  keywords: 'zoo aquarium safari park oceanarium zoologico acuario oceanario',
  hint: { en: 'zoos', es: 'zoológicos' }, load: async () => (zoos ??= await loadZoos()), get: () => zoos,
  kinds: [['zoo', { en: 'Zoos and safari parks', es: 'Zoológicos y safaris' }], ['aq', { en: 'Aquariums', es: 'Acuarios' }]],
  color: { zoo: '#f59f00', aq: '#1c7ed6' },
  note: { en: 'From Wikidata. Which animals each zoo keeps isn’t shared as open data.', es: 'De Wikidata. Qué animales tiene cada zoológico no se comparte como datos abiertos.' },
  open: (card, p) => zooCard(card, p, links),
});

/** An animal's range on any map (the quizzes): its squares, darker where more people saw it. */
export function drawAnimalRange(rc: RenderCtx, a: Animal) {
  drawRange(rc, a);
}
/** How far a point is from where an animal lives, in km: 0 inside one of its squares. */
export function rangeKm(a: Animal, at: [number, number]): number {
  return distanceKm(a.cells, at);
}

/** The animals that live in a place (our 400, offline): the best known first. */
export async function animalsAt(lon: number, lat: number): Promise<Animal[]> {
  data ??= await loadWild();
  return data?.byCell.get(cellAt(lon, lat))?.filter((a) => !a.gone) ?? [];
}
export const wildData = () => data;
export { livesIn };

export default function register(app: App, shell: Shell) {
  APP = app; SHELL = shell;
  app.register([animalsOfTheWorld, wildParks, wildZoos]);
}
