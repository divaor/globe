import './styles/main.css';
import { App } from './app/app';
import { Shell } from './ui/shell';
import { coreLayers } from './layers';
import { spainView } from './ui/spainview';
import { isNative } from './native/platform';

// The start (v0.47.0) comes in two stages, so the globe shows as soon as it can on a slow phone. First the globe: the
// app, its shell and the base map, with the renderer held until the first frame (the splash covers it meanwhile).
// Then everything else (time travel, learn and play, the guides, deep time, the filter packs, links) from its own
// chunk (features.ts), behind the globe; window.atlas is set when that is done.
async function boot() {
  // The iOS and Android apps (v0.43.0): their side first (stored progress back, a shared link's place, the phone's
  // share, links, location and voices). The website never loads it.
  const native = isNative() ? await import('./native/boot') : null;
  await native?.early();
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
  const resize = () => app.renderer.resize(root.clientWidth, root.clientHeight);
  new ResizeObserver(resize).observe(root);
  resize();
  const shell = new Shell(app);
  await app.start();
  // Spain's Spanish: the page's texts and the map's labels with Spain's words, when chosen.
  spainView();
  app.on('lang', () => spainView());
  app.renderer.release();
  if (app.showFps) void import('./ui/fpsmeter').then((m) => m.setFpsMeter(app, true));
  document.getElementById('splash')?.classList.add('hide');
  setTimeout(() => document.getElementById('splash')?.remove(), 900);
  const { startFeatures } = await import('./features');
  await startFeatures(app, shell, shared, native);
}

boot().catch((e) => {
  console.error(e);
  const s = document.getElementById('splash');
  if (s) s.querySelector('.splash-text')!.textContent = `Error: ${e?.message ?? e}`;
});

