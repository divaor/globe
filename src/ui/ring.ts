// A ring that pulses for a few seconds around what the search found (v0.29.0): a dot, wherever its filter's crowd moved
// it (layers/crowd.ts), a place, or a state's outline.
import type { App } from '../app/app';
import type { GeoPermissibleObjects } from 'd3-geo';

let stop: (() => void) | null = null;

/**
 * Rings `at` (a screen position, asked again each frame, null while it is hidden) or outlines `shape`, for `ms`.
 * A new ring replaces the last one; a drag of the map ends it early.
 */
export function ring(app: App, o: { at?: () => [number, number] | null; shape?: GeoPermissibleObjects; ms?: number; color?: string }) {
  stop?.();
  const r = app.renderer;
  const t0 = performance.now(), ms = o.ms ?? 4500, color = o.color ?? '#ffd43b';
  const overlay = (rc: Parameters<Parameters<typeof r.overlays.add>[0]>[0]) => {
    const k = (performance.now() - t0) / ms;
    if (k >= 1) return;
    const { ctx } = rc;
    ctx.save();
    if (o.shape) {
      ctx.beginPath(); rc.path(o.shape);
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();
      ctx.lineWidth = 2.2; ctx.strokeStyle = color; ctx.globalAlpha = 0.6 + 0.4 * Math.cos(k * Math.PI * 6) ** 2; ctx.stroke();
    }
    const p = o.at?.();
    if (p) {
      for (let i = 0; i < 2; i++) {
        const f = ((k * 3 + i * 0.5) % 1);
        ctx.beginPath(); ctx.arc(p[0], p[1], 10 + f * 26, 0, Math.PI * 2);
        ctx.globalAlpha = (1 - f) * (1 - k * 0.5);
        ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, Math.PI * 2);
      ctx.lineWidth = 2.5; ctx.strokeStyle = color; ctx.stroke();
    }
    ctx.restore();
  };
  const ticker = (_dt: number, now: number) => now - t0 < ms;
  const off = app.on('interact', () => stop?.());
  const timer = window.setTimeout(() => stop?.(), ms + 50);
  r.overlays.add(overlay);
  r.tickers.add(ticker);
  r.requestRender();
  const mine = () => {
    r.overlays.delete(overlay); r.tickers.delete(ticker); off(); clearTimeout(timer);
    if (stop === mine) stop = null;
    r.requestRender();
  };
  stop = mine;
}
