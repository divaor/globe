// Plate tectonics from 1 billion years ago to today (Merdith et al. 2021 full-plate model; the
// model itself is in paleo.ts, shared with the Life through time stories).
import { continentSwatch, mix } from '../engine/colors';
import { t, lang, fmtNumber } from '../app/i18n';
import { TimeBar } from '../ui/timebar';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { LayerDef, RenderCtx } from '../layers/types';
import { loadPaleo, unitName, PALEO_MAX_MA, type PaleoWorld } from './paleo';

const easeLabel = (ma: number) => {
  const es = lang() === 'es';
  if (ma < 0.05) return es ? 'Hoy' : 'Today';
  const v = ma < 10 ? fmtNumber(ma, 1) : fmtNumber(Math.round(ma));
  return es ? `Hace ${v} millones de años` : `${v} million years ago`;
};

export class PangeaMode {
  private world: PaleoWorld | null = null;
  private bar: TimeBar | null = null;
  private ma = 250;
  private savedStack: string[] = [];
  private savedProjection: string | null = null;
  readonly layer: LayerDef;

  constructor(private app: App, private shell: Shell) {
    const self = this;
    this.layer = {
      id: 'pangea', category: 'earth', icon: '🌋', kind: 'fill', hidden: true,
      name: { en: 'Plate tectonics', es: 'Tectónica de placas' },
      desc: { en: 'Continents through deep time.', es: 'Continentes a lo largo del tiempo profundo.' },
      credit: 'Plate model: Merdith et al. (2021), Earth-Science Reviews (CC BY 4.0)',
      drawFill(rc) { self.draw(rc); },
      labels(rc) { self.world?.labels(rc, self.ma); },
      legend() {
        const es = lang() === 'es';
        return {
          kind: 'categories', title: es ? 'Tierra de hoy' : 'Land of today',
          items: ['AF', 'SA', 'NA', 'EU', 'AS', 'OC', 'AN'].map((c) => ({ color: continentSwatch(c), label: t(`cont.${c}`) })),
          note: es ? 'Colores según el continente actual. Las costas son las de hoy, desplazadas con su placa.' : 'Coloured by today’s continent. Coastlines are today’s, moved with their plate.',
        };
      },
    };
    app.register([this.layer]);
  }

  get active() { return this.app.mode === 'pangea'; }

  /** Starts the slider at `ma` million years ago (250, Pangea, by default). */
  async enter(ma = 250) {
    if (this.active) return;
    this.shell.toast(t('dataLoading'), 1500);
    this.world = await loadPaleo(this.app);
    const app = this.app;
    this.savedStack = app.layers.filter((l) => !l.def.hidden).map((l) => l.def.id);
    this.savedProjection = app.projection;
    app.mode = 'pangea';
    document.documentElement.classList.add('mode-time');
    app.select(null);
    app.renderer.baseMap = false;
    await app.setStack(['pangea']);
    const es = lang() === 'es';
    const periods = this.world.units.filter((u) => u.rank === 'period' && u.start <= PALEO_MAX_MA);
    this.ma = Math.max(0, Math.min(PALEO_MAX_MA, ma));
    const pos = 1 - this.ma / 1000;
    this.bar = new TimeBar({
      title: t('pangeaTitle'),
      format: (f) => easeLabel((1 - f) * 1000),
      caption: (f) => this.world?.caption((1 - f) * 1000) ?? '',
      bands: periods.map((u) => ({ from: 1 - u.start / 1000, to: 1 - u.end / 1000, color: u.color, label: unitName(u) })),
      ticks: [1000, 750, 500, 250, 66, 0].map((m) => ({ at: 1 - m / 1000, label: m ? `${m} Ma` : (es ? 'Hoy' : 'Today') })),
      start: Math.min(0.75, pos), end: 1, pos,
      rate: 0.01,
      onPos: (f) => { this.ma = Math.max(0, (1 - f) * 1000); app.renderer.requestRender(); },
      onExit: () => this.exit(),
    });
    app.root.append(this.bar.el);
    requestAnimationFrame(() => { if (this.bar) { app.renderer.view.insetBottom = this.bar.coveredHeight(); app.renderer.requestRender(); } });
    if (app.renderer.view.current.kind === 'globe') app.renderer.view.flyTo({ lon: 15, lat: 10, zoom: 1 }, 1200);
    app.emit('mode', 'pangea');
    app.renderer.requestRender();
  }

  async exit() {
    if (!this.active) return;
    const app = this.app;
    this.bar?.destroy();
    this.bar = null;
    app.renderer.view.insetBottom = 0;
    app.mode = null;
    document.documentElement.classList.remove('mode-time');
    app.renderer.baseMap = true;
    this.shell.card.hide();
    await app.setStack(this.savedStack.length ? this.savedStack : ['political']);
    if (this.savedProjection && this.savedProjection !== app.projection) app.setProjection(this.savedProjection as never);
    app.emit('mode', null);
    app.save();
  }

  private draw(rc: RenderCtx) {
    const dark = rc.theme.dark;
    this.world?.draw(rc, this.ma, {
      shelf: dark ? '#24597a' : '#a9d0e6',
      land: (cont) => (cont === 'SS' ? (dark ? '#9fb3c4' : '#cdd6de') : mix(continentSwatch(cont), dark ? '#ffffff' : '#000000', 0.04)),
      coast: dark ? 'rgba(10,25,45,0.75)' : 'rgba(40,50,70,0.6)',
    });
  }

  tap(lon: number, lat: number): boolean {
    const w = this.world;
    if (!w) return true;
    const rows = w.tapRows(lon, lat, this.ma, this.app);
    if (rows) this.shell.card.showCustom('🌋', easeLabel(this.ma), w.caption(this.ma), rows);
    else this.shell.card.hide();
    return true;
  }
}
