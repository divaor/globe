// Green planet (v0.31.0): which plants the app keeps, their group, their emoji and the hand-made parts of their data.
//
//   node scripts/data/green/choose-green.mjs   writes scripts/data/green/raw/chosen.json: the candidates whose range
//                                              fetch-green.mjs ranges asks GBIF for (build-green.mjs picks the ~250)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const RAW = path.join(ROOT, 'scripts/data/green/raw');

/** Plants kept whatever their fame: the best known of each region, the record holders and the strange ones. */
export const EXTRA = [
  'Carnegiea gigantea', 'Welwitschia mirabilis', 'Dracaena cinnabari', 'Dracaena draco', 'Araucaria araucana', 'Adansonia digitata', 'Adansonia grandidieri',
  'Sequoiadendron giganteum', 'Sequoia sempervirens', 'Cedrus libani', 'Rhizophora mangle', 'Leontopodium nivale', 'Protea cynaroides', 'Rafflesia arnoldi',
  'Amorphophallus titanum', 'Dionaea muscipula', 'Nepenthes rajah', 'Nelumbo nucifera', 'Tulipa sylvestris', 'Victoria amazonica', 'Puya raimondii',
  'Yucca brevifolia', 'Pinus longaeva', 'Wollemia nobilis', 'Ginkgo biloba', 'Metasequoia glyptostroboides', 'Aloidendron dichotomum', 'Ceiba pentandra',
  'Bertholletia excelsa', 'Hevea brasiliensis', 'Theobroma cacao', 'Coffea arabica', 'Vanilla planifolia', 'Olea europaea', 'Phoenix dactylifera',
  'Cocos nucifera', 'Ilex paraguariensis', 'Jacaranda mimosifolia', 'Swietenia macrophylla', 'Tectona grandis', 'Eucalyptus regnans', 'Banksia serrata',
  'Anigozanthos manglesii', 'Xanthorrhoea preissii', 'Argyroxiphium sandwicense', 'Agathis australis', 'Metrosideros excelsa', 'Nothofagus pumilio',
  'Fitzroya cupressoides', 'Polylepis australis', 'Espeletia grandiflora', 'Prunus serrulata', 'Acer palmatum', 'Cinchona officinalis',
  'Opuntia ficus-indica', 'Agave americana', 'Lithops lesliei', 'Mimosa pudica', 'Drosera rotundifolia', 'Sarracenia purpurea', 'Pinguicula vulgaris',
  'Strelitzia reginae', 'Bougainvillea spectabilis', 'Delonix regia', 'Handroanthus impetiginosus', 'Erythrina crista-galli', 'Lapageria rosea',
  'Monstera deliciosa', 'Tillandsia usneoides', 'Victoria cruziana', 'Ceroxylon quindiuense', 'Lodoicea maldivica', 'Phyllostachys edulis', 'Dendrocalamus giganteus',
  'Shorea robusta', 'Santalum album', 'Myristica fragrans', 'Syzygium aromaticum', 'Piper nigrum', 'Cinnamomum verum', 'Camellia sinensis', 'Musa acuminata',
  'Mangifera indica', 'Ananas comosus', 'Persea americana', 'Solanum tuberosum', 'Capsicum annuum', 'Malus sieversii', 'Vitis vinifera', 'Castanea sativa',
  'Ficus benghalensis', 'Ficus religiosa', 'Quercus robur', 'Fagus sylvatica', 'Betula pendula', 'Pinus sylvestris', 'Picea abies', 'Larix sibirica',
  'Lavandula angustifolia', 'Helianthus annuus', 'Papaver rhoeas', 'Eschscholzia californica', 'Lupinus texensis', 'Hyacinthoides non-scripta',
  'Narcissus pseudonarcissus', 'Galanthus nivalis', 'Rhododendron arboreum', 'Chrysanthemum morifolium', 'Echinocactus grusonii',
  'Cereus jamacaru', 'Euphorbia candelabrum', 'Kalanchoe daigremontiana', 'Pachypodium lamerei', 'Ravenala madagascariensis', 'Didierea madagascariensis',
  // Cacti and succulents of every dry land.
  'Opuntia engelmannii', 'Ferocactus wislizeni', 'Cylindropuntia bigelovii', 'Cylindropuntia fulgida', 'Stenocereus thurberi', 'Pachycereus pringlei',
  'Echinocereus triglochidiatus', 'Mammillaria elongata', 'Astrophytum asterias', 'Selenicereus grandiflorus', 'Selenicereus undatus', 'Schlumbergera truncata',
  'Echinopsis pachanoi', 'Cleistocactus strausii', 'Copiapoa cinerea', 'Browningia candelaris', 'Melocactus intortus', 'Gymnocalycium mihanovichii',
  'Aloe ferox', 'Aloe polyphylla', 'Aloe dichotoma', 'Euphorbia ingens', 'Euphorbia obesa', 'Agave tequilana', 'Agave parryi', 'Pachypodium geayi', 'Adenium obesum',
  'Dudleya brittonii', 'Portulacaria afra', 'Aeonium arboreum', 'Carpobrotus edulis', 'Haworthiopsis attenuata', 'Dorstenia gigas', 'Fockea edulis',
  // Carnivorous and strange.
  'Nepenthes attenboroughii', 'Nepenthes bicalcarata', 'Cephalotus follicularis', 'Darlingtonia californica', 'Drosera capensis', 'Drosera regia',
  'Drosophyllum lusitanicum', 'Utricularia vulgaris', 'Aldrovanda vesiculosa', 'Heliamphora nutans', 'Sarracenia flava', 'Sarracenia leucophylla',
  'Byblis liniflora', 'Pinguicula moranensis', 'Hydnora africana', 'Dracula simia', 'Wolffia arrhiza', 'Codariocalyx motorius', 'Selaginella lepidophylla',
  'Rafflesia keithii', 'Sapria himalayana', 'Tacca chantrieri', 'Dracunculus vulgaris', 'Ophrys apifera', 'Monotropa uniflora', 'Strongylodon macrobotrys',
  'Psychotria elata', 'Puya chilensis', 'Arisaema triphyllum',
  // Wildflowers and flowering trees of every continent.
  'Cypripedium calceolus', 'Phalaenopsis amabilis', 'Cattleya trianae', 'Gentiana acaulis', 'Telopea speciosissima', 'Swainsona formosa', 'Heliconia rostrata',
  'Passiflora caerulea', 'Fuchsia magellanica', 'Alstroemeria aurea', 'Kniphofia uvaria', 'Agapanthus praecox', 'Clivia miniata', 'Zantedeschia aethiopica',
  'Nymphaea caerulea', 'Camellia japonica', 'Wisteria sinensis', 'Hydrangea macrophylla', 'Plumeria rubra', 'Saxifraga oppositifolia', 'Dryas octopetala',
  'Rhododendron ferrugineum', 'Tagetes erecta', 'Cosmos bipinnatus', 'Dahlia coccinea', 'Rudbeckia hirta', 'Echinacea purpurea', 'Asclepias tuberosa',
  'Trillium grandiflorum', 'Aquilegia caerulea', 'Castilleja miniata', 'Cornus florida', 'Cercis canadensis', 'Vachellia tortilis', 'Colophospermum mopane',
  'Koompassia excelsa', 'Bombax ceiba', 'Butea monosperma', 'Hura crepitans', 'Eucalyptus camaldulensis', 'Nothofagus menziesii', 'Dacrydium cupressinum',
].map((sci) => ({ sci }));

/** Never on the map: crops with no wild form (wheat, rice, maize… fields, not wild plants), hybrids and lab plants. */
export const EXCLUDE = new Set(['Triticum aestivum', 'Triticum durum', 'Oryza sativa', 'Zea mays', 'Hordeum vulgare', 'Avena sativa', 'Secale cereale', 'Glycine max',
  'Malus domestica', 'Pyrus communis', 'Citrus × sinensis', 'Citrus sinensis', 'Citrus × limon', 'Citrus limon', 'Citrus reticulata', 'Platanus × hispanica', 'Fragaria × ananassa',
  'Nicotiana tabacum', 'Cannabis sativa', 'Arabidopsis thaliana', 'Brassica oleracea', 'Brassica rapa', 'Brassica napus', 'Beta vulgaris', 'Allium cepa', 'Allium sativum',
  'Daucus carota', 'Lactuca sativa', 'Spinacia oleracea', 'Solanum lycopersicum', 'Solanum melongena', 'Cucumis sativus', 'Cucumis melo', 'Citrullus lanatus',
  'Phaseolus vulgaris', 'Pisum sativum', 'Lens culinaris', 'Cicer arietinum', 'Vicia faba', 'Sorghum bicolor', 'Saccharum officinarum', 'Gossypium hirsutum',
  'Linum usitatissimum', 'Prunus domestica', 'Prunus persica', 'Prunus armeniaca', 'Prunus dulcis', 'Juglans regia', 'Corylus avellana', 'Ribes rubrum',
  'Rosa × damascena', 'Musa × paradisiaca', 'Arachis hypogaea', 'Sesamum indicum', 'Hibiscus rosa-sinensis', 'Tulipa gesneriana', 'Ficus carica', 'Petroselinum crispum',
  'Ocimum basilicum', 'Coriandrum sativum', 'Mentha × piperita', 'Capsicum frutescens', 'Cucurbita pepo', 'Cucurbita maxima', 'Raphanus sativus', 'Apium graveolens',
  'Medicago sativa', 'Manihot esculenta', 'Ipomoea batatas', 'Colocasia esculenta', 'Dioscorea alata', 'Carica papaya', 'Psidium guajava', 'Punica granatum']);

/**
 * Plants people carried around the world (planted in gardens and streets, or weeds): their squares only where they
 * are native (continents of countries-meta's `ct`).
 */
export const NATIVE = {
  'Jacaranda mimosifolia': ['SA'], 'Eucalyptus globulus': ['OC'], 'Eucalyptus camaldulensis': ['OC'], 'Pinus radiata': ['NA'], 'Opuntia ficus-indica': ['NA'],
  'Agave americana': ['NA'], 'Lantana camara': ['NA', 'SA'], 'Coffea arabica': ['AF'], 'Theobroma cacao': ['SA', 'NA'], 'Musa acuminata': ['AS', 'OC'],
  'Mangifera indica': ['AS'], 'Cocos nucifera': ['AS', 'OC'], 'Phoenix dactylifera': ['AS', 'AF'], 'Olea europaea': ['EU', 'AF', 'AS'], 'Vitis vinifera': ['EU', 'AS'],
  'Persea americana': ['NA', 'SA'], 'Ananas comosus': ['SA'], 'Solanum tuberosum': ['SA'], 'Capsicum annuum': ['NA', 'SA'], 'Camellia sinensis': ['AS'],
  'Robinia pseudoacacia': ['NA'], 'Ailanthus altissima': ['AS'], 'Aesculus hippocastanum': ['EU'], 'Ginkgo biloba': ['AS'], 'Metasequoia glyptostroboides': ['AS'],
  'Sequoiadendron giganteum': ['NA'], 'Sequoia sempervirens': ['NA'], 'Ficus benghalensis': ['AS'], 'Ficus religiosa': ['AS'], 'Ficus elastica': ['AS'],
  'Bougainvillea spectabilis': ['SA'], 'Delonix regia': ['AF'], 'Taraxacum officinale': ['EU', 'AS'], 'Helianthus annuus': ['NA'], 'Cedrus deodara': ['AS'],
  'Acer palmatum': ['AS'], 'Prunus serrulata': ['AS'], 'Nelumbo nucifera': ['AS', 'OC'], 'Hevea brasiliensis': ['SA'], 'Tectona grandis': ['AS'],
  'Swietenia macrophylla': ['NA', 'SA'], 'Strelitzia reginae': ['AF'], 'Monstera deliciosa': ['NA'], 'Spathodea campanulata': ['AF'], 'Eichhornia crassipes': ['SA'],
  'Pontederia crassipes': ['SA'], 'Lavandula angustifolia': ['EU'], 'Rosa canina': ['EU', 'AS', 'AF'], 'Paeonia suffruticosa': ['AS'], 'Chrysanthemum morifolium': ['AS'],
  'Myristica fragrans': ['AS'], 'Syzygium aromaticum': ['AS'], 'Piper nigrum': ['AS'], 'Cinnamomum verum': ['AS'], 'Cinnamomum camphora': ['AS'],
  'Castanea sativa': ['EU', 'AS'], 'Platanus orientalis': ['EU', 'AS'], 'Cupressus sempervirens': ['EU', 'AS', 'AF'], 'Cedrus atlantica': ['AF'],
  'Araucaria heterophylla': ['OC'], 'Araucaria araucana': ['SA'], 'Tradescantia zebrina': ['NA'], 'Ricinus communis': ['AF'], 'Arundo donax': ['AS'],
  'Echinocactus grusonii': ['NA'], 'Kalanchoe daigremontiana': ['AF'], 'Aloe vera': ['AS'], 'Phyllostachys edulis': ['AS'], 'Bambusa vulgaris': ['AS'],
};

// Trees, flowers and fruits planted far from home in parks, streets and gardens (v0.31.0's hand-checked list): their
// squares only on their own continents. Russia counts as Europe here (countries-meta), so Siberia's plants list both.
const EU = ['EU'], EUAS = ['EU', 'AS'], EUASAF = ['EU', 'AS', 'AF'], NAm = ['NA'], SAm = ['SA'], AMER = ['NA', 'SA'], AF = ['AF'], AS = ['AS'], OC = ['OC'], ASOC = ['AS', 'OC'];
Object.assign(NATIVE, {
  'Quercus robur': EUAS, 'Fagus sylvatica': EU, 'Betula pendula': EUAS, 'Pinus sylvestris': EUAS, 'Picea abies': EU, 'Taxus baccata': EUASAF, 'Quercus suber': ['EU', 'AF'],
  'Quercus ilex': ['EU', 'AF'], 'Cedrus libani': AS, 'Larix decidua': EU, 'Abies alba': EU, 'Sorbus aucuparia': EUAS, 'Tilia cordata': EUAS, 'Pinus pinea': EUAS,
  'Argania spinosa': AF, 'Chamaerops humilis': ['EU', 'AF'], 'Larix sibirica': EUAS, 'Pinus cembra': EU, 'Pinus sibirica': EUAS, 'Populus tremula': EUAS,
  'Ilex aquifolium': EUASAF, 'Arbutus unedo': ['EU', 'AF'], 'Cryptomeria japonica': AS, 'Sciadopitys verticillata': AS, 'Shorea robusta': AS, 'Santalum album': ASOC,
  'Azadirachta indica': AS, 'Dendrocalamus giganteus': AS, 'Borassus flabellifer': AS, 'Magnolia champaca': AS, 'Pinus densiflora': AS, 'Bombax ceiba': ASOC,
  'Butea monosperma': AS, 'Koompassia excelsa': AS, 'Cassia fistula': AS, 'Prunus mume': AS, 'Adansonia digitata': AF, 'Adansonia grandidieri': AF,
  'Ravenala madagascariensis': AF, 'Kigelia africana': AF, 'Sclerocarya birrea': AF, 'Vachellia nilotica': ['AF', 'AS'], 'Vachellia tortilis': ['AF', 'AS'],
  'Colophospermum mopane': AF, 'Ficus sycomorus': ['AF', 'AS'], 'Ceiba pentandra': ['NA', 'SA', 'AF'], 'Vitellaria paradoxa': AF, 'Elaeis guineensis': AF,
  'Pseudotsuga menziesii': NAm, 'Acer saccharum': NAm, 'Acer rubrum': NAm, 'Quercus rubra': NAm, 'Taxodium distichum': NAm, 'Liriodendron tulipifera': NAm,
  'Magnolia grandiflora': NAm, 'Populus tremuloides': NAm, 'Pinus ponderosa': NAm, 'Thuja plicata': NAm, 'Picea sitchensis': NAm, 'Pinus strobus': NAm,
  'Cornus florida': NAm, 'Cercis canadensis': NAm, 'Hura crepitans': AMER, 'Yucca brevifolia': NAm, 'Pinus longaeva': NAm, 'Handroanthus impetiginosus': AMER,
  'Erythrina crista-galli': SAm, 'Fitzroya cupressoides': SAm, 'Nothofagus pumilio': SAm, 'Polylepis australis': SAm, 'Ceroxylon quindiuense': SAm,
  'Cinchona officinalis': SAm, 'Eucalyptus regnans': OC, 'Agathis australis': OC, 'Metrosideros excelsa': OC, 'Wollemia nobilis': OC, 'Banksia serrata': OC,
  'Xanthorrhoea preissii': OC, 'Casuarina equisetifolia': ASOC, 'Acacia dealbata': OC, 'Nothofagus menziesii': OC, 'Dacrydium cupressinum': OC,
  // Flowers.
  'Nelumbo nucifera': ASOC, 'Papaver rhoeas': EUASAF, 'Leontopodium nivale': EU, 'Galanthus nivalis': EUAS, 'Narcissus pseudonarcissus': EU, 'Hyacinthoides non-scripta': EU,
  'Eschscholzia californica': NAm, 'Lapageria rosea': SAm, 'Tulipa sylvestris': EUASAF, 'Rhododendron arboreum': AS, 'Lupinus texensis': NAm, 'Anigozanthos manglesii': OC,
  'Protea cynaroides': AF, 'Convallaria majalis': EUAS, 'Nymphaea alba': EUASAF, 'Calluna vulgaris': EU, 'Centaurea cyanus': EUAS, 'Digitalis purpurea': ['EU', 'AF'],
  'Iris pseudacorus': EUASAF, 'Lilium martagon': EUAS, 'Primula veris': EUAS, 'Viola tricolor': EUAS, 'Bellis perennis': EUASAF, 'Colchicum autumnale': EU,
  'Leucanthemum vulgare': EUAS, 'Euphorbia pulcherrima': NAm, 'Catharanthus roseus': AF, 'Cypripedium calceolus': EUAS, 'Phalaenopsis amabilis': ASOC,
  'Cattleya trianae': SAm, 'Gentiana acaulis': EU, 'Telopea speciosissima': OC, 'Swainsona formosa': OC, 'Heliconia rostrata': SAm, 'Passiflora caerulea': SAm,
  'Fuchsia magellanica': SAm, 'Alstroemeria aurea': SAm, 'Kniphofia uvaria': AF, 'Agapanthus praecox': AF, 'Clivia miniata': AF, 'Zantedeschia aethiopica': AF,
  'Nymphaea caerulea': ['AF', 'AS'], 'Camellia japonica': AS, 'Wisteria sinensis': AS, 'Hydrangea macrophylla': AS, 'Plumeria rubra': AMER, 'Rhododendron ferrugineum': EU,
  'Tagetes erecta': NAm, 'Cosmos bipinnatus': NAm, 'Dahlia coccinea': NAm, 'Rudbeckia hirta': NAm, 'Echinacea purpurea': NAm, 'Asclepias tuberosa': NAm,
  'Trillium grandiflorum': NAm, 'Aquilegia caerulea': NAm, 'Castilleja miniata': NAm,
  // Cacti and succulents (planted in every warm garden).
  'Carnegiea gigantea': NAm, 'Euphorbia candelabrum': AF, 'Cereus jamacaru': SAm, 'Lithops lesliei': AF, 'Aloidendron dichotomum': AF, 'Lophophora williamsii': NAm,
  'Sempervivum tectorum': EU, 'Crassula ovata': AF, 'Aloe arborescens': AF, 'Pachypodium lamerei': AF, 'Didierea madagascariensis': AF, 'Opuntia engelmannii': NAm,
  'Ferocactus wislizeni': NAm, 'Cylindropuntia bigelovii': NAm, 'Cylindropuntia fulgida': NAm, 'Stenocereus thurberi': NAm, 'Pachycereus pringlei': NAm,
  'Echinocereus triglochidiatus': NAm, 'Mammillaria elongata': NAm, 'Astrophytum asterias': NAm, 'Selenicereus grandiflorus': AMER, 'Selenicereus undatus': AMER,
  'Schlumbergera truncata': SAm, 'Echinopsis pachanoi': SAm, 'Cleistocactus strausii': SAm, 'Copiapoa cinerea': SAm, 'Browningia candelaris': SAm,
  'Melocactus intortus': AMER, 'Gymnocalycium mihanovichii': SAm, 'Aloe ferox': AF, 'Aloe polyphylla': AF, 'Euphorbia ingens': AF, 'Euphorbia obesa': AF,
  'Agave parryi': NAm, 'Agave tequilana': NAm, 'Adenium obesum': ['AF', 'AS'], 'Dudleya brittonii': NAm, 'Portulacaria afra': AF, 'Aeonium arboreum': ['AF', 'EU'],
  'Haworthiopsis attenuata': AF, 'Dorstenia gigas': AS,
  // Carnivorous and strange.
  'Mimosa pudica': AMER, 'Dionaea muscipula': NAm, 'Sarracenia purpurea': NAm, 'Sarracenia flava': NAm, 'Sarracenia leucophylla': NAm, 'Darlingtonia californica': NAm,
  'Cephalotus follicularis': OC, 'Drosera capensis': AF, 'Drosera regia': AF, 'Heliamphora nutans': SAm, 'Victoria amazonica': SAm, 'Victoria cruziana': SAm,
  'Tillandsia usneoides': AMER, 'Strongylodon macrobotrys': AS, 'Tacca chantrieri': AS, 'Codariocalyx motorius': ASOC, 'Pinguicula moranensis': NAm,
  // Curiosities grown in greenhouses and gardens everywhere: only where they grow wild.
  'Amorphophallus titanum': AS, 'Rafflesia arnoldi': AS, 'Rafflesia keithii': AS, 'Nepenthes rajah': AS, 'Nepenthes bicalcarata': AS, 'Dracaena cinnabari': AS,
  'Welwitschia mirabilis': AF, 'Hydnora africana': AF, 'Puya raimondii': SAm, 'Puya chilensis': SAm, 'Espeletia grandiflora': SAm,
  'Dracula simia': SAm, 'Psychotria elata': AMER, 'Selaginella lepidophylla': NAm, 'Arisaema triphyllum': NAm, 'Monotropa uniflora': ['NA', 'SA', 'AS'],
  'Dracunculus vulgaris': EU, 'Ophrys apifera': EUASAF, 'Wolffia arrhiza': EUASAF, 'Utricularia vulgaris': EUAS, 'Drosophyllum lusitanicum': ['EU', 'AF'],
  'Aldrovanda vesiculosa': ['EU', 'AS', 'AF', 'OC'], 'Pinguicula vulgaris': ['EU', 'NA'], 'Drosera rotundifolia': ['EU', 'AS', 'NA'],
  'Monstera deliciosa': NAm, 'Strelitzia reginae': AF, 'Bougainvillea spectabilis': SAm, 'Delonix regia': AF, 'Jacaranda mimosifolia': SAm, 'Ginkgo biloba': AS,
  'Metasequoia glyptostroboides': AS,
  // Food plants: only where they grow wild.
  'Piper nigrum': AS, 'Syzygium aromaticum': AS, 'Myristica fragrans': AS, 'Cinnamomum verum': AS, 'Vanilla planifolia': NAm, 'Ilex paraguariensis': SAm,
  'Bertholletia excelsa': SAm, 'Euterpe oleracea': SAm, 'Theobroma grandiflorum': SAm, 'Malus sieversii': AS, 'Pistacia vera': AS, 'Prunus amygdalus': AS,
  'Artocarpus heterophyllus': AS, 'Artocarpus altilis': ASOC, 'Tamarindus indica': AF, 'Anacardium occidentale': SAm, 'Annona cherimola': SAm, 'Litchi chinensis': AS,
  'Passiflora edulis': SAm, 'Garcinia mangostana': AS, 'Fragaria vesca': ['EU', 'AS', 'NA'], 'Vaccinium myrtillus': EUAS, 'Rubus idaeus': ['EU', 'AS', 'NA'],
  'Prunus avium': EUASAF, 'Humulus lupulus': ['EU', 'AS', 'NA'], 'Allium ursinum': EUAS, 'Laurus nobilis': EUASAF, 'Sambucus nigra': EUASAF,
});

/** Names Wikidata lacks or gets wrong: [English, Latin American Spanish] (names.json, checked by hand, has them all). */
export const NAMES = {};
/** Wikidata's first scientific name for a few plants is not the usual one. */
export const SCI_ALIAS = {};

const TREE_FAMILIES = new Set(['Fagaceae', 'Betulaceae', 'Juglandaceae', 'Ulmaceae', 'Platanaceae', 'Salicaceae', 'Magnoliaceae', 'Bignoniaceae', 'Meliaceae',
  'Araucariaceae', 'Taxaceae', 'Cupressaceae', 'Pinaceae', 'Sciadopityaceae', 'Podocarpaceae', 'Arecaceae', 'Rhizophoraceae', 'Dipterocarpaceae', 'Nothofagaceae',
  'Proteaceae', 'Sapotaceae', 'Lecythidaceae', 'Casuarinaceae', 'Ginkgoaceae', 'Lauraceae', 'Anacardiaceae', 'Simaroubaceae', 'Combretaceae', 'Santalaceae',
  'Moringaceae', 'Calophyllaceae', 'Clusiaceae', 'Myristicaceae', 'Annonaceae']);
const TREE_GENERA = new Set(['Acer', 'Aesculus', 'Fraxinus', 'Olea', 'Adansonia', 'Tilia', 'Ceiba', 'Eucalyptus', 'Corymbia', 'Melaleuca', 'Metrosideros', 'Ficus',
  'Artocarpus', 'Acacia', 'Vachellia', 'Albizia', 'Delonix', 'Ceratonia', 'Tamarindus', 'Erythrina', 'Swietenia', 'Tectona', 'Malus', 'Prunus', 'Pyrus', 'Sorbus',
  'Crataegus', 'Dracaena', 'Yucca', 'Cinchona', 'Hevea', 'Bertholletia', 'Ilex', 'Polylepis', 'Handroanthus', 'Tabebuia', 'Jacaranda', 'Spathodea', 'Sapium',
  'Robinia', 'Gleditsia', 'Sophora', 'Brachychiton', 'Theobroma', 'Coffea', 'Mangifera', 'Persea', 'Cocos', 'Phoenix', 'Washingtonia', 'Ceroxylon', 'Lodoicea',
  'Castanea', 'Paulownia', 'Catalpa', 'Liriodendron', 'Liquidambar', 'Nyssa', 'Taxodium', 'Cedrela', 'Khaya', 'Diospyros', 'Ravenala', 'Pachypodium', 'Didierea',
  'Aloidendron', 'Xanthorrhoea', 'Banksia', 'Grevillea', 'Morus', 'Citrus']);
const CACTI_FAMILIES = new Set(['Cactaceae', 'Crassulaceae', 'Aizoaceae', 'Didiereaceae', 'Didiereaceae']);
const CACTI_GENERA = new Set(['Agave', 'Aloe', 'Aloidendron', 'Haworthia', 'Haworthiopsis', 'Gasteria', 'Sansevieria', 'Lithops', 'Kalanchoe', 'Echeveria', 'Sedum', 'Sempervivum', 'Pachypodium', 'Adenium', 'Portulacaria', 'Dorstenia', 'Fockea', 'Dudleya', 'Aeonium', 'Carpobrotus']);
const CARNIVOROUS = new Set(['Droseraceae', 'Nepenthaceae', 'Sarraceniaceae', 'Lentibulariaceae', 'Cephalotaceae', 'Byblidaceae', 'Roridulaceae', 'Drosophyllaceae']);
const STRANGE = new Set(['Rafflesia arnoldi', 'Amorphophallus titanum', 'Welwitschia mirabilis', 'Mimosa pudica', 'Puya raimondii', 'Victoria amazonica', 'Victoria cruziana',
  'Tillandsia usneoides', 'Lodoicea maldivica', 'Dracaena cinnabari', 'Argyroxiphium sandwicense', 'Wolffia arrhiza', 'Hydnora africana', 'Espeletia grandiflora',
  'Dracula simia', 'Codariocalyx motorius', 'Selaginella lepidophylla', 'Rafflesia keithii', 'Sapria himalayana', 'Tacca chantrieri', 'Dracunculus vulgaris',
  'Ophrys apifera', 'Monotropa uniflora', 'Strongylodon macrobotrys', 'Psychotria elata', 'Puya chilensis', 'Arisaema triphyllum']);
export const FOOD = new Set(['Coffea arabica', 'Theobroma cacao', 'Vanilla planifolia', 'Solanum tuberosum', 'Musa acuminata', 'Mangifera indica', 'Ananas comosus',
  'Olea europaea', 'Vitis vinifera', 'Malus sieversii', 'Phoenix dactylifera', 'Capsicum annuum', 'Cocos nucifera', 'Bertholletia excelsa', 'Camellia sinensis',
  'Piper nigrum', 'Cinnamomum verum', 'Myristica fragrans', 'Syzygium aromaticum', 'Persea americana', 'Castanea sativa', 'Ilex paraguariensis', 'Vaccinium myrtillus',
  'Fragaria vesca', 'Rubus idaeus', 'Rubus fruticosus', 'Juglans nigra', 'Pistacia vera', 'Corylus colurna', 'Theobroma grandiflorum', 'Euterpe oleracea',
  'Cinchona officinalis', 'Humulus lupulus', 'Agave tequilana', 'Allium ursinum', 'Origanum vulgare', 'Thymus vulgaris', 'Rosmarinus officinalis', 'Salvia rosmarinus',
  'Laurus nobilis', 'Mentha spicata', 'Sambucus nigra', 'Prunus avium', 'Ribes nigrum', 'Vaccinium macrocarpon', 'Zingiber officinale', 'Curcuma longa']);

/** The plant's group for the filter's Show option. */
export function groupOf(t, sci) {
  const c = t?.class ?? '', f = t?.family ?? '', g = t?.genus ?? '', o = t?.order ?? '';
  if (FOOD.has(sci)) return 'food';
  if (STRANGE.has(sci) || CARNIVOROUS.has(f)) return 'strange';
  if (CACTI_FAMILIES.has(f) || CACTI_GENERA.has(g) || (g === 'Euphorbia' && /candelabrum|ingens|obesa|horrida/.test(sci))) return g === 'Pachypodium' && /lamerei/.test(sci) ? 'trees' : 'cacti';
  if (['Pinopsida', 'Ginkgoopsida', 'Cycadopsida'].includes(c) || ['Pinales', 'Ginkgoales', 'Araucariales', 'Cupressales'].includes(o) || TREE_FAMILIES.has(f) || TREE_GENERA.has(g)) return 'trees';
  if (f === 'Poaceae' && /Phyllostachys|Dendrocalamus|Bambusa|Guadua/.test(g)) return 'trees';
  return 'flowers';
}

const BY_SPECIES = {
  'Coffea arabica': '☕', 'Theobroma cacao': '🍫', 'Musa acuminata': '🍌', 'Mangifera indica': '🥭', 'Ananas comosus': '🍍', 'Olea europaea': '🫒', 'Vitis vinifera': '🍇',
  'Malus sieversii': '🍎', 'Capsicum annuum': '🌶️', 'Cocos nucifera': '🥥', 'Persea americana': '🥑', 'Solanum tuberosum': '🥔', 'Camellia sinensis': '🍵', 'Castanea sativa': '🌰',
  'Bertholletia excelsa': '🌰', 'Fragaria vesca': '🍓', 'Vaccinium myrtillus': '🫐', 'Prunus avium': '🍒', 'Nelumbo nucifera': '🪷', 'Helianthus annuus': '🌻',
  'Rafflesia arnoldi': '🏵️', 'Amorphophallus titanum': '🏵️', 'Protea cynaroides': '🏵️', 'Leontopodium nivale': '🌼', 'Prunus serrulata': '🌸', 'Lavandula angustifolia': '🪻',
  'Phoenix dactylifera': '🌴', 'Cinchona officinalis': '🌳', 'Zingiber officinale': '🫚',
};
const BY_GENUS = { Tulipa: '🌷', Rosa: '🌹', Hibiscus: '🌺', Helianthus: '🌻', Nelumbo: '🪷', Nymphaea: '🪷', Victoria: '🪷', Lavandula: '🪻', Hyacinthus: '🪻', Iris: '🪻', Muscari: '🪻',
  Hyacinthoides: '🪻', Acer: '🍁', Prunus: '🌸', Malus: '🌸', Magnolia: '🌸', Cerasus: '🌸', Papaver: '🌺', Eschscholzia: '🌺', Lilium: '🌺', Strelitzia: '🌺', Bougainvillea: '🌺',
  Paeonia: '🌸', Camellia: '🌸', Chrysanthemum: '🏵️', Protea: '🏵️', Trifolium: '☘️', Oxalis: '☘️', Phyllostachys: '🎋', Dendrocalamus: '🎋', Bambusa: '🎋', Ginkgo: '🍂',
  Ficus: '🌳', Quercus: '🌳', Adansonia: '🌳', Citrus: '🍊', Fragaria: '🍓', Rubus: '🫐', Vaccinium: '🫐', Mentha: '🌿', Ocimum: '🌿', Rosmarinus: '🌿', Thymus: '🌿', Salvia: '🌿' };
const BY_FAMILY = { Cactaceae: '🌵', Arecaceae: '🌴', Pinaceae: '🌲', Cupressaceae: '🌲', Araucariaceae: '🌲', Taxaceae: '🌲', Podocarpaceae: '🌲', Sciadopityaceae: '🌲',
  Orchidaceae: '🌺', Asteraceae: '🌼', Poaceae: '🌾', Lamiaceae: '🌿', Crassulaceae: '🪴', Aizoaceae: '🪴', Asparagaceae: '🪴', Asphodelaceae: '🪴', Didiereaceae: '🪴',
  Droseraceae: '🌿', Nepenthaceae: '🌿', Sarraceniaceae: '🌿', Lentibulariaceae: '🌿', Rosaceae: '🌸', Ranunculaceae: '🌼', Amaryllidaceae: '🌼', Liliaceae: '🌷',
  Fabaceae: '🌳', Moraceae: '🌳', Myrtaceae: '🌳', Fagaceae: '🌳', Betulaceae: '🌳', Malvaceae: '🌳', Bignoniaceae: '🌳', Salicaceae: '🌳', Ulmaceae: '🌳', Oleaceae: '🌳' };

/** The plant's emoji: by species, genus, family or group, the closest that phones draw. */
export function emojiOf(sci, t, group) {
  if (BY_SPECIES[sci]) return BY_SPECIES[sci];
  const g = t?.genus, f = t?.family;
  if (g && BY_GENUS[g]) return BY_GENUS[g];
  if (group === 'cacti') return f === 'Cactaceae' ? '🌵' : '🪴';
  if (group === 'strange') return BY_FAMILY[f] ?? '🌿';
  if (f && BY_FAMILY[f]) return group === 'trees' || !['🌳'].includes(BY_FAMILY[f]) ? BY_FAMILY[f] : '🌼';
  if (['Pinopsida', 'Cycadopsida'].includes(t?.class)) return '🌲';
  if (t?.class === 'Polypodiopsida') return '🌿';
  if (t?.class === 'Bryopsida' || t?.phylum === 'Bryophyta' || t?.phylum === 'Marchantiophyta') return '🌱';
  return group === 'trees' ? '🌳' : group === 'food' ? '🌿' : '🌼';
}

/** Per group, how many of the best known candidates to ask GBIF about (build-green.mjs picks from these). */
const POOL = { trees: 220, flowers: 200, cacti: 80, strange: 60, food: 70 };

/** The plants checked by hand (names.json: [English, Spanish, group]): always candidates, in their group. */
const CURATED_FILE = path.join(ROOT, 'scripts/data/green/names.json');
export const CURATED = fs.existsSync(CURATED_FILE) ? JSON.parse(fs.readFileSync(CURATED_FILE, 'utf8')) : {};

export function pool(species) {
  const extra = new Map([...EXTRA.map((e) => [e.sci, e]), ...Object.keys(CURATED).map((sci) => [sci, { sci }])]);
  const by = { trees: [], flowers: [], cacti: [], strange: [], food: [] };
  for (let s of species) {
    if (!s.tax || EXCLUDE.has(s.sci) || s.tax.kingdom !== 'Plantae' || /×| x /.test(s.sci)) continue;
    if (SCI_ALIAS[s.sci]) s = { ...s, sci: SCI_ALIAS[s.sci] };
    if (s.status?.some((x) => x === 'Q237350' || x === 'Q239509')) continue;
    const g = CURATED[s.sci]?.[2] ?? groupOf(s.tax, s.sci);
    by[g].push({ ...s, g, must: extra.has(s.sci) });
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
