#!/usr/bin/env node
/**
 * Builds the "States and provinces" quiz: the first-level regions of 48 countries, one TopoJSON
 * file each (public/data/regions/<A3>.json, object "regions": id, English and Spanish name, a
 * point inside), and public/data/regions/index.json (the countries, what their regions are
 * called, how many there are).
 *
 * Source: Natural Earth 10m admin-1 states and provinces (public domain), the copy that
 * build-base.mjs downloads into .cache/ne/ (node scripts/data/build-base.mjs --download).
 * France, Spain, Italy and the United Kingdom are grouped from Natural Earth's departments,
 * provinces and counties into their regions; names are fixed where Natural Earth is out of date.
 *
 *   node scripts/data/build-regions.mjs            build everything
 *   node scripts/data/build-regions.mjs --names    also print every region's names (to review)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';
import { rewindTopology } from './winding.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, '.cache/ne/ne_10m_admin_1_states_provinces.geojson');
const TMP = path.join(ROOT, '.cache/prep/regions');
const OUT = path.join(ROOT, 'public/data/regions');

/**
 * The countries. `what`: what the regions are, in English and Spanish. `drop`: Natural Earth
 * names to leave out (remote islets, disputed areas). `far`: regions left out of the first view
 * (the map frames the rest; the player pans to them). `names`: English name in Natural Earth →
 * [English, Spanish]. `es`: Spanish names only. `group`: a function from Natural Earth's properties
 * to a group key, with `groups`: key → [English, Spanish]. `city`: a region by its ISO 3166-2 or
 * Natural Earth code → [English, Spanish] (where Natural Earth gives two regions one name).
 */
const COUNTRIES = {
  // North America
  USA: { what: ['50 states and Washington, D.C.', '50 estados y Washington D. C.'], far: ['Alaska', 'Hawaii'],
    city: { 'US-DC': ['Washington, D.C.', 'Washington D. C.'] },
    es: { 'New York': 'Nueva York', 'New Jersey': 'Nueva Jersey', 'New Mexico': 'Nuevo México', 'New Hampshire': 'Nuevo Hampshire', 'North Carolina': 'Carolina del Norte', 'South Carolina': 'Carolina del Sur', 'North Dakota': 'Dakota del Norte', 'South Dakota': 'Dakota del Sur', 'West Virginia': 'Virginia Occidental', Pennsylvania: 'Pensilvania', Louisiana: 'Luisiana', Hawaii: 'Hawái' } },
  CAN: { what: ['10 provinces and 3 territories', '10 provincias y 3 territorios'] },
  MEX: { what: ['31 states and Mexico City', '31 estados y la Ciudad de México'],
    names: { Mexico: ['Mexico City', 'Ciudad de México'] }, es: { Veracruz: 'Veracruz', Coahuila: 'Coahuila' } },
  // Central America and the Caribbean
  GTM: { what: ['22 departments', '22 departamentos'] },
  HND: { what: ['18 departments', '18 departamentos'] },
  SLV: { what: ['14 departments', '14 departamentos'] },
  NIC: { what: ['15 departments and 2 autonomous regions', '15 departamentos y 2 regiones autónomas'],
    names: { 'North Caribbean Coast': ['North Caribbean Coast', 'Costa Caribe Norte'], 'South Caribbean Coast': ['South Caribbean Coast', 'Costa Caribe Sur'] } },
  CRI: { what: ['7 provinces', '7 provincias'] },
  PAN: { what: ['10 provinces and 3 Indigenous comarcas', '10 provincias y 3 comarcas indígenas'],
    group: (p) => (/ng[äö]be/i.test(p.name_en) ? 'ngabe' : null), groups: { ngabe: ['Ngäbe-Buglé', 'Ngäbe-Buglé'] },
    names: { 'Emberá-Wounaan Comarca': ['Emberá-Wounaan', 'Emberá-Wounaan'], 'Guna Yala': ['Guna Yala', 'Guna Yala'] } },
  CUB: { what: ['15 provinces and Isla de la Juventud', '15 provincias y la Isla de la Juventud'] },
  DOM: { what: ['31 provinces and the National District', '31 provincias y el Distrito Nacional'],
    names: { 'La Estrelleta': ['Elías Piña', 'Elías Piña'], Nacional: ['National District', 'Distrito Nacional'], Baoruco: ['Bahoruco', 'Bahoruco'] } },
  // South America
  COL: { what: ['32 departments and Bogotá', '32 departamentos y Bogotá'], far: ['Archipelago of Saint Andréws'],
    names: { 'Archipelago of Saint Andréws': ['San Andrés and Providencia', 'San Andrés y Providencia'] }, es: { Tolima: 'Tolima' } },
  VEN: { what: ['23 states and the Capital District', '23 estados y el Distrito Capital'], drop: ['Federal Dependencies'],
    names: { 'Vargas state': ['La Guaira', 'La Guaira'], 'Guárico State': ['Guárico', 'Guárico'], Merida: ['Mérida', 'Mérida'], Tachira: ['Táchira', 'Táchira'], Capital: ['Capital District', 'Distrito Capital'] } },
  ECU: { what: ['24 provinces', '24 provincias'], far: ['Galápagos'] },
  PER: { what: ['24 departments, Callao and Lima Province', '24 departamentos, el Callao y la provincia de Lima'],
    names: { 'Cusco Departament': ['Cusco', 'Cusco'], Huanuco: ['Huánuco', 'Huánuco'], Lima: ['Lima Region', 'Región Lima'] }, city: { 'PER-587': ['Lima Province', 'Provincia de Lima'] } },
  BOL: { what: ['9 departments', '9 departamentos'], es: { Beni: 'Beni' } },
  BRA: { what: ['26 states and the Federal District', '26 estados y el Distrito Federal'], es: { Acre: 'Acre', 'Rio de Janeiro': 'Río de Janeiro', 'São Paulo': 'São Paulo' },
    names: { Federal: ['Federal District', 'Distrito Federal'] } },
  CHL: { what: ['16 regions', '16 regiones'],
    names: { Santiago: ['Santiago Metropolitan', 'Región Metropolitana de Santiago'], 'Magellan and the Chilean Antarctic': ['Magallanes', 'Magallanes'] }, es: { Aysén: 'Aysén', Araucanía: 'La Araucanía' } },
  ARG: { what: ['23 provinces and Buenos Aires City', '23 provincias y la Ciudad de Buenos Aires'],
    city: { 'AR-C': ['Buenos Aires City', 'Ciudad de Buenos Aires'], 'AR-B': ['Buenos Aires Province', 'Provincia de Buenos Aires'] } },
  PRY: { what: ['17 departments and Asunción', '17 departamentos y Asunción'] },
  URY: { what: ['19 departments', '19 departamentos'] },
  // Europe
  GBR: { what: ['England’s 9 regions, Scotland, Wales and Northern Ireland', 'Las 9 regiones de Inglaterra, Escocia, Gales e Irlanda del Norte'],
    group: (p) => (p.geonunit === 'England' ? `eng-${p.region}` : p.geonunit),
    groups: {
      'eng-North East': ['North East England', 'Noreste de Inglaterra'], 'eng-North West': ['North West England', 'Noroeste de Inglaterra'],
      'eng-Yorkshire and the Humber': ['Yorkshire and the Humber', 'Yorkshire y Humber'], 'eng-East Midlands': ['East Midlands', 'Midlands del Este'],
      'eng-West Midlands': ['West Midlands', 'Midlands del Oeste'], 'eng-East': ['East of England', 'Este de Inglaterra'],
      'eng-Greater London': ['London', 'Londres'], 'eng-South East': ['South East England', 'Sureste de Inglaterra'],
      'eng-South West': ['South West England', 'Suroeste de Inglaterra'],
      Scotland: ['Scotland', 'Escocia'], Wales: ['Wales', 'Gales'], 'Northern Ireland': ['Northern Ireland', 'Irlanda del Norte'],
    } },
  FRA: { what: ['13 regions of mainland France', '13 regiones de la Francia metropolitana'],
    keep: (p) => !/Overseas/i.test(p.type_en ?? ''), group: (p) => p.region,
    groups: {
      'Île-de-France': ['Île-de-France', 'Isla de Francia'], 'Hauts-de-France': ['Hauts-de-France', 'Alta Francia'], 'Grand Est': ['Grand Est', 'Gran Este'],
      Normandie: ['Normandy', 'Normandía'], Bretagne: ['Brittany', 'Bretaña'], 'Pays de la Loire': ['Pays de la Loire', 'País del Loira'],
      'Centre-Val de Loire': ['Centre-Val de Loire', 'Centro-Valle de Loira'], 'Bourgogne-Franche-Comté': ['Bourgogne-Franche-Comté', 'Borgoña-Franco Condado'],
      'Nouvelle-Aquitaine': ['Nouvelle-Aquitaine', 'Nueva Aquitania'], Occitanie: ['Occitania', 'Occitania'],
      'Auvergne-Rhône-Alpes': ['Auvergne-Rhône-Alpes', 'Auvernia-Ródano-Alpes'], "Provence-Alpes-Côte-d'Azur": ['Provence-Alpes-Côte d’Azur', 'Provenza-Alpes-Costa Azul'],
      Corse: ['Corsica', 'Córcega'],
    } },
  ESP: { what: ['17 autonomous communities', '17 comunidades autónomas'], drop: ['Ceuta', 'Melilla'], far: ['Canary Is.'], group: (p) => p.region,
    groups: {
      Andalucía: ['Andalusia', 'Andalucía'], Aragón: ['Aragon', 'Aragón'], Asturias: ['Asturias', 'Asturias'], 'Islas Baleares': ['Balearic Islands', 'Islas Baleares'],
      'Canary Is.': ['Canary Islands', 'Canarias'], Cantabria: ['Cantabria', 'Cantabria'], 'Castilla y León': ['Castile and León', 'Castilla y León'],
      'Castilla-La Mancha': ['Castilla–La Mancha', 'Castilla-La Mancha'], Cataluña: ['Catalonia', 'Cataluña'], Valenciana: ['Valencian Community', 'Comunidad Valenciana'],
      Extremadura: ['Extremadura', 'Extremadura'], Galicia: ['Galicia', 'Galicia'], Madrid: ['Community of Madrid', 'Comunidad de Madrid'],
      Murcia: ['Region of Murcia', 'Región de Murcia'], 'Foral de Navarra': ['Navarre', 'Navarra'], 'País Vasco': ['Basque Country', 'País Vasco'],
      'La Rioja': ['La Rioja', 'La Rioja'],
    } },
  PRT: { what: ['18 districts, the Azores and Madeira', '18 distritos, las Azores y Madeira'], far: ['Azores', 'Madeira'] },
  ITA: { what: ['20 regions', '20 regiones'], group: (p) => p.region,
    groups: {
      "Valle d'Aosta": ['Aosta Valley', 'Valle de Aosta'], Piemonte: ['Piedmont', 'Piamonte'], Lombardia: ['Lombardy', 'Lombardía'],
      'Trentino-Alto Adige': ['Trentino-South Tyrol', 'Trentino-Alto Adigio'], Veneto: ['Veneto', 'Véneto'], 'Friuli-Venezia Giulia': ['Friuli-Venezia Giulia', 'Friul-Venecia Julia'],
      Liguria: ['Liguria', 'Liguria'], 'Emilia-Romagna': ['Emilia-Romagna', 'Emilia-Romaña'], Toscana: ['Tuscany', 'Toscana'], Umbria: ['Umbria', 'Umbría'],
      Marche: ['Marche', 'Marcas'], Lazio: ['Lazio', 'Lacio'], Abruzzo: ['Abruzzo', 'Abruzos'], Molise: ['Molise', 'Molise'], Campania: ['Campania', 'Campania'],
      Apulia: ['Apulia', 'Apulia'], Basilicata: ['Basilicata', 'Basilicata'], Calabria: ['Calabria', 'Calabria'], Sicily: ['Sicily', 'Sicilia'], Sardegna: ['Sardinia', 'Cerdeña'],
    } },
  DEU: { what: ['16 states', '16 estados'], names: { 'Free Hanseatic Bremen': ['Bremen', 'Bremen'] } },
  NLD: { what: ['12 provinces', '12 provincias'], drop: ['Bonaire', 'Sint Eustatius', 'Saba'] },
  POL: { what: ['16 voivodeships', '16 voivodatos'],
    names: {
      'Silesian Voivodeship': ['Silesia', 'Silesia'], 'Lesser Poland Voivodeship': ['Lesser Poland', 'Pequeña Polonia'], 'Podkarpackie Voivodeship': ['Subcarpathia', 'Subcarpacia'],
      'Lower Silesian Voivodeship': ['Lower Silesia', 'Baja Silesia'], 'Opole Voivodeship': ['Opole', 'Opole'], 'Podlaskie Voivodeship': ['Podlaskie', 'Podlaquia'],
      'Warmian-Masurian Voivodeship': ['Warmia-Masuria', 'Varmia y Masuria'], 'Lubusz Voivodeship': ['Lubusz', 'Lubusz'], 'West Pomeranian Voivodeship': ['West Pomerania', 'Pomerania Occidental'],
      'Lublin Voivodeship': ['Lublin', 'Lublin'], 'Pomeranian Voivodeship': ['Pomerania', 'Pomerania'], 'Masovian Voivodeship': ['Masovia', 'Mazovia'],
      'Łódź Voivodeship': ['Łódź', 'Łódź'], 'Kuyavian-Pomeranian Voivodeship': ['Kuyavia-Pomerania', 'Cuyavia y Pomerania'], 'Greater Poland Voivodeship': ['Greater Poland', 'Gran Polonia'],
      'Świętokrzyskie Voivodeship': ['Holy Cross', 'Santa Cruz'],
    } },
  SWE: { what: ['21 counties', '21 provincias'] },
  ROU: { what: ['41 counties and Bucharest', '41 distritos y Bucarest'] },
  GRC: { what: ['13 regions', '13 periferias'], drop: ['Mount Athos'], es: { Peloponnese: 'Peloponeso', 'Ionian Islands': 'Islas Jónicas' },
    names: { Thessalia: ['Thessaly', 'Tesalia'], 'Centre Macedonia': ['Central Macedonia', 'Macedonia Central'], 'West Macedonia': ['Western Macedonia', 'Macedonia Occidental'], 'East Macedonia and Thrace': ['Eastern Macedonia and Thrace', 'Macedonia Oriental y Tracia'], 'West Greece': ['Western Greece', 'Grecia Occidental'] } },
  UKR: { what: ['24 oblasts and Kyiv (Crimea and Sevastopol are left out: they are disputed)', '24 óblasts y Kiev (Crimea y Sebastopol quedan fuera: están en disputa)'],
    city: { 'UA-30': ['Kyiv City', 'Ciudad de Kiev'] }, names: { Kyiv: ['Kyiv Oblast', 'Óblast de Kiev'], Odessa: ['Odesa', 'Odesa'] } },
  // Asia
  RUS: { what: ['83 federal subjects (Crimea and Sevastopol are left out: they are disputed)', '83 sujetos federales (Crimea y Sebastopol quedan fuera: están en disputa)'],
    keep: (p) => !/^UA-/.test(p.iso_3166_2 ?? ''),
    city: { 'RUS-2364': ['Moscow Oblast', 'Óblast de Moscú'], 'RUS-2365': ['Moscow', 'Moscú'], 'RUS-2400': ['Altai Republic', 'República de Altái'], 'RUS-2399': ['Altai Krai', 'Krai de Altái'] },
    names: { Jewish: ['Jewish Autonomous Oblast', 'Óblast Autónomo Hebreo'] } },
  TUR: { what: ['81 provinces', '81 provincias'], es: { 'Şanlıurfa': 'Şanlıurfa', Sinop: 'Sinop', 'Aydın': 'Aydın' } },
  IRN: { what: ['31 provinces', '31 provincias'] },
  SAU: { what: ['13 provinces', '13 provincias'], es: { 'Northern Borders': 'Fronteras del Norte', 'Al-Qassim': 'Al Qasim', 'Al-Baha': 'Al Baha' },
    names: { Eastern: ['Eastern Province', 'Provincia Oriental'], 'Al-Jowf': ['Al-Jawf', 'Al Yauf'], "'Asir": ['Asir', 'Asir'], 'Al Madinah': ['Medina', 'Medina'], Makkah: ['Mecca', 'La Meca'], "Ha'il": ['Hail', 'Hail'] } },
  IND: { what: ['28 states and 8 union territories', '28 estados y 8 territorios de la unión'], es: { Odisha: 'Odisha' } },
  CHN: { what: ['22 provinces, 5 autonomous regions and 4 cities', '22 provincias, 5 regiones autónomas y 4 municipios'], drop: ['Paracel Islands'], es: { Xinjiang: 'Xinjiang' } },
  KOR: { what: ['17 provinces and cities', '17 provincias y ciudades'], es: { Jeju: 'Jeju' } },
  JPN: { what: ['47 prefectures', '47 prefecturas'], trim: [/ Prefecture$/] },
  THA: { what: ['76 provinces and Bangkok', '76 provincias y Bangkok'] },
  MYS: { what: ['13 states and 3 federal territories', '13 estados y 3 territorios federales'] },
  // Africa
  EGY: { what: ['27 governorates', '27 gobernaciones'], es: { 'Al Sharqia': 'Sharqia', Gharbia: 'Gharbia' } },
  NGA: { what: ['36 states and the Federal Capital Territory', '36 estados y el Territorio de la Capital Federal'], es: { Lagos: 'Lagos', 'Kano State': 'Kano' }, trim: [/ State$/] },
  ZAF: { what: ['9 provinces', '9 provincias'], es: { 'Northern Cape': 'Cabo Septentrional', 'Eastern Cape': 'Cabo Oriental', 'Western Cape': 'Cabo Occidental' } },
  // Oceania
  AUS: { what: ['6 states and 2 territories', '6 estados y 2 territorios'], drop: ['Jervis Bay Territory', 'Macquarie Island', 'Lord Howe Island'] },
  NZL: { what: ['16 regions', '16 regiones'], es: { 'Manawatū-Whanganui': 'Manawatū-Whanganui' }, drop: ['Auckland Islands', 'Campbell Islands', 'Antipodes Islands', 'Chatham Islands', 'Kermadec Islands', 'Tokelau', 'Snares Islands', 'Three Kings Islands'] },
};

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const ID = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;

async function main() {
  const fc = JSON.parse(await fs.readFile(SRC, 'utf8'));
  await fs.mkdir(TMP, { recursive: true });
  await fs.mkdir(OUT, { recursive: true });
  const index = [];
  const printNames = process.argv.includes('--names');
  for (const [a3, cfg] of Object.entries(COUNTRIES)) {
    const feats = [];
    const used = new Set();
    for (const f of fc.features) {
      const p = f.properties;
      if (p.adm0_a3 !== a3 || !f.geometry) continue;
      let en = str(p.name_en) || str(p.name);
      if (!en || cfg.drop?.includes(en) || (cfg.keep && !cfg.keep(p))) continue;
      let es = str(p.name_es) || en;
      // Its id: the ISO 3166-2 code, or Natural Earth's when that is missing or taken.
      const code = ID.test(p.iso_3166_2 ?? '') && !used.has(p.iso_3166_2) ? p.iso_3166_2 : p.adm1_code;
      let g = cfg.group?.(p) ?? code;
      if (cfg.groups && cfg.group?.(p)) {
        const name = cfg.groups[g];
        if (!name) throw new Error(`${a3}: no name for group "${g}"`);
        [en, es] = name;
        g = `${a3.slice(0, 2)}-${g.replace(/[^A-Za-z]+/g, '').slice(0, 12)}`;
      } else {
        used.add(code);
        const city = cfg.city?.[p.adm1_code] ?? cfg.city?.[p.iso_3166_2];
        if (city) [en, es] = city;
        else if (cfg.names?.[en]) [en, es] = cfg.names[en];
        else if (cfg.es?.[en]) es = cfg.es[en];
        for (const re of cfg.trim ?? []) { en = en.replace(re, ''); es = es.replace(re, ''); }
      }
      const far = (cfg.far ?? []).includes(str(p.name_en) ?? '') || (cfg.far ?? []).includes(cfg.group?.(p) ?? '') ? 1 : 0;
      feats.push({ type: 'Feature', geometry: f.geometry, properties: { g, n: en, es, far } });
    }
    if (!feats.length) throw new Error(`${a3}: no regions`);
    // Detail for a phone-sized view of the country's main part (the far regions left out): about
    // 1/1500 of its size, so a big country keeps the same look as a small one.
    let w = Infinity, so = Infinity, e = -Infinity, n = -Infinity;
    for (const f of feats) {
      if (f.properties.far) continue;
      const walk = (c) => { if (typeof c[0] === 'number') { if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < so) so = c[1]; if (c[1] > n) n = c[1]; } else c.forEach(walk); };
      walk(f.geometry.coordinates);
    }
    const km = Math.hypot((e - w) * 111 * Math.cos(((so + n) / 2) * Math.PI / 180), (n - so) * 111);
    const interval = Math.round(Math.max(150, Math.min(4000, (km * 1000) / 1500)));
    const tmp = path.join(TMP, `${a3}.geojson`);
    await fs.writeFile(tmp, JSON.stringify({ type: 'FeatureCollection', features: feats }));
    const out = path.join(OUT, `${a3}.json`);
    // One shape per region (grouped regions dissolved), simplified for a phone-sized view of the
    // country and a little zoom, with a point inside each region for its name.
    await mapshaper.runCommands(`-i "${tmp}" -dissolve g copy-fields=n,es,far -simplify interval=${interval} keep-shapes -each "lx=+this.innerX.toFixed(3), ly=+this.innerY.toFixed(3), id=g, delete g" -rename-layers regions -o "${out}" format=topojson quantization=1e5`);
    const topo = JSON.parse(await fs.readFile(out, 'utf8'));
    const fixed = rewindTopology(topo);
    if (fixed.length) await fs.writeFile(out, JSON.stringify(topo));
    const geoms = topo.objects.regions.geometries;
    const names = geoms.map((g) => g.properties.n);
    const dup = names.filter((n, i) => names.indexOf(n) !== i);
    if (dup.length) throw new Error(`${a3}: two regions named ${[...new Set(dup)].join(', ')}`);
    const size = (await fs.stat(out)).size;
    index.push({ id: a3, n: geoms.length, what: { en: cfg.what[0], es: cfg.what[1] } });
    console.log(`${a3}: ${geoms.length} regions, ${(size / 1024).toFixed(0)} KB (detail ${interval} m)${fixed.length ? `, rewound ${fixed.length}` : ''}`);
    if (printNames) console.log('   ' + geoms.map((g) => `${g.properties.n} / ${g.properties.es}${g.properties.far ? ' (far)' : ''}`).join('; '));
  }
  await fs.writeFile(path.join(OUT, 'index.json'), JSON.stringify({ source: 'Natural Earth 10m admin-1 (public domain), regions grouped for FRA, ESP, ITA, GBR', countries: index }));
  console.log(`index: ${index.length} countries`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
