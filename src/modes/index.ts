// Time-travel modes behind the "Time travel" dock button: political history, plate tectonics, and the
// story collections (wars and conquests, eras and ideas, food through time, great structures).
import { History } from 'lucide';
import { h } from '../ui/dom';
import { t } from '../app/i18n';
import { HistoryMode } from './history';
import { PangeaMode } from './pangea';
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
  tap?: (lon: number, lat: number) => boolean;
}

export class TimeTravel {
  readonly modes: Mode[] = [];
  readonly stories = {} as Record<StoryKind, StoryMode>;
  get wars() { return this.stories.wars; }

  constructor(private app: App, private shell: Shell) {
    const history = new HistoryMode(app, shell);
    this.add({
      id: 'history', icon: '🏛️', title: () => t('historyTitle'), desc: () => t('historyDesc'),
      enter: () => history.enter(), exit: () => history.exit(), tap: (lon, lat) => history.tap(lon, lat),
    });
    const pangea = new PangeaMode(app, shell);
    this.add({
      id: 'pangea', icon: '🌋', title: () => t('pangeaTitle'), desc: () => t('pangeaDesc'),
      enter: () => pangea.enter(), exit: () => pangea.exit(), tap: (lon, lat) => pangea.tap(lon, lat),
    });
    // Each story collection opens its list of stories; the mode starts when one is picked.
    const icons: Record<StoryKind, string> = { wars: '⚔️', eras: '🎨', food: '🌾', structures: '🏛️' };
    for (const kind of STORY_KINDS) {
      const m = (this.stories[kind] = new StoryMode(app, shell, kind));
      this.add({
        id: kind, icon: icons[kind], title: () => t(`${kind}Title`), desc: () => t(`${kind}Desc`),
        enter: () => m.pick(), exit: () => m.exit(), tap: (lon, lat) => m.tap(lon, lat),
      });
    }
    shell.addDock({ id: 'time', icon: History, label: () => t('timeTravelShort'), order: 30, onClick: () => this.open() });
    // In a mode, taps go to the mode instead of selecting today's countries.
    shell.tapHandlers.unshift((_x, _y, g) => {
      if (!app.mode) return false;
      const m = this.modes.find((x) => x.id === app.mode);
      if (g && m?.tap) m.tap(g[0], g[1]);
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
