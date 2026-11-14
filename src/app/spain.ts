// Spain's Spanish: the app's Spanish is Latin American; with "Español (España)" chosen in Settings, the same texts
// are shown with the words used in Spain (ordenador, patata, zumo, móvil, coche, vídeo, añadir, penalti...). The
// rules below were written for the phrases the app's texts actually use: scripts/test/spain.mjs applies them to
// every Spanish text in the app, checks the samples below and lists each change for review. Words that mean
// something else here are left alone: "papa" when it is the Pope, "Pasto" and "Maní" (places), "departamento"
// when it is a region, "carro" (chariots), "arquero" (archers), "computadoras humanas" (people who computed).

type Rep = string | ((m: string, ...g: string[]) => string);
const L = '(?<![\\p{L}\\p{N}])', R = '(?![\\p{L}\\p{N}])';
const rx = (s: string) => new RegExp(s, 'gu');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** The replacement keeps a capital first letter. */
const keepCase = (m: string, to: string) => (m.charAt(0) !== m.charAt(0).toLowerCase() ? cap(to) : to);

const RULES: [RegExp, Rep][] = [];
/** Exact phrases, first (quotations, places where a word means something else). */
const phrase = (from: string, to: string) => RULES.push([rx(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), to]);
/** A word, in lower case or with a capital: `from` may be a pattern (forms of a verb...). */
const ci = (w: string) => `[${w[0]}${w[0].toUpperCase()}]${w.slice(1)}`;
const word = (from: string, to: string | ((m: string) => string)) =>
  RULES.push([rx(`${L}(?:${/^\p{Ll}/u.test(from) ? ci(from) : from})${R}`), (m: string) => keepCase(m, typeof to === 'string' ? to : to(m.toLowerCase()))]);

// ---- Quotations in the second person plural: Spain says vosotros ------------------------------------------------
phrase('Hombres necios que acusan a la mujer sin razón, sin ver que ustedes son la causa de lo mismo que culpan', 'Hombres necios que acusáis a la mujer sin razón, sin ver que vosotros sois la causa de lo mismo que culpáis');
phrase('Hombres tontos que acusan a la mujer sin razón, sin ver que ustedes son la causa de lo mismo que le reprochan', 'Hombres tontos que acusáis a la mujer sin razón, sin ver que vosotros sois la causa de lo mismo que le reprocháis');
phrase('Ustedes que escuchan en rimas dispersas', 'Vosotros que escucháis en rimas dispersas');
phrase('«No tengan miedo, soy un ciudadano soviético como ustedes que ha bajado del espacio»', '«No tengáis miedo, soy un ciudadano soviético como vosotros que ha bajado del espacio»');
phrase('«Estaré con ustedes»', '«Estaré con vosotros»');
phrase('Juan y los frijoles mágicos', 'Juan y las habichuelas mágicas');

// ---- Flats (a "departamento" that is a region stays) ----------------------------------------------------------
phrase('un departamento de Nueva York', 'un piso de Nueva York');
phrase('una torre de departamentos', 'una torre de viviendas');
phrase('el departamento de sus padres', 'el piso de sus padres');
phrase('el departamento de Jack Ma', 'el piso de Jack Ma');
phrase('su departamento de Viena', 'su piso de Viena');
phrase('un amplio departamento', 'un amplio piso');
phrase('conjuntos de departamentos', 'bloques de pisos');

// ---- Football --------------------------------------------------------------------------------------------------
for (const [from, to] of [['invadían la cancha', 'invadían el campo'], ['mitad de la cancha', 'mitad del campo'], ['Expulsadas de la cancha', 'Expulsadas del campo'],
  ['juntos en la cancha', 'juntos en el campo'], ['apareció en la cancha', 'apareció en el campo'], ['En la cancha,', 'En el campo,'],
  ['del tiempo extra', 'de la prórroga'], ['en el tiempo extra', 'en la prórroga'], ['En el tiempo extra', 'En la prórroga'], ['El tiempo extra', 'La prórroga'], ['el tiempo extra', 'la prórroga'],
  ['en tiempo extra', 'en la prórroga'], ['tiempo extra', 'prórroga'],
  ['del segundo tiempo', 'de la segunda parte'], ['del primer tiempo', 'de la primera parte'], ['en el segundo tiempo', 'en la segunda parte'], ['en el primer tiempo', 'en la primera parte'],
  ['tanda de penales', 'tanda de penaltis'], ['por penales', 'por penaltis'], ['en penales', 'en penaltis'], ['definición por penaltis', 'tanda de penaltis']] as const) phrase(from, to);
word('(?:un|el|su|quinto|primer|segundo|tercer|cuarto|último) penal', (m) => m.replace('penal', 'penalti'));
word('atajar penales', 'parar penaltis');
word('ataj(?:ó|aron|aba|ar)', (m) => ({ atajó: 'paró', atajaron: 'pararon', atajaba: 'paraba', atajar: 'parar' } as Record<string, string>)[m] ?? m);
phrase('encima del travesaño', 'encima del larguero');
phrase('en el travesaño', 'en el larguero');

// ---- Food and faults --------------------------------------------------------------------------------------
phrase('papa o carne molida', 'patata o carne picada');
word('carne molida', 'carne picada');
word('de res', 'de ternera');
phrase('una falla del motor', 'un fallo del motor');
phrase('una falla eléctrica', 'un fallo eléctrico');
phrase('arreglando fallas', 'arreglando fallos');
phrase('una falla en su computadora la puso', 'un fallo en su computadora la puso');
phrase('diseñó una computadora, para la que', 'diseñó una computadora, para el que');

// ---- Sentences where a computer's other words change too ------------------------------------------------------
phrase('la primera gran computadora electrónica, construida por', 'el primer gran ordenador electrónico, construido por');
phrase('La primera gran computadora electrónica programable, construida por', 'El primer gran ordenador electrónico programable, construido por');
phrase('las computadoras más pequeñas y rápidas', 'los ordenadores más pequeños y rápidos');
phrase('computadoras domésticas listas para usar', 'ordenadores domésticos listos para usar');
phrase('una de las primeras computadoras personales vendidas listas', 'uno de los primeros ordenadores personales vendidos listos');
phrase('la computadora analógica más antigua conocida', 'el ordenador analógico más antiguo conocido');
phrase('de una computadora a otra', 'de un ordenador a otro');
phrase('abarataron las computadoras lo suficiente para ponerlas', 'abarataron los ordenadores lo suficiente para ponerlos');

// ---- Nouns that change gender: their article and adjectives change too -------------------------------------
/** Feminine determiners and adjectives before a noun, and their masculine forms. */
const F2M: Record<string, string> = {
  la: 'el', una: 'un', esta: 'este', esa: 'ese', aquella: 'aquel', otra: 'otro', ninguna: 'ningún', alguna: 'algún', primera: 'primer',
  nueva: 'nuevo', pequeña: 'pequeño', misma: 'mismo', propia: 'propio', toda: 'todo', futura: 'futuro', 'de la': 'del', 'a la': 'al',
  las: 'los', unas: 'unos', estas: 'estos', esas: 'esos', otras: 'otros', primeras: 'primeros', nuevas: 'nuevos', todas: 'todos',
  muchas: 'muchos', pocas: 'pocos', algunas: 'algunos', grandes: 'grandes', 'de las': 'de los', 'a las': 'a los', últimas: 'últimos',
  gran: 'gran', cada: 'cada', su: 'su', sus: 'sus',
};
const M2F: Record<string, string> = Object.fromEntries(Object.entries(F2M).map(([f, m]) => [m, f]).filter(([m]) => !['grandes'].includes(m)));
Object.assign(M2F, { ningún: 'ninguna', algún: 'alguna', primer: 'primera', del: 'de la', al: 'a la', últimos: 'últimas', el: 'la', un: 'una' });
const DETS = (map: Record<string, string>) => Object.keys(map).sort((a, b) => b.length - a.length).map((d) => ci(d).replace(' ', '\\s')).join('|');
/** An adjective with the other gender (electrónica → electrónico, negros → negras, portugueses → portuguesas). */
const flipAdj = (a: string, toMasc: boolean) => {
  if (/(?:ble|bles|al|ales|ar|ares|ente|entes|ante|antes|il|iles|ior|iores)$/.test(a) || /^(?:mungo|carita)$/.test(a)) return a; // the same for both
  if (toMasc) return a.replace(/esas$/, 'eses').replace(/as$/, 'os').replace(/a$/, 'o');
  return a.replace(/eses$/, 'esas').replace(/os$/, 'as').replace(/o$/, 'a');
};
/**
 * A noun replaced by one of the other gender (computadora → ordenador): the determiner before it ("la", "una",
 * "primeras"...) and up to two of the given adjectives after it change with it.
 */
function swapNoun(sg: string, pl: string, toSg: string, toPl: string, toMasc: boolean, adjs: string[], keep: string[] = []) {
  const map = toMasc ? F2M : M2F;
  const det = `(?:(${DETS(map)})\\s+)?`;
  const QUOTES = '«\'"“‘';
  const adj = `(?:\\s+(${adjs.join('|')}))?`;
  RULES.push([rx(`${L}${det}${det}${det}(${ci(pl)}|${ci(sg)})${R}${adj}${adj}${R}`), (...g: unknown[]) => {
    const [m, d1, d2, d3, noun, a1, a2] = g as [string, string | undefined, string | undefined, string | undefined, string, string | undefined, string | undefined];
    const at = g[g.length - 2] as number, all = g[g.length - 1] as string;
    // Phrases that keep the word ("computadoras humanas", «computadora» in quotes: the people who computed).
    const around = all.slice(Math.max(0, at - 24), at + m.length + 24).toLowerCase();
    const nounAt = at + m.toLowerCase().indexOf(noun.toLowerCase());
    if (keep.some((k) => around.includes(k)) || (nounAt > 0 && QUOTES.includes(all.charAt(nounAt - 1)))) return m;
    const plural = noun.toLowerCase() === pl;
    const to = plural ? toPl : toSg;
    const flip = (d: string) => keepCase(d, map[d.toLowerCase().replace(/\s+/, ' ')] ?? d);
    const dets = [d1, d2, d3].filter((d): d is string => !!d).map(flip);
    const out = dets.length ? `${dets.join(' ')} ${to}` : keepCase(noun, to);
    return out + (a1 ? ` ${flipAdj(a1, toMasc)}` : '') + (a2 ? ` ${flipAdj(a2, toMasc)}` : '');
  }]);
}
swapNoun('supercomputadora', 'supercomputadoras', 'superordenador', 'superordenadores', true, ['modernas?', 'grandes']);
swapNoun('computadora', 'computadoras', 'ordenador', 'ordenadores', true, ['electrónicas?', 'mecánicas?', 'analógicas?', 'digital(?:es)?', 'personal(?:es)?', 'programables?', 'modernas?', 'domésticas?', 'central(?:es)?', 'universitarias?', 'compartidas?', 'unidas?', 'colocadas?', 'portátil(?:es)?', 'cuánticas?', 'nuevas?', 'propias?'], ['computadoras humanas', 'computadora atanasoff', 'computadora leo', 'computadoras de harvard', 'computadoras del área oeste', 'computadoras catalogó']);
swapNoun('frijol', 'frijoles', 'judía', 'judías', false, ['blancos?', 'negros?', 'dulces', 'guisados?', 'portugueses', 'rojos?', 'pintos?', 'refritos?', 'cocidos?', 'molidos?', 'mágicos', 'mungo', 'carita', 'común', 'comunes']);
swapNoun('anteojos', 'anteojos', 'gafas', 'gafas', false, ['sujetos', 'bifocales', 'convexos', 'cóncavos'], ['cormorán de anteojos']);
swapNoun('arveja', 'arvejas', 'guisante', 'guisantes', true, ['secas?', 'verdes']);
phrase('ejotes rebozados', 'judías verdes rebozadas');
phrase('los ejotes largos', 'las judías verdes largas');
word('ejote', 'judía verde');

// ---- Words of the same gender ----------------------------------------------------------------------------------
phrase('Científica de la computación', 'Informática');
phrase('científica estadounidense de la computación', 'informática estadounidense');
phrase('un camote silvestre de México', 'un ñame silvestre de México');
word('computación', 'informática');
// "celulares" the phones (after an article, a preposition or in a list); "paredes celulares" (cell walls) stays.
RULES.push([rx(`${L}([Ll]os|[Uu]nos|de|en|para|y|o|con|sin|sus|mis|tus|primeros|teléfonos|redes|relojes,)\\s+celulares${R}`), (m: string, d: string) => `${d} móviles`]);
phrase('teléfono celular', 'teléfono móvil');
phrase('red celular', 'red de telefonía móvil');
phrase('línea de celular', 'línea de móvil');
phrase('líneas de celular', 'líneas de móvil');
// "celular" the noun (after an article or a preposition); the adjective (división celular) stays.
RULES.push([rx(`${L}(el|un|del|al|cada|en|por|y|o|con|sin|tu|su|mi|de)\\s+celular${R}`), (m: string, d: string) => `${d} móvil`]);
word('laptops', 'portátiles');
word('laptop', 'portátil');
// The potato (the Pope stays): after a feminine article or a preposition, in plural lists, or as a heading.
RULES.push([rx(`${L}(la|las|una|unas|esas|estas|sus|con|y|o|cientos de|variedades de|barriles de|restos de|tubérculos de|tiras de|rellenas de|bola de|cereal o|tortilla de|puré de|harina de)\\s+papa(s)?${R}`), (m: string, pre: string, pl?: string) => `${pre} patata${pl ? 's' : ''}`]);
RULES.push([rx(`^Papa(s)?${R}(?! (?:de Roma|Francisco|Juan|León|Pío|Gregorio|Inocencio|Urbano|Alejandro|Clemente|Bonifacio|Sixto|Julio|Benedicto|Pablo)\\b)`), (m: string, pl?: string) => `Patata${pl ? 's' : ''}`]);
RULES.push([rx(`${L}papa(s)? (fritas?|liofilizadas?|silvestres?|cultivadas?|gruesas?|y maní|de Virginia)`), (m: string, pl: string | undefined, rest: string) => `patata${pl ? 's' : ''} ${rest}`]);
RULES.push([rx(`, papas, `), ', patatas, ']);
phrase('«papa de Virginia»', '«patata de Virginia»');
phrase('maíz, papas', 'maíz, patatas');
RULES.push([rx(`${L}jugos? de (limón|lima|naranja|uva|manzana|piña|tomate|frutas?|frutas ácidas|toronja|pomelo|mango)${R}`), (m: string) => keepCase(m, m.toLowerCase().replace(/^jugo/, 'zumo'))]);
word('duraznos', 'melocotones');
word('durazno', 'melocotón');
RULES.push([rx(`${L}maní${R}`), 'cacahuete']); // lower case only: Maní is a town in Yucatán
word('maníes|manises', 'cacahuetes');
word('cacahuates', 'cacahuetes');
word('cacahuate', 'cacahuete');
word('camotes', 'boniatos');
word('camote', 'boniato');
word('jitomates', 'tomates');
word('jitomate', 'tomate');
RULES.push([rx(`${L}(?<!Pastel de |pastel de |El |el |«El |'El )choclo${R}`), 'maíz tierno']);
RULES.push([rx(`^Choclo,`), 'Maíz tierno,']);
word('estacionamientos', 'aparcamientos');
word('estacionamiento', 'aparcamiento');
word('videos', 'vídeos');
word('video', 'vídeo');
word('refrigeradores', 'frigoríficos');
word('refrigerador', 'frigorífico');
word('boletos', 'billetes');
word('boleto', 'billete');
// Cars (not the "auto de fe", the "autos sacramentales" or the newspaper L'Auto).
RULES.push([rx(`(?<![\\p{L}\\p{N}'’])autos?${R}(?! (?:de fe|sacramental))`), (m: string) => (m === 'autos' ? 'coches' : 'coche')]);
// Adding: añadir.
word('agreg(?:ar|a|an|ó|aron|aba|aban|ado|ada|ados|adas|ue|uen|aste|amos|ará|arán|aría|ando|arlo|arla|arlos|arlas)', (m) => {
  const map: Record<string, string> = { agregar: 'añadir', agrega: 'añade', agregan: 'añaden', agregó: 'añadió', agregaron: 'añadieron', agregaba: 'añadía', agregaban: 'añadían',
    agregado: 'añadido', agregada: 'añadida', agregados: 'añadidos', agregadas: 'añadidas', agregue: 'añada', agreguen: 'añadan', agregaste: 'añadiste', agregamos: 'añadimos',
    agregará: 'añadirá', agregarán: 'añadirán', agregaría: 'añadiría', agregando: 'añadiendo', agregarlo: 'añadirlo', agregarla: 'añadirla', agregarlos: 'añadirlos', agregarlas: 'añadirlas' };
  return map[m] ?? m;
});
word('enoj(?:o|os|ado|ada|ados|adas|ó|aron|aba|ar|arse)', (m) => m.replace(/^enoj/, 'enfad'));

// ---- Applying them ---------------------------------------------------------------------------------------------
const cache = new Map<string, string>();
/** A Latin American Spanish text with Spain's words. */
export function toSpain(s: string): string {
  if (!s || s.length < 3) return s;
  const hit = cache.get(s);
  if (hit !== undefined) return hit;
  let out = s;
  for (const [re, rep] of RULES) { re.lastIndex = 0; out = out.replace(re, rep as never); }
  if (cache.size > 20000) cache.clear();
  cache.set(s, out);
  return out;
}

/** Sentences and what Spain's Spanish makes of them (checked by scripts/test/spain.mjs). */
export const SPAIN_SAMPLES: [string, string][] = [
  ['tecleó un texto en una computadora y lo compartió', 'tecleó un texto en un ordenador y lo compartió'],
  ['la primera computadora electrónica', 'el primer ordenador electrónico'],
  ['Las computadoras personales', 'Los ordenadores personales'],
  ['computadoras humanas', 'computadoras humanas'],
  ['El papa Julio II llevó a los mejores artistas', 'El papa Julio II llevó a los mejores artistas'],
  ['servidas con papas fritas y arroz', 'servidas con patatas fritas y arroz'],
  ['Todas las papas vienen de una sola domesticación', 'Todas las patatas vienen de una sola domesticación'],
  ['Pescado crudo «cocinado» en jugo de limón', 'Pescado crudo «cocinado» en zumo de limón'],
  ['se hervía el jugo de caña', 'se hervía el jugo de caña'],
  ['Siguieron los celulares, las tabletas', 'Siguieron los móviles, las tabletas'],
  ['la división celular', 'la división celular'],
  ['Murió en un accidente de auto en 1956', 'Murió en un accidente de coche en 1956'],
  ['terminó en un auto de fe', 'terminó en un auto de fe'],
  ['quemó sus libros en Maní', 'quemó sus libros en Maní'],
  ['leche de coco, papas y maní', 'leche de coco, patatas y cacahuete'],
  ['el maíz, el frijol y la calabaza', 'el maíz, la judía y la calabaza'],
  ['Frijoles negros guisados con cerdo', 'Judías negras guisadas con cerdo'],
  ['marcó un penal en el tiempo agregado', 'marcó un penalti en el tiempo añadido'],
  ['el código penal brasileño', 'el código penal brasileño'],
  ['Agregar esta vista', 'Añadir esta vista'],
  ['los fabricantes de anteojos', 'los fabricantes de gafas'],
  ['Corría con los anteojos sujetos', 'Corría con las gafas sujetas'],
  ['un departamento de Nueva York', 'un piso de Nueva York'],
  ['en el departamento de Piura', 'en el departamento de Piura'],
  ['árbitros de video', 'árbitros de vídeo'],
  ['El enojo por el robo', 'El enfado por el robo'],
  ['«Estaré con ustedes», les dijo Norman', '«Estaré con vosotros», les dijo Norman'],
];
