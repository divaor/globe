// Into the deep (v0.33.0): More → Into the deep. Dive from here: tap the sea anywhere for a column from its surface
// to its floor, with the animals of that ocean at their depths, the records, and what lives near there (live from OBIS).
// The zones tab tells what each depth is like.
import { Waves } from 'lucide';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import { h, segmented } from '../ui/dom';
import { fmtNumber } from '../app/i18n';
import { L, es } from '../play/host';
import { loadJSON } from '../data/store';
import { recordFeat } from '../learn/progress';
import { loadDepths, heightAt, seaDepthAt, oceanAt, OCEAN_NAMES, zoneOf, depths } from './depth';
import { diveColumn, animalsHere, metres, type SeaAnimal, type DeepMarker } from './dive';

type Tab = 'dive' | 'zones';
interface ZoneFacts { id: string; top_m: number; bottom_m: number; name: { en: string; es: string }; light: { en: string; es: string }; temp: { en: string; es: string }; life: { en: string; es: string }; fact: { en: string; es: string } }
export interface Deep { zones: ZoneFacts[]; markers: DeepMarker[]; vents: { id: string; name: { en: string; es: string }; kind: string; lon: number; lat: number; depth_m: number; year?: number; text: { en: string; es: string } }[] }
let deepP: Promise<Deep> | null = null;
let animalsP: Promise<SeaAnimal[]> | null = null;
export const loadDeep = () => (deepP ??= loadJSON<Deep>('ocean/deep.json'));
export const loadSeaAnimals = () => (animalsP ??= loadJSON<{ animals: SeaAnimal[] }>('ocean/animals.json').then((j) => j.animals));
const T = (x?: { en: string; es: string }) => (x ? (es() ? x.es : x.en) : '');

/** The group's emoji for a sea creature OBIS names by its class. */
const CLASS_E: Record<string, string> = { Mammalia: '🐋', Aves: '🐦', Reptilia: '🐢', Elasmobranchii: '🦈', Teleostei: '🐟', Actinopterygii: '🐟', Cephalopoda: '🐙', Malacostraca: '🦀', Gastropoda: '🐚', Bivalvia: '🦪', Anthozoa: '🪸', Scyphozoa: '🪼', Hydrozoa: '🪼', Echinoidea: '🦔', Asteroidea: '⭐', Holothuroidea: '🥒', Polychaeta: '🪱', Phaeophyceae: '🌿', Florideophyceae: '🌿' };

interface Obis { sci: string; cls: string; n: number }
async function obisNear(lon: number, lat: number): Promise<Obis[]> {
  const d = 1.5, p = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  const ring = [p(lon - d, lat - d), p(lon + d, lat - d), p(lon + d, lat + d), p(lon - d, lat + d), p(lon - d, lat - d)].join(',');
  const r = await fetch(`https://api.obis.org/v3/checklist?geometry=${encodeURIComponent(`POLYGON((${ring}))`)}&size=40`);
  if (!r.ok) throw new Error(String(r.status));
  const j = await r.json() as { results: { scientificName: string; taxonRank: string; records: number; class?: string }[] };
  return j.results.filter((x) => x.taxonRank === 'Species').slice(0, 12).map((x) => ({ sci: x.scientificName, cls: x.class ?? '', n: x.records }));
}

export class DeepSea {
  private tab: Tab = 'dive';
  private at: [number, number] | null = null;
  private deep: Deep | null = null;
  private animals: SeaAnimal[] = [];
  private insetSet = false;
  private obis = new Map<string, Promise<Obis[] | null>>();
  /** Tests read this. */
  get info() { return { open: this.shell.sheet.isOpen('deep'), tab: this.tab, at: this.at, floor: this.at && depths ? seaDepthAt(depths, this.at[0], this.at[1]) : null }; }

  constructor(private app: App, private shell: Shell) {
    shell.addMenu({ id: 'deep', icon: Waves, label: () => L('Into the deep', 'A las profundidades'), order: 28.9, onClick: () => void this.open() });
    // While the panel is open, a tap on the sea dives there.
    shell.tapHandlers.unshift((_x, _y, g) => {
      if (!this.shell.sheet.isOpen('deep') || app.mode || !g) return false;
      void this.diveAt(g[0], g[1]);
      return true;
    });
    app.on('lang', () => { if (this.shell.sheet.isOpen('deep')) this.render(); });
  }

  async open(tab?: Tab) {
    if (tab) this.tab = tab;
    [this.deep, this.animals] = await Promise.all([loadDeep().catch(() => null), loadSeaAnimals().catch(() => [] as SeaAnimal[]), loadDepths()]).then(([d, a]) => [d, a] as const);
    this.render();
  }

  /** Dives at a point: the panel opens on the dive there. */
  async diveAt(lon: number, lat: number) {
    this.at = [lon, lat];
    this.tab = 'dive';
    await this.open('dive');
    const d = depths ? seaDepthAt(depths, lon, lat) : 0;
    if (d > 6000) {
      const got = recordFeat('dive-6000');
      if (got.length) this.shell.toast(`${got[0].icon} ${L(`New badge: ${got[0].en}`, `Nueva insignia: ${got[0].es}`)}`, 4000);
    }
  }

  /** On a phone the panel covers the lower part of the screen: the globe centres in the part above it. */
  private inset(on: boolean) {
    const v = this.app.renderer.view;
    if (on && !this.app.mode) {
      const r = document.querySelector('.sheet:not([hidden])')?.getBoundingClientRect();
      v.insetBottom = r && r.left < 40 && r.top > 80 ? Math.max(0, Math.round(window.innerHeight - r.top)) : 0;
      this.insetSet = true;
    } else if (!on && this.insetSet) { v.insetBottom = 0; this.insetSet = false; }
    this.app.renderer.requestRender();
  }

  private render() {
    const tabs = segmented<Tab>(this.tab, [
      { value: 'dive', label: L('Dive from here', 'Bucear desde aquí') },
      { value: 'zones', label: L('The zones', 'Las zonas') },
    ], (v) => { this.tab = v; this.render(); });
    const body = h('div', { class: 'deep' }, tabs, this.tab === 'dive' ? this.diveTab() : this.zonesTab());
    this.shell.openPanel('deep', L('Into the deep', 'A las profundidades'), body, () => this.inset(false));
    requestAnimationFrame(() => this.inset(true));
  }

  private diveTab(): HTMLElement {
    if (!this.at || !depths) {
      const go = h('button', { type: 'button', class: 'pill sm primary', 'data-deep': 'dive-centre' }, L('Dive where I look', 'Bucear donde miro'));
      go.addEventListener('click', () => { const v = this.app.renderer.view; void this.diveAt(v.lon, v.lat); });
      return h('div', null, h('p', { class: 'small' }, L('Tap the sea anywhere to dive down to its floor: the light, the cold and the pressure on the way, the animals at their depths, and the records.',
        'Toca el mar en cualquier lugar para bajar hasta su fondo: la luz, el frío y la presión en el camino, los animales a su profundidad y los récords.')), h('div', { class: 'hop-actions' }, go));
    }
    const [lon, lat] = this.at;
    const cell = heightAt(depths, lon, lat), floor = seaDepthAt(depths, lon, lat);
    const coord = `${fmtNumber(Math.abs(lat), 1)}°${lat >= 0 ? 'N' : 'S'}, ${fmtNumber(Math.abs(lon), 1)}°${lon >= 0 ? 'E' : L('W', 'O')}`;
    if (floor <= 0) {
      return h('div', null, h('p', { class: 'small' }, h('b', null, `📍 ${coord}`), h('br'),
        L(`This is land, ${metres(cell.mean)} above the sea. Tap the sea to dive.`, `Esto es tierra firme, a ${metres(cell.mean)} sobre el mar. Toca el mar para bucear.`)));
    }
    const ocean = oceanAt(lon, lat);
    const here = animalsHere(this.animals, ocean, lat, floor);
    const markers = (this.deep?.markers ?? []).filter((m) => m.depth_m <= Math.max(floor, 11000));
    const typical = -cell.mean;
    const obisEl = h('div', { class: 'deep-obis' }, h('p', { class: 'muted small' }, L('Looking up what has been seen near here…', 'Buscando lo que se ha visto cerca de aquí…')));
    const key = `${lon.toFixed(1)},${lat.toFixed(1)}`;
    let q = this.obis.get(key);
    if (!q) { q = obisNear(lon, lat).catch(() => null); this.obis.set(key, q); }
    void q.then((list) => {
      if (!obisEl.isConnected) return;
      if (!list?.length) { obisEl.replaceChildren(h('p', { class: 'muted small' }, L('No sightings answered for this spot (OBIS needs the internet).', 'No hubo respuesta de avistamientos aquí (OBIS necesita internet).'))); return; }
      const bySci = new Map(this.animals.map((a) => [a.sci.toLowerCase(), a]));
      obisEl.replaceChildren(h('b', null, L('Seen near here most often', 'Lo más visto cerca de aquí')),
        h('div', { class: 'deep-obis-list' }, list.map((o) => { const a = bySci.get(o.sci.toLowerCase()); return h('span', { class: 'deep-obis-item' }, `${a?.e ?? CLASS_E[o.cls] ?? '🌊'} ${a ? T(a.name) : o.sci}`, h('small', null, ` · ${fmtNumber(o.n)}`)); })),
        h('p', { class: 'muted small' }, L('Records within about 150 km, live from OBIS, the Ocean Biodiversity Information System.', 'Registros a unos 150 km, en vivo de OBIS, el Sistema de Información sobre Biodiversidad Oceánica.')));
    });
    return h('div', null,
      h('p', { class: 'small' }, h('b', null, `🌊 ${OCEAN_NAMES[ocean]()} · ${coord}`), h('br'),
        floor - typical > 300
          ? L(`The sea here is about ${metres(typical)} deep, down to ${metres(floor)} at its deepest. You are in the ${zoneOf(floor).name().toLowerCase()} at the bottom.`, `Aquí el mar tiene unos ${metres(typical)} de profundidad, hasta ${metres(floor)} en lo más hondo. Al fondo estás en la ${zoneOf(floor).name().toLowerCase()}.`)
          : L(`The sea here is about ${metres(floor)} deep: its floor is in the ${zoneOf(floor).name().toLowerCase()}.`, `Aquí el mar tiene unos ${metres(floor)} de profundidad: su fondo está en la ${zoneOf(floor).name().toLowerCase()}.`)),
      h('p', { class: 'muted small' }, L(`${here.length} of our ${this.animals.length} sea animals live in ${OCEAN_NAMES[ocean]()} at this latitude. Tap the column for the light, the cold and the pressure; tap an animal for its story.`,
        `${here.length} de nuestros ${this.animals.length} animales marinos viven en ${OCEAN_NAMES[ocean]()} a esta latitud. Toca la columna para ver la luz, el frío y la presión; toca un animal para su historia.`)),
      diveColumn({ floor, lat, animals: here, markers, onAnimal: (a) => this.animalCard(a) }),
      obisEl,
    );
  }

  private animalCard(a: SeaAnimal) {
    this.shell.card.showCustom(a.e, T(a.name), a.sci, [
      { label: L('Depth', 'Profundidad'), value: `${metres(a.depth[0])} – ${metres(a.depth[1])}`, icon: '⬇️' },
      { label: L('Most often', 'Más a menudo'), value: `${metres(a.usual)} · ${zoneOf(a.usual).name()}`, icon: '🌊' },
    ], [], [T(a.text)]);
  }

  private zonesTab(): HTMLElement {
    const zs = this.deep?.zones ?? [];
    return h('div', null, h('p', { class: 'small' }, L('The ocean is layered like the Earth: the light goes, the cold comes, the pressure grows. Most of its water is in the dark.',
      'El océano tiene capas como la Tierra: la luz se va, llega el frío, crece la presión. La mayor parte de su agua está a oscuras.')),
    ...zs.map((z) => h('div', { class: 'deep-zone', 'data-zone': z.id },
      h('b', null, `${T(z.name)} · ${metres(z.top_m)}–${z.bottom_m >= 11000 ? metres(11000) : metres(z.bottom_m)}`),
      h('p', { class: 'small' }, `☀️ ${T(z.light)} 🌡️ ${T(z.temp)}`),
      h('p', { class: 'small' }, `🐟 ${T(z.life)}`),
      h('p', { class: 'muted small' }, T(z.fact)))));
  }
}
