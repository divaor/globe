// Tonight's sky (v0.49.0): the pictures. A world's disc as it looks (its own map, lit from the Sun's side, turned the
// way it is seen from the place), Saturn with its rings and their shadows, Jupiter with its four big moons, the sky
// all around the horizon, and the night's strip of light and dark.
import { dot, cross, norm, type V3 } from './astro';
import { dataUrl } from '../data/store';

export interface Tex { w: number; h: number; data: Uint8ClampedArray }
const textures = new Map<string, Promise<Tex | null>>();

/** A world's map (public/data/worlds/<id>-2k.jpg) as pixels, 1024 × 512. `zonal`: each row averaged all the way round
 *  (a giant planet's belts and zones without a storm drawn where it no longer is). */
export function loadTex(id: string, zonal = false): Promise<Tex | null> {
  const key = `${id}${zonal ? ':z' : ''}`;
  let p = textures.get(key);
  if (!p) {
    p = new Promise<Tex | null>((ok) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        try {
          const w = 1024, hh = 512;
          const c = document.createElement('canvas'); c.width = w; c.height = hh;
          const ctx = c.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(img, 0, 0, w, hh);
          const data = ctx.getImageData(0, 0, w, hh).data;
          if (zonal) {
            for (let y = 0; y < hh; y++) {
              let r = 0, g = 0, b = 0;
              for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; }
              for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; data[i] = r / w; data[i + 1] = g / w; data[i + 2] = b / w; }
            }
          }
          ok({ w, h: hh, data });
        } catch { ok(null); }
      };
      img.onerror = () => ok(null);
      img.src = dataUrl(id === 'earth' ? 'raster/bluemarble-2k.jpg' : id === 'venus' ? 'worlds/venus-clouds-2k.jpg' : `worlds/${id}-2k.jpg`);
    });
    textures.set(key, p);
  }
  return p;
}

export interface DiscView {
  /** From us to the world, the direction to put at the top (the zenith, or a celestial pole) and from the world to the
   *  Sun: J2000 unit vectors. */
  dir: V3; up: V3; sunward: V3;
  /** The world's axes and map; without them a plain colour. */
  axes?: { pole: V3; X: V3; Y: V3 }; tex?: Tex | null; color?: [number, number, number];
  /** Polar flattening (Jupiter 0.065, Saturn 0.098); Saturn's rings; light on the dark side (the Earth's, on the Moon). */
  flat?: number; rings?: boolean; earthshine?: number;
  /** How much the edge darkens (giant planets' haze). */
  limb?: number;
}

const RING = [[1.24, 1.53, 0.16], [1.53, 1.95, 0.95], [1.95, 2.03, 0.12], [2.03, 2.27, 0.72]] as const;
const ringAt = (r: number) => { for (const [a, b, o] of RING) if (r >= a && r < b) return o; return 0; };
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Draws a world on a canvas, `hgt` CSS pixels tall, the world's radius filling `fill` of half the height (Saturn's
 * rings need room: its canvas is wider). Returns the screen axes (right, up) for placing moons beside it.
 */
export function drawDisc(canvas: HTMLCanvasElement, w: number, hgt: number, v: DiscView, fill = 0.92): { right: V3; up: V3; px: number } {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = Math.max(1, Math.round(w * dpr)), Hh = Math.max(1, Math.round(hgt * dpr));
  if (canvas.width !== W || canvas.height !== Hh) { canvas.width = W; canvas.height = Hh; }
  canvas.style.width = `${w}px`; canvas.style.height = `${hgt}px`;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, Hh);
  const px = (Hh / 2) * fill;
  const axes = renderWorld(img, W / 2, Hh / 2, px, v);
  ctx.putImageData(img, 0, 0);
  return { ...axes, px: px / dpr };
}

/** The screen's right and up for a world seen along `dir` with `up` at the top. */
export function screenAxes(dir: V3, upDir: V3): { right: V3; up: V3 } {
  const d = dir, k = dot(upDir, d);
  let u: V3 = [upDir[0] - k * d[0], upDir[1] - k * d[1], upDir[2] - k * d[2]];
  // Straight overhead, any way up will do.
  if (Math.hypot(...u) < 1e-6) u = Math.abs(d[2]) < 0.9 ? [-d[0] * d[2], -d[1] * d[2], 1 - d[2] * d[2]] : [1 - d[0] * d[0], -d[0] * d[1], -d[0] * d[2]];
  u = norm(u);
  return { right: cross(d, u), up: u };
}

/**
 * Draws a world into pixels: its centre at (cx, cy) in the image's pixels (it may be off the image: a giant planet
 * behind its moon), `px` pixels to its radius. Only the pixels it covers are touched.
 */
export function renderWorld(img: ImageData, cx: number, cy: number, px: number, v: DiscView): { right: V3; up: V3 } {
  const W = img.width, Hh = img.height, out = img.data;
  const d = v.dir;
  const { right: r, up: u } = screenAxes(d, v.up);
  const f = v.flat ?? 0, s = 1 / (1 - f);
  const pole = v.axes?.pole ?? u;
  const S = v.sunward;
  const sunPole = dot(S, pole), seePole = -dot(d, pole);
  const litRings = sunPole * seePole > 0; // we see the rings' sunlit side
  const tex = v.tex, col = v.color ?? [200, 200, 200];
  const es = v.earthshine ?? 0, limb = v.limb ?? 0;
  // The ray through each pixel, in the frame where the world is a unit sphere (its pole axis stretched by 1/(1−f)).
  const M = (x: V3): V3 => { const p = dot(x, pole) * (s - 1); return [x[0] + p * pole[0], x[1] + p * pole[1], x[2] + p * pole[2]]; };
  const qd = M(d), qdd = dot(qd, qd);
  const dPole = dot(d, pole);
  const ext = (v.rings ? 2.3 : 1.02) * px;
  const i0 = Math.max(0, Math.floor(cx - ext)), i1 = Math.min(W, Math.ceil(cx + ext));
  const j0 = Math.max(0, Math.floor(cy - ext)), j1 = Math.min(Hh, Math.ceil(cy + ext));
  for (let j = j0; j < j1; j++) {
    const sy = (cy - (j + 0.5)) / px;
    for (let i = i0; i < i1; i++) {
      const sx = (i + 0.5 - cx) / px;
      if (!v.rings && sx * sx + sy * sy > 1.03) continue;
      const o: V3 = [sx * r[0] + sy * u[0] - 4 * d[0], sx * r[1] + sy * u[1] - 4 * d[1], sx * r[2] + sy * u[2] - 4 * d[2]];
      const qo = M(o);
      const b = dot(qo, qd), c = dot(qo, qo) - 1;
      const disc = b * b - qdd * c;
      let R = 0, G = 0, B = 0, A = 0, tg = Infinity;
      if (disc >= 0) {
        tg = (-b - Math.sqrt(disc)) / qdd;
        const p: V3 = [o[0] + tg * d[0], o[1] + tg * d[1], o[2] + tg * d[2]];
        const pp = dot(p, pole);
        const n = norm([p[0] + pp * (s * s - 1) * pole[0], p[1] + pp * (s * s - 1) * pole[1], p[2] + pp * (s * s - 1) * pole[2]]);
        let cr = col[0], cg = col[1], cb = col[2];
        if (tex && v.axes) {
          const q = M(p);
          const lon = Math.atan2(dot(q, v.axes.Y), dot(q, v.axes.X)), lat = Math.asin(Math.max(-1, Math.min(1, dot(q, pole))));
          const tx = Math.min(tex.w - 1, Math.max(0, Math.floor(((lon / Math.PI + 1) / 2) * tex.w)));
          const ty = Math.min(tex.h - 1, Math.max(0, Math.floor((0.5 - lat / Math.PI) * tex.h)));
          const ti = (ty * tex.w + tx) * 4;
          cr = tex.data[ti]; cg = tex.data[ti + 1]; cb = tex.data[ti + 2];
        }
        const ls = dot(n, S);
        let light = smooth(-0.035, 0.05, ls) * (0.62 + 0.38 * Math.sqrt(Math.max(0, ls)));
        if (limb) light *= 1 - limb + limb * Math.sqrt(Math.max(0, -dot(n, d)));
        // The rings' shadow on the globe.
        if (v.rings && Math.abs(sunPole) > 1e-4) {
          const t2 = -pp / sunPole;
          if (t2 > 0) { const rr = Math.hypot(p[0] + t2 * S[0], p[1] + t2 * S[1], p[2] + t2 * S[2]); light *= 1 - 0.85 * ringAt(rr); }
        }
        const lv = Math.max(light, es);
        R = cr * lv; G = cg * lv; B = cb * lv; A = 255;
      }
      // Saturn's rings: in front of the globe, or seen beside it.
      if (v.rings && Math.abs(dPole) > 1e-5) {
        const tr = -dot(o, pole) / dPole;
        if (tr < tg) {
          const p: V3 = [o[0] + tr * d[0], o[1] + tr * d[1], o[2] + tr * d[2]];
          const op = ringAt(Math.hypot(...p));
          if (op > 0) {
            // In the globe's shadow?
            const ps = dot(p, S);
            const shadow = ps < 0 && ps * ps - dot(p, p) + 1 >= 0;
            const lv = (litRings ? 1 : 0.28) * (shadow ? 0.12 : 1);
            const a = Math.min(1, op * (litRings ? 1 : 0.8));
            R = R * (1 - a) + 222 * lv * a; G = G * (1 - a) + 204 * lv * a; B = B * (1 - a) + 168 * lv * a; A = Math.max(A, 255 * a);
          }
        }
      }
      if (!A) continue;
      const k4 = (j * W + i) * 4;
      out[k4] = R; out[k4 + 1] = G; out[k4 + 2] = B; out[k4 + 3] = A;
    }
  }
  return { right: r, up: u };
}

/** A small Moon for lists (the phase only): lit side toward `limbDeg` (counter-clockwise from the right). */
export function moonIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, phase: number, limbDeg: number) {
  const el = phase * 2 * Math.PI;
  ctx.save(); ctx.translate(x, y); ctx.rotate((-limbDeg * Math.PI) / 180);
  ctx.fillStyle = '#2b2f3a'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f1ede2'; ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2); ctx.fill();
  const k = Math.cos(el);
  ctx.fillStyle = k > 0 ? '#2b2f3a' : '#f1ede2';
  ctx.beginPath(); ctx.ellipse(0, 0, Math.abs(k) * r + (k > 0 ? 0.4 : 0), r + (k > 0 ? 0.4 : 0), 0, -Math.PI / 2, Math.PI / 2, k < 0); ctx.fill();
  ctx.restore();
}

export interface SkyMark { id: string; az: number; alt: number; label: string; color: string; size: number; moon?: { phase: number; limb: number } }

/** The sky all around: the horizon across the middle, the compass under it, the Sun, the Moon and the planets above. */
export function drawPanorama(canvas: HTMLCanvasElement, w: number, hgt: number, marks: SkyMark[], sunAlt: number, south: boolean, compass: string[]): { id: string; x: number; y: number }[] {
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr);
  canvas.style.width = `${w}px`; canvas.style.height = `${hgt}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const hy = hgt - 26, top = 8;
  // The sky's colour from the Sun's height.
  const g = ctx.createLinearGradient(0, top, 0, hy);
  if (sunAlt > 0) { g.addColorStop(0, '#2f6fc0'); g.addColorStop(1, '#9fc6ee'); }
  else if (sunAlt > -6) { g.addColorStop(0, '#26386e'); g.addColorStop(0.7, '#8a5a86'); g.addColorStop(1, '#e59a6a'); }
  else if (sunAlt > -12) { g.addColorStop(0, '#0f1736'); g.addColorStop(1, '#3a3f74'); }
  else if (sunAlt > -18) { g.addColorStop(0, '#080c22'); g.addColorStop(1, '#1c2350'); }
  else { g.addColorStop(0, '#03050f'); g.addColorStop(1, '#0d1330'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, hy);
  // A few faint stars at night (fixed, for the look).
  if (sunAlt < -10) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 70; i++) { const x = (i * 97.13) % w, y = top + ((i * 53.7) % (hy - top - 6)); ctx.fillRect(x, y, i % 7 ? 1 : 1.6, i % 7 ? 1 : 1.6); }
  }
  // The ground: low hills.
  ctx.fillStyle = '#0b1410';
  ctx.beginPath(); ctx.moveTo(0, hgt);
  for (let x = 0; x <= w; x += 6) ctx.lineTo(x, hy - 2 - 3 * (Math.sin(x * 0.045) + 0.6 * Math.sin(x * 0.13 + 1)));
  ctx.lineTo(w, hgt); ctx.closePath(); ctx.fill();
  const centre = south ? 180 : 0;
  const X = (az: number) => w / 2 + ((((az - centre) % 360) + 540) % 360 - 180) / 360 * w;
  const Y = (alt: number) => hy - (Math.max(0, alt) / 90) * (hy - top);
  ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let k = 0; k < 8; k++) {
    const x = X(k * 45);
    ctx.fillStyle = k % 2 ? 'rgba(220,230,255,0.55)' : 'rgba(240,244,255,0.95)';
    ctx.fillText(compass[k], x, hgt - 12);
    ctx.fillRect(x - 0.5, hy - 1, 1, 4);
  }
  const spots: { id: string; x: number; y: number }[] = [];
  const boxes: [number, number, number, number][] = [];
  const free = (b: [number, number, number, number]) => !boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
  // The brightest first: their names win a crowded spot.
  for (const m of [...marks].sort((a, b) => b.size - a.size)) {
    if (m.alt < -1) continue;
    const x = X(m.az), y = Y(m.alt);
    if (m.moon) moonIcon(ctx, x, y, m.size, m.moon.phase, m.moon.limb);
    else {
      const gl = ctx.createRadialGradient(x, y, 0, x, y, m.size * 2.6);
      gl.addColorStop(0, m.color); gl.addColorStop(0.35, m.color); gl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, m.size * 2.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = '600 11px system-ui, sans-serif';
    const tw = ctx.measureText(m.label).width;
    const align: CanvasTextAlign = x > w - 40 ? 'right' : x < 40 ? 'left' : 'center';
    const x0 = align === 'right' ? x - tw : align === 'left' ? x : x - tw / 2;
    // Above the dot, else below it, else to its side; left out if there is no room.
    for (const ly of [Math.max(top + 6, y - m.size - 9), y + m.size + 10, y]) {
      const lx = ly === y ? (x + tw + m.size + 8 < w ? x + m.size + 6 : x - m.size - 6 - tw) : x0;
      const b: [number, number, number, number] = [lx - 2, ly - 7, lx + tw + 2, ly + 7];
      if (!free(b) || ly > hy - 4) continue;
      boxes.push(b);
      ctx.textAlign = 'left'; ctx.fillText(m.label, lx, ly);
      break;
    }
    boxes.push([x - m.size, y - m.size, x + m.size, y + m.size]);
    spots.push({ id: m.id, x, y });
  }
  return spots;
}

/** The night from noon to noon: day, the three twilights and night, the hours the Moon is up, and now. */
export function drawNightBar(canvas: HTMLCanvasElement, w: number, hgt: number, sun: number[], moonAlt: number[], lit: number[], at: number) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr);
  canvas.style.width = `${w}px`; canvas.style.height = `${hgt}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const n = sun.length, step = w / (n - 1);
  const shade = (a: number) => (a > -0.833 ? '#8fc0ec' : a > -6 ? '#5a6fae' : a > -12 ? '#34407a' : a > -18 ? '#1d2552' : '#0a0e25');
  for (let k = 0; k < n; k++) { ctx.fillStyle = shade(sun[k]); ctx.fillRect(Math.max(0, (k - 0.5) * step), 0, step + 1, hgt); }
  // The Moon's hours: a silver band, brighter the more of it is lit.
  for (let k = 0; k < n; k++) {
    if (moonAlt[k] <= 0) continue;
    ctx.fillStyle = `rgba(235,235,225,${0.25 + 0.6 * lit[k]})`;
    ctx.fillRect(Math.max(0, (k - 0.5) * step), 4, step + 1, 6);
  }
  const x = Math.max(1, Math.min(w - 1, at * w));
  ctx.fillStyle = '#ffd35a'; ctx.fillRect(x - 1.5, 0, 3, hgt);
}
