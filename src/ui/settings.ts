// Settings and About/credits panels.
import { Download } from 'lucide';
import { h, icon, toggle, segmented, slider } from './dom';
import { t, tx, LANGS, type Lang } from '../app/i18n';
import type { App } from '../app/app';

declare const __APP_VERSION__: string;

export interface InstallPrompt { prompt: () => Promise<void>; userChoice?: Promise<unknown> }
let deferredInstall: InstallPrompt | null = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e as unknown as InstallPrompt; });

export function canInstall() { return !!deferredInstall; }
export async function install() {
  if (!deferredInstall) return false;
  await deferredInstall.prompt();
  deferredInstall = null;
  return true;
}

const field = (label: string, control: HTMLElement, hint?: string) =>
  h('div', { class: 'field' }, h('div', { class: 'field-label' }, label, hint ? h('span', { class: 'field-hint' }, hint) : null), control);

export function settingsPanel(app: App, reopen: () => void): HTMLElement {
  const s = app.renderer.settings;
  const save = () => { app.renderer.requestRender(); app.save(); };
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;
  const installBtn = h('button', { type: 'button', class: 'pill primary' }, icon(Download, 16), standalone ? t('installed') : t('install')) as HTMLButtonElement;
  installBtn.disabled = !!standalone;
  installBtn.addEventListener('click', async () => {
    if (!(await install())) {
      alert(app.lang === 'es'
        ? 'Para instalar: en Chrome usa el menú ⋮ → «Instalar app» / «Añadir a pantalla de inicio». En iPhone: Compartir → «Añadir a pantalla de inicio».'
        : 'To install: in Chrome use the ⋮ menu → "Install app" / "Add to Home screen". On iPhone: Share → "Add to Home Screen".');
    }
  });

  return h('div', { class: 'settings' },
    field(t('language'), segmented<Lang>(app.lang, LANGS.map((l) => ({ value: l.id, label: l.name })), (v) => { app.setLang(v); reopen(); })),
    field(t('theme'), segmented<'dark' | 'light'>(app.themeId, [{ value: 'dark', label: t('themeDark') }, { value: 'light', label: t('themeLight') }], (v) => app.setTheme(v))),
    h('h3', { class: 'sec-title' }, t('labels')),
    h('div', { class: 'toggles' },
      toggle(s.labels.countries, (v) => { s.labels.countries = v; save(); }, t('labelCountries')),
      toggle(s.labels.capitals, (v) => { s.labels.capitals = v; save(); }, t('labelCapitals')),
      toggle(s.labels.cities, (v) => { s.labels.cities = v; save(); }, t('labelCities')),
      toggle(s.labels.seas, (v) => { s.labels.seas = v; save(); }, t('labelSeas'))),
    field(t('labelSize'), slider(s.labelScale, 0.8, 1.5, 0.05, (v) => { s.labelScale = v; save(); })),
    h('h3', { class: 'sec-title' }, t('settings')),
    h('div', { class: 'toggles' },
      toggle(s.graticule, (v) => { s.graticule = v; save(); }, t('graticule')),
      toggle(s.shading, (v) => { s.shading = v; save(); }, t('shading'))),
    field(t('quality'), segmented<'auto' | 'high' | 'low'>(s.quality, [
      { value: 'auto', label: t('qualityAuto') }, { value: 'high', label: t('qualityHigh') }, { value: 'low', label: t('qualityLow') },
    ], (v) => { s.quality = v; app.renderer.resize(app.renderer.view.w, app.renderer.view.h); save(); })),
    h('h3', { class: 'sec-title' }, t('ambient')),
    field(t('ambientSpeed'), slider(app.ambient.speed, 0.25, 4, 0.25, (v) => { app.ambient.speed = v; app.save(); })),
    h('div', { class: 'toggles' },
      toggle(app.ambient.cycle, (v) => { app.ambient.cycle = v; app.save(); }, t('ambientCycle')),
      toggle(app.ambient.clock, (v) => { app.ambient.clock = v; app.save(); }, t('ambientClock'))),
    h('div', { class: 'settings-actions' }, installBtn),
    h('p', { class: 'muted small' }, `${t('version')} ${__APP_VERSION__}`),
  );
}

export function aboutPanel(app: App): HTMLElement {
  const es = app.lang === 'es';
  const credits = new Map<string, string[]>();
  for (const d of app.registry.values()) {
    if (!d.credit) continue;
    const list = credits.get(d.credit) ?? [];
    list.push(tx(d.name));
    credits.set(d.credit, list);
  }
  return h('div', { class: 'about' },
    h('p', null, es
      ? 'Atlas Globe es un globo terráqueo interactivo y detallado: combina filtros (político, idiomas, husos horarios, relieve, clima, población, recursos, flora, fauna y muchos más), cambia de proyección con una transición suave y viaja en el tiempo.'
      : 'Atlas Globe is a detailed, interactive globe: combine filters (political, languages, time zones, landforms, climate, population, resources, flora, fauna and many more), switch projections with a smooth morph, and travel through time.'),
    h('h3', { class: 'sec-title' }, t('credits')),
    h('ul', { class: 'credits' }, [...credits].map(([c, names]) => h('li', null, h('strong', null, c), h('span', { class: 'muted' }, ` — ${names.join(', ')}`)))),
    h('p', { class: 'muted small' }, es
      ? 'Código abierto (GPL-3.0). Los datos conservan sus propias licencias; consulta public/data/*/SOURCES.md en el repositorio.'
      : 'Open source (GPL-3.0). Data keep their own licences; see public/data/*/SOURCES.md in the repository.'),
    h('p', { class: 'small' }, h('a', { href: 'https://github.com/divaor/globe', target: '_blank', rel: 'noopener' }, 'github.com/divaor/globe')),
  );
}
