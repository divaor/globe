// Wild world (v0.30.0): which animals the app keeps, their group, their emoji and the hand-made parts of their data.
//
//   node scripts/data/wild/choose.mjs        writes scripts/data/wild/raw/chosen.json: the candidates whose range
//                                            fetch-wild.mjs ranges asks GBIF for (build-wild.mjs picks the ~400)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const RAW = path.join(ROOT, 'scripts/data/wild/raw');

/**
 * Animals kept whatever their fame: the best known of each region and ocean, and the animals lost in the last 500
 * years. `gone` is the year the last one died (or was last seen); `range` their last range, by hand, as
 * [lon, lat, radius in km] circles (GBIF's few old records of them are mostly museum drawers); `story` the step of
 * the Lost and saved story that tells it.
 */
export const EXTRA = [
  // ---- Gone in the last 500 years ----
  { sci: 'Raphus cucullatus', gone: 1662, place: { en: 'Mauritius', es: 'Mauricio' }, range: [[57.57, -20.28, 40]], story: 2 },
  { sci: 'Bos primigenius', gone: 1627, place: { en: 'Jaktorów Forest, Poland', es: 'Bosque de Jaktorów, Polonia' }, range: [[20.5, 52.1, 140], [23.8, 52.7, 110]], story: 1 },
  { sci: 'Hydrodamalis gigas', gone: 1768, place: { en: 'Commander Islands', es: 'Islas Comandante' }, range: [[166.2, 55.0, 120]], story: 3 },
  { sci: 'Pinguinus impennis', gone: 1844, place: { en: 'Eldey, Iceland', es: 'Eldey, Islandia' }, range: [[-22.95, 63.74, 90], [-53.75, 49.75, 120], [-8.5, 57.8, 100]], story: 4 },
  { sci: 'Equus quagga quagga', gone: 1883, place: { en: 'Karoo, South Africa', es: 'Karoo, Sudáfrica' }, range: [[22.5, -32.3, 230], [25.5, -30.5, 200]], story: 5 },
  { sci: 'Ectopistes migratorius', gone: 1914, place: { en: 'Cincinnati Zoo, United States', es: 'Zoológico de Cincinnati, Estados Unidos' }, range: [[-85, 40, 600], [-78, 42, 450], [-90, 36, 400]], story: 7 },
  { sci: 'Conuropsis carolinensis', gone: 1918, place: { en: 'Eastern United States', es: 'Este de Estados Unidos' }, range: [[-84, 32, 450], [-88, 37, 350]] },
  { sci: 'Thylacinus cynocephalus', gone: 1936, place: { en: 'Tasmania', es: 'Tasmania' }, range: [[146.6, -42.0, 170]], story: 8 },
  { sci: 'Dusicyon australis', gone: 1876, place: { en: 'Falkland Islands', es: 'Islas Malvinas' }, range: [[-59.5, -51.7, 110]] },
  { sci: 'Camptorhynchus labradorius', gone: 1878, place: { en: 'Atlantic coast of North America', es: 'Costa atlántica de América del Norte' }, range: [[-71, 41.5, 250], [-74, 39.5, 200]] },
  { sci: 'Heteralocha acutirostris', gone: 1907, place: { en: 'North Island, New Zealand', es: 'Isla Norte, Nueva Zelanda' }, range: [[175.8, -40.3, 120]] },
  { sci: 'Traversia lyalli', gone: 1895, place: { en: 'Stephens Island, New Zealand', es: 'Isla Stephens, Nueva Zelanda' }, range: [[173.95, -40.67, 40]] },
  { sci: 'Melanoplus spretus', gone: 1902, place: { en: 'Great Plains, North America', es: 'Grandes Llanuras, América del Norte' }, range: [[-104, 42, 550], [-98, 46, 400]] },
  { sci: 'Glaucopsyche xerces', gone: 1941, place: { en: 'San Francisco, United States', es: 'San Francisco, Estados Unidos' }, range: [[-122.47, 37.76, 40]] },
  { sci: 'Rucervus schomburgki', gone: 1938, place: { en: 'Central Thailand', es: 'Centro de Tailandia' }, range: [[100.4, 14.8, 160]] },
  { sci: 'Hippotragus leucophaeus', gone: 1800, place: { en: 'Western Cape, South Africa', es: 'Cabo Occidental, Sudáfrica' }, range: [[19.9, -34.2, 110]] },
  { sci: 'Neomonachus tropicalis', gone: 1952, place: { en: 'Serranilla Bank, Caribbean', es: 'Banco Serranilla, Caribe' }, range: [[-79.8, 15.8, 250], [-86.5, 21.5, 220], [-76, 24, 250]] },
  { sci: 'Zalophus japonicus', gone: 1974, place: { en: 'Sea of Japan', es: 'Mar del Japón' }, range: [[131.87, 37.24, 160], [139.5, 41.5, 220]] },
  { sci: 'Incilius periglenes', gone: 1989, place: { en: 'Monteverde, Costa Rica', es: 'Monteverde, Costa Rica' }, range: [[-84.8, 10.3, 25]], story: 10 },
  { sci: 'Capra pyrenaica pyrenaica', gone: 2000, place: { en: 'Ordesa, Spanish Pyrenees', es: 'Ordesa, Pirineo español' }, range: [[-0.05, 42.65, 60]] },
  { sci: 'Lipotes vexillifer', gone: 2006, place: { en: 'Yangtze River, China', es: 'Río Yangtsé, China' }, range: [[112.5, 30.0, 220], [117.0, 30.8, 180]], story: 14 },
  { sci: 'Psephurus gladius', gone: 2003, place: { en: 'Yangtze River, China', es: 'Río Yangtsé, China' }, range: [[105.0, 29.0, 200], [112.0, 30.3, 200]] },
  { sci: 'Diceros bicornis longipes', gone: 2011, place: { en: 'Northern Cameroon', es: 'Norte de Camerún' }, range: [[14.2, 8.5, 160]] },
  { sci: 'Chelonoidis abingdonii', gone: 2012, place: { en: 'Pinta Island, Galápagos', es: 'Isla Pinta, Galápagos' }, range: [[-90.75, 0.58, 20]], story: 15 },
  { sci: 'Melomys rubicola', gone: 2009, place: { en: 'Bramble Cay, Australia', es: 'Cayo Bramble, Australia' }, range: [[143.88, -9.14, 20]] },
  { sci: 'Panthera tigris sondaica', gone: 1976, place: { en: 'Java, Indonesia', es: 'Java, Indonesia' }, range: [[110.5, -7.5, 260]] },

  // ---- The best known of each region and ocean ----
  ...['Pharomachrus mocinno', 'Vultur gryphus', 'Apteryx mantelli', 'Strigops habroptila', 'Ambystoma mexicanum', 'Phocoena sinus', 'Amblyrhynchus cristatus',
    'Sula nebouxii', 'Harpia harpyja', 'Opisthocomus hoazin', 'Hydrochoerus hydrochaeris', 'Myrmecophaga tridactyla', 'Chrysocyon brachyurus', 'Tremarctos ornatus',
    'Vicugna vicugna', 'Lama guanicoe', 'Rhea americana', 'Ara macao', 'Ramphastos toco', 'Phyllobates terribilis', 'Eunectes murinus', 'Melanosuchus niger',
    'Pygocentrus nattereri', 'Trichechus manatus', 'Bradypus variegatus', 'Choloepus hoffmanni', 'Alouatta palliata', 'Leontopithecus rosalia', 'Nasua nasua',
    'Dasypus novemcinctus', 'Tachyglossus aculeatus', 'Vombatus ursinus', 'Dacelo novaeguineae', 'Dromaius novaehollandiae', 'Casuarius casuarius', 'Osphranter rufus',
    'Setonix brachyurus', 'Menura novaehollandiae', 'Chlamydosaurus kingii', 'Moloch horridus', 'Carcharodon carcharias', 'Mobula birostris', 'Amphiprion ocellaris',
    'Paracanthurus hepatus', 'Chelonia mydas', 'Dermochelys coriacea', 'Caretta caretta', 'Eretmochelys imbricata', 'Dugong dugon', 'Monodon monoceros',
    'Delphinapterus leucas', 'Megaptera novaeangliae', 'Physeter macrocephalus', 'Tursiops truncatus', 'Aptenodytes forsteri', 'Aptenodytes patagonicus',
    'Pygoscelis adeliae', 'Diomedea exulans', 'Hydrurga leptonyx', 'Euphausia superba', 'Architeuthis dux', 'Physalia physalis', 'Aurelia aurita',
    'Tridacna gigas', 'Limulus polyphemus', 'Gecarcoidea natalis', 'Macrocheira kaempferi', 'Odontodactylus scyllarus', 'Thunnus thynnus', 'Latimeria chalumnae',
    'Crocodylus niloticus', 'Crocodylus porosus', 'Gavialis gangeticus', 'Alligator mississippiensis', 'Ophiophagus hannah', 'Dendroaspis polylepis',
    'Malayopython reticulatus', 'Iguana iguana', 'Furcifer pardalis', 'Chelonoidis niger', 'Aldabrachelys gigantea', 'Sphenodon punctatus', 'Heloderma suspectum',
    'Andrias japonicus', 'Proteus anguinus', 'Salamandra salamandra', 'Morpho menelaus', 'Ornithoptera alexandrae', 'Goliathus goliatus', 'Attacus atlas',
    'Atta cephalotes', 'Theraphosa blondi', 'Latrodectus mactans', 'Pandinus imperator', 'Schistocerca gregaria', 'Scarabaeus sacer', 'Lucanus cervus',
    'Coccinella septempunctata', 'Orycteropus afer', 'Smutsia temminckii', 'Suricata suricatta', 'Phacochoerus africanus', 'Syncerus caffer', 'Connochaetes taurinus',
    'Aepyceros melampus', 'Oryx gazella', 'Antidorcas marsupialis', 'Tragelaphus strepsiceros', 'Gorilla beringei', 'Gorilla gorilla', 'Mandrillus sphinx',
    'Cryptoprocta ferox', 'Balaeniceps rex', 'Phoeniconaias minor', 'Spheniscus demersus', 'Ceratotherium simum', 'Diceros bicornis', 'Crocuta crocuta',
    'Mellivora capensis', 'Theropithecus gelada', 'Vulpes zerda', 'Addax nasomaculatus', 'Rhinoceros unicornis', 'Pongo pygmaeus', 'Pongo abelii',
    'Helarctos malayanus', 'Melursus ursinus', 'Pavo cristatus', 'Grus japonensis', 'Aix galericulata', 'Bos mutus', 'Camelus ferus', 'Saiga tatarica',
    'Macaca fuscata', 'Carlito syrichta', 'Pithecophaga jefferyi', 'Buceros bicornis', 'Andrias davidianus', 'Anser indicus', 'Bison bison', 'Haliaeetus leucocephalus',
    'Ursus americanus', 'Antilocapra americana', 'Castor canadensis', 'Mephitis mephitis', 'Didelphis virginiana', 'Meleagris gallopavo', 'Geococcyx californianus',
    'Gymnogyps californianus', 'Archilochus colubris', 'Crotalus atrox', 'Cynomys ludovicianus', 'Bubo scandiacus', 'Fratercula arctica', 'Ovibos moschatus',
    'Vulpes lagopus', 'Lynx pardinus', 'Bison bonasus', 'Rupicapra rupicapra', 'Capra ibex', 'Erinaceus europaeus', 'Equus ferus przewalskii', 'Ailuropoda melanoleuca',
    'Okapia johnstoni', 'Varanus komodoensis', 'Danaus plexippus', 'Panthera leo persica', 'Acinonyx jubatus', 'Lycaon pictus', 'Hippopotamus amphibius',
    'Loxodonta africana', 'Loxodonta cyclotis', 'Elephas maximus', 'Panthera onca', 'Panthera uncia', 'Gulo gulo', 'Enhydra lutris', 'Odobenus rosmarus',
    'Ursus maritimus', 'Rangifer tarandus', 'Alces alces', 'Equus grevyi', 'Equus quagga', 'Giraffa camelopardalis', 'Struthio camelus', 'Ailurus fulgens',
    'Phascolarctos cinereus', 'Ornithorhynchus anatinus', 'Sarcophilus harrisii', 'Rhincodon typus', 'Orcinus orca', 'Balaenoptera musculus', 'Pan troglodytes', 'Pan paniscus',
  ].map((sci) => ({ sci })),
];

/** Names Wikidata lacks or gets wrong (its label is the Latin name, or a slip): [English, Latin American Spanish]. */
export const NAMES = {
  'Boa constrictor': ['Boa constrictor', 'Boa constrictora'], 'Helix pomatia': ['Roman snail', 'Caracol romano'],
  'Scarabaeus sacer': ['Sacred scarab', 'Escarabajo sagrado'], 'Odontodactylus scyllarus': ['Peacock mantis shrimp', 'Camarón mantis pavo real'],
  'Morpho menelaus': ['Menelaus blue morpho', 'Morfo azul'], 'Goliathus goliatus': ['Goliath beetle', 'Escarabajo Goliat'],
  'Malayopython reticulatus': ['Reticulated python', 'Pitón reticulada'], 'Neomonachus tropicalis': ['Caribbean monk seal', 'Foca monje del Caribe'],
};

/**
 * Wild animals whose domestic form GBIF files under them: dogs are Canis lupus familiaris, house pigs Sus scrofa
 * domesticus. Their sightings are taken away square by square (fetch-wild.mjs asks for both).
 */
export const DOMESTIC = { 'Canis lupus': 'Canis lupus familiaris', 'Sus scrofa': 'Sus scrofa domesticus' };

/** Living animals with a step of their own in the Lost and saved story (Life through time): its number. */
export const STORY = {
  'Bison bison': 6, 'Gymnogyps californianus': 9, 'Equus ferus przewalskii': 11, 'Oryx leucoryx': 11, 'Canis lupus': 12, 'Lynx pardinus': 13,
  'Strigops habroptila': 16, 'Ailuropoda melanoleuca': 17, 'Panthera leo persica': 17,
};

/** Never on the map: people, domestic animals, pets and pests that live wherever people do. */
export const EXCLUDE = new Set(['Homo sapiens', 'Felis catus', 'Canis familiaris', 'Canis lupus familiaris', 'Bos taurus', 'Bos indicus', 'Equus caballus', 'Equus asinus',
  'Ovis aries', 'Capra hircus', 'Sus domesticus', 'Gallus gallus domesticus', 'Gallus domesticus', 'Columba livia', 'Carassius auratus', 'Bombyx mori', 'Camelus dromedarius',
  'Camelus bactrianus', 'Lama glama', 'Vicugna pacos', 'Rattus norvegicus', 'Rattus rattus', 'Mus musculus', 'Poecilia reticulata', 'Cavia porcellus', 'Meleagris gallopavo domesticus',
  'Anser anser domesticus', 'Numida meleagris', 'Melopsittacus undulatus', 'Serinus canaria', 'Mesocricetus auratus', 'Danio rerio', 'Betta splendens', 'Musca domestica',
  'Blattella germanica', 'Periplaneta americana', 'Cimex lectularius', 'Pediculus humanus', 'Aedes aegypti', 'Anopheles gambiae', 'Culex pipiens', 'Drosophila melanogaster',
  'Caenorhabditis elegans', 'Lumbricus terrestris', 'Taenia solium', 'Ascaris lumbricoides', 'Sarcoptes scabiei', 'Ixodes ricinus', 'Pulex irritans', 'Felis silvestris catus',
  'Oryctolagus cuniculus domesticus', 'Bubalus bubalis', 'Chelonoidis nigra nigra', 'Chelonoidis nigra', 'Equus ferus', 'Columba livia domestica', 'Equus africanus asinus', 'Cairina moschata domestica']);

/**
 * Animals people carried around the world: their dots only where they are native (continents of countries-meta's
 * `ct`, and the sea around them). House sparrows in Buenos Aires, rabbits in Australia and carp in America stay off.
 */
export const NATIVE = {
  'Passer domesticus': ['EU', 'AS', 'AF'], 'Sturnus vulgaris': ['EU', 'AS'], 'Cyprinus carpio': ['EU', 'AS'], 'Oryctolagus cuniculus': ['EU', 'AF'],
  'Vulpes vulpes': ['EU', 'AS', 'NA', 'AF'], 'Sus scrofa': ['EU', 'AS', 'AF'], 'Cervus elaphus': ['EU', 'AS', 'AF'], 'Anas platyrhynchos': ['EU', 'AS', 'NA', 'AF'],
  'Apis mellifera': ['EU', 'AF', 'AS'], 'Rhinella marina': ['SA', 'NA'], 'Myocastor coypus': ['SA'], 'Procyon lotor': ['NA'], 'Sciurus carolinensis': ['NA'],
  'Neogale vison': ['NA'], 'Neovison vison': ['NA'], 'Trachemys scripta': ['NA'], 'Lithobates catesbeianus': ['NA'], 'Oncorhynchus mykiss': ['NA', 'AS'],
  'Salmo trutta': ['EU', 'AS', 'AF'], 'Acridotheres tristis': ['AS'], 'Corvus splendens': ['AS'], 'Psittacula krameri': ['AF', 'AS'], 'Lepus europaeus': ['EU', 'AS'],
  'Dama dama': ['EU', 'AS'], 'Phasianus colchicus': ['AS'], 'Ondatra zibethicus': ['NA'], 'Urva auropunctata': ['AS'], 'Herpestes javanicus': ['AS'],
  'Myiopsitta monachus': ['SA'], 'Pterois volitans': ['AS', 'OC'], 'Ctenopharyngodon idella': ['AS'], 'Oreochromis niloticus': ['AF'], 'Micropterus salmoides': ['NA'],
  'Gambusia affinis': ['NA'], 'Bubalus arnee': ['AS'], 'Cygnus olor': ['EU', 'AS'], 'Branta canadensis': ['NA'], 'Alopochen aegyptiaca': ['AF'],
  'Columba palumbus': ['EU', 'AS', 'AF'], 'Streptopelia decaocto': ['EU', 'AS'], 'Carduelis carduelis': ['EU', 'AS', 'AF'], 'Turdus merula': ['EU', 'AS', 'AF'],
  'Erithacus rubecula': ['EU', 'AS', 'AF'], 'Achatina fulica': ['AF'], 'Lissachatina fulica': ['AF'], 'Harmonia axyridis': ['AS'], 'Vespa velutina': ['AS'],
  'Ammotragus lervia': ['AF'], 'Capra aegagrus': ['AS', 'EU'], 'Axis axis': ['AS'], 'Macropus rufogriseus': ['OC'], 'Trichosurus vulpecula': ['OC'],
  'Mustela erminea': ['EU', 'AS', 'NA'], 'Mustela furo': ['EU'], 'Felis silvestris': ['EU', 'AS', 'AF'], 'Canis lupus dingo': ['OC'], 'Erinaceus europaeus': ['EU'],
};

const MARINE_MAMMALS = new Set(['Balaenidae', 'Balaenopteridae', 'Eschrichtiidae', 'Neobalaenidae', 'Delphinidae', 'Phocoenidae', 'Monodontidae', 'Physeteridae', 'Kogiidae',
  'Ziphiidae', 'Platanistidae', 'Iniidae', 'Lipotidae', 'Pontoporiidae', 'Phocidae', 'Otariidae', 'Odobenidae', 'Dugongidae', 'Trichechidae']);
const SEA_TURTLES = new Set(['Cheloniidae', 'Dermochelyidae']);
const FISH = new Set(['Elasmobranchii', 'Actinopterygii', 'Actinopteri', 'Holocephali', 'Coelacanthi', 'Dipneusti', 'Sarcopterygii', 'Petromyzonti', 'Myxini', 'Cephalaspidomorphi', 'Teleostei']);
const FISH_ORDERS = /iformes$/;
const LAND_CRUSTACEANS = new Set(['Coenobitidae', 'Gecarcinidae', 'Astacidae', 'Cambaridae', 'Parastacidae', 'Potamidae', 'Armadillidiidae', 'Porcellionidae', 'Oniscidae']);

/**
 * The animal's group for the filter's Show option: mammals, birds, reptiles (and amphibians), sea (fish and sea life)
 * or small (insects and other small creatures); `g2` a second group it also shows under (a whale is sea life and a
 * mammal; a sea turtle sea life and a reptile).
 */
export function groupOf(t) {
  const c = t?.class, o = t?.order ?? '', f = t?.family ?? '', ph = t?.phylum;
  if (c === 'Mammalia') return MARINE_MAMMALS.has(f) ? { g: 'sea', g2: 'mammals' } : { g: 'mammals' };
  if (c === 'Aves') return { g: 'birds' };
  if (['Reptilia', 'Squamata', 'Crocodylia', 'Testudines', 'Rhynchocephalia', 'Lepidosauria', 'Sphenodontia', 'Amphibia'].includes(c) || ['Rhynchocephalia', 'Sphenodontia'].includes(o) || f === 'Sphenodontidae') {
    if (SEA_TURTLES.has(f) || ['Hydrophiinae'].includes(t?.subfamily)) return { g: 'sea', g2: 'reptiles' };
    return { g: 'reptiles' };
  }
  if (FISH.has(c) || (ph === 'Chordata' && !c && FISH_ORDERS.test(o))) return { g: 'sea' };
  if (['Cephalopoda', 'Bivalvia', 'Scyphozoa', 'Hydrozoa', 'Anthozoa', 'Cubozoa', 'Asteroidea', 'Echinoidea', 'Holothuroidea', 'Ophiuroidea', 'Merostomata', 'Polyplacophora'].includes(c)
    || ph === 'Cnidaria' || ph === 'Echinodermata' || ph === 'Porifera' || ph === 'Ctenophora') return { g: 'sea' };
  if (c === 'Malacostraca' || c === 'Hexanauplia' || c === 'Maxillopoda') return LAND_CRUSTACEANS.has(f) ? { g: 'small' } : { g: 'sea' };
  if (c === 'Gastropoda') return ['Achatinidae', 'Helicidae', 'Achatinellidae', 'Limacidae', 'Arionidae'].includes(f) ? { g: 'small' } : { g: 'sea' };
  return { g: 'small' };
}

// ---- Emoji ----------------------------------------------------------------------------------------------------
const BY_GENUS = {
  Panthera: '🐆', Acinonyx: '🐆', Neofelis: '🐆', Puma: '🐆', Uncia: '🐆',
  Lutra: '🦦', Enhydra: '🦦', Pteronura: '🦦', Aonyx: '🦦', Lontra: '🦦', Hydrictis: '🦦', Meles: '🦡', Mellivora: '🦡', Taxidea: '🦡', Arctonyx: '🦡', Gulo: '🦡', Vulpes: '🦊', Urocyon: '🦊', Otocyon: '🦊', Lycalopex: '🦊', Ailurus: '🦊', Ailuropoda: '🐼',
  Gorilla: '🦍', Pongo: '🦧', Bison: '🦬', Ovibos: '🦬', Bos: '🐂', Bubalus: '🐃', Syncerus: '🐃', Connochaetes: '🐃', Alces: '🫎', Camelus: '🐫', Lama: '🦙', Vicugna: '🦙',
  Capra: '🐐', Rupicapra: '🐐', Oreamnos: '🐐', Hemitragus: '🐐', Ammotragus: '🐐', Pseudois: '🐐', Ovis: '🐏', Giraffa: '🦒', Okapia: '🦒', Castor: '🦫',
  Hydrochoerus: '🦫', Ornithorhynchus: '🦫', Tachyglossus: '🦔', Zaglossus: '🦔', Cricetus: '🐹', Pavo: '🦚', Afropavo: '🦚', Meleagris: '🦃', Gallus: '🐓',
  Raphus: '🦤', Pezophaps: '🦤', Cygnus: '🦢', Anser: '🪿', Branta: '🪿', Chen: '🪿', Pinguinus: '🐧', Megaptera: '🐳', Delphinapterus: '🐳', Monodon: '🐳', Orcinus: '🐳',
  Mammuthus: '🦣', Octopus: '🐙', Enteroctopus: '🐙', Hapalochlaena: '🐙', Nautilus: '🐚', Tridacna: '🐚', Limulus: '🦀', Physalia: '🪼', Mobula: '🐟',
};
const BY_FAMILY = {
  Felidae: '🐈', Canidae: '🐺', Mustelidae: '🦦', Herpestidae: '🐾', Ursidae: '🐻', Procyonidae: '🦝', Mephitidae: '🦨', Hyaenidae: '🐺', Elephantidae: '🦣', Rhinocerotidae: '🦏', Hippopotamidae: '🦛',
  Tapiridae: '🐖', Suidae: '🐗', Tayassuidae: '🐗', Camelidae: '🦙', Cervidae: '🦌', Moschidae: '🦌', Tragulidae: '🦌', Antilocapridae: '🦌', Bovidae: '🦌', Equidae: '🦓',
  Hominidae: '🐒', Hylobatidae: '🐒', Cercopithecidae: '🐒', Cebidae: '🐒', Atelidae: '🐒', Pitheciidae: '🐒', Aotidae: '🐒', Callitrichidae: '🐒', Lemuridae: '🐒',
  Indriidae: '🐒', Daubentoniidae: '🐒', Lorisidae: '🐒', Galagidae: '🐒', Tarsiidae: '🐒', Cheirogaleidae: '🐒', Lepilemuridae: '🐒', Sciuridae: '🐿️',
  Castoridae: '🦫', Muridae: '🐁', Cricetidae: '🐁', Hystricidae: '🦔', Erethizontidae: '🦔', Caviidae: '🐹', Chinchillidae: '🐁', Dipodidae: '🐁', Gliridae: '🐁',
  Leporidae: '🐇', Ochotonidae: '🐇', Erinaceidae: '🦔', Bradypodidae: '🦥', Megalonychidae: '🦥', Choloepodidae: '🦥', Macropodidae: '🦘', Potoroidae: '🦘',
  Phascolarctidae: '🐨', Vombatidae: '🐨', Didelphidae: '🐀', Petauridae: '🐿️', Phalangeridae: '🐿️', Dasyuridae: '🐾', Thylacinidae: '🐅',
  Phocidae: '🦭', Otariidae: '🦭', Odobenidae: '🦭', Dugongidae: '🦭', Trichechidae: '🦭', Balaenidae: '🐋', Balaenopteridae: '🐋', Eschrichtiidae: '🐋',
  Physeteridae: '🐋', Kogiidae: '🐋', Ziphiidae: '🐋', Neobalaenidae: '🐋', Delphinidae: '🐬', Phocoenidae: '🐬', Platanistidae: '🐬', Iniidae: '🐬', Lipotidae: '🐬',
  Pontoporiidae: '🐬', Soricidae: '🐁', Talpidae: '🐁', Procaviidae: '🐹', Tupaiidae: '🐿️',
  Accipitridae: '🦅', Pandionidae: '🦅', Cathartidae: '🦅', Falconidae: '🦅', Sagittariidae: '🦅', Strigidae: '🦉', Tytonidae: '🦉', Psittacidae: '🦜',
  Psittaculidae: '🦜', Cacatuidae: '🦜', Strigopidae: '🦜', Nestoridae: '🦜', Ramphastidae: '🦜', Bucerotidae: '🦜', Spheniscidae: '🐧', Phoenicopteridae: '🦩',
  Anatidae: '🦆', Columbidae: '🕊️', Phasianidae: '🐓', Odontophoridae: '🐓', Numididae: '🐓', Cracidae: '🐓', Megapodiidae: '🐓', Corvidae: '🐦‍⬛',
  Crocodylidae: '🐊', Alligatoridae: '🐊', Gavialidae: '🐊', Varanidae: '🦎', Iguanidae: '🦎', Chamaeleonidae: '🦎', Agamidae: '🦎', Gekkonidae: '🦎', Lacertidae: '🦎',
  Helodermatidae: '🦎', Scincidae: '🦎', Teiidae: '🦎', Phrynosomatidae: '🦎', Anguidae: '🦎', Sphenodontidae: '🦎', Dactyloidae: '🦎', Corytophanidae: '🦎',
  Pomacentridae: '🐠', Acanthuridae: '🐠', Chaetodontidae: '🐠', Pomacanthidae: '🐠', Labridae: '🐠', Scaridae: '🐠', Syngnathidae: '🐠', Scorpaenidae: '🐠',
  Serranidae: '🐠', Lutjanidae: '🐠', Ostraciidae: '🐠', Balistidae: '🐠', Tetraodontidae: '🐡', Diodontidae: '🐡',
  Octopodidae: '🐙', Argonautidae: '🐙', Architeuthidae: '🦑', Loliginidae: '🦑', Ommastrephidae: '🦑', Sepiidae: '🦑', Cranchiidae: '🦑', Nautilidae: '🐚',
  Nephropidae: '🦞', Palinuridae: '🦞', Scyllaridae: '🦞', Euphausiidae: '🦐', Penaeidae: '🦐', Palaemonidae: '🦐', Odontodactylidae: '🦐', Squillidae: '🦐',
  Apidae: '🐝', Vespidae: '🐝', Megachilidae: '🐝', Formicidae: '🐜', Termitidae: '🐜', Coccinellidae: '🐞', Culicidae: '🦟', Muscidae: '🪰', Calliphoridae: '🪰',
  Blattidae: '🪳', Ectobiidae: '🪳', Theraphosidae: '🕷️', Scorpionidae: '🦂', Buthidae: '🦂', Pandinidae: '🦂',
};
const BY_ORDER = {
  Chiroptera: '🦇', Primates: '🐒', Lagomorpha: '🐇', Rodentia: '🐁', Pilosa: '🐾', Cingulata: '🐾', Pholidota: '🐾', Tubulidentata: '🐾', Proboscidea: '🐘',
  Cetacea: '🐋', Sirenia: '🦭', Monotremata: '🦫', Diprotodontia: '🦘', Dasyuromorphia: '🐾', Afrosoricida: '🦔', Eulipotyphla: '🐁', Hyracoidea: '🐹', Scandentia: '🐿️', Dermoptera: '🦇',
  Accipitriformes: '🦅', Falconiformes: '🦅', Strigiformes: '🦉', Psittaciformes: '🦜', Sphenisciformes: '🐧', Phoenicopteriformes: '🦩', Anseriformes: '🦆',
  Columbiformes: '🕊️', Galliformes: '🐓', Crocodylia: '🐊', Testudines: '🐢', Anura: '🐸', Caudata: '🦎', Urodela: '🦎', Gymnophiona: '🪱',
  Lamniformes: '🦈', Carcharhiniformes: '🦈', Orectolobiformes: '🦈', Squaliformes: '🦈', Hexanchiformes: '🦈', Heterodontiformes: '🦈', Pristiophoriformes: '🦈', Squatiniformes: '🦈',
  Myliobatiformes: '🐟', Rajiformes: '🐟', Torpediniformes: '🐟', Rhinopristiformes: '🐟', Tetraodontiformes: '🐡', Octopoda: '🐙', Teuthida: '🦑', Oegopsida: '🦑',
  Myopsida: '🦑', Sepiida: '🦑', Decapoda: '🦀', Euphausiacea: '🦐', Stomatopoda: '🦐', Lepidoptera: '🦋', Hymenoptera: '🐝', Coleoptera: '🪲', Orthoptera: '🦗',
  Mantodea: '🦗', Phasmida: '🦗', Odonata: '🦗', Diptera: '🪰', Blattodea: '🪳', Araneae: '🕷️', Scorpiones: '🦂', Ixodida: '🕷️', Opiliones: '🕷️',
  Scleractinia: '🪸', Alcyonacea: '🪸', Semaeostomeae: '🪼', Rhizostomeae: '🪼', Cubozoa: '🪼', Siphonophorae: '🪼', Actiniaria: '🪸', Xiphosura: '🦀',
};
const BY_CLASS = {
  Mammalia: '🐾', Aves: '🐦', Testudines: '🐢', Crocodylia: '🐊', Squamata: '🦎', Reptilia: '🦎', Amphibia: '🐸', Elasmobranchii: '🦈', Insecta: '🪲', Arachnida: '🕷️', Gastropoda: '🐌',
  Bivalvia: '🐚', Cephalopoda: '🐙', Malacostraca: '🦀', Scyphozoa: '🪼', Hydrozoa: '🪼', Cubozoa: '🪼', Anthozoa: '🪸', Clitellata: '🪱', Chilopoda: '🐛', Diplopoda: '🐛',
  Asteroidea: '⭐', Echinoidea: '🦔', Merostomata: '🦀',
};
const SNAKES = new Set(['Colubridae', 'Elapidae', 'Viperidae', 'Pythonidae', 'Boidae', 'Natricidae', 'Lamprophiidae', 'Typhlopidae', 'Homalopsidae', 'Acrochordidae', 'Dipsadidae', 'Leptotyphlopidae', 'Aniliidae', 'Atractaspididae']);
const ZEBRAS = new Set(['Equus quagga', 'Equus grevyi', 'Equus zebra', 'Equus quagga quagga']);

/** The animal's emoji: by species, genus, family, order or class, the closest that phones draw. */
export function emojiOf(sci, t) {
  const sp = { 'Panthera leo': '🦁', 'Panthera leo persica': '🦁', 'Panthera tigris': '🐅', 'Panthera tigris sondaica': '🐅', 'Ursus maritimus': '🐻‍❄️', 'Equus ferus': '🐎',
    'Equus ferus przewalskii': '🐎', 'Equus hemionus': '🫏', 'Equus kiang': '🫏', 'Equus africanus': '🫏', 'Canis lupus': '🐺', 'Carlito syrichta': '🐒',
    'Struthio camelus': '🐦', 'Gecarcoidea natalis': '🦀', 'Birgus latro': '🦀', 'Bos primigenius': '🐂', 'Hydrodamalis gigas': '🦭', 'Psephurus gladius': '🐟',
    'Melanoplus spretus': '🦗', 'Glaucopsyche xerces': '🦋', 'Rhincodon typus': '🦈', 'Diceros bicornis longipes': '🦏', 'Capra pyrenaica pyrenaica': '🐐',
    'Euphausia superba': '🦐', 'Aurelia aurita': '🪼' }[sci];
  if (sp) return sp;
  if (ZEBRAS.has(sci)) return '🦓';
  const g = t?.genus, f = t?.family, o = t?.order, c = t?.class;
  if (g && BY_GENUS[g]) return BY_GENUS[g];
  if (g === 'Rattus') return '🐀';
  if (f && SNAKES.has(f)) return '🐍';
  if (f === 'Equidae') return '🐎';
  if (f && BY_FAMILY[f]) return BY_FAMILY[f];
  if (o && BY_ORDER[o]) return BY_ORDER[o];
  if (c && BY_CLASS[c]) return BY_CLASS[c];
  if (t?.phylum === 'Chordata' && FISH_ORDERS.test(o ?? '')) return '🐟';
  if (FISH.has(c)) return '🐟';
  if (t?.phylum === 'Cnidaria') return '🪼';
  return '🐾';
}

// ---- The pool of candidates whose ranges are asked for ---------------------------------------------------------
/** Per group, how many of the best known candidates to ask GBIF about (the build picks from these). */
const POOL = { mammals: 320, birds: 240, reptiles: 140, sea: 220, small: 110 };

/** Wikidata's first scientific name for a few animals is not the usual one. */
export const SCI_ALIAS = { 'Iguana loca': 'Iguana iguana', Spoderman: 'Apis mellifera', 'la papallona grisa': 'Parnassius apollo', 'Emys orbicularitosa': 'Emys orbicularis' };

export function pool(species) {
  const extra = new Map(EXTRA.map((e) => [e.sci, e]));
  const by = { mammals: [], birds: [], reptiles: [], sea: [], small: [] };
  for (let s of species) {
    if (!s.tax || EXCLUDE.has(s.sci) || s.tax.kingdom !== 'Animalia') continue;
    if (SCI_ALIAS[s.sci]) s = { ...s, sci: SCI_ALIAS[s.sci] };
    const e = extra.get(s.sci);
    const gone = e?.gone ?? null;
    // Prehistoric animals have no IUCN status, so they are not candidates; animals extinct long before 1500 neither.
    if (!e && s.status.some((x) => x === 'Q237350' || x === 'Q239509')) continue;
    const { g, g2 } = groupOf(s.tax);
    by[g].push({ ...s, g, g2: g2 ?? null, gone, must: !!e });
  }
  const out = [];
  for (const [g, list] of Object.entries(by)) {
    list.sort((a, b) => b.must - a.must || b.sl - a.sl);
    const musts = list.filter((x) => x.must);
    out.push(...musts, ...list.filter((x) => !x.must).slice(0, Math.max(0, POOL[g] - musts.length)));
  }
  const seen = new Set();
  return out.filter((s) => !seen.has(s.qid) && !seen.has(s.sci) && seen.add(s.qid) && seen.add(s.sci))
    .map((s) => ({ id: s.sci.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''), ...s }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const species = JSON.parse(fs.readFileSync(path.join(RAW, 'species.json'), 'utf8'));
  const chosen = pool(species);
  const missing = EXTRA.filter((e) => !chosen.some((c) => c.sci === e.sci)).map((e) => e.sci);
  fs.writeFileSync(path.join(RAW, 'chosen.json'), JSON.stringify(chosen) + '\n');
  const n = {}; for (const c of chosen) n[c.g] = (n[c.g] ?? 0) + 1;
  console.log(`chosen.json: ${chosen.length}`, n);
  if (missing.length) console.log(`not found on Wikidata/GBIF: ${missing.join(', ')}`);
}
