// Wild world (v0.30.0): Animals of the world, Wildlife parks, and Zoos and aquariums (public/data/wild).
//
// Animals of the world is a carpet of about 400 animals, each drawn where it lives (GBIF's sightings shared under
// open licences, in squares of 1.40625°). At each zoom the globe is cut into a fixed grid whose squares are about
// 56 px apart on the screen; each square shows its best-known animal that its neighbours don't already show, so the
// carpet stays varied and keeps still while the map is dragged. Zoomed in past the data's own squares, each square
// shows its best-known animals side by side. An animal's card can "show where it lives": its squares, darker where
// more people saw it, with the carpet showing only it, and its best parks as numbered stars.
import { geoDistance } from 'd3-geo';
import type { MultiPolygon } from 'geojson';
import { lang, fmtCompact } from '../../app/i18n';
import { h } from '../../ui/dom';
import { LC } from '../context';
import type { App } from '../../app/app';
import type { Shell } from '../../ui/shell';
import type { LayerDef, LayerHit, LayerInstance, LayerTapUi, Legend, RenderCtx } from '../types';
import { crowdOf } from '../crowd';
import {
  COLS, ROWS, DEG, cellAt, cellCenter, loadWild, loadParks, loadZoos, livesIn, relatives, nm, groupName, statusName, threatened,
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
function okFor(inst: LayerInstance): (a: Animal) => boolean {
  const show = showOf(inst), status = statusOf(inst);
  if (focus?.animal) { const f = focus.animal; return (a) => a === f; }
  return (a) => (status === 'gone' ? !!a.gone : !a.gone && (status === 'all' || threatened(a.st))) && (show === 'all' || a.g === show || a.g2 === show);
}
const keyOf = (inst: LayerInstance) => (focus ? `focus:${focus.id}` : `${showOf(inst)}|${statusOf(inst)}`);

interface Pick { a: Animal; lon: number; lat: number }
/** How far apart the carpet's animals are on the screen: wider once their names show. */
const spacingAt = (z: number) => (z >= 3.2 ? 86 : 56);
/** A small, fixed shake for a square, so the carpet doesn't look like a chessboard (0..1). */
const hash = (x: number, y: number, s = 0) => { let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

/**
 * How much an animal stands for a place: its fame, a little less for birds and small creatures (seen almost
 * everywhere), and more for animals of a small range than for those found on every continent.
 */
const GROUP_WEIGHT: Record<Group, number> = { mammals: 1, reptiles: 0.9, sea: 0.85, birds: 0.6, small: 0.6 };
const weightOf = (a: Animal) => a.sl * GROUP_WEIGHT[a.g] * Math.max(0.3, Math.min(1.6, Math.sqrt(400 / Math.max(1, a.cells.length))));

/** The carpet at grid level k (squares of 2^k data squares a side, wider towards the poles), for the whole globe. */
function levelPicks(d: WildData, k: number, ok: (a: Animal) => boolean): Pick[] {
  const size = 1 << k, out: Pick[] = [];
  let prev: { x0: number; x1: number; id: string; e: string }[] = [];
  for (let y0 = 0; y0 < ROWS; y0 += size) {
    const latC = -90 + (y0 + size / 2) * DEG;
    const stretch = 2 ** Math.round(Math.log2(1 / Math.max(Math.cos((latC * Math.PI) / 180), 0.06)));
    const w = Math.min(COLS, size * stretch);
    const row: { x0: number; x1: number; id: string; e: string }[] = [];
    let west: Animal | null = null;
    for (let x0 = 0; x0 < COLS; x0 += w) {
      const m = new Map<Animal, [number, number, number]>();
      let filled = 0;
      for (let y = y0; y < Math.min(ROWS, y0 + size); y++) for (let x = x0; x < x0 + w; x++) {
        const list = d.byCell.get(y * COLS + x);
        if (!list) continue;
        let any = false;
        for (const a of list) {
          if (!ok(a)) continue;
          any = true;
          const s = m.get(a);
          if (s) { s[0]++; s[1] += x; s[2] += y; } else m.set(a, [1, x, y]);
        }
        if (any) filled++;
      }
      if (!m.size) { west = null; continue; }
      // Its neighbours' animals, and their emoji: no two neighbours look the same.
      const near = new Set<string>();
      if (west) { near.add(west.id); near.add(west.e); }
      for (const p of prev) if (p.x1 > x0 - w && p.x0 < x0 + 2 * w) { near.add(p.id); near.add(p.e); }
      let best: Animal | null = null, bs = -1, first: Animal | null = null, fs = -1;
      for (const [a, s] of m) {
        const score = weightOf(a) * Math.sqrt(s[0] / filled);
        if (score > fs) { fs = score; first = a; }
        if (!near.has(a.id) && !near.has(a.e) && score > bs) { bs = score; best = a; }
      }
      const a = best ?? first!;
      const s = m.get(a)!;
      // Where it lives in this square (the middle of its own data squares), shaken a little.
      const jx = (hash(x0, y0, 1) - 0.5) * 0.5 * Math.min(w, 2), jy = (hash(x0, y0, 2) - 0.5) * 0.5 * Math.min(size, 2);
      out.push({ a, lon: -180 + (s[1] / s[0] + 0.5 + jx) * DEG, lat: Math.max(-89, Math.min(89, -90 + (s[2] / s[0] + 0.5 + jy) * DEG)) });
      row.push({ x0, x1: x0 + w, id: a.id, e: a.e });
      west = a;
    }
    prev = row;
  }
  return out;
}

const pickCache = new Map<string, Pick[]>();
function picksAt(d: WildData, k: number, inst: LayerInstance): Pick[] {
  const key = `${k}|${keyOf(inst)}`;
  let p = pickCache.get(key);
  if (!p) { if (pickCache.size > 24) pickCache.clear(); p = levelPicks(d, k, okFor(inst)); pickCache.set(key, p); }
  return p;
}

/** Zoomed in past the data's squares: each visible square's best-known animals, `m` × `m` of them. */
function slotPicks(d: WildData, rc: RenderCtx, m: number, inst: LayerInstance): Pick[] {
  const ok = okFor(inst), out: Pick[] = [];
  const [clon, clat] = rc.center;
  const r = (rc.view.visibleRadius() * 180) / Math.PI;
  const y0 = Math.max(0, Math.floor((clat - r + 90) / DEG)), y1 = Math.min(ROWS - 1, Math.floor((clat + r + 90) / DEG));
  for (let y = y0; y <= y1; y++) {
    const lat = -90 + (y + 0.5) * DEG;
    const span = Math.min(180, r / Math.max(0.05, Math.cos((lat * Math.PI) / 180)) + DEG);
    const x0 = Math.floor((clon - span + 180) / DEG), x1 = Math.floor((clon + span + 180) / DEG);
    for (let xx = x0; xx <= x1; xx++) {
      const x = ((xx % COLS) + COLS) % COLS;
      const list = d.byCell.get(y * COLS + x);
      if (!list) continue;
      // Twice as many of its best-standing animals as it has room for (a different emoji each as far as they go),
      // and of those a fixed mix for this square, so neighbours don't all show the same few.
      const all = list.filter(ok).sort((p, q) => weightOf(q) - weightOf(p));
      const emo = new Set<string>(), pool: Animal[] = [];
      for (const a of all) if (pool.length < 2 * m * m && !emo.has(a.e)) { emo.add(a.e); pool.push(a); }
      for (const a of all) if (pool.length < 2 * m * m && !pool.includes(a)) pool.push(a);
      const shown = pool.length <= m * m ? pool : [pool[0], ...pool.slice(1).sort((p, q) => hash(x, y, p.i) - hash(x, y, q.i)).slice(0, m * m - 1)];
      if (!shown.length) continue;
      // The slots in a fixed shuffled order for this square, so the best known isn't always top left.
      const slots = Array.from({ length: m * m }, (_, j) => j).sort((p, q) => hash(x, y, p) - hash(x, y, q));
      shown.forEach((a, j) => {
        const sx = slots[j] % m, sy = Math.floor(slots[j] / m);
        const jx = (hash(x, y, 10 + j) - 0.5) * 0.45, jy = (hash(x, y, 20 + j) - 0.5) * 0.45;
        out.push({ a, lon: -180 + (x + (sx + 0.5 + jx) / m) * DEG, lat: -90 + (y + (sy + 0.5 + jy) / m) * DEG });
      });
    }
  }
  return out;
}

// ---- Drawing --------------------------------------------------------------------------------------------------
const glyphs = new Map<string, HTMLCanvasElement>();
/** An emoji drawn once at a size, then copied: much faster than drawing text hundreds of times a frame. */
function glyph(e: string, px: number, dpr: number): HTMLCanvasElement {
  const s = Math.round(px * dpr), key = `${e}|${s}`;
  let c = glyphs.get(key);
  if (c) return c;
  if (glyphs.size > 600) glyphs.clear();
  c = document.createElement('canvas');
  c.width = c.height = Math.ceil(s * 1.3);
  const g = c.getContext('2d')!;
  g.font = `${s}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(e, c.width / 2, c.height / 2 + s * 0.06);
  glyphs.set(key, c);
  return c;
}
const sizeAt = (z: number) => Math.max(17, Math.min(30, 13 + z * 2.6));

interface Drawn { a: Animal; x: number; y: number; r: number }
interface Star { p: Park; n: number; x: number; y: number }

/** The squares of the focused range, as one shape per shade (cached per focus). */
let rangeShapes: { id: string; bins: MultiPolygon[] } | null = null;
function rangeOf(f: Focus) {
  if (rangeShapes?.id === f.id) return rangeShapes.bins;
  const bins: MultiPolygon[] = Array.from({ length: 10 }, () => ({ type: 'MultiPolygon', coordinates: [] }));
  f.cells.forEach((c, i) => {
    const x = c % COLS, y = Math.floor(c / COLS);
    const w = -180 + x * DEG, s = -90 + y * DEG, e = w + DEG, n = s + DEG, mid = w + DEG / 2;
    // Clockwise (west, north, east, south): on the sphere the other way round is everything but the square.
    bins[Math.min(9, f.counts[i] ?? 0)].coordinates.push([[[w, s], [w, n], [mid, n], [e, n], [e, s], [mid, s], [w, s]]]);
  });
  rangeShapes = { id: f.id, bins };
  return bins;
}

function drawRange(rc: RenderCtx, f: Focus) {
  const { ctx, path } = rc;
  const dark = rc.theme.dark;
  // The map dims a little, so the squares stand out on any filter's colours.
  ctx.beginPath(); path({ type: 'Sphere' });
  ctx.fillStyle = dark ? 'rgba(6,10,20,0.42)' : 'rgba(255,255,255,0.5)'; ctx.fill();
  rangeOf(f).forEach((mp, b) => {
    if (!mp.coordinates.length) return;
    ctx.beginPath(); path(mp);
    ctx.fillStyle = dark ? `rgba(255,190,60,${0.5 + b * 0.05})` : `rgba(230,73,0,${0.42 + b * 0.055})`;
    ctx.fill();
  });
}

function drawCarpet(rc: RenderCtx, inst: LayerInstance) {
  if (!data) return;
  const { ctx } = rc;
  const pxPerDeg = (rc.view.pxPerRadian * Math.PI) / 180, base = DEG * pxPerDeg;
  const S = spacingAt(rc.webZoom);
  const list = base >= S * 2 ? slotPicks(data, rc, Math.min(4, Math.floor(base / S)), inst)
    : picksAt(data, Math.max(0, Math.ceil(Math.log2(S / base))), inst);
  const size = sizeAt(rc.webZoom), r = size * 0.62, status = statusOf(inst), dark = rc.theme.dark;
  const [clon, clat] = rc.center, vr = rc.view.visibleRadius();
  const drawn: Drawn[] = [];
  const { w, h: hh } = rc.view;
  for (const p of list) {
    if (geoDistance([clon, clat], [p.lon, p.lat]) > vr) continue;
    const xy = rc.project(p.lon, p.lat);
    if (!xy || xy[0] < -r || xy[1] < -r || xy[0] > w + r || xy[1] > hh + r) continue;
    const [x, y] = xy;
    const st = p.a.st;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = p.a.gone ? (dark ? 'rgba(40,40,46,0.8)' : 'rgba(225,222,215,0.85)') : dark ? 'rgba(10,20,40,0.5)' : 'rgba(255,255,255,0.66)';
    ctx.fill();
    if ((status === 'endangered' || focus) && st && STATUS[st] && threatened(st)) { ctx.lineWidth = 2.4; ctx.strokeStyle = STATUS[st].color; ctx.stroke(); }
    else if (p.a.gone) { ctx.lineWidth = 1.6; ctx.strokeStyle = dark ? '#adb5bd' : '#495057'; ctx.stroke(); }
    const g = glyph(p.a.e, size, rc.dpr), gs = g.width / rc.dpr;
    const alpha = ctx.globalAlpha;
    if (p.a.gone) ctx.globalAlpha = alpha * 0.8;
    ctx.drawImage(g, x - gs / 2, y - gs / 2, gs, gs);
    ctx.globalAlpha = alpha;
    rc.labels.reserve(x - r, y - r, x + r, y + r);
    drawn.push({ a: p.a, x, y, r });
  }
  inst.state.drawn = drawn;
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
  pickCache.clear();
  if (f && !APP.isActive('wild')) await APP.activate('wild');
  if (f?.animal && !f.best) { parks ??= await loadParks(); f.best = (f.animal.best ?? []).map((id) => parks?.find((p) => p.id === id)).filter((p): p is Park => !!p).slice(0, 6); }
  if (f && fly && f.cells.length) {
    // Fly to the middle of its squares, weighted by sightings, close enough to see them all (but not too far out).
    let x = 0, y = 0, z = 0, w = 180, e = -180, s = 90, n = -90;
    const lon0 = cellCenter(f.cells[f.counts.indexOf(Math.max(...f.counts))] ?? f.cells[0])[0];
    f.cells.forEach((c, i) => {
      const [lon, lat] = cellCenter(c);
      const l = ((lon - lon0 + 540) % 360) - 180 + lon0, wt = 1 + (f.counts[i] ?? 0);
      x += l * wt; y += lat * wt; z += wt;
      w = Math.min(w, l); e = Math.max(e, l); s = Math.min(s, lat); n = Math.max(n, lat);
    });
    const span = Math.max(e - w, (n - s) * 1.4, 4);
    APP.flyTo(((x / z + 540) % 360) - 180, y / z, Math.max(1, Math.min(14, 120 / span)));
  }
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
  onOptionsChanged() { focus = null; pickCache.clear(); LC.requestRender(); },
  onDeactivate() { focus = null; pickCache.clear(); },
  drawOverlay(rc, inst) {
    if (!data) return;
    if (focus) drawRange(rc, focus);
    drawCarpet(rc, inst);
    drawStars(rc, inst);
  },
  labels(rc, inst) {
    const drawn = (inst.state.drawn as Drawn[] | undefined) ?? [];
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
    let best: Drawn | null = null, bd = Infinity;
    for (const d of (inst.state.drawn as Drawn[] | undefined) ?? []) { const dd = Math.hypot(d.x - ui.x, d.y - ui.y); if (dd < Math.max(18, d.r + 3) && dd < bd) { bd = dd; best = d; } }
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
  drawRange(rc, { id: a.id, name: nm(a), e: a.e, cells: a.cells, counts: a.counts, animal: a });
}
/** How far a point is from where an animal lives, in km: 0 inside one of its squares. */
export function rangeKm(a: Animal, at: [number, number]): number {
  if (livesIn(a, cellAt(at[0], at[1]))) return 0;
  let best = Infinity;
  for (const c of a.cells) { const d = geoDistance(cellCenter(c), at); if (d < best) best = d; }
  // From the middle of the nearest square to its edge: about half a square.
  return Math.max(0, best * 6371 - (DEG * 111) / 2);
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
