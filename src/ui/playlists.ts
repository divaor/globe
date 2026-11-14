// Screensaver playlists for ambient mode: ready-made runs of filters and places, each with a line to read aloud,
// and the reader's own playlist (views added from the map, kept in this browser, shareable as a link).
import { ArrowUp, ArrowDown, X, Plus, Play, Share2 } from 'lucide';
import { h, icon, toggle, slider } from './dom';
import { tx } from '../app/i18n';
import type { App } from '../app/app';
import type { I18nText } from '../layers/types';
import type { ProjectionId } from '../engine/projections';
import { canSpeak } from './narrator';

export interface PlayItem {
  /** The filters, bottom first, and their options. */
  stack: string[];
  options?: Record<string, Record<string, string | boolean>>;
  projection?: ProjectionId;
  /** A place to look at: longitude, latitude, zoom (the globe sways gently around it). Else the globe turns. */
  fly?: [number, number, number];
  /** Shown while it plays; else the top filter's name. */
  title?: I18nText;
  /** Read aloud (and shown under the title); else the top filter's description. */
  say?: I18nText;
}
export interface Playlist { id: string; icon: string; name: I18nText; desc: I18nText; items: PlayItem[] }

const T = (en: string, es: string): I18nText => ({ en, es });
const WHERE_PEOPLE = T('Where people live. Most of humanity lives on a small part of the land.', 'Dónde vive la gente. La mayor parte de la humanidad vive en una pequeña parte de la tierra.');
const SEA = T('Sea temperature, and the great ocean currents that carry heat around the planet.', 'La temperatura del mar y las grandes corrientes que llevan calor por todo el planeta.');
const ZONES = T('Time zones, with the local time in each right now.', 'Los husos horarios, con la hora local de cada uno ahora mismo.');

export const PLAYLISTS: Playlist[] = [
  {
    id: 'planet', icon: '🌍', name: T('Our planet', 'Nuestro planeta'), desc: T('The Earth’s great patterns, one after another.', 'Los grandes patrones de la Tierra, uno tras otro.'),
    items: [
      { stack: ['political'], say: T('The countries of the world, in the colours of their continents.', 'Los países del mundo, con los colores de su continente.') },
      { stack: ['satellite', 'daynight'], say: T('The Earth from space, with night where the Sun has set right now.', 'La Tierra vista desde el espacio, con la noche donde el Sol ya se puso en este momento.') },
      { stack: ['timezones'], say: ZONES },
      { stack: ['koppen'], say: T('Climate zones, from tropical rainforest to the ice caps.', 'Las zonas climáticas, de la selva tropical a los casquetes polares.') },
      { stack: ['relief', 'landforms'], say: T('Mountains, plateaus, plains and deserts: the shape of the land.', 'Montañas, mesetas, llanuras y desiertos: la forma de la tierra.') },
      { stack: ['popdensity'], say: WHERE_PEOPLE },
      { stack: ['realms', 'animals'], say: T('The animal realms, and famous animals where they live in the wild.', 'Las regiones zoogeográficas y animales famosos donde viven en libertad.') },
      { stack: ['sst', 'currents'], say: SEA },
    ],
  },
  {
    id: 'night', icon: '🌗', name: T('Night and day', 'La noche y el día'), desc: T('The Earth turning from day to night, live.', 'La Tierra pasando del día a la noche, en vivo.'),
    items: [
      { stack: ['satellite', 'daynight'], say: T('Day and night, live. Dawn and dusk sweep west, about fifteen degrees every hour.', 'El día y la noche, en vivo. El amanecer y el atardecer avanzan hacia el oeste, unos quince grados cada hora.') },
      { stack: ['daynight', 'citylights'], say: T('City lights shine on the night side.', 'Las luces de las ciudades brillan en el lado de noche.') },
      { stack: ['timezones'], say: ZONES },
      { stack: ['satellite', 'daynight', 'iss'], say: T('The International Space Station, live. It goes round the Earth about every ninety minutes.', 'La Estación Espacial Internacional, en vivo. Da la vuelta a la Tierra cada noventa minutos, más o menos.') },
      { stack: ['gibs'], say: T('Yesterday’s Earth, seen by NASA’s satellites, with its clouds and storms.', 'La Tierra de ayer, vista por los satélites de la NASA, con sus nubes y tormentas.') },
      { stack: ['weather'], say: T('The weather now, in big cities around the world.', 'El clima ahora, en grandes ciudades de todo el mundo.') },
    ],
  },
  {
    id: 'restless', icon: '🌋', name: T('Restless Earth', 'La Tierra inquieta'), desc: T('Plates, volcanoes, earthquakes and the mountains they raise.', 'Placas, volcanes, terremotos y las montañas que levantan.'),
    items: [
      { stack: ['relief', 'plates'], say: T('The tectonic plates. The Earth’s shell is broken into pieces that move a few centimetres a year.', 'Las placas tectónicas. La corteza de la Tierra está rota en piezas que se mueven unos centímetros al año.') },
      { stack: ['relief', 'plates', 'volcanoes'], say: T('Volcanoes. Many ring the Pacific Ocean, along the Ring of Fire.', 'Los volcanes. Muchos rodean el océano Pacífico, en el Cinturón de Fuego.') },
      { stack: ['relief', 'plates', 'quakes'], say: T('The earthquakes of the last days, live. Most happen where plates meet.', 'Los terremotos de los últimos días, en vivo. La mayoría ocurre donde se encuentran las placas.') },
      { stack: ['relief', 'landforms'], fly: [-70, -20, 2.4], say: T('The Andes, still rising where the Nazca Plate slides under South America.', 'Los Andes, que siguen elevándose donde la placa de Nazca se hunde bajo Sudamérica.') },
      { stack: ['relief', 'landforms'], fly: [85, 29, 2.6], say: T('The Himalayas, raised by India pushing into Asia.', 'El Himalaya, levantado por la India al empujar contra Asia.') },
    ],
  },
  {
    id: 'water', icon: '🌊', name: T('Water and weather', 'Agua y clima'), desc: T('Rain, heat, wind, seas and rivers.', 'Lluvia, calor, viento, mares y ríos.'),
    items: [
      { stack: ['precipitation'], say: T('Rain and snow in a year. The wettest lands lie near the equator.', 'La lluvia y la nieve de un año. Las tierras más húmedas están cerca del ecuador.') },
      { stack: ['temperature'], say: T('The average temperature of a year, on land and sea.', 'La temperatura media de un año, en tierra y mar.') },
      { stack: ['satellite', 'winds'], say: T('The prevailing winds: the trade winds, the westerlies and the monsoons.', 'Los vientos dominantes: los alisios, los vientos del oeste y los monzones.') },
      { stack: ['sst', 'currents'], say: SEA },
      { stack: ['satellite', 'rivers'], fly: [-60, -4, 2.4], say: T('The Amazon, which carries more water than any other river.', 'El Amazonas, que lleva más agua que cualquier otro río.') },
      { stack: ['satellite', 'rivers'], fly: [31, 20, 2.2], say: T('The Nile, flowing north across the Sahara to the Mediterranean.', 'El Nilo, que corre hacia el norte a través del Sahara hasta el Mediterráneo.') },
    ],
  },
  {
    id: 'life', icon: '🐾', name: T('Life on Earth', 'La vida en la Tierra'), desc: T('Forests, deserts and the animals that live there.', 'Bosques, desiertos y los animales que los habitan.'),
    items: [
      { stack: ['vegetation'], say: T('What grows where: rainforest, savanna, desert, forest, taiga and tundra.', 'Qué crece dónde: selva, sabana, desierto, bosque, taiga y tundra.') },
      { stack: ['realms'], say: T('The animal realms: regions whose animals share a long history.', 'Las regiones zoogeográficas: zonas cuyos animales comparten una larga historia.') },
      { stack: ['vegetation', 'animals'], say: T('Famous animals where they live in the wild.', 'Animales famosos donde viven en libertad.') },
      { stack: ['satellite', 'migrations'], say: T('Great migrations: terns, monarch butterflies, whales and wildebeest.', 'Las grandes migraciones: charranes, mariposas monarca, ballenas y ñus.') },
      { stack: ['hotspots'], say: T('Biodiversity hotspots: places with many species found nowhere else, and under threat.', 'Los puntos calientes de biodiversidad: lugares con muchas especies que no viven en ningún otro sitio, y amenazadas.') },
      { stack: ['national-animals'], say: T('Each country’s national animal.', 'El animal nacional de cada país.') },
    ],
  },
  {
    id: 'people', icon: '👥', name: T('People and cultures', 'Pueblos y culturas'), desc: T('How many we are, where we live, what we speak.', 'Cuántos somos, dónde vivimos, qué hablamos.'),
    items: [
      { stack: ['population'], say: T('How many people live in each country.', 'Cuántas personas viven en cada país.') },
      { stack: ['popdensity'], say: WHERE_PEOPLE },
      { stack: ['languages'], say: T('The main language of each country.', 'La lengua principal de cada país.') },
      { stack: ['fact-life_expectancy'], say: T('How long people live, on average, in each country.', 'Cuánto vive la gente, en promedio, en cada país.') },
      { stack: ['heritage'], say: T('World Heritage: places UNESCO protects for all of humanity.', 'El Patrimonio Mundial: lugares que la UNESCO protege para toda la humanidad.') },
      { stack: ['flags'], say: T('The flags of the world.', 'Las banderas del mundo.') },
    ],
  },
  {
    id: 'latam', icon: '🌎', name: T('Around Latin America', 'Por América Latina'), desc: T('From Mexico to Tierra del Fuego.', 'De México a Tierra del Fuego.'),
    items: [
      { stack: ['political'], fly: [-75, -12, 1.6], say: T('Latin America, from Mexico to Tierra del Fuego.', 'América Latina, de México a Tierra del Fuego.') },
      { stack: ['relief', 'landforms'], fly: [-70, -20, 2.2], say: T('The Andes, the longest mountain range on land: about seven thousand kilometres.', 'Los Andes, la cordillera terrestre más larga: unos siete mil kilómetros.') },
      { stack: ['vegetation', 'rivers'], fly: [-62, -5, 2.4], say: T('The Amazon rainforest, the largest on Earth.', 'La selva amazónica, la más grande de la Tierra.') },
      { stack: ['relief', 'plates', 'volcanoes'], fly: [-85, 5, 1.9], say: T('Volcanoes along the Pacific coast, from Mexico to Chile.', 'Volcanes a lo largo de la costa del Pacífico, de México a Chile.') },
      { stack: ['languages'], fly: [-75, -12, 1.6], say: T('Spanish and Portuguese are the main languages, alongside hundreds of Indigenous languages.', 'El español y el portugués son las lenguas principales, junto a cientos de lenguas indígenas.') },
      { stack: ['heritage'], fly: [-80, -2, 1.8], say: T('World Heritage, from Teotihuacan to Machu Picchu.', 'El Patrimonio Mundial, de Teotihuacan a Machu Picchu.') },
      { stack: ['satellite', 'daynight'], fly: [-70, -12, 1.4], say: T('The continent from space.', 'El continente visto desde el espacio.') },
    ],
  },
];

// ---- The reader's playlist ------------------------------------------------------------------------
const KEY = 'atlas-playlist';
export function myItems(): PlayItem[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function saveMine(items: PlayItem[]) { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* not kept */ } }

export const MINE_ID = 'mine';
export function playlist(id: string): Playlist | null {
  if (id === MINE_ID) {
    const items = myItems();
    return items.length ? { id: MINE_ID, icon: '⭐', name: T('My playlist', 'Mi lista'), desc: T('The views you added.', 'Las vistas que agregaste.'), items } : null;
  }
  return PLAYLISTS.find((p) => p.id === id) ?? null;
}

/** The view on screen as a playlist item: its filters and their options, the projection and the place. */
export function currentView(app: App): PlayItem {
  const layers = app.layers.filter((l) => !l.def.hidden);
  const options: Record<string, Record<string, string | boolean>> = {};
  for (const l of layers) {
    const changed = Object.fromEntries(Object.entries(l.options).filter(([k, v]) => l.def.options?.find((o) => o.id === k)?.default !== v));
    if (Object.keys(changed).length) options[l.def.id] = changed;
  }
  const v = app.renderer.view;
  const top = layers[layers.length - 1];
  return {
    stack: layers.map((l) => l.def.id),
    ...(Object.keys(options).length ? { options } : {}),
    ...(app.projection !== 'globe' ? { projection: app.projection } : {}),
    ...(v.zoom > 1.3 ? { fly: [Math.round(v.lon * 100) / 100, Math.round(v.lat * 100) / 100, Math.round(v.zoom * 100) / 100] as [number, number, number] } : {}),
    ...(top ? { title: top.def.name } : {}),
  };
}

/** A link that opens the screensaver with a playlist (the reader's own travels inside the link). */
export function playlistLink(app: App, id: string): string {
  const base = `${location.origin}${location.pathname}`;
  if (id !== MINE_ID) return `${base}#ambient=1&playlist=${id}&lang=${app.lang}`;
  const json = JSON.stringify(myItems().map((it) => ({ ...it, title: undefined })));
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${base}#ambient=1&mine=${b64}&lang=${app.lang}`;
}

/** Reads a shared playlist from the address (#mine=...): it becomes the reader's own. */
export function playlistFromLink(hash: string): boolean {
  const m = /[#&]mine=([A-Za-z0-9_-]+)/.exec(hash);
  if (!m) return false;
  try {
    const b = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
    const items = JSON.parse(new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)))) as PlayItem[];
    if (!Array.isArray(items) || !items.every((it) => Array.isArray(it.stack))) return false;
    saveMine(items.slice(0, 40));
    return true;
  } catch { return false; }
}

/** The title of an item: its own, else its top filter's name. */
export function itemTitle(app: App, it: PlayItem): string {
  if (it.title) return tx(it.title);
  const d = app.registry.get(it.stack[it.stack.length - 1]);
  return d ? `${d.icon} ${tx(d.name)}` : '';
}
/** What an item reads aloud: its own words, else its top filter's name and description. */
export function itemWords(app: App, it: PlayItem): string {
  if (it.say) return tx(it.say);
  const d = app.registry.get(it.stack[it.stack.length - 1]);
  return d ? `${tx(d.name)}. ${tx(d.desc)}` : '';
}

// ---- The panel --------------------------------------------------------------------------------------
/** The screensaver panel: playlists to start, the reader's own (add this view, order, remove, share), and the
 * screensaver's settings. `start` starts ambient mode with a playlist ('' for just the filters on the map). */
export function screensaverPanel(app: App, start: (id: string) => void, toast: (msg: string) => void): HTMLElement {
  const es = app.lang === 'es';
  const root = h('div', { class: 'ss' });
  const render = () => {
    root.replaceChildren();
    const card = (id: string, ic: string, name: string, desc: string, n?: number) => {
      const b = h('button', { type: 'button', class: `ss-card${app.ambient.playlist === id ? ' on' : ''}`, 'data-playlist': id },
        h('span', { class: 'ss-icon' }, ic),
        h('span', { class: 'ss-text' }, h('span', { class: 'ss-name' }, name), h('span', { class: 'ss-desc' }, desc)),
        n ? h('span', { class: 'ss-count' }, `${n}`) : null,
        h('span', { class: 'ss-play' }, icon(Play, 16)));
      b.addEventListener('click', () => start(id));
      return b;
    };
    root.append(h('div', { class: 'ss-grid' },
      card('', '🖼️', es ? 'Solo mis filtros' : 'Just my filters', es ? 'El globo gira con los filtros que tienes puestos.' : 'The globe turns with the filters you have on.'),
      ...PLAYLISTS.map((p) => card(p.id, p.icon, tx(p.name), tx(p.desc), p.items.length)),
    ));
    // The reader's own playlist.
    const mine = myItems();
    const add = h('button', { type: 'button', class: 'pill primary' }, icon(Plus, 16), es ? 'Agregar esta vista' : 'Add this view');
    add.addEventListener('click', () => {
      const it = currentView(app);
      if (!it.stack.length) return;
      saveMine([...myItems(), it].slice(0, 40));
      toast(es ? 'Vista agregada a tu lista' : 'View added to your playlist');
      render();
    });
    const rows = mine.map((it, i) => {
      const move = (d: -1 | 1) => { const l = myItems(); const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; saveMine(l); render(); };
      const btn = (ic: Parameters<typeof icon>[0], label: string, fn: () => void) => { const b = h('button', { type: 'button', class: 'icon-btn sm', title: label, 'aria-label': label }, icon(ic, 15)); b.addEventListener('click', fn); return b; };
      return h('div', { class: 'ss-row' },
        h('span', { class: 'ss-row-name' }, itemTitle(app, it), it.fly ? h('span', { class: 'muted small' }, ` · ${it.fly[1].toFixed(0)}°, ${it.fly[0].toFixed(0)}°`) : null),
        btn(ArrowUp, es ? 'Subir' : 'Up', () => move(-1)), btn(ArrowDown, es ? 'Bajar' : 'Down', () => move(1)),
        btn(X, es ? 'Quitar' : 'Remove', () => { const l = myItems(); l.splice(i, 1); saveMine(l); render(); }));
    });
    const share = h('button', { type: 'button', class: 'pill' }, icon(Share2, 16), es ? 'Compartir' : 'Share');
    share.addEventListener('click', async () => {
      const url = playlistLink(app, MINE_ID);
      try { await navigator.clipboard.writeText(url); toast(es ? 'Enlace copiado' : 'Link copied'); } catch { prompt(es ? 'Copia el enlace:' : 'Copy the link:', url); }
    });
    root.append(
      h('h3', { class: 'sec-title' }, es ? 'Mi lista' : 'My playlist'),
      h('p', { class: 'muted small' }, es
        ? 'Pon filtros, mueve el globo a un lugar y agrégalo. Tu lista se guarda en este navegador.'
        : 'Turn on filters, move the globe to a place, and add it. Your playlist is kept in this browser.'),
      ...(mine.length ? [h('div', { class: 'ss-rows' }, ...rows)] : []),
      h('div', { class: 'settings-actions' }, add, mine.length ? card(MINE_ID, '⭐', es ? 'Reproducir mi lista' : 'Play my playlist', `${mine.length} ${es ? (mine.length === 1 ? 'vista' : 'vistas') : (mine.length === 1 ? 'view' : 'views')}`) : null, mine.length ? share : null),
    );
    // Settings.
    const amb = app.ambient;
    root.append(
      h('h3', { class: 'sec-title' }, es ? 'Ajustes' : 'Settings'),
      h('div', { class: 'field' }, h('div', { class: 'field-label' }, es ? 'Segundos en cada vista: ' : 'Seconds on each view: ', h('span', { class: 'ss-secs' }, String(amb.secs))),
        slider(amb.secs, 15, 120, 5, (v) => { amb.secs = v; app.save(); const l = root.querySelector('.ss-secs'); if (l) l.textContent = String(v); })),
      h('div', { class: 'field' }, h('div', { class: 'field-label' }, es ? 'Velocidad de giro' : 'Rotation speed'), slider(amb.speed, 0.25, 4, 0.25, (v) => { amb.speed = v; app.save(); })),
      h('div', { class: 'toggles' },
        ...(canSpeak() ? [toggle(amb.narrate, (v) => { amb.narrate = v; app.save(); }, es ? 'Leer cada vista en voz alta' : 'Read each view aloud')] : []),
        toggle(amb.clock, (v) => { amb.clock = v; app.save(); }, es ? 'Mostrar el reloj' : 'Show the clock')),
    );
  };
  render();
  return root;
}
