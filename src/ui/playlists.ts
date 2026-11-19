// Screensaver playlists for ambient mode: ready-made runs of filters and places, each with a line to read aloud,
// and the reader's own playlist (views added from the map, kept in this browser, shareable as a link).
import { ArrowUp, ArrowDown, X, Plus, Play, Share2 } from 'lucide';
import { h, icon, toggle, slider, segmented } from './dom';
import { tx, L, Lc } from '../app/i18n';
import type { App, AmbientNames } from '../app/app';
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
  /** Inside the Earth (v0.32.0): the globe cut open, to scale, peeled down to a layer. */
  cut?: { peel?: number; focus?: string };
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
    id: 'restless', icon: '🌋', name: T('Restless Earth', 'La Tierra inquieta'), desc: T('Plates, volcanoes, earthquakes and the mountains they raise, and the Earth cut open.', 'Placas, volcanes, terremotos y las montañas que levantan, y la Tierra abierta.'),
    items: [
      { stack: ['relief', 'plates'], options: { plates: { motion: true } }, say: T('The tectonic plates. The Earth’s shell is broken into pieces that move a few centimetres a year: the arrows show which way, and the longer the faster. The Pacific Plate is among the fastest, about 7 cm a year.', 'Las placas tectónicas. La corteza de la Tierra está rota en piezas que se mueven unos centímetros al año: las flechas muestran hacia dónde, y cuanto más largas, más rápido. La placa del Pacífico está entre las más rápidas, unos 7 cm al año.') },
      { stack: ['relief', 'plates', 'volcanoes'], options: { plates: { motion: false }, volcanoes: { named: 'Mount Fuji,Krakatoa (Anak Krakatau),Mount Pinatubo,Mount St. Helens,Popocatépetl,Cotopaxi,Villarrica,Ruapehu,Klyuchevskaya Sopka,Tambora' } }, fly: [-170, 8, 1.1], title: T('The Ring of Fire', 'El Cinturón de Fuego'), say: T('Volcanoes of the last 10,000 years. Three in four ring the Pacific Ocean, along the Ring of Fire: Fuji, Krakatoa, Pinatubo, Mount St. Helens, Popocatépetl, Cotopaxi and Ruapehu.', 'Los volcanes de los últimos 10 000 años. Tres de cada cuatro rodean el océano Pacífico, en el Cinturón de Fuego: el Fuji, el Krakatoa, el Pinatubo, el Santa Helena, el Popocatépetl, el Cotopaxi y el Ruapehu.') },
      { stack: ['relief', 'plates', 'quakes'], say: T('The earthquakes of the last days, live. Most happen where plates meet.', 'Los terremotos de los últimos días, en vivo. La mayoría ocurre donde se encuentran las placas.') },
      { stack: ['relief', 'quake-depths'], fly: [178, -18, 2.6], title: T('Deep earthquakes under Tonga', 'Sismos profundos bajo Tonga'), say: T('Earthquakes since 1970, by depth. Under Tonga and Fiji the Pacific Plate dives into the mantle, and the quakes follow it down to 700 km: red near the surface, then yellow, blue and purple, deeper and deeper.', 'Los terremotos desde 1970, por profundidad. Bajo Tonga y Fiyi la placa del Pacífico se hunde en el manto, y los sismos la siguen hasta 700 km: rojos cerca de la superficie, luego amarillos, azules y morados, cada vez más hondo.') },
      { stack: ['relief', 'hotspots-mantle'], fly: [-170, 28, 2.4], title: T('The Hawaiian hotspot', 'El punto caliente de Hawái'), say: T('A plume of hot rock rises under Hawaii. The Pacific Plate slides over it, so the islands get older to the north-west: Kauaʻi about 5 million years, Midway 28, and the Emperor seamounts up to 82.', 'Una columna de roca caliente sube bajo Hawái. La placa del Pacífico se desliza encima, así que las islas son más viejas hacia el noroeste: Kauaʻi tiene unos 5 millones de años, Midway 28, y los montes submarinos del Emperador hasta 82.') },
      { stack: ['relief', 'plates', 'landforms'], options: { plates: { motion: true } }, fly: [-70, -20, 2.4], say: T('The Andes, still rising where the Nazca Plate slides under South America, about 7 cm a year.', 'Los Andes, que siguen elevándose donde la placa de Nazca se hunde bajo Sudamérica, unos 7 cm al año.') },
      { stack: ['relief', 'plates', 'landforms'], options: { plates: { motion: true } }, fly: [85, 29, 2.6], say: T('The Himalayas, raised by the Indian Plate pushing into Asia, about 5 cm a year.', 'El Himalaya, levantado por la placa India al empujar contra Asia, unos 5 cm al año.') },
      { stack: ['relief'], cut: {}, fly: [20, 24, 1.1], title: T('Inside the Earth', 'El interior de la Tierra'), say: T('The Earth cut open, to scale: a thin crust, the rocky mantle down to 2,891 km, the liquid outer core and the solid inner core, 6,371 km down.', 'La Tierra abierta, a escala: una corteza delgada, el manto de roca hasta 2891 km, el núcleo externo líquido y el núcleo interno sólido, a 6371 km.') },
    ],
  },
  {
    // v0.33.0: Into the deep.
    id: 'deep', icon: '🫗', name: T('Into the deep', 'A las profundidades'), desc: T('The sea floor, the oceans drained away step by step, the trenches, plankton and ice through the year.', 'El fondo del mar, los océanos vaciándose paso a paso, las fosas, el plancton y el hielo a lo largo del año.'),
    items: [
      { stack: ['seafloor'], fly: [-150, 0, 1.1], title: T('The sea floor', 'El fondo del mar'), say: T('The Pacific by depth: the sunlit shelves at the edges, then the twilight and midnight zones, the abyss and, in the darkest blue, the trenches.', 'El Pacífico por profundidad: las plataformas iluminadas en los bordes, luego las zonas de penumbra y de medianoche, el abismo y, en el azul más oscuro, las fosas.') },
      { stack: ['sealevel'], options: { sealevel: { level: '-120' } }, fly: [120, 5, 1.6], title: T('The Ice Age seas', 'Los mares de la Edad de Hielo'), say: T('The sea 120 metres lower, as 20,000 years ago: Borneo, Java and Sumatra join Asia, and Australia joins New Guinea.', 'El mar 120 metros más bajo, como hace 20 000 años: Borneo, Java y Sumatra se unen a Asia, y Australia a Nueva Guinea.') },
      { stack: ['sealevel'], options: { sealevel: { level: '-120' } }, fly: [-170, 62, 1.8], title: T('Beringia', 'Beringia'), say: T('Asia and America joined by a land bridge, the way the first Americans came.', 'Asia y América unidas por un puente de tierra, el camino de los primeros americanos.') },
      { stack: ['sealevel'], options: { sealevel: { level: '-2000' } }, fly: [-30, 25, 1.2], title: T('The shelves run dry', 'Las plataformas se secan'), say: T('Two kilometres lower: the continental shelves are dry land, and the oceans shrink to their deep basins.', 'Dos kilómetros más abajo: las plataformas continentales son tierra firme y los océanos se encogen a sus cuencas profundas.') },
      { stack: ['sealevel'], options: { sealevel: { level: '-4000' } }, fly: [-30, 0, 1.1], title: T('The ridges rise', 'Surgen las dorsales'), say: T('Four kilometres lower: the Mid-Atlantic Ridge rises like a mountain range down the middle of the ocean.', 'Cuatro kilómetros más abajo: la dorsal mesoatlántica surge como una cordillera por el medio del océano.') },
      { stack: ['sealevel'], options: { sealevel: { level: '-8000' } }, fly: [150, 15, 1.3], title: T('Only the trenches', 'Solo las fosas'), say: T('Eight kilometres lower, only the trenches still hold water: the Mariana, the Philippine, the Kuril.', 'Ocho kilómetros más abajo, solo las fosas conservan agua: la de las Marianas, la de Filipinas, la de las Kuriles.') },
      { stack: ['seafloor', 'sea-features'], fly: [142.5, 13, 3.2], title: T('The Mariana Trench', 'La fosa de las Marianas'), say: T('The deepest place on Earth, the Challenger Deep, almost eleven kilometres down.', 'El lugar más profundo de la Tierra, el abismo Challenger, a casi once kilómetros.') },
      { stack: ['living-ocean'], options: { 'living-ocean': { show: 'plankton', month: 'play' } }, fly: [-30, 35, 1.2], title: T('Plankton through the year', 'El plancton a lo largo del año'), say: T('The sea’s meadows: plankton blooms in the North Atlantic each spring and along the coasts where cold water wells up.', 'Las praderas del mar: el plancton florece cada primavera en el Atlántico Norte y en las costas donde aflora el agua fría.') },
      { stack: ['living-ocean'], options: { 'living-ocean': { show: 'ice', month: 'play' } }, fly: [0, 80, 1.2], title: T('Sea ice through the year', 'El hielo marino a lo largo del año'), say: T('The Arctic ice grows through the winter and shrinks each summer.', 'El hielo del Ártico crece en invierno y se encoge cada verano.') },
      { stack: ['sealevel'], options: { sealevel: { level: '70' } }, fly: [100, 20, 1.6], title: T('If all the ice melted', 'Si se derritiera todo el hielo'), say: T('The sea 70 metres higher: the land so low would be under water. Heights only, not a forecast.', 'El mar 70 metros más alto: la tierra así de baja quedaría bajo el agua. Solo alturas, no un pronóstico.') },
      { stack: ['wrecks'], options: { wrecks: { era: 'famous' } }, fly: [-30, 40, 1.3], title: T('Famous shipwrecks', 'Naufragios famosos'), say: T('The Titanic, the Lusitania, the Bismarck and more, at their resting places.', 'El Titanic, el Lusitania, el Bismarck y más, donde descansan.') },
    ],
  },
  {
    id: 'water', icon: '🌊', name: T('Water and weather', 'Agua y clima'), desc: T('Rain, heat, wind, seas and rivers.', 'Lluvia, calor, viento, mares y ríos.'),
    items: [
      { stack: ['precipitation'], say: T('Rain and snow in a year. The wettest lands lie near the equator.', 'La lluvia y la nieve de un año. Las tierras más húmedas están cerca del ecuador.') },
      { stack: ['temperature'], say: T('The average temperature of a year, on land and sea.', 'La temperatura media de un año, en tierra y mar.') },
      { stack: ['satellite', 'winds'], say: T('The prevailing winds: the trade winds, the westerlies and the monsoons.', 'Los vientos dominantes: los alisios, los vientos del oeste y los monzones.') },
      { stack: ['sst', 'currents'], say: SEA },
      { stack: ['satellite', 'rivers'], options: { rivers: { named: 'Amazonas,Negro,Madeira,Japurá,Xingu,Tapajós,Ucayali,Marañón' } }, fly: [-60, -4, 2.4], title: T('The Amazon', 'El Amazonas'), say: T('The Amazon, which carries more water than any other river, with its great tributaries: the Negro, the Madeira, the Japurá, the Tapajós and the Xingu.', 'El Amazonas, que lleva más agua que cualquier otro río, con sus grandes afluentes: el Negro, el Madeira, el Japurá, el Tapajós y el Xingú.') },
      { stack: ['satellite', 'rivers'], options: { rivers: { named: 'Nile,White Nile,Blue Nile,Atbara,Albert Nile,Victoria Nile,Mountain Nile,Nasser,Tana' } }, fly: [32, 14, 2.2], title: T('The Nile', 'El Nilo'), say: T('The Nile: the White Nile from the lakes of East Africa and the Blue Nile from Lake Tana meet at Khartoum, then flow north across the Sahara to the Mediterranean.', 'El Nilo: el Nilo Blanco, que viene de los lagos de África oriental, y el Nilo Azul, del lago Tana, se unen en Jartum y corren hacia el norte a través del Sahara hasta el Mediterráneo.') },
    ],
  },
  {
    id: 'life', icon: '🐾', name: T('Life on Earth', 'La vida en la Tierra'), desc: T('Forests, deserts and the animals that live there.', 'Bosques, desiertos y los animales que los habitan.'),
    items: [
      { stack: ['vegetation'], say: T('What grows where: rainforest, savanna, desert, forest, taiga and tundra.', 'Qué crece dónde: selva, sabana, desierto, bosque, taiga y tundra.') },
      { stack: ['realms'], say: T('The animal realms: regions whose animals share a long history.', 'Las regiones zoogeográficas: zonas cuyos animales comparten una larga historia.') },
      { stack: ['vegetation', 'animals'], say: T('Famous animals where they live in the wild.', 'Animales famosos donde viven en libertad.') },
      { stack: ['satellite', 'migrations'], say: T('Great migrations: terns, monarch butterflies, whales, wildebeest and red crabs.', 'Las grandes migraciones: charranes, mariposas monarca, ballenas, ñus y cangrejos rojos.') },
      { stack: ['hotspots'], say: T('Biodiversity hotspots: places with many species found nowhere else, and under threat.', 'Los puntos calientes de biodiversidad: lugares con muchas especies que no viven en ningún otro sitio, y amenazadas.') },
      { stack: ['national-animals'], say: T('Each country’s national animal.', 'El animal nacional de cada país.') },
    ],
  },
  {
    // v0.30.0: Wild world.
    id: 'wild', icon: '🦁', name: T('Animals of the world', 'Animales del mundo'), desc: T('Where animals live, from the savanna to the ice, and their great journeys.', 'Dónde viven los animales, de la sabana al hielo, y sus grandes viajes.'),
    items: [
      { stack: ['vegetation', 'wild'], say: T('About 400 animals, each where people have seen it in the wild.', 'Unos 400 animales, cada uno donde se ha visto en libertad.') },
      { stack: ['ecoregions', 'wild'], options: { ecoregions: { by: 'biome', only: '7', named: 'Serengeti volcanic grasslands,Southern Acacia-Commiphora bushlands and thickets,Victoria Basin forest-savanna' }, wild: { pick: 'Panthera leo,Loxodonta africana,Giraffa camelopardalis,Equus quagga,Connochaetes taurinus' } }, fly: [35, -2.5, 4.6], title: T('The Serengeti', 'El Serengueti'), say: T('The savannas of East Africa, lit up: the Serengeti and the bushlands around it. Their great animals: lions, elephants, giraffes, zebras and wildebeest.', 'Las sabanas de África oriental, resaltadas: el Serengueti y los matorrales que lo rodean. Sus grandes animales: leones, elefantes, jirafas, cebras y ñus.') },
      { stack: ['ecoregions', 'wild'], options: { ecoregions: { by: 'biome', only: '1', named: 'Southwest Amazon moist forests,Madeira-Tapajós moist forests,Japurá-Solimões-Negro moist forests,Tapajós-Xingu moist forests' }, wild: { pick: 'Panthera onca,Ara macao,Inia geoffrensis,Eunectes murinus,Bradypus variegatus,Choloepus hoffmanni' } }, fly: [-62, -5, 3.4], title: T('The Amazon', 'La Amazonía'), say: T('The Amazon rainforest, lit up: jaguars, scarlet macaws, pink river dolphins, green anacondas and sloths.', 'La selva amazónica, resaltada: jaguares, guacamayas rojas, delfines rosados, anacondas verdes y perezosos.') },
      { stack: ['ecoregions', 'wild'], options: { ecoregions: { by: 'biome', only: '1', named: 'Borneo lowland rain forests,Sumatran lowland rain forests' }, wild: { pick: 'Pongo pygmaeus,Pongo abelii,Panthera tigris,Dicerorhinus sumatrensis,Buceros bicornis' } }, fly: [108, 1, 4.2], title: T('Borneo and Sumatra', 'Borneo y Sumatra'), say: T('The rainforests of Borneo and Sumatra, lit up: orangutans, tigers, the Sumatran rhinoceros and the great hornbill.', 'Las selvas de Borneo y Sumatra, resaltadas: orangutanes, tigres, el rinoceronte de Sumatra y el cálao bicorne.') },
      { stack: ['wild'], options: { wild: { pick: 'Osphranter rufus,Phascolarctos cinereus,Vombatus ursinus,Dromaius novaehollandiae,Ornithorhynchus anatinus' } }, fly: [140, -27, 2.8], title: T('Australia', 'Australia'), say: T('Red kangaroos, koalas, wombats, emus and the platypus: animals found nowhere else.', 'Canguros rojos, koalas, wombats, emúes y el ornitorrinco: animales que no viven en ningún otro lugar.') },
      { stack: ['wild'], options: { wild: { status: 'endangered' } }, say: T('Threatened animals, ringed by how close they are to the edge.', 'Los animales amenazados, con un anillo según lo cerca que están del límite.') },
      { stack: ['wild'], options: { wild: { status: 'gone' } }, say: T('Animals lost in the last 500 years, where they once lived: the dodo, the thylacine, the passenger pigeon.', 'Animales perdidos en los últimos 500 años, donde vivían: el dodo, el tilacino, la paloma migratoria.') },
      { stack: ['satellite', 'migrations'], say: T('Great migrations through the year: 31 journeys by land, sea and air.', 'Las grandes migraciones a lo largo del año: 31 viajes por tierra, mar y aire.') },
      { stack: ['wild-parks'], say: T('National parks and nature reserves: the best places to see wild animals.', 'Parques nacionales y reservas naturales: los mejores lugares para ver animales salvajes.') },
    ],
  },
  {
    // v0.31.0: Green planet.
    id: 'green', icon: '🌿', name: T('Green planet', 'Planeta verde'), desc: T('Plants, great trees and the planet breathing through the seasons.', 'Plantas, grandes árboles y el planeta que respira con las estaciones.'),
    items: [
      { stack: ['greenness'], say: T('The breathing planet: how green the land is, month by month. Spring sweeps north, then south.', 'El planeta que respira: qué tan verde está la tierra mes a mes. La primavera sube al norte y luego baja al sur.') },
      { stack: ['vegetation', 'plants'], say: T('About 300 plants, each where it grows wild: trees, flowers, cacti and the wild forms of our food.', 'Unas 300 plantas, cada una donde crece silvestre: árboles, flores, cactus y las formas silvestres de nuestros alimentos.') },
      { stack: ['ecoregions', 'plants'], options: { ecoregions: { by: 'biome', only: '13', named: 'Sonoran desert,Chihuahuan desert,Mojave desert,Baja California desert' }, plants: { show: 'cacti', pick: 'Carnegiea gigantea,Stenocereus thurberi,Pachycereus pringlei,Cylindropuntia bigelovii,Cylindropuntia fulgida,Ferocactus wislizeni,Opuntia engelmannii,Echinocereus triglochidiatus,Agave parryi,Lophophora williamsii' } }, fly: [-110, 30, 5], title: T('The deserts of North America', 'Los desiertos de Norteamérica'),
        say: T('The deserts, lit up: the Sonoran and Chihuahuan deserts, the Mojave to the north and the Baja California desert. Their cacti and agaves: saguaro, organ pipe, the giant cardón, teddy-bear and jumping chollas, fishhook barrel cactus, Engelmann’s prickly pear, claret cup, Parry’s agave and peyote.',
          'Los desiertos, resaltados: los de Sonora y Chihuahua, el de Mojave al norte y el de Baja California. Sus cactus y agaves: saguaro, pitaya dulce, cardón, choya güera y choya brincadora, biznaga de agua, nopal de Engelmann, pitaya de copa, agave de Parry y peyote.') },
      { stack: ['ecoregions', 'plants'], options: { ecoregions: { by: 'biome', only: '1', named: 'Borneo lowland rain forests,Borneo montane rain forests,Sumatran lowland rain forests,Sumatran montane rain forests' }, plants: { show: 'strange', pick: 'Rafflesia arnoldi,Amorphophallus titanum,Nepenthes rajah,Nepenthes bicalcarata,Rafflesia keithii,Tacca chantrieri' } }, fly: [108, 1, 4.4], title: T('Strange plants of Borneo and Sumatra', 'Plantas extrañas de Borneo y Sumatra'),
        say: T('The rainforests of Borneo and Sumatra, lit up, are home to strange plants: the corpse lily, the biggest flower on Earth, the titan arum, the giant and fanged pitcher plants that trap insects, Keith’s rafflesia and the black bat flower.',
          'Las selvas de Borneo y Sumatra, resaltadas, son el hogar de plantas extrañas: la rafflesia, la flor más grande de la Tierra, la flor cadáver, las plantas jarro gigante y de colmillos que atrapan insectos, la rafflesia de Keith y la flor murciélago.') },
      { stack: ['trees'], fly: [-120, 40, 3.2], title: T('Giants of California', 'Gigantes de California'), say: T('The tallest, the biggest and the oldest trees on Earth all grow in California.', 'Los árboles más altos, más grandes y más viejos de la Tierra crecen en California.') },
      { stack: ['ecoregions'], say: T('846 ecoregions, each with its own mix of plants and animals, coloured by biome.', '846 ecorregiones, cada una con su propia mezcla de plantas y animales, coloreadas por bioma.') },
      { stack: ['calendar'], say: T('Nature’s calendar: what is in bloom, turning gold or on the move this month.', 'El calendario de la naturaleza: qué está en flor, dorándose o en movimiento este mes.') },
      { stack: ['crops'], options: { crops: { arrows: true } }, say: T('Where our food first grew, and how it travelled the world.', 'Dónde se cultivaron por primera vez nuestros alimentos, y cómo viajaron por el mundo.') },
      { stack: ['gardens'], say: T('Botanical gardens and arboretums around the world.', 'Jardines botánicos y arboretos de todo el mundo.') },
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
      { stack: ['relief', 'plates', 'volcanoes'], options: { plates: { motion: false }, volcanoes: { named: 'Popocatépetl,Paricutín,Volcán de Fuego,Masaya,Arenal,Nevado del Ruiz,Cotopaxi,Chimborazo,Láscar,Ojos del Salado,Villarrica' } }, fly: [-85, 5, 1.9], say: T('Volcanoes along the Pacific coast, from Popocatépetl and Paricutín in Mexico to Cotopaxi in Ecuador and Villarrica in Chile.', 'Volcanes a lo largo de la costa del Pacífico, del Popocatépetl y el Paricutín en México al Cotopaxi en Ecuador y el Villarrica en Chile.') },
      { stack: ['regional-languages'], options: { 'regional-languages': { pick: 'que,aym,grn,nah,yua,arn,zap,tzo,tzh,guc,mop,ote' } }, fly: [-75, -12, 1.6], title: T('Indigenous languages', 'Lenguas indígenas'), say: T('Spanish and Portuguese are the main languages, but many regions speak Indigenous languages too, lit up here: Quechua and Aymara in the Andes, Guaraní in Paraguay, Nahuatl, Maya and Zapotec in Mexico, Mapudungun in Chile.', 'El español y el portugués son las lenguas principales, pero muchas regiones hablan también lenguas indígenas, resaltadas aquí: quechua y aimara en los Andes, guaraní en Paraguay, náhuatl, maya y zapoteco en México, mapudungun en Chile.') },
      { stack: ['heritage'], options: { heritage: { pick: '414,483,64,274,1,715,303,285' } }, fly: [-80, -2, 1.8], say: T('World Heritage, from Teotihuacan and Chichén Itzá to Tikal, Machu Picchu, the Galápagos, Rapa Nui, the Iguazú Falls and Cartagena.', 'El Patrimonio Mundial, de Teotihuacan y Chichén Itzá a Tikal, Machu Picchu, las Galápagos, Rapa Nui, las cataratas del Iguazú y Cartagena.') },
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

/** Names on the map while ambient mode plays: the view's own (default; the map's countries, cities and seas hidden),
 *  all of them, or none. In the screensaver's panel and in Settings. */
export function ambientNamesField(app: App): HTMLElement {
  return h('div', { class: 'field ambient-names' }, h('div', { class: 'field-label' }, L('Names on the map', 'Nombres en el mapa')),
    segmented<AmbientNames>(app.ambient.names, [
      { value: 'view', label: L('Only the view’s', 'Solo los de la vista') },
      { value: 'all', label: L('All', 'Todos') },
      { value: 'none', label: Lc('no playlist', 'None', 'Ninguno') },
    ], (v) => { app.ambient.names = v; app.save(); }));
}

// ---- The panel --------------------------------------------------------------------------------------
/** The screensaver panel: playlists to start, the reader's own (add this view, order, remove, share), and the
 * screensaver's settings. `start` starts ambient mode with a playlist ('' for just the filters on the map). */
export function screensaverPanel(app: App, start: (id: string) => void, toast: (msg: string) => void): HTMLElement {
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
      card('', '🖼️', L('Just my filters', 'Solo mis filtros'), L('The globe turns with the filters you have on.', 'El globo gira con los filtros que tienes puestos.')),
      ...PLAYLISTS.map((p) => card(p.id, p.icon, tx(p.name), tx(p.desc), p.items.length)),
    ));
    // The reader's own playlist.
    const mine = myItems();
    const add = h('button', { type: 'button', class: 'pill primary' }, icon(Plus, 16), L('Add this view', 'Agregar esta vista'));
    add.addEventListener('click', () => {
      const it = currentView(app);
      if (!it.stack.length) return;
      saveMine([...myItems(), it].slice(0, 40));
      toast(L('View added to your playlist', 'Vista agregada a tu lista'));
      render();
    });
    const rows = mine.map((it, i) => {
      const move = (d: -1 | 1) => { const l = myItems(); const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; saveMine(l); render(); };
      const btn = (ic: Parameters<typeof icon>[0], label: string, fn: () => void) => { const b = h('button', { type: 'button', class: 'icon-btn sm', title: label, 'aria-label': label }, icon(ic, 15)); b.addEventListener('click', fn); return b; };
      return h('div', { class: 'ss-row' },
        h('span', { class: 'ss-row-name' }, itemTitle(app, it), it.fly ? h('span', { class: 'muted small' }, ` · ${it.fly[1].toFixed(0)}°, ${it.fly[0].toFixed(0)}°`) : null),
        btn(ArrowUp, L('Up', 'Subir'), () => move(-1)), btn(ArrowDown, L('Down', 'Bajar'), () => move(1)),
        btn(X, L('Remove', 'Quitar'), () => { const l = myItems(); l.splice(i, 1); saveMine(l); render(); }));
    });
    const share = h('button', { type: 'button', class: 'pill' }, icon(Share2, 16), L('Share', 'Compartir'));
    share.addEventListener('click', async () => {
      const url = playlistLink(app, MINE_ID);
      try { await navigator.clipboard.writeText(url); toast(L('Link copied', 'Enlace copiado')); } catch { prompt(L('Copy the link:', 'Copia el enlace:'), url); }
    });
    root.append(
      h('h3', { class: 'sec-title' }, L('My playlist', 'Mi lista')),
      h('p', { class: 'muted small' }, L('Turn on filters, move the globe to a place, and add it. Your playlist is kept in this browser.', 'Pon filtros, mueve el globo a un lugar y agrégalo. Tu lista se guarda en este navegador.')),
      ...(mine.length ? [h('div', { class: 'ss-rows' }, ...rows)] : []),
      h('div', { class: 'settings-actions' }, add, mine.length ? card(MINE_ID, '⭐', L('Play my playlist', 'Reproducir mi lista'), L('{0, plural, one {# view} other {# views}}', '{0, plural, one {# vista} other {# vistas}}', mine.length)) : null, mine.length ? share : null),
    );
    // Settings.
    const amb = app.ambient;
    root.append(
      h('h3', { class: 'sec-title' }, L('Settings', 'Ajustes')),
      h('div', { class: 'field' }, h('div', { class: 'field-label' }, L('Seconds on each view: ', 'Segundos en cada vista: '), h('span', { class: 'ss-secs' }, String(amb.secs))),
        slider(amb.secs, 15, 120, 5, (v) => { amb.secs = v; app.save(); const l = root.querySelector('.ss-secs'); if (l) l.textContent = String(v); })),
      h('div', { class: 'field' }, h('div', { class: 'field-label' }, L('Rotation speed', 'Velocidad de giro')), slider(amb.speed, 0.25, 4, 0.25, (v) => { amb.speed = v; app.save(); })),
      ambientNamesField(app),
      h('div', { class: 'toggles' },
        ...(canSpeak() ? [toggle(amb.narrate, (v) => { amb.narrate = v; app.save(); }, L('Read each view aloud', 'Leer cada vista en voz alta'))] : []),
        toggle(amb.clock, (v) => { amb.clock = v; app.save(); }, L('Show the clock', 'Mostrar el reloj'))),
    );
  };
  render();
  return root;
}
