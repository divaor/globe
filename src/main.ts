import './styles/main.css';
import { App } from './app/app';
import { Shell } from './ui/shell';
import { coreLayers } from './layers';
import { t } from './app/i18n';

declare global { interface Window { atlas?: { app: App; shell: Shell } } }

async function boot() {
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
  window.atlas = { app, shell };
  await Promise.all(Object.values(packs).map(async (load) => {
    try {
      const mod = (await load()) as { default?: (app: App, shell: Shell) => void | Promise<void> };
      await mod.default?.(app, shell);
    } catch (e) { console.warn('filter pack failed', e); }
  }));
  await app.start();
  document.getElementById('splash')?.classList.add('hide');
  setTimeout(() => document.getElementById('splash')?.remove(), 900);
  app.emit('layers');
  if (!localStorage.getItem('atlas-globe:hinted')) {
    shell.toast(app.lang === 'es' ? 'Arrastra para girar · pellizca para acercar · toca un país' : 'Drag to spin · pinch to zoom · tap a country', 5000);
    try { localStorage.setItem('atlas-globe:hinted', '1'); } catch { /* ignore */ }
  }
  registerSW(shell);
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
