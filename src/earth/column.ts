// Dig down from here (v0.32.0): a column from your feet to the centre of the Earth (6,371 km). The top kilometres
// get most of the room (that is where every hole, cave and mine is), the core the least. The crust is as thick as
// CRUST1.0 says it is under the point; real things are marked at their depths; tapping the column reads the
// temperature, pressure and density there.
import { h } from '../ui/dom';
import { fmtNumber } from '../app/i18n';
import { L, es } from '../play/host';
import { EARTH_KM, LAYERS, layerAt, layerName, pressureAt, temperatureAt, densityAt, pressureText } from './model';
import type { Marker } from './data';

/** Depth (km) to a fraction of the column's height, and back: four stretches, each linear. */
const STRETCH: [number, number][] = [[0, 0], [1, 0.12], [15, 0.38], [700, 0.64], [EARTH_KM, 1]];
export function yOf(km: number): number {
  for (let i = 1; i < STRETCH.length; i++) if (km <= STRETCH[i][0]) {
    const [d0, y0] = STRETCH[i - 1], [d1, y1] = STRETCH[i];
    return y0 + ((y1 - y0) * (km - d0)) / (d1 - d0);
  }
  return 1;
}
export function kmOf(y: number): number {
  for (let i = 1; i < STRETCH.length; i++) if (y <= STRETCH[i][1]) {
    const [d0, y0] = STRETCH[i - 1], [d1, y1] = STRETCH[i];
    return d0 + ((d1 - d0) * (y - y0)) / (y1 - y0);
  }
  return EARTH_KM;
}

/** "105 m", "2.2 km", "6,371 km". */
export function depthText(km: number): string {
  if (km < 1) return `${fmtNumber(Math.round(km * 1000))} m`;
  if (km < 20) return `${fmtNumber(km, km < 10 ? 1 : 0)} km`;
  return `${fmtNumber(Math.round(km))} km`;
}

const SVG = 'http://www.w3.org/2000/svg';
const s = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text != null) el.textContent = text;
  return el;
};

/**
 * The column for a place: `crustKm` thick crust there (the Moho below it), the markers at their depths, and a
 * readout that follows taps and drags on the column.
 */
export function digColumn(o: { crustKm: number; markers: Marker[]; onDepth?: (km: number) => void }): HTMLElement {
  const H = 1150, W = 320, X0 = 64, CW = 46;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'dig-svg', role: 'img', 'aria-label': L('A column from the surface to the centre of the Earth', 'Una columna de la superficie al centro de la Tierra') });
  const Y = (km: number) => 6 + yOf(km) * (H - 12);
  // The layers, with this place's crust.
  const bands = LAYERS.map((l) => ({ l, top: l.id === 'crust' ? 0 : l.id === 'upper-mantle' ? o.crustKm : l.top, bottom: l.id === 'crust' ? o.crustKm : l.bottom }));
  for (const b of bands) {
    svg.append(s('rect', { x: X0, y: Y(b.top), width: CW, height: Math.max(1, Y(b.bottom) - Y(b.top)), fill: b.l.color }));
    const mid = (Y(b.top) + Y(b.bottom)) / 2;
    if (Y(b.bottom) - Y(b.top) > 26) svg.append(s('text', { x: X0 + CW / 2, y: mid, class: 'dig-band', 'text-anchor': 'middle', 'dominant-baseline': 'middle', transform: `rotate(-90 ${X0 + CW / 2} ${mid})` }, layerName(b.l).replace(/ \(.*\)$/, '')));
  }
  // The Moho here.
  svg.append(s('line', { x1: X0 - 6, x2: X0 + CW + 6, y1: Y(o.crustKm), y2: Y(o.crustKm), class: 'dig-moho' }));
  svg.append(s('text', { x: X0 - 8, y: Y(o.crustKm) + 4, class: 'dig-tick', 'text-anchor': 'end' }, `Moho ${depthText(o.crustKm)}`));
  // A scale on the left.
  for (const km of [0, 0.1, 0.5, 1, 4, 12, 100, 410, 660, 2891, 5150, 6371]) {
    if (Math.abs(km - o.crustKm) / Math.max(1, o.crustKm) < 0.25) continue;
    svg.append(s('line', { x1: X0 - 4, x2: X0, y1: Y(km), y2: Y(km), class: 'dig-scale' }));
    svg.append(s('text', { x: X0 - 7, y: Y(km) + 4, class: 'dig-tick', 'text-anchor': 'end' }, depthText(km)));
  }
  // The markers on the right, nudged apart when they crowd.
  const ms = [...o.markers].sort((a, b) => a.depth_m - b.depth_m);
  let lastY = -99;
  for (const m of ms) {
    const km = m.depth_m / 1000, y0 = Y(km);
    const y = Math.max(y0, lastY + 15);
    lastY = y;
    svg.append(s('line', { x1: X0 + CW, x2: X0 + CW + 10, y1: y0, y2: y, class: 'dig-lead' }));
    svg.append(s('circle', { cx: X0 + CW, cy: y0, r: 2.6, class: 'dig-dot' }));
    const t = s('text', { x: X0 + CW + 13, y: y + 4, class: 'dig-mark' }, `${depthText(km)} · ${es() ? m.name.es : m.name.en}`);
    const title = s('title', {}, `${es() ? m.name.es : m.name.en} · ${es() ? m.place.es : m.place.en}${m.below === 'sea' ? L(' (below sea level)', ' (bajo el nivel del mar)') : ''}`);
    t.append(title);
    svg.append(t);
  }
  // The reading: a line across where the reader taps, and what it is like there.
  const cursor = s('line', { x1: X0 - 10, x2: X0 + CW + 10, y1: -10, y2: -10, class: 'dig-cursor' });
  svg.append(cursor);
  const read = h('div', { class: 'dig-read' });
  const show = (km: number) => {
    km = Math.max(0, Math.min(EARTH_KM, km));
    cursor.setAttribute('y1', String(Y(km))); cursor.setAttribute('y2', String(Y(km)));
    const layer = km < o.crustKm ? LAYERS[0] : layerAt(Math.max(km, LAYERS[1].top));
    read.replaceChildren(
      h('b', null, `${depthText(km)} · ${layerName(layer)}`),
      h('span', null, `🌡️ ${fmtNumber(Math.round(temperatureAt(km) / 10) * 10)} °C`),
      h('span', null, `⏬ ${pressureText(pressureAt(km))}`),
      h('span', null, `⚖️ ${fmtNumber(densityAt(km), 1)} g/cm³`),
    );
    o.onDepth?.(km);
  };
  const at = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const y = ((e.clientY - r.top) / r.height) * H;
    show(kmOf(Math.max(0, Math.min(1, (y - 6) / (H - 12)))));
  };
  let down = false;
  svg.addEventListener('pointerdown', (e) => { down = true; at(e); });
  svg.addEventListener('pointermove', (e) => { if (down) at(e); });
  window.addEventListener('pointerup', () => { down = false; });
  show(o.crustKm);
  return h('div', { class: 'dig-col' }, read, svg);
}
