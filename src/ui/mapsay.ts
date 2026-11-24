// The map in words (v0.47.0): what a screen reader hears on the map. The map's canvas carries a description of what it
// shows (the projection, the place in the middle, how close, the filters that are on, the chosen country, the year
// when travelling in time), kept up to date once the map settles. After a move by keyboard, a change of filters or of
// projection, the description is also read out (politely, once the map stops), so a reader who cannot see the globe
// knows where it went.
import type { App } from '../app/app';
import { h } from './dom';
import { t, tx, nm, L } from '../app/i18n';
import { oceanAt, OCEAN_NAMES } from '../ocean/depth';

/** How close the map is, in words, from the web-map zoom level. */
function closeness(webZoom: number): string {
  if (webZoom < 2.2) return L('the whole Earth', 'toda la Tierra');
  if (webZoom < 4) return L('a region', 'una región');
  if (webZoom < 6.5) return L('a country', 'un país');
  return L('a small area', 'una zona pequeña');
}

/** The map described in a sentence or two. */
export function describeMap(app: App): string {
  const r = app.renderer, v = r.view;
  const parts: string[] = [];
  if (app.mode === 'world') parts.push(L('A map of another world.', 'Un mapa de otro mundo.'));
  else {
    const [lon, lat] = v.center();
    const id = r.countryAt(lon, lat);
    const m = id ? app.data.meta[id] : null;
    const where = m ? nm(m.n, m.es) : OCEAN_NAMES[oceanAt(lon, lat)]();
    parts.push(L('{0} map, centred on {1}, showing {2}.', '{0}: mapa centrado en {1}, que muestra {2}.', t(`proj.${app.projection}`), where, closeness(v.webZoom)));
  }
  const year = document.querySelector<HTMLElement>('.timebar:not([hidden]) .tb-year')?.textContent?.trim();
  if (app.mode && year) parts.push(L('Time: {0}.', 'Tiempo: {0}.', year));
  const on = app.layers.filter((l) => !l.def.hidden && l.def.id !== 'political' && l.def.id !== 'world').map((l) => tx(l.def.name));
  if (on.length) parts.push(L('Showing: {0}.', 'Se muestra: {0}.', on.join(', ')));
  const sel = app.selection ? app.data.meta[app.selection] : null;
  if (sel) parts.push(L('Chosen: {0}.', 'Elegido: {0}.', nm(sel.n, sel.es)));
  return parts.join(' ');
}

/** Keeps the map's description current and reads out changes the reader made. */
export function mapSay(app: App) {
  const canvas = document.getElementById('fg');
  if (!canvas) return;
  canvas.setAttribute('tabindex', '0');
  const live = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite', 'data-mapsay': '' });
  document.body.append(live);
  const help = () => L('Arrow keys move the map; plus and minus zoom.', 'Las flechas mueven el mapa; más y menos acercan o alejan.');
  let timer = 0, said = '', speak = false;
  const update = () => {
    timer = 0;
    const text = describeMap(app);
    canvas.setAttribute('aria-label', `${text} ${help()}`);
    // Read out only what the reader changed, and not while the screensaver turns the globe.
    if (speak && text !== said && !app.ambient.on) { live.textContent = text; said = text; }
    speak = false;
  };
  const soon = (spoken = false, ms = 900) => {
    speak = speak || spoken;
    clearTimeout(timer);
    timer = window.setTimeout(update, ms);
  };
  app.on('layers', () => soon(true));
  app.on('projection', () => soon(true, 1600));
  app.on('select', () => soon());
  app.on('lang', () => { said = ''; soon(); });
  app.on('interactEnd', () => soon());
  window.addEventListener('keydown', (e) => {
    if (/^(Arrow|\+|-|=|_)/.test(e.key) && (document.activeElement === canvas || document.activeElement === document.body)) soon(true, 1200);
  });
  update();
}
