// One icon per feature (v0.40.0): the same line icon, on a tile of its part of the app's colour, wherever the
// feature is named for getting there: the More menu, Today, its panel's title, the Learn and Play lists. Emoji stay
// for what is inside a feature (an animal, a dish, a flag, a quiz's subject, one map game among the fourteen).
import {
  Luggage, Palette, PawPrint, Pickaxe, Waves, MonitorPlay, History, Orbit, Earth, CircleHelp, Compass, CalendarDays,
  Zap, Medal, Route, PaintBucket, MapPinned, Ruler, Scale, Scaling, ChartScatter, Upload, ImageDown, Monitor, Smartphone,
  Link, Settings, Info, Layers, Layers2, Globe, CalendarCheck, Telescope, GraduationCap, Gamepad2, Wrench, Share2, Bell, Sparkles,
  Map as MapIcon, Mountain, Search, HardDriveDownload, Maximize, Landmark, Hourglass,
  type IconNode,
} from 'lucide';
import { h, icon } from './dom';

/** The parts of the app, each with its colour (--hue-* in styles/main.css). */
export type Hue = 'learn' | 'play' | 'explore' | 'time' | 'space' | 'tools' | 'me';

export interface Feature { icon: IconNode; hue: Hue }

export const FEATURES: Record<string, Feature> = {
  // Learn
  learn: { icon: GraduationCap, hue: 'learn' },
  master: { icon: Earth, hue: 'learn' },
  quiz: { icon: CircleHelp, hue: 'learn' },
  daily: { icon: Zap, hue: 'learn' },
  tours: { icon: Compass, hue: 'learn' },
  onthisday: { icon: CalendarDays, hue: 'learn' },
  progress: { icon: Medal, hue: 'learn' },
  // Play
  play: { icon: Gamepad2, hue: 'play' },
  games: { icon: Route, hue: 'play' },
  fill: { icon: PaintBucket, hue: 'play' },
  onmap: { icon: MapPinned, hue: 'play' },
  // Explore
  explore: { icon: Telescope, hue: 'explore' },
  guide: { icon: Luggage, hue: 'explore' },
  art: { icon: Palette, hue: 'explore' },
  nature: { icon: PawPrint, hue: 'explore' },
  inside: { icon: Pickaxe, hue: 'explore' },
  deep: { icon: Waves, hue: 'explore' },
  ambient: { icon: MonitorPlay, hue: 'explore' },
  legacy: { icon: Landmark, hue: 'time' },
  deeptime: { icon: Hourglass, hue: 'time' },
  bigbang: { icon: Orbit, hue: 'time' },
  // Time and space
  time: { icon: History, hue: 'time' },
  space: { icon: Orbit, hue: 'space' },
  sky: { icon: Sparkles, hue: 'space' },
  // The map and tools
  map: { icon: MapIcon, hue: 'tools' },
  filters: { icon: Layers, hue: 'tools' },
  mapstyle: { icon: Layers2, hue: 'tools' },
  terrain3d: { icon: Mountain, hue: 'tools' },
  search: { icon: Search, hue: 'tools' },
  projection: { icon: Globe, hue: 'tools' },
  tools: { icon: Wrench, hue: 'tools' },
  ruler: { icon: Ruler, hue: 'tools' },
  compare: { icon: Scale, hue: 'tools' },
  truesize: { icon: Scaling, hue: 'tools' },
  'compare-filters': { icon: ChartScatter, hue: 'tools' },
  mydata: { icon: Upload, hue: 'tools' },
  // You
  today: { icon: CalendarCheck, hue: 'learn' },
  share: { icon: Share2, hue: 'me' },
  link: { icon: Link, hue: 'me' },
  export: { icon: ImageDown, hue: 'me' },
  export4k: { icon: Monitor, hue: 'tools' },
  exportphone: { icon: Smartphone, hue: 'me' },
  settings: { icon: Settings, hue: 'me' },
  about: { icon: Info, hue: 'me' },
  reminders: { icon: Bell, hue: 'me' },
  backup: { icon: HardDriveDownload, hue: 'me' },
  fullscreen: { icon: Maximize, hue: 'me' },
};

/** A panel's feature, by its sheet id (the panels of a feature's own pages share its icon). */
const SHEETS: Record<string, string> = {
  master: 'master', quiz: 'quiz', 'quiz-regions': 'quiz', tours: 'tours', onthisday: 'onthisday', progress: 'progress',
  play: 'games', 'play-hop': 'games', fill: 'fill', onmap: 'onmap',
  guide: 'guide', 'guide-city': 'guide', art: 'art', 'art-trail': 'art', nature: 'nature', 'nature-here': 'nature',
  'wild-best': 'nature', 'wild-relatives': 'nature', 'green-best': 'nature', 'green-relatives': 'nature', 'green-whats-on': 'nature',
  inside: 'inside', slice: 'inside', deep: 'deep', screensaver: 'ambient',
  time: 'time', 'story-browse': 'time', 'war-step': 'time', 'born-here': 'time', space: 'space',
  filters: 'filters', projection: 'projection', compare: 'compare-filters', mydata: 'mydata', 'terrain-save': 'filters',
  today: 'today', settings: 'settings', about: 'about', reminders: 'reminders',
};

export function featureOfSheet(id: string): string | null { return SHEETS[id] ?? (FEATURES[id] ? id : null); }

/** The feature's tile: its icon in its colour, on a tint of it. Sizes: sm (menu rows), md (lists), lg (headers). */
export function ftile(id: string, size: 'sm' | 'md' | 'lg' = 'md'): HTMLElement {
  const f = FEATURES[id] ?? FEATURES.explore;
  const px = size === 'sm' ? 16 : size === 'md' ? 20 : 22;
  return h('span', { class: `ftile ftile-${size} hue-${f.hue}`, 'data-feature': id, 'aria-hidden': 'true' }, icon(f.icon, px));
}
