// Canvas charts for Compare two filters: a scatter plot with its trend line, a dot plot of a number by
// category, and a small scatter for the quiz. Each draw returns a hit test (the country under a tap).
import { fwd, type Transform } from './model';
import { hash01 } from '../engine/colors';

export interface Dot { iso: string; x: number; y: number; color: string; r: number; dim?: boolean; sel?: boolean; label?: string }
export interface Axis { t: Transform; title?: string; fmt: (v: number) => string }
export type HitTest = (x: number, y: number) => string | null;

interface Frame { w: number; h: number; dark: boolean }

const ink = (dark: boolean, a = 1) => (dark ? `rgba(226,232,244,${a})` : `rgba(28,36,52,${a})`);

/** Sizes the canvas for the screen and returns its context in CSS pixels. */
function prepare(canvas: HTMLCanvasElement, f: Frame): CanvasRenderingContext2D {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(f.w * dpr); canvas.height = Math.round(f.h * dpr);
  canvas.style.width = `${f.w}px`; canvas.style.height = `${f.h}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, f.w, f.h);
  return ctx;
}

/** Tick values (in data units) for an axis spanning [lo, hi] on its drawn scale. */
function ticks(t: Transform, lo: number, hi: number, want: number): number[] {
  if (t === 'lin') {
    const span = hi - lo || 1;
    let step = Math.pow(10, Math.floor(Math.log10(span / want)));
    const err = span / want / step;
    step *= err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
  }
  // Logarithmic: powers of ten, with 2 and 5 when the axis covers less than two of them.
  const out: number[] = [];
  const inv = (u: number) => (t === 'log' ? Math.pow(10, u) : Math.pow(10, u) - 1);
  const vlo = inv(lo), vhi = inv(hi);
  if (t === 'log1p' && lo <= 0) out.push(0);
  const k0 = Math.floor(Math.log10(Math.max(vlo, 1e-12))), k1 = Math.ceil(Math.log10(Math.max(vhi, 1e-12)));
  const mults = k1 - k0 <= 2 ? [1, 2, 5] : [1];
  for (let k = k0; k <= k1; k++) for (const m of mults) { const v = m * Math.pow(10, k); if (v >= vlo && v <= vhi && !(t === 'log1p' && v < 1)) out.push(v); }
  // Too many powers of ten on a small chart: every other one.
  return out.length > want + 2 ? out.filter((_, i) => i % 2 === 0) : out;
}

/** A scatter plot: dots, axes with ticks, the trend line and labels of the chosen dots. */
export function drawScatter(canvas: HTMLCanvasElement, f: Frame & { dots: Dot[]; ax: Axis; ay: Axis; line?: { a: number; b: number }; mini?: boolean }): HitTest {
  const ctx = prepare(canvas, f);
  const m = f.mini ? { l: 6, r: 6, t: 6, b: 6 } : { l: 44, r: 10, t: 10, b: 24 };
  const X = f.dots.map((d) => fwd(f.ax.t, d.x)), Y = f.dots.map((d) => fwd(f.ay.t, d.y));
  const pad = (lo: number, hi: number) => { const s = hi - lo || Math.abs(hi) || 1; return [lo - s * 0.05, hi + s * 0.05]; };
  const [x0, x1] = pad(Math.min(...X), Math.max(...X)), [y0, y1] = pad(Math.min(...Y), Math.max(...Y));
  const pw = f.w - m.l - m.r, ph = f.h - m.t - m.b;
  const sx = (u: number) => m.l + ((u - x0) / (x1 - x0)) * pw, sy = (u: number) => m.t + ph - ((u - y0) / (y1 - y0)) * ph;
  ctx.font = '600 10.5px system-ui, sans-serif';
  if (!f.mini) {
    // Grid and ticks.
    ctx.strokeStyle = ink(f.dark, 0.1); ctx.fillStyle = ink(f.dark, 0.62); ctx.lineWidth = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const v of ticks(f.ax.t, x0, x1, Math.max(2, Math.floor(pw / 70)))) {
      const px = sx(fwd(f.ax.t, v));
      ctx.beginPath(); ctx.moveTo(px, m.t); ctx.lineTo(px, m.t + ph); ctx.stroke();
      ctx.fillText(f.ax.fmt(v), px, m.t + ph + 6);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of ticks(f.ay.t, y0, y1, Math.max(2, Math.floor(ph / 45)))) {
      const py = sy(fwd(f.ay.t, v));
      ctx.beginPath(); ctx.moveTo(m.l, py); ctx.lineTo(m.l + pw, py); ctx.stroke();
      ctx.fillText(f.ay.fmt(v), m.l - 6, py);
    }
  } else {
    ctx.strokeStyle = ink(f.dark, 0.18); ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, f.w - 1, f.h - 1);
  }
  // The trend line, across the dots.
  if (f.line && isFinite(f.line.b)) {
    ctx.save();
    ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();
    ctx.strokeStyle = ink(f.dark, 0.55); ctx.lineWidth = f.mini ? 1.5 : 2; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(sx(x0), sy(f.line.a + f.line.b * x0)); ctx.lineTo(sx(x1), sy(f.line.a + f.line.b * x1)); ctx.stroke();
    ctx.restore();
  }
  // Dots: dimmed first, the chosen ones last and ringed.
  const pos = f.dots.map((d, i) => ({ d, x: sx(X[i]), y: sy(Y[i]) }));
  const order = [...pos].sort((p, q) => Number(!!q.d.dim) - Number(!!p.d.dim) || Number(!!p.d.sel) - Number(!!q.d.sel));
  for (const p of order) {
    ctx.globalAlpha = p.d.dim ? 0.18 : 0.88;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.d.r, 0, Math.PI * 2);
    ctx.fillStyle = p.d.color; ctx.fill();
    ctx.lineWidth = p.d.sel ? 2.5 : 0.8; ctx.strokeStyle = p.d.sel ? (f.dark ? '#ffffff' : '#111827') : ink(!f.dark, 0.7); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (!f.mini) {
    ctx.font = '700 11.5px system-ui, sans-serif'; ctx.textBaseline = 'bottom';
    for (const p of pos) {
      if (!p.d.label) continue;
      ctx.textAlign = p.x > m.l + pw * 0.7 ? 'right' : 'left';
      const tx = p.x + (ctx.textAlign === 'right' ? -7 : 7);
      ctx.lineWidth = 3.5; ctx.strokeStyle = f.dark ? 'rgba(8,14,28,0.92)' : 'rgba(255,255,255,0.95)'; ctx.strokeText(p.d.label, tx, p.y - 4);
      ctx.fillStyle = ink(f.dark); ctx.fillText(p.d.label, tx, p.y - 4);
    }
  }
  return (x, y) => nearest(pos, x, y);
}

function nearest(pos: { d: Dot; x: number; y: number }[], x: number, y: number): string | null {
  let best: string | null = null, bd = 18 * 18;
  for (const p of pos) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p.d.iso; } }
  return best;
}

/** A number by category: one row of dots per category, with its median as a bar. */
export function drawGroups(canvas: HTMLCanvasElement, f: Frame & { rows: { label: string; color: string; dots: Dot[]; median: number }[]; ax: Axis }): HitTest {
  const rowH = 24;
  const ctx = prepare(canvas, f);
  const labelW = Math.min(170, Math.round(f.w * 0.42));
  const m = { l: labelW + 8, r: 12, t: 6, b: 22 };
  const all = f.rows.flatMap((r) => r.dots.map((d) => fwd(f.ax.t, d.x)));
  const lo = Math.min(...all), hi = Math.max(...all), s = hi - lo || 1;
  const x0 = lo - s * 0.04, x1 = hi + s * 0.04;
  const pw = f.w - m.l - m.r;
  const sx = (u: number) => m.l + ((u - x0) / (x1 - x0)) * pw;
  ctx.font = '600 10.5px system-ui, sans-serif'; ctx.strokeStyle = ink(f.dark, 0.1); ctx.fillStyle = ink(f.dark, 0.62); ctx.lineWidth = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const plotH = f.rows.length * rowH;
  for (const v of ticks(f.ax.t, x0, x1, Math.max(2, Math.floor(pw / 70)))) {
    const px = sx(fwd(f.ax.t, v));
    ctx.beginPath(); ctx.moveTo(px, m.t); ctx.lineTo(px, m.t + plotH); ctx.stroke();
    ctx.fillText(f.ax.fmt(v), px, m.t + plotH + 6);
  }
  const pos: { d: Dot; x: number; y: number }[] = [];
  f.rows.forEach((row, i) => {
    const cy = m.t + i * rowH + rowH / 2;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.font = '650 11.5px system-ui, sans-serif'; ctx.fillStyle = ink(f.dark, 0.85);
    // A long name is shortened, its ellipsis included, so it never runs off the left edge.
    let text = row.label;
    if (ctx.measureText(text).width > labelW) {
      while (text.length > 2 && ctx.measureText(`${text.trimEnd()}…`).width > labelW) text = text.slice(0, -1);
      text = `${text.trimEnd()}…`;
    }
    ctx.fillText(text, labelW, cy);
    for (const d of row.dots) {
      const x = sx(fwd(f.ax.t, d.x)), y = cy + (hash01(d.iso) - 0.5) * (rowH - 10);
      pos.push({ d, x, y });
      ctx.globalAlpha = d.dim ? 0.18 : 0.85;
      ctx.beginPath(); ctx.arc(x, y, d.sel ? 4.5 : 3, 0, Math.PI * 2); ctx.fillStyle = row.color; ctx.fill();
      ctx.lineWidth = d.sel ? 2.5 : 0.7; ctx.strokeStyle = d.sel ? (f.dark ? '#fff' : '#111827') : ink(!f.dark, 0.7); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // The median: a short thick bar.
    const mx = sx(fwd(f.ax.t, row.median));
    ctx.fillStyle = f.dark ? '#ffffff' : '#111827';
    ctx.fillRect(mx - 1.5, cy - rowH / 2 + 3, 3, rowH - 6);
  });
  return (x, y) => nearest(pos, x, y);
}

/** The height the dot plot needs for its rows. */
export const groupsHeight = (rows: number) => rows * 24 + 30;
