// Imagery bases draped by WebGL: satellite (Blue Marble), shaded relief and elevation colours. Zoomed in, each
// gets a detail mosaic of web-map tiles for the area on screen (see engine/detail.ts): Sentinel-2 cloudless for
// the satellite, and terrain heights from which the shader draws the relief and the elevation colours.
import { dataUrl } from '../data/store';
import { isDayNightOn } from './rasterdata';
import { LC } from './context';
import { DetailMosaic } from '../engine/detail';
import { TERRAIN, SENTINEL, prefs, type TileSource } from '../engine/tiles';
import { terrainActions } from './terrainActions';
import type { LayerDef, LayerInstance } from './types';
import type { GLRaster, RasterPalette, RasterTexture } from '../engine/gl';

function lowMemory(): boolean {
  const dm = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  return (dm !== undefined && dm < 4) || Math.min(screen.width, screen.height) < 500;
}

/** Palette position of a height, as in the shader (gl.ts heightU): the sea in 0..0.5, the land in 0.5..1. */
export const heightU = (h: number) => (h < 0 ? 0.5 - 0.5 * Math.sqrt(Math.min(1, -h / 11000)) : 0.5 + 0.5 * Math.sqrt(Math.min(1, h / 8848)));

/**
 * Colours by height, fitted to the world images they continue (the colour of each height band where the image is
 * lit, from 64 terrain tiles laid over the image; ice sheets left out): NOAA's ETOPO1 colours for Elevation, and
 * the tints of Tom Patterson's shaded relief (mixed in the shader with the image's own colours) for Shaded relief.
 */
export const ELEVATION: [number, string][] = [
  [-11000, '#040a8a'], [-8000, '#0734c8'], [-6000, '#135dd5'], [-5000, '#0f76da'], [-4000, '#1b9adc'], [-3000, '#30abde'],
  [-2000, '#47bce1'], [-1000, '#72d2ea'], [-500, '#94d7ef'], [-200, '#a8d8f1'], [-1, '#aedaee'],
  [0, '#3e8a3a'], [50, '#52a056'], [100, '#65be69'], [150, '#9cd387'], [200, '#bcd895'], [300, '#d5d5a2'], [400, '#ebd2ab'],
  [500, '#efcda7'], [750, '#e8c696'], [1000, '#deb774'], [1250, '#d7ad58'], [1500, '#c9a03e'], [1750, '#af9130'], [2000, '#998328'],
  [2500, '#8c7821'], [3000, '#826a1b'], [3500, '#775a1e'], [4000, '#7b5533'], [4500, '#85605a'], [5000, '#9d8484'], [5500, '#ab9c9c'],
  [6500, '#c8c0c0'], [8848, '#f4f4f4'],
];
export const RELIEF: [number, string][] = [
  [-11000, '#6f9fc8'], [-3000, '#76a6cc'], [-1000, '#a0c1dc'], [-200, '#c9ddee'], [-1, '#cadfec'],
  [0, '#a5b5b6'], [50, '#99aaa0'], [150, '#9bafa6'], [250, '#adb5ac'], [400, '#b8bab0'], [600, '#c4c4b4'], [900, '#d2ccba'],
  [1250, '#d6c8b5'], [1750, '#d7c4b2'], [2500, '#d8c4b5'], [3500, '#d9d0c9'], [4500, '#dadad8'], [5500, '#e5e6e5'], [8848, '#f4f4f4'],
];
const palettes = new WeakMap<GLRaster, Record<string, RasterPalette>>();
function palette(gl: GLRaster, id: 'elevation' | 'relief'): RasterPalette {
  let p = palettes.get(gl);
  if (!p) palettes.set(gl, (p = {}));
  return (p[id] ??= gl.palette((id === 'elevation' ? ELEVATION : RELIEF).map(([h, c]) => [heightU(h), c]), 1024));
}

interface Detail {
  src: TileSource;
  /** 1 picture, 2 shaded relief, 3 elevation colours (see gl.ts). */
  mode: 1 | 2 | 3;
  /** The web-map zoom from which tiles are sharper than the world image. */
  zStart: number;
}

function imageLayer(o: {
  id: string; icon: string; name: { en: string; es: string }; desc: { en: string; es: string };
  files: { hi: string; lo: string }; credit: string; keywords?: string; detail: Detail;
}): LayerDef {
  return {
    id: o.id, category: 'imagery', icon: o.icon, name: o.name, desc: o.desc, kind: 'raster', group: 'imagery',
    credit: `${o.credit}; zoomed in: ${o.detail.src.credit}`, keywords: o.keywords, defaultOpacity: 1,
    async load(ctx, inst) {
      if (!ctx.gl) throw new Error('WebGL2 is needed for imagery');
      const file = lowMemory() ? o.files.lo : o.files.hi;
      inst.state.tex = await ctx.gl.load(dataUrl(`raster/${file}`));
    },
    raster(rc, inst: LayerInstance) {
      const tex = inst.state.tex as RasterTexture | undefined;
      if (!tex) return null;
      const gl = LC.gl;
      let detail = null;
      if (gl) {
        const d = o.detail;
        const m = (inst.state.mosaic ??= new DetailMosaic(gl, d.src, d.mode, d.mode === 1 ? undefined : palette(gl, d.mode === 3 ? 'elevation' : 'relief'))) as DetailMosaic;
        detail = m.update(rc.view, d.zStart, LC.requestRender);
      }
      return [{ texture: tex, opacity: inst.opacity, shadeNight: isDayNightOn(), detail }];
    },
    onDeactivate(inst) { (inst.state.mosaic as DetailMosaic | undefined)?.free(); inst.state.mosaic = undefined; },
    legend(_inst, lng) {
      const es = lng === 'es';
      const note = prefs.detail
        ? (es ? 'Acércate para verlo más nítido; los mosaicos se descargan de la zona en pantalla.' : 'Zoom in for more detail; tiles are downloaded for the area on screen.')
        : (es ? 'El detalle al acercarte está apagado en Ajustes.' : 'Detail when zoomed in is off in Settings.');
      return {
        kind: 'html', html: '', note,
        actions: [
          { icon: '⛰️', label: es ? 'Ver en 3D' : 'View in 3D', onClick: () => terrainActions.view3d() },
          { icon: '📥', label: es ? 'Guardar esta zona' : 'Save this area', onClick: () => terrainActions.save() },
          { icon: '⚙️', label: es ? 'Ajustes' : 'Settings', onClick: () => terrainActions.settings() },
        ],
      };
    },
  };
}

export const satellite = imageLayer({
  id: 'satellite', icon: '🛰️',
  name: { en: 'Satellite (Blue Marble)', es: 'Satélite (Blue Marble)' },
  desc: { en: 'NASA’s cloud-free true-colour mosaic of Earth; zoomed in, Sentinel-2 cloudless (about 10 m).', es: 'Mosaico de la NASA en color real y sin nubes; de cerca, Sentinel-2 sin nubes (unos 10 m).' },
  files: { hi: 'bluemarble-4k.jpg', lo: 'bluemarble-2k.jpg' },
  credit: 'NASA Blue Marble Next Generation (public domain)',
  keywords: 'satellite photo nasa imagen foto satelite sentinel',
  detail: { src: SENTINEL, mode: 1, zStart: 5 },
});

export const relief = imageLayer({
  id: 'relief', icon: '⛰️',
  name: { en: 'Shaded relief', es: 'Relieve sombreado' },
  desc: { en: 'Mountains, valleys and plains, lit from the north-west; sharper as you zoom in.', es: 'Montañas, valles y llanuras, iluminados desde el noroeste; más nítidos al acercarte.' },
  files: { hi: 'relief-8k.jpg', lo: 'relief-4k.jpg' },
  credit: 'Shaded relief from matplotlib/basemap data (public domain)',
  keywords: 'terrain mountains topography relieve montañas terreno',
  detail: { src: TERRAIN, mode: 2, zStart: 5 },
});

export const elevation = imageLayer({
  id: 'elevation', icon: '🌊',
  name: { en: 'Elevation and ocean depth', es: 'Altitud y profundidad' },
  desc: { en: 'Land heights and the sea floor (ETOPO1); sharper as you zoom in.', es: 'Alturas del terreno y el fondo marino (ETOPO1); más nítidas al acercarte.' },
  files: { hi: 'etopo-4k.jpg', lo: 'etopo-4k.jpg' },
  credit: 'NOAA ETOPO1 (public domain)',
  keywords: 'bathymetry altitude height depth batimetria altura profundidad',
  detail: { src: TERRAIN, mode: 3, zStart: 4 },
});

/** The filters that get detail when zoomed in (the deeper zoom is allowed while one is on). */
export const DETAIL_LAYERS = ['satellite', 'relief', 'elevation'];
