// The app's languages (v0.41.0, One voice; v0.42.0, Portuguese, French and German). Every text is written in English
// and Spanish where it is used, as L('English', 'Spanish', ...values), with {0}, {1}… for the values so that a
// translator can move them, and {0, plural, one {# day} other {# days}} or {0, select, a {…} other {…}} where the words
// change with a value. Other languages come from a file per language, public/data/i18n/<lang>.json, keyed by the
// English text (gettext's way): a text with no translation yet shows in English. Names (places, species, the data's
// short texts) come from a second file, <lang>-data.json, also keyed by the English (nm, and tx's fallback).
// scripts/i18n/extract.mjs lists every text (i18n/messages.json, for translators) and with --check fails when a
// shipped language misses one, or a pattern's values do not match.
export type Lang = 'en' | 'es' | 'pt' | 'fr' | 'de';
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Español' },
  { id: 'pt', name: 'Português (Brasil)' },
  { id: 'fr', name: 'Français' },
  { id: 'de', name: 'Deutsch' },
];
/** The languages read from language files (English and Spanish are written in the code). */
export const FILE_LANGS: readonly Lang[] = ['pt', 'fr', 'de'];
export const isLang = (x: unknown): x is Lang => LANGS.some((l) => l.id === x);

/** key: [English, Spanish] or [English, Spanish, context] (a context for an English that means two things). */
const STRINGS: Record<string, [string, string] | [string, string, string]> = {
  appName: ['Atlas Globe', 'Atlas Globe'],
  tagline: ['Explore the world, layer by layer', 'Explora el mundo, capa a capa'],
  loading: ['Loading the world…', 'Cargando el mundo…'],
  filters: ['Filters', 'Filtros'],
  activeFilters: ['Active filters', 'Filtros activos'],
  addFilter: ['Add filters', 'Agregar filtros'],
  searchFilters: ['Search filters', 'Buscar filtros'],
  noFilters: ['No filters on. Pick one below.', 'Ningún filtro activo. Elige uno abajo.'],
  opacity: ['Opacity', 'Opacidad'],
  remove: ['Remove', 'Quitar'],
  projection: ['Projection', 'Proyección'],
  projections: ['Map projections', 'Proyecciones'],
  time: ['Time travel', 'Viaje en el tiempo'],
  more: ['More', 'Más'],
  back: ['Back', 'Volver'],
  menuExplore: ['Explore', 'Explorar'],
  menuLearn: ['Learn', 'Aprender'],
  menuPlay: ['Play', 'Jugar'],
  menuTools: ['Tools', 'Herramientas'],
  menuShare: ['Save and share', 'Guardar y compartir'],
  search: ['Search places', 'Buscar lugares'],
  searchHint: ['Country, capital or city', 'País, capital o ciudad'],
  noResults: ['No results', 'Sin resultados'],
  settings: ['Settings', 'Ajustes'],
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
  'cat.people': ['People', 'Población', 'a group of filters: population'],
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
  'cat.mine': ['Your data', 'Tus datos'],
  myDataAdd: ['Add your data', 'Agregar tus datos'],
  myDataAddDesc: ['A CSV of countries, regions or places becomes a map.', 'Un CSV de países, regiones o lugares se vuelve un mapa.'],
  featured: ['Compare', 'Comparar'],
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
  timeTravelShort: ['Time', 'Tiempo'],
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
  warNext: ['Next step', 'Siguiente paso'],
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
  gamesTitle: ['Games of the world', 'Juegos del mundo'],
  gamesDesc: ['Every Olympics and every World Cup: the host city, the countries that took part, the medals, the champions and the boycotts; the Tour de France and the great marathons.', 'Todos los Juegos Olímpicos y todos los Mundiales: la ciudad sede, los países que participaron, las medallas, los campeones y los boicots; el Tour de Francia y los grandes maratones.'],
  gamesIntro: ['Pick a story to see it on the map. Each Games colours the countries by how they took part, with an arc from each to the host city. Tap a country for its medals or result, a marker for its card, and "Details" for the medal table.', 'Elige una historia para verla en el mapa. Cada edición colorea los países según cómo participaron, con un arco de cada uno a la ciudad sede. Toca un país para ver sus medallas o su resultado, un marcador para ver su ficha, y "Detalles" para el medallero.'],
  journeysTitle: ['Journeys and trade routes', 'Viajes y rutas comerciales'],
  journeysDesc: ['Great journeys, from Xuanzang, Marco Polo and Ibn Battuta to Cook and the race to the Poles, and the routes that carried silk, spices, gold and salt, and enslaved people across the Atlantic.', 'Grandes viajes, de Xuanzang, Marco Polo e Ibn Battuta a Cook y la carrera a los polos, y las rutas que llevaron seda, especias, oro y sal, y personas esclavizadas a través del Atlántico.'],
  journeysIntro: ['Pick a story to see it on the map. Each step draws the next stretch of the journey, and the way already travelled stays on the map. Tap a marker for its card, and "Details" for more.', 'Elige una historia para verla en el mapa. Cada paso dibuja el siguiente tramo del viaje, y el camino ya recorrido queda en el mapa. Toca un marcador para ver su ficha, y "Detalles" para saber más.'],
  beliefsTitle: ['Religions and philosophies', 'Religiones y filosofías'],
  beliefsDesc: ['Where the world’s faiths and schools of thought began and how they spread, told neutrally: Hinduism, Buddhism, Judaism, Christianity, Islam, Sikhism, the ways of East Asia, African faiths in the Americas and the first philosophers.', 'Dónde nacieron las religiones y las escuelas de pensamiento del mundo y cómo se extendieron, contado con neutralidad: el hinduismo, el budismo, el judaísmo, el cristianismo, el islam, el sijismo, las tradiciones de Asia oriental, las religiones africanas en América y los primeros filósofos.'],
  beliefsIntro: ['Pick a story to see it on the map. Each step shows where a faith or a school of thought was followed at that time, and how it travelled. Tap a marker for its card, and "Details" for more.', 'Elige una historia para verla en el mapa. Cada paso muestra dónde se seguía una religión o una escuela de pensamiento en ese momento, y cómo viajó. Toca un marcador para ver su ficha, y "Detalles" para saber más.'],
  writingTitle: ['Writing and languages', 'Escritura y lenguas'],
  writingDesc: ['The separate inventions of writing, the journey of the alphabet, the scripts of East Asia and the scripts made by one person, the lost scripts and their code breakers, and how the great language families spread.', 'Las invenciones de la escritura, el viaje del alfabeto, las escrituras de Asia oriental y las creadas por una sola persona, las escrituras perdidas y quienes las descifraron, y cómo se extendieron las grandes familias de lenguas.'],
  writingIntro: ['Pick a story to see it on the map. Each step shows where a script was written or a language spoken at that time. Tap a marker for its card: scripts and languages show a sample in their own letters.', 'Elige una historia para verla en el mapa. Cada paso muestra dónde se escribía una escritura o se hablaba una lengua en ese momento. Toca un marcador para ver su ficha: las escrituras y las lenguas muestran un ejemplo en sus propias letras.'],
  plaguesTitle: ['Plagues and cures', 'Epidemias y curas'],
  plaguesDesc: ['The Black Death month by month, smallpox, cholera and John Snow, malaria, the 1918 flu, HIV and COVID-19, and the people who found the germs, the vaccines and the medicines that fight them.', 'La peste negra mes a mes, la viruela, el cólera y John Snow, la malaria, la gripe de 1918, el VIH y la COVID-19, y quienes descubrieron los microbios, las vacunas y los medicamentos que los combaten.'],
  plaguesIntro: ['Pick a story to see it on the map. Each step shows where a disease had reached at that time, and how it travelled. Tap a marker for its card, and "Details" for more.', 'Elige una historia para verla en el mapa. Cada paso muestra hasta dónde había llegado una enfermedad en ese momento y cómo viajó. Toca un marcador para ver su ficha y «Detalles» para saber más.'],
  disastersTitle: ['Natural disasters', 'Desastres naturales'],
  disastersDesc: ['Vesuvius in AD 79, the Lisbon earthquake of 1755, Tambora and the year without a summer, Krakatoa, the 2004 tsunami and more: hour by hour, with their effects around the world.', 'El Vesubio en el año 79, el terremoto de Lisboa de 1755, el Tambora y el año sin verano, el Krakatoa, el tsunami de 2004 y más: hora a hora, con sus efectos en todo el mundo.'],
  disastersIntro: ['Pick a story to see it on the map. Each step shows what happened at that hour, day or year, and how far its effects reached. Tap a marker for its card, and "Details" for more.', 'Elige una historia para verla en el mapa. Cada paso muestra lo que pasó en esa hora, ese día o ese año, y hasta dónde llegaron sus efectos. Toca un marcador para ver su ficha y «Detalles» para saber más.'],
  musicTitle: ['Music and dance', 'Música y baile'],
  musicDesc: ['Where music and dance were born and how they travelled: the oldest flutes, classical music, the instruments of the world, jazz and blues, rock and hip hop, Latin rhythms and the dances of the world, with short clips of free recordings.', 'Dónde nacieron la música y el baile y cómo viajaron: las flautas más antiguas, la música clásica, los instrumentos del mundo, el jazz y el blues, el rock y el hip hop, los ritmos latinos y los bailes del mundo, con fragmentos de grabaciones libres.'],
  musicIntro: ['Pick a story to see it on the map. Tap a marker for its card: many play a short clip of a free recording. Turn on ♪ in the story bar to hear each step’s music while the map moves.', 'Elige una historia para verla en el mapa. Toca un marcador para ver su ficha: muchas tocan un fragmento de una grabación libre. Activa ♪ en la barra de la historia para oír la música de cada paso mientras se mueve el mapa.'],
  booksTitle: ['Books and writers', 'Libros y escritores'],
  booksDesc: ['Great books where they take place, and their writers where they lived: epics, tales that travelled, novels, poetry, literature in Spanish and the story of the book, with lines in their own languages.', 'Grandes libros donde transcurren, y sus autores donde vivieron: epopeyas, cuentos que viajaron, novelas, poesía, la literatura en español y la historia del libro, con versos y frases en su propia lengua.'],
  booksIntro: ['Pick a story to see it on the map. Each step shows where books were written and where they take place. Tap a marker for its card: many show a famous line in its own language.', 'Elige una historia para verla en el mapa. Cada paso muestra dónde se escribieron los libros y dónde transcurren. Toca un marcador para ver su ficha: muchas muestran una frase famosa en su propia lengua.'],
  artTitle: ['Art of the world', 'Arte del mundo'],
  artDesc: ['Masterpieces where they were made and where they are now, from cave paintings to modern art, and the works taken in war and by empires, and those returned.', 'Obras maestras donde se hicieron y donde están hoy, de las pinturas rupestres al arte moderno, y las obras que se llevaron las guerras y los imperios, y las que se devolvieron.'],
  artIntro: ['Pick a story to see it on the map. Each marker is where a work was made; its card shows where it is now. Tap the picture to see it full screen and zoom in.', 'Elige una historia para verla en el mapa. Cada marcador está donde se hizo una obra; su ficha muestra dónde está hoy. Toca la imagen para verla en pantalla completa y acercarla.'],
  inventionsTitle: ['Inventions', 'Inventos'],
  inventionsDesc: ['Where things were invented and how they travelled: China’s four great inventions, clocks, lenses, flight, the telegraph and the Web, power, everyday things, disputed firsts and inventions from Latin America.', 'Dónde se inventaron las cosas y cómo viajaron: los cuatro grandes inventos de China, los relojes, las lentes, el vuelo, el telégrafo y la web, la energía, las cosas de todos los días, los primeros en disputa y los inventos de América Latina.'],
  inventionsIntro: ['Pick a story to see it on the map. Each marker is where something was invented; arrows show how it travelled. Tap a marker for its card and who invented it.', 'Elige una historia para verla en el mapa. Cada marcador está donde se inventó algo; las flechas muestran cómo viajó. Toca un marcador para ver su ficha y quién lo inventó.'],
  heritageTitle: ['World Heritage', 'Patrimonio de la Humanidad'],
  heritageDesc: ['The story of UNESCO’s World Heritage List: how saving Abu Simbel started it, sites destroyed and rebuilt, nature saved, and Latin America’s history in its heritage.', 'La historia de la Lista del Patrimonio Mundial de la UNESCO: cómo empezó al salvar Abu Simbel, sitios destruidos y reconstruidos, la naturaleza salvada y la historia de América Latina en su patrimonio.'],
  heritageIntro: ['Pick a story to see it on the map. Each marker is a place; its card says when it joined the World Heritage List and whether it is in danger. For every site on the list, turn on the World Heritage filter.', 'Elige una historia para verla en el mapa. Cada marcador es un lugar; su ficha dice cuándo entró en la Lista del Patrimonio Mundial y si está en peligro. Para ver todos los sitios de la lista, activa el filtro Patrimonio de la Humanidad.'],
  livesTitle: ['Lives on the map', 'Vidas en el mapa'],
  livesDesc: ['Follow a life place by place: where they were born, studied and worked, their great works and moments, exile and death. Scientists, writers, artists, musicians, leaders and athletes, from Hatshepsut to our time.', 'Sigue una vida lugar por lugar: dónde nació, estudió y trabajó, sus grandes obras y momentos, el exilio y la muerte. Científicos, escritores, artistas, músicos, líderes y deportistas, desde Hatshepsut hasta nuestro tiempo.'],
  livesIntro: ['Pick a life to follow it on the map. Each step is a place and a date, with the age they were, and the way from the last place is drawn. Tap a marker for its card, and "Details" for more.', 'Elige una vida para seguirla en el mapa. Cada paso es un lugar y una fecha, con la edad que tenía, y se dibuja el camino desde el lugar anterior. Toca un marcador para ver su ficha, y «Detalles» para saber más.'],
  livesAged: ['aged {n}', 'a los {n} años'],
  livesAgedAbout: ['aged about {n}', 'con unos {n} años'],
  livesToday: ['Today', 'Hoy'],
  livesUnsure: ['Not certain', 'No es seguro'],
  livesMet: ['Their paths cross', 'Sus caminos se cruzan'],
  livesSearch: ['Search a name, a field or a place…', 'Busca un nombre, un campo o un lugar…'],
  livesAll: ['All', 'Todas', 'all lives'],
  livesNone: ['No life matches.', 'Ninguna vida coincide.'],
  livesPairs: ['Two lives side by side', 'Dos vidas lado a lado'],
  livesPairsHint: ['Two people on one map, in the same years, and where their paths crossed.', 'Dos personas en un mismo mapa, en los mismos años, y dónde se cruzaron sus caminos.'],
  livesCompare: ['Beside another life…', 'Junto a otra vida…'],
  livesCompareWith: ['Pick the life to set beside {name}', 'Elige la vida que quieres junto a {name}'],
  livesCompareCancel: ['Cancel', 'Cancelar'],
  livesBorn: ['Born', 'Nació'],
  livesDied: ['Died', 'Murió'],
  livesFollow: ['Follow their life', 'Seguir su vida'],
  livesWorksNow: ['Where their works are now', 'Dónde están hoy sus obras'],
  livesBuildings: ['Their buildings', 'Sus edificios'],
  livesBoth: ['Both in {place}', 'Ambos en {place}'],
  livesTwo: ['{a} and {b}', '{a} y {b}'],
  livesTwoSummary: ['Two lives on one map, step by step in the order they happened. A handshake marks where their paths crossed.', 'Dos vidas en un mismo mapa, paso a paso en el orden en que ocurrieron. Un apretón de manos marca dónde se cruzaron sus caminos.'],
  livesCityGuide: ['{city}: the guide', '{city}: la guía'],
  spaceTitle: ['Space exploration', 'Exploración espacial'],
  spaceDesc: ['From the first rockets to footprints on the Moon and rovers on Mars: the space race, robots to the planets, and the astronomers who mapped the sky.', 'De los primeros cohetes a las huellas en la Luna y los vehículos en Marte: la carrera espacial, los robots que viajaron a los planetas y los astrónomos que cartografiaron el cielo.'],
  spaceIntro: ['Pick a story to see it on the map. Some steps happen on the Moon or Mars: the globe turns into that world, with the landing sites and the rovers\' routes.', 'Elige una historia para verla en el mapa. Algunos pasos ocurren en la Luna o en Marte: el globo se convierte en ese mundo, con los sitios de aterrizaje y las rutas de los vehículos.'],
  musicToggle: ['Music with the story', 'Música con la historia'],
  musicOnToast: ['Music on: each step with a recording plays a short clip of it.', 'Música activada: cada paso con una grabación toca un fragmento.'],
  musicNow: ['Now playing', 'Suena'],
  storyHasClip: ['Has a recording', 'Tiene una grabación'],
  gamesTeam: ['Team', 'Selección'],
  gamesNation: ['Nation', 'País'],
  gamesTotal: ['Total', 'Total'],
  gamesMoreRows: ['…and {n} more in Details', '…y {n} más en Detalles'],
  gamesPlace1: ['Champions', 'Campeón'],
  gamesPlace2: ['Runners-up', 'Subcampeón'],
  gamesPlace3: ['Third place', 'Tercer lugar'],
  gamesPlace4: ['Fourth place', 'Cuarto lugar'],
  gamesNoPart: ['Did not take part', 'No participó'],
  gamesMedals: ['Medals', 'Medallas'],
  gamesRank: ['Medal table', 'Medallero'],
  gamesRankOf: ['{r} place', '{r} lugar'],
  gamesFinish: ['Result', 'Resultado'],
  gamesAthletes: ['Athletes', 'Atletas'],
  gamesPartOf: ['{country} was part of', '{country} formaba parte de'],
  gamesStandings: ['Final ranking', 'Clasificación final'],
  gamesMedalTable: ['Medal table', 'Medallero'],
  gamesNationsN: ['{n} nations took part', 'Participaron {n} países'],
  gamesTeamsN: ['{n} teams took part', 'Participaron {n} selecciones'],
  gamesAway: ['Stayed away or kept out', 'Ausentes o excluidos'],
  gamesMapNote: ['Countries are drawn with today’s borders: a team of the past (the Soviet Union, Yugoslavia) colours all the countries it is today. Tap a country for its result.', 'Los países se dibujan con sus fronteras de hoy: un equipo del pasado (la Unión Soviética, Yugoslavia) colorea todos los países que hoy lo forman. Toca un país para ver su resultado.'],
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
  storyAllCats: ['All', 'Todo', 'everything'],
  storyWhen: ['When', 'Cuándo'],
  storyWhere: ['Where', 'Dónde'],
  storyBy: ['Who', 'Quién'],
  storyWhy: ['Why', 'Por qué'],
  storyHow: ['How', 'Cómo'],
  storySize: ['Size', 'Tamaño'],
  storyStatus: ['Today', 'Hoy'],
  whsLabel: ['World Heritage', 'Patrimonio de la Humanidad'],
  whsSince: ['Since {y}', 'Desde {y}'],
  whsCultural: ['cultural site', 'sitio cultural'],
  whsNatural: ['natural site', 'sitio natural'],
  whsMixed: ['cultural and natural site', 'sitio cultural y natural'],
  whsRemoved: ['Listed in {y}, removed in {x}', 'Inscrito en {y}, retirado en {x}'],
  whsMerged: ['Listed in {y}; part of {into} since {m}', 'Inscrito en {y}; parte de {into} desde {m}'],
  whsDangerLabel: ['UNESCO', 'UNESCO'],
  whsDanger: ['On the List of World Heritage in Danger', 'En la Lista del Patrimonio Mundial en Peligro'],
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
  return current === 'es' ? SUBREGIONS_ES[name] ?? name : nm(name);
}

let current: Lang = 'en';

export function setLang(l: Lang) { current = l; localeCache = null; document.documentElement.lang = l === 'es' && spanish === 'spain' ? 'es-ES' : l === 'pt' ? 'pt-BR' : l; }
export function lang(): Lang { return current; }

/**
 * Which Spanish: the app's texts are written in Latin American Spanish; "spain" shows them with the words used in
 * Spain (src/app/spain.ts: ordenador, patata, zumo, móvil...), applied where the texts are shown and read aloud.
 */
export type Spanish = 'latam' | 'spain';
let spanish: Spanish = 'latam';
export function setSpanish(v: Spanish) { spanish = v; setLang(current); }

/** The phone's languages, the most wanted first (en-US, es-MX...). */
function phoneTags(): string[] {
  try {
    const l = navigator.languages?.length ? navigator.languages : [navigator.language];
    return l.filter(Boolean).map(String);
  } catch { return []; }
}
const base = (tag: string) => tag.toLowerCase().split('-')[0];
/** A tag's region (MX in es-MX, 419 in es-419), if it has one. */
const regionOf = (tag: string) => tag.split('-').slice(1).find((p) => /^([a-z]{2}|\d{3})$/i.test(p))?.toUpperCase() ?? null;
export function spanishVariant(): Spanish { return spanish; }
/** Spanish from Spain is being shown. */
export function spainOn(): boolean { return current === 'es' && spanish === 'spain'; }
/**
 * Which Spanish the phone speaks (v0.35.0): Spain's when its Spanish is from Spain (es-ES), or when it says only
 * "Spanish" and its region is Spain (a phone in Catalan, Galician or Basque, ca-ES...); Latin America's otherwise.
 */
export function detectSpanish(): Spanish {
  const tags = phoneTags();
  const es = tags.find((t) => base(t) === 'es');
  const region = es ? regionOf(es) : null;
  if (region) return region === 'ES' ? 'spain' : 'latam';
  return tags.some((t) => regionOf(t) === 'ES') ? 'spain' : 'latam';
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const row = STRINGS[key];
  let s = row ? pick(row[0], row[1], row[2], true) : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return out(s);
}

/** A language file's texts, keyed by the English (null: English or Spanish, written in the code). */
let messages: Record<string, string> | null = null;
export function setMessages(m: Record<string, string> | null) { messages = m; }
/** The language's names and the data's short texts (<lang>-data.json), keyed by the English. */
let names: Record<string, string> | null = null;
export function setNames(m: Record<string, string> | null) { names = m; }
/** Texts shown accented and in brackets ([Ŝháré]), to find on screen what does not go through L, tx or t. */
let pseudo = false;
export function setPseudo(on: boolean) { pseudo = on; }
export const pseudoOn = () => pseudo;

/**
 * The text in the reader's language: the Spanish, the English's translation, or the English. A context tells apart
 * the same English with two meanings ("Streak" of days, "Streak" on a planet): its key is context + U+0004 + English,
 * as in gettext.
 */
function pick(en: string, es: string | undefined, ctx?: string, asWritten = false): string {
  // A text written in the code says what it means even when empty ('' in Spanish: nothing); a data field with no
  // Spanish yet shows the English.
  if (current === 'es') return asWritten ? es ?? en : es || en;
  if (messages) {
    const m = messages[ctx ? `${ctx}\u0004${en}` : en];
    if (m) return m;
  }
  // A data field (not a text of the code) may be a name, or one of the data's short texts.
  return (!asWritten && names?.[en]) || en;
}

const ACCENT: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', c: 'ç', n: 'ñ', s: 'ŝ', y: 'ý', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú', C: 'Ç', N: 'Ñ', S: 'Ŝ' };
function out(s: string): string {
  if (!pseudo || !s) return s;
  return `[${s.replace(/[aeioucnsyAEIOUCNS]/g, (c) => ACCENT[c])}]`;
}

/**
 * A pattern with its values: {0} is the first value; in {0, plural, =0 {none} one {# day} other {# days}} the case is
 * picked by the number (as the language counts: Intl.PluralRules) and # is the number; {0, select, f {…} other {…}}
 * is picked by the value. Braces that are not followed by a number are left as they are.
 */
export function fmt(p: string, args: readonly unknown[]): string {
  let res = '', i = 0;
  while (i < p.length) {
    const c = p[i];
    if (c === '{' && /\d/.test(p[i + 1] ?? '')) {
      const end = closing(p, i);
      if (end < 0) { res += p.slice(i); break; }
      res += arg(p.slice(i + 1, end), args);
      i = end + 1;
    } else { res += c; i++; }
  }
  return res;
}
/** Where the brace opened at i closes. */
function closing(p: string, i: number): number {
  let depth = 0;
  for (let k = i; k < p.length; k++) {
    if (p[k] === '{') depth++;
    else if (p[k] === '}' && --depth === 0) return k;
  }
  return -1;
}
function arg(body: string, args: readonly unknown[]): string {
  const m = /^(\d+)\s*(?:,\s*(plural|select)\s*,\s*([\s\S]*))?$/.exec(body);
  if (!m) return `{${body}}`;
  const v = args[+m[1]];
  if (!m[2]) return v == null ? '' : String(v);
  // The cases: key {text} key {text}…
  const cases: Record<string, string> = {};
  const rest = m[3];
  let k = 0;
  while (k < rest.length) {
    const km = /^\s*(=?[\w-]+)\s*\{/.exec(rest.slice(k));
    if (!km) break;
    const open = k + km[0].length - 1;
    const end = closing(rest, open);
    if (end < 0) break;
    cases[km[1]] = rest.slice(open + 1, end);
    k = end + 1;
  }
  if (m[2] === 'select') return fmt(cases[String(v)] ?? cases.other ?? '', args);
  const n = Number(v);
  let text = cases[`=${n}`];
  if (text == null) {
    let cat = 'other';
    try { cat = new Intl.PluralRules(locale()).select(n); } catch { /* other */ }
    text = cases[cat] ?? cases.other ?? '';
  }
  return fmt(text.replace(/#/g, new Intl.NumberFormat(locale(), { maximumFractionDigits: 3 }).format(n)), args);
}

/** A list in the reader's language (the Spanish list, or each English item's translation). */
export function txs(text: { en: readonly string[]; es?: readonly string[] } | undefined): string[] {
  if (!text) return [];
  if (current === 'es' && text.es?.length) return text.es.map(out);
  return text.en.map((en) => out(pick(en, undefined)));
}

/** L with a context, for an English text that means two things: Lc('a stripe on a planet', 'Streak', 'Franja'). */
export function Lc(ctx: string, en: string, es: string, ...args: unknown[]): string {
  const s = pick(en, es, ctx, true);
  return out(args.length ? fmt(s, args) : s);
}

/** f's texts in a language (a description kept in two, the English for a file name…); of the languages read from
 * files, only the reader's own is at hand: another shows in English. */
export function inLang<T>(l: Lang, f: () => T): T {
  const was = current, m = messages, n = names, p = pseudo;
  if (l !== was) { messages = null; names = null; }
  current = l; pseudo = false;
  try { return f(); } finally { current = was; messages = m; names = n; pseudo = p; }
}

/**
 * A name (a place, a species, a dish…) in the reader's language: the Spanish written beside it, or the language
 * file's (Natural Earth's and Wikidata's names, keyed by the English); the English otherwise.
 */
export function nm(en: string, es?: string | null): string {
  if (current === 'es') return out(es || en);
  return out(names?.[en] || en);
}
/** A word set inside a sentence in lowercase ("the state of…"); German writes its nouns with a capital. */
export const lower = (s: string) => (current === 'de' ? s : s.toLocaleLowerCase(appLocale()));
/** "1st", "2nd", "23rd"; "1.º" in Spanish, "1º" in Portuguese, "1er", "2e" in French, "1." in German. */
export function ordinal(n: number): string {
  // i18n: by hand (each language's ordinals)
  switch (current) {
    case 'es': return `${n}.º`;
    case 'pt': return `${n}º`;
    case 'fr': return n === 1 ? '1er' : `${n}e`;
    case 'de': return `${n}.`;
    default: {
      const teen = n % 100 >= 11 && n % 100 <= 13;
      return `${n}${teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
    }
  }
}
/** A name's [English, Spanish] pair (as the data keeps many) in the reader's language. */
export const nm2 = (n: readonly [string, string?] | readonly string[]) => nm(n[0], n[1]);

/** The text in the reader's language, with its values: L('{0} days', '{0} días', n). */
export function L(en: string, es: string, ...args: unknown[]): string {
  const s = pick(en, es, undefined, true);
  return out(args.length ? fmt(s, args) : s);
}

/**
 * The language of the app's data (names, stories, guides are written in English and Spanish): Spanish when the
 * reader reads Spanish, English otherwise.
 */
export function dataLang(): 'en' | 'es' { return current === 'es' ? 'es' : 'en'; }
/** The reader's language where another site has it (Wikipedia, iNaturalist, Wikimedia's On this day). */
export function webLang(): Lang { return current; }
/** iNaturalist's language for common names. */
export const inatLocale = () => (current === 'pt' ? 'pt-BR' : current);
/** UNESCO's World Heritage site is in English and French (and partly Spanish). */
export function unescoLang(): 'en' | 'fr' | 'es' { return current === 'fr' || current === 'es' ? current : 'en'; }
/** A Wikipedia article's address: its Spanish title when reading Spanish, else its English one (the data keeps
 * those two titles; another language's article would have a title of its own). */
export function wikiHref(w?: { en?: string; es?: string } | null): string | null {
  const l = current === 'es' && w?.es ? 'es' : 'en';
  const title = w?.[l];
  return title ? `https://${l}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` : null;
}
/** A Wikipedia search for a name, in the reader's language's Wikipedia. */
export const wikiSearch = (name: string) => `https://${current}.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(name)}`;
/** Stories, lives and guides are written in English and Spanish: in another language they show in English. */
export const proseInEnglish = () => current !== 'en' && current !== 'es';
/** A language read from files (Portuguese, French, German), not written in the code. */
export const fileLang = proseInEnglish;
/** A month's name (0 is January), as the phone's calendar writes it in the reader's language, with a capital. */
export function monthName(m: number, short = false): string {
  const s = new Intl.DateTimeFormat(appLocale(), { month: short ? 'short' : 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2001, ((m % 12) + 12) % 12, 15)));
  return s.charAt(0).toLocaleUpperCase(appLocale()) + s.slice(1);
}

/** A string of the table in both languages (for labels that switch with the language). */
export function both(key: string): { en: string; es: string } {
  const row = STRINGS[key];
  return row ? { en: row[0], es: row[1] } : { en: key, es: key };
}

export function tx(text: { en: string; es?: string; ctx?: string } | undefined): string {
  if (!text) return '';
  return out(pick(text.en, text.es, text.ctx));
}

/** The phone's language (v0.35.0): the first of its languages the app speaks, English otherwise. */
export function detectLang(): Lang {
  for (const tag of phoneTags()) {
    const b = base(tag);
    if (isLang(b)) return b;
  }
  return 'en';
}

let localeCache: string | null = null;
/**
 * How numbers and dates are written (v0.35.0): the phone's own way when it speaks the app's language (es-MX writes
 * 10,935.5; es-ES and es-AR 10.935,5; en-US May 3; en-GB 3 May), else Latin America's, Spain's, Britain's, Brazil's,
 * France's or Germany's.
 */
export function appLocale(): string {
  if (localeCache) return localeCache;
  const fallback = current === 'es' ? (spanish === 'spain' ? 'es-ES' : 'es-419') : { en: 'en-GB', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE' }[current];
  const mine = phoneTags().find((t) => base(t) === current && regionOf(t));
  let loc = mine ?? fallback;
  try {
    loc = Intl.getCanonicalLocales(loc)[0] ?? fallback;
    if (!Intl.NumberFormat.supportedLocalesOf([loc]).length) loc = fallback;
  } catch { loc = fallback; }
  localeCache = loc;
  return loc;
}
/** Numbers and dates are written the phone's way (it speaks the app's language). */
export const localeFromPhone = () => phoneTags().some((t) => base(t) === current && !!regionOf(t));
const locale = appLocale;

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
