// Planets and moons (v0.52.0): a screensaver tour of the solar system around the globe. It flies from one world to
// the next (the ones chosen, in order or shuffled), follows each round the Sun or its planet (or locks to its orbit)
// while time runs at the chosen speed, and glides the camera in or out while it stays, so the views keep changing.
// Each world's name and a line about it show at the top (read aloud when that is on). Started from the screensaver
// panel; ambient mode hides the controls and keeps the screen awake.
import { Play } from 'lucide';
import { h, icon, toggle, segmented } from '../ui/dom';
import { L } from '../app/i18n';
import { BODIES, type Lock } from './system';
import { worldById, loadFacts, tr } from './worlds';
import { SPEEDS, type Around } from './around';
import type { Space } from './space';
import type { App } from '../app/app';
import type { Ticker } from '../engine/renderer';

export { TOUR_ID } from '../ui/ambient';
export type TourFollow = 'sun' | 'planet' | 'orbit' | 'ride' | 'mix';
export interface TourSettings { worlds: string[]; follow: TourFollow; speed: number; shuffle: boolean }
/** Every world it can visit, from the Sun outwards, each planet followed by its moons. */
export const TOUR_WORLDS = ['mercury', 'venus', 'earth', 'moon', 'mars', 'ceres', 'vesta', 'jupiter', 'io', 'europa', 'ganymede', 'callisto', 'saturn', 'enceladus', 'titan', 'uranus', 'neptune', 'triton', 'pluto', 'charon'];
export const DEFAULT_TOUR: TourSettings = { worlds: ['earth', 'moon', 'mars', 'jupiter', 'io', 'europa', 'saturn', 'titan', 'neptune', 'pluto'], follow: 'mix', speed: 1, shuffle: false };
const isMoon = (id: string) => !!BODIES[id]?.parent;
/** Five choices may take two lines each on a phone. */
const wrapSeg = (el: HTMLElement) => { el.classList.add('seg-wrap'); return el; };

/** The tour's settings, as kept (unknown worlds left out; at least one world). */
export function tourSettings(app: App): TourSettings {
  const t = { ...DEFAULT_TOUR, ...(app.ambient.tour ?? {}) };
  const worlds = TOUR_WORLDS.filter((id) => t.worlds.includes(id));
  return { worlds: worlds.length ? worlds : DEFAULT_TOUR.worlds, follow: t.follow, speed: Math.max(0, Math.min(SPEEDS.length - 2, t.speed)), shuffle: !!t.shuffle };
}

export class SpaceTour {
  private run = 0;
  private timer = 0;
  private glide: Ticker | null = null;
  private order: string[] = [];
  private k = -1;
  private camera: { lon: number; lat: number; zoom: number } | null = null;
  /** The world it was started on (null: the Earth), to go back to when it ends. */
  private from: string | null = null;
  running = false;
  /** For the smoke test: the world shown, how it is followed, how many have been shown. */
  info = { world: '', lock: '' as Lock | '', visits: 0, zoomIn: true };

  constructor(private app: App, private space: Space, private around: Around) {}

  /** Starts the tour: `caption` puts a world's name and line on the screen (and reads it aloud), `secs` is the time
   *  on each world. */
  start(caption: (title: string, words: string) => Promise<void> | void, secs: () => number) {
    if (this.running) return;
    this.running = true;
    this.camera = this.app.renderer.view.camera();
    this.from = this.app.mode === 'world' ? this.space.surface.id ?? null : null;
    const s = tourSettings(this.app);
    this.order = [...s.worlds];
    this.k = -1;
    this.info = { world: '', lock: '', visits: 0, zoomIn: true };
    this.around.quiet();
    void this.next(caption, secs, ++this.run);
  }

  private async next(caption: (title: string, words: string) => Promise<void> | void, secs: () => number, me: number) {
    if (me !== this.run || !this.running) return;
    const s = tourSettings(this.app);
    if (this.k + 1 >= this.order.length) {
      // Round again: in order, or shuffled anew (not starting where it just was).
      this.order = [...s.worlds];
      if (s.shuffle) for (let i = this.order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.order[i], this.order[j]] = [this.order[j], this.order[i]]; }
      if (this.order.length > 1 && this.order[0] === this.info.world) this.order.push(this.order.shift()!);
      this.k = -1;
    } else if (s.shuffle && this.info.visits === 0) {
      for (let i = this.order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.order[i], this.order[j]] = [this.order[j], this.order[i]]; }
    }
    const id = this.order[++this.k];
    this.stopGlide();
    // There.
    if (id === 'earth') { if (this.app.mode === 'world') await this.space.exit(); } else await this.space.enter(id, { bare: true });
    if (me !== this.run || !this.running) return;
    const lock = this.lockFor(s.follow, id, this.info.visits);
    this.around.setLock(lock);
    this.around.play(s.speed);
    const zoomIn = this.info.visits % 2 === 0;
    this.info = { world: id, lock, visits: this.info.visits + 1, zoomIn };
    const t0 = performance.now(), ms = secs() * 1000;
    // Let the flight land, then glide.
    setTimeout(() => { if (me === this.run && this.running) this.startGlide(lock, zoomIn, Math.max(4000, ms - 1500)); }, 1000);
    const f = (await loadFacts()).get(id);
    if (me !== this.run || !this.running) return;
    const name = id === 'earth' ? L('The Earth', 'La Tierra') : tr(worldById(id)?.name);
    const mark = id === 'earth' ? '🌍' : isMoon(id) ? '🌙' : '🪐';
    await caption(`${mark} ${name}`, f?.text ? tr(f.text) : '');
    if (me !== this.run || !this.running) return;
    // The rest of its time (longer when reading aloud took longer).
    this.timer = window.setTimeout(() => void this.next(caption, secs, me), Math.max(4000, ms - (performance.now() - t0)));
  }

  /** How a world is followed: as chosen, or (a mix) in turn a moon by its planet and a planet by the Sun, riding along
   *  behind it (v0.53.0), and locked to its orbit. */
  private lockFor(follow: TourFollow, id: string, n: number): Lock {
    if (follow === 'planet') return isMoon(id) ? 'planet' : 'sun';
    if (follow !== 'mix') return follow;
    return ([isMoon(id) ? 'planet' : 'sun', 'ride', 'orbit'] as Lock[])[n % 3];
  }

  /** The camera glides in (or out) while the world is shown: from where its neighbourhood shows to where the globe
   *  fills the screen; locked to the orbit, it turns slowly round the orbit's pole too. */
  private startGlide(lock: Lock, zoomIn: boolean, ms: number) {
    const view = this.app.renderer.view;
    const fit = this.around.info.fitMoons;
    // Riding along: from well behind the world in close (or back out), what it goes round ahead all the while.
    const ride = lock === 'ride';
    const wide = ride ? this.around.rideZoom(12) : lock === 'planet' ? Math.max(view.minZoom, fit) : Math.max(view.minZoom, Math.min(0.22, fit * 1.15));
    const close = ride ? this.around.rideZoom(2.2) : 0.95;
    const [a, b] = zoomIn ? [wide, close] : [close, wide];
    const t0 = performance.now();
    const ease = (x: number) => x * x * (3 - 2 * x);
    view.flyTo({ zoom: a }, 1200);
    this.glide = (dt) => {
      if (view.animating) return true;
      const t = Math.min(1, (performance.now() - t0 - 1200) / ms);
      if (t < 0) return true;
      view.zoom = Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * ease(t));
      if (lock === 'orbit') this.around.turn((dt / 1000) * 3 * this.app.ambient.speed);
      return t < 1;
    };
    this.app.renderer.tickers.add(this.glide);
    this.app.renderer.requestRender();
  }
  private stopGlide() {
    if (this.glide) this.app.renderer.tickers.delete(this.glide);
    this.glide = null;
  }

  /** The date the tour is at (time runs while it plays). */
  dateText() { return this.around.dateText(); }

  /** Ends the tour: time back to now, the view free, back where it was (the Earth, or the world it started on). */
  async stop() {
    if (!this.running) return;
    this.running = false;
    this.run++;
    clearTimeout(this.timer);
    this.stopGlide();
    this.around.now();
    this.around.setLock('free');
    const camera = this.camera ?? undefined, from = this.from;
    this.camera = null; this.from = null;
    if (from) { await this.space.enter(from, { camera }); return; }
    if (this.app.mode === 'world') await this.space.exit();
    if (camera) this.app.renderer.view.flyTo(camera, 1200);
  }
}

/** The tour's part of the screensaver panel: the worlds to visit, how to follow them, the time speed, shuffled or in
 *  order, and a button to start. */
export function tourSettingsPanel(app: App, start: () => void): HTMLElement {
  const box = h('div', { class: 'tour-set', 'data-tour': '' });
  const save = (t: Partial<TourSettings>) => { app.ambient.tour = { ...tourSettings(app), ...t }; app.save(); };
  const render = () => {
    const s = tourSettings(app);
    const name = (id: string) => (id === 'earth' ? L('The Earth', 'La Tierra') : tr(worldById(id)?.name));
    const chip = (id: string) => {
      const on = s.worlds.includes(id);
      const b = h('button', { type: 'button', class: `chip${on ? ' on' : ''}`, 'aria-pressed': String(on), 'data-tour-world': id }, name(id));
      b.addEventListener('click', () => {
        const w = on ? s.worlds.filter((x) => x !== id) : [...s.worlds, id];
        if (!w.length) return;
        save({ worlds: TOUR_WORLDS.filter((x) => w.includes(x)) });
        render();
      });
      return b;
    };
    const pick = (label: string, ids: string[], attr: string) => {
      const b = h('button', { type: 'button', class: 'chip', [attr]: '' }, label);
      b.addEventListener('click', () => { save({ worlds: ids }); render(); });
      return b;
    };
    const go = h('button', { type: 'button', class: 'pill primary', 'data-tour': 'start' }, icon(Play, 16), L('Start the tour', 'Empezar el recorrido'));
    go.addEventListener('click', start);
    box.replaceChildren(
      h('p', { class: 'muted small' }, L('It flies from world to world, following each round the Sun or its planet while time goes by, and glides in or out as it stays.', 'Vuela de un mundo a otro, siguiendo a cada uno en su camino alrededor del Sol o de su planeta mientras pasa el tiempo, y se acerca o se aleja mientras se queda.')),
      h('div', { class: 'field' }, h('div', { class: 'field-label' }, L('Worlds', 'Mundos')),
        h('div', { class: 'chip-row' }, pick(L('All', 'Todos'), TOUR_WORLDS, 'data-tour-all'), pick(L('Planets', 'Planetas'), TOUR_WORLDS.filter((id) => !isMoon(id)), 'data-tour-planets'), pick(L('Moons', 'Lunas'), TOUR_WORLDS.filter(isMoon), 'data-tour-moons')),
        h('div', { class: 'chip-row tour-worlds' }, ...TOUR_WORLDS.map(chip))),
      h('div', { class: 'field' }, h('div', { class: 'field-label' }, L('Follow', 'Seguir')),
        wrapSeg(segmented<TourFollow>(s.follow, [
          { value: 'sun', label: L('The Sun', 'El Sol') },
          { value: 'planet', label: L('Its planet', 'Su planeta') },
          { value: 'orbit', label: L('The orbit', 'La órbita') },
          { value: 'ride', label: L('Ride along', 'Ir detrás') },
          { value: 'mix', label: L('A mix', 'Un poco de todo') },
        ], (v) => save({ follow: v })))),
      h('div', { class: 'field' }, h('div', { class: 'field-label' }, L('Time speed', 'Velocidad del tiempo')),
        segmented<string>(String(s.speed), SPEEDS.slice(0, -1).map((sp, i) => ({ value: String(i), label: sp.label() })), (v) => save({ speed: Number(v) }))),
      h('div', { class: 'toggles' }, toggle(s.shuffle, (v) => save({ shuffle: v }), L('Shuffle the worlds', 'Mezclar los mundos'))),
      h('p', { class: 'muted small' }, L('The time on each world is the seconds on each view, in the settings below.', 'El tiempo en cada mundo son los segundos en cada vista, en los ajustes de abajo.')),
      h('div', { class: 'tour-actions' }, go),
    );
  };
  render();
  return box;
}
