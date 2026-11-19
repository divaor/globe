// Dive from here (v0.33.0): a column from the sea's surface down to 11 000 m, the sea floor of the tapped point drawn
// in. The top few hundred metres get the most room (most life is there), the trenches the least. Animals of that
// ocean and latitude at their usual depths on the right, records on the left; a tap on the column reads the light,
// the cold and the pressure there.
import { h } from '../ui/dom';
import { fmtNumber, Lc, tx } from '../app/i18n';
import { L } from '../play/host';
import { ZONES, zoneOf, pressureAtm, lightAt, tempAt, type Ocean } from './depth';

export interface SeaAnimal { id: string; e: string; name: { en: string; es: string }; sci: string; group: string; depth: [number, number]; usual: number; oceans: string[]; lat: [number, number]; text: { en: string; es: string }; record?: boolean }
export interface DeepMarker { id: string; depth_m: number; kind: string; name: { en: string; es: string }; place?: { en: string; es: string }; lon?: number; lat?: number; year?: number; text: { en: string; es: string } }

const MAX = 11000;
const STRETCH: [number, number][] = [[0, 0], [200, 0.2], [1000, 0.42], [4000, 0.72], [MAX, 1]];
export function yOfM(m: number): number {
  for (let i = 1; i < STRETCH.length; i++) if (m <= STRETCH[i][0]) {
    const [d0, y0] = STRETCH[i - 1], [d1, y1] = STRETCH[i];
    return y0 + ((y1 - y0) * (m - d0)) / (d1 - d0);
  }
  return 1;
}
export function mOfY(y: number): number {
  for (let i = 1; i < STRETCH.length; i++) if (y <= STRETCH[i][1]) {
    const [d0, y0] = STRETCH[i - 1], [d1, y1] = STRETCH[i];
    return d0 + ((d1 - d0) * (y - y0)) / (y1 - y0);
  }
  return MAX;
}
export const metres = (m: number) => `${fmtNumber(Math.round(m))} m`;

/** The animals that live where the reader dives: in that ocean, at that latitude, not below its sea floor. */
export function animalsHere(all: SeaAnimal[], ocean: Ocean, lat: number, floor: number): SeaAnimal[] {
  return all.filter((a) => (a.oceans.includes(ocean) || a.oceans.includes('all')) && lat >= a.lat[0] - 2 && lat <= a.lat[1] + 2 && a.depth[0] <= floor);
}

/** What it is like at a depth, in words: a comparison for the pressure. */
export function pressureWords(m: number): string {
  const atm = pressureAtm(m);
  if (m < 10) return L('air pressure at sea level, and a little more', 'la presión del aire al nivel del mar, y un poco más');
  if (m < 300) return L('{0} times the air at sea level', '{0} veces el aire al nivel del mar', fmtNumber(Math.round(atm)));
  // About 1 kg on every square centimetre for each atmosphere.
  return L('{0} times the air at sea level: about {0} kg on every square centimetre, like an elephant on a postage stamp', '{0} veces el aire al nivel del mar: unos {0} kg en cada centímetro cuadrado, como un elefante sobre una estampilla', fmtNumber(Math.round(atm)));
}

const SVG = 'http://www.w3.org/2000/svg';
const s = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text != null) el.textContent = text;
  return el;
};

export function diveColumn(o: { floor: number; lat: number; animals: SeaAnimal[]; markers: DeepMarker[]; onDepth?: (m: number) => void; onAnimal?: (a: SeaAnimal) => void }): HTMLElement {
  const H = 1250, W = 360, X0 = 136, CW = 40;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'dive-svg', role: 'img', 'aria-label': L('A column from the sea’s surface to the deepest trench', 'Una columna de la superficie del mar a la fosa más profunda') });
  const Y = (m: number) => 8 + yOfM(m) * (H - 16);
  // The zones, darker the deeper; the light fades out.
  const defs = s('defs', {});
  const grad = s('linearGradient', { id: 'dive-light', x1: 0, y1: 0, x2: 0, y2: 1 });
  for (const [m, op] of [[0, 0.55], [100, 0.25], [200, 0.08], [1000, 0]] as const) grad.append(s('stop', { offset: yOfM(m), 'stop-color': '#fff7d6', 'stop-opacity': op }));
  defs.append(grad);
  svg.append(defs);
  for (const z of ZONES) {
    svg.append(s('rect', { x: X0, y: Y(z.top), width: CW, height: Y(z.bottom) - Y(z.top), fill: z.color }));
    const mid = (Y(z.top) + Y(Math.min(z.bottom, MAX))) / 2;
    svg.append(s('text', { x: X0 + CW / 2, y: mid, class: 'dive-band', 'text-anchor': 'middle', 'dominant-baseline': 'middle', transform: `rotate(-90 ${X0 + CW / 2} ${mid})` }, z.name().replace(/ \(.*\)$/, '')));
  }
  svg.append(s('rect', { x: X0, y: Y(0), width: CW, height: Y(1000) - Y(0), fill: 'url(#dive-light)' }));
  // The sea floor here, and the rock below it.
  const floor = Math.max(0, Math.min(MAX, o.floor));
  svg.append(s('rect', { x: X0 - 4, y: Y(floor), width: CW + 8, height: Y(MAX) - Y(floor) + 8, class: 'dive-rock' }));
  svg.append(s('line', { x1: X0 - 10, x2: X0 + CW + 10, y1: Y(floor), y2: Y(floor), class: 'dive-floor' }));
  // The scale on the left, and the records beside it.
  const left: { y: number; text: string; cls: string; tip?: string }[] = [];
  for (const m of [0, 200, 1000, 4000, 6000, 11000]) left.push({ y: Y(m), text: metres(m), cls: 'dive-tick' });
  left.push({ y: Y(floor), text: L('Sea floor {0}', 'Fondo {0}', metres(floor)), cls: 'dive-floor-label' });
  for (const k of o.markers) left.push({ y: Y(k.depth_m), text: `${tx(k.name)}`, cls: 'dive-rec', tip: `${metres(k.depth_m)} · ${tx(k.text)}` });
  left.sort((a, b) => a.y - b.y);
  let lastY = -99;
  for (const t of left) {
    const y = Math.max(t.y, lastY + 13);
    if (y > H - 4) continue;
    lastY = y;
    if (t.cls === 'dive-rec') svg.append(s('line', { x1: X0 - 6, x2: X0, y1: t.y, y2: t.y, class: 'dive-lead' }));
    const el = s('text', { x: X0 - 8, y: y + 4, class: t.cls, 'text-anchor': 'end' }, t.text.length > 22 ? `${t.text.slice(0, 21)}…` : t.text);
    if (t.tip) el.append(s('title', {}, `${t.text} · ${t.tip}`));
    svg.append(el);
  }
  // The animals on the right: the record holders first, then the others where there is room.
  const placed: { a: SeaAnimal; y: number }[] = [];
  const free = (y: number) => !placed.some((p) => Math.abs(p.y - y) < 15);
  const order = [...o.animals].sort((a, b) => Number(!!b.record) - Number(!!a.record) || a.usual - b.usual);
  for (const a of order) {
    const at = Math.min(Math.max(a.usual, a.depth[0]), floor);
    let y = Y(at);
    if (!free(y)) { const alt = [y + 15, y - 15, y + 30, y - 30].find((v) => v > 6 && v < Y(floor) + 4 && free(v)); if (alt == null) continue; y = alt; }
    placed.push({ a, y });
    svg.append(s('line', { x1: X0 + CW, x2: X0 + CW + 10, y1: Y(at), y2: y, class: 'dive-lead' }));
    const g = s('g', { class: 'dive-animal', 'data-animal': a.id, tabindex: 0, role: 'button' });
    g.append(s('text', { x: X0 + CW + 14, y: y + 5, class: 'dive-emoji' }, a.e));
    g.append(s('text', { x: X0 + CW + 32, y: y + 4, class: 'dive-name' }, `${tx(a.name)}${a.record ? ' ★' : ''}`));
    g.append(s('title', {}, `${tx(a.name)} · ${metres(a.depth[0])}–${metres(a.depth[1])} · ${tx(a.text)}`));
    g.addEventListener('click', (e) => { e.stopPropagation(); o.onAnimal?.(a); });
    svg.append(g);
  }
  // The reading: a line where the reader taps, and what it is like there.
  const cursor = s('line', { x1: X0 - 10, x2: X0 + CW + 10, y1: -10, y2: -10, class: 'dive-cursor' });
  svg.append(cursor);
  const read = h('div', { class: 'dive-read' });
  const show = (m: number) => {
    m = Math.max(0, Math.min(floor, m));
    cursor.setAttribute('y1', String(Y(m))); cursor.setAttribute('y2', String(Y(m)));
    const light = lightAt(m);
    read.replaceChildren(
      h('b', null, `${metres(m)} · ${zoneOf(m).name()}`),
      h('span', null, `☀️ ${light >= 0.01 ? `${fmtNumber(light * 100, light < 0.1 ? 1 : 0)} %` : m < 1000 ? L('a faint blue glow', 'un tenue brillo azul') : L('no sunlight: only the animals’ own light', 'sin luz del sol: solo la luz de los animales')}`),
      h('span', null, `🌡️ ${Lc('degrees', 'about', 'unos')} ${fmtNumber(Math.round(tempAt(m, o.lat)))} °C`),
      h('span', null, `⏬ ${pressureWords(m)}`),
    );
    o.onDepth?.(m);
  };
  const at = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const y = ((e.clientY - r.top) / r.height) * H;
    show(mOfY(Math.max(0, Math.min(1, (y - 8) / (H - 16)))));
  };
  let down = false;
  svg.addEventListener('pointerdown', (e) => { if ((e.target as Element).closest?.('.dive-animal')) return; down = true; at(e); });
  svg.addEventListener('pointermove', (e) => { if (down) at(e); });
  // A vertical swipe scrolls the panel (the browser takes it over and cancels the pointer); a tap reads the depth.
  window.addEventListener('pointerup', () => { down = false; });
  svg.addEventListener('pointercancel', () => { down = false; });
  show(Math.min(floor, 200));
  return h('div', { class: 'dive-col' }, read, svg);
}
