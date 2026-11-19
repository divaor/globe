import './styles/main.css';
import { App } from './app/app';
import { Shell } from './ui/shell';
import { playlistFromLink, MINE_ID } from './ui/playlists';
import { MyData } from './mydata/mydata';
import { myDataPanel } from './mydata/panel';
import { Upload } from 'lucide';
import { coreLayers } from './layers';
import { t, tx, fmtNumber } from './app/i18n';
import { L } from './play/host';
import { gameDaily, dayKey } from './learn/progress';
import { fillState } from './fill/store';
import { onmapState } from './onmap/store';
import { Today } from './today/today';
import { Reminders } from './today/reminders';
import { settingsExtras } from './ui/settings';
import { ALL_DECKS } from './master/srs';
import { TimeTravel } from './modes';
import { STORY_KINDS, storyHashKey } from './modes/stories';
import { Tools } from './tools/tools';
import { Learn, dailyNumber } from './learn/learn';
import { registerScriptFonts } from './app/scriptFonts';
import { PersonalMaps } from './personal/personal';
import { Compare } from './compare/compare';
import { TerrainUI } from './ui/terrain';
import { Terrain3D } from './ui/terrain3d';
import { Space } from './space/space';
import { Orrery } from './space/orrery';
import { Sky } from './sky/sky';
import { Galaxy } from './sky/galaxy';
import { Elements } from './sky/elements';
import { worldHook } from './modes/stories';
import { spainView } from './ui/spainview';
import { MapGames } from './play/menu';
import { Master } from './master/master';
import { FillMap } from './fill/fill';
import { PutOnMap } from './onmap/onmap';
import type { BorderHop } from './play/hop';
import { TravelGuide } from './guide/guide';
import { ArtGuide } from './artguide/artguide';
import { Lives } from './lives/lives';
import { Wild } from './wild/finder';
import { Plants } from './green/finder';
import { InsideEarth } from './earth/inside';
import { DeepSea } from './ocean/deep';
import { shouldWelcome, showWelcome } from './ui/welcome';

declare global { interface Window { atlas?: { app: App; shell: Shell; time: TimeTravel; tools: Tools; learn: Learn; personal: PersonalMaps; compare: Compare; terrain: TerrainUI; terrain3d: Terrain3D; space: Space; orrery: Orrery; sky: Sky; galaxy: Galaxy; elements: Elements; myData: MyData; hop: BorderHop; play: MapGames; guide: TravelGuide; art: ArtGuide; lives: Lives; wild: Wild; plants: Plants; inside: InsideEarth; deep: DeepSea; master: Master; fill: FillMap; onmap: PutOnMap; today: Today; reminders: Reminders; i18n: { L: typeof L; t: typeof t; tx: typeof tx } } } }

async function boot() {
  // Read before the app rewrites the address with its own state.
  const shared = new URLSearchParams(location.hash.slice(1));
  const root = document.getElementById('app')!;
  const canvases = {
    bg: document.getElementById('bg') as HTMLCanvasElement,
    gl: document.getElementById('gl') as HTMLCanvasElement,
    fg: document.getElementById('fg') as HTMLCanvasElement,
  };
  const ui = document.getElementById('ui')!;
  const app = new App(ui, canvases);
  app.register(coreLayers());
  // Optional filter packs load in parallel; each registers more filters when ready.
  const packs = import.meta.glob('./layers/packs/*.ts');
  const resize = () => app.renderer.resize(root.clientWidth, root.clientHeight);
  new ResizeObserver(resize).observe(root);
  resize();
  const shell = new Shell(app);
  const time = new TimeTravel(app, shell);
  const tools = new Tools(app, shell);
  const learn = new Learn(app, shell, time);
  const personal = new PersonalMaps(app, shell);
  const compare = new Compare(app, shell, time);
  const terrain = new TerrainUI(app, shell);
  const terrain3d = new Terrain3D(app, shell, terrain);
  const space = new Space(app, shell, time);
  const orrery = new Orrery(app, shell, space);
  const sky = new Sky(app, shell, space);
  const galaxy = new Galaxy(app, shell, space, sky);
  const elements = new Elements(app, shell, space, sky);
  learn.sky = sky;
  learn.elements = elements;
  learn.space = space;
  learn.orrery = orrery;
  // Map games (v0.24.0): a game and a quiz or tour never share the map.
  const play = new MapGames(app, shell);
  const hop = play.hop;
  play.host.beforeStart = () => learn.closeAll();
  play.host.exitMode = async () => { await time.modes.find((m) => m.id === app.mode)?.exit(); };
  learn.beforeStart = () => void play.host.close();
  // Master the world (v0.34.0): on the games' card and map; Learn's Quiz panel links to it and back.
  const master = new Master(app, shell, play.host);
  master.openQuiz = () => learn.openQuizMenu();
  learn.master = master;
  // Fill the map (v0.35.0): on the same card and map; its region of the day is in the Map games panel too.
  const fill = new FillMap(app, shell, play.host, master);
  fill.openMaster = () => void master.openPanel();
  play.extraToday.push(async () => ((await fill.ready()) ? fill.dailyCard() : null));
  const onmap = new PutOnMap(app, shell, play.host);
  play.extraToday.push(async () => ((await fill.states.ready()) ? fill.states.dailyCard() : null));
  play.extraToday.push(async () => ((await onmap.ready()) ? onmap.dailyCard() : null));
  // Both are games too, in the Map games panel's list (v0.37.0), with their own panels.
  play.extraGames.push(
    { id: 'fill', icon: 'fill', title: () => L('Fill the map', 'Llena el mapa'), desc: () => L('Colour in the world, country by country', 'Colorea el mundo, país por país'), open: () => void fill.openPanel() },
    { id: 'onmap', icon: 'onmap', title: () => L('Put it on the map', 'Ponlo en el mapa'), desc: () => L('Six places of a country to put on the map, Wordle style', 'Seis lugares de un país para poner en el mapa, al estilo Wordle'), open: () => void onmap.openPanel() },
  );
  // Today (v0.37.0): every daily in one place, from the bottom bar; each game adds itself.
  const today = new Today(shell);
  today.openProgress = () => learn.openProgress();
  today.add({
    id: 'daily', order: 10, section: 'main', done: () => learn.todayDaily().done, share: () => learn.todayDaily().line,
    card: () => { const d = learn.todayDaily(); return today.line('daily', 'daily', d.title, d.desc, d.done, d.open); },
  });
  today.add({
    id: 'master', order: 20, section: 'main',
    done: () => { const g = master.todayGoal(); return g.n >= g.goal; },
    card: () => {
      const g = master.todayGoal();
      return today.line('master', 'master', L('Master the world', 'Domina el mundo'),
        `${L('Today’s goal: {0} of {1} answers', 'Meta de hoy: {0} de {1} respuestas', g.n, g.goal)}${g.due ? ` · ${L('{0} to review', '{0} por repasar', g.due)}` : ''}`, g.n >= g.goal, () => void master.openPanel());
    },
    share: () => { const g = master.todayGoal(); return g.n >= g.goal ? `🎯 ${L('Master the world', 'Domina el mundo')}: ${g.goal}/${g.goal}` : null; },
  });
  today.add({
    id: 'fill', order: 30, section: 'main', done: () => !!fillState().dailies[dayKey()],
    card: async () => ((await fill.ready()) ? fill.dailyCard() : null),
    share: () => { const d = fillState().dailies[dayKey()]; return d ? `🖍️ ${L('Region of the day', 'Región del día')}: ★ ${d.s}/${d.n}` : null; },
  });
  // Fill the states' country of the day (v0.38.0).
  today.add({
    id: 'states', order: 35, section: 'main', done: () => !!fillState().stateDailies[dayKey()],
    card: async () => ((await fill.states.ready()) ? fill.states.dailyCard() : null),
    share: () => { const d = fillState().stateDailies[dayKey()]; return d ? `🗺️ ${L('Country of the day', 'País del día')}: ★ ${d.s}/${d.n}` : null; },
  });
  today.add({
    id: 'onmap', order: 40, section: 'main', done: () => !!onmapState().dailies[dayKey()],
    card: async () => ((await onmap.ready()) ? onmap.dailyCard() : null),
    share: () => { const d = onmapState().dailies[dayKey()]; return d ? `📍 ${L('Put it on the map', 'Ponlo en el mapa')}: ${d.solved ? d.tries : 'X'}/5` : null; },
  });
  play.todayGames().forEach((g0, i) => {
    const game = () => play.todayGames().find((x) => x.id === g0.id)!;
    today.add({
      id: `game-${g0.id}`, order: 100 + i, section: 'games', done: () => !!gameDaily(g0.id),
      card: () => { const g = game(); return today.tile(`game-${g.id}`, g.icon, g.name, g.result ? fmtNumber(g.result.score) : null, g.open); },
      share: () => { const g = game(); return g.result ? `${g.icon} ${fmtNumber(g.result.score)}${'★'.repeat(g.result.stars)}` : null; },
    });
  });
  today.addRead({
    id: 'onthisday', order: 10,
    card: () => today.line('onthisday', 'onthisday', L('On this day', 'Tal día como hoy'), L('What happened on this day: events, births and deaths', 'Lo que pasó un día como hoy: hechos, nacimientos y muertes'), false, () => void learn.openOnThisDay()),
  });
  // Reminders (v0.37.1): a 🔔 switch in each daily game, one gentle notification a day (or a calendar reminder).
  const reminders = new Reminders(shell);
  today.remindLine = () => reminders.todayLine();
  settingsExtras.push({ title: () => L('Reminders', 'Recordatorios'), body: () => reminders.settings() });
  reminders.add({
    id: 'daily', order: 10, icon: '🗓️', name: () => L('Daily challenge', 'Reto del día'),
    label: () => L('Remind me of the Daily challenge', 'Recuérdame el Reto del día'), done: () => learn.todayDaily().done,
    words: (day) => ({ t: `🗓️ ${L('Daily challenge', 'Reto del día')} #${dailyNumber(day)}`, b: L('Eight questions, the same for everyone today', 'Ocho preguntas, las mismas para todos hoy') }),
  });
  ALL_DECKS.forEach((deck, k) => reminders.add({
    id: `master:${deck}`, order: 20 + k, icon: master.deckIcon(deck), name: () => master.deckName(deck),
    label: () => L('Remind me to practise {0}', 'Recuérdame practicar {0}', master.deckName(deck).toLowerCase()),
    done: () => master.deckToday(deck), words: (day) => master.deckWords(deck, day),
  }));
  reminders.add({
    id: 'fill', order: 30, icon: '🖍️', name: () => L('Region of the day', 'Región del día'),
    label: () => L('Remind me of the region of the day', 'Recuérdame la región del día'), done: () => !!fillState().dailies[dayKey()], prepare: () => fill.ready(),
    words: (day) => ({ t: `🖍️ ${L('Fill the map: the region of the day', 'Llena el mapa: la región del día')}`, b: fill.dayWhat(day) ?? L('A new region to fill in today', 'Una nueva región para colorear hoy') }),
  });
  reminders.add({
    id: 'states', order: 35, icon: '🗺️', name: () => L('Country of the day', 'País del día'),
    label: () => L('Remind me of the country of the day', 'Recuérdame el país del día'), done: () => !!fillState().stateDailies[dayKey()], prepare: () => fill.states.ready(),
    words: (day) => ({ t: `🗺️ ${L('Fill the states: the country of the day', 'Llena los estados: el país del día')}`, b: fill.states.dayWhat(day) }),
  });
  reminders.add({
    id: 'onmap', order: 40, icon: '📍', name: () => L('Put it on the map', 'Ponlo en el mapa'),
    label: () => L('Remind me of Put it on the map’s puzzle', 'Recuérdame el reto de Ponlo en el mapa'), done: () => !!onmapState().dailies[dayKey()], prepare: () => onmap.ready(),
    words: (day) => { const w = onmap.dayScope(day); return { t: `📍 ${L('Put it on the map: today', 'Ponlo en el mapa: hoy')}`, b: w ? L('Six places in {0} to put on the map', 'Seis lugares de {0} para poner en el mapa', w) : L('Six places to put on the map', 'Seis lugares para poner en el mapa') }; },
  });
  reminders.add({
    id: 'games', order: 50, icon: '🎮', name: () => L('Map games', 'Juegos en el mapa'),
    label: () => L('Remind me of the map games’ puzzles', 'Recuérdame los retos de los juegos en el mapa'), done: () => play.todayGames().some((g) => !!g.result),
    words: () => { const gs = play.todayGames(); const some = gs.slice(0, 3).map((g) => g.name).join(', '); return { t: `🎮 ${L('Map games', 'Juegos en el mapa')}`, b: L('{0} puzzles today: {1}…', '{0} retos hoy: {1}…', gs.length, some) }; },
  });
  // The travel guide (v0.26.0).
  const guide = new TravelGuide(app, shell, time, learn);
  // Art and architecture (v0.27.0): its trails, and the guide's Art and Buildings tabs.
  const art = new ArtGuide(app, shell, guide);
  guide.art = art;
  // Lives on the map (v0.28.0): its list of lives, two lives side by side, and its links to the guides.
  const lives = new Lives(app, shell, time.stories.lives, guide, art);
  guide.lives = lives;
  // Wild world (v0.30.0): More → Nature, the animal finder and What lives here?.
  const wild = new Wild(app, shell);
  guide.wild = wild;
  // Green planet (v0.31.0): More → Nature → Plants, the plant finder and What grows here?.
  const plants = new Plants(app, shell, wild);
  guide.plants = plants;
  // Inside the Earth (v0.32.0): More → Inside the Earth, the globe cut open, dig down from here, seismic waves.
  const inside = new InsideEarth(app, shell);
  const deep = new DeepSea(app, shell);
  learn.inside = inside;
  shell.ambient.cut = inside;
  // A story step on another world shows that world under the story.
  worldHook.show = (id) => { space.surface.quiet = !!id; void space.surface.set(id); };
  // Your own data: tables kept on this device become filters; the panel reads new ones.
  const myData = new MyData(app);
  const openMyData = () => shell.openPanel('mydata', t('cat.mine'), myDataPanel(app, myData, (msg) => { shell.sheet.close(); shell.toast(msg, 2600); }));
  app.on('mydata', openMyData);
  shell.addMenu({ id: 'mydata', icon: Upload, label: () => t('cat.mine'), order: 40, group: 'map', onClick: openMyData });
  void myData.init();
  window.atlas = { app, shell, time, tools, learn, personal, compare, terrain, terrain3d, space, orrery, sky, galaxy, elements, myData, hop, play, guide, art, lives, wild, plants, inside, deep, master, fill, onmap, today, reminders, i18n: { L, t, tx } };
  await Promise.all(Object.values(packs).map(async (load) => {
    try {
      const mod = (await load()) as { default?: (app: App, shell: Shell) => void | Promise<void> };
      await mod.default?.(app, shell);
    } catch (e) { console.warn('filter pack failed', e); }
  }));
  await app.start();
  // Spain's Spanish: the page's texts and the map's labels with Spain's words, when chosen.
  spainView();
  app.on('lang', () => spainView());
  document.getElementById('splash')?.classList.add('hide');
  setTimeout(() => document.getElementById('splash')?.remove(), 900);
  // The fonts for rare scripts: only registered here (a small list); a file is fetched when a letter shows.
  setTimeout(() => void registerScriptFonts(), 2500);
  app.emit('layers');
  // v0.41.1: a first visit is welcomed with three short cards (not one opened from a link to somewhere).
  if (shouldWelcome()) {
    showWelcome(app, {
      today: () => void today.openPanel(), games: () => shell.openTab('play'), stories: () => time.open(), map: () => shell.openTab('map'),
    });
  }
  void registerSW(shell).then(() => reminders.init());
  // A reminder tapped: Today (in the app open already, or opened with #today=1).
  navigator.serviceWorker?.addEventListener('message', (e) => { if ((e.data as { type?: string } | null)?.type === 'atlas-open-today') void today.openPanel(); });
  if (shared.get('today')) setTimeout(() => void today.openPanel(), 500);
  // Home-screen shortcut: open straight into ambient mode.
  // A playlist link (#ambient=1&playlist=planet, or the reader's own in #mine=...).
  if (/ambient=1/.test(location.hash)) {
    const shared = playlistFromLink(location.hash);
    const id = shared ? MINE_ID : /[#&]playlist=([a-z]+)/.exec(location.hash)?.[1];
    setTimeout(() => void shell.ambient.start(id ?? undefined), 600);
  }
  // A Border hop challenge: #hop=ESP-CHN&goal=people&beat=870.
  // (Read from the address as it was opened: the app writes its own state to the address when it starts.)
  if (shared.get('hop')) setTimeout(() => void hop.startChallenge(`#${shared.toString()}`), 500);
  // A shared trip (#trip=lima,cusco) or a city's guide (#guide=kyoto).
  if (shared.get('trip')) setTimeout(() => void guide.openShared(shared.get('trip')!, shared.get('tp')), 500);
  else if (shared.get('guide')) setTimeout(() => void guide.openCity(shared.get('guide')!), 500);
  // A shared world: #world=moon&c=lon,lat,zoom (and &map=elev).
  const world = shared.get('world');
  if (world) {
    const c = (shared.get('c') ?? '').split(',').map(Number);
    const camera = c.length === 3 && c.every(isFinite) ? { lon: c[0], lat: c[1], zoom: c[2] } : undefined;
    setTimeout(() => void space.enter(world, { map: (shared.get('map') as 'elev' | null) ?? 'photo', camera }), 300);
  }
  // The sky, our galaxy or the elements: #sky=Ori (#sky=1: the sky from where the globe looks), #galaxy=M42, #element=Au.
  const skyAt = shared.get('sky'), galAt = shared.get('galaxy'), elAt = shared.get('element');
  if (skyAt != null) setTimeout(() => sky.open(skyAt && skyAt !== '1' ? { frame: 'celestial', target: skyAt } : {}), 400);
  else if (galAt != null) setTimeout(() => void galaxy.open(galAt && galAt !== '1' ? galAt : undefined), 400);
  else if (elAt != null) setTimeout(() => void elements.open(elAt && elAt !== '1' ? elAt : undefined), 400);
  // A shared story: #war=<id>&step=<n> (or #eras=, #food=, #structures=, #people=, #life=).
  for (const kind of STORY_KINDS) {
    const id = shared.get(storyHashKey(kind));
    if (id) setTimeout(() => void time.stories[kind].open(id, Number(shared.get('step') ?? 1) - 1).catch(() => {}), 300);
  }
}

async function registerSW(shell: Shell) {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  try {
    const { registerSW } = await import('virtual:pwa-register');
    registerSW({ immediate: true, onOfflineReady() { /* cached for offline use */ }, onNeedRefresh() { shell.toast(t('updated')); } });
  } catch (e) { console.warn('service worker', e); }
}

boot().catch((e) => {
  console.error(e);
  const s = document.getElementById('splash');
  if (s) s.querySelector('.splash-text')!.textContent = `Error: ${e?.message ?? e}`;
});
