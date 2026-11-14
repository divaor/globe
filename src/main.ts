import './styles/main.css';
import { App } from './app/app';
import { Shell } from './ui/shell';
import { coreLayers } from './layers';
import { t } from './app/i18n';
import { TimeTravel } from './modes';
import { STORY_KINDS, storyHashKey } from './modes/stories';
import { Tools } from './tools/tools';
import { Learn } from './learn/learn';
import { registerScriptFonts } from './app/scriptFonts';
import { PersonalMaps } from './personal/personal';
import { Compare } from './compare/compare';
import { TerrainUI } from './ui/terrain';
import { Terrain3D } from './ui/terrain3d';
import { Space } from './space/space';
import { Orrery } from './space/orrery';
import { Sky } from './sky/sky';
import { worldHook } from './modes/stories';

declare global { interface Window { atlas?: { app: App; shell: Shell; time: TimeTravel; tools: Tools; learn: Learn; personal: PersonalMaps; compare: Compare; terrain: TerrainUI; terrain3d: Terrain3D; space: Space; orrery: Orrery; sky: Sky } } }

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
  learn.space = space;
  learn.orrery = orrery;
  // A story step on another world shows that world under the story.
  worldHook.show = (id) => { space.surface.quiet = !!id; void space.surface.set(id); };
  window.atlas = { app, shell, time, tools, learn, personal, compare, terrain, terrain3d, space, orrery, sky };
  await Promise.all(Object.values(packs).map(async (load) => {
    try {
      const mod = (await load()) as { default?: (app: App, shell: Shell) => void | Promise<void> };
      await mod.default?.(app, shell);
    } catch (e) { console.warn('filter pack failed', e); }
  }));
  await app.start();
  document.getElementById('splash')?.classList.add('hide');
  setTimeout(() => document.getElementById('splash')?.remove(), 900);
  // The fonts for rare scripts: only registered here (a small list); a file is fetched when a letter shows.
  setTimeout(() => void registerScriptFonts(), 2500);
  app.emit('layers');
  if (!localStorage.getItem('atlas-globe:hinted')) {
    shell.toast(app.lang === 'es' ? 'Arrastra para girar · pellizca para acercar · toca un país' : 'Drag to spin · pinch to zoom · tap a country', 5000);
    try { localStorage.setItem('atlas-globe:hinted', '1'); } catch { /* ignore */ }
  }
  registerSW(shell);
  // Home-screen shortcut: open straight into ambient mode.
  if (/ambient=1/.test(location.hash)) setTimeout(() => void shell.ambient.start(), 600);
  // A shared world: #world=moon&c=lon,lat,zoom (and &map=elev).
  const world = shared.get('world');
  if (world) {
    const c = (shared.get('c') ?? '').split(',').map(Number);
    const camera = c.length === 3 && c.every(isFinite) ? { lon: c[0], lat: c[1], zoom: c[2] } : undefined;
    setTimeout(() => void space.enter(world, { map: (shared.get('map') as 'elev' | null) ?? 'photo', camera }), 300);
  }
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
