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
  /** Optional second line (e.g. a live clock, a value or an animal's name). */
  sub?: string;
  subColor?: string;
  /** Second line's font size in CSS px (default 85% of size) and halo (default halo). */
  subSize?: number;
  subHalo?: string;
  /** Keep the marker when the text does not fit (only where the marker covers nothing). */
  keepMarker?: boolean;
  align?: 'center' | 'left';
  /** Text beside (x, y), this many px away, on whichever side is free and on screen (or above or
   *  below): for points whose marker is drawn elsewhere. */
  gap?: number;
  /** Areas the text keeps off (a crowd of markers drawn elsewhere), but for `own`, its own marker's. */
  avoid?: Box[];
  own?: Box;
}

/** An area of the screen: left, top, right, bottom. */
export type Box = [number, number, number, number];

/** How much more priority a name already on screen gets, and how long a new one takes to fade in (ms). */
const STICK = 40;
const FADE_IN = 220;

const FONT = `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

/** A name that was on screen: when it was last drawn, when it first appeared, and on which side of its point. */
interface Seen { last: number; born: number; spot: number }

export class LabelEngine {
  private items: LabelSpec[] = [];
  /** The names drawn lately: as the map turns they keep their place and side, and new ones fade in (no flicker). */
  private seen = new Map<string, Seen>();
  /** A name is still fading in: the renderer draws another frame. */
  fading = false;
  private grid = new Map<number, [number, number, number, number][]>();
  private cell = 64;
  private widths = new Map<string, number>();
  private w = 0; private h = 0;
  scale = 1; // user label size multiplier

  /** The names drawn in the last frame, where they were drawn (the tests read them). */
  drawn: { text: string; x: number; y: number }[] = [];

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

  draw(ctx: CanvasRenderingContext2D, now = performance.now()) {
    // A name shown a moment ago keeps its place against a neighbour of about the same rank (the map moving brings
    // them in and out of each other's way every frame, which made names blink): it gets a little more priority.
    const keyOf = (l: LabelSpec) => `${l.text}|${l.size}`;
    const recent = (k: string) => { const m = this.seen.get(k); return m && now - m.last < 400 ? m : null; };
    const ranked = this.items.map((l) => ({ l, k: keyOf(l), p: l.priority + (recent(keyOf(l)) ? STICK : 0) }));
    ranked.sort((a, b) => b.p - a.p);
    this.items = ranked.map((r) => r.l);
    this.drawn = [];
    this.fading = false;
    const baseAlpha = ctx.globalAlpha;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    // A name already shown a few px away is not shown again (a city the map names and an overlay names too).
    const shown: { text: string; x: number; y: number }[] = [];
    for (const { l, k } of ranked) {
      if (shown.some((s) => s.text === l.text && Math.abs(s.x - l.x) < 40 && Math.abs(s.y - l.y) < 24)) continue;
      shown.push({ text: l.text, x: l.x, y: l.y });
      const spacing = l.caps ? l.size * this.scale * 0.12 : 0;
      const text = l.caps ? l.text.toUpperCase() : l.text;
      const font = this.font(l);
      const tw = this.measure(ctx, text, font, spacing);
      const th = l.size * this.scale * 1.2;
      const subPx = l.subSize ?? l.size * 0.85;
      const subFont = l.sub ? this.font({ ...l, weight: 600, italic: false }, subPx) : '';
      const subW = l.sub ? this.measure(ctx, l.sub, subFont, 0) : 0;
      const subH = l.sub ? subPx * this.scale * 1.12 : 0;
      // The box covers the wider of the two lines.
      const bw = Math.max(tw, subW);
      const hasMarker = !!l.marker;
      const beside = hasMarker || l.gap != null;
      const mr = hasMarker ? l.marker!.r : Math.max(0, (l.gap ?? 0) - 4);
      // Where the text can go: centred on the point, or (with a marker) right, left, above or
      // below it. The first spot that is free wins.
      const spots: { tx: number; ty: number; box: [number, number, number, number] }[] = [];
      if (!beside && l.align !== 'left') {
        // Area names (countries, regions) slide inwards rather than run off the screen edge.
        let cx = l.x;
        if (l.x >= 0 && l.x <= this.w && bw + 8 < this.w) cx = Math.max(bw / 2 + 4, Math.min(this.w - bw / 2 - 4, l.x));
        spots.push({ tx: cx - tw / 2, ty: l.y, box: [cx - bw / 2 - 2, l.y - th / 2 - 1, cx + bw / 2 + 2, l.y + th / 2 + subH + 1] });
      } else {
        const g = mr + 4;
        const right = l.x + g, left = l.x - g - bw;
        spots.push({ tx: right, ty: l.y, box: [l.x - mr - 2, l.y - th / 2 - 1, right + bw + 2, l.y + th / 2 + subH + 1] });
        if (beside) {
          spots.push({ tx: left, ty: l.y, box: [left - 2, l.y - th / 2 - 1, l.x + mr + 2, l.y + th / 2 + subH + 1] });
          if (!l.sub) {
            const up = l.y - mr - 2 - th / 2, down = l.y + mr + 2 + th / 2;
            spots.push({ tx: l.x - tw / 2, ty: up, box: [l.x - tw / 2 - 2, up - th / 2 - 1, l.x + tw / 2 + 2, l.y + mr + 1] });
            spots.push({ tx: l.x - tw / 2, ty: down, box: [l.x - tw / 2 - 2, l.y - mr - 1, l.x + tw / 2 + 2, down + th / 2 + 1] });
          }
        }
      }
      // A name in a crowd of markers (drawn elsewhere, and kept off by `avoid`) takes only its text's room: beside
      // its marker, or above or below it (with a second line too).
      if (l.avoid) {
        const g = mr + 4, hh = th + subH;
        spots.length = 0;
        const at = (tx: number, top: number) => spots.push({ tx, ty: top + th / 2 + 1, box: [tx - 2, top, tx + bw + 2, top + hh + 2] });
        // Above or below, slid back inside the screen when the marker is near its edge.
        const inside = (tx: number) => (bw + 8 < this.w ? Math.max(4, Math.min(this.w - bw - 4, tx)) : tx);
        const up = l.y - mr - 3 - hh, down = l.y + mr + 1;
        at(l.x + g, l.y - th / 2 - 1);
        at(l.x - g - bw, l.y - th / 2 - 1);
        at(inside(l.x - bw / 2), up);
        at(inside(l.x - bw / 2), down);
        // Above or below, running right from the marker or ending at it.
        at(inside(l.x - mr), up);
        at(inside(l.x + mr - bw), up);
        at(inside(l.x - mr), down);
        at(inside(l.x + mr - bw), down);
        // A line further off, when the nearer spots are taken.
        at(inside(l.x - bw / 2), up - hh);
        at(inside(l.x - bw / 2), down + hh);
      }
      const free = (s: (typeof spots)[number]) => !this.collides(s.box)
        && !l.avoid?.some((o) => o !== l.own && s.box[0] < o[2] && s.box[2] > o[0] && s.box[1] < o[3] && s.box[3] > o[1]);
      // The side it was on stays first, so a name does not hop from one side of its dot to the other.
      const was = recent(k);
      const order = was && was.spot > 0 && was.spot < spots.length ? [spots[was.spot], ...spots.filter((_, i) => i !== was.spot)] : spots;
      const spot = (l.gap != null && order.find((s) => s.box[0] >= 0 && s.box[2] <= this.w && free(s))) || order.find(free);
      if (!spot) {
        // No room for the text: keep a lone marker (capitals) only where it covers nothing.
        if (hasMarker && l.keepMarker) {
          const mb: [number, number, number, number] = [l.x - mr - 1, l.y - mr - 1, l.x + mr + 1, l.y + mr + 1];
          if (!this.collides(mb)) { this.drawMarker(ctx, l); this.insert(mb); }
        }
        continue;
      }
      // A name new on screen fades in.
      const born = was ? was.born : now;
      this.seen.set(k, { last: now, born, spot: spots.indexOf(spot) });
      const alpha = Math.min(1, (now - born) / FADE_IN);
      if (alpha < 1) this.fading = true;
      ctx.globalAlpha = baseAlpha * alpha;
      if (hasMarker) this.drawMarker(ctx, l);
      this.insert(spot.box);
      const { tx, ty } = spot;
      ctx.font = font;
      // letterSpacing is supported in modern browsers; fall back gracefully.
      (ctx as unknown as { letterSpacing: string }).letterSpacing = spacing ? `${spacing}px` : '0px';
      ctx.textAlign = 'left';
      ctx.strokeStyle = l.halo;
      ctx.lineWidth = Math.max(2.5, l.size * this.scale * 0.28);
      ctx.strokeText(text, tx, ty);
      ctx.fillStyle = l.color;
      ctx.fillText(text, tx, ty);
      this.drawn.push({ text, x: tx, y: ty });
      if (l.sub) {
        ctx.font = subFont;
        (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
        const sy = ty + th / 2 + subH / 2 - 1;
        const sx = beside || l.align === 'left' ? tx : tx + tw / 2 - subW / 2;
        ctx.strokeStyle = l.subHalo ?? l.halo;
        ctx.lineWidth = Math.max(2.5, subPx * this.scale * 0.3);
        ctx.strokeText(l.sub, sx, sy);
        ctx.fillStyle = l.subColor ?? l.color;
        ctx.fillText(l.sub, sx, sy);
      }
    }
    (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
    ctx.globalAlpha = baseAlpha;
    // Names gone for a while are forgotten.
    if (this.seen.size > 400) for (const [key, m] of this.seen) if (now - m.last > 2000) this.seen.delete(key);
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
