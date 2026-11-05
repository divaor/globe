// Time zones with live local clocks.
import { geoContains } from 'd3-geo';
import { oklch } from '../engine/colors';
import { loadJSON, shapesFrom, type Shape } from '../data/store';
import { lang } from '../app/i18n';
import type { Topology } from 'topojson-specification';
import type { LayerDef } from './types';

interface ZP { z: number; u: string; p?: string; tz?: string; c: number }

let zones: Shape<ZP>[] = [];

export function zoneColor(z: number, dark: boolean): string {
  const hue = ((z + 12) / 26) * 330 + 10;
  const even = Math.round(z) % 2 === 0;
  return oklch(even ? (dark ? 0.72 : 0.8) : (dark ? 0.6 : 0.68), 0.13, hue);
}

export function timeAt(offsetHours: number, tz?: string, date = new Date()): string {
  const loc = lang() === 'es' ? 'es-ES' : 'en-GB';
  if (tz) {
    try { return new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(date); } catch { /* fall back */ }
  }
  const d = new Date(date.getTime() + offsetHours * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

const fmtOffset = (z: number) => {
  const s = z < 0 ? '−' : '+';
  const a = Math.abs(z), h = Math.floor(a), m = Math.round((a - h) * 60);
  return `UTC${s}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
};

export const timezones: LayerDef = {
  id: 'timezones', category: 'political', icon: '🕒', kind: 'fill', defaultOpacity: 0.6,
  name: { en: 'Time zones', es: 'Husos horarios' },
  desc: { en: 'Nominal time zones with the live local time in each.', es: 'Husos horarios con la hora local en vivo de cada uno.' },
  keywords: 'clock hour utc gmt reloj hora',
  credit: 'Natural Earth time zones (public domain)',
  async load(ctx) {
    if (!zones.length) zones = shapesFrom<ZP>(await loadJSON<Topology>('layers/timezones.json'), 'zones');
    // Keep the clocks ticking.
    window.setInterval(() => ctx.requestRender(), 20_000);
  },
  drawFill(rc) {
    const { ctx, path } = rc;
    const by = new Map<string, Shape<ZP>[]>();
    for (const s of rc.visibleShapes(zones)) {
      const c = zoneColor(s.feature.properties.z, rc.theme.dark);
      let g = by.get(c); if (!g) by.set(c, (g = [])); g.push(s);
    }
    for (const [c, list] of by) {
      ctx.beginPath();
      for (const s of list) path(s.feature as never);
      ctx.fillStyle = c; ctx.fill();
    }
    ctx.globalAlpha = Math.min(1, ctx.globalAlpha + 0.2);
    ctx.beginPath();
    for (const s of rc.visibleShapes(zones)) path(s.feature as never);
    ctx.strokeStyle = rc.theme.dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.6; ctx.stroke();
  },
  labels(rc) {
    // One clock per whole/half-hour offset along a latitude near the view centre.
    const lat = Math.max(-55, Math.min(60, rc.center[1] + (rc.view.current.kind === 'flat' ? 0 : -8)));
    const seen = new Set<number>();
    const now = new Date();
    for (const s of zones) {
      const p = s.feature.properties;
      if (seen.has(p.z)) continue;
      seen.add(p.z);
      const lon = Math.max(-179, Math.min(179, p.z * 15));
      const pt = rc.project(lon, lat);
      if (!pt) continue;
      rc.labels.add({
        text: timeAt(p.z, undefined, now), sub: fmtOffset(p.z), x: pt[0], y: pt[1], priority: 960,
        size: 13, weight: 750, color: rc.theme.dark ? '#ffffff' : '#111827', halo: rc.theme.labelHalo,
      });
    }
  },
  legend() {
    const stops = [-12, -9, -6, -3, 0, 3, 6, 9, 12, 14].map((z) => zoneColor(z, true));
    return {
      kind: 'gradient', title: lang() === 'es' ? 'Diferencia con UTC' : 'Offset from UTC', stops,
      min: 'UTC−12', mid: 'UTC', max: 'UTC+14',
      note: lang() === 'es' ? 'Toca el mapa para ver la hora exacta de cada zona.' : 'Tap the map to see the exact time in a zone.',
    };
  },
  pick(lon, lat) {
    for (const s of zones) {
      if (!geoContains(s.feature as never, [lon, lat])) continue;
      const p = s.feature.properties;
      const es = lang() === 'es';
      return [
        { label: es ? 'Huso horario' : 'Time zone', value: fmtOffset(p.z), icon: '🕒' },
        { label: es ? 'Hora local' : 'Local time', value: timeAt(p.z, p.tz) },
        ...(p.p ? [{ label: es ? 'Lugares' : 'Places', value: p.p }] : []),
      ];
    }
    return null;
  },
};
