// Label placement with collision avoidance: labels are collected each frame with a priority,
// placed greedily (highest priority first) on a coarse occupancy grid, then drawn with a halo.

export interface LabelSpec {
  text: string;
  x: number;
  y: number;
  priority: number;
  size: number;          // font size in CSS px
  weight?: number;       // 400..800
  color: string;
  halo: string;
  italic?: boolean;
  caps?: boolean;        // letter-spaced capitals (country / sea names)
  /** Marker drawn at (x, y); text is offset to the right when present. */
  marker?: { kind: 'dot' | 'capital' | 'square' | 'triangle'; color: string; r: number; stroke?: string };
  /** Optional second line (e.g. a live clock or a value). */
  sub?: string;
  subColor?: string;
  /** Labels with marker are always drawn even if text collides (marker only). */
  keepMarker?: boolean;
  align?: 'center' | 'left';
}

const FONT = `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

export class LabelEngine {
  private items: LabelSpec[] = [];
  private grid = new Map<number, [number, number, number, number][]>();
  private cell = 64;
  private widths = new Map<string, number>();
  private w = 0; private h = 0;
  scale = 1; // user label size multiplier

  begin(w: number, h: number) {
    this.items.length = 0;
    this.grid.clear();
    this.w = w; this.h = h;
  }

  add(l: LabelSpec) {
    if (!l.text) return;
    if (l.x < -50 || l.y < -20 || l.x > this.w + 50 || l.y > this.h + 20) return;
    this.items.push(l);
  }

  /** Reserve an area (e.g. UI overlays or big markers) so labels avoid it. */
  reserve(x0: number, y0: number, x1: number, y1: number) {
    this.insert([x0, y0, x1, y1]);
  }

  private font(l: LabelSpec, size = l.size) {
    return `${l.italic ? 'italic ' : ''}${l.weight ?? 500} ${Math.round(size * this.scale * 10) / 10}px ${FONT}`;
  }

  private measure(ctx: CanvasRenderingContext2D, text: string, font: string, spacing: number): number {
    const key = font + '|' + spacing + '|' + text;
    let w = this.widths.get(key);
    if (w === undefined) {
      ctx.font = font;
      w = ctx.measureText(text).width + spacing * Math.max(0, text.length - 1);
      if (this.widths.size > 6000) this.widths.clear();
      this.widths.set(key, w);
    }
    return w;
  }

  private keys(b: [number, number, number, number]): number[] {
    const c = this.cell, out: number[] = [];
    const x0 = Math.floor(b[0] / c), x1 = Math.floor(b[2] / c), y0 = Math.floor(b[1] / c), y1 = Math.floor(b[3] / c);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) out.push(i * 10007 + j);
    return out;
  }

  private collides(b: [number, number, number, number]): boolean {
    for (const k of this.keys(b)) {
      const list = this.grid.get(k);
      if (!list) continue;
      for (const o of list) if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return true;
    }
    return false;
  }

  private insert(b: [number, number, number, number]) {
    for (const k of this.keys(b)) {
      let list = this.grid.get(k);
      if (!list) this.grid.set(k, (list = []));
      list.push(b);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    this.items.sort((a, b) => b.priority - a.priority);
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const l of this.items) {
      const spacing = l.caps ? l.size * this.scale * 0.12 : 0;
      const text = l.caps ? l.text.toUpperCase() : l.text;
      const font = this.font(l);
      const tw = this.measure(ctx, text, font, spacing);
      const th = l.size * this.scale * 1.2;
      const hasMarker = !!l.marker;
      const mr = hasMarker ? l.marker!.r : 0;
      const left = l.align === 'left' || hasMarker;
      const tx = left ? l.x + mr + 4 : l.x - tw / 2;
      const ty = l.y;
      const subH = l.sub ? l.size * this.scale * 0.95 : 0;
      const box: [number, number, number, number] = [
        Math.min(tx, l.x - mr) - 2, ty - th / 2 - 1, tx + tw + 2, ty + th / 2 + subH + 1,
      ];
      const collide = this.collides(box);
      if (collide && !(hasMarker && l.keepMarker)) continue;
      if (hasMarker) this.drawMarker(ctx, l);
      if (collide) { this.insert([l.x - mr, l.y - mr, l.x + mr, l.y + mr]); continue; }
      this.insert(box);
      ctx.font = font;
      // letterSpacing is supported in modern browsers; fall back gracefully.
      (ctx as unknown as { letterSpacing: string }).letterSpacing = spacing ? `${spacing}px` : '0px';
      ctx.textAlign = 'left';
      ctx.strokeStyle = l.halo;
      ctx.lineWidth = Math.max(2.5, l.size * this.scale * 0.28);
      ctx.strokeText(text, tx, ty);
      ctx.fillStyle = l.color;
      ctx.fillText(text, tx, ty);
      if (l.sub) {
        const sf = this.font({ ...l, weight: 600, italic: false }, l.size * 0.85);
        ctx.font = sf;
        (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
        const sy = ty + th / 2 + subH / 2 - 1;
        const sx = left ? tx : l.x - this.measure(ctx, l.sub, sf, 0) / 2;
        ctx.strokeText(l.sub, sx, sy);
        ctx.fillStyle = l.subColor ?? l.color;
        ctx.fillText(l.sub, sx, sy);
      }
    }
    (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
  }

  private drawMarker(ctx: CanvasRenderingContext2D, l: LabelSpec) {
    const m = l.marker!;
    ctx.beginPath();
    if (m.kind === 'capital') {
      ctx.arc(l.x, l.y, m.r, 0, Math.PI * 2);
      ctx.fillStyle = m.stroke ?? '#fff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(l.x, l.y, m.r * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = m.color;
      ctx.fill();
      return;
    }
    if (m.kind === 'square') ctx.rect(l.x - m.r, l.y - m.r, m.r * 2, m.r * 2);
    else if (m.kind === 'triangle') { ctx.moveTo(l.x, l.y - m.r * 1.2); ctx.lineTo(l.x + m.r, l.y + m.r * 0.8); ctx.lineTo(l.x - m.r, l.y + m.r * 0.8); ctx.closePath(); }
    else ctx.arc(l.x, l.y, m.r, 0, Math.PI * 2);
    ctx.fillStyle = m.color;
    ctx.fill();
    if (m.stroke) { ctx.lineWidth = 1; ctx.strokeStyle = m.stroke; ctx.stroke(); }
  }
}
