// English and Spanish strings. Add a language by adding a column to STRINGS and to LANGS.
export type Lang = 'en' | 'es';
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Español' },
];

const STRINGS: Record<string, [string, string]> = {
  appName: ['Atlas Globe', 'Atlas Globe'],
  tagline: ['Explore the world, layer by layer', 'Explora el mundo, capa a capa'],
  loading: ['Loading the world…', 'Cargando el mundo…'],
  filters: ['Filters', 'Filtros'],
  activeFilters: ['Active filters', 'Filtros activos'],
  addFilter: ['Add filters', 'Añadir filtros'],
  searchFilters: ['Search filters', 'Buscar filtros'],
  noFilters: ['No filters on. Pick one below.', 'Ningún filtro activo. Elige uno abajo.'],
  opacity: ['Opacity', 'Opacidad'],
  remove: ['Remove', 'Quitar'],
  projection: ['Projection', 'Proyección'],
  projections: ['Map projections', 'Proyecciones'],
  time: ['Time travel', 'Viaje en el tiempo'],
  more: ['More', 'Más'],
  search: ['Search places', 'Buscar lugares'],
  searchHint: ['Country, capital or city', 'País, capital o ciudad'],
  noResults: ['No results', 'Sin resultados'],
  settings: ['Settings', 'Configuración'],
  language: ['Language', 'Idioma'],
  theme: ['Theme', 'Tema'],
  themeDark: ['Space (dark)', 'Espacio (oscuro)'],
  themeLight: ['Atlas (light)', 'Atlas (claro)'],
  labels: ['Labels', 'Etiquetas'],
  labelCountries: ['Countries', 'Países'],
  labelCapitals: ['Capitals', 'Capitales'],
  labelCities: ['Cities', 'Ciudades'],
  labelSeas: ['Seas and oceans', 'Mares y océanos'],
  labelValues: ['Filter values under country names', 'Valores del filtro bajo los nombres de país'],
  showAll: ['Everything about', 'Todo sobre'],
  showLess: ['Show less', 'Ver menos'],
  labelSize: ['Label size', 'Tamaño de etiquetas'],
  graticule: ['Latitude/longitude grid', 'Cuadrícula de latitud y longitud'],
  rivers: ['Rivers', 'Ríos'],
  shading: ['3D shading', 'Sombreado 3D'],
  quality: ['Detail', 'Detalle'],
  gpuMotion: ['Smooth motion: let the graphics chip (GPU) draw the map while it moves', 'Movimiento fluido: que el chip gráfico (GPU) dibuje el mapa mientras se mueve'],
  qualityAuto: ['Auto', 'Auto'],
  qualityHigh: ['High', 'Alto'],
  qualityLow: ['Battery saver', 'Ahorro de batería'],
  ambient: ['Ambient mode', 'Modo ambiente'],
  ambientDesc: ['Full-screen rotating globe with your filters', 'Globo girando a pantalla completa con tus filtros'],
  ambientSpeed: ['Rotation speed', 'Velocidad de giro'],
  ambientExit: ['Tap to exit ambient mode', 'Toca para salir del modo ambiente'],
  ambientCycle: ['Cycle through filters', 'Ir cambiando de filtro'],
  ambientClock: ['Show clock', 'Mostrar reloj'],
  zoomIn: ['Zoom in', 'Acercar'],
  zoomOut: ['Zoom out', 'Alejar'],
  resetView: ['Reset view', 'Restablecer vista'],
  fullscreen: ['Full screen', 'Pantalla completa'],
  install: ['Install app', 'Instalar app'],
  installed: ['Installed', 'Instalada'],
  about: ['About and credits', 'Acerca de y créditos'],
  close: ['Close', 'Cerrar'],
  legend: ['Legend', 'Leyenda'],
  capital: ['Capital', 'Capital'],
  population: ['Population', 'Población'],
  area: ['Area', 'Superficie'],
  continent: ['Continent', 'Continente'],
  region: ['Region', 'Región'],
  languages: ['Languages', 'Idiomas'],
  currency: ['Currency', 'Moneda'],
  gdp: ['GDP', 'PIB'],
  gdpPerCapita: ['GDP per person', 'PIB por persona'],
  income: ['Income group', 'Grupo de ingresos'],
  flyTo: ['Fly here', 'Volar aquí'],
  wikipedia: ['Wikipedia', 'Wikipedia'],
  sovereign: ['Part of', 'Parte de'],
  localTime: ['Local time', 'Hora local'],
  offline: ['Offline: showing saved data', 'Sin conexión: mostrando datos guardados'],
  updated: ['App updated', 'App actualizada'],
  continents: ['Continents', 'Continentes'],
  'cont.EU': ['Europe', 'Europa'],
  'cont.AS': ['Asia', 'Asia'],
  'cont.AF': ['Africa', 'África'],
  'cont.NA': ['North America', 'América del Norte'],
  'cont.SA': ['South America', 'América del Sur'],
  'cont.OC': ['Oceania', 'Oceanía'],
  'cont.AN': ['Antarctica', 'Antártida'],
  'cont.SS': ['Open-ocean islands', 'Islas oceánicas'],
  politicalNote: ['Colour family = continent; every country has its own shade.', 'Familia de color = continente; cada país tiene su propio tono.'],
  // categories
  'cat.political': ['Political', 'Político'],
  'cat.people': ['People', 'Población'],
  'cat.nature': ['Landforms & water', 'Relieve y agua'],
  'cat.climate': ['Climate & weather', 'Clima y tiempo'],
  'cat.earth': ['Earth science', 'Ciencias de la Tierra'],
  'cat.economy': ['Economy & energy', 'Economía y energía'],
  'cat.culture': ['Culture & society', 'Cultura y sociedad'],
  'cat.flora': ['Flora', 'Flora'],
  'cat.fauna': ['Fauna', 'Fauna'],
  'cat.imagery': ['Imagery', 'Imágenes'],
  'cat.live': ['Live', 'En vivo'],
  'cat.fun': ['Fun facts', 'Curiosidades'],
  // projections
  'proj.globe': ['Globe', 'Globo'],
  'proj.equirectangular': ['Plate Carrée', 'Equirrectangular'],
  'proj.mercator': ['Mercator', 'Mercator'],
  'proj.miller': ['Miller', 'Miller'],
  'proj.robinson': ['Robinson', 'Robinson'],
  'proj.winkel3': ['Winkel Tripel', 'Winkel Tripel'],
  'proj.equalEarth': ['Equal Earth', 'Equal Earth'],
  'proj.naturalEarth': ['Natural Earth', 'Natural Earth'],
  'proj.mollweide': ['Mollweide', 'Mollweide'],
  'proj.gallPeters': ['Gall–Peters', 'Gall-Peters'],
  'proj.eckert4': ['Eckert IV', 'Eckert IV'],
  'proj.azimuthalEquidistant': ['Azimuthal equidistant', 'Azimutal equidistante'],
  'proj.azimuthalEqualArea': ['Lambert azimuthal', 'Azimutal de Lambert'],
  'proj.stereographic': ['Stereographic', 'Estereográfica'],
  'projd.globe': ['A 3D view of Earth as seen from space.', 'La Tierra en 3D, como se ve desde el espacio.'],
  'projd.equirectangular': ['The plain map: latitude and longitude as a grid.', 'El mapa simple: latitud y longitud como cuadrícula.'],
  'projd.mercator': ['Keeps angles for navigation; greatly enlarges the poles.', 'Conserva los ángulos para navegar; agranda mucho los polos.'],
  'projd.miller': ['A softer Mercator that shows the poles.', 'Un Mercator suavizado que muestra los polos.'],
  'projd.robinson': ['A balanced classic for world atlases.', 'Un clásico equilibrado de los atlas.'],
  'projd.winkel3': ['National Geographic’s world map: low overall distortion.', 'El mapa de National Geographic: poca distorsión total.'],
  'projd.equalEarth': ['True areas with a pleasing shape (2018).', 'Áreas reales con forma agradable (2018).'],
  'projd.naturalEarth': ['A rounded compromise designed for small-scale maps.', 'Un compromiso redondeado para mapas del mundo.'],
  'projd.mollweide': ['Equal-area ellipse, often used for global data.', 'Elipse de áreas iguales, usada para datos globales.'],
  'projd.gallPeters': ['Equal-area rectangle: true sizes, stretched shapes.', 'Rectángulo de áreas iguales: tamaños reales, formas estiradas.'],
  'projd.eckert4': ['Equal-area with rounded poles.', 'Áreas iguales con polos redondeados.'],
  'projd.azimuthalEquidistant': ['True distances from the centre (UN emblem style).', 'Distancias reales desde el centro (como el emblema de la ONU).'],
  'projd.azimuthalEqualArea': ['The whole world in a circle with true areas.', 'Todo el mundo en un círculo con áreas reales.'],
  'projd.stereographic': ['Conformal view from the opposite side of Earth.', 'Vista conforme desde el lado opuesto de la Tierra.'],
  'prop.conformal': ['Conformal', 'Conforme'],
  'prop.equal-area': ['Equal-area', 'Equivalente'],
  'prop.compromise': ['Compromise', 'De compromiso'],
  'prop.equidistant': ['Equidistant', 'Equidistante'],
  'prop.perspective': ['Perspective', 'Perspectiva'],
  noRaster: ['Imagery is not available in this projection.', 'Las imágenes no están disponibles en esta proyección.'],
  dataLoading: ['Loading data…', 'Cargando datos…'],
  dataError: ['Could not load this filter’s data.', 'No se pudieron cargar los datos de este filtro.'],
  noData: ['No data', 'Sin datos'],
  credits: ['Data credits', 'Créditos de datos'],
  version: ['Version', 'Versión'],
  share: ['Share view', 'Compartir vista'],
  linkCopied: ['Link copied', 'Enlace copiado'],
  tapCountry: ['Tap a country for details', 'Toca un país para ver detalles'],
  timeTravel: ['Time travel', 'Viaje en el tiempo'],
  timeTravelShort: ['Time travel', 'Tiempo'],
  tbRestart: ['Play from the start', 'Reproducir desde el inicio'],
  tbSpeed: ['Speed', 'Velocidad'],
  tbFrom: ['From', 'Desde'],
  tbTo: ['to', 'hasta'],
  whatChanged: ['What changed', 'Qué cambió'],
  historyTitle: ['Borders through time', 'Fronteras en el tiempo'],
  historyDesc: ['Watch the political map change from 123,000 BC to today. Pick a start and an end, then press play.', 'Mira cómo cambia el mapa político desde el 123 000 a. C. hasta hoy. Elige inicio y fin y toca reproducir.'],
  pangeaTitle: ['Pangea to today', 'De Pangea a hoy'],
  warsTitle: ['Wars and conquests', 'Guerras y conquistas'],
  warsDesc: ['Famous conflicts step by step: territory, invasions, battles and their human cost.', 'Conflictos famosos paso a paso: territorio, invasiones, batallas y su coste humano.'],
  warsIntro: ['Pick a conflict to play it on the map. Tap a battle for its casualties, and "Details" for the full story of each step.', 'Elige un conflicto para verlo en el mapa. Toca una batalla para ver sus bajas y "Detalles" para la historia completa de cada paso.'],
  warsAll: ['All conflicts', 'Todos los conflictos'],
  'era.precambrian': ['Precambrian (until 539 million years ago)', 'Precámbrico (hasta hace 539 millones de años)'],
  'era.paleozoic': ['Paleozoic (539–252 million years ago)', 'Paleozoico (hace 539–252 millones de años)'],
  'era.mesozoic': ['Mesozoic (252–66 million years ago)', 'Mesozoico (hace 252–66 millones de años)'],
  'era.cenozoic': ['Cenozoic (since 66 million years ago)', 'Cenozoico (desde hace 66 millones de años)'],
  'era.prehistory': ['Prehistory', 'Prehistoria'],
  'era.ancient': ['Antiquity', 'Antigüedad'],
  'era.medieval': ['Middle Ages', 'Edad Media'],
  'era.early-modern': ['Early modern era', 'Edad Moderna'],
  'era.modern': ['1800–1945', '1800–1945'],
  'era.contemporary': ['Since 1945', 'Desde 1945'],
  warPrev: ['Previous step', 'Paso anterior'],
  warNext: ['Next step', 'Paso siguiente'],
  warStepOf: ['step {k} of {n}', 'paso {k} de {n}'],
  warDetails: ['Details', 'Detalles'],
  warAftermath: ['Aftermath', 'Después'],
  warBattles: ['Battles', 'Batallas'],
  warEvents: ['Events', 'Acontecimientos'],
  warOutcome: ['Outcome', 'Desenlace'],
  warHumanCost: ['Human cost', 'Coste humano'],
  warSources: ['Sources', 'Fuentes'],
  warDate: ['Date', 'Fecha'],
  warResult: ['Result', 'Resultado'],
  warVictory: ['{side} won', 'Victoria de {side}'],
  warLosses: ['Casualties', 'Bajas'],
  warTotal: ['Total', 'Total'],
  warNote: ['Note', 'Nota'],
  warAbout: ['About', 'Sobre la batalla'],
  warMembers: ['Members', 'Miembros'],
  warDeathsSoFar: ['Deaths so far (estimate)', 'Muertes hasta ahora (estimación)'],
  warDeathsShort: ['dead so far', 'muertos hasta ahora'],
  erasTitle: ['Eras and ideas', 'Épocas e ideas'],
  erasDesc: ['Golden ages and big ideas: where they happened, the people, their works and how they spread.', 'Edades de oro y grandes ideas: dónde ocurrieron, sus protagonistas, sus obras y cómo se difundieron.'],
  erasIntro: ['Pick an era to see it on the map. Tap a marker for the person, work or place, and "Details" for more.', 'Elige una época para verla en el mapa. Toca un marcador para conocer a la persona, la obra o el lugar, y "Detalles" para saber más.'],
  foodTitle: ['Food through time', 'La comida en el tiempo'],
  foodDesc: ['From the first farms to the world\u2019s kitchens: where crops were tamed, how foods travelled and where dishes were born.', 'De las primeras granjas a las cocinas del mundo: dónde se domesticaron los cultivos, cómo viajaron los alimentos y dónde nacieron los platos.'],
  foodIntro: ['Pick a story to see it on the map. Tap a marker for the crop, find or dish, and "Details" for more.', 'Elige una historia para verla en el mapa. Toca un marcador para conocer el cultivo, el hallazgo o el plato, y "Detalles" para saber más.'],
  structuresTitle: ['Great structures', 'Grandes construcciones'],
  structuresDesc: ['A tour of the great things people built: where, when, who built them, why and how.', 'Un recorrido por las grandes obras humanas: dónde, cuándo, quién las construyó, por qué y cómo.'],
  lifeTitle: ['Life through time', 'La vida en el tiempo'],
  lifeDesc: ['From the first microbes to the dinosaurs, the Ice Age giants and the animals we live with, on the drifting continents.', 'De los primeros microbios a los dinosaurios, los gigantes de la Edad de Hielo y los animales con los que vivimos, sobre los continentes a la deriva.'],
  lifeIntro: ['Pick a story to see it on the map. A step older than 5 million years shows the continents of its time, and every fossil moves with its continent. Tap a marker for its card, and "Details" for more.', 'Elige una historia para verla en el mapa. Un paso de hace más de 5 millones de años muestra los continentes de su época, y cada fósil se mueve con su continente. Toca un marcador para ver su ficha, y "Detalles" para saber más.'],
  lifeLatThen: ['Latitude then', 'Latitud entonces'],
  lifeOldMap: ['Continents of {when}', 'Continentes de {when}'],
  lifeDeepMap: ['Today’s land: older than the plate model', 'Tierras de hoy: más antiguo que el modelo de placas'],
  lifeOldMapNote: ['The map shows the continents of {when}, where the plate model of "Pangea to today" puts them (Merdith et al., 2021). Their coastlines are today’s, moved with their plates, and each marker moves with its continent.', 'El mapa muestra los continentes de {when}, donde los sitúa el modelo de placas de "De Pangea a hoy" (Merdith et al., 2021). Sus costas son las de hoy, desplazadas con su placa, y cada marcador se mueve con su continente.'],
  lifeDeepNote: ['The map shows today’s land, greyed: the plate model goes back only 1000 million years. The markers are where the rocks are found today.', 'El mapa muestra las tierras de hoy, en gris: el modelo de placas solo llega a hace 1000 millones de años. Los marcadores indican dónde están hoy las rocas.'],
  lifeSeeDrift: ['See the continents move', 'Ver cómo se mueven los continentes'],
  storyToday: ['today', 'hoy'],
  peopleTitle: ['Peoples and civilizations', 'Pueblos y civilizaciones'],
  peopleDesc: ['From our earliest ancestors to the great civilizations: where people came from, where they went and what they built.', 'De nuestros primeros antepasados a las grandes civilizaciones: de dónde venimos, a dónde fuimos y qué construimos.'],
  peopleIntro: ['Pick a story to see it on the map. Tap a marker for the find, the city or the people, and "Details" for more.', 'Elige una historia para verla en el mapa. Toca un marcador para conocer el hallazgo, la ciudad o el pueblo, y "Detalles" para saber más.'],
  structuresIntro: ['Pick a tour to see it on the map. Tap a marker for who built it, why and how, and "Details" for more.', 'Elige un recorrido para verlo en el mapa. Toca un marcador para saber quién lo construyó, por qué y cómo, y "Detalles" para saber más.'],
  storyAll: ['All stories', 'Todas las historias'],
  storyLegacy: ['Legacy', 'Legado'],
  storyOnMap: ['On the map', 'En el mapa'],
  storyBrowse: ['Browse', 'Explorar'],
  storyMore: ['more', 'más'],
  storyLess: ['less', 'menos'],
  storyReadAll: ['Read all of it', 'Leer todo'],
  storyBrowseAll: ['Browse everything', 'Explorarlo todo'],
  storySearch: ['Search', 'Buscar'],
  storyAllCats: ['All', 'Todo'],
  storyWhen: ['When', 'Cuándo'],
  storyWhere: ['Where', 'Dónde'],
  storyBy: ['Who', 'Quién'],
  storyWhy: ['Why', 'Por qué'],
  storyHow: ['How', 'Cómo'],
  storySize: ['Size', 'Tamaño'],
  storyStatus: ['Today', 'Hoy'],
  storyLived: ['Lived', 'Vivió'],
  storyNothing: ['Nothing found', 'No se ha encontrado nada'],
  storyCount: ['{n} things', '{n} elementos'],
  storyIn: ['In: {name}', 'En: {name}'],
  pangeaDesc: ['Plate tectonics: watch the supercontinent break apart into today\u2019s continents (and go back to Rodinia, 1 billion years ago).', 'Tectónica de placas: mira cómo el supercontinente se separa en los continentes actuales (y retrocede hasta Rodinia, hace 1000 millones de años).'],
  comingSoon: ['Coming soon', 'Próximamente'],
};

const SUBREGIONS_ES: Record<string, string> = {
  'Central America': 'América Central', 'Northern America': 'América del Norte', 'South America': 'América del Sur', Caribbean: 'Caribe',
  'Western Europe': 'Europa occidental', 'Eastern Europe': 'Europa oriental', 'Northern Europe': 'Europa del norte', 'Southern Europe': 'Europa del sur',
  'Northern Africa': 'África del norte', 'Western Africa': 'África occidental', 'Middle Africa': 'África central', 'Eastern Africa': 'África oriental',
  'Southern Africa': 'África austral', 'Western Asia': 'Asia occidental', 'Central Asia': 'Asia central', 'Southern Asia': 'Asia del sur',
  'South-Eastern Asia': 'Sudeste asiático', 'Eastern Asia': 'Asia oriental', 'Australia and New Zealand': 'Australia y Nueva Zelanda',
  Melanesia: 'Melanesia', Micronesia: 'Micronesia', Polynesia: 'Polinesia', Antarctica: 'Antártida', 'Seven seas (open ocean)': 'Islas oceánicas',
};

/** Natural Earth subregion name in the current language. */
export function subregion(name: string): string {
  return current === 'es' ? SUBREGIONS_ES[name] ?? name : name;
}

let current: Lang = 'en';

export function setLang(l: Lang) { current = l; document.documentElement.lang = l; }
export function lang(): Lang { return current; }

export function t(key: string, vars?: Record<string, string | number>): string {
  const row = STRINGS[key];
  let s = row ? row[current === 'es' ? 1 : 0] : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

export function tx(text: { en: string; es: string } | undefined): string {
  if (!text) return '';
  return current === 'es' ? text.es || text.en : text.en;
}

export function detectLang(): Lang {
  const n = (navigator.languages?.[0] || navigator.language || 'en').toLowerCase();
  return n.startsWith('es') ? 'es' : 'en';
}

const locale = () => (current === 'es' ? 'es-ES' : 'en-US');

export function fmtNumber(v: number, digits = 0): string {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: digits }).format(v);
}

export function fmtCompact(v: number): string {
  return new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

export function fmtMoney(v: number): string {
  return new Intl.NumberFormat(locale(), { style: 'currency', currency: 'USD', notation: v >= 1e9 ? 'compact' : 'standard', maximumFractionDigits: v >= 1e9 ? 1 : 0 }).format(v);
}

/** Localised name of a language, region (ISO alpha-2) or currency via Intl.DisplayNames. */
export function displayName(type: 'language' | 'region' | 'currency', code: string): string {
  try {
    const dn = new Intl.DisplayNames([locale()], { type });
    return dn.of(code) || code;
  } catch {
    return code;
  }
}

export function flagEmoji(a2: string | null | undefined): string {
  if (!a2 || a2.length !== 2) return '🏳️';
  return String.fromCodePoint(...[...a2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
