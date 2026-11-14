// The other worlds the globe can show: their maps (built by scripts/data/space/build-worlds.mjs into data/worlds/),
// the NASA Solar System Treks tiles that sharpen them as you zoom in, the Moon's and Mars's heights for the 3D view,
// how each looks from space (a haze or none), and the facts researched for each (data/worlds/facts.json).
import { dataUrl, loadJSON } from '../data/store';
import { addSource, type TileSource } from '../engine/tiles';
import { lang } from '../app/i18n';

export type Text = { en: string; es: string };
export const tr = (t: Text | undefined) => (t ? (lang() === 'es' ? t.es : t.en) : '');
export const L = (en: string, es: string) => (lang() === 'es' ? es : en);

/** One way to see a world: a map file (hi, lo resolution) and, for some, tiles that sharpen it when zoomed in. */
export interface WorldMap {
  id: 'photo' | 'elev' | 'clouds';
  /** File names in data/worlds/: the sharper one for computers, the other for small devices. */
  hi?: string; lo: string;
  credit: string;
  /** Trek tiles: from this zoom on they are sharper than the map file. */
  detail?: { src: TileSource; zStart: number };
}

export interface WorldDef {
  id: string;
  name: Text;
  kind: 'planet' | 'moon' | 'dwarf' | 'asteroid';
  parent: string;
  /** Mean radius, km. */
  radius: number;
  maps: WorldMap[];
  /** Heights for the 3D view (Terrarium tiles on a longitude/latitude grid). */
  heights?: TileSource;
  /** The IAU names of its places (data/worlds/<id>-names.json). */
  names: boolean;
  /** The glow of its atmosphere seen from space, or none. */
  glow: string | null;
  /** Where the camera looks first. */
  face: [number, number];
  /** What a reader should know before tapping: the map's gaps (Pluto's unseen south) and so on. */
  note?: Text;
}

const trek = (id: string, body: string, layer: string, ext: 'jpg' | 'png', maxZoom: number, credit: string): TileSource => {
  const src: TileSource = {
    id, kind: 'rgb', scheme: 'geo', minZoom: 0, maxZoom, credit,
    url: (z, x, y) => `https://trek.nasa.gov/tiles/${body}/EQ/${layer}/1.0.0/default/default028mm/${z}/${y}/${x}.${ext}`,
  };
  addSource(src);
  return src;
};
const heights = (id: string): TileSource => {
  const src: TileSource = { id: `${id}-h`, kind: 'terrarium', scheme: 'geo', minZoom: 0, maxZoom: 3, credit: '', url: (z, x, y) => dataUrl(`worlds/${id}/h/${z}/${y}/${x}.webp`) };
  addSource(src);
  return src;
};

const TREK = 'NASA Solar System Treks (trek.nasa.gov)';
const USGS = 'USGS Astrogeology Science Center';
const SSS = 'Solar System Scope (CC BY 4.0)';

export const WORLDS: WorldDef[] = [
  {
    id: 'mercury', name: { en: 'Mercury', es: 'Mercurio' }, kind: 'planet', parent: 'sun', radius: 2439.4, names: true, glow: null, face: [160, 20],
    maps: [{ id: 'photo', hi: 'mercury-4k.jpg', lo: 'mercury-2k.jpg', credit: `MESSENGER MDIS global mosaic (NASA/JHUAPL/Carnegie), via ${TREK}`,
      detail: { src: trek('mercury', 'Mercury', 'Mercury_MESSENGER_mosaic_global_250m_2013', 'png', 7, 'MESSENGER (NASA/JHUAPL/Carnegie) via NASA Trek'), zStart: 4 } }],
  },
  {
    id: 'venus', name: { en: 'Venus', es: 'Venus' }, kind: 'planet', parent: 'sun', radius: 6051.8, names: true, glow: 'rgba(255,214,140,0.62)', face: [100, 0],
    note: { en: 'Thick clouds hide the ground: this map was made by the radar of NASA\'s Magellan probe, colourised.', es: 'Unas nubes espesas ocultan el suelo: este mapa lo hizo el radar de la sonda Magallanes de la NASA, coloreado.' },
    maps: [
      { id: 'photo', hi: 'venus-4k.jpg', lo: 'venus-2k.jpg', credit: `Magellan radar mosaic, colourised (NASA/JPL, USGS), via ${TREK}`,
        detail: { src: trek('venus', 'Venus', 'Venus_Magellan_C3-MDIR_Colorized_Global_Mosaic_4641m', 'png', 4, 'Magellan (NASA/JPL/USGS) via NASA Trek'), zStart: 4 } },
      { id: 'clouds', lo: 'venus-clouds-2k.jpg', credit: SSS },
    ],
  },
  {
    id: 'moon', name: { en: 'The Moon', es: 'La Luna' }, kind: 'moon', parent: 'earth', radius: 1737.4, names: true, glow: null, face: [0, 8],
    heights: heights('moon'),
    maps: [
      { id: 'photo', hi: 'moon-4k.jpg', lo: 'moon-2k.jpg', credit: `LRO Wide Angle Camera mosaic (NASA/GSFC/Arizona State University), via ${TREK}`,
        detail: { src: trek('moon', 'Moon', 'LRO_WAC_Mosaic_Global_303ppd_v02', 'jpg', 8, 'LRO WAC (NASA/GSFC/ASU) via NASA Trek'), zStart: 4 } },
      { id: 'elev', lo: 'moon-elev-2k.jpg', credit: `LRO LOLA heights, colour-shaded (NASA/GSFC), via ${TREK}`,
        detail: { src: trek('moon-elev', 'Moon', 'LRO_LOLA_ClrShade_Global_256ppd_v06', 'png', 6, 'LRO LOLA (NASA/GSFC) via NASA Trek'), zStart: 3 } },
    ],
  },
  {
    id: 'mars', name: { en: 'Mars', es: 'Marte' }, kind: 'planet', parent: 'sun', radius: 3389.5, names: true, glow: 'rgba(235,160,120,0.40)', face: [-70, 0],
    heights: heights('mars'),
    maps: [
      { id: 'photo', hi: 'mars-4k.jpg', lo: 'mars-2k.jpg', credit: `Viking MDIM 2.1 colour mosaic (NASA/USGS), via ${TREK}`,
        detail: { src: trek('mars', 'Mars', 'Mars_Viking_MDIM21_ClrMosaic_global_232m', 'jpg', 7, 'Viking MDIM 2.1 (NASA/USGS) via NASA Trek'), zStart: 4 } },
      { id: 'elev', lo: 'mars-elev-2k.jpg', credit: `MGS MOLA heights, colour-shaded (NASA/GSFC), via ${TREK}`,
        detail: { src: trek('mars-elev', 'Mars', 'Mars_MGS_MOLA_ClrShade_merge_global_463m', 'jpg', 7, 'MGS MOLA (NASA/GSFC) via NASA Trek'), zStart: 3 } },
    ],
  },
  {
    id: 'ceres', name: { en: 'Ceres', es: 'Ceres' }, kind: 'dwarf', parent: 'sun', radius: 469.7, names: true, glow: null, face: [-120, 15],
    maps: [{ id: 'photo', hi: 'ceres-4k.jpg', lo: 'ceres-2k.jpg', credit: `Dawn Framing Camera global mosaic (NASA/JPL/DLR), ${USGS}` }],
  },
  {
    id: 'vesta', name: { en: 'Vesta', es: 'Vesta' }, kind: 'asteroid', parent: 'sun', radius: 262.7, names: true, glow: null, face: [0, -20],
    note: { en: 'Vesta is not round: here its map is laid on a ball. Black patches near the north pole were in shadow when Dawn visited.', es: 'Vesta no es redondo: aquí su mapa cubre una esfera. Las manchas negras cerca del polo norte estaban en sombra cuando la visitó la Dawn.' },
    maps: [{ id: 'photo', lo: 'vesta-2k.jpg', credit: `Dawn true-colour mosaic (NASA/JPL/DLR), via ${TREK}`,
      detail: { src: trek('vesta', 'Vesta', 'Vesta_Dawn_HAMO_TrueClr_DLR_global_74ppd_IAU', 'png', 6, 'Dawn (NASA/JPL/DLR) via NASA Trek'), zStart: 3 } }],
  },
  {
    id: 'jupiter', name: { en: 'Jupiter', es: 'Júpiter' }, kind: 'planet', parent: 'sun', radius: 69911, names: false, glow: 'rgba(240,215,180,0.40)', face: [0, 0],
    note: { en: 'A gas giant: no solid ground, only clouds that change all the time.', es: 'Un gigante gaseoso: no tiene suelo firme, solo nubes que cambian todo el tiempo.' },
    maps: [{ id: 'photo', hi: 'jupiter-4k.jpg', lo: 'jupiter-2k.jpg', credit: `${SSS}, based on NASA mission images` }],
  },
  {
    id: 'io', name: { en: 'Io', es: 'Ío' }, kind: 'moon', parent: 'jupiter', radius: 1821.6, names: true, glow: null, face: [-60, 0],
    maps: [{ id: 'photo', lo: 'io-2k.jpg', credit: `Galileo and Voyager colour mosaic (NASA/JPL/USGS), via ${TREK}`,
      detail: { src: trek('io', 'Io', 'Io_GalileoSSI_Voyager_Global_Mosaic_ClrMerge_1km', 'png', 4, 'Galileo and Voyager (NASA/JPL/USGS) via NASA Trek'), zStart: 3 } }],
  },
  {
    id: 'europa', name: { en: 'Europa', es: 'Europa' }, kind: 'moon', parent: 'jupiter', radius: 1560.8, names: true, glow: null, face: [90, 0],
    maps: [{ id: 'photo', lo: 'europa-2k.jpg', credit: `Galileo and Voyager colour mosaic (NASA/JPL/USGS), via ${TREK}`,
      detail: { src: trek('europa', 'Europa', 'Europa_Voyager_Galileo_Blend_ColorMosaic', 'png', 4, 'Galileo and Voyager (NASA/JPL/USGS) via NASA Trek'), zStart: 3 } }],
  },
  {
    id: 'ganymede', name: { en: 'Ganymede', es: 'Ganimedes' }, kind: 'moon', parent: 'jupiter', radius: 2634.1, names: true, glow: null, face: [-120, 20],
    maps: [{ id: 'photo', lo: 'ganymede-2k.jpg', credit: `Galileo and Voyager colour mosaic (NASA/JPL/USGS), via ${TREK}`,
      detail: { src: trek('ganymede', 'Ganymede', 'Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m', 'png', 4, 'Galileo and Voyager (NASA/JPL/USGS) via NASA Trek'), zStart: 3 } }],
  },
  {
    id: 'callisto', name: { en: 'Callisto', es: 'Calisto' }, kind: 'moon', parent: 'jupiter', radius: 2410.3, names: true, glow: null, face: [-60, 15],
    maps: [{ id: 'photo', hi: 'callisto-4k.jpg', lo: 'callisto-2k.jpg', credit: `Galileo and Voyager global mosaic (NASA/JPL), ${USGS}` }],
  },
  {
    id: 'saturn', name: { en: 'Saturn', es: 'Saturno' }, kind: 'planet', parent: 'sun', radius: 58232, names: false, glow: 'rgba(245,225,180,0.40)', face: [0, 10],
    note: { en: 'A gas giant: no solid ground, only clouds. Its rings are shown in the solar system view.', es: 'Un gigante gaseoso: no tiene suelo firme, solo nubes. Sus anillos se ven en la vista del sistema solar.' },
    maps: [{ id: 'photo', hi: 'saturn-4k.jpg', lo: 'saturn-2k.jpg', credit: `${SSS}, based on NASA mission images` }],
  },
  {
    id: 'titan', name: { en: 'Titan', es: 'Titán' }, kind: 'moon', parent: 'saturn', radius: 2574.7, names: true, glow: 'rgba(225,160,70,0.62)', face: [-100, 0],
    note: { en: 'A thick orange haze hides Titan: Cassini mapped it through the haze in infrared.', es: 'Una bruma naranja y espesa oculta a Titán: la Cassini lo cartografió a través de ella en infrarrojo.' },
    maps: [{ id: 'photo', hi: 'titan-4k.jpg', lo: 'titan-2k.jpg', credit: `Cassini ISS infrared global mosaic (NASA/JPL/Space Science Institute), ${USGS}` }],
  },
  {
    id: 'enceladus', name: { en: 'Enceladus', es: 'Encélado' }, kind: 'moon', parent: 'saturn', radius: 252.1, names: true, glow: null, face: [0, -40],
    maps: [{ id: 'photo', lo: 'enceladus-2k.jpg', credit: `Cassini global mosaic (NASA/JPL/Space Science Institute), via ${TREK}`,
      detail: { src: trek('enceladus', 'Enceladus', 'Enceladus_Cassini_mosaic_global_110m', 'jpg', 5, 'Cassini (NASA/JPL/SSI) via NASA Trek'), zStart: 3 } }],
  },
  {
    id: 'uranus', name: { en: 'Uranus', es: 'Urano' }, kind: 'planet', parent: 'sun', radius: 25362, names: false, glow: 'rgba(170,235,245,0.45)', face: [0, 0],
    note: { en: 'An ice giant wrapped in hazy blue-green clouds, tipped on its side.', es: 'Un gigante helado envuelto en nubes de un azul verdoso, inclinado de costado.' },
    maps: [{ id: 'photo', lo: 'uranus-2k.jpg', credit: SSS }],
  },
  {
    id: 'neptune', name: { en: 'Neptune', es: 'Neptuno' }, kind: 'planet', parent: 'sun', radius: 24622, names: false, glow: 'rgba(110,150,255,0.50)', face: [0, 0],
    note: { en: 'An ice giant with the fastest winds in the solar system.', es: 'Un gigante helado con los vientos más rápidos del sistema solar.' },
    maps: [{ id: 'photo', lo: 'neptune-2k.jpg', credit: SSS }],
  },
  {
    id: 'triton', name: { en: 'Triton', es: 'Tritón' }, kind: 'moon', parent: 'neptune', radius: 1353.4, names: true, glow: null, face: [0, -30],
    note: { en: 'Voyager 2 saw only part of Triton in 1989: the rest of this map is filled in.', es: 'La Voyager 2 vio solo una parte de Tritón en 1989: el resto de este mapa está relleno.' },
    maps: [{ id: 'photo', lo: 'triton-2k.jpg', credit: `Voyager 2 colour mosaic (NASA/JPL), ${USGS}` }],
  },
  {
    id: 'pluto', name: { en: 'Pluto', es: 'Plutón' }, kind: 'dwarf', parent: 'sun', radius: 1188.3, names: true, glow: 'rgba(150,185,255,0.22)', face: [180, 20],
    note: { en: 'New Horizons flew past in 2015 and saw one side well; the far south was in the dark.', es: 'La New Horizons pasó en 2015 y vio bien un lado; el extremo sur estaba a oscuras.' },
    maps: [{ id: 'photo', hi: 'pluto-4k.jpg', lo: 'pluto-2k.jpg', credit: `New Horizons global mosaic (NASA/JHUAPL/SwRI), ${USGS}` }],
  },
  {
    id: 'charon', name: { en: 'Charon', es: 'Caronte' }, kind: 'moon', parent: 'pluto', radius: 606, names: true, glow: null, face: [0, 20],
    maps: [{ id: 'photo', lo: 'charon-2k.jpg', credit: `New Horizons global mosaic (NASA/JHUAPL/SwRI), ${USGS}` }],
  },
];

export const worldById = (id: string) => WORLDS.find((w) => w.id === id);

// ---- facts (researched: data/worlds/facts.json) ---------------------------------------------------

export interface Place { name: Text; iau?: string; at: [number, number]; text: Text }
export interface Facts {
  id: string; name: Text; kind: string; parent: string; radius: number; mass?: number; gravity?: number;
  day?: number; solarDay?: number; year?: number; distance?: number; moons?: number;
  temp?: Text; atmosphere?: Text; discovered?: Text; firstVisit?: Text; text?: Text; wow?: Text;
  places?: Place[]; seas?: { iau: string; en: string; es: string }[]; wiki?: Text;
}
let facts: Promise<Map<string, Facts>> | null = null;
export function loadFacts(): Promise<Map<string, Facts>> {
  facts ??= loadJSON<{ worlds: Facts[] }>('worlds/facts.json').then((d) => new Map(d.worlds.map((w) => [w.id, w]))).catch(() => new Map());
  return facts;
}

// ---- IAU names ---------------------------------------------------------------------------------------

/** One named place: longitude, latitude, IAU name, type code, size (km), what it is named after (index). */
export type NameRow = [number, number, string, string, number, number];
export interface Names { rows: NameRow[]; origins: { en: string[]; es: (string | null)[] } }
const namesCache = new Map<string, Promise<Names | null>>();
export function loadNames(id: string): Promise<Names | null> {
  let p = namesCache.get(id);
  if (!p) { p = loadJSON<Names>(`worlds/${id}-names.json`).catch(() => null); namesCache.set(id, p); }
  return p;
}

/** IAU feature types, in words. */
export const TYPE_NAMES: Record<string, Text> = {
  cr: { en: 'Crater', es: 'Cráter' }, ma: { en: 'Mare (a "sea" of dark lava)', es: 'Mare (un «mar» de lava oscura)' },
  oc: { en: 'Oceanus (a vast lava plain)', es: 'Oceanus (una gran llanura de lava)' }, la: { en: 'Lacus (a small lava "lake")', es: 'Lacus (un pequeño «lago» de lava)' },
  si: { en: 'Sinus (a "bay")', es: 'Sinus (una «bahía»)' }, pa: { en: 'Palus (a "marsh")', es: 'Palus (un «pantano»)' },
  mo: { en: 'Mountain', es: 'Montaña' }, va: { en: 'Valley', es: 'Valle' }, ri: { en: 'Rille (a long narrow channel)', es: 'Rima (un canal largo y estrecho)' },
  ru: { en: 'Scarp (a cliff)', es: 'Escarpe (un acantilado)' }, do: { en: 'Ridge', es: 'Dorso (una cresta)' }, ca: { en: 'Crater chain', es: 'Cadena de cráteres' },
  pr: { en: 'Cape', es: 'Cabo' }, pl: { en: 'Plain', es: 'Llanura' }, pn: { en: 'Plateau', es: 'Meseta' }, te: { en: 'Highland', es: 'Tierra alta' },
  ch: { en: 'Canyon', es: 'Cañón' }, fo: { en: 'Trough', es: 'Fosa' }, th: { en: 'Small dome-shaped hill', es: 'Colina en forma de domo' },
  pe: { en: 'Volcanic crater (patera)', es: 'Cráter volcánico (pátera)' }, lb: { en: 'Maze of valleys', es: 'Laberinto de valles' },
  me: { en: 'Mesa (a flat-topped hill)', es: 'Mesa (una colina de cima plana)' }, cs: { en: 'Chaos (broken ground)', es: 'Caos (terreno quebrado)' },
  co: { en: 'Hills', es: 'Colinas' }, fl: { en: 'Lava flow', es: 'Colada de lava' }, li: { en: 'Line (a long streak)', es: 'Línea (una franja larga)' },
  mc: { en: 'Dark spot', es: 'Mancha oscura' }, re: { en: 'Region', es: 'Región' }, sc: { en: 'Scarp', es: 'Escarpa' },
  su: { en: 'Grooves', es: 'Surcos' }, ts: { en: 'Tessera (tiled, folded ground)', es: 'Tesela (terreno plegado en mosaico)' },
  cn: { en: 'Corona (an oval ring of ridges)', es: 'Corona (un anillo ovalado de crestas)' }, ar: { en: 'Arc', es: 'Arco' },
  as: { en: 'Radiating ridges (astrum)', es: 'Crestas en estrella (astrum)' }, fa: { en: 'Pancake-shaped volcano', es: 'Volcán en forma de panqueque' },
  un: { en: 'Dunes', es: 'Dunas' }, cv: { en: 'Hollow', es: 'Hondonada' }, lv: { en: 'Landslide', es: 'Deslizamiento' },
  lg: { en: 'Tongue of a plateau', es: 'Lengua de una meseta' }, se: { en: 'Winding ridge', es: 'Cresta sinuosa' }, vs: { en: 'Wide lowland plain', es: 'Gran llanura baja' },
  fc: { en: 'Bright spot', es: 'Mancha brillante' }, fx: { en: 'Scalloped ridge', es: 'Cresta festoneada' }, in: { en: 'Island', es: 'Isla' },
  fm: { en: 'River channel', es: 'Cauce de río' }, al: { en: 'Light or dark marking', es: 'Mancha clara u oscura' },
  st: { en: 'Landing site', es: 'Sitio de alunizaje' }, an: { en: 'Small crater named by the astronauts', es: 'Pequeño cráter nombrado por los astronautas' },
  ls: { en: 'Landing site', es: 'Sitio de aterrizaje' }, ec: { en: 'Volcanic vent', es: 'Centro eruptivo' }, pm: { en: 'Plume', es: 'Penacho' },
  ft: { en: 'Strait', es: 'Estrecho' }, sx: { en: 'Boulder', es: 'Roca' }, vi: { en: 'Streak', es: 'Franja' }, le: { en: 'Small dark spot', es: 'Pequeña mancha oscura' },
  rt: { en: 'Net-like pattern', es: 'Patrón en red' }, lr: { en: 'Giant ringed basin', es: 'Gran cuenca anillada' }, lc: { en: 'Dry lake bed', es: 'Lecho de lago seco' },
};
/** Big kinds of place: seas, plains, highlands, regions (their labels are italic, like seas on Earth). */
export const BIG_TYPES = new Set(['lr', 'ma', 'oc', 'te', 'pl', 'pn', 're', 'vs', 'ch', 'mo', 'va', 'ts', 'la', 'si', 'pa', 'al', 'lb', 'fm', 'in', 'un']);
export const SEA_TYPES = new Set(['ma', 'oc', 'la', 'si', 'pa', 'lc', 'fm', 'in', 'ft']);

/** "Named after": the given names before the first ";" go with the place's name ("Nicolaus; Polish astronomer"). */
export function namedAfter(name: string, origin: string): string {
  const s = origin.trim().replace(/\.$/, '');
  const i = s.indexOf(';');
  // A person: given names, then who they were with their dates ("(1473-1543)", "(c. 300 B.C.)", "(n. 1937)").
  const person = /\((c\.\s*)?\d|\(unkn|\(fl\.|\(n\.\s*\d|\(m\.\s*\d|desconocid/i.test(s.slice(i + 1));
  if (i > 0 && i < 60 && person && !/(^|\s)(of|in|for|de|del|en)\s/i.test(s.slice(0, i))) {
    const given = s.slice(0, i).trim();
    const surname = name.replace(/\s+(Mons|Montes|Vallis|Valles|Rupes|Dorsum|Dorsa|Catena|Rima|Rimae|Fossa|Fossae|Planitia|Chasma|Patera|Tholus|Crater)$/i, '');
    return `${given} ${surname}, ${s.slice(i + 1).trim().replace(/;\s*/g, '; ')}`;
  }
  return i > 0 ? `${s.slice(0, i).trim()}: ${s.slice(i + 1).trim()}` : s;
}
