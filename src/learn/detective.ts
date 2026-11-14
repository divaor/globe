// Time detective: a map of old borders with no names, and four years to choose from. The regions, and how much
// each pair of years differs there, come from data/history/detective.json (scripts/data/history/detective.mjs).

/** The maps the game asks about, each with a line on what the world looked like then. */
export const DETECTIVE_YEARS: Record<number, { en: string; es: string }> = {
  [-2000]: {
    en: 'Egypt’s Middle Kingdom rules the Nile, Ur has just fallen in Mesopotamia, and the cities of the Indus Valley still flourish.',
    es: 'El Reino Medio de Egipto gobierna el Nilo, Ur acaba de caer en Mesopotamia y las ciudades del valle del Indo aún florecen.',
  },
  [-1000]: {
    en: 'Egypt’s New Kingdom has broken up, the Zhou have overthrown the Shang in China, and Phoenician cities trade across the Mediterranean.',
    es: 'El Reino Nuevo de Egipto se ha fragmentado, los Zhou han derrocado a los Shang en China y las ciudades fenicias comercian por el Mediterráneo.',
  },
  [-500]: {
    en: 'Darius’s Persian Empire stretches from Egypt to the Indus, Athens and Sparta lead the Greek cities, and Rome has just become a republic.',
    es: 'El Imperio persa de Darío se extiende de Egipto al Indo, Atenas y Esparta encabezan las ciudades griegas y Roma acaba de hacerse república.',
  },
  [-323]: {
    en: 'Alexander the Great has just died in Babylon, leaving an empire from Greece to India that his generals will divide.',
    es: 'Alejandro Magno acaba de morir en Babilonia y deja un imperio de Grecia a la India que sus generales se repartirán.',
  },
  [-200]: {
    en: 'Rome has just defeated Carthage in the Second Punic War, the Han dynasty has just united China, and the Mauryas still rule most of India.',
    es: 'Roma acaba de vencer a Cartago en la segunda guerra púnica, la dinastía Han acaba de unificar China y los Maurya aún gobiernan casi toda la India.',
  },
  [-1]: {
    en: 'Augustus rules the Roman Empire around the Mediterranean, the Parthians hold Persia, and the Han dynasty rules China.',
    es: 'Augusto gobierna el Imperio romano en torno al Mediterráneo, los partos dominan Persia y la dinastía Han gobierna China.',
  },
  200: {
    en: 'The Roman Empire is near its largest, Han China is breaking apart, and the Kushans rule from Central Asia into northern India.',
    es: 'El Imperio romano está cerca de su máxima extensión, la China de los Han se desmorona y los kushán gobiernan de Asia Central al norte de la India.',
  },
  400: {
    en: 'The Roman Empire has split into West and East, the Sasanians rule Persia, and the Gupta Empire rules northern India.',
    es: 'El Imperio romano se ha dividido en Occidente y Oriente, los sasánidas gobiernan Persia y el Imperio gupta domina el norte de la India.',
  },
  600: {
    en: 'The Byzantine Empire holds the eastern Mediterranean, the Sasanians still rule Persia, and the Sui dynasty has reunited China.',
    es: 'El Imperio bizantino domina el Mediterráneo oriental, los sasánidas aún gobiernan Persia y la dinastía Sui ha reunificado China.',
  },
  800: {
    en: 'Charlemagne is crowned emperor in the West, the Abbasid caliphate rules from Baghdad, and the Tang dynasty rules China.',
    es: 'Carlomagno es coronado emperador en Occidente, el califato abasí gobierna desde Bagdad y la dinastía Tang gobierna China.',
  },
  1000: {
    en: 'The Holy Roman Empire and Byzantium lead Christian Europe, the Fatimids rule Egypt, and the Song dynasty rules China.',
    es: 'El Sacro Imperio y Bizancio encabezan la Europa cristiana, los fatimíes gobiernan Egipto y la dinastía Song gobierna China.',
  },
  1200: {
    en: 'Crusader states cling to the Levant, Genghis Khan is uniting the Mongols, and China is split between the Song and the Jin.',
    es: 'Los Estados cruzados resisten en el Levante, Gengis Kan está unificando a los mongoles y China está dividida entre los Song y los Jin.',
  },
  1279: {
    en: 'The Mongol khanates stretch from the Pacific to eastern Europe, and Kublai Khan has just conquered the last of Song China.',
    es: 'Los kanatos mongoles se extienden del Pacífico a Europa oriental, y Kublai Kan acaba de conquistar lo que quedaba de la China Song.',
  },
  1400: {
    en: 'Timur is conquering Central Asia and Persia, the Ottomans are advancing in the Balkans, and the Ming dynasty rules China.',
    es: 'Tamerlán conquista Asia Central y Persia, los otomanos avanzan por los Balcanes y la dinastía Ming gobierna China.',
  },
  1500: {
    en: 'The Ottomans rule from Constantinople, Spain has just reached the Americas, and the Aztec and Inca empires rule much of them.',
    es: 'Los otomanos gobiernan desde Constantinopla, España acaba de llegar a América, y los imperios azteca e inca dominan gran parte de ella.',
  },
  1530: {
    en: 'Spain has conquered the Aztec Empire and is about to invade the Inca, Babur has founded the Mughal Empire in India, and Suleiman rules the Ottomans.',
    es: 'España ha conquistado el Imperio azteca y está por invadir el inca, Babur ha fundado el Imperio mogol en la India y Solimán gobierna a los otomanos.',
  },
  1600: {
    en: 'Spain and Portugal, under one king, hold empires in the Americas and Asia, the Mughals rule northern India, and Japan is about to be united under the Tokugawa.',
    es: 'España y Portugal, bajo un mismo rey, tienen imperios en América y Asia, los mogoles gobiernan el norte de la India y Japón está por unificarse bajo los Tokugawa.',
  },
  1650: {
    en: 'The Thirty Years’ War is over, the Manchu Qing are conquering China, and the Dutch, English and French hold colonies in North America.',
    es: 'La guerra de los Treinta Años ha terminado, los Qing manchúes conquistan China y holandeses, ingleses y franceses tienen colonias en América del Norte.',
  },
  1700: {
    en: 'The Ottoman Empire has begun to retreat in Europe, the Mughal Empire is at its largest, and Spain rules much of Central and South America.',
    es: 'El Imperio otomano empieza a retroceder en Europa, el Imperio mogol está en su máxima extensión y España gobierna gran parte de América Central y del Sur.',
  },
  1783: {
    en: 'The United States has just won its independence, Russia stretches across Siberia to the Pacific, and the British are expanding in India.',
    es: 'Estados Unidos acaba de ganar su independencia, Rusia se extiende por Siberia hasta el Pacífico y los británicos avanzan en la India.',
  },
  1815: {
    en: 'Napoleon has been defeated and the Congress of Vienna redraws Europe, while Spanish America fights for its independence.',
    es: 'Napoleón ha sido derrotado y el Congreso de Viena rehace el mapa de Europa, mientras la América española lucha por su independencia.',
  },
  1880: {
    en: 'Germany and Italy are newly united, Latin America is independent, and Europe has not yet carved up Africa.',
    es: 'Alemania e Italia acaban de unificarse, América Latina es independiente y Europa todavía no se ha repartido África.',
  },
  1914: {
    en: 'On the eve of the First World War, four empires (German, Austro-Hungarian, Russian and Ottoman) rule central and eastern Europe, and Europeans have divided almost all of Africa.',
    es: 'En vísperas de la Primera Guerra Mundial, cuatro imperios (alemán, austrohúngaro, ruso y otomano) dominan Europa central y oriental, y los europeos se han repartido casi toda África.',
  },
  1920: {
    en: 'After the First World War the old empires have fallen: Poland, Czechoslovakia and Yugoslavia appear in Europe, and the Ottoman lands are divided.',
    es: 'Tras la Primera Guerra Mundial han caído los viejos imperios: en Europa aparecen Polonia, Checoslovaquia y Yugoslavia, y las tierras otomanas se reparten.',
  },
  1938: {
    en: 'On the eve of the Second World War, Germany has just annexed Austria, Japan is at war in China, and Italy has occupied Ethiopia.',
    es: 'En vísperas de la Segunda Guerra Mundial, Alemania acaba de anexionarse Austria, Japón está en guerra en China e Italia ha ocupado Etiopía.',
  },
  1945: {
    en: 'The Second World War has just ended: Germany is divided into occupation zones, Korea is split, and most of Africa and Asia are still colonies.',
    es: 'Acaba de terminar la Segunda Guerra Mundial: Alemania está dividida en zonas de ocupación, Corea está partida y casi toda África y Asia siguen siendo colonias.',
  },
  1960: {
    en: 'The Year of Africa: 17 African countries become independent. India and Indonesia are already free, and the Iron Curtain divides Europe.',
    es: 'El Año de África: 17 países africanos se independizan. La India e Indonesia ya son libres y el Telón de Acero divide Europa.',
  },
  1994: {
    en: 'The Soviet Union has broken into 15 countries, Germany is reunited, Yugoslavia has broken up, and South Africa has held its first free elections.',
    es: 'La Unión Soviética se ha dividido en 15 países, Alemania se ha reunificado, Yugoslavia se ha desintegrado y Sudáfrica ha celebrado sus primeras elecciones libres.',
  },
  2026: {
    en: 'The world today, with 193 members of the United Nations. The newest country is South Sudan, independent since 2011.',
    es: 'El mundo de hoy, con 193 miembros de las Naciones Unidas. El país más nuevo es Sudán del Sur, independiente desde 2011.',
  },
};

export interface DetRegion {
  id: string; en: string; es: string;
  /** The quiz's view: [lon, lat, zoom]. */
  cam: [number, number, number];
  /** The first year asked about (before it the region shows culture areas rather than states). */
  from: number;
  /** Per map (in the order of `years`): land under a named polity (%), polities with 2% or more, the largest. */
  maps: { claimed: number; polities: number; top: [string, number][] }[];
  /** How different two maps look in this region: the % of land under a different polity. */
  dist: number[][];
}
export interface DetData { years: number[]; regions: DetRegion[] }
export interface DetQuestion { region: string; year: number; options: number[] }

/**
 * `n` questions: each a region and a year whose map of it is mostly claimed by several polities, with three other
 * years whose maps of it differ from it and from each other by at least a threshold that falls from 45% (easy, far
 * apart) to 30% as the game goes on. No year is the answer twice, and the regions take turns.
 */
export function detectiveQuestions(data: DetData, n: number, rand: () => number): DetQuestion[] {
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const ys = data.years;
  const ok = (r: DetRegion, i: number) => ys[i] in DETECTIVE_YEARS && ys[i] >= r.from && r.maps[i].claimed >= 40 && r.maps[i].polities >= 3;
  const out: DetQuestion[] = [];
  const usedYears = new Set<number>();
  let order: DetRegion[] = [];
  for (let k = 0; k < n; k++) {
    const need = Math.round(45 - (15 * k) / Math.max(1, n - 1));
    for (let tries = 0; tries < 400; tries++) {
      if (!order.length) order = shuffle(data.regions.slice());
      const r = order[order.length - 1];
      const answers = ys.map((_, i) => i).filter((i) => ok(r, i) && !usedYears.has(ys[i]));
      if (!answers.length) { order.pop(); continue; }
      const i = pick(answers);
      const others = shuffle(ys.map((_, j) => j).filter((j) => j !== i && ok(r, j) && r.dist[i][j] >= need));
      const chosen: number[] = [];
      for (const j of others) if (chosen.every((c) => r.dist[c][j] >= need)) { chosen.push(j); if (chosen.length === 3) break; }
      if (chosen.length < 3) { if (tries % 20 === 19) order.pop(); continue; }
      order.pop();
      usedYears.add(ys[i]);
      out.push({ region: r.id, year: ys[i], options: [i, ...chosen].map((x) => ys[x]).sort((a, b) => a - b) });
      break;
    }
  }
  return out;
}
