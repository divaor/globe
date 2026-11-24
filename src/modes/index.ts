// Time-travel modes behind the "Time travel" dock button: political history, Deep time (v0.45.0: the Earth from its
// first days, with the plate tectonics of "Pangea to today" inside it), and the story collections (wars and conquests, eras and ideas, food through time, great structures, peoples
// and civilizations, life through time, games of the world).
import { History } from 'lucide';
import { h } from '../ui/dom';
import { t } from '../app/i18n';
import { HistoryMode } from './history';
import { DeepTime } from '../deeptime/deeptime';
import { L } from '../app/i18n';
import { StoryMode, STORY_KINDS, type StoryKind } from './stories';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';

export interface Mode {
  id: string;
  icon: string;
  title: () => string;
  desc: () => string;
  enter: () => Promise<void> | void;
  exit: () => Promise<void> | void;
  /** A tap on the map: where (lon, lat) and on screen (x, y). */
  tap?: (lon: number, lat: number, x?: number, y?: number) => boolean;
  /** Not listed in the Time travel panel (another world, opened from the Space panel). */
  hidden?: boolean;
}

export class TimeTravel {
  readonly modes: Mode[] = [];
  readonly stories = {} as Record<StoryKind, StoryMode>;
  /** Borders through time (Time detective shows its maps). */
  readonly history: HistoryMode;
  /** Deep time (v0.45.0). */
  readonly deep: DeepTime;
  get wars() { return this.stories.wars; }

  constructor(private app: App, private shell: Shell) {
    const history = (this.history = new HistoryMode(app, shell));
    this.add({
      id: 'history', icon: '🏛️', title: () => t('historyTitle'), desc: () => t('historyDesc'),
      enter: () => history.enter(), exit: () => history.exit(), tap: (lon, lat) => history.tap(lon, lat),
    });
    const deep = (this.deep = new DeepTime(app, shell));
    deep.leaveMode = async () => { if (app.mode && app.mode !== 'deeptime') await this.modes.find((x) => x.id === app.mode)?.exit(); };
    this.add({
      id: 'deeptime', icon: '⏳', title: () => L('Deep time', 'El tiempo profundo'),
      desc: () => L('From the Earth’s first days to today: moving continents, past life, ice ages, the asteroid, and could you breathe there?', 'Desde los primeros días de la Tierra hasta hoy: continentes en movimiento, vida del pasado, glaciaciones, el asteroide y ¿podrías respirar allí?'),
      enter: () => deep.enter(4540), exit: () => deep.exit(), tap: (lon, lat, x, y) => deep.tap(x, y, lon, lat),
    });
    // "Pangea to today" (v0.3.0) is part of Deep time now: its id opens Deep time at 250 million years ago (tours).
    this.add({
      id: 'pangea', icon: '🌋', hidden: true, title: () => t('pangeaTitle'), desc: () => t('pangeaDesc'),
      enter: () => deep.enter(250), exit: () => deep.exit(), tap: (lon, lat, x, y) => deep.tap(x, y, lon, lat),
    });
    // A Life through time step opens Deep time at its age ("See the continents move").
    app.on('pangea-at', (ma) => void (async () => {
      shell.sheet.close();
      if (app.mode === 'deeptime') deep.setMa(Number(ma));
      else await deep.enter(Number(ma));
    })());
    // Each story collection opens its list of stories; the mode starts when one is picked.
    const icons: Record<StoryKind, string> = { wars: '⚔️', eras: '🎨', food: '🌾', structures: '🏛️', people: '🏺', life: '🦕', games: '🏅', journeys: '🧭', beliefs: '🛐', writing: '✍️', plagues: '🦠', disasters: '🌋', music: '🎵', books: '📚', art: '🖼️', inventions: '💡', heritage: '🏛️', space: '🚀', lives: '👤' };
    for (const kind of STORY_KINDS) {
      const m = (this.stories[kind] = new StoryMode(app, shell, kind));
      this.add({
        id: kind, icon: icons[kind], title: () => t(`${kind}Title`), desc: () => t(`${kind}Desc`),
        enter: () => m.pick(), exit: () => m.exit(), tap: (lon, lat) => m.tap(lon, lat),
      });
    }
    // A filter's card (the inventions map, an animal, a plant, a life) or On this day opens the story its item comes
    // from, at its step, paused and with all its controls (guided tours call show(), which leaves those to the tour).
    // (`back`: where the story's X goes back to, the list it was opened from.)
    app.on('open-story', (kind, id, step, back) => void (async () => {
      const k = kind as StoryKind;
      const m = this.stories[k];
      if (!m) return;
      if (app.mode && app.mode !== k) await this.modes.find((x) => x.id === app.mode)?.exit();
      shell.sheet.close();
      shell.card.hide();
      await m.openAt(String(id), Number(step), typeof back === 'function' ? (back as () => void) : undefined);
    })());
    shell.addMenu({ id: 'time', icon: History, label: () => t('timeTravel'), order: 10, group: 'explore', onClick: () => this.open() });
    // In a mode, taps go to the mode instead of selecting today's countries.
    shell.tapHandlers.unshift((x, y, g) => {
      if (!app.mode) return false;
      const m = this.modes.find((md) => md.id === app.mode);
      if (g && m?.tap) m.tap(g[0], g[1], x, y);
      return true;
    });
  }

  add(m: Mode) { this.modes.push(m); }

  async enter(id: string) {
    const m = this.modes.find((x) => x.id === id);
    if (!m) return;
    if (this.app.mode && this.app.mode !== id) await this.modes.find((x) => x.id === this.app.mode)?.exit();
    this.shell.sheet.close();
    await m.enter();
  }

  open() {
    if (this.shell.sheet.isOpen('time')) { this.shell.sheet.close(); return; }
    const list = h('div', { class: 'mode-list' });
    for (const m of this.modes) {
      if (m.hidden) continue;
      const on = this.app.mode === m.id;
      const card = h('button', { type: 'button', class: `mode-card${on ? ' on' : ''}` },
        h('span', { class: 'mode-icon' }, m.icon),
        h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, m.title()), h('span', { class: 'mode-desc' }, m.desc())));
      card.addEventListener('click', () => void (on ? m.exit() : this.enter(m.id)));
      list.append(card);
    }
    this.shell.openPanel('time', t('timeTravel'), list);
  }
}
