// Seismic waves (v0.32.0): a slice through the Earth, the quake at the top, and its waves spreading, simplified.
// P waves (blue) pass through everything; S waves (red) cannot cross the liquid outer core, so beyond about 104°
// from the quake no S waves arrive: that is how we know the outer core is liquid. P waves bend at the core, which
// leaves a shadow from 104° to 140° with no direct P waves; Inge Lehmann (1936) explained faint P waves inside that
// shadow with a solid inner core. The arrival times on the rim follow standard travel-time tables (IASP91, rounded).
import { h, icon } from '../ui/dom';
import { Play, RotateCcw } from 'lucide';
import { L } from '../play/host';
import { fmtNumber } from '../app/i18n';
import { LAYERS } from './model';
import { kOf } from './cut';

/** Minutes after the quake when the P and S waves reach a distance (degrees), IASP91 for a shallow quake, rounded. */
const P_TIME: [number, number][] = [[0, 0], [10, 2.4], [20, 4.5], [30, 6.2], [40, 7.6], [60, 10.1], [80, 12.2], [100, 13.8], [104, 14.1]];
const PKP_TIME: [number, number][] = [[140, 19.6], [160, 20.0], [180, 20.2]];
const S_TIME: [number, number][] = [[0, 0], [10, 4.3], [20, 8.1], [30, 11.2], [40, 13.8], [60, 18.4], [80, 22.2], [100, 25.2], [104, 25.7]];
const lerp = (tab: [number, number][], x: number) => {
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const [x0, y0] = tab[i - 1], [x1, y1] = tab[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  return tab[tab.length - 1][1];
};
/** How far (degrees) a wave has reached along the surface at time t (minutes). */
const reach = (tab: [number, number][], t: number) => {
  for (let i = 1; i < tab.length; i++) if (t <= tab[i][1]) { const [x0, y0] = tab[i - 1], [x1, y1] = tab[i]; return x0 + ((x1 - x0) * (t - y0)) / Math.max(1e-6, y1 - y0); }
  return tab[tab.length - 1][0];
};

export function wavesPanel(): HTMLElement {
  const size = 300, dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = h('canvas', { class: 'waves-cv', width: String(size * dpr), height: String(size * dpr), style: `width:${size}px;height:${size}px` }) as HTMLCanvasElement;
  const ctx = cv.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const clock = h('div', { class: 'waves-clock' });
  let t = 0, run = 0, playing = false;
  const R = size / 2 - 16, C = size / 2;
  // Angle on the slice: the quake at the top (0°), distances clockwise and anticlockwise.
  const pt = (deg: number, k: number): [number, number] => [C + R * k * Math.sin((deg * Math.PI) / 180), C - R * k * Math.cos((deg * Math.PI) / 180)];
  const draw = () => {
    ctx.clearRect(0, 0, size, size);
    for (const l of LAYERS) { ctx.beginPath(); ctx.arc(C, C, R * kOf(l.top), 0, Math.PI * 2); ctx.fillStyle = l.color; ctx.globalAlpha = 0.85; ctx.fill(); }
    ctx.globalAlpha = 1;
    // The shadow zones on the rim: no direct P from 104° to 140°; no S beyond 104°.
    const rimArc = (a0: number, a1: number, color: string, w: number, off: number) => {
      for (const sgn of [1, -1]) {
        ctx.beginPath();
        ctx.arc(C, C, R + off, (-90 + sgn * a0) * (Math.PI / 180), (-90 + sgn * a1) * (Math.PI / 180), sgn < 0);
        ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
      }
    };
    rimArc(104, 180, 'rgba(250,82,82,0.85)', 4, 9);
    rimArc(104, 140, 'rgba(148,163,184,0.95)', 4, 4);
    // The waves: rings spreading from the quake. Where a ring meets the surface is how far the wave has got (the
    // tables' distance); S rings stop at the liquid core, P rings go on into it, more slowly.
    const kc = kOf(LAYERS[4].top);
    const ring = (deg: number, color: string, intoCore: boolean) => {
      if (deg <= 0) return;
      const rho = 2 * Math.sin(((deg / 2) * Math.PI) / 180) * R;
      const [fx, fy] = pt(0, 1);
      ctx.save();
      ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2);
      if (!intoCore) { ctx.arc(C, C, R * kc, 0, Math.PI * 2, true); }
      ctx.clip('evenodd');
      ctx.beginPath(); ctx.arc(fx, fy, rho, 0, Math.PI * 2);
      ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.restore();
      // Where it reaches the surface.
      for (const sgn of [1, -1]) { const [x, y] = pt(sgn * Math.min(deg, 180), 1); ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); }
    };
    ring(reach(S_TIME, t), '#ff6b6b', false);
    ring(reach(P_TIME, t), '#74c0fc', true);
    if (t >= PKP_TIME[0][1]) ring(reach(PKP_TIME, t), '#74c0fc', true);
    // The quake.
    const [qx, qy] = pt(0, 1);
    ctx.beginPath(); ctx.arc(qx, qy, 5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#111'; ctx.stroke();
    clock.replaceChildren(
      h('b', null, L('{0} minutes after the quake', '{0} minutos después del sismo', fmtNumber(t, 1))),
      h('span', null, L('P waves have reached {0}°; S waves {1}°.', 'Las ondas P llegaron a {0}°; las S a {1}°.', fmtNumber(Math.round(reach(P_TIME, t))), fmtNumber(Math.round(reach(S_TIME, t))))),
    );
  };
  const play = () => {
    const me = ++run; playing = true; t = 0;
    let last = performance.now();
    const step = (now: number) => {
      if (me !== run || !cv.isConnected) { playing = false; return; }
      t = Math.min(26, t + ((now - last) / 1000) * 1.6);
      last = now;
      draw();
      if (t < 26) requestAnimationFrame(step); else playing = false;
    };
    requestAnimationFrame(step);
  };
  const btn = h('button', { type: 'button', class: 'pill sm primary', 'data-waves': 'play' }, icon(Play, 15), L('Play the quake', 'Reproducir el sismo'));
  btn.addEventListener('click', () => { if (!playing || t >= 26) play(); });
  const again = h('button', { type: 'button', class: 'pill sm', 'data-waves': 'again' }, icon(RotateCcw, 15), L('Again', 'Otra vez'));
  again.addEventListener('click', play);
  draw();
  const key = (color: string, text: string) => h('div', { class: 'waves-key' }, h('span', { class: 'waves-sw', style: `background:${color}` }), text);
  const times = h('div', { class: 'muted small' }, L('Arrivals: at 30° the P waves after {0} minutes and the S waves after {1}; at 90°, {2} and {3}. Waves through the core reach the far side after about 20 minutes.', 'Llegadas: a 30°, las ondas P a los {0} minutos y las S a los {1}; a 90°, {2} y {3}. Las que cruzan el núcleo llegan al otro lado en unos 20 minutos.', fmtNumber(lerp(P_TIME, 30), 1), fmtNumber(lerp(S_TIME, 30), 1), fmtNumber(lerp(P_TIME, 90), 1), fmtNumber(lerp(S_TIME, 90), 1)));
  return h('div', { class: 'waves' },
    h('p', { class: 'small' }, L(
      'A slice through the Earth with a quake at the top. P waves push and pull, and pass through rock and liquid. S waves shake from side to side, and cannot cross a liquid: none reach the far side, beyond about 104°. That shadow showed that the outer core is liquid.',
      'Un corte de la Tierra con un sismo arriba. Las ondas P empujan y tiran, y atraviesan roca y líquido. Las ondas S sacuden de lado a lado y no pueden cruzar un líquido: ninguna llega al otro lado, más allá de unos 104°. Esa sombra mostró que el núcleo externo es líquido.')),
    h('div', { class: 'waves-stage' }, cv),
    clock,
    h('div', { class: 'hop-actions' }, btn, again),
    key('#74c0fc', L('P waves', 'Ondas P')),
    key('#ff6b6b', L('S waves', 'Ondas S')),
    key('rgba(148,163,184,0.95)', L('P shadow zone: no direct P waves, 104°–140°', 'Zona de sombra P: sin ondas P directas, 104°–140°')),
    key('rgba(250,82,82,0.85)', L('S shadow zone: no S waves beyond 104°', 'Zona de sombra S: sin ondas S más allá de 104°')),
    times,
    h('p', { class: 'muted small' }, L(
      'In 1936 Inge Lehmann noticed faint P waves arriving inside the shadow zone and explained them with a solid inner core. The fronts here are drawn simply; the times are from the standard tables.',
      'En 1936 Inge Lehmann notó ondas P débiles que llegaban dentro de la zona de sombra y las explicó con un núcleo interno sólido. Los frentes aquí se dibujan de forma simple; los tiempos son de las tablas estándar.')),
  );
}
