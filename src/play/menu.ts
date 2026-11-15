// The Map games panel (v0.25.0): today's puzzle of each game (the same for everyone), and every game with its best
// score. The games share one card and one way of putting the map back (host.ts); Border hop keeps its own panel of
// goals and knowledge rounds.
import { Route, ChevronLeft, Play } from 'lucide';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import { h, icon, clear, toggle } from '../ui/dom';
import { PlayHost, L, es } from './host';
import { BorderHop } from './hop';
import { PinIt, PACKS, type Pack } from './pin';
import { HigherLower } from './hilo';
import { GrandTour, TOUR_MODES, REGIONS, type TourMode } from './tour';
import { NameThemAll, NAME_LISTS, CONTINENTS, type NameList } from './names';
import { BorderChain } from './chain';
import { Outline } from './outline';
import { starText } from './score';
import { GAMES, type GameId } from './logic';
import { gameDaily, progress, dayKey } from '../learn/progress';

const GAME_TEXT: Record<GameId, { icon: string; en: string; es: string; desc: { en: string; es: string } }> = {
  hop: { icon: '🧭', en: 'Border hop', es: 'Salto de fronteras', desc: { en: 'From one country to a far one across land borders.', es: 'De un país a otro lejano cruzando fronteras terrestres.' } },
  pin: { icon: '📍', en: 'Pin it', es: 'Pon el pin', desc: { en: 'Drop a pin where a place is: the closer, the more points.', es: 'Pon un pin donde está un lugar: cuanto más cerca, más puntos.' } },
  hilo: { icon: '⚖️', en: 'Higher or lower', es: 'Más o menos', desc: { en: 'Which of two countries has more…? Keep the run going.', es: '¿Cuál de dos países tiene más…? Mantén la racha.' } },
  tour: { icon: '🧳', en: 'Grand tour', es: 'Gran vuelta', desc: { en: 'Visit six cities in the shortest way.', es: 'Visita seis ciudades por el camino más corto.' } },
  names: { icon: '📝', en: 'Name them all', es: 'Nómbralos todos', desc: { en: 'Every country, capital or neighbour, against the clock.', es: 'Todos los países, capitales o vecinos, contra el reloj.' } },
  chain: { icon: '⛓️', en: 'Border chain', es: 'Cadena de fronteras', desc: { en: 'Neighbour after neighbour, never the same twice, in 90 seconds.', es: 'Vecino tras vecino, sin repetir, en 90 segundos.' } },
  outline: { icon: '🖼️', en: 'Outline', es: 'Silueta', desc: { en: 'Guess a country from its shape.', es: 'Adivina un país por su forma.' } },
};

export class MapGames {
  readonly host: PlayHost;
  readonly hop: BorderHop;
  readonly pin: PinIt;
  readonly hilo: HigherLower;
  readonly tour: GrandTour;
  readonly names: NameThemAll;
  readonly chain: BorderChain;
  readonly outline: Outline;

  constructor(private app: App, private shell: Shell) {
    this.host = new PlayHost(app, shell);
    this.hop = new BorderHop(app, shell, this.host);
    this.pin = new PinIt(app, shell, this.host);
    this.hilo = new HigherLower(app, shell, this.host);
    this.tour = new GrandTour(app, shell, this.host);
    this.names = new NameThemAll(app, shell, this.host);
    this.chain = new BorderChain(app, shell, this.host);
    this.outline = new Outline(app, shell, this.host);
    const back = () => void this.openMenu();
    const borders = () => this.hop.borders();
    for (const g of [this.hop, this.pin, this.hilo, this.tour, this.names, this.chain, this.outline]) g.back = back;
    for (const g of [this.tour, this.names, this.chain, this.outline]) g.borders = borders;
    shell.addMenu({ id: 'play', icon: Route, label: () => L('Map games', 'Juegos en el mapa'), order: 29, onClick: () => void this.openMenu() });
  }

  /** Starts today's puzzle of a game. */
  async daily(game: GameId) {
    const day = dayKey();
    if (game === 'hop') return this.hop.startDaily();
    if (game === 'tour') return this.tour.start({ day });
    if (game === 'names') return this.names.start({ day });
    return this[game].start({ day });
  }

  private card(icon_: string, title: string, desc: string, attrs: Record<string, string>, onClick: () => void, done = false) {
    const c = h('button', { type: 'button', class: `mode-card${done ? ' daily-card done' : ''}`, ...attrs }, h('span', { class: 'mode-icon' }, icon_),
      h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, title), h('span', { class: 'mode-desc' }, desc)));
    c.addEventListener('click', onClick);
    return c;
  }

  async openMenu() {
    const body = h('div', { class: 'play-menu' });
    const today = await this.hop.today();
    const T = (g: GameId) => GAME_TEXT[g];
    const nm = (g: GameId) => (es() ? T(g).es : T(g).en);
    // Today's puzzles.
    const daily = h('div', { class: 'mode-list play-daily' });
    let played = 0;
    for (const g of GAMES) {
      const r = gameDaily(g);
      if (r) played++;
      const what = g === 'hop' && today ? `${today.from} → ${today.to} · ${today.goal}` : es() ? T(g).desc.es : T(g).desc.en;
      daily.append(this.card(T(g).icon, nm(g), r ? `${L('Done', 'Hecho')}: ${r.score} ${starText(r.stars)}` : what, { 'data-daily': g }, () => void this.daily(g), !!r));
    }
    // The games, each with its best.
    const best = progress().play.best;
    const games = h('div', { class: 'mode-list' });
    for (const g of GAMES) {
      const b = g === 'hop' ? Math.max(0, ...['count', 'people', 'area', 'km'].map((k) => best[k] ?? 0)) : best[g] ?? 0;
      games.append(this.card(T(g).icon, nm(g), `${es() ? T(g).desc.es : T(g).desc.en}${b ? ` · ${L('Best', 'Récord')}: ${b}` : ''}`, { 'data-game-open': g }, () => this.open(g)));
    }
    body.append(
      h('p', { class: 'muted small' }, L('Games you play on the map, scored against the best result the app can find. A new puzzle of each game every day, the same for everyone.', 'Juegos en el mapa, puntuados frente al mejor resultado que encuentra la app. Cada día, un nuevo reto de cada juego, el mismo para todos.')),
      h('h3', { class: 'sec-title' }, `${L('Today', 'Hoy')} · ${played}/${GAMES.length}`), daily,
      h('h3', { class: 'sec-title' }, L('Games', 'Juegos')), games);
    this.shell.openPanel('play', L('Map games', 'Juegos en el mapa'), body);
  }

  /** A game's own panel (its choices), or the game straight away when it has none. */
  open(g: GameId) {
    if (g === 'hop') { void this.hop.openMenu(); return; }
    if (g === 'hilo') { void this.hilo.start(); return; }
    if (g === 'chain') { void this.chain.start(); return; }
    const T = GAME_TEXT[g];
    const body = h('div', { class: 'play-menu' });
    const backB = h('button', { type: 'button', class: 'pill sm', 'data-play': 'back' }, icon(ChevronLeft, 15), L('Map games', 'Juegos en el mapa'));
    backB.addEventListener('click', () => void this.openMenu());
    body.append(backB, h('p', { class: 'muted small' }, es() ? T.desc.es : T.desc.en));
    const chips = <V extends string>(title: string, list: [V, { en: string; es: string }][], cur: () => V, set: (v: V) => void) => {
      const row = h('div', { class: 'chip-row' });
      const draw = () => {
        clear(row);
        for (const [v, label] of list) {
          const b = h('button', { type: 'button', class: `chip${cur() === v ? ' on' : ''}`, 'data-v': v }, es() ? label.es : label.en);
          b.addEventListener('click', () => { set(v); draw(); });
          row.append(b);
        }
      };
      draw();
      body.append(h('h3', { class: 'sec-title' }, title), row);
    };
    let start: () => void = () => {};
    if (g === 'pin') {
      chips(L('Places', 'Lugares'), PACKS, () => this.pin.pick.pack, (v: Pack) => { this.pin.pick.pack = v; });
      body.append(h('div', { class: 'toggles' }, toggle(this.pin.pick.hard, (v) => { this.pin.pick.hard = v; }, L('Hard: no names at all, not even the seas', 'Difícil: ningún nombre, ni siquiera los mares'))));
      start = () => void this.pin.start();
    } else if (g === 'tour') {
      chips(L('How', 'Cómo'), TOUR_MODES, () => this.tour.pick.mode, (v: TourMode) => { this.tour.pick.mode = v; });
      chips(L('Where', 'Dónde'), REGIONS, () => this.tour.pick.region, (v) => { this.tour.pick.region = v; });
      start = () => void this.tour.start();
    } else if (g === 'names') {
      chips(L('What', 'Qué'), NAME_LISTS, () => this.names.pick.list, (v: NameList) => { this.names.pick.list = v; });
      chips(L('Where (countries and capitals)', 'Dónde (países y capitales)'), CONTINENTS, () => this.names.pick.area, (v) => { this.names.pick.area = v; });
      start = () => void this.names.start();
    } else if (g === 'outline') {
      body.append(h('div', { class: 'toggles' }, toggle(this.outline.pick.hard, (v) => { this.outline.pick.hard = v; }, L('Hard: the shapes are turned', 'Difícil: las siluetas están giradas'))));
      start = () => void this.outline.start();
    }
    const play = h('button', { type: 'button', class: 'pill primary', 'data-play': 'start' }, icon(Play, 16), L('Play', 'Jugar'));
    play.addEventListener('click', start);
    body.append(h('div', { class: 'tool-actions' }, play));
    this.shell.openPanel(`play-${g}`, `${T.icon} ${es() ? T.es : T.en}`, body);
  }
}
