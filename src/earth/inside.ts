// Inside the Earth (v0.32.0), More → Inside the Earth: the globe cut open to its centre, to scale; dig down from
// any place (its crust, the rocks under it from Macrostrat, real things at their depths, what it is like down there,
// and the way out on the other side); and a quake's waves crossing the Earth.
import { Pickaxe, Scissors, X } from 'lucide';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { RenderCtx } from '../layers/types';
import { h, icon, toggle, slider, segmented } from '../ui/dom';
import { fmtNumber, tx } from '../app/i18n';
import { L } from '../play/host';
import { LAYERS, layerName, type Layer } from './model';
import { drawCut, kOf, type CutState } from './cut';
import { digColumn, depthText } from './column';
import { wavesPanel } from './waves';
import { loadInside, loadCrust, crustAt, type Inside } from './data';

type Tab = 'layers' | 'dig' | 'waves';
const PEEL_NAMES = (): string[] => [
  L('The whole Earth', 'La Tierra entera'), L('Without the crust', 'Sin la corteza'), L('Without the upper mantle', 'Sin el manto superior'),
  L('Without the transition zone', 'Sin la zona de transición'), L('Without the mantle: the core', 'Sin el manto: el núcleo'), L('Only the inner core', 'Solo el núcleo interno'),
];

/** What Macrostrat's geological map says is at the surface of a point (live). */
interface Rock { name: string; lith: string; age: string; ma: [number, number] | null }
async function rocksAt(lon: number, lat: number): Promise<Rock | null> {
  const r = await fetch(`https://macrostrat.org/api/v2/geologic_units/map?lat=${lat.toFixed(4)}&lng=${lon.toFixed(4)}`);
  if (!r.ok) throw new Error(String(r.status));
  const j = await r.json() as { success?: { data?: { name: string; lith: string; best_int_name: string; t_age: number; b_age: number; scale: string }[] } };
  const rows = j.success?.data ?? [];
  const order = ['large', 'medium', 'small', 'tiny'];
  const u = [...rows].sort((a, b) => order.indexOf(a.scale) - order.indexOf(b.scale))[0];
  if (!u) return null;
  return { name: u.name, lith: u.lith, age: u.best_int_name, ma: Number.isFinite(u.b_age) ? [u.t_age, u.b_age] : null };
}
const ageText = (ma: number) => (ma >= 1000 ? L('{0} billion years', '{0} mil millones de años', fmtNumber(ma / 1000, 1))
  : ma >= 1 ? L('{0} million years', '{0} millones de años', fmtNumber(Math.round(ma)))
    : L('{0} thousand years', '{0} mil años', fmtNumber(Math.round(ma * 1000))));

export class InsideEarth {
  active = false;
  readonly st: CutState = { lon1: 0, peel: 0, focus: null, names: true, name: (l: Layer) => layerName(l) };
  private peelGoal = 0;
  private tab: Tab = 'layers';
  private dig: [number, number] | null = null;
  private chip: HTMLElement | null = null;
  private facts: Inside | null = null;
  private crust: Uint8Array | null = null;
  private rocks = new Map<string, Promise<Rock | null>>();
  private insetSet = false;
  /** Tests read this. */
  get info() { return { active: this.active, lon1: this.st.lon1, peel: this.st.peel, focus: this.st.focus, dig: this.dig, tab: this.tab, open: this.shell.sheet.isOpen('inside') }; }

  constructor(private app: App, private shell: Shell) {
    shell.addMenu({ id: 'inside', icon: Pickaxe, label: () => L('Inside the Earth', 'El interior de la Tierra'), order: 28.8, group: 'explore', onClick: () => void this.open() });
    app.renderer.afterShade.add((rc) => this.draw(rc));
    // While the Earth is cut open, a tap on the globe digs down there.
    shell.tapHandlers.unshift((_x, _y, g) => {
      if (!this.active || app.mode) return false;
      if (g) void this.digAt(g[0], g[1]);
      return true;
    });
    // The reader made the panel taller or shorter: the globe centres again in what is left above it.
    document.addEventListener('sheet-resized', () => { if (this.shell.sheet.isOpen('inside')) this.inset(true); });
    app.on('lang', () => { if (this.shell.sheet.isOpen('inside')) this.render(); if (this.active) this.showChip(); });
  }

  /** Opens the panel (and cuts the Earth open, the first time), on a tab. */
  async open(tab?: Tab) {
    if (tab) this.tab = tab;
    if (!this.active) this.start();
    [this.facts, this.crust] = await Promise.all([loadInside(), loadCrust()]);
    this.render();
  }

  /** Cuts the Earth open where it faces us, seen a little from above. */
  start() {
    const app = this.app, v = app.renderer.view;
    this.active = true;
    if (app.projection !== 'globe') app.setProjection('globe');
    this.st.lon1 = Math.round(v.lon) - 45;
    v.flyTo({ lat: 24, zoom: Math.min(Math.max(v.zoom, 1), 1.15) }, 1100);
    this.showChip();
    app.renderer.requestRender();
  }

  /** Cut open by a tour or ambient mode: no panel, no chip, centred on `lon`. hideCut() takes it away again. */
  private byTour = false;
  showCut(o: { peel?: number; focus?: string; lon?: number }) {
    const app = this.app;
    if (!this.active) {
      this.active = true; this.byTour = true;
      if (app.projection !== 'globe') app.setProjection('globe');
    }
    if (o.lon != null) this.st.lon1 = Math.round(o.lon) - 45;
    this.peelGoal = o.peel ?? 0;
    this.st.focus = (o.focus as Layer['id'] | undefined) ?? null;
    this.easePeel();
  }
  hideCut() { if (this.active && this.byTour) { this.byTour = false; this.stop(); } }

  /** Takes the cut away. */
  stop() {
    this.byTour = false;
    this.active = false;
    this.st.peel = this.peelGoal = 0; this.st.focus = null; this.dig = null;
    this.app.renderer.tickers.delete(this.peelTicker);
    this.chip?.remove(); this.chip = null;
    if (this.shell.sheet.isOpen('inside')) this.shell.sheet.close();
    this.inset(false);
    this.app.renderer.requestRender();
  }

  /** The cut turned to face us again. */
  cutHere() { this.st.lon1 = Math.round(this.app.renderer.view.lon) - 45; this.app.renderer.requestRender(); }

  setPeel(n: number) { this.peelGoal = Math.max(0, Math.min(5, n)); this.easePeel(); }

  /**
   * Peeling eases from layer to layer. Its ticker is there only while it eases: the renderer takes any ticker as the
   * map moving (and draws the lighter map data meanwhile).
   */
  private readonly peelTicker = (dt: number): boolean => {
    const done = !this.active || Math.abs(this.st.peel - this.peelGoal) < 0.01;
    if (done) {
      if (this.active) this.st.peel = this.peelGoal;
      this.app.renderer.tickers.delete(this.peelTicker);
      return true; // this last frame draws where it stopped
    }
    // By time, not by frame: about half a second to the next layer, however slowly the frames come.
    this.st.peel += (this.peelGoal - this.st.peel) * (1 - Math.exp(-dt / 85));
    return true;
  };
  private easePeel() {
    if (Math.abs(this.st.peel - this.peelGoal) > 0.001) this.app.renderer.tickers.add(this.peelTicker);
    this.app.renderer.requestRender();
  }
  setFocus(id: Layer['id'] | null) { this.st.focus = id; this.app.renderer.requestRender(); }

  async digAt(lon: number, lat: number) {
    this.dig = [lon, lat];
    this.tab = 'dig';
    await this.open('dig');
    this.app.renderer.requestRender();
  }

  private showChip() {
    this.chip?.remove();
    const x = h('button', { type: 'button', class: 'art-trail-x', title: L('Close the Earth', 'Cerrar la Tierra'), 'aria-label': L('Close the Earth', 'Cerrar la Tierra') }, icon(X, 14));
    x.addEventListener('click', (e) => { e.stopPropagation(); this.stop(); });
    const name = h('button', { type: 'button', class: 'art-trail-name inside-chip-name' }, `✂️ ${L('Inside the Earth', 'El interior de la Tierra')}`);
    name.addEventListener('click', () => void this.open());
    this.chip = h('div', { class: 'art-trail-chip inside-chip glass', role: 'status' }, name, x);
    this.app.root.append(this.chip);
  }

  private draw(rc: RenderCtx) {
    if (!this.active || this.app.mode) return;
    drawCut(rc, this.st, rc.theme.space[1]);
    // Where we dig: a pin, and its line down to the centre while the cut shows it.
    if (this.dig) {
      const p = rc.project(this.dig[0], this.dig[1]);
      if (p) {
        const { ctx } = rc;
        ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd43b'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#1b1b1b'; ctx.stroke();
        rc.labels.add({ text: '⛏️', x: p[0], y: p[1] - 16, priority: 6000, size: 16, color: '#fff', halo: 'rgba(0,0,0,0.6)' });
      }
    }
  }

  /** On a phone the panel covers the lower part of the screen: the globe centres in the part above it. */
  private inset(on: boolean) {
    const v = this.app.renderer.view;
    if (on && !this.app.mode) {
      const r = document.querySelector('.sheet:not([hidden])')?.getBoundingClientRect();
      v.insetBottom = r && r.left < 40 && r.top > 80 ? Math.max(0, Math.round(window.innerHeight - r.top)) : 0;
      this.insetSet = true;
    } else if (!on && this.insetSet) { v.insetBottom = 0; this.insetSet = false; }
    this.app.renderer.requestRender();
  }

  private render() {
    const tabs = segmented<Tab>(this.tab, [
      { value: 'layers', label: L('Layers', 'Capas') },
      { value: 'dig', label: L('Dig down', 'Cavar') },
      { value: 'waves', label: L('Seismic waves', 'Ondas sísmicas') },
    ], (v) => { this.tab = v; this.render(); });
    tabs.classList.add('inside-tabs');
    const body = h('div', { class: 'inside' }, tabs,
      this.tab === 'layers' ? this.layersTab() : this.tab === 'dig' ? this.digTab() : wavesPanel());
    // The chip says the Earth is still cut open once the panel is closed; while it is open, it would cover the globe.
    if (this.chip) this.chip.hidden = true;
    this.shell.openPanel('inside', L('Inside the Earth', 'El interior de la Tierra'), body, () => { this.inset(false); if (this.chip) this.chip.hidden = false; });
    requestAnimationFrame(() => this.inset(true));
  }

  private layersTab(): HTMLElement {
    const f = (id: string) => this.facts?.layers.find((x) => x.id === id);
    const t2 = (x?: { en: string; es: string }) => (x ? (tx(x)) : '');
    const peelLabel = h('span', { class: 'inside-peel-name' }, PEEL_NAMES()[Math.round(this.peelGoal)]);
    const rows = LAYERS.map((l) => {
      const x = f(l.id);
      const on = this.st.focus === l.id;
      const row = h('button', { type: 'button', class: `inside-layer${on ? ' on' : ''}`, 'data-layer': l.id, 'aria-pressed': String(on) },
        h('span', { class: 'inside-sw', style: `background:${l.color}` }),
        h('span', { class: 'inside-ln' }, h('b', null, layerName(l)), h('small', null, `${depthText(l.top)} – ${depthText(l.bottom)}${x ? ` · ${fmtNumber(x.temp_c[0])}–${fmtNumber(x.temp_c[1])} °C` : ''}`)));
      row.addEventListener('click', () => { this.setFocus(on ? null : l.id); this.render(); });
      const more = on && x ? h('div', { class: 'inside-facts' },
        h('p', null, h('b', null, L('What it is: ', 'Qué es: ')), t2(x.state), '. ', t2(x.made)),
        h('p', null, h('b', null, L('How hot and squeezed: ', 'Qué tan caliente y comprimida: ')),
          L('{0} to {1} °C; {2} to {3} GPa; {4} to {5} g/cm³.', 'De {0} a {1} °C; de {2} a {3} GPa; de {4} a {5} g/cm³.', fmtNumber(x.temp_c[0]), fmtNumber(x.temp_c[1]), fmtNumber(x.pressure_gpa[0], 1), fmtNumber(x.pressure_gpa[1], 1), fmtNumber(x.density[0], 1), fmtNumber(x.density[1], 1))),
        h('p', null, h('b', null, L('How we know: ', 'Cómo lo sabemos: ')), t2(x.know)),
        h('p', { class: 'muted' }, t2(x.fact))) : null;
      return h('div', null, row, more);
    });
    const cut = h('button', { type: 'button', class: 'pill sm', 'data-inside': 'cut-here' }, icon(Scissors, 15), L('Cut where I look', 'Cortar donde miro'));
    cut.addEventListener('click', () => this.cutHere());
    const dig = h('button', { type: 'button', class: 'pill sm primary', 'data-inside': 'dig' }, icon(Pickaxe, 15), L('Dig down from here', 'Cavar desde aquí'));
    dig.addEventListener('click', () => { const v = this.app.renderer.view; void this.digAt(v.lon, Math.max(-60, Math.min(70, v.lat))); });
    return h('div', null,
      h('p', { class: 'small' }, L('The Earth cut open, to scale: an eighth of it taken out. Turn the globe and the cut turns with it; tap the globe to dig down anywhere.',
        'La Tierra abierta, a escala: le falta una octava parte. Gira el globo y el corte gira con él; toca el globo para cavar en cualquier lugar.')),
      ...rows,
      h('div', { class: 'field' }, h('div', { class: 'field-label' }, L('Peel the layers away: ', 'Quitar capas: '), peelLabel),
        slider(this.peelGoal, 0, 5, 1, (v) => { this.setPeel(v); peelLabel.textContent = PEEL_NAMES()[v]; })),
      h('div', { class: 'toggles' }, toggle(this.st.names, (v) => { this.st.names = v; this.app.renderer.requestRender(); }, L('Names on the cut', 'Nombres en el corte'))),
      h('div', { class: 'hop-actions' }, dig, cut),
      this.facts?.moho ? h('p', { class: 'muted small' }, tx(this.facts.moho)) : null,
    );
  }

  private digTab(): HTMLElement {
    if (!this.dig) {
      return h('div', null, h('p', { class: 'small' }, L('Tap the globe where you want to dig.', 'Toca el globo donde quieras cavar.')));
    }
    const [lon, lat] = this.dig;
    const km = crustAt(this.crust, lon, lat);
    const where = this.app.renderer.countryAt(lon, lat);
    const place = where ? this.app.data.name(where, this.app.lang) : L('the ocean', 'el océano');
    const coord = `${fmtNumber(Math.abs(lat), 1)}°${lat >= 0 ? 'N' : 'S'}, ${fmtNumber(Math.abs(lon), 1)}°${lon >= 0 ? 'E' : L('W', 'O')}`;
    // The rocks at the surface there (live, from Macrostrat's geological map).
    const rockEl = h('p', { class: 'small inside-rocks' }, L('Looking up the rocks here…', 'Buscando las rocas de aquí…'));
    const key = `${lon.toFixed(2)},${lat.toFixed(2)}`;
    let q = this.rocks.get(key);
    if (!q) { q = rocksAt(lon, lat).catch(() => null); this.rocks.set(key, q); }
    void q.then((r) => {
      if (!rockEl.isConnected) return;
      if (!r) {
        rockEl.textContent = L('🪨 No geological map answered for this place (Macrostrat covers the land, best in North America; it needs the internet).',
          '🪨 Ningún mapa geológico respondió para este lugar (Macrostrat cubre la tierra firme, mejor en Norteamérica; necesita internet).');
        return;
      }
      // Its name, then what it is and its age where the name does not already say them ("Gravel, Holocene").
      const name = r.name || r.lith, low = name.toLowerCase();
      const lith = r.lith && r.name && !low.includes(r.lith.toLowerCase()) ? ` (${r.lith})` : '';
      const age = r.age && !low.includes(r.age.toLowerCase()) ? `, ${r.age}` : '';
      const old = !r.ma ? '' : r.ma[0] < 0.001 ? L(': up to {0} old', ': de hasta {0} de antigüedad', ageText(r.ma[1]))
        : L(': {0} to {1} old', ': de {0} a {1} de antigüedad', ageText(r.ma[0]), ageText(r.ma[1]));
      rockEl.textContent = L('🪨 Under your feet: {0}{1}{2}{3}. From Macrostrat\'s geological map.', '🪨 Bajo tus pies: {0}{1}{2}{3}. Del mapa geológico de Macrostrat.', name, lith, age, old);
    });
    // Straight through the centre: the antipode.
    const alon = lon > 0 ? lon - 180 : lon + 180, alat = -lat;
    const there = this.app.renderer.countryAt(alon, alat);
    const thereName = there ? this.app.data.name(there, this.app.lang) : L('the open ocean', 'el mar abierto');
    const minutes = this.facts?.fall_through?.minutes ?? 38;
    const go = h('button', { type: 'button', class: 'pill sm', 'data-inside': 'antipode' }, L('Go to the other side', 'Ir al otro lado'));
    go.addEventListener('click', () => { void this.digAt(alon, alat); this.app.renderer.view.flyTo({ lon: alon, lat: Math.max(-60, Math.min(70, alat)) }, 1600); });
    return h('div', null,
      h('p', { class: 'small' }, h('b', null, `📍 ${place} · ${coord}`), h('br'),
        L('The crust here is about {0} km thick (CRUST1.0); below it, the Moho and the mantle. The centre is {1} km down.', 'Aquí la corteza mide unos {0} km (CRUST1.0); debajo, el Moho y el manto. El centro está a {1} km.', fmtNumber(km), fmtNumber(6371))),
      rockEl,
      digColumn({ crustKm: km, markers: this.facts?.markers ?? [], onDepth: () => undefined }),
      h('div', { class: 'inside-through' },
        h('b', null, L('Dig through', 'Atravesar')),
        h('p', { class: 'small' }, L(
          'Straight through the centre you would come out at {0}°{1}, {2}°{3}: {4}. Falling down a tunnel through the Earth would take about {5} minutes.',
          'Atravesando el centro saldrías en {0}°{1}, {2}°{3}: {4}. Caer por un túnel a través de la Tierra tomaría unos {5} minutos.',
          fmtNumber(Math.abs(alat), 1), alat >= 0 ? L('N', 'N') : L('S', 'S'), fmtNumber(Math.abs(alon), 1), alon >= 0 ? L('E', 'E') : L('W', 'O'), thereName, fmtNumber(minutes))),
        go),
      h('p', { class: 'muted small' }, L('Deepest hole ever dug: the Kola borehole, {0}: {1} % of the way to the centre.', 'El agujero más profundo jamás cavado: el pozo de Kola, {0}: el {1} % del camino al centro.', depthText(12.262), fmtNumber((12.262 / 6371) * 100, 2))),
    );
  }
}

/** The radius fraction of a depth, for other modules. */
export { kOf };
