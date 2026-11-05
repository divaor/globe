// Imagery bases draped by WebGL: satellite (Blue Marble), shaded relief and elevation colours.
import { dataUrl } from '../data/store';
import { LC } from './context';
import type { LayerDef, LayerInstance } from './types';
import type { RasterTexture } from '../engine/gl';

function lowMemory(): boolean {
  const dm = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  return (dm !== undefined && dm < 4) || Math.min(screen.width, screen.height) < 500;
}

function imageLayer(o: {
  id: string; icon: string; name: { en: string; es: string }; desc: { en: string; es: string };
  files: { hi: string; lo: string }; credit: string; keywords?: string;
}): LayerDef {
  return {
    id: o.id, category: 'imagery', icon: o.icon, name: o.name, desc: o.desc, kind: 'raster', group: 'imagery',
    credit: o.credit, keywords: o.keywords, defaultOpacity: 1,
    async load(ctx, inst) {
      if (!ctx.gl) throw new Error('WebGL2 is needed for imagery');
      const file = lowMemory() ? o.files.lo : o.files.hi;
      inst.state.tex = await ctx.gl.load(dataUrl(`raster/${file}`));
    },
    raster(rc, inst: LayerInstance) {
      const tex = inst.state.tex as RasterTexture | undefined;
      if (!tex) return null;
      const night = LC && rc.view && (inst.state.nightShade as boolean | undefined);
      return [{ texture: tex, opacity: inst.opacity, shadeNight: !!night }];
    },
  };
}

export const satellite = imageLayer({
  id: 'satellite', icon: '🛰️',
  name: { en: 'Satellite (Blue Marble)', es: 'Satélite (Blue Marble)' },
  desc: { en: 'NASA’s cloud-free true-colour mosaic of Earth.', es: 'Mosaico de la NASA en color real y sin nubes.' },
  files: { hi: 'bluemarble-4k.jpg', lo: 'bluemarble-2k.jpg' },
  credit: 'NASA Blue Marble Next Generation (public domain)',
  keywords: 'satellite photo nasa imagen foto satelite',
});

export const relief = imageLayer({
  id: 'relief', icon: '⛰️',
  name: { en: 'Shaded relief', es: 'Relieve sombreado' },
  desc: { en: 'Mountains, valleys and plains, lit from the north-west.', es: 'Montañas, valles y llanuras, iluminados desde el noroeste.' },
  files: { hi: 'relief-8k.jpg', lo: 'relief-4k.jpg' },
  credit: 'Shaded relief from matplotlib/basemap data (public domain)',
  keywords: 'terrain mountains topography relieve montañas terreno',
});

export const elevation = imageLayer({
  id: 'elevation', icon: '🌊',
  name: { en: 'Elevation and ocean depth', es: 'Altitud y profundidad' },
  desc: { en: 'Land heights and the sea floor (ETOPO1).', es: 'Alturas del terreno y el fondo marino (ETOPO1).' },
  files: { hi: 'etopo-4k.jpg', lo: 'etopo-4k.jpg' },
  credit: 'NOAA ETOPO1 (public domain)',
  keywords: 'bathymetry altitude height depth batimetria altura profundidad',
});
