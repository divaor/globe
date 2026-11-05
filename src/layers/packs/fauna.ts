// Fauna: zoogeographic realms, iconic animals, great migrations and biodiversity hotspots.
// Positions and realm outlines are approximate (compiled for an overview map).
import { geoArea, geoCircle, geoContains, geoDistance, geoInterpolate } from 'd3-geo';
import type { Polygon } from 'geojson';
import { lang } from '../../app/i18n';
import type { App } from '../../app/app';
import type { LayerDef, RenderCtx } from '../types';

const es = () => lang() === 'es';
const L = (en: string, sp: string) => (es() ? sp : en);

function poly(coords: [number, number][]): Polygon {
  const ring = [...coords, coords[0]];
  const p: Polygon = { type: 'Polygon', coordinates: [ring] };
  if (geoArea(p) > 2 * Math.PI) p.coordinates[0] = ring.slice().reverse();
  return p;
}

// ---- Zoogeographic realms --------------------------------------------------------------------
const REALMS: { id: string; en: string; es: string; color: string; emoji: string; animals: [string, string]; shape: Polygon }[] = [
  { id: 'nearctic', en: 'Nearctic', es: 'Neártico', color: '#7c9bd6', emoji: '🦬', animals: ['bison, bald eagle, grizzly', 'bisonte, águila calva, grizzly'],
    shape: poly([[-170, 50], [-170, 72], [-100, 84], [-10, 84], [-10, 60], [-50, 45], [-80, 28], [-97, 23.5], [-100, 22], [-106, 23], [-112, 28], [-118, 32]]) },
  { id: 'neotropical', en: 'Neotropical', es: 'Neotropical', color: '#4cc38a', emoji: '🐆', animals: ['jaguar, sloth, toucan', 'jaguar, perezoso, tucán'],
    shape: poly([[-118, 32], [-112, 28], [-106, 23], [-100, 22], [-97, 23.5], [-80, 28], [-60, 25], [-30, 0], [-30, -60], [-80, -60], [-120, -20], [-125, 20]]) },
  { id: 'palearctic', en: 'Palearctic', es: 'Paleártico', color: '#9b8bd8', emoji: '🦌', animals: ['red deer, brown bear, wolf', 'ciervo, oso pardo, lobo'],
    shape: poly([[-30, 30], [-30, 84], [180, 84], [180, 55], [150, 46], [140, 40], [131, 33], [122, 30], [105, 30], [97, 28], [90, 28], [80, 30], [72, 33], [66, 30], [62, 25], [57, 25], [52, 22], [45, 18], [35, 16], [20, 18], [0, 18], [-18, 20]]) },
  { id: 'afrotropical', en: 'Afrotropical', es: 'Afrotropical', color: '#f2b84b', emoji: '🦁', animals: ['lion, elephant, giraffe', 'león, elefante, jirafa'],
    shape: poly([[-25, 20], [-18, 20], [0, 18], [20, 18], [35, 16], [45, 18], [52, 22], [57, 25], [62, 25], [62, 5], [65, -40], [10, -40], [-25, -10]]) },
  { id: 'indomalayan', en: 'Indomalayan', es: 'Indomalayo', color: '#f07a6a', emoji: '🐅', animals: ['tiger, orangutan, peacock', 'tigre, orangután, pavo real'],
    shape: poly([[62, 25], [66, 30], [72, 33], [80, 30], [90, 28], [97, 28], [105, 30], [122, 30], [128, 22], [128, 6], [121, 4], [119.6, 0], [118.3, -3], [116.2, -8], [116.2, -12], [95, -12], [62, 5]]) },
  { id: 'australasian', en: 'Australasian', es: 'Australasiano', color: '#e58ad0', emoji: '🦘', animals: ['kangaroo, koala, kiwi', 'canguro, koala, kiwi'],
    shape: poly([[116.2, -12], [116.2, -8], [118.3, -3], [119.6, 0], [121, 4], [128, 6], [140, 0], [160, -5], [180, -30], [178, -50], [110, -45], [110, -12]]) },
  { id: 'oceanian', en: 'Oceanian', es: 'Oceánico', color: '#5bc8d6', emoji: '🐢', animals: ['sea turtles, seabirds, fruit bats', 'tortugas marinas, aves marinas, murciélagos frugívoros'],
    shape: poly([[130, 12], [145, 24], [180, 28], [-150, 28], [-125, 10], [-105, -28], [-180, -32], [170, -25], [160, -5], [140, 0], [128, 6]]) },
  { id: 'antarctic', en: 'Antarctic', es: 'Antártico', color: '#dfe9f2', emoji: '🐧', animals: ['penguins, seals, krill', 'pingüinos, focas, kril'],
    shape: geoCircle().center([0, -90]).radius(32)() as Polygon },
];

const WALLACE: [number, number][] = [[115.7, -11], [115.8, -8.5], [117.4, -4.5], [118.6, -2], [119.5, 1], [120.5, 4], [122, 6], [126.5, 9], [128.5, 14]];

const realms: LayerDef = {
  id: 'realms', category: 'fauna', icon: '🧭', kind: 'fill', defaultOpacity: 0.85,
  name: { en: 'Animal realms', es: 'Regiones zoogeográficas' },
  desc: { en: 'The eight biogeographic realms of Wallace: where animal families live, plus the Wallace Line.', es: 'Las ocho regiones biogeográficas de Wallace y la línea de Wallace.' },
  keywords: 'fauna animals wallace realm zoogeography animales reino',
  credit: 'After Wallace (1876) and Olson et al. (2001), simplified',
  drawFill(rc) {
    const { ctx, path } = rc;
    ctx.save();
    ctx.beginPath();
    for (const s of rc.visibleShapes(rc.level.countries)) path(s.feature as never);
    ctx.clip();
    for (const r of REALMS) { ctx.beginPath(); path(r.shape); ctx.fillStyle = r.color; ctx.fill(); }
    ctx.restore();
  },
  drawOverlay(rc) {
    const { ctx, path } = rc;
    ctx.beginPath(); path({ type: 'LineString', coordinates: WALLACE });
    ctx.setLineDash([7, 5]); ctx.strokeStyle = rc.theme.dark ? '#ffe066' : '#c2410c'; ctx.lineWidth = 2.2; ctx.stroke(); ctx.setLineDash([]);
  },
  labels(rc) {
    const pts: Record<string, [number, number]> = { nearctic: [-100, 48], neotropical: [-60, -12], palearctic: [70, 52], afrotropical: [22, -5], indomalayan: [100, 16], australasian: [135, -25], oceanian: [-150, -12], antarctic: [0, -78] };
    for (const r of REALMS) {
      const p = rc.project(...pts[r.id]);
      if (p) rc.labels.add({ text: `${r.emoji} ${es() ? r.es : r.en}`, x: p[0], y: p[1], priority: 950, size: 14, weight: 800, color: rc.theme.label, halo: rc.theme.labelHalo });
    }
    const w = rc.project(119.4, -2.5);
    if (w && rc.webZoom > 2.8) rc.labels.add({ text: L('Wallace Line', 'Línea de Wallace'), x: w[0] + 8, y: w[1], align: 'left', priority: 940, size: 11, italic: true, weight: 700, color: rc.theme.dark ? '#ffe066' : '#c2410c', halo: rc.theme.labelHalo });
  },
  legend() {
    return {
      kind: 'categories', title: L('Realms', 'Regiones'),
      items: REALMS.map((r) => ({ color: r.color, label: es() ? r.es : r.en, icon: r.emoji })),
      note: L('The Wallace Line separates Asian and Australian animals.', 'La línea de Wallace separa la fauna asiática de la australiana.'),
    };
  },
  pick(lon, lat) {
    const r = REALMS.find((x) => geoContains(x.shape, [lon, lat]));
    if (!r) return null;
    return [{ label: L('Realm', 'Región'), value: `${r.emoji} ${es() ? r.es : r.en}`, icon: '🧭' }, { label: L('Typical animals', 'Animales típicos'), value: es() ? r.animals[1] : r.animals[0] }];
  },
};

// ---- Iconic animals --------------------------------------------------------------------------
// [emoji, en, es, lon, lat, where en|es]
const ANIMALS: [string, string, string, number, number, string][] = [
  ['🦘', 'Kangaroo', 'Canguro', 134, -25, 'Australian outback|Interior de Australia'],
  ['🐨', 'Koala', 'Koala', 149, -28.5, 'Eucalyptus forests, eastern Australia|Bosques de eucalipto, este de Australia'],
  ['🐠', 'Clownfish', 'Pez payaso', 147.5, -18, 'Great Barrier Reef|Gran Barrera de Coral'],
  ['🐊', 'Saltwater crocodile', 'Cocodrilo marino', 132, -12.5, 'Northern Australia|Norte de Australia'],
  ['🐦', 'Kiwi', 'Kiwi', 175.5, -39, 'New Zealand|Nueva Zelanda'],
  ['🐑', 'Sheep', 'Oveja', 171.5, -44, 'New Zealand (more sheep than people)|Nueva Zelanda (más ovejas que personas)'],
  ['🦒', 'Giraffe', 'Jirafa', 36.5, 1.5, 'East African savanna|Sabana de África oriental'],
  ['🦁', 'Lion', 'León', 34.8, -2.6, 'Serengeti, Tanzania|Serengueti, Tanzania'],
  ['🦓', 'Zebra', 'Cebra', 25, -19.5, 'Okavango, Botswana|Okavango, Botsuana'],
  ['🐘', 'African elephant', 'Elefante africano', 20, -17, 'Southern Africa|África austral'],
  ['🦏', 'Rhinoceros', 'Rinoceronte', 31.5, -24, 'Kruger, South Africa|Kruger, Sudáfrica'],
  ['🦛', 'Hippopotamus', 'Hipopótamo', 32.5, 1, 'Great Lakes of Africa|Grandes Lagos de África'],
  ['🦍', 'Mountain gorilla', 'Gorila de montaña', 29.5, -1.4, 'Virunga volcanoes|Volcanes Virunga'],
  ['🐆', 'Cheetah', 'Guepardo', 17, -21, 'Namibia|Namibia'],
  ['🐊', 'Nile crocodile', 'Cocodrilo del Nilo', 31, 9, 'The Nile and the Sudd|El Nilo y el Sudd'],
  ['🦩', 'Flamingo', 'Flamenco', 36.1, -0.4, 'Rift Valley lakes|Lagos del Valle del Rift'],
  ['🐒', 'Lemur', 'Lémur', 46.5, -19.5, 'Madagascar|Madagascar'],
  ['🐪', 'Dromedary', 'Dromedario', 45, 23, 'Arabia and the Sahara|Arabia y el Sáhara'],
  ['🐫', 'Bactrian camel', 'Camello bactriano', 103, 43, 'Gobi Desert|Desierto de Gobi'],
  ['🐼', 'Giant panda', 'Panda gigante', 103.5, 31, 'Sichuan bamboo forests|Bosques de bambú de Sichuan'],
  ['🐅', 'Bengal tiger', 'Tigre de Bengala', 79, 22, 'Indian jungles and the Sundarbans|Selvas de la India y los Sundarbans'],
  ['🦚', 'Peacock', 'Pavo real', 76.5, 15, 'India|India'],
  ['🐆', 'Snow leopard', 'Leopardo de las nieves', 85, 33, 'Himalaya and Tibet|Himalaya y Tíbet'],
  ['🦧', 'Orangutan', 'Orangután', 114, 1, 'Borneo and Sumatra|Borneo y Sumatra'],
  ['🦎', 'Komodo dragon', 'Dragón de Komodo', 119.5, -8.6, 'Komodo, Indonesia|Komodo, Indonesia'],
  ['🐒', 'Snow monkey', 'Macaco japonés', 138.4, 36.7, 'Japanese Alps|Alpes japoneses'],
  ['🐅', 'Amur tiger', 'Tigre de Amur', 135, 46, 'Russian Far East|Lejano Oriente ruso'],
  ['🐻', 'Brown bear', 'Oso pardo', 158, 55, 'Kamchatka|Kamchatka'],
  ['🐺', 'Grey wolf', 'Lobo gris', 100, 62, 'Siberian taiga|Taiga siberiana'],
  ['🦌', 'Reindeer', 'Reno', 25, 68.5, 'Lapland|Laponia'],
  ['🐐', 'Alpine ibex', 'Íbice de los Alpes', 7.5, 46, 'The Alps|Los Alpes'],
  ['🦉', 'Eagle owl', 'Búho real', -4, 40, 'Iberia|Península ibérica'],
  ['🦔', 'Hedgehog', 'Erizo', 2, 49, 'Western Europe|Europa occidental'],
  ['🐿️', 'Red squirrel', 'Ardilla roja', 16, 56, 'European forests|Bosques de Europa'],
  ['🐻‍❄️', 'Polar bear', 'Oso polar', -95, 72, 'Arctic Canada|Ártico canadiense'],
  ['🦭', 'Walrus', 'Morsa', -170, 65, 'Bering Strait|Estrecho de Bering'],
  ['🦅', 'Bald eagle', 'Águila calva', -135, 58, 'Alaska and Canada|Alaska y Canadá'],
  ['🐻', 'Grizzly bear', 'Oso grizzly', -150, 63, 'Alaska|Alaska'],
  ['🦌', 'Caribou', 'Caribú', -105, 63, 'Canadian tundra|Tundra canadiense'],
  ['🦬', 'American bison', 'Bisonte americano', -110.5, 44.6, 'Yellowstone|Yellowstone'],
  ['🦦', 'Sea otter', 'Nutria marina', -122, 36.6, 'California coast|Costa de California'],
  ['🦃', 'Wild turkey', 'Pavo salvaje', -86, 36, 'Eastern United States|Este de Estados Unidos'],
  ['🦝', 'Raccoon', 'Mapache', -78, 41, 'North America|América del Norte'],
  ['🐙', 'Giant Pacific octopus', 'Pulpo gigante del Pacífico', -131, 52, 'North Pacific coast|Costa del Pacífico Norte'],
  ['🦋', 'Monarch butterfly', 'Mariposa monarca', -100.3, 19.6, 'Michoacán forests, Mexico|Bosques de Michoacán, México'],
  ['🦥', 'Sloth', 'Perezoso', -84, 10, 'Costa Rica rainforest|Selva de Costa Rica'],
  ['🦜', 'Scarlet macaw', 'Guacamayo rojo', -62, -5, 'Amazon rainforest|Selva amazónica'],
  ['🐬', 'Pink river dolphin', 'Delfín rosado', -66, -3.5, 'Amazon River|Río Amazonas'],
  ['🐍', 'Anaconda', 'Anaconda', -67, 7, 'Llanos of Venezuela|Llanos de Venezuela'],
  ['🐆', 'Jaguar', 'Jaguar', -57, -17, 'Pantanal|Pantanal'],
  ['🦙', 'Llama', 'Llama', -68, -16.5, 'Andean highlands|Altiplano andino'],
  ['🦅', 'Andean condor', 'Cóndor andino', -70, -33, 'The Andes|Los Andes'],
  ['🐢', 'Giant tortoise', 'Tortuga gigante', -90.6, -0.6, 'Galápagos Islands|Islas Galápagos'],
  ['🐧', 'Magellanic penguin', 'Pingüino de Magallanes', -65, -45, 'Patagonia|Patagonia'],
  ['🦭', 'Elephant seal', 'Elefante marino', -64, -42.5, 'Península Valdés|Península Valdés'],
  ['🐧', 'Emperor penguin', 'Pingüino emperador', 90, -67, 'Antarctic coast|Costa antártica'],
  ['🐋', 'Blue whale', 'Ballena azul', -125, 34, 'Eastern Pacific|Pacífico oriental'],
  ['🐳', 'Humpback whale', 'Ballena jorobada', -157, 21, 'Hawaii (winter)|Hawái (invierno)'],
  ['🦈', 'Great white shark', 'Gran tiburón blanco', 19.3, -34.8, 'South African coast|Costa de Sudáfrica'],
  ['🦀', 'Red crab', 'Cangrejo rojo', 105.6, -10.5, 'Christmas Island|Isla de Navidad'],
];

const animals: LayerDef = {
  id: 'animals', category: 'fauna', icon: '🦒', kind: 'overlay', stackOrder: 4,
  name: { en: 'Iconic animals', es: 'Animales emblemáticos' },
  desc: { en: '60 famous animals where they live in the wild.', es: '60 animales famosos donde viven en libertad.' },
  keywords: 'animals wildlife fauna emoji animales vida salvaje',
  credit: 'Compiled (approximate ranges)',
  drawOverlay(rc) {
    const { ctx } = rc;
    const size = Math.max(16, Math.min(34, 13 + rc.webZoom * 3.2));
    ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const a of ANIMALS) {
      const p = rc.project(a[3], a[4]);
      if (!p) continue;
      ctx.beginPath(); ctx.arc(p[0], p[1], size * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = rc.theme.dark ? 'rgba(10,20,40,0.55)' : 'rgba(255,255,255,0.7)'; ctx.fill();
      ctx.fillText(a[0], p[0], p[1] + 1);
      rc.labels.reserve(p[0] - size * 0.6, p[1] - size * 0.6, p[0] + size * 0.6, p[1] + size * 0.6);
    }
  },
  labels(rc) {
    if (rc.webZoom < 3.1) return;
    const size = Math.max(16, Math.min(34, 13 + rc.webZoom * 3.2));
    for (const a of ANIMALS) {
      const p = rc.project(a[3], a[4]);
      if (p) rc.labels.add({ text: es() ? a[2] : a[1], x: p[0], y: p[1] + size * 0.85, priority: 800, size: 10.5, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
    }
  },
  pick(lon, lat, _i) {
    let best: (typeof ANIMALS)[number] | null = null, bd = 0.06;
    for (const a of ANIMALS) { const d = geoDistance([lon, lat], [a[3], a[4]]); if (d < bd) { bd = d; best = a; } }
    if (!best) return null;
    const [en, sp] = best[5].split('|');
    return [{ label: L('Animal', 'Animal'), value: `${best[0]} ${es() ? best[2] : best[1]}`, icon: '🐾' }, { label: L('Lives in', 'Vive en'), value: es() ? sp : en }];
  },
  legend() {
    return { kind: 'html', title: L('Iconic animals', 'Animales emblemáticos'), html: `<div class="lg-row">${L('Tap an animal to see where it lives.', 'Toca un animal para ver dónde vive.')}</div>` };
  },
};

// ---- Migrations ------------------------------------------------------------------------------
const MIGRATIONS: { emoji: string; en: string; es: string; km: string; path: [number, number][]; loop?: boolean }[] = [
  { emoji: '🐦', en: 'Arctic tern', es: 'Charrán ártico', km: '70 000 km/yr', path: [[-40, 72], [-28, 50], [-20, 20], [-18, -10], [-10, -40], [0, -66]] },
  { emoji: '🦋', en: 'Monarch butterfly', es: 'Mariposa monarca', km: '4 500 km', path: [[-80, 45], [-87, 38], [-95, 30], [-100, 22], [-100.3, 19.6]] },
  { emoji: '🐃', en: 'Wildebeest (Great Migration)', es: 'Ñu (Gran Migración)', km: '800 km', loop: true, path: [[35, -3], [34.6, -2.4], [34.8, -1.8], [35.1, -1.5], [35.4, -2], [35.5, -2.8], [35, -3]] },
  { emoji: '🐋', en: 'Humpback whale', es: 'Ballena jorobada', km: '8 000 km', path: [[-62, -64], [-75, -50], [-80, -30], [-81, -10], [-80, 2], [-79, 7]] },
  { emoji: '🐳', en: 'Grey whale', es: 'Ballena gris', km: '20 000 km', path: [[-114, 27], [-120, 34], [-125, 42], [-132, 52], [-150, 58], [-165, 60], [-169, 64]] },
  { emoji: '🐦', en: 'Bar-tailed godwit (non-stop)', es: 'Aguja colipinta (sin escalas)', km: '11 000 km', path: [[-162, 60], [-170, 40], [-178, 10], [175, -15], [174, -37]] },
  { emoji: '🐦', en: 'White stork', es: 'Cigüeña blanca', km: '10 000 km', path: [[10, 52], [20, 47], [29, 41], [35, 32], [33, 20], [32, 0], [28, -15], [26, -26]] },
  { emoji: '🦌', en: 'Caribou (Porcupine herd)', es: 'Caribú (manada Porcupine)', km: '2 400 km', loop: true, path: [[-141, 69.5], [-143, 67], [-138, 65.5], [-135, 67.5], [-141, 69.5]] },
  { emoji: '🐟', en: 'Sockeye salmon', es: 'Salmón rojo', km: '1 600 km', path: [[-170, 50], [-150, 52], [-130, 51], [-123.5, 49.2], [-121, 50.5]] },
  { emoji: '🐢', en: 'Leatherback turtle', es: 'Tortuga laúd', km: '16 000 km', path: [[132, -0.5], [160, 10], [-170, 25], [-140, 33], [-122, 36]] },
  { emoji: '🐟', en: 'European eel', es: 'Anguila europea', km: '6 000 km', path: [[-60, 27], [-45, 35], [-25, 45], [-10, 48], [0, 50]] },
];

function along(path: [number, number][], u: number): [number, number] {
  const seg: number[] = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) { const d = geoDistance(path[i], path[i + 1]); seg.push(d); total += d; }
  let d = u * total;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) return geoInterpolate(path[i], path[i + 1])(Math.min(1, d / seg[i])) as [number, number];
    d -= seg[i];
  }
  return path[path.length - 1];
}

const migrations: LayerDef = {
  id: 'migrations', category: 'fauna', icon: '🦋', kind: 'overlay', stackOrder: 5, animated: true,
  name: { en: 'Great migrations', es: 'Grandes migraciones' },
  desc: { en: 'Animated journeys of terns, monarchs, whales, wildebeest, turtles and more.', es: 'Viajes animados de charranes, monarcas, ballenas, ñus, tortugas y más.' },
  keywords: 'migration birds whales butterfly migracion aves ballenas mariposa',
  credit: 'Compiled (schematic routes)',
  drawOverlay(rc) {
    const { ctx, path } = rc;
    for (const m of MIGRATIONS) {
      ctx.beginPath(); path({ type: 'LineString', coordinates: m.path });
      ctx.setLineDash([2, 6]); ctx.strokeStyle = rc.theme.dark ? 'rgba(255,255,255,0.7)' : 'rgba(30,40,60,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.setLineDash([]);
  },
  drawFx(rc) {
    const { ctx } = rc;
    const size = Math.max(16, Math.min(30, 12 + rc.webZoom * 3));
    ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    MIGRATIONS.forEach((m, i) => {
      const period = 14000 + i * 1300;
      const u = ((rc.now + i * 2100) % period) / period;
      const k = m.loop ? u : u < 0.5 ? u * 2 : 2 - u * 2; // there and back
      const p = along(m.path, k);
      const pt = rc.project(p[0], p[1]);
      if (!pt) return;
      ctx.fillText(m.emoji, pt[0], pt[1]);
    });
  },
  labels(rc) {
    if (rc.webZoom < 2.6) return;
    for (const m of MIGRATIONS) {
      const mid = along(m.path, 0.5);
      const pt = rc.project(mid[0], mid[1]);
      if (pt) rc.labels.add({ text: es() ? m.es : m.en, sub: m.km, x: pt[0], y: pt[1] - 16, priority: 700, size: 10.5, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
    }
  },
  legend() {
    return { kind: 'categories', title: L('Migrations', 'Migraciones'), items: MIGRATIONS.map((m) => ({ color: 'transparent', icon: m.emoji, shape: 'emoji' as const, label: `${es() ? m.es : m.en} · ${m.km}` })) };
  },
};

// ---- Biodiversity hotspots -------------------------------------------------------------------
const HOTSPOTS: [string, string, number, number][] = [
  ['Atlantic Forest', 'Mata Atlántica', -45, -20], ['California Floristic Province', 'Provincia florística de California', -120, 37],
  ['Cape Floristic Region', 'Región florística del Cabo', 20, -33.5], ['Caribbean Islands', 'Islas del Caribe', -75, 19],
  ['Caucasus', 'Cáucaso', 44, 42], ['Cerrado', 'Cerrado', -48, -15], ['Chilean Winter Rainfall–Valdivian Forests', 'Bosques valdivianos de Chile', -72, -36],
  ['Coastal Forests of Eastern Africa', 'Bosques costeros de África oriental', 39, -6], ['East Melanesian Islands', 'Islas de Melanesia oriental', 160, -9],
  ['Eastern Afromontane', 'Montañas de África oriental', 34, -2], ['Forests of East Australia', 'Bosques del este de Australia', 152, -28],
  ['Guinean Forests of West Africa', 'Bosques de Guinea', -5, 6], ['Himalaya', 'Himalaya', 85, 28], ['Horn of Africa', 'Cuerno de África', 46, 8],
  ['Indo-Burma', 'Indo-Birmania', 100, 18], ['Irano-Anatolian', 'Irano-anatolia', 45, 37], ['Japan', 'Japón', 138, 36],
  ['Madagascar and Indian Ocean Islands', 'Madagascar e islas del Índico', 47, -19], ['Madrean Pine-Oak Woodlands', 'Bosques de pino y encino de México', -106, 25],
  ['Maputaland-Pondoland-Albany', 'Maputaland-Pondoland-Albany', 31, -28], ['Mediterranean Basin', 'Cuenca mediterránea', 15, 38],
  ['Mesoamerica', 'Mesoamérica', -88, 15], ['Mountains of Central Asia', 'Montañas de Asia central', 73, 40],
  ['Mountains of Southwest China', 'Montañas del suroeste de China', 101, 28], ['New Caledonia', 'Nueva Caledonia', 165.5, -21.5],
  ['New Zealand', 'Nueva Zelanda', 173, -41], ['North American Coastal Plain', 'Llanura costera norteamericana', -85, 32],
  ['Philippines', 'Filipinas', 122, 12], ['Polynesia-Micronesia', 'Polinesia-Micronesia', -155, -10], ['Southwest Australia', 'Suroeste de Australia', 117, -32],
  ['Succulent Karoo', 'Karoo suculento', 18, -30], ['Sundaland', 'Sondalandia', 108, 0], ['Tropical Andes', 'Andes tropicales', -75, -8],
  ['Tumbes-Chocó-Magdalena', 'Tumbes-Chocó-Magdalena', -78, 3], ['Wallacea', 'Wallacea', 122, -3], ['Western Ghats and Sri Lanka', 'Ghats occidentales y Sri Lanka', 77, 11],
];

const hotspots: LayerDef = {
  id: 'hotspots', category: 'fauna', icon: '💚', kind: 'overlay', stackOrder: 3,
  name: { en: 'Biodiversity hotspots', es: 'Puntos calientes de biodiversidad' },
  desc: { en: 'The 36 places with the most unique and most threatened species.', es: 'Los 36 lugares con más especies únicas y amenazadas.' },
  keywords: 'biodiversity species conservation endangered biodiversidad especies conservacion',
  credit: 'Conservation International hotspots (approximate centres)',
  drawOverlay(rc) {
    const { ctx } = rc;
    const r = Math.max(8, Math.min(40, rc.view.pxPerRadian * 0.06));
    for (const h of HOTSPOTS) {
      const p = rc.project(h[2], h[3]);
      if (!p) continue;
      const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
      g.addColorStop(0, 'rgba(56,217,169,0.85)'); g.addColorStop(0.6, 'rgba(56,217,169,0.35)'); g.addColorStop(1, 'rgba(56,217,169,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill();
    }
  },
  labels(rc) {
    for (const h of HOTSPOTS) {
      const p = rc.project(h[2], h[3]);
      if (p) rc.labels.add({ text: es() ? h[1] : h[0], x: p[0], y: p[1], priority: 560, size: 10.5, weight: 700, color: rc.theme.dark ? '#c3fae8' : '#087f5b', halo: rc.theme.labelHalo });
    }
  },
  legend() {
    return { kind: 'categories', items: [{ color: '#38d9a9', label: L('Hotspot (approximate centre)', 'Punto caliente (centro aprox.)'), shape: 'dot' }] };
  },
};

export default function register(app: App) {
  app.register([realms, animals, migrations, hotspots]);
}

export type { RenderCtx };
