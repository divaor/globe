// Our place in the galaxy (v0.21.0): a zoom from the nearest stars to the Milky Way seen from above and out to the
// Local Group. Positions are each object's direction in the sky and its distance, turned into galactic coordinates and
// laid on an artist's impression of the Milky Way (NASA/JPL-Caltech/ESO/R. Hurt) placed by the Sun's position on it.
import { X } from 'lucide';
import { h, icon, clear } from '../ui/dom';
import { dataUrl, loadJSON } from '../data/store';
import { wikiThumb } from '../modes/stories';
import { mul, vec, TO_GALACTIC, fromGalactic, type V3 } from './astro';
import { loadSky, tr, L, starName, OBJECT_TYPES, type Text, type SkyData } from './data';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { Space } from '../space/space';
import type { Sky } from './sky';
import type { InfoRow } from '../layers/types';

interface Nearby { id: string; name: Text; ra: number; dec: number; ly: number; kind?: Text; hip?: number; planets?: Text; text?: Text; wiki?: Text }
interface Feature { id: string; kind: 'centre' | 'arm' | 'feature'; name: Text; l?: number; b?: number; ly?: number; text?: Text; wiki?: Text }
interface LG { id: string; name: Text; ra: number; dec: number; ly: number; kind?: Text; text?: Text; wiki?: Text }
interface GalaxyData { nearby: Nearby[]; galaxy: Feature[]; localGroup: LG[] }

/** A point in the galaxy: galactic Cartesian light-years from the Sun (x toward the centre, y toward l = 90°). */
type GP = [number, number, number];
const toGP = (v: V3, ly: number): GP => { const g = mul(TO_GALACTIC, v); return [g[0] * ly, g[1] * ly, g[2] * ly]; };

// The picture from above (2048 px): the Sun's pixel and the scale (see build-sky.mjs).
const IMG = { size: 2048, sunX: 2800 * 2048 / 5600, sunY: 3857 * 2048 / 5600, pxPerLy: 0.0439 * 2048 / 5600 };
const SCALES: { id: string; r: number; at: [number, number]; label: Text }[] = [
  { id: 'nearby', r: 22, at: [0, 0], label: { en: 'Nearest stars', es: 'Estrellas cercanas' } },
  { id: 'neighbourhood', r: 2200, at: [0, 0], label: { en: 'Our neighbourhood', es: 'Nuestro vecindario' } },
  { id: 'galaxy', r: 62000, at: [14000, 0], label: { en: 'The Milky Way', es: 'La Vía Láctea' } },
  { id: 'local', r: 2.6e6, at: [400000, -500000], label: { en: 'The Local Group', es: 'El Grupo Local' } },
];
const num = (v: number, d = 0) => v.toLocaleString(L('en-GB', 'es-ES'), { maximumFractionDigits: d });
/** "26,700 light-years", "2.5 million light-years". */
export function lightYears(ly: number): string {
  if (ly >= 1e6) return `${num(ly / 1e6, ly < 1e7 ? 2 : 1)} ${L('million light-years', 'millones de años luz')}`;
  return `${num(ly, ly < 100 ? 1 : 0)} ${L('light-years', 'años luz')}`;
}

type Spot = { x: number; y: number; r: number; open: () => void };

export class Galaxy {
  private el: HTMLElement | null = null;
  private ui: { canvas: HTMLCanvasElement; scale: HTMLElement; chips: HTMLElement } | null = null;
  private raf = 0;
  private img: HTMLImageElement | null = null;
  private gd: GalaxyData | null = null;
  private sd: SkyData | null = null;
  // View: centre (galactic x, y in light-years) and the half-size of the view (light-years).
  private c: [number, number] = [0, 0];
  private R = 62000;
  private anim: { from: [number, number, number]; to: [number, number, number]; t0: number } | null = null;
  private spots: Spot[] = [];
  /** For tests: what is drawn. */
  info = { open: false, frames: 0, R: 0, labels: [] as string[] };

  constructor(private app: App, private shell: Shell, private space: Space, private sky: Sky) {
    space.openGalaxy = (target?: string) => void this.open(target);
    space.closers.push({ owner: this, close: () => this.close() });
  }

  get isOpen() { return !!this.el; }

  async open(target?: string) {
    if (!this.el) {
      this.space.closeOverlays(this);
      this.shell.sheet.close();
      this.shell.card.hide();
      this.build();
    }
    if (!this.img) {
      const img = new Image();
      img.onload = () => this.dirty();
      img.src = dataUrl('sky/milkyway-top.jpg');
      this.img = img;
    }
    try {
      [this.gd, this.sd] = await Promise.all([this.gd ?? loadJSON<GalaxyData>('sky/galaxy.json'), loadSky()]);
    } catch { /* drawn without them */ }
    if (target) this.go(target); else { const s = SCALES[2]; this.c = [...s.at]; this.R = s.r; }
    this.renderChips();
    this.dirty();
  }

  /** Flies to a scale ("nearby", "neighbourhood", "galaxy", "local") or to an object (id, HIP or local-group id). */
  go(target: string) {
    const s = SCALES.find((x) => x.id === target);
    if (s) { this.flyTo(s.at, s.r); return; }
    const p = this.locate(target);
    if (p) this.flyTo([p.gp[0], p.gp[1]], Math.max(p.r, Math.hypot(p.gp[0], p.gp[1]) * 0.35, 15));
  }

  private locate(id: string): { gp: GP; r: number } | null {
    const gd = this.gd, sd = this.sd;
    const n = gd?.nearby.find((x) => x.id === id || String(x.hip) === id);
    if (n) return { gp: toGP(vec(n.ra, n.dec), n.ly), r: 15 };
    const lg = gd?.localGroup.find((x) => x.id === id);
    if (lg) return { gp: toGP(vec(lg.ra, lg.dec), lg.ly), r: Math.max(150000, lg.ly * 0.4) };
    const f = gd?.galaxy.find((x) => x.id === id);
    if (f && f.l != null && f.ly) return { gp: toGP(fromGalactic(f.l, f.b ?? 0), f.ly), r: Math.max(8000, f.ly * 0.6) };
    const o = sd?.objects.find((x) => x.id === id);
    if (o?.ly) return { gp: toGP(vec(o.ra, o.dec), o.ly), r: o.ly > 1e5 ? Math.max(1e5, o.ly * 0.4) : Math.max(1500, o.ly * 0.7) };
    const st = /^\d+$/.test(id) ? sd?.byHip.get(Number(id)) : null;
    const info = st ? sd!.info.get(st.hip) : null;
    if (st && info?.ly) return { gp: toGP(st.v, info.ly), r: Math.max(40, info.ly * 0.8) };
    return null;
  }

  private flyTo(at: [number, number], r: number) {
    this.anim = { from: [this.c[0], this.c[1], Math.log(this.R)], to: [at[0], at[1], Math.log(r)], t0: performance.now() };
    this.dirty();
  }

  private build() {
    const canvas = h('canvas', { class: 'orr-canvas gal-canvas' }) as HTMLCanvasElement;
    const scale = h('div', { class: 'orr-date gal-scale' });
    const close = h('button', { type: 'button', class: 'icon-btn orr-close gal-close', 'aria-label': L('Close the galaxy', 'Cerrar la galaxia') }, icon(X, 20));
    close.addEventListener('click', () => this.close());
    const chips = h('div', { class: 'chip-row sky-chips gal-chips' });
    const el = h('div', { class: 'orr gal', role: 'dialog', 'aria-label': L('Our galaxy', 'Nuestra galaxia') }, canvas,
      h('div', { class: 'orr-head glass' }, h('strong', null, `🌌 ${L('Our galaxy', 'Nuestra galaxia')}`), scale, close),
      h('div', { class: 'orr-foot glass' }, chips,
        h('div', { class: 'muted small' }, L('Pinch or scroll to zoom from the nearest stars to Andromeda · tap anything for its card. Milky Way: artist’s impression, NASA/JPL-Caltech/ESO/R. Hurt.', 'Pellizca o usa la rueda para ir de las estrellas más cercanas a Andrómeda · toca cualquier cosa para ver su ficha. Vía Láctea: recreación artística, NASA/JPL-Caltech/ESO/R. Hurt.'))));
    this.el = el;
    this.ui = { canvas, scale, chips };
    document.documentElement.classList.add('orrery-open');
    this.app.root.append(el);
    this.bind(canvas);
    window.addEventListener('keydown', this.onKey);
    this.info.open = true;
  }

  private onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(); };

  close() {
    if (!this.el) return;
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.el.remove(); this.el = null; this.ui = null; this.anim = null;
    this.info.open = false;
    document.documentElement.classList.remove('orrery-open');
    window.removeEventListener('keydown', this.onKey);
    this.shell.card.hide();
  }

  private renderChips() {
    const ui = this.ui;
    if (!ui) return;
    clear(ui.chips);
    for (const s of SCALES) {
      const on = Math.abs(Math.log(this.R / s.r)) < 0.9;
      const b = h('button', { type: 'button', class: `chip${on ? ' on' : ''}`, 'data-scale': s.id }, tr(s.label));
      b.addEventListener('click', () => this.go(s.id));
      ui.chips.append(b);
    }
  }

  private dirty() { if (!this.raf && this.el) this.raf = requestAnimationFrame((t) => this.frame(t)); }

  private frame(t: number) {
    this.raf = 0;
    if (!this.el) return;
    if (this.anim) {
      const k = Math.min(1, (t - this.anim.t0) / 1400), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const [a, b] = [this.anim.from, this.anim.to];
      // Zoom out, move, zoom in: the log-size goes through a bump so long trips stay readable.
      const bump = Math.max(a[2], b[2]) + Math.min(2.2, Math.log(1 + Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.exp(Math.max(a[2], b[2]))));
      const lr = k < 0.5 ? a[2] + (bump - a[2]) * (e * 2) : bump + (b[2] - bump) * ((e - 0.5) * 2);
      this.c = [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
      this.R = Math.exp(Number.isFinite(lr) ? lr : b[2]);
      if (k >= 1) { this.anim = null; this.c = [b[0], b[1]]; this.R = Math.exp(b[2]); this.renderChips(); }
    }
    this.draw();
    if (this.anim) this.dirty();
  }

  private layout() {
    const c = this.ui!.canvas;
    const W = c.clientWidth, H = c.clientHeight;
    const head = this.el!.querySelector('.orr-head')!.getBoundingClientRect(), foot = this.el!.querySelector('.orr-foot')!.getBoundingClientRect();
    const top = head.bottom + 4, bottom = foot.top - 4;
    const cx = W / 2, cy = (top + bottom) / 2;
    const s = Math.min(W, Math.max(200, bottom - top)) / 2 / this.R; // px per light-year
    return { W, H, cx, cy, s };
  }

  private draw() {
    const ui = this.ui!;
    const { W, H, cx, cy, s } = this.layout();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const c = ui.canvas;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    // Galactic x is up, y to the left.
    const S = (p: GP | [number, number]): [number, number] => [cx - (p[1] - this.c[1]) * s, cy - (p[0] - this.c[0]) * s];
    const R = this.R;
    const band = (lo: number, hi: number) => Math.max(0, Math.min(1, Math.min(Math.log(R / lo) / 0.8, Math.log(hi / R) / 0.8)));
    const spots: Spot[] = [];
    const labels: string[] = [];
    const placed: [number, number, number, number][] = [];
    const label = (text: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left', force = false) => {
      ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(text).width;
      const x0 = align === 'center' ? x - tw / 2 : x;
      const box: [number, number, number, number] = [x0 - 2, y - 8, x0 + tw + 2, y + 8];
      if (!force && placed.some((q) => box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1])) return;
      placed.push(box);
      ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(2,4,11,0.8)'; ctx.strokeText(text, x, y);
      ctx.fillStyle = color; ctx.fillText(text, x, y);
      labels.push(text);
    };
    const onScreen = (p: [number, number], m = 20) => p[0] > -m && p[1] > -m && p[0] < W + m && p[1] < H + m;
    // The Milky Way from above.
    const img = this.img;
    const aImg = Math.max(0, Math.min(1, Math.log(R / 700) / 1.2));
    if (img?.complete && img.naturalWidth && aImg > 0) {
      const k = s / IMG.pxPerLy;
      const [sx, sy] = S([0, 0]);
      ctx.globalAlpha = aImg;
      ctx.drawImage(img, sx - IMG.sunX * k, sy - IMG.sunY * k, IMG.size * k, IMG.size * k);
      ctx.globalAlpha = 1;
    }
    // Distance rings around the Sun.
    const ring = Math.pow(10, Math.floor(Math.log10(R * 0.9)));
    for (const rr of [ring, ring * 3].filter((x) => x < R * 1.4 && x > R * 0.12)) {
      const [sx, sy] = S([0, 0]);
      ctx.strokeStyle = 'rgba(150,180,230,0.25)'; ctx.setLineDash([4, 5]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx, sy, rr * s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      label(lightYears(rr), sx, sy - rr * s - 9, '500 11px system-ui, sans-serif', 'rgba(180,200,235,0.75)', 'center', true);
    }
    // Spiral arms, the centre and other features.
    const aFeat = band(9000, 400000);
    if (this.gd && aFeat > 0) for (const f of this.gd.galaxy) {
      if (f.l == null || !f.ly) continue;
      const p = S(toGP(fromGalactic(f.l, f.b ?? 0), f.ly));
      if (!onScreen(p)) continue;
      ctx.globalAlpha = aFeat;
      if (f.kind === 'centre') { ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI * 2); ctx.fill(); }
      label(tr(f.name), p[0], p[1] + (f.kind === 'centre' ? 14 : 0), f.kind === 'arm' ? 'italic 600 13px system-ui, sans-serif' : '600 12px system-ui, sans-serif', f.kind === 'arm' ? '#cfe0ff' : '#fff3c4', 'center');
      ctx.globalAlpha = 1;
      spots.push({ x: p[0], y: p[1], r: 22, open: () => this.featureCard(f) });
    }
    // Nebulae, clusters and bright stars in our part of the galaxy.
    const sd = this.sd;
    const aNear = band(150, 60000);
    if (sd && aNear > 0) {
      for (const o of sd.objects) {
        if (!o.ly || o.ly > 120000 || o.type === 'galaxy') continue;
        const p = S(toGP(o.v!, o.ly));
        if (!onScreen(p)) continue;
        const t = OBJECT_TYPES[o.type] ?? OBJECT_TYPES.other;
        ctx.globalAlpha = aNear;
        ctx.strokeStyle = t.color; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI * 2); ctx.stroke();
        if (o.famous || R < 3000) label(tr(o.name), p[0] + 7, p[1], '500 11px system-ui, sans-serif', t.color);
        ctx.globalAlpha = 1;
        spots.push({ x: p[0], y: p[1], r: 10, open: () => void this.sky.cardOf(o.id, { galaxy: true }) });
      }
      for (const [hip, info] of sd.info) {
        if (!info.ly || info.ly < 20) continue;
        const st = sd.byHip.get(hip);
        if (!st) continue;
        const p = S(toGP(st.v, info.ly));
        if (!onScreen(p)) continue;
        ctx.globalAlpha = aNear;
        ctx.fillStyle = '#fff6dc'; ctx.beginPath(); ctx.arc(p[0], p[1], 2.4, 0, Math.PI * 2); ctx.fill();
        if (R < 6000) label(starName(sd, st), p[0] + 5, p[1], '500 11px system-ui, sans-serif', 'rgba(240,244,255,0.85)');
        ctx.globalAlpha = 1;
        spots.push({ x: p[0], y: p[1], r: 9, open: () => void this.sky.cardOf(String(hip), { galaxy: true }) });
      }
    }
    // The nearest stars.
    const aStars = band(1, 400);
    if (this.gd && aStars > 0) for (const n of this.gd.nearby) {
      const gp = toGP(vec(n.ra, n.dec), n.ly);
      const p = S(gp);
      if (!onScreen(p)) continue;
      ctx.globalAlpha = aStars;
      // A stalk to the galactic plane shows how far above or below it the star is.
      const z = gp[2] * s * 0.5;
      ctx.strokeStyle = 'rgba(160,190,240,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], p[1] + z); ctx.stroke();
      ctx.fillStyle = '#ffe2b0'; ctx.beginPath(); ctx.arc(p[0], p[1] - 0, 3, 0, Math.PI * 2); ctx.fill();
      label(tr(n.name), p[0] + 6, p[1], '500 11.5px system-ui, sans-serif', '#ffe9c4');
      ctx.globalAlpha = 1;
      spots.push({ x: p[0], y: p[1], r: 12, open: () => this.nearbyCard(n) });
    }
    // The Local Group.
    const aLG = band(60000, 1e8);
    if (this.gd && aLG > 0) for (const g of this.gd.localGroup) {
      const gp = toGP(vec(g.ra, g.dec), g.ly);
      const p = S(gp);
      if (!onScreen(p, 60)) continue;
      const big = g.id === 'M31' || g.id === 'M33';
      const r = Math.max(big ? 6 : 2.5, (big ? (g.id === 'M31' ? 110000 : 30000) : 4000) * s);
      ctx.globalAlpha = aLG;
      const gr = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
      gr.addColorStop(0, 'rgba(255,245,225,0.95)'); gr.addColorStop(0.4, 'rgba(200,210,255,0.45)'); gr.addColorStop(1, 'rgba(160,180,255,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(p[0], p[1], r, r * (big ? 0.45 : 1), big ? -0.6 : 0, 0, Math.PI * 2); ctx.fill();
      label(tr(g.name), p[0] + Math.max(6, r * 0.6), p[1], big ? '600 12.5px system-ui, sans-serif' : '500 11px system-ui, sans-serif', '#e6dcff');
      ctx.globalAlpha = 1;
      spots.push({ x: p[0], y: p[1], r: Math.max(12, r * 0.6), open: () => this.lgCard(g) });
    }
    // The Sun: you are here.
    {
      const p = S([0, 0]);
      ctx.fillStyle = '#ffd25a'; ctx.shadowColor = '#ffd25a'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(p[0], p[1], 4.5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      label(R > 1e5 ? L('The Milky Way (we are here)', 'La Vía Láctea (estamos aquí)') : L('The Sun (we are here)', 'El Sol (estamos aquí)'), p[0] + 8, p[1] + 1, '700 12px system-ui, sans-serif', '#ffe08a', 'left', true);
      spots.push({ x: p[0], y: p[1], r: 14, open: () => void this.space.factsCard('sun') });
    }
    this.spots = spots;
    ui.scale.textContent = L(`${lightYears(this.R * 2)} across`, `${lightYears(this.R * 2)} de lado a lado`);
    this.info.frames++; this.info.R = this.R; this.info.labels = labels;
  }

  // ---- cards ----------------------------------------------------------------------------------------

  private links(wiki?: Text, skyTarget?: string) {
    const out: { label: string; href?: string; onClick?: () => void }[] = [];
    if (skyTarget) out.push({ label: L('See it in the sky', 'Verlo en el cielo'), onClick: () => this.sky.open({ frame: 'celestial', target: skyTarget, fov: 50 }) });
    const t = wiki ? tr(wiki) || wiki.en : '';
    if (t) out.push({ label: 'Wikipedia', href: `https://${wiki && tr(wiki) ? L('en', 'es') : 'en'}.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}` });
    return out;
  }

  private nearbyCard(n: Nearby) {
    const rows: InfoRow[] = [{ icon: '📏', label: L('Distance', 'Distancia'), value: lightYears(n.ly) }];
    if (n.kind) rows.push({ icon: '⭐', label: L('What it is', 'Qué es'), value: tr(n.kind) });
    if (n.planets) rows.push({ icon: '🪐', label: L('Planets', 'Planetas'), value: tr(n.planets) });
    rows.push({ icon: '💡', label: L('Light from it left', 'Su luz salió'), value: L(`${num(n.ly, 1)} years ago`, `hace ${num(n.ly, 1)} años`) });
    this.shell.card.showCustom('⭐', tr(n.name), L('A near neighbour', 'Una vecina cercana'), rows, this.links(n.wiki, n.hip ? String(n.hip) : undefined), n.text ? [tr(n.text)] : [], n.wiki ? wikiThumb(n.wiki) : undefined);
  }

  private lgCard(g: LG) {
    const rows: InfoRow[] = [{ icon: '📏', label: L('Distance', 'Distancia'), value: lightYears(g.ly) }];
    if (g.kind) rows.push({ icon: '🌌', label: L('What it is', 'Qué es'), value: tr(g.kind) });
    rows.push({ icon: '💡', label: L('Light from it left', 'Su luz salió'), value: g.ly >= 1e6 ? L(`${num(g.ly / 1e6, 2)} million years ago`, `hace ${num(g.ly / 1e6, 2)} millones de años`) : L(`${num(g.ly)} years ago`, `hace ${num(g.ly)} años`) });
    const inSky = this.sd?.objects.some((o) => o.id === g.id) ? g.id : undefined;
    this.shell.card.showCustom('🌌', tr(g.name), L('Local Group', 'Grupo Local'), rows, this.links(g.wiki, inSky), g.text ? [tr(g.text)] : [], g.wiki ? wikiThumb(g.wiki) : undefined);
  }

  private featureCard(f: Feature) {
    const rows: InfoRow[] = [];
    if (f.ly) rows.push({ icon: '📏', label: L('From the Sun', 'Del Sol'), value: lightYears(f.ly) });
    this.shell.card.showCustom(f.kind === 'centre' ? '🕳️' : '🌀', tr(f.name), L('The Milky Way', 'La Vía Láctea'), rows, this.links(f.wiki), f.text ? [tr(f.text)] : [], f.wiki ? wikiThumb(f.wiki) : undefined);
  }

  // ---- interaction ----------------------------------------------------------------------------------

  private bind(canvas: HTMLCanvasElement) {
    const pts = new Map<number, { x: number; y: number; x0: number; y0: number }>();
    let pinch0 = 0, R0 = this.R;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.anim = null;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); R0 = this.R; }
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 1) {
        const { s } = this.layout();
        this.c = [this.c[0] + (e.clientY - p.y) / s, this.c[1] + (e.clientX - p.x) / s];
      }
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2 && pinch0 > 0) { const [a, b] = [...pts.values()]; this.R = Math.max(4, Math.min(1.5e7, (R0 * pinch0) / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)))); }
      this.dirty();
    });
    const up = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      pts.delete(e.pointerId); pinch0 = 0;
      this.renderChips();
      if (p && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 8 && e.type === 'pointerup') {
        const r = canvas.getBoundingClientRect();
        this.tap(e.clientX - r.left, e.clientY - r.top);
      }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault(); this.anim = null;
      // Zoom about the pointer.
      const r = canvas.getBoundingClientRect(), { cx, cy, s } = this.layout();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const gx = this.c[0] - (py - cy) / s, gy = this.c[1] - (px - cx) / s;
      const k = Math.exp(e.deltaY * 0.0015);
      this.R = Math.max(4, Math.min(1.5e7, this.R * k));
      const s2 = s / k;
      this.c = [gx + (py - cy) / s2, gy + (px - cx) / s2];
      this.renderChips(); this.dirty();
    }, { passive: false });
    new ResizeObserver(() => this.dirty()).observe(canvas);
  }

  tap(x: number, y: number): boolean {
    let best: Spot | null = null, bd = Infinity;
    for (const s of this.spots) { const d = Math.hypot(s.x - x, s.y - y); if (d < s.r && d < bd) { bd = d; best = s; } }
    if (!best) { this.shell.card.hide(); return false; }
    best.open();
    return true;
  }
}
