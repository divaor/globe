// Detailed terrain, the user's side: the settings (detail on or off, only on Wi-Fi, what was downloaded), saving the
// area on screen for offline use (with its size shown first) and the list of saved areas.
import { h, toggle, clear } from './dom';
import { prefs, savePrefs, stats, connection, tiles, fmtBytes, TERRAIN, SENTINEL } from '../engine/tiles';
import { areas, plan, saveArea, deleteArea, type SavedArea } from '../engine/offline';
import { tileZoom } from '../engine/detail';
import { terrainActions } from '../layers/terrainActions';
import { lang } from '../app/i18n';
import type { App } from '../app/app';
import type { Shell } from './shell';

const es = () => lang() === 'es';
const L = (en: string, sp: string) => (es() ? sp : en);
/** The most tiles one save may hold (about 1 GB at the most). */
const MAX_TILES = 20000;

/** "about 38 m": the ground size of a tile pixel of zoom z at a latitude. */
const groundSize = (z: number, lat: number) => {
  const m = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** z);
  return m >= 1000 ? `${(m / 1000).toLocaleString(es() ? 'es-ES' : 'en-GB', { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`;
};

export class TerrainUI {
  /** For tests and the console: the tile loader, its counters and the user's choices. */
  readonly tiles = tiles;
  readonly stats = stats;
  readonly prefs = prefs;

  constructor(private app: App, private shell: Shell) {
    terrainActions.save = () => this.openSave();
    terrainActions.settings = () => this.shell.openSettings(true);
  }

  /** The box of the map on screen (all of it, under the panels too): its points every 40 px, turned into longitudes
   *  and latitudes. */
  screenBox(): [number, number, number, number] | null {
    const v = this.app.renderer.view;
    const lons: number[] = [], lats: number[] = [];
    for (let y = 0; y <= v.h + 39; y += 40) for (let x = 0; x <= v.w + 39; x += 40) {
      const g = v.invert(Math.min(x, v.w - 1), Math.min(y, v.h - 1));
      if (g) { lons.push(g[0]); lats.push(g[1]); }
    }
    if (lons.length < 4) return null;
    lons.sort((a, b) => a - b);
    // The widest gap between longitudes (going round the world) is outside the box.
    let gap = lons[0] + 360 - lons[lons.length - 1], w = lons[0], e = lons[lons.length - 1];
    for (let k = 1; k < lons.length; k++) if (lons[k] - lons[k - 1] > gap) { gap = lons[k] - lons[k - 1]; w = lons[k]; e = lons[k - 1]; }
    return [w, Math.max(-85, Math.min(...lats)), e, Math.min(85, Math.max(...lats))];
  }

  /** "Around Cusco, Peru": the largest city in the box, else the country in the middle. */
  areaName(box: [number, number, number, number]): { en: string; es: string } {
    const [w, s, e, n] = box;
    const inLon = (lon: number) => (w <= e ? lon >= w && lon <= e : lon >= w || lon <= e);
    const city = this.app.data.cities.filter((c) => c.lat >= s && c.lat <= n && inLon(c.lon)).sort((a, b) => b.pop - a.pop)[0];
    const meta = this.app.data.meta;
    if (city) {
      const c = meta[city.country];
      return { en: `Around ${city.name}${c ? `, ${c.n}` : ''}`, es: `Alrededor de ${city.es ?? city.name}${c ? `, ${c.es}` : ''}` };
    }
    const v = this.app.renderer.view;
    const id = this.app.renderer.countryAt(v.lon, v.lat);
    if (id && meta[id]) return { en: meta[id].n, es: meta[id].es };
    const f = (x: number, p: string, q: string) => `${Math.abs(x).toFixed(1)}°${x >= 0 ? p : q}`;
    return { en: `Area at ${f(v.lat, 'N', 'S')}, ${f(v.lon, 'E', 'W')}`, es: `Zona en ${f(v.lat, 'N', 'S')}, ${f(v.lon, 'E', 'O')}` };
  }

  /** Save the area on screen: the detail (with the ground size of a pixel), what to keep, the size, then progress. */
  openSave() {
    const box = this.screenBox();
    const v = this.app.renderer.view;
    const body = h('div', { class: 'terrain-save' });
    this.shell.openPanel('terrain-save', L('Save this area for offline use', 'Guardar esta zona sin conexión'), body);
    if (!box) { body.append(h('p', { class: 'muted' }, L('Turn the map so that land is on screen.', 'Gira el mapa para que se vea tierra.'))); return; }
    const z = Math.max(6, tileZoom(v, TERRAIN));
    const name = this.areaName(box);
    const active = this.app.layers.map((l) => l.def.id);
    const sources = new Set<string>([...(active.includes('satellite') ? [SENTINEL.id] : []), ...(active.some((x) => x === 'relief' || x === 'elevation') ? [TERRAIN.id] : [])]);
    if (!sources.size) { sources.add(TERRAIN.id); sources.add(SENTINEL.id); }
    let top = Math.min(14, z);
    const levels: [number, string][] = [[Math.min(14, z), L('As on screen', 'Como en pantalla')], [Math.min(14, z + 1), L('Sharper', 'Más nítido')], [Math.min(14, z + 2), L('Sharpest', 'Lo más nítido')]];
    const levelRow = h('div', { class: 'chip-row' });
    const srcRow = h('div', { class: 'toggles' });
    const est = h('p', { class: 'terrain-est' });
    const save = h('button', { type: 'button', class: 'pill primary', 'data-terrain': 'save' }, L('Save', 'Guardar')) as HTMLButtonElement;
    const prog = h('div', { class: 'terrain-prog', hidden: true });
    const z0 = () => Math.max(4, top - 6);
    const update = () => {
      const p = plan(box, z0(), top, [...sources]);
      const n = p.list.length;
      est.textContent = n > MAX_TILES
        ? L(`Too large: ${n.toLocaleString('en-GB')} tiles. Zoom in, or choose less detail.`, `Demasiado grande: ${n.toLocaleString('es-ES')} mosaicos. Acércate o elige menos detalle.`)
        : L(`${n.toLocaleString('en-GB')} tiles, about ${fmtBytes(p.estimate)}.`, `${n.toLocaleString('es-ES')} mosaicos, unos ${fmtBytes(p.estimate, true)}.`);
      est.classList.toggle('bad', n > MAX_TILES || !n);
      save.disabled = n > MAX_TILES || !n;
    };
    const drawLevels = () => {
      clear(levelRow);
      const seen = new Set<number>();
      for (const [lz, label] of levels) {
        if (seen.has(lz)) continue;
        seen.add(lz);
        const b = h('button', { type: 'button', class: `chip${top === lz ? ' on' : ''}`, 'data-level': String(lz) }, `${label} · ${groundSize(lz, v.lat)}`);
        b.addEventListener('click', () => { top = lz; drawLevels(); update(); });
        levelRow.append(b);
      }
    };
    srcRow.append(
      toggle(sources.has(TERRAIN.id), (on) => { if (on) sources.add(TERRAIN.id); else sources.delete(TERRAIN.id); update(); }, L('Relief and elevation (heights)', 'Relieve y altitud (alturas)')),
      toggle(sources.has(SENTINEL.id), (on) => { if (on) sources.add(SENTINEL.id); else sources.delete(SENTINEL.id); update(); }, L('Satellite (Sentinel-2)', 'Satélite (Sentinel-2)')));
    drawLevels(); update();
    const conn = connection();
    let ctrl: AbortController | null = null;
    save.addEventListener('click', () => void (async () => {
      ctrl = new AbortController();
      save.disabled = true;
      prog.hidden = false;
      const bar = h('div', { class: 'prog-bar' }, h('span', { style: 'width:0%' }));
      const txt = h('div', { class: 'small' });
      const cancel = h('button', { type: 'button', class: 'pill sm' }, L('Cancel', 'Cancelar'));
      cancel.addEventListener('click', () => ctrl?.abort());
      clear(prog); prog.append(bar, txt, h('div', { class: 'tool-actions' }, cancel));
      const res = await saveArea({ name, box, z0: z0(), z1: top, sources: [...sources] }, (p) => {
        (bar.firstChild as HTMLElement).style.width = `${Math.round((p.done / Math.max(1, p.total)) * 100)}%`;
        txt.textContent = L(`Saving ${p.done.toLocaleString('en-GB')} of ${p.total.toLocaleString('en-GB')} tiles · ${fmtBytes(p.bytes)}`, `Guardando ${p.done.toLocaleString('es-ES')} de ${p.total.toLocaleString('es-ES')} mosaicos · ${fmtBytes(p.bytes, true)}`);
      }, ctrl.signal);
      if (!res) { this.shell.toast(L('Saving cancelled.', 'Guardado cancelado.')); this.openSave(); return; }
      this.shell.toast(L(`Saved: ${res.name.en} (${fmtBytes(res.bytes)})`, `Guardada: ${res.name.es} (${fmtBytes(res.bytes, true)})`), 4000);
      this.openSave();
    })());
    const add = (...els: (HTMLElement | null)[]) => { for (const x of els) if (x) body.append(x); };
    add(
      h('p', { class: 'terrain-name' }, `📍 ${es() ? name.es : name.en}`),
      h('p', { class: 'muted small' }, L('The detailed tiles of the map on screen are kept on this device, so this area stays sharp without a connection: on a trip, or in ambient mode.', 'Los mosaicos detallados del mapa en pantalla se guardan en este dispositivo, para que la zona siga nítida sin conexión: de viaje o en el modo ambiente.')),
      h('h3', { class: 'sec-title' }, L('Detail', 'Detalle')), levelRow,
      h('h3', { class: 'sec-title' }, L('What to keep', 'Qué guardar')), srcRow,
      est,
      conn === 'cellular' ? h('p', { class: 'muted small' }, L('You are on mobile data.', 'Estás usando datos móviles.')) : null,
      h('div', { class: 'tool-actions' }, save), prog,
      h('h3', { class: 'sec-title' }, L('Saved areas', 'Zonas guardadas')), savedList(this.app, () => this.openSave()));
  }
}

/** The saved areas, each with its size, a button to show it and one to delete it. */
export function savedList(app: App, refresh: () => void): HTMLElement {
  const list = areas();
  const el = h('div', { class: 'saved-areas' });
  if (!list.length) { el.append(h('p', { class: 'muted small' }, L('None yet.', 'Ninguna todavía.'))); return el; }
  for (const a of list) {
    const show = h('button', { type: 'button', class: 'pill sm' }, L('Show', 'Ver'));
    show.addEventListener('click', () => showArea(app, a));
    const del = h('button', { type: 'button', class: 'pill sm', 'data-delete': a.id }, L('Delete', 'Borrar'));
    del.addEventListener('click', () => void (async () => {
      if (!confirm(L(`Delete "${a.name.en}" from this device?`, `¿Borrar «${a.name.es}» de este dispositivo?`))) return;
      await deleteArea(a.id);
      refresh();
    })());
    const what = [a.sources.includes(TERRAIN.id) ? L('heights', 'alturas') : '', a.sources.includes(SENTINEL.id) ? L('satellite', 'satélite') : ''].filter(Boolean).join(' + ');
    el.append(h('div', { class: 'saved-area', 'data-area': a.id },
      h('div', { class: 'saved-text' }, h('strong', null, es() ? a.name.es : a.name.en),
        h('span', { class: 'muted small' }, `${what} · ${fmtBytes(a.bytes, es())} · ${a.tiles.toLocaleString(es() ? 'es-ES' : 'en-GB')} ${L('tiles', 'mosaicos')} · ${a.date}`)),
      h('div', { class: 'saved-btns' }, show, del)));
  }
  return el;
}

function showArea(app: App, a: SavedArea) {
  const [w, s, e, n] = a.box;
  const lon = w <= e ? (w + e) / 2 : ((w + e + 360) / 2 + 540) % 360 - 180;
  app.renderer.view.flyTo({ lon, lat: (s + n) / 2 }, 1400);
  app.renderer.requestRender();
}

/** The settings' section: detail on or off, only on Wi-Fi (with what the device says), downloads, saved areas. */
export function terrainSettings(app: App, reopen: () => void): HTMLElement {
  const conn = connection();
  const connText = conn === 'wifi' ? L('This device says it is on Wi-Fi.', 'Este dispositivo dice que está en wifi.')
    : conn === 'cellular' ? L('This device says it is on mobile data.', 'Este dispositivo dice que usa datos móviles.')
      : conn === 'offline' ? L('This device is offline: only saved areas are sharp.', 'Este dispositivo no tiene conexión: solo las zonas guardadas se ven nítidas.')
        : L('This browser does not say how it is connected (iPhones and computers do not): turn detail off by hand on mobile data.', 'Este navegador no dice cómo está conectado (los iPhone y las computadoras no lo dicen): apaga el detalle a mano con datos móviles.');
  const counter = h('span', null, `${L('Downloaded', 'Descargado')}: ${fmtBytes(stats.session, es())} ${L('this visit', 'en esta visita')} · ${fmtBytes(prefs.total, es())} ${L('in all', 'en total')}`);
  const reset = h('button', { type: 'button', class: 'pill sm' }, L('Reset', 'Poner a cero'));
  reset.addEventListener('click', () => { prefs.total = 0; stats.session = 0; savePrefs(); reopen(); });
  const saveBtn = h('button', { type: 'button', class: 'pill sm', 'data-terrain': 'open-save' }, L('Save the area on screen…', 'Guardar la zona en pantalla…'));
  saveBtn.addEventListener('click', () => terrainActions.save());
  return h('div', { class: 'terrain-settings' },
    h('div', { class: 'toggles' },
      toggle(prefs.detail, (v) => { prefs.detail = v; savePrefs(); if (!v) tiles.clear(); app.syncMaxZoom(); app.renderer.requestRender(); }, L('Sharper relief, elevation and satellite when zoomed in', 'Relieve, altitud y satélite más nítidos al acercarte')),
      toggle(prefs.wifiOnly, (v) => { prefs.wifiOnly = v; savePrefs(); app.renderer.requestRender(); }, L('Only on Wi-Fi', 'Solo con wifi'))),
    h('p', { class: 'muted small' }, connText),
    h('div', { class: 'prog-row' }, counter, reset),
    h('h3', { class: 'sec-title' }, L('Saved areas for offline use', 'Zonas guardadas sin conexión')),
    savedList(app, reopen),
    h('div', { class: 'tool-actions' }, saveBtn));
}
