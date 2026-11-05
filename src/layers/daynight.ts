// Live day and night: the real sun position, twilight bands and (with imagery) city lights.
import { geoCircle } from 'd3-geo';
import { lang } from '../app/i18n';
import { subsolarPoint, sunVector } from './sun';
import { LC } from './context';
import type { LayerDef } from './types';

const circle = geoCircle().precision(3);

export function nightPolygons(date: Date) {
  const [lon, lat] = subsolarPoint(date);
  const anti: [number, number] = [lon + 180 > 180 ? lon - 180 : lon + 180, -lat];
  // Twilight bands: civil (6°), nautical (12°), astronomical (18°), then full night.
  return [90, 87, 84, 81, 78, 72].map((r) => circle.center(anti).radius(r)());
}

export const dayNight: LayerDef = {
  id: 'daynight', category: 'live', icon: '🌗', kind: 'overlay',
  name: { en: 'Day and night (live)', es: 'Día y noche (en vivo)' },
  desc: { en: 'Where the sun is shining right now, with twilight bands.', es: 'Dónde brilla el sol ahora mismo, con bandas de crepúsculo.' },
  keywords: 'sun night terminator twilight sol noche crepusculo',
  credit: 'Computed from the date and time',
  async load(ctx) {
    window.setInterval(() => ctx.requestRender(), 30_000);
  },
  drawOverlay(rc) {
    const { ctx, path } = rc;
    const now = new Date();
    if (LC.gl) LC.gl.sun = sunVector(now);
    const polys = nightPolygons(now);
    ctx.fillStyle = rc.theme.dark ? 'rgba(2,6,24,0.16)' : 'rgba(10,20,60,0.12)';
    for (const p of polys) { ctx.beginPath(); path(p); ctx.fill(); }
    const [lon, lat] = subsolarPoint(now);
    const pt = rc.project(lon, lat);
    if (pt) {
      const g = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], 26);
      g.addColorStop(0, 'rgba(255,240,180,0.95)'); g.addColorStop(0.35, 'rgba(255,210,90,0.55)'); g.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pt[0], pt[1], 26, 0, Math.PI * 2); ctx.fill();
    }
  },
  legend() {
    const es = lang() === 'es';
    const [lon, lat] = subsolarPoint(new Date());
    const time = new Intl.DateTimeFormat(es ? 'es-ES' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date());
    return {
      kind: 'html', title: es ? 'Día y noche' : 'Day and night',
      html: `<div class="lg-row">☀️ ${es ? 'Sol en el cénit sobre' : 'Sun overhead at'} ${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}</div><div class="lg-row muted">${time} UTC</div>`,
    };
  },
};
