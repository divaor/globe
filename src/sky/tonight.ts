// Tonight's sky (v0.49.0): what you can see tonight from any place on the globe, worked out on the device. The Moon
// as it looks from there right now (its real face, lit and turned as you see it), where it is and when it rises and
// sets, the coming phases; the sky all around with the planets; each planet tonight, with how it looks in a telescope
// (Venus's phase, Jupiter's four big moons where they are tonight, Saturn's rings at their tilt); the best clusters,
// nebulae and galaxies to point a telescope at; and the dark hours. A slider moves through the night; a tap on the
// globe moves the place; the globe shows where the Moon is overhead and the half of the Earth that can see it.
import { MoonStar, LocateFixed, Play, Pause, Telescope, Sparkles } from 'lucide';
import { geoCircle, geoContains } from 'd3-geo';
import { h, icon, clear } from '../ui/dom';
import { L, appLocale, fmtNumber } from '../app/i18n';
import { loadJSON, shapesFrom, type Shape } from '../data/store';
import { nightPolygons } from '../layers/daynight';
import { julian, type V3 } from './astro';
import * as A from './tonight-astro';
import { loadTex, drawDisc, drawPanorama, drawNightBar, moonIcon, type Tex, type SkyMark } from './tonight-draw';
import { loadSky, tr, OBJECT_TYPES, constellationAt, type SkyData, type SkyObject } from './data';
import type { Topology } from 'topojson-specification';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { Space } from '../space/space';
import type { Sky } from './sky';

interface Place { lon: number; lat: number; label: string; mine: boolean }
const PLACE_KEY = 'atlas-globe:tonight-place';
const SHEET = 'tonight';
const MOON_ARCSEC = 1865; // the Moon's width to the eye, about 31′

const PHASE_NAME: Record<A.PhaseKey, () => string> = {
  new: () => L('New moon', 'Luna nueva'),
  'waxing-crescent': () => L('Waxing crescent', 'Luna creciente'),
  'first-quarter': () => L('First quarter', 'Cuarto creciente'),
  'waxing-gibbous': () => L('Waxing gibbous', 'Gibosa creciente'),
  full: () => L('Full moon', 'Luna llena'),
  'waning-gibbous': () => L('Waning gibbous', 'Gibosa menguante'),
  'last-quarter': () => L('Last quarter', 'Cuarto menguante'),
  'waning-crescent': () => L('Waning crescent', 'Luna menguante'),
};
const MAIN_PHASE = [() => L('New moon', 'Luna nueva'), () => L('First quarter', 'Cuarto creciente'), () => L('Full moon', 'Luna llena'), () => L('Last quarter', 'Cuarto menguante')];
const PLANET: Record<A.PlanetId, { name: () => string; sym: string; color: [number, number, number]; css: string }> = {
  mercury: { name: () => L('Mercury', 'Mercurio'), sym: '☿', color: [190, 180, 170], css: '#cfc6bd' },
  venus: { name: () => L('Venus', 'Venus'), sym: '♀', color: [246, 238, 214], css: '#fff3d6' },
  mars: { name: () => L('Mars', 'Marte'), sym: '♂', color: [214, 120, 80], css: '#ff9a6b' },
  jupiter: { name: () => L('Jupiter', 'Júpiter'), sym: '♃', color: [222, 200, 170], css: '#ffe2b8' },
  saturn: { name: () => L('Saturn', 'Saturno'), sym: '♄', color: [226, 204, 150], css: '#ffe7a8' },
  uranus: { name: () => L('Uranus', 'Urano'), sym: '⛢', color: [176, 226, 232], css: '#b5f0f5' },
  neptune: { name: () => L('Neptune', 'Neptuno'), sym: '♆', color: [120, 160, 240], css: '#9db6ff' },
};
const MOON_NAMES = { io: () => L('Io', 'Ío'), europa: () => L('Europa', 'Europa'), ganymede: () => L('Ganymede', 'Ganimedes'), callisto: () => L('Callisto', 'Calisto') };
const IN_DIR = [
  () => L('in the north', 'en el norte'), () => L('in the north-east', 'en el noreste'), () => L('in the east', 'en el este'), () => L('in the south-east', 'en el sureste'),
  () => L('in the south', 'en el sur'), () => L('in the south-west', 'en el suroeste'), () => L('in the west', 'en el oeste'), () => L('in the north-west', 'en el noroeste'),
];
const COMPASS = () => [L('N', 'N'), L('NE', 'NE'), L('E', 'E'), L('SE', 'SE'), L('S', 'S'), L('SW', 'SO'), L('W', 'O'), L('NW', 'NO')];
const BRIGHT = [
  () => L('Dazzling', 'Deslumbrante'), () => L('Very bright', 'Muy brillante'), () => L('Bright', 'Brillante'),
  () => L('Easy to see by eye', 'Fácil de ver a simple vista'), () => L('Faint: binoculars help', 'Tenue: ayudan unos binoculares'), () => L('Needs a telescope', 'Necesita un telescopio'),
];

const upWords = (alt: number, az: number) => (alt < 0 ? L('below the horizon', 'bajo el horizonte') : alt >= 80 ? L('almost straight overhead', 'casi justo arriba') : L('{0}° up {1}', '{0}° de altura {1}', Math.round(alt), IN_DIR[A.compass8(az)]()));
/** Eye, binoculars or telescope: faint patches of light (galaxies, nebulae) are harder than their brightness says. */
const howToSee = (o: SkyObject): 'eye' | 'bino' | 'scope' => { const m = o.mag! + (['galaxy', 'nebula', 'snr', 'planetary'].includes(o.type) ? 1.5 : 0); return m <= 4.5 ? 'eye' : m <= 7 ? 'bino' : 'scope'; };

interface Night { w: [number, number]; s: A.Samples; times: A.NightTimes; key: string }

export class Tonight {
  private place: Place | null = null;
  private jd = julian(new Date());
  private live = true;
  private night: Night | null = null;
  private zone = { device: true, z: 0 };
  private zones: Shape<{ z: number }>[] | null = null;
  private sky: SkyData | null = null;
  private tex: Partial<Record<'moon' | 'mars' | 'jupiter' | 'saturn', Tex | null>> = {};
  private body: HTMLElement | null = null;
  private ui: Record<string, HTMLElement> = {};
  private playing = false;
  private raf = 0;
  private tick = 0;
  /** Set by the features: the sky view, to see something of tonight's in it. */
  skyView: Sky | null = null;
  /** For the smoke test: what is shown. */
  info = { open: false, renders: 0, moonRenders: 0, phase: '' as string, lit: 0, moonAlt: 0, age: 0, rise: null as number | null, set: null as number | null, next: [] as number[],
    planets: [] as string[], visible: [] as string[], targets: [] as string[], place: null as null | { lon: number; lat: number; label: string; mine: boolean }, jd: 0, overlay: 0,
    jupiter: [] as { id: string; x: number; front: boolean }[], ring: 0, zone: '' as string, dark: null as null | [number, number] };

  constructor(private app: App, private shell: Shell, private space: Space) {
    shell.addMenu({ id: SHEET, icon: MoonStar, label: () => L('Tonight’s sky', 'El cielo de esta noche'), order: 12.2, group: 'explore', onClick: () => void this.open() });
    space.openTonight = () => void this.open();
    app.renderer.overlays.add((rc) => this.draw(rc));
    shell.tapHandlers.unshift((_x, _y, g) => this.tap(g));
    app.on('lang', () => { if (this.body) this.render(); });
    // The search box: "moon", "tonight", "telescope", "planets" …
    shell.search.extra.push((_q, score) => {
      const words = [L('Tonight’s sky', 'El cielo de esta noche'), L('Moon phase', 'Fase de la luna'), L('Phases of the Moon', 'Fases de la luna'), L('Planets tonight', 'Planetas esta noche'), L('Telescope', 'Telescopio'), L('Moonrise', 'Salida de la luna')];
      const s = Math.max(...words.map(score));
      if (s <= 0) return [];
      const p = this.place ?? this.guessPlace();
      return [{ kind: 'place' as const, lon: p.lon, lat: p.lat, label: L('Tonight’s sky', 'El cielo de esta noche'), sub: L('The Moon now, the planets and what to see tonight', 'La luna ahora, los planetas y qué ver esta noche'), icon: '🔭', score: s + 8, tag: `🌙 ${L('Tonight’s sky', 'El cielo de esta noche')}`, pick: () => void this.open() }];
    });
  }

  get isOpen() { return !!this.body; }

  // ---- the place and the moment ----------------------------------------------------------------------------------

  /** Where the globe looks, or the last place used. */
  private guessPlace(): Place {
    try {
      const p = JSON.parse(localStorage.getItem(PLACE_KEY) ?? 'null') as Place | null;
      if (p && isFinite(p.lon) && isFinite(p.lat)) return { ...p, label: p.mine ? L('Your location', 'Tu ubicación') : p.label };
    } catch { /* private mode */ }
    const [lon, lat] = this.app.renderer.view.center();
    return { lon, lat, label: this.labelAt(lon, lat), mine: false };
  }

  private labelAt(lon: number, lat: number): string {
    const id = this.app.renderer.countryAt(lon, lat);
    if (id) return this.app.data.name(id, this.app.lang);
    return `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? L('N', 'N') : L('S', 'S')}, ${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? L('E', 'E') : L('W', 'O')}`;
  }

  /** Moves the place (a tap on the globe, the reader's location). Kept on this device, rounded to about 10 km. */
  setPlace(lon: number, lat: number, mine = false, label?: string) {
    lon = Math.round(lon * 10) / 10; lat = Math.max(-89.9, Math.min(89.9, Math.round(lat * 10) / 10));
    this.place = { lon, lat, mine, label: label ?? (mine ? L('Your location', 'Tu ubicación') : this.labelAt(lon, lat)) };
    try { localStorage.setItem(PLACE_KEY, JSON.stringify(this.place)); } catch { /* private mode */ }
    this.night = null;
    void this.findZone().then(() => { if (this.body) this.render(); });
    if (this.body) this.render();
    this.app.renderer.requestRender();
  }

  /** The reader's location, used on the device only. */
  locate(ask = true) {
    if (!navigator.geolocation) { if (ask) this.shell.toast(L('This device can’t tell where you are.', 'Este dispositivo no puede saber dónde estás.')); return; }
    navigator.geolocation.getCurrentPosition((p) => {
      this.setPlace(p.coords.longitude, p.coords.latitude, true);
      this.app.renderer.view.flyTo({ lon: p.coords.longitude, lat: p.coords.latitude }, 1200);
    }, () => { if (ask) this.shell.toast(L('Couldn’t find where you are.', 'No se pudo saber dónde estás.')); }, { timeout: 12000, maximumAge: 600000, enableHighAccuracy: false });
  }

  setTime(jd: number, live = false) {
    this.jd = jd; this.live = live;
    if (this.body) { if (this.night && jd >= this.night.w[0] && jd <= this.night.w[1]) this.renderNow(); else this.render(); }
    this.app.renderer.requestRender();
  }

  /** The place's time zone: the device's own when the place shares its standard time; else the zone's offset. */
  private async findZone() {
    const p = this.place;
    if (!p) return;
    const dev = this.deviceStd();
    if (p.mine) { this.zone = { device: true, z: dev }; return; }
    let z = Math.round(p.lon / 15);
    try {
      if (!this.zones) this.zones = shapesFrom<{ z: number }>(await loadJSON<Topology>('layers/timezones.json'), 'zones');
      const hit = this.zones.find((s) => geoContains(s.feature as never, [p.lon, p.lat]));
      if (hit) z = hit.feature.properties.z;
    } catch { /* the offset from the longitude */ }
    // The place may have moved while the zones loaded.
    if (this.place !== p) return;
    this.zone = { device: Math.abs(z - dev) < 0.01, z };
  }
  private deviceStd() { const y = new Date().getFullYear(); return -Math.max(new Date(y, 0, 1).getTimezoneOffset(), new Date(y, 6, 1).getTimezoneOffset()) / 60; }
  private zoneLabel(): string {
    if (this.zone.device) return L('your device’s time', 'la hora de tu dispositivo');
    const z = this.zone.z, a = Math.abs(z), hh = Math.floor(a), mm = Math.round((a - hh) * 60);
    return `UTC${z < 0 ? '−' : '+'}${hh}${mm ? `:${String(mm).padStart(2, '0')}` : ''}`;
  }
  private date(jd: number) { const ms = (jd - 2440587.5) * 86400000; return this.zone.device ? new Date(ms) : new Date(ms + this.zone.z * 3600000); }
  private fmt(jd: number, o: Intl.DateTimeFormatOptions) { return new Intl.DateTimeFormat(appLocale(), { ...o, ...(this.zone.device ? {} : { timeZone: 'UTC' }) }).format(this.date(jd)); }
  private time(jd: number | null) { return jd == null ? '—' : this.fmt(jd, { hour: 'numeric', minute: '2-digit' }); }
  private day(jd: number) { return this.fmt(jd, { weekday: 'short', day: 'numeric', month: 'short' }); }

  /** The night around the moment, sampled every 10 minutes (once per place and night). */
  private ensureNight(): Night {
    const p = this.place!;
    const w = A.nightWindow(this.jd, p.lon);
    const key = `${p.lon},${p.lat},${w[0].toFixed(4)}`;
    if (this.night?.key === key) return this.night;
    const s = A.sample(w[0], w[1], p.lon, p.lat, 10);
    this.night = { w, s, times: A.nightTimes(s), key };
    return this.night;
  }

  // ---- the panel -------------------------------------------------------------------------------------------------

  async open(at?: { lon: number; lat: number; label?: string; jd?: number }) {
    if (at) { this.place = null; this.setPlace(at.lon, at.lat, false, at.label); }
    if (at?.jd) { this.jd = at.jd; this.live = false; }
    else if (!this.body && this.live) this.jd = julian(new Date());
    if (!this.place) {
      this.place = this.guessPlace();
      void this.findZone().then(() => { if (this.body) this.render(); });
      // A location already allowed is used without asking (the first time, the reader taps "Use my location").
      try {
        const st = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
        if (st?.state === 'granted') this.locate(false);
      } catch { /* no permissions API */ }
    }
    const body = h('div', { class: 'tonight' });
    this.body = body;
    this.info.open = true;
    this.shell.openPanel(SHEET, L('Tonight’s sky', 'El cielo de esta noche'), body, () => {
      if (this.body !== body) return;
      this.body = null; this.info.open = false; this.stopPlay();
      clearInterval(this.tick); this.app.renderer.requestRender();
    });
    clearInterval(this.tick);
    // Now moves on while the panel is open.
    this.tick = window.setInterval(() => { if (this.live && !this.playing && this.body) this.setTime(julian(new Date()), true); }, 60000);
    this.render();
    // The globe turns to the place (its night side and the Moon's side show around it).
    const p = this.place!;
    this.app.renderer.view.flyTo({ lon: p.lon, lat: p.lat }, 1200);
    this.app.renderer.requestRender();
    void this.loadAll();
  }

  private async loadAll() {
    const [sky, moon, mars, jup, sat] = await Promise.all([
      loadSky().catch(() => null), loadTex('moon'), loadTex('mars'), loadTex('jupiter', true), loadTex('saturn', true),
    ]);
    this.sky = sky;
    this.tex = { moon, mars, jupiter: jup, saturn: sat };
    if (this.body) this.render();
  }

  /** Everything: the night's times, the lists, then the moment's pictures. */
  private render() {
    const body = this.body;
    if (!body || !this.place) return;
    const n = this.ensureNight();
    const scroll = body.closest('.sheet-body')?.scrollTop ?? 0;
    clear(body);
    this.ui = {};
    body.append(this.placeRow(), this.timeRow(n));
    body.append(h('h3', { class: 'sec-title' }, L('The Moon', 'La Luna')), this.moonBox(n));
    body.append(h('h3', { class: 'sec-title' }, L('Where to look', 'Hacia dónde mirar')), this.lookBox());
    body.append(h('h3', { class: 'sec-title' }, L('The planets tonight', 'Los planetas esta noche')), this.planetsBox(n));
    body.append(h('h3', { class: 'sec-title' }, L('Point your telescope at', 'Apunta tu telescopio a')), this.targetsBox(n));
    body.append(h('h3', { class: 'sec-title' }, L('How dark it gets', 'Qué tan oscuro se pone')), this.darkBox(n));
    body.append(h('p', { class: 'muted small tn-foot' }, L('Worked out on your device for {0} ({1}, {2}). Times in {3}.', 'Calculado en tu dispositivo para {0} ({1}, {2}). Horas en {3}.',
      this.place.label, `${Math.abs(this.place.lat).toFixed(1)}° ${this.place.lat >= 0 ? L('N', 'N') : L('S', 'S')}`, `${Math.abs(this.place.lon).toFixed(1)}° ${this.place.lon >= 0 ? L('E', 'E') : L('W', 'O')}`, this.zoneLabel())));
    const sb = body.closest('.sheet-body');
    if (sb) sb.scrollTop = scroll;
    this.info.renders++;
    this.renderNow();
  }

  private placeRow(): HTMLElement {
    const p = this.place!;
    const where = h('button', { type: 'button', class: 'pill tn-where', 'data-tonight': 'place' }, `📍 ${p.label}`);
    where.addEventListener('click', () => this.locate(true));
    const me = h('button', { type: 'button', class: `pill${p.mine ? ' on' : ''}`, 'data-tonight': 'locate' }, icon(LocateFixed, 16), L('Use my location', 'Usar mi ubicación'));
    me.addEventListener('click', () => this.locate(true));
    return h('div', { class: 'tn-place' }, h('div', { class: 'chip-row' }, where, me), h('div', { class: 'muted small' }, L('Or tap anywhere on the globe to see its sky.', 'O toca cualquier punto del globo para ver su cielo.')));
  }

  private timeRow(n: Night): HTMLElement {
    const label = h('strong', { class: 'tn-when', 'data-tonight': 'when' });
    const now = h('button', { type: 'button', class: `chip${this.live ? ' on' : ''}`, 'data-tonight': 'now' }, L('Now', 'Ahora'));
    now.addEventListener('click', () => { this.stopPlay(); this.setTime(julian(new Date()), true); this.render(); });
    const play = h('button', { type: 'button', class: 'icon-btn sm', 'data-tonight': 'play', 'aria-label': L('Play the night', 'Reproducir la noche') }, icon(this.playing ? Pause : Play, 18));
    play.addEventListener('click', () => (this.playing ? this.stopPlay() : this.startPlay()));
    const date = h('input', { type: 'date', class: 'tn-date', 'data-tonight': 'date', 'aria-label': L('Another night', 'Otra noche') }) as HTMLInputElement;
    const d0 = this.date(n.w[0]);
    date.value = `${String(d0.getUTCFullYear()).padStart(4, '0')}-${String(d0.getUTCMonth() + 1).padStart(2, '0')}-${String(d0.getUTCDate()).padStart(2, '0')}`;
    if (this.zone.device) date.value = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`;
    date.addEventListener('change', () => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.value);
      if (!m) return;
      // 9 pm that evening, at the place.
      const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], 21) - (this.zone.device ? -new Date(+m[1], +m[2] - 1, +m[3], 21).getTimezoneOffset() * 60000 : this.zone.z * 3600000);
      this.stopPlay();
      this.setTime(utc / 86400000 + 2440587.5);
    });
    // The night as a strip (day, twilights, night, the Moon's hours), with the slider over it.
    const bar = h('canvas', { class: 'tn-bar-canvas', 'aria-hidden': 'true' }) as HTMLCanvasElement;
    const range = h('input', { type: 'range', class: 'tn-range', min: '0', max: '1440', step: '5', 'data-tonight': 'slider', 'aria-label': L('Time of night', 'Hora de la noche') }) as HTMLInputElement;
    range.addEventListener('input', () => { this.stopPlay(); this.setTime(n.w[0] + Number(range.value) / 1440); });
    const t = n.times, frac = (j: number | null) => (j == null ? null : (j - n.w[0]) / (n.w[1] - n.w[0]));
    const ticks = h('div', { class: 'tn-ticks' });
    const tick = (j: number | null, text: string) => { const f = frac(j); if (f == null) return; ticks.append(h('span', { style: `left:${(f * 100).toFixed(1)}%` }, text)); };
    tick(t.sunset, `☀↓ ${this.time(t.sunset)}`);
    tick(n.w[0] + 0.5, L('midnight', 'medianoche'));
    tick(t.sunrise, `☀↑ ${this.time(t.sunrise)}`);
    Object.assign(this.ui, { when: label, range, bar, now });
    return h('div', { class: 'tn-time' },
      h('div', { class: 'tn-time-row' }, label, h('span', { class: 'tn-time-btns' }, now, play, date)),
      h('div', { class: 'tn-bar' }, bar, range), ticks);
  }

  private moonBox(n: Night): HTMLElement {
    const p = this.place!;
    const disc = h('canvas', { class: 'tn-moon-disc', role: 'img' }) as HTMLCanvasElement;
    const name = h('strong', { class: 'tn-phase', 'data-tonight': 'phase' });
    const lit = h('div', { class: 'tn-lit' });
    const now = h('div', { class: 'tn-now', 'data-tonight': 'moon-now' });
    const rs = A.crossings(n.s.t, n.s.moon, A.H0.moon), hi = A.highest(n.s.t, n.s.moon);
    const rise = rs.up[0] ?? null, set = rs.down.find((x) => x > (rise ?? n.w[0])) ?? rs.down[0] ?? null;
    this.info.rise = rise; this.info.set = set;
    const m = A.moonAt(hi.jd, p.lon, p.lat);
    const times = h('div', { class: 'tn-times' },
      h('span', null, `${L('Rises', 'Sale')} ${this.time(rise)}`),
      hi.alt > 0 ? h('span', null, `${L('At its highest', 'En lo más alto')} ${this.time(hi.jd)} · ${upWords(hi.alt, m.az)}`) : null,
      h('span', null, `${L('Sets', 'Se pone')} ${this.time(set)}`));
    const far = h('div', { class: 'muted small tn-far' });
    const seeSky = h('button', { type: 'button', class: 'pill', 'data-tonight': 'moon-sky' }, icon(Sparkles, 16), L('See the Moon in the sky', 'Ver la Luna en el cielo'));
    seeSky.addEventListener('click', () => this.inSky('moon'));
    const visit = h('button', { type: 'button', class: 'pill', 'data-tonight': 'moon-visit' }, '🌕 ', L('Explore the Moon', 'Explorar la Luna'));
    visit.addEventListener('click', () => { this.shell.sheet.close(); void this.space.enter('moon'); });
    // The coming phases.
    const next = A.nextPhases(this.jd, 4);
    this.info.next = next.map((x) => x.k);
    const phases = h('div', { class: 'tn-phases' });
    for (const ph of next) {
      const c = h('canvas', { class: 'tn-mini' }) as HTMLCanvasElement;
      this.miniMoon(c, 34, ph.jd);
      phases.append(h('div', { class: 'tn-ph', 'data-phase': String(ph.k) }, c, h('span', { class: 'tn-ph-name' }, MAIN_PHASE[ph.k]()), h('span', { class: 'muted small' }, `${this.day(ph.jd)}, ${this.time(ph.jd)}`)));
    }
    // The month ahead, a night at a time (tap one to go to it).
    const month = h('div', { class: 'tn-month', role: 'list' });
    for (let k = 0; k < 30; k++) {
      const jd = n.w[0] + k + 0.4;
      const c = h('canvas', { class: 'tn-mini' }) as HTMLCanvasElement;
      this.miniMoon(c, 30, jd);
      const b = h('button', { type: 'button', class: `tn-day${k === 0 ? ' on' : ''}`, role: 'listitem', 'data-day': String(k), title: this.day(jd) }, c, h('span', null, this.fmt(jd, { day: 'numeric' })));
      b.addEventListener('click', () => { this.stopPlay(); this.setTime(jd); });
      month.append(b);
    }
    Object.assign(this.ui, { moonDisc: disc, phaseName: name, lit, moonNow: now, far });
    return h('div', { class: 'tn-moon-box' },
      h('div', { class: 'tn-moon' }, h('div', { class: 'tn-moon-frame' }, disc), h('div', { class: 'tn-moon-text' }, name, lit, now, times, far)),
      h('div', { class: 'chip-row' }, seeSky, visit),
      h('div', { class: 'tn-sub' }, L('Coming phases', 'Próximas fases')), phases,
      h('div', { class: 'tn-sub' }, L('The next 30 nights', 'Las próximas 30 noches')), month);
  }

  private lookBox(): HTMLElement {
    const c = h('canvas', { class: 'tn-pano', role: 'img' }) as HTMLCanvasElement;
    const cap = h('div', { class: 'muted small' });
    Object.assign(this.ui, { pano: c, panoCap: cap });
    c.addEventListener('click', (e) => {
      const r = c.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const spots = (c as unknown as { spots?: { id: string; x: number; y: number }[] }).spots ?? [];
      const hit = spots.find((s) => Math.hypot(s.x - x, s.y - y) < 22);
      if (hit) this.inSky(hit.id);
    });
    return h('div', { class: 'tn-look' }, c, cap);
  }

  private planetsBox(n: Night): HTMLElement {
    const p = this.place!;
    const ps = A.planetsAt(this.jd, p.lon, p.lat);
    const rows: { id: A.PlanetId; el: HTMLElement; vis: boolean; mag: number }[] = [];
    this.info.visible = [];
    const midnight = n.w[0] + 0.5;
    for (const pl of ps) {
      const look = PLANET[pl.id];
      const minAlt = pl.id === 'mercury' || pl.id === 'venus' ? 5 : 8;
      const sunBelow = pl.mag < 0 ? -6 : pl.mag < 4 ? -9 : -15;
      const gh = A.goodHours(n.s, n.s.planets[pl.id], minAlt, sunBelow);
      let when: string;
      if (gh) {
        const t = n.times;
        const evening = gh.from <= (t.civilDusk ?? t.sunset ?? n.w[0]) + 0.03, morning = gh.to >= (t.civilDawn ?? t.sunrise ?? n.w[1]) - 0.03;
        const part = evening && morning ? L('All night', 'Toda la noche') : evening && gh.to < midnight + 0.04 ? L('In the evening', 'Por la tarde y noche') : morning && gh.from > midnight - 0.04 ? L('Before dawn', 'Antes del amanecer') : L('At night', 'De noche');
        when = L('{0}: {1} to {2} · best at {3}, {4}', '{0}: de {1} a {2} · mejor a las {3}, {4}', part, this.time(gh.from), this.time(gh.to), this.time(gh.best.jd),
          upWords(gh.best.alt, A.planetsAt(gh.best.jd, p.lon, p.lat).find((x) => x.id === pl.id)!.az));
        this.info.visible.push(pl.id);
      } else when = pl.elong < 18 ? L('Not tonight: too close to the Sun', 'Esta noche no: está muy cerca del Sol') : n.times.polar === 'day' ? L('Not tonight: the sky doesn’t get dark', 'Esta noche no: el cielo no oscurece') : L('Not tonight: below the horizon at night', 'Esta noche no: está bajo el horizonte de noche');
      const disc = h('canvas', { class: 'tn-planet-disc', 'data-planet-disc': pl.id }) as HTMLCanvasElement;
      const now = h('div', { class: 'tn-now', 'data-planet-now': pl.id });
      const more = h('div', { class: 'muted small' }, this.scopeNote(pl));
      const see = h('button', { type: 'button', class: 'chip', 'data-planet-sky': pl.id }, L('See it in the sky', 'Verlo en el cielo'));
      see.addEventListener('click', () => this.inSky(pl.id));
      const extra = pl.id === 'jupiter' ? h('canvas', { class: 'tn-jupiter', 'data-tonight': 'jupiter' }) : null;
      const el = h('div', { class: `tn-planet${gh ? '' : ' off'}`, 'data-planet': pl.id },
        h('div', { class: 'tn-planet-head' }, h('div', { class: 'tn-planet-frame' }, disc),
          h('div', { class: 'tn-planet-text' },
            h('strong', null, `${look.sym} ${look.name()}`, h('span', { class: 'tn-bright' }, BRIGHT[A.brightness(pl.mag)]())),
            h('div', { class: 'tn-when-line' }, when), now)),
        extra, more, h('div', { class: 'chip-row' }, see));
      this.ui[`p-${pl.id}`] = disc; this.ui[`n-${pl.id}`] = now;
      if (extra) this.ui.jupiter = extra;
      rows.push({ id: pl.id, el, vis: !!gh, mag: pl.mag });
    }
    rows.sort((a, b) => Number(b.vis) - Number(a.vis) || a.mag - b.mag);
    this.info.planets = rows.map((r) => r.id);
    const scale = h('canvas', { class: 'tn-scale', 'data-tonight': 'scale', role: 'img' }) as HTMLCanvasElement;
    this.ui.scale = scale;
    return h('div', { class: 'tn-planets' },
      h('div', { class: 'tn-sub' }, L('All at the same magnification, as in a telescope tonight', 'Todos al mismo aumento, como en un telescopio esta noche')), scale,
      ...rows.map((r) => r.el));
  }

  /** What a planet looks like in a small telescope, in a line or two. */
  private scopeNote(pl: A.PlanetNow): string {
    const x = Math.max(2, Math.round(MOON_ARCSEC / pl.diam));
    const size = L('{0}″ wide: at ×{1} it looks as big as the Moon does to your eye.', '{0}″ de ancho: a ×{1} se ve tan grande como la Luna a simple vista.', fmtNumber(pl.diam, pl.diam < 10 ? 1 : 0), fmtNumber(x));
    const pct = Math.round(pl.lit * 100);
    const note: Record<A.PlanetId, () => string> = {
      mercury: () => L('Tiny and always near the Sun: look low in the twilight. Now {0}% lit.', 'Diminuto y siempre cerca del Sol: búscalo bajo, en el crepúsculo. Ahora iluminado al {0}%.', pct),
      venus: () => L('It has phases like the Moon: now {0}% lit.', 'Tiene fases como la Luna: ahora iluminado al {0}%.', pct),
      mars: () => L('A small orange disc: dark markings and a white polar cap show from ×150.', 'Un pequeño disco naranja: sus manchas oscuras y un casquete polar blanco se ven desde ×150.'),
      jupiter: () => L('Its cloud belts show from ×40, and its four big moons change places every night.', 'Sus bandas de nubes se ven desde ×40, y sus cuatro grandes lunas cambian de lugar cada noche.'),
      saturn: () => L('The rings show from ×30. Now open {0}°.', 'Los anillos se ven desde ×30. Ahora abiertos {0}°.', fmtNumber(Math.abs(A.ringTilt(this.jd, pl.dir)), 1)),
      uranus: () => L('A faint blue-green dot: find it with a star chart and binoculars.', 'Un punto azul verdoso y tenue: búscalo con un mapa del cielo y binoculares.'),
      neptune: () => L('A faint blue dot: it needs a telescope and a star chart.', 'Un punto azul y tenue: necesita un telescopio y un mapa del cielo.'),
    };
    return `${note[pl.id]()} ${size}`;
  }

  private targetsBox(n: Night): HTMLElement {
    const box = h('div', { class: 'mode-list tn-targets' });
    const d = this.sky;
    if (!d) { box.append(h('div', { class: 'muted small' }, L('Loading…', 'Cargando…'))); return box; }
    const sunBelow = n.times.astroDusk != null ? -15 : -10;
    const moonUpBright = (k0: number, k1: number) => { let up = 0, all = 0; for (let k = 0; k < n.s.t.length; k++) { if (n.s.t[k] < k0 || n.s.t[k] > k1) continue; all++; if (n.s.moon[k] > 0 && n.s.lit[k] > 0.5) up++; } return all ? up / all : 0; };
    const picks: { o: SkyObject; s: number; gh: NonNullable<ReturnType<typeof A.goodHours>>; glare: boolean }[] = [];
    for (const o of d.objects) {
      if (o.mag == null || o.mag > 8.6 || !o.v || o.type === 'dark') continue;
      const alts = n.s.t.map((_, k) => n.s.altOf(o.v!, k));
      const gh = A.goodHours(n.s, alts, 25, sunBelow);
      if (!gh) continue;
      const diffuse = o.type === 'galaxy' || o.type === 'nebula' || o.type === 'snr';
      const glare = diffuse && o.mag > 5 && moonUpBright(gh.from, gh.to) > 0.6;
      picks.push({ o, gh, glare, s: (9 - o.mag) + gh.best.alt / 25 + (o.famous ? 2 : 0) + gh.frac - (glare ? 2.5 : 0) });
    }
    picks.sort((a, b) => b.s - a.s);
    // A mix: a few for the eye, a few for binoculars, the rest for a telescope.
    const top: typeof picks = [], per = { eye: 0, bino: 0, scope: 0 };
    for (const x of picks) { const k = howToSee(x.o); if (per[k] < (k === 'scope' ? 4 : 3) && top.length < 8) { top.push(x); per[k]++; } }
    for (const x of picks) if (top.length < 8 && !top.includes(x)) top.push(x);
    this.info.targets = top.map((x) => x.o.id);
    if (!top.length) { box.append(h('div', { class: 'muted small' }, n.times.polar === 'day' ? L('The sky doesn’t get dark enough tonight.', 'Esta noche el cielo no oscurece lo suficiente.') : L('Nothing bright enough is high in the dark hours tonight.', 'Esta noche no hay nada lo bastante brillante en lo alto durante las horas oscuras.'))); return box; }
    for (const { o, gh, glare } of top) {
      const ty = OBJECT_TYPES[o.type] ?? OBJECT_TYPES.other;
      const con = constellationAt(d, o.v!);
      const hw = howToSee(o);
      const how = hw === 'eye' ? L('By eye', 'A simple vista') : hw === 'bino' ? L('Binoculars', 'Binoculares') : L('Telescope', 'Telescopio');
      const az = A.altAzAt(o.v!, gh.best.jd, this.place!.lon, this.place!.lat)[1];
      const b = h('button', { type: 'button', class: 'mode-card tn-target', 'data-target': o.id },
        h('span', { class: 'mode-icon' }, ty.icon),
        h('span', { class: 'mode-text' },
          h('span', { class: 'mode-title' }, tr(o.name), h('span', { class: `tn-how tn-how-${hw}` }, how)),
          h('span', { class: 'mode-desc' }, `${tr(ty.name)}${con ? ` · ${tr(con.name)}` : ''} · ${L('best at {0}, {1}', 'mejor a las {0}, {1}', this.time(gh.best.jd), upWords(gh.best.alt, az))}${glare ? ` · ${L('the bright Moon makes it harder', 'la Luna brillante lo dificulta')}` : ''}`)));
      b.addEventListener('click', () => this.inSky(o.id, gh.best.jd));
      box.append(b);
    }
    return box;
  }

  private darkBox(n: Night): HTMLElement {
    const t = n.times;
    const lines: (string | HTMLElement)[] = [];
    if (t.polar === 'day') lines.push(L('The Sun doesn’t set tonight: the midnight sun.', 'El Sol no se pone esta noche: el sol de medianoche.'));
    else if (t.polar === 'night') lines.push(L('The Sun doesn’t rise: the polar night.', 'El Sol no sale: la noche polar.'));
    else lines.push(L('Sunset {0} · sunrise {1}', 'Puesta del sol {0} · salida del sol {1}', this.time(t.sunset), this.time(t.sunrise)));
    let dark: [number, number] | null = null;
    if (t.astroDusk != null && t.astroDawn != null) { dark = [t.astroDusk, t.astroDawn]; lines.push(L('Fully dark from {0} to {1}.', 'Totalmente oscuro de {0} a {1}.', this.time(t.astroDusk), this.time(t.astroDawn))); }
    else if (t.polar !== 'night') lines.push(L('It never gets fully dark tonight: the Sun stays less than 18° below the horizon.', 'Esta noche nunca oscurece del todo: el Sol no baja más de 18° bajo el horizonte.'));
    this.info.dark = dark;
    // The Moon's glare: the dark hours without a bright Moon, the best for faint galaxies.
    const s = n.s;
    let best: [number, number] | null = null, run: [number, number] | null = null;
    for (let k = 0; k < s.t.length; k++) {
      const ok = s.sun[k] < -18 && (s.moon[k] < 0 || s.lit[k] < 0.15);
      if (ok) { run = run ? [run[0], s.t[k]] : [s.t[k], s.t[k]]; if (!best || run[1] - run[0] > best[1] - best[0]) best = [run[0], run[1]]; }
      else run = null;
    }
    const m = A.moonAt(this.jd, this.place!.lon, this.place!.lat);
    if (dark) lines.push(best && best[1] - best[0] > 0.02
      ? L('Best for faint galaxies and nebulae: {0} to {1}, dark and without the Moon.', 'Lo mejor para galaxias y nebulosas tenues: de {0} a {1}, oscuro y sin la Luna.', this.time(best[0]), this.time(best[1]))
      : L('The Moon ({0}% lit) is up through the dark hours: a night for the Moon and the planets.', 'La Luna (iluminada al {0}%) está arriba en las horas oscuras: una noche para la Luna y los planetas.', Math.round(m.lit * 100)));
    const legend = h('div', { class: 'tn-legend muted small' },
      h('span', null, h('i', { class: 'k day' }), L('Day', 'Día')), h('span', null, h('i', { class: 'k tw' }), L('Twilight', 'Crepúsculo')),
      h('span', null, h('i', { class: 'k night' }), L('Night', 'Noche')), h('span', null, h('i', { class: 'k moon' }), L('Moon up', 'Luna arriba')));
    return h('div', { class: 'tn-dark' }, ...lines.map((x) => h('p', null, x)), legend);
  }

  // ---- the moment ------------------------------------------------------------------------------------------------

  /** The pictures and words that move with the slider. */
  private renderNow() {
    const n = this.night, p = this.place;
    if (!this.body || !n || !p) return;
    const jd = this.jd;
    const ui = this.ui;
    this.info.jd = jd; this.info.place = { ...p }; this.info.zone = this.zoneLabel();
    if (ui.when) ui.when.textContent = `${this.live ? `${L('Now', 'Ahora')} · ` : ''}${this.day(jd)}, ${this.time(jd)}`;
    if (ui.range) (ui.range as HTMLInputElement).value = String(Math.round((jd - n.w[0]) * 1440));
    if (ui.now) ui.now.classList.toggle('on', this.live);
    const zen = A.zenithJ2000(jd, p.lon, p.lat);
    const sun = A.sunDir(jd).dir;
    const sunAlt = n.s.altOf(sun, Math.max(0, Math.min(n.s.t.length - 1, Math.round(((jd - n.w[0]) / (n.w[1] - n.w[0])) * (n.s.t.length - 1)))));
    // The Moon.
    const m = A.moonAt(jd, p.lon, p.lat);
    Object.assign(this.info, { phase: m.key, lit: m.lit, moonAlt: m.alt, age: m.age });
    if (ui.moonDisc) {
      const size = Math.min(200, Math.max(140, (this.body.clientWidth || 360) * 0.42));
      drawDisc(ui.moonDisc as HTMLCanvasElement, size, size, { dir: m.dir, up: zen, sunward: sun, axes: A.bodyAxes('moon', jd), tex: this.tex.moon, color: [170, 170, 165], earthshine: 0.05 + 0.1 * (1 - m.lit) }, 0.96);
      ui.moonDisc.setAttribute('aria-label', L('The Moon as it looks from {0}: {1}, {2}% lit', 'La Luna como se ve desde {0}: {1}, iluminada al {2}%', p.label, PHASE_NAME[m.key](), Math.round(m.lit * 100)));
      this.info.moonRenders++;
    }
    if (ui.phaseName) ui.phaseName.textContent = PHASE_NAME[m.key]();
    if (ui.lit) ui.lit.textContent = L('{0}% lit · {1} days old', 'Iluminada al {0}% · {1} días de edad', Math.round(m.lit * 100), fmtNumber(m.age, 1));
    if (ui.moonNow) ui.moonNow.textContent = m.alt > 0 ? L('Now {0}', 'Ahora {0}', upWords(m.alt, m.az)) : L('Now below the horizon', 'Ahora bajo el horizonte');
    if (ui.far) ui.far.textContent = `${L('Distance: {0} km', 'Distancia: {0} km', fmtNumber(Math.round(m.km / 100) * 100))}${m.km < 362000 ? ` · ${L('close to us: a “supermoon”', 'cerca de nosotros: una “superluna”')}` : m.km > 404000 ? ` · ${L('far from us: it looks a little smaller', 'lejos de nosotros: se ve un poco más pequeña')}` : ''}`;
    // The planets, each as it looks.
    const ps = A.planetsAt(jd, p.lon, p.lat);
    for (const pl of ps) {
      const c = ui[`p-${pl.id}`] as HTMLCanvasElement | undefined;
      if (c) {
        const look = PLANET[pl.id];
        const sat = pl.id === 'saturn', jup = pl.id === 'jupiter', mars = pl.id === 'mars';
        const axes = sat || jup || mars ? A.bodyAxes(pl.id as A.Spinner, jd) : undefined;
        drawDisc(c, sat ? 92 : 56, sat ? 48 : 56, { dir: pl.dir, up: zen, sunward: pl.sunward, axes, tex: sat ? this.tex.saturn : jup ? this.tex.jupiter : mars ? this.tex.mars : null, color: look.color, flat: sat ? 0.098 : jup ? 0.065 : 0, rings: sat, limb: sat || jup ? 0.45 : pl.id === 'uranus' || pl.id === 'neptune' ? 0.3 : 0 }, sat ? 0.38 : 0.9);
        if (sat) this.info.ring = A.ringTilt(jd, pl.dir);
      }
      const nw = ui[`n-${pl.id}`];
      if (nw) nw.textContent = pl.alt > 0 ? L('Now {0}', 'Ahora {0}', upWords(pl.alt, pl.az)) : L('Now below the horizon', 'Ahora bajo el horizonte');
    }
    if (ui.jupiter) this.drawJupiter(ui.jupiter as HTMLCanvasElement, ps.find((x) => x.id === 'jupiter')!, zen);
    if (ui.scale) this.drawScale(ui.scale as HTMLCanvasElement, ps, zen);
    // The sky around.
    if (ui.pano) {
      const marks: SkyMark[] = [];
      const sp = this.altAz(sun, jd);
      if (sp[0] > -2) marks.push({ id: 'sun', az: sp[1], alt: sp[0], label: L('Sun', 'Sol'), color: '#ffd35a', size: 7 });
      marks.push({ id: 'moon', az: m.az, alt: m.alt, label: L('Moon', 'Luna'), color: '#eee', size: 8, moon: { phase: m.phase, limb: A.brightLimb(m.dir, sun, zen) } });
      for (const pl of ps) if (pl.mag < 6.5) marks.push({ id: pl.id, az: pl.az, alt: pl.alt, label: PLANET[pl.id].name(), color: PLANET[pl.id].css, size: Math.max(1.6, 4 - pl.mag * 0.6) });
      const w = (ui.pano.parentElement?.clientWidth || this.body.clientWidth || 340);
      const spots = drawPanorama(ui.pano as HTMLCanvasElement, w, 150, marks, sunAlt, p.lat >= 0, COMPASS());
      (ui.pano as unknown as { spots: typeof spots }).spots = spots;
      const up = marks.filter((x) => x.alt > 0 && x.id !== 'sun').map((x) => x.label);
      ui.panoCap.textContent = `${p.lat >= 0 ? L('Facing south in the middle; north at both ends.', 'Mirando al sur en el centro; el norte en ambos extremos.') : L('Facing north in the middle; south at both ends.', 'Mirando al norte en el centro; el sur en ambos extremos.')} ${up.length ? L('Up now: {0}.', 'Arriba ahora: {0}.', up.join(', ')) : L('Nothing bright is up now.', 'Ahora no hay nada brillante arriba.')} ${L('Tap one to see it in the sky.', 'Toca uno para verlo en el cielo.')}`;
    }
    if (ui.bar) {
      const w = (ui.bar.parentElement?.clientWidth || 340);
      drawNightBar(ui.bar as HTMLCanvasElement, w, 30, n.s.sun, n.s.moon, n.s.lit, (jd - n.w[0]) / (n.w[1] - n.w[0]));
    }
    this.app.renderer.requestRender();
  }

  private altAz(v: V3, jd: number): [number, number] {
    const p = this.place!;
    return A.altAzAt(v, jd, p.lon, p.lat);
  }

  /** Jupiter and its four big moons as they are lined up tonight: its equator level, the sky's east on the left and
   *  west on the right (as with the eye or binoculars, north up). */
  private drawJupiter(c: HTMLCanvasElement, jp: A.PlanetNow, _zen: V3) {
    const w = Math.min(340, (c.parentElement?.clientWidth || 320)), hh = 46;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr); c.style.width = `${w}px`; c.style.height = `${hh}px`;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, w, hh);
    const moons = A.jupiterMoons(this.jd);
    const reach = Math.max(8, ...moons.map((x) => Math.abs(x.x))) + 1.5;
    const px = (w / 2 - 16) / reach; // pixels per Jupiter radius
    const axes = A.bodyAxes('jupiter', this.jd);
    const off = document.createElement('canvas');
    const rr = Math.max(3, px);
    drawDisc(off, rr * 2.2, rr * 2.2, { dir: jp.dir, up: axes.pole, sunward: jp.sunward, axes, tex: this.tex.jupiter, color: PLANET.jupiter.color, flat: 0.065, limb: 0.45 }, 0.9);
    ctx.drawImage(off, w / 2 - rr * 1.1, hh / 2 - rr * 1.1, rr * 2.2, rr * 2.2);
    ctx.font = '600 10px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(200,205,220,0.55)';
    ctx.fillText(L('E', 'E'), 7, hh / 2 + 3); ctx.fillText(L('W', 'O'), w - 7, hh / 2 + 3);
    this.info.jupiter = [];
    const placed: number[] = [];
    for (const mo of [...moons].sort((a, b) => a.x - b.x)) {
      const hidden = !mo.front && Math.hypot(mo.x, mo.y) < 1;
      this.info.jupiter.push({ id: mo.id, x: mo.x, front: mo.front });
      const x = w / 2 + mo.x * px, y = hh / 2 - mo.y * px;
      if (!hidden) { ctx.fillStyle = mo.front && Math.abs(mo.x) < 1 ? 'rgba(255,255,255,0.65)' : '#f4f1e8'; ctx.beginPath(); ctx.arc(x, y, 1.9, 0, Math.PI * 2); ctx.fill(); }
      // Names above or below, so close moons don't overlap.
      const below = placed.some((q) => Math.abs(q - x) < 40);
      if (!below) placed.push(x);
      ctx.fillStyle = hidden ? 'rgba(200,205,220,0.5)' : 'rgba(220,226,240,0.9)';
      ctx.fillText(hidden ? `(${MOON_NAMES[mo.id]()})` : MOON_NAMES[mo.id](), Math.max(26, Math.min(w - 26, x)), below ? hh - 3 : 10);
    }
  }

  /** The planets side by side at one magnification (×150): how much bigger Jupiter looks than Mars tonight. */
  private drawScale(c: HTMLCanvasElement, ps: A.PlanetNow[], zen: V3) {
    const w = Math.min(380, (c.parentElement?.clientWidth || 320)), hh = 64;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr); c.style.width = `${w}px`; c.style.height = `${hh}px`;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, w, hh);
    const max = Math.max(...ps.map((p) => p.diam * (p.id === 'saturn' ? 2.27 : 1)));
    const k = 40 / max; // pixels per arcsecond of width
    const slot = w / ps.length;
    ctx.font = '600 9px system-ui, sans-serif'; ctx.textAlign = 'center';
    ps.forEach((pl, i) => {
      const cx = slot * (i + 0.5), cy = 26;
      const r = Math.max(0.8, (pl.diam * k) / 2);
      const sat = pl.id === 'saturn';
      const off = document.createElement('canvas');
      const box = Math.max(4, r * (sat ? 2.4 : 1.1) * 2);
      const axes = sat || pl.id === 'jupiter' || pl.id === 'mars' ? A.bodyAxes(pl.id as A.Spinner, this.jd) : undefined;
      drawDisc(off, box, box, { dir: pl.dir, up: zen, sunward: pl.sunward, axes, tex: sat ? this.tex.saturn : pl.id === 'jupiter' ? this.tex.jupiter : pl.id === 'mars' ? this.tex.mars : null, color: PLANET[pl.id].color, flat: sat ? 0.098 : pl.id === 'jupiter' ? 0.065 : 0, rings: sat, limb: 0.3 }, sat ? 1 / 2.4 : 1 / 1.1);
      ctx.drawImage(off, cx - box / 2, cy - box / 2, box, box);
      ctx.fillStyle = 'rgba(220,226,240,0.85)';
      ctx.fillText(PLANET[pl.id].name(), cx, hh - 6);
    });
  }

  /** A small Moon as it looks on a night (north up in the north, south up in the south). */
  private miniMoon(c: HTMLCanvasElement, size: number, jd: number) {
    const p = this.place!;
    const m = A.moonAt(jd, p.lon, p.lat);
    drawDisc(c, size, size, { dir: m.dir, up: [0, 0, p.lat >= 0 ? 1 : -1], sunward: A.sunDir(jd).dir, axes: A.bodyAxes('moon', jd), tex: this.tex.moon, color: [170, 170, 165], earthshine: 0.06 }, 0.94);
  }

  // ---- play through the night ----------------------------------------------------------------------------------

  private startPlay() {
    const n = this.night;
    if (!n) return;
    this.playing = true; this.live = false;
    if (this.jd >= n.w[1] - 0.01) this.jd = n.times.sunset ?? n.w[0];
    this.setPlayIcon();
    let last = 0;
    const step = (t: number) => {
      if (!this.playing || !this.body) return;
      if (t - last > 40) {
        last = t;
        const next = this.jd + 6 / 1440;
        if (next >= n.w[1]) { this.stopPlay(); return; }
        this.jd = next; this.renderNow();
      }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
  private stopPlay() { this.playing = false; cancelAnimationFrame(this.raf); this.raf = 0; this.setPlayIcon(); }
  private setPlayIcon() {
    const b = this.body?.querySelector('[data-tonight="play"]');
    if (!b) return;
    clear(b as HTMLElement); b.append(icon(this.playing ? Pause : Play, 18));
  }

  // ---- the sky view, the globe ---------------------------------------------------------------------------------

  /** Shows something of tonight's in the full sky view, from the place, at its best moment. */
  private inSky(target: string, at?: number) {
    const sky = this.skyView, p = this.place;
    if (!sky || !p) return;
    this.stopPlay();
    const jd = at ?? this.jd;
    this.shell.sheet.close();
    sky.open({ frame: 'horizon', place: { lon: p.lon, lat: p.lat, label: p.label }, time: jd, target, back: { label: L('Tonight’s sky', 'El cielo de esta noche'), go: () => { sky.close(); void this.open(); } } });
  }

  private tap(g: [number, number] | null): boolean {
    if (!this.body || this.app.mode || !g) return false;
    this.setPlace(g[0], g[1]);
    this.shell.toast(L('Tonight’s sky from {0}', 'El cielo de esta noche desde {0}', this.place!.label), 1800);
    return true;
  }

  /** On the globe: night, the half of the Earth that sees the Moon, the point with the Moon overhead, and the place. */
  private draw(rc: import('../layers/types').RenderCtx) {
    if (!this.body || !this.place || this.app.mode) return;
    const { ctx, path } = rc;
    const jd = this.jd;
    const date = new Date((jd - 2440587.5) * 86400000);
    ctx.save();
    ctx.fillStyle = rc.theme.dark ? 'rgba(2,6,24,0.22)' : 'rgba(10,20,60,0.16)';
    for (const poly of nightPolygons(date)) { ctx.beginPath(); path(poly as never); ctx.fill(); }
    const m = A.moonAt(jd, 0, 0);
    const sub = A.subPoint(jd, m.dir);
    const up = geoCircle().center(sub).radius(89.05).precision(2)();
    ctx.beginPath(); path(up as never);
    ctx.fillStyle = 'rgba(210,220,255,0.10)'; ctx.fill();
    ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(225,232,255,0.75)'; ctx.lineWidth = 1.4; ctx.stroke(); ctx.setLineDash([]);
    const mp = rc.project(sub[0], sub[1]);
    if (mp) {
      const ss = A.subPoint(jd, A.sunDir(jd).dir);
      const sp = rc.project(ss[0], ss[1]);
      const limb = sp ? (Math.atan2(-(sp[1] - mp[1]), sp[0] - mp[0]) * 180) / Math.PI : 0;
      const g = ctx.createRadialGradient(mp[0], mp[1], 0, mp[0], mp[1], 26);
      g.addColorStop(0, 'rgba(235,240,255,0.55)'); g.addColorStop(1, 'rgba(235,240,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mp[0], mp[1], 26, 0, Math.PI * 2); ctx.fill();
      moonIcon(ctx, mp[0], mp[1], 11, m.phase, limb);
    }
    const pp = rc.project(this.place.lon, this.place.lat);
    if (pp) {
      ctx.strokeStyle = '#ffd35a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(pp[0], pp[1], 9, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffd35a'; ctx.beginPath(); ctx.arc(pp[0], pp[1], 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    this.info.overlay++;
  }

  // ---- Today ---------------------------------------------------------------------------------------------------

  /** Today's line: the Moon tonight and the bright planets to see, from the place last used (or where the globe looks). */
  dayLine(): string {
    const p = this.place ?? this.guessPlace();
    const jd = julian(new Date());
    const m = A.moonAt(jd, p.lon, p.lat);
    const w = A.nightWindow(jd, p.lon);
    const s = A.sample(w[0], w[1], p.lon, p.lat, 20);
    const vis = A.planetsAt(jd, p.lon, p.lat).filter((pl) => pl.mag < 2 && A.goodHours(s, s.planets[pl.id], 8, pl.mag < 0 ? -6 : -9)).map((pl) => PLANET[pl.id].name());
    const moon = L('{0}, {1}% lit', '{0}, iluminada al {1}%', PHASE_NAME[m.key](), Math.round(m.lit * 100));
    return vis.length ? `${moon} · ${L('to see: {0}', 'para ver: {0}', vis.join(', '))}` : moon;
  }
}
