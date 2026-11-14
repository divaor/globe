// The night sky (v0.21.0): the real stars behind the globe, lined up for the moment and the side of the Earth you look
// at; and a sky view from any place and time, with the 88 constellations, the Milky Way, the Sun, the Moon and the
// planets. Drag to look around, pinch to zoom, tap anything for its card.
import { X, Play, Pause, LocateFixed } from 'lucide';
import { h, icon, clear } from '../ui/dom';
import { wikiThumb } from '../modes/stories';
import { SkyGL } from './skygl';
import { julian, gmst, precession, mul, transpose, vec, dot, cross, norm, radec, horizon, altAz, solarSystem, moon, RAD, type V3, type M3 } from './astro';
import { loadSky, loadStars, tr, L, starName, starDesig, constellationAt, centreOf, spanOf, MONTHS, OBJECT_TYPES, type SkyData, type Star, type Constellation, type SkyObject } from './data';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { Space } from '../space/space';
import type { InfoRow } from '../layers/types';
import type { Hit } from '../ui/search';

type Frame = 'horizon' | 'celestial';
interface Place { lon: number; lat: number; label: string }
const SPEEDS: { s: number; label: { en: string; es: string } }[] = [
  { s: 60, label: { en: '1 min/s', es: '1 min/s' } },
  { s: 600, label: { en: '10 min/s', es: '10 min/s' } },
  { s: 3600, label: { en: '1 hour/s', es: '1 hora/s' } },
  { s: 86400, label: { en: '1 day/s', es: '1 día/s' } },
];
const PLANET_LOOK: Record<string, { color: string; name: { en: string; es: string } }> = {
  mercury: { color: '#cfc6bd', name: { en: 'Mercury', es: 'Mercurio' } },
  venus: { color: '#fff3d6', name: { en: 'Venus', es: 'Venus' } },
  mars: { color: '#ff9a6b', name: { en: 'Mars', es: 'Marte' } },
  jupiter: { color: '#ffe2b8', name: { en: 'Jupiter', es: 'Júpiter' } },
  saturn: { color: '#ffe7a8', name: { en: 'Saturn', es: 'Saturno' } },
  uranus: { color: '#b5f0f5', name: { en: 'Uranus', es: 'Urano' } },
  neptune: { color: '#9db6ff', name: { en: 'Neptune', es: 'Neptuno' } },
};
const COMPASS = [
  { en: 'north', es: 'el norte' }, { en: 'north-east', es: 'el noreste' }, { en: 'east', es: 'el este' }, { en: 'south-east', es: 'el sureste' },
  { en: 'south', es: 'el sur' }, { en: 'south-west', es: 'el suroeste' }, { en: 'west', es: 'el oeste' }, { en: 'north-west', es: 'el noroeste' },
];
const CARDINAL = [{ en: 'N', es: 'N' }, { en: 'NE', es: 'NE' }, { en: 'E', es: 'E' }, { en: 'SE', es: 'SE' }, { en: 'S', es: 'S' }, { en: 'SW', es: 'SO' }, { en: 'W', es: 'O' }, { en: 'NW', es: 'NO' }];
const fmtLat = (v: number) => `${Math.abs(v).toFixed(1)}° ${v >= 0 ? 'N' : 'S'}`;
const fmtLon = (v: number) => `${Math.abs(v).toFixed(1)}° ${v >= 0 ? 'E' : L('W', 'O')}`;
const num = (v: number, d = 0) => v.toLocaleString(L('en-GB', 'es-ES'), { maximumFractionDigits: d });

/** What a tap found. */
type Pick = { kind: 'star'; star: Star } | { kind: 'object'; obj: SkyObject } | { kind: 'body'; id: string } | { kind: 'con'; con: Constellation };

export interface SkyShow {
  /** Seen from a place (horizon) or the whole sky with north up (celestial). */
  frame?: Frame;
  place?: { lon: number; lat: number; label?: string };
  /** A moment (ISO date-time or Julian Day); now if left out. */
  time?: string | number;
  /** Where to look: a constellation, star (HIP), object id or body id; or a direction. */
  target?: string;
  look?: { az: number; alt: number };
  center?: { ra: number; dec: number };
  fov?: number;
  /** A quiz: no names, one constellation drawn. */
  bare?: boolean;
  focus?: string | null;
}

export class Sky {
  private gl = SkyGL.get();
  private data: SkyData | null = null;
  private el: HTMLElement | null = null;
  private ui: { canvas: HTMLCanvasElement; place: HTMLElement; time: HTMLElement; play: HTMLButtonElement; input: HTMLInputElement; speeds: HTMLElement; chips: HTMLElement } | null = null;
  private raf = 0;
  private last = 0;
  // The moment and the place.
  private jd = julian(new Date());
  private live = true;
  private playing = false;
  private speed = 1;
  private place: Place = { lon: 0, lat: 0, label: '' };
  // The view.
  private frame: Frame = 'horizon';
  private az = 180; private alt = 35;
  private ra0 = 0; private dec0 = 0;
  private fov = 110;
  // What is drawn.
  opts = { lines: true, bounds: false, names: true, mw: true, daylight: true, ground: true };
  bare = false;
  focus: string | null = null;
  private picked: Pick | null = null;
  private spots: { pick: Pick; x: number; y: number; r: number }[] = [];
  /** For tests: what is drawn. */
  info = { backdrop: 0, open: false, frames: 0, jd: 0, frame: 'horizon' as Frame, lat: 0, lon: 0, stars: 0, visible: [] as string[], sunAlt: 0, focus: null as string | null };

  constructor(private app: App, private shell: Shell, private space: Space) {
    space.openSky = () => this.open();
    space.closers.push({ owner: this, close: () => this.close() });
    shell.search.extra.push((_q, score) => this.searchHits(score));
    // The real stars behind the globe.
    if (this.gl) {
      this.gl.onReady = () => { app.renderer.requestRender(); this.dirty(); };
      app.renderer.backdrop = (bg, w, h, gy) => this.backdrop(bg, w, h, gy);
      // The backdrop needs only the stars (the rest loads with the sky view or a search).
      void loadStars().then((stars) => { if (this.starsSet) return; this.gl!.setStars(stars); this.starsSet = true; void this.gl!.loadMilkyWay(2); app.renderer.requestRender(); }).catch(() => {});
    }
  }

  get isOpen() { return !!this.el; }
  private starsSet = false;

  async load(): Promise<SkyData | null> {
    if (this.data) return this.data;
    try {
      const d = await loadSky();
      if (!this.data) {
        this.data = d;
        if (!this.starsSet) { this.gl?.setStars(d.stars); this.starsSet = true; }
        void this.gl?.loadMilkyWay(2);
        this.app.renderer.requestRender();
      }
      return this.data;
    } catch { return null; }
  }

  // ---- behind the globe -------------------------------------------------------------------------

  /** Draws the stars and the Milky Way behind the globe as they are now, seen from above the point the globe faces. */
  private backdrop(bg: CanvasRenderingContext2D, w: number, h: number, gy: number): boolean {
    const gl = this.gl, v = this.app.renderer.view;
    if (!gl || !this.starsSet || v.current.kind !== 'globe' || v.morphing) return false;
    const jd = julian(new Date());
    const a = (v.lon + gmst(jd)) * RAD, f = v.lat * RAD;
    const c: V3 = [Math.cos(f) * Math.cos(a), Math.cos(f) * Math.sin(a), Math.sin(f)];
    gl.render({
      w, h, dpr: Math.min(1.5, devicePixelRatio || 1), proj: 'gnomonic', scale: Math.max(w, h) * 0.85, cx: w / 2, cy: gy,
      right: [-Math.sin(a), Math.cos(a), 0], up: [-Math.sin(f) * Math.cos(a), -Math.sin(f) * Math.sin(a), Math.cos(f)], fwd: [-c[0], -c[1], -c[2]],
      prec: precession(jd), mw: 0.6, stars: 0.95, magLimit: 6.2,
    });
    bg.drawImage(gl.canvas, 0, 0, w, h);
    this.info.backdrop++;
    return true;
  }

  // ---- the sky view -------------------------------------------------------------------------------

  /** Opens the sky from where the globe looks, now. */
  open(show: SkyShow = {}) {
    void this.show(show);
  }

  async show(s: SkyShow) {
    if (!this.gl) return;
    const first = !this.el;
    if (first) {
      this.space.closeOverlays(this);
      this.build();
    }
    const d = await this.load();
    if (!d || !this.el) return;
    if (Math.max(innerWidth, innerHeight) * (devicePixelRatio || 1) > 1400) void this.gl.loadMilkyWay(4);
    // The moment.
    if (s.time != null) { this.jd = typeof s.time === 'number' ? s.time : julian(new Date(s.time)); this.live = false; }
    else if (first) { this.jd = julian(new Date()); this.live = true; }
    // The place: given, else where the globe looks.
    if (s.place) this.setPlace(s.place.lon, s.place.lat, s.place.label);
    else if (first) { const [lon, lat] = this.app.renderer.view.center(); this.setPlace(lon, lat); }
    this.frame = s.frame ?? (s.center ? 'celestial' : first ? 'horizon' : this.frame);
    this.bare = !!s.bare;
    this.focus = s.focus ?? null;
    if (s.fov) this.fov = s.fov;
    else if (first) this.fov = innerWidth < 600 ? 95 : 110;
    if (s.center) { this.ra0 = s.center.ra; this.dec0 = s.center.dec; }
    if (s.look) { this.az = s.look.az; this.alt = s.look.alt; }
    // At first look south (the zodiac from the north; the Southern Cross and the Magellanic Clouds from the south), high
    // enough that the horizon sits near the bottom of the view.
    else if (first && !s.target) { this.az = 180; this.alt = this.startAlt(); }
    if (s.target) this.lookAt(s.target, !s.fov);
    this.picked = null;
    this.renderFoot();
    this.dirty();
  }

  /** The altitude to look at so that the horizon is a little above the bottom of the view. */
  private startAlt(): number {
    if (!this.el) return 35;
    const { cy, S, bottom } = this.layout();
    const below = 2 * Math.atan((bottom - cy) / (2 * S)) / RAD;
    return Math.max(25, Math.min(60, below - 6));
  }

  private build() {
    const canvas = h('canvas', { class: 'orr-canvas sky-canvas' }) as HTMLCanvasElement;
    const place = h('button', { type: 'button', class: 'sky-place', 'aria-label': L('Use my location', 'Usar mi ubicación') });
    place.addEventListener('click', () => this.locate());
    const time = h('div', { class: 'orr-date sky-time' });
    const close = h('button', { type: 'button', class: 'icon-btn orr-close sky-close', 'aria-label': L('Close the sky', 'Cerrar el cielo') }, icon(X, 20));
    close.addEventListener('click', () => this.close());
    const play = h('button', { type: 'button', class: 'tb-play orr-play', 'aria-label': 'Play' }) as HTMLButtonElement;
    play.addEventListener('click', () => { this.playing = !this.playing; this.live = false; this.renderFoot(); this.dirty(); });
    const input = h('input', { type: 'datetime-local', class: 'orr-input sky-input', 'aria-label': L('Date and time', 'Fecha y hora') }) as HTMLInputElement;
    input.addEventListener('change', () => {
      const t = new Date(input.value);
      if (isNaN(t.getTime())) return;
      this.jd = julian(t); this.live = false; this.playing = false; this.renderFoot(); this.dirty();
    });
    const now = h('button', { type: 'button', class: 'chip sky-now' }, L('Now', 'Ahora'));
    now.addEventListener('click', () => { this.jd = julian(new Date()); this.live = true; this.playing = false; this.renderFoot(); this.dirty(); });
    const here = h('button', { type: 'button', class: 'icon-btn sm sky-locate', 'aria-label': L('Use my location', 'Usar mi ubicación') }, icon(LocateFixed, 18));
    here.addEventListener('click', () => this.locate());
    const speeds = h('div', { class: 'chip-row orr-speeds sky-speeds' });
    const chips = h('div', { class: 'chip-row sky-chips' });
    const el = h('div', { class: 'orr sky', role: 'dialog', 'aria-label': L('The night sky', 'El cielo nocturno') }, canvas,
      h('div', { class: 'orr-head glass' }, h('strong', null, `✨ ${L('The sky', 'El cielo')}`), h('div', { class: 'sky-where' }, place, time), close),
      h('div', { class: 'orr-foot glass' },
        h('div', { class: 'orr-row' }, play, input, now, here),
        speeds, chips,
        h('div', { class: 'muted small' }, L('Drag to look around · pinch or scroll to zoom · tap a star, a constellation or a planet.', 'Arrastra para mirar alrededor · pellizca o usa la rueda para acercar · toca una estrella, una constelación o un planeta.'))));
    this.el = el;
    this.ui = { canvas, place, time, play, input, speeds, chips };
    document.documentElement.classList.add('orrery-open');
    this.app.root.append(el);
    this.bind(canvas);
    this.info.open = true;
  }

  close() {
    if (!this.el) return;
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.el.remove(); this.el = null; this.ui = null;
    this.playing = false; this.bare = false; this.focus = null;
    this.info.open = false;
    document.documentElement.classList.remove('orrery-open');
    window.removeEventListener('keydown', this.onKey);
    this.shell.card.hide();
  }

  private onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(); };

  private setPlace(lon: number, lat: number, label?: string) {
    const name = label ?? (() => { const id = this.app.renderer.countryAt(lon, lat); return id ? this.app.data.name(id, this.app.lang) : ''; })();
    this.place = { lon, lat, label: name };
  }

  private locate() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => {
      this.setPlace(p.coords.longitude, p.coords.latitude, L('Your location', 'Tu ubicación'));
      this.frame = 'horizon';
      this.renderFoot(); this.dirty();
    }, () => { /* refused or unavailable: keep the place */ }, { maximumAge: 600000, timeout: 15000 });
  }

  private renderFoot() {
    const ui = this.ui;
    if (!ui) return;
    clear(ui.play); ui.play.append(icon(this.playing ? Pause : Play, 22));
    ui.play.setAttribute('aria-label', this.playing ? 'Pause' : 'Play');
    clear(ui.speeds);
    SPEEDS.forEach((s, k) => {
      const b = h('button', { type: 'button', class: `chip${this.speed === k ? ' on' : ''}`, 'data-speed': String(k) }, tr(s.label));
      b.addEventListener('click', () => { this.speed = k; this.playing = true; this.live = false; this.renderFoot(); this.dirty(); });
      ui.speeds.append(b);
    });
    clear(ui.chips);
    const chip = (key: string, label: string, on: boolean, act: () => void) => {
      const b = h('button', { type: 'button', class: `chip${on ? ' on' : ''}`, 'data-sky': key }, label);
      b.addEventListener('click', () => { act(); this.renderFoot(); this.dirty(); });
      ui.chips.append(b);
    };
    const opt = (k: keyof Sky['opts'], label: string) => chip(k, label, this.opts[k], () => { this.opts[k] = !this.opts[k]; });
    chip('north', L('Northern sky', 'Cielo del norte'), this.frame === 'horizon' && this.place.lat >= 20 && this.place.label === L('Northern sky', 'Cielo del norte'),
      () => { this.setPlace(this.place.lon, 40, L('Northern sky', 'Cielo del norte')); this.frame = 'horizon'; this.az = 180; this.alt = 35; });
    chip('south', L('Southern sky', 'Cielo del sur'), this.frame === 'horizon' && this.place.label === L('Southern sky', 'Cielo del sur'),
      () => { this.setPlace(this.place.lon, -30, L('Southern sky', 'Cielo del sur')); this.frame = 'horizon'; this.az = 180; this.alt = 45; });
    if (!this.bare) {
      opt('lines', L('Figures', 'Figuras'));
      opt('names', L('Names', 'Nombres'));
      opt('bounds', L('Borders', 'Límites'));
    }
    opt('mw', L('Milky Way', 'Vía Láctea'));
    if (this.frame === 'horizon') { opt('ground', L('Ground', 'Suelo')); opt('daylight', L('Daylight', 'Luz del día')); }
    else chip('horizon', L('From a place', 'Desde un lugar'), false, () => { this.frame = 'horizon'; });
    this.info.frame = this.frame;
  }

  // ---- the moment's geometry ------------------------------------------------------------------------

  private geo() {
    const jd = this.jd;
    const P = precession(jd);
    const hz = horizon(jd, this.place.lon, this.place.lat);
    let f: V3, u: V3;
    if (this.frame === 'horizon') {
      const a = this.az * RAD, e = this.alt * RAD;
      const [N, E, Z] = [hz.north, hz.east, hz.zenith];
      f = [0, 1, 2].map((i) => Math.cos(e) * Math.cos(a) * N[i] + Math.cos(e) * Math.sin(a) * E[i] + Math.sin(e) * Z[i]) as V3;
      u = [0, 1, 2].map((i) => -Math.sin(e) * Math.cos(a) * N[i] - Math.sin(e) * Math.sin(a) * E[i] + Math.cos(e) * Z[i]) as V3;
    } else {
      f = mul(P, vec(this.ra0, this.dec0));
      const pole: V3 = [0, 0, 1];
      const k = dot(pole, f);
      u = Math.abs(k) > 0.999 ? norm(cross(f, [1, 0, 0])) : norm([pole[0] - k * f[0], pole[1] - k * f[1], pole[2] - k * f[2]]);
    }
    const r = cross(f, u);
    const ss = solarSystem(jd).map((b) => ({ ...b, eq: mul(P, b.eq) }));
    const sun = ss[0].eq;
    const mo = moon(jd);
    return { jd, P, Pt: transpose(P) as M3, hz, f, u, r, ss, sun, mo, sunAlt: altAz(sun, hz)[0] };
  }

  /** Turns the view to a constellation, star, object or body. */
  lookAt(target: string, fit = true) {
    const d = this.data;
    if (!d) return;
    const g = this.geo();
    let v: V3 | null = null, span = 0;
    const con = d.cons.find((c) => c.id === target);
    if (con) { v = mul(g.P, centreOf(con)); span = spanOf(con); }
    const star = !v && /^\d+$/.test(target) ? d.byHip.get(Number(target)) : null;
    if (star) v = mul(g.P, star.v);
    const obj = !v ? d.objects.find((o) => o.id === target) : null;
    if (obj?.v) v = mul(g.P, obj.v);
    if (!v && target === 'moon') v = g.mo.eqDate;
    if (!v) v = g.ss.find((b) => b.id === target)?.eq ?? null;
    if (!v) return;
    if (this.frame === 'horizon') {
      const [alt, az] = altAz(v, g.hz);
      this.az = az; this.alt = Math.max(-5, Math.min(85, alt));
    } else { const [a, dd] = radec(mul(g.Pt, v)); this.ra0 = a; this.dec0 = dd; }
    if (fit) this.fov = Math.max(30, Math.min(120, span ? span * 1.6 : 50));
  }

  // ---- drawing ----------------------------------------------------------------------------------------

  private dirty() { if (!this.raf && this.el) this.raf = requestAnimationFrame((t) => this.frameStep(t)); }

  private frameStep(t: number) {
    this.raf = 0;
    if (!this.el || !this.ui) return;
    const dt = this.last ? Math.min(0.1, (t - this.last) / 1000) : 0;
    this.last = t;
    if (this.playing) this.jd += (SPEEDS[this.speed].s * dt) / 86400;
    else if (this.live) this.jd = julian(new Date());
    this.draw();
    if (this.playing || this.live) this.dirty(); else this.last = 0;
  }

  private layout() {
    const c = this.ui!.canvas;
    const W = c.clientWidth, H = c.clientHeight;
    const head = this.el!.querySelector('.orr-head')!.getBoundingClientRect(), foot = this.el!.querySelector('.orr-foot')!.getBoundingClientRect();
    const tourCard = document.querySelector<HTMLElement>('.learn-card:not([hidden])')?.getBoundingClientRect();
    const top = Math.max(head.bottom, tourCard && tourCard.height ? tourCard.bottom : 0) + 4, bottom = foot.top - 4;
    const cx = W / 2, cy = (top + bottom) / 2;
    const S = (Math.min(W, Math.max(200, bottom - top)) / 2) / (2 * Math.tan((this.fov * RAD) / 4));
    return { W, H, cx, cy, S, top, bottom };
  }

  private draw() {
    const ui = this.ui!, d = this.data, gl = this.gl;
    if (!d || !gl) return;
    const { W, H, cx, cy, S } = this.layout();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const c = ui.canvas;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const ctx = c.getContext('2d')!;
    const g = this.geo();
    const ground = this.frame === 'horizon' && this.opts.ground;
    const sunAlt = this.frame === 'horizon' && this.opts.daylight ? g.sunAlt : -90;
    const magLimit = Math.min(6.5, 5.6 + Math.log2(110 / this.fov) * 0.6);
    gl.render({
      w: W, h: H, dpr, proj: 'stereo', scale: S, cx, cy, right: g.r, up: g.u, fwd: g.f, prec: g.P,
      zenith: this.frame === 'horizon' && (ground || this.opts.daylight) ? g.hz.zenith : null, sun: g.sun, sunAlt,
      mw: this.opts.mw ? 0.9 : 0, stars: 1, magLimit,
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(gl.canvas, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Projection of an equatorial-of-date direction.
    const up = (v: V3) => !ground || dot(v, g.hz.zenith) > -0.002;
    const P = (v: V3): [number, number] | null => {
      const z = dot(v, g.f);
      if (z < -0.6) return null;
      const k = 2 / (1 + z);
      return [cx + k * dot(v, g.r) * S, cy - k * dot(v, g.u) * S];
    };
    const onScreen = (p: [number, number] | null, m = 30) => !!p && p[0] > -m && p[1] > -m && p[0] < W + m && p[1] < H + m;
    const day = Math.max(0, Math.min(1, (sunAlt + 6) / 10));
    const spots: Sky['spots'] = [];
    const placed: [number, number, number, number][] = [];
    const label = (text: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left', force = false) => {
      ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(text).width;
      const x0 = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
      const box: [number, number, number, number] = [x0 - 2, y - 8, x0 + tw + 2, y + 8];
      if (!force && placed.some((q) => box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1])) return false;
      placed.push(box);
      ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(2,6,16,0.75)'; ctx.strokeText(text, x, y);
      ctx.fillStyle = color; ctx.fillText(text, x, y);
      return true;
    };
    const P8 = (v: V3) => mul(g.P, v);
    // Constellation borders (dashed) and figures.
    const polyline = (pts: V3[], close = false) => {
      let pen = false;
      ctx.beginPath();
      for (const v of close ? [...pts, pts[0]] : pts) {
        const w = P8(v), p = up(w) ? P(w) : null;
        if (!p) { pen = false; continue; }
        if (pen) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
        pen = true;
      }
      ctx.stroke();
    };
    const fade = 1 - 0.75 * day;
    if (this.opts.bounds && !this.bare) {
      ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.strokeStyle = `rgba(150,170,210,${0.32 * fade})`;
      for (const b of d.borders) polyline(b);
      ctx.setLineDash([]);
    }
    if (this.opts.lines || this.bare) {
      for (const k of d.cons) {
        const hi = this.focus === k.id || (this.picked?.kind === 'con' && this.picked.con.id === k.id);
        if (this.bare && !hi) continue;
        ctx.lineWidth = hi ? 2 : 1.1;
        ctx.strokeStyle = hi ? `rgba(255,214,120,${0.95 * fade + 0.05})` : `rgba(120,170,255,${0.5 * fade})`;
        for (const line of k.lv!) polyline(line);
      }
    }
    // The Sun, the Moon and the planets.
    const bodies: { id: string; v: V3; mag: number }[] = g.ss.filter((b) => b.id !== 'sun').map((b) => ({ id: b.id, v: b.eq, mag: b.mag }));
    for (const b of bodies) {
      if (!up(b.v)) continue;
      const p = P(b.v);
      if (!onScreen(p)) continue;
      const look = PLANET_LOOK[b.id];
      const r = Math.max(2.4, Math.min(6, 4.2 - b.mag * 0.55));
      ctx.fillStyle = look.color; ctx.shadowColor = look.color; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(p![0], p![1], r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      if (b.id === 'saturn') { ctx.strokeStyle = 'rgba(255,231,168,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(p![0], p![1], r * 2, r * 0.7, -0.3, 0, Math.PI * 2); ctx.stroke(); }
      if (!this.bare) label(tr(look.name), p![0] + r + 4, p![1], '600 12px system-ui, sans-serif', '#ffe9b8', 'left', true);
      spots.push({ pick: { kind: 'body', id: b.id }, x: p![0], y: p![1], r: r + 8 });
    }
    // The Moon, with its phase.
    const mv = g.mo.eqDate;
    if (up(mv)) {
      const p = P(mv);
      if (onScreen(p)) {
        const r = Math.max(7, 0.26 * RAD * S * 2);
        this.drawMoon(ctx, p![0], p![1], r, g.mo.phase, P(g.sun));
        if (!this.bare) label(L('Moon', 'Luna'), p![0] + r + 5, p![1], '600 12px system-ui, sans-serif', '#eef3ff', 'left', true);
        spots.push({ pick: { kind: 'body', id: 'moon' }, x: p![0], y: p![1], r: r + 8 });
      }
    }
    if (up(g.sun)) {
      const p = P(g.sun);
      if (onScreen(p)) {
        const r = Math.max(8, 0.27 * RAD * S * 2);
        const gr = ctx.createRadialGradient(p![0], p![1], 0, p![0], p![1], r * 3);
        gr.addColorStop(0, '#fffbe8'); gr.addColorStop(0.3, '#ffe27a'); gr.addColorStop(1, 'rgba(255,200,80,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p![0], p![1], r * 3, 0, Math.PI * 2); ctx.fill();
        if (!this.bare) label(L('Sun', 'Sol'), p![0] + r + 6, p![1], '700 12px system-ui, sans-serif', '#fff3c4', 'left', true);
        spots.push({ pick: { kind: 'body', id: 'sun' }, x: p![0], y: p![1], r: r + 8 });
      }
    }
    // Deep-sky objects: the famous ones always, the others when zoomed in.
    for (const o of d.objects) {
      if (!o.famous && this.fov > 45) continue;
      const w = P8(o.v!);
      if (!up(w)) continue;
      const p = P(w);
      if (!onScreen(p, 10)) continue;
      const t = OBJECT_TYPES[o.type] ?? OBJECT_TYPES.other;
      ctx.strokeStyle = t.color; ctx.globalAlpha = 0.85 * fade + 0.15; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(p![0], p![1], 4.5, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      if (this.opts.names && !this.bare && (o.famous || this.fov < 30)) label(tr(o.name), p![0] + 7, p![1], '500 11px system-ui, sans-serif', t.color);
      spots.push({ pick: { kind: 'object', obj: o }, x: p![0], y: p![1], r: 12 });
    }
    // Stars: names of the bright ones, and spots to tap.
    let shown = 0;
    const named = this.fov < 40 ? 3.6 : this.fov < 70 ? 2.6 : 1.9;
    for (const s of d.stars) {
      if (s.mag > Math.min(magLimit, 4.8)) break;
      const w = P8(s.v);
      if (!up(w)) continue;
      const p = P(w);
      if (!onScreen(p, 4)) continue;
      shown++;
      spots.push({ pick: { kind: 'star', star: s }, x: p![0], y: p![1], r: Math.max(6, 11 - s.mag * 1.5) });
      if (this.opts.names && !this.bare && s.mag <= named && (s.name || d.info.has(s.hip))) label(starName(d, s), p![0] + 6, p![1] - 1, '500 11.5px system-ui, sans-serif', 'rgba(235,240,255,0.86)');
    }
    // Constellation names.
    const visible: string[] = [];
    for (const k of d.cons) {
      const w = P8(centreOf(k));
      const at = k.at[0] ? P8(vec(k.at[0][0], k.at[0][1])) : w;
      if (!up(at)) continue;
      const p = P(at);
      if (!onScreen(p, -10)) continue;
      visible.push(k.id);
      if (this.opts.names && !this.bare) label(tr(k.name).toUpperCase(), p![0], p![1], '600 10.5px system-ui, sans-serif', `rgba(150,190,255,${0.85 * fade + 0.1})`, 'center');
    }
    // The horizon and the compass points.
    if (this.frame === 'horizon') {
      ctx.strokeStyle = 'rgba(190,210,240,0.55)'; ctx.lineWidth = 1.2;
      const ring: V3[] = [];
      for (let a = 0; a <= 360; a += 3) ring.push([0, 1, 2].map((i) => Math.cos(a * RAD) * g.hz.north[i] + Math.sin(a * RAD) * g.hz.east[i]) as V3);
      ctx.beginPath(); let pen = false;
      for (const v of ring) { const p = P(v); if (!p) { pen = false; continue; } if (pen) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); pen = true; }
      ctx.stroke();
      CARDINAL.forEach((n, k) => {
        const a = k * 45 * RAD;
        const v = [0, 1, 2].map((i) => Math.cos(a) * g.hz.north[i] + Math.sin(a) * g.hz.east[i]) as V3;
        const p = P(v);
        if (onScreen(p, -12)) label(tr(n), p![0], p![1] + 12, k % 2 ? '600 11px system-ui, sans-serif' : '800 14px system-ui, sans-serif', k % 2 ? 'rgba(220,230,250,0.7)' : '#ffd479', 'center', true);
      });
    }
    // The picked thing.
    if (this.picked) {
      const pv = this.pickDir(this.picked, g);
      const p = pv && up(pv) ? P(pv) : null;
      if (p && this.picked.kind !== 'con') { ctx.strokeStyle = '#ffd479'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], 11, 0, Math.PI * 2); ctx.stroke(); }
    }
    this.spots = spots;
    // Head: the place and the moment.
    const dt = new Date((this.jd - 2440587.5) * 86400000);
    ui.place.textContent = `📍 ${this.place.label ? `${this.place.label} · ` : ''}${fmtLat(this.place.lat)}`;
    ui.place.title = `${fmtLat(this.place.lat)}, ${fmtLon(this.place.lon)}`;
    ui.time.textContent = this.live ? `${L('Now', 'Ahora')} · ${dt.toLocaleTimeString(L('en-GB', 'es-ES'), { hour: '2-digit', minute: '2-digit' })}` : dt.toLocaleString(L('en-GB', 'es-ES'), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    if (document.activeElement !== ui.input && dt.getFullYear() > 0 && dt.getFullYear() < 10000) {
      const pad = (n: number) => String(n).padStart(2, '0');
      ui.input.value = `${String(dt.getFullYear()).padStart(4, '0')}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    }
    Object.assign(this.info, { frames: this.info.frames + 1, jd: this.jd, lat: this.place.lat, lon: this.place.lon, stars: shown, visible, sunAlt: g.sunAlt, focus: this.focus, frame: this.frame });
  }

  private drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, phase: number, sunP: [number, number] | null) {
    const el = phase * 2 * Math.PI; // 0 new, π full
    const lit = '#f2efe6', dark = 'rgba(40,44,56,0.92)';
    // The bright limb faces the Sun.
    const ang = sunP ? Math.atan2(sunP[1] - y, sunP[0] - x) : 0;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    // The lit half (toward +x), then the terminator's ellipse.
    ctx.fillStyle = lit; ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2); ctx.fill();
    const k = Math.cos(el); // 1 new … −1 full
    ctx.fillStyle = k > 0 ? dark : lit;
    ctx.beginPath(); ctx.ellipse(0, 0, Math.abs(k) * r, r, 0, -Math.PI / 2, Math.PI / 2, k < 0); ctx.fill();
    if (k > 0) { ctx.beginPath(); ctx.ellipse(0, 0, Math.abs(k) * r + 0.5, r, 0, -Math.PI / 2, Math.PI / 2); ctx.fill(); }
    ctx.restore();
  }

  /** The equatorial-of-date direction of a picked thing. */
  private pickDir(p: Pick, g: ReturnType<Sky['geo']>): V3 | null {
    if (p.kind === 'star') return mul(g.P, p.star.v);
    if (p.kind === 'object') return mul(g.P, p.obj.v!);
    if (p.kind === 'con') return mul(g.P, centreOf(p.con));
    if (p.id === 'moon') return g.mo.eqDate;
    return g.ss.find((b) => b.id === p.id)?.eq ?? null;
  }

  // ---- interaction ----------------------------------------------------------------------------------

  private bind(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKey);
    const pts = new Map<number, { x: number; y: number; x0: number; y0: number }>();
    let pinch0 = 0, fov0 = this.fov;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); fov0 = this.fov; }
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 1) this.dragBy(e.clientX - p.x, e.clientY - p.y);
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2 && pinch0 > 0) { const [a, b] = [...pts.values()]; this.fov = Math.max(8, Math.min(160, (fov0 * pinch0) / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)))); }
      this.dirty();
    });
    const upEv = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      pts.delete(e.pointerId); pinch0 = 0;
      if (p && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 8 && e.type === 'pointerup') {
        const r = canvas.getBoundingClientRect();
        this.tap(e.clientX - r.left, e.clientY - r.top);
      }
    };
    canvas.addEventListener('pointerup', upEv);
    canvas.addEventListener('pointercancel', upEv);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.fov = Math.max(8, Math.min(160, this.fov * Math.exp(e.deltaY * 0.0012))); this.dirty(); }, { passive: false });
    canvas.addEventListener('dblclick', () => { this.fov = innerWidth < 600 ? 95 : 110; this.dirty(); });
    new ResizeObserver(() => this.dirty()).observe(canvas);
  }

  /** Grab the sky and move it. */
  private dragBy(dx: number, dy: number) {
    const { S } = this.layout();
    const k = 1 / S / RAD; // degrees per pixel at the centre
    if (this.frame === 'horizon') {
      this.az = (this.az - dx * k + 360) % 360;
      this.alt = Math.max(-30, Math.min(89.5, this.alt + dy * k));
    } else {
      this.ra0 = (this.ra0 + dx * k / Math.max(0.2, Math.cos(this.dec0 * RAD)) + 360) % 360;
      this.dec0 = Math.max(-89.5, Math.min(89.5, this.dec0 + dy * k));
    }
  }

  /** The thing under a point, with its card. */
  tap(x: number, y: number): string | null {
    const d = this.data;
    if (!d || this.bare) return null;
    let best: Pick | null = null, bd = Infinity;
    for (const s of this.spots) {
      const dd = Math.hypot(s.x - x, s.y - y);
      // Bodies and objects first, then the brightest star near the point.
      const bias = s.pick.kind === 'body' ? -6 : s.pick.kind === 'object' ? -3 : s.pick.kind === 'star' ? s.pick.star.mag : 0;
      if (dd < s.r && dd + bias < bd) { bd = dd + bias; best = s.pick; }
    }
    if (!best) {
      // The constellation there.
      const { cx, cy, S } = this.layout();
      const X = (x - cx) / S, Y = -(y - cy) / S, r2 = X * X + Y * Y;
      const vv: V3 = [(4 * X) / (4 + r2), (4 * Y) / (4 + r2), (4 - r2) / (4 + r2)];
      const g = this.geo();
      const w: V3 = [0, 1, 2].map((i) => vv[0] * g.r[i] + vv[1] * g.u[i] + vv[2] * g.f[i]) as V3;
      const con = constellationAt(d, mul(g.Pt, w));
      if (con) best = { kind: 'con', con };
    }
    this.picked = best;
    this.dirty();
    if (!best) { this.shell.card.hide(); return null; }
    void this.card(best);
    return best.kind === 'star' ? String(best.star.hip) : best.kind === 'object' ? best.obj.id : best.kind === 'body' ? best.id : best.con.id;
  }

  /** "35° up, toward the south-east" (or below the horizon). */
  private where(v: V3, g: ReturnType<Sky['geo']>): InfoRow | null {
    if (this.frame !== 'horizon') return null;
    const [alt, az] = altAz(v, g.hz);
    const dir = tr(COMPASS[Math.round(az / 45) % 8]);
    return { icon: '🧭', label: L('In the sky now', 'En el cielo ahora'), value: alt < 0 ? L(`Below the horizon (${num(-alt)}°), toward the ${dir}`, `Bajo el horizonte (${num(-alt)}°), hacia ${dir}`) : L(`${num(alt)}° up, toward the ${dir}`, `A ${num(alt)}° de altura, hacia ${dir}`) };
  }

  private async card(p: Pick, o: { galaxy?: boolean } = {}) {
    const d = this.data!;
    const g = this.geo();
    const links: { label: string; href?: string; onClick?: () => void }[] = [];
    // From the galaxy view: no "in the sky now", and a way to the sky instead.
    const where = (v: V3) => (o.galaxy || !this.el ? null : this.where(v, g));
    const toSky = (target: string) => { if (o.galaxy) links.push({ label: L('See it in the sky', 'Verlo en el cielo'), onClick: () => this.open({ frame: 'celestial', target, fov: 50 }) }); };
    const wiki = (w?: { en: string; es: string }) => { const t = w ? tr(w) || w.en : ''; if (t) links.push({ label: 'Wikipedia', href: `https://${w && tr(w) ? L('en', 'es') : 'en'}.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}` }); };
    if (p.kind === 'body') {
      const v = this.pickDir(p, g)!;
      const rows: InfoRow[] = [];
      const w = where(v); if (w) rows.push(w);
      if (p.id === 'moon') rows.push({ icon: '🌓', label: L('Lit', 'Iluminada'), value: `${num(g.mo.lit * 100)} %` }, { icon: '📏', label: L('From the Earth', 'De la Tierra'), value: `${num(g.mo.earthRadii * 6371)} km` });
      else if (p.id !== 'sun') { const b = g.ss.find((x) => x.id === p.id)!; rows.push({ icon: '📏', label: L('From the Earth', 'De la Tierra'), value: `${num(b.dist, 2)} ${L('au', 'ua')} (${num(b.dist * 149.6)} ${L('million km', 'millones de km')})` }, { icon: '✨', label: L('Brightness', 'Brillo'), value: `${L('magnitude', 'magnitud')} ${num(b.mag, 1)}` }); }
      await this.space.factsCard(p.id, rows);
      return;
    }
    if (p.kind === 'star') {
      const s = p.star, info = d.info.get(s.hip);
      const con = d.cons.find((k) => k.id === s.con);
      const rows: InfoRow[] = [];
      const w = where(mul(g.P, s.v)); if (w) rows.push(w);
      rows.push({ icon: '✨', label: L('Brightness', 'Brillo'), value: `${L('magnitude', 'magnitud')} ${num(s.mag, 2)}` });
      if (info?.ly) rows.push({ icon: '📏', label: L('Distance', 'Distancia'), value: `${num(info.ly, info.ly < 100 ? 1 : 0)} ${L('light-years', 'años luz')}` });
      if (info?.kind) rows.push({ icon: '⭐', label: L('What it is', 'Qué es'), value: tr(info.kind) });
      if (con) rows.push({ icon: '✳️', label: L('Constellation', 'Constelación'), value: tr(con.name) });
      const desig = starDesig(d, s);
      if (desig && desig !== starName(d, s)) rows.push({ icon: '🏷️', label: L('Designation', 'Designación'), value: desig });
      rows.push({ icon: '🔢', label: 'Hipparcos', value: `HIP ${s.hip}` });
      const notes = [info?.text ? tr(info.text) : '', info?.names ? `🌍 ${tr(info.names)}` : ''].filter(Boolean);
      if (con && !o.galaxy) links.push({ label: L(`Show ${tr(con.name)}`, `Ver ${tr(con.name)}`), onClick: () => { this.picked = { kind: 'con', con }; this.lookAt(con.id); this.dirty(); void this.card({ kind: 'con', con }); } });
      toSky(String(s.hip));
      if (!o.galaxy && info?.ly && this.space.openGalaxy) links.push({ label: L('Where in the galaxy', 'Dónde está en la galaxia'), onClick: () => this.space.openGalaxy!(String(s.hip)) });
      wiki(info?.wiki);
      this.shell.card.showCustom('⭐', starName(d, s), info?.kind ? tr(info.kind) : L('Star', 'Estrella'), rows, links, notes, info?.wiki ? wikiThumb(info.wiki) : undefined);
      return;
    }
    if (p.kind === 'object') {
      const ob = p.obj, t = OBJECT_TYPES[ob.type] ?? OBJECT_TYPES.other;
      const con = d.cons.find((k) => k.id === ob.con);
      const rows: InfoRow[] = [];
      const w = where(mul(g.P, ob.v!)); if (w) rows.push(w);
      if (ob.ly) rows.push({ icon: '📏', label: L('Distance', 'Distancia'), value: `${num(ob.ly >= 1e6 ? ob.ly / 1e6 : ob.ly, ob.ly >= 1e6 ? 1 : 0)} ${ob.ly >= 1e6 ? L('million light-years', 'millones de años luz') : L('light-years', 'años luz')}` });
      if (ob.size) rows.push({ icon: '↔️', label: L('Size', 'Tamaño'), value: tr(ob.size) });
      if (con) rows.push({ icon: '✳️', label: L('Constellation', 'Constelación'), value: tr(con.name) });
      if (/^M\d+$/.test(ob.id)) rows.push({ icon: '🏷️', label: L('Catalogue', 'Catálogo'), value: `Messier ${ob.id.slice(1)}` });
      toSky(ob.id);
      if (!o.galaxy && this.space.openGalaxy && ob.ly && ob.ly < 4e6) links.push({ label: L('Where in the galaxy', 'Dónde está en la galaxia'), onClick: () => this.space.openGalaxy!(ob.id) });
      wiki(ob.wiki);
      this.shell.card.showCustom(t.icon, tr(ob.name), `${tr(t.name)}${con ? ` · ${tr(con.name)}` : ''}`, rows, links, ob.text ? [tr(ob.text)] : [], ob.wiki ? wikiThumb(ob.wiki) : undefined);
      return;
    }
    const c = p.con;
    const rows: InfoRow[] = [];
    const w = where(mul(g.P, centreOf(c))); if (w) rows.push(w);
    rows.push({ icon: '🏛️', label: L('Latin name', 'Nombre en latín'), value: `${c.la} (${c.gen})` });
    rows.push({ icon: '📐', label: L('Size', 'Tamaño'), value: L(`${num(c.area)} square degrees, ${ordinal(rankBySize(d, c))} of 88`, `${num(c.area)} grados cuadrados, el ${rankBySize(d, c)}.º de 88`) });
    const b = c.brightest != null ? d.byHip.get(c.brightest) : null;
    if (b) rows.push({ icon: '⭐', label: L('Brightest star', 'Estrella más brillante'), value: starName(d, b) });
    rows.push({ icon: '🗓️', label: L('Best seen', 'Mejor época'), value: L(`${tr(MONTHS[c.best - 1])} evenings`, `las noches de ${tr(MONTHS[c.best - 1])}`) });
    rows.push({ icon: '🌍', label: L('Seen whole from', 'Se ve completa desde'), value: visibleFrom(c.dec) });
    if (c.origin) rows.push({ icon: '📜', label: L('Origin', 'Origen'), value: tr(c.origin) });
    const objs = c.objects.map((id) => d.objects.find((o) => o.id === id)).filter((o): o is SkyObject => !!o).slice(0, 6);
    if (objs.length) rows.push({ icon: '🔭', label: L('In it', 'En ella'), value: objs.map((o) => (o.name.en !== o.id ? `${o.id} (${tr(o.name)})` : o.id)).join(', ') });
    const notes = [c.text ? tr(c.text) : '', c.other ? `🌍 ${tr(c.other)}` : ''].filter(Boolean);
    wiki(c.wiki);
    this.shell.card.showCustom('✳️', tr(c.name), c.meaning ? tr(c.meaning) : L('Constellation', 'Constelación'), rows, links, notes, c.wiki ? wikiThumb(c.wiki) : undefined);
  }

  // ---- for quizzes, tours and search ----------------------------------------------------------------

  /** Constellations, named stars and deep-sky objects that match a search; picking one shows it in the sky. */
  private searchHits(score: (name: string) => number): Hit[] {
    const d = this.data;
    // The first search loads the sky's names (they show from the next letter on).
    if (!d) { void this.load(); return []; }
    const out: Hit[] = [];
    const go = (target: string, fov: number) => () => { void this.show({ frame: 'celestial', target, fov }).then(() => this.pick(target)); };
    for (const c of d.cons) {
      const sc = Math.max(score(c.name.en), score(c.name.es), score(c.la));
      if (sc > 0) out.push({ kind: 'place', lon: 0, lat: 0, label: tr(c.name), sub: `${L('Constellation', 'Constelación')}${c.meaning ? ` · ${tr(c.meaning)}` : ''}`, score: sc + 4, icon: '✳️', pick: go(c.id, Math.max(30, Math.min(110, spanOf(c) * 1.6))) });
    }
    for (const s of d.stars) {
      const info = d.info.get(s.hip);
      if (!s.name && !info) continue;
      const names = [info?.name.en, info?.name.es, s.name, s.es].filter((x): x is string => !!x);
      const sc = Math.max(...names.map(score));
      if (sc <= 0) continue;
      const con = d.cons.find((k) => k.id === s.con);
      out.push({ kind: 'place', lon: 0, lat: 0, label: starName(d, s), sub: `${L('Star', 'Estrella')}${con ? ` · ${tr(con.name)}` : ''}`, score: sc + 2 - s.mag, icon: '⭐', pick: go(String(s.hip), 40) });
    }
    for (const o of d.objects) {
      const sc = Math.max(score(o.name.en), score(o.name.es), score(o.id));
      if (sc <= 0) continue;
      const t = OBJECT_TYPES[o.type] ?? OBJECT_TYPES.other;
      out.push({ kind: 'place', lon: 0, lat: 0, label: tr(o.name), sub: `${tr(t.name)}${o.name.en !== o.id ? ` · ${o.id}` : ''}`, score: sc + (o.famous ? 4 : 0), icon: t.icon, pick: go(o.id, 30) });
    }
    return out;
  }


  /** The data, once loaded. */
  get loaded(): SkyData | null { return this.data; }
  /** The constellation drawn alone (a quiz), or null. */
  setFocus(id: string | null, bare: boolean) { this.focus = id; this.bare = bare; this.renderFoot(); this.dirty(); }
  /** The card of a constellation, star (HIP), object or body, without touching the view (the galaxy view uses it). */
  async cardOf(target: string, o: { galaxy?: boolean } = {}) {
    const d = await this.load();
    if (!d) return;
    const p = this.resolve(d, target);
    if (p) await this.card(p, o);
  }

  private resolve(d: SkyData, target: string): Pick | null {
    const con = d.cons.find((c) => c.id === target);
    const star = /^\d+$/.test(target) ? d.byHip.get(Number(target)) : undefined;
    const obj = d.objects.find((x) => x.id === target);
    return con ? { kind: 'con', con } : star ? { kind: 'star', star } : obj ? { kind: 'object', obj } : ['moon', 'sun', ...Object.keys(PLANET_LOOK)].includes(target) ? { kind: 'body', id: target } : null;
  }

  /** Picks a thing and opens its card (search). */
  async pick(target: string) {
    const d = await this.load();
    if (!d) return;
    const p = this.resolve(d, target);
    if (!p) return;
    this.picked = p;
    this.dirty();
    await this.card(p);
  }
}

function rankBySize(d: SkyData, c: Constellation): number {
  return [...d.cons].sort((a, b) => b.area - a.area).findIndex((k) => k.id === c.id) + 1;
}
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
/** Latitudes from which a declination range is seen whole at some time of year. */
function visibleFrom([dmin, dmax]: [number, number]): string {
  const north = Math.min(90, dmin + 90), south = Math.max(-90, dmax - 90);
  const f = (v: number) => `${num(Math.abs(v))}° ${v >= 0 ? 'N' : 'S'}`;
  if (north >= 90) return L(`anywhere north of ${f(south)}`, `cualquier lugar al norte de ${f(south)}`);
  if (south <= -90) return L(`anywhere south of ${f(north)}`, `cualquier lugar al sur de ${f(north)}`);
  return L(`between ${f(north)} and ${f(south)}`, `entre ${f(north)} y ${f(south)}`);
}
