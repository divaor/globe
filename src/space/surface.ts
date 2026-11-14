// Another world on the globe: a hidden filter that draws its map (sharpened by Trek tiles as you zoom in), its IAU
// place names, and its landing sites with the rovers' routes. The Space controller (space.ts), the space stories and
// the quizzes choose which world it shows.
import { dataUrl, loadJSON } from '../data/store';
import { DetailMosaic } from '../engine/detail';
import { flagEmoji } from '../app/i18n';
import { wikiThumb } from '../modes/stories';
import { WORLDS, worldById, loadNames, loadFacts, tr, L, TYPE_NAMES, BIG_TYPES, SEA_TYPES, namedAfter, type WorldDef, type WorldMap, type Names, type Text, type Facts } from './worlds';
import type { App } from '../app/app';
import type { LayerDef, RenderCtx, InfoRow } from '../layers/types';
import type { RasterTexture } from '../engine/gl';

export interface Landing {
  id: string; world: string; name: Text; craft?: Text; at: [number, number]; date: string; end?: string;
  kind: 'crewed' | 'lander' | 'rover' | 'helicopter' | 'sample' | 'impact' | 'probe' | 'crash';
  agency: Text; flag?: string; crew?: string[]; site?: Text; rover?: { name: Text; km?: number };
  route?: [number, number][]; routeNote?: Text; firsts?: Text; text: Text; details?: Text; wiki?: Text;
}
export const LANDING_ICON: Record<Landing['kind'], string> = { crewed: '🧑‍🚀', lander: '🚀', rover: '🚙', helicopter: '🚁', sample: '🧪', impact: '☄️', probe: '🪂', crash: '💥' };
export const LANDING_KIND: Record<Landing['kind'], Text> = {
  crewed: { en: 'Crewed landing', es: 'Alunizaje tripulado' }, lander: { en: 'Robotic lander', es: 'Módulo de aterrizaje robótico' },
  rover: { en: 'Rover', es: 'Vehículo explorador' }, helicopter: { en: 'Helicopter', es: 'Helicóptero' }, sample: { en: 'Sample return', es: 'Retorno de muestras' },
  impact: { en: 'Impact', es: 'Impacto' }, probe: { en: 'Descent probe', es: 'Sonda de descenso' }, crash: { en: 'Failed landing', es: 'Aterrizaje fallido' },
};
let landings: Promise<Landing[]> | null = null;
export function loadLandings(): Promise<Landing[]> {
  landings ??= loadJSON<{ landings: Landing[] }>('worlds/landings.json').then((d) => d.landings).catch(() => []);
  return landings;
}

function lowMemory(): boolean {
  const dm = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  return (dm !== undefined && dm < 4) || Math.min(screen.width, screen.height) < 500;
}

const ROUTE = '#ffd166';
const fmtDate = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number);
  if (!m) return String(y);
  const dt = new Date(Date.UTC(y, m - 1, dd || 1));
  return dt.toLocaleDateString(L('en-GB', 'es-ES'), { year: 'numeric', month: 'long', day: dd ? 'numeric' : undefined, timeZone: 'UTC' });
};

export class WorldSurface {
  /** The world shown, or null (the Earth). */
  id: string | null = null;
  map: WorldMap['id'] = 'photo';
  showNames = true;
  showLandings = true;
  /** In a story: only the biggest names, and no landing markers (the story has its own). */
  quiet = false;
  /** Quizzes: no names and no markers at all. */
  bare = false;
  readonly layer: LayerDef;
  private tex = new Map<string, RasterTexture | 'loading' | 'failed'>();
  private mosaics = new Map<string, DetailMosaic>();
  names: Names | null = null;
  facts: Facts | null = null;
  all: Landing[] = [];
  /** The markers as drawn in the last frame (for taps). */
  private spots: { l: Landing; x: number; y: number }[] = [];
  private seaNames = new Map<string, Text>();
  private changed = new Set<() => void>();

  constructor(private app: App) {
    const self = this;
    this.layer = {
      id: 'world', category: 'imagery', icon: '🪐', kind: 'raster', group: 'imagery', hidden: true,
      name: { en: 'Another world', es: 'Otro mundo' }, desc: { en: 'The map of another world.', es: 'El mapa de otro mundo.' },
      get credit() { return self.credit(); },
      raster(rc) { return self.raster(rc); },
      drawOverlay(rc) { self.overlay(rc); },
      labels(rc) { self.labels(rc); },
      onDeactivate() { self.free(); },
    } as LayerDef;
    app.register([this.layer]);
    void loadLandings().then((l) => { this.all = l; app.renderer.requestRender(); });
  }

  get def(): WorldDef | undefined { return this.id ? worldById(this.id) : undefined; }
  onChange(fn: () => void) { this.changed.add(fn); return () => this.changed.delete(fn); }

  /** Shows a world (and one of its maps); resolves when its map is on the GPU. */
  async set(id: string | null, map: WorldMap['id'] = 'photo') {
    const w = id ? worldById(id) : undefined;
    if (id && !w) throw new Error(`no world ${id}`);
    if (id !== this.id) { this.free(); this.names = null; this.facts = null; this.seaNames.clear(); }
    this.id = id;
    this.map = w?.maps.some((m) => m.id === map) ? map : 'photo';
    this.app.renderer.worldStyle = w ? { glow: w.glow } : null;
    this.changed.forEach((fn) => fn());
    if (!w) return;
    if (w.names) void loadNames(w.id).then((n) => { if (this.id === w.id) { this.names = n; this.app.renderer.requestRender(); } });
    void loadFacts().then((f) => {
      if (this.id !== w.id) return;
      this.facts = f.get(w.id) ?? null;
      for (const s of this.facts?.seas ?? []) this.seaNames.set(s.iau, { en: s.en, es: s.es });
      this.app.renderer.requestRender();
      this.changed.forEach((fn) => fn());
    });
    await this.texture(this.mapDef()!);
    this.app.renderer.requestRender();
  }

  mapDef(): WorldMap | undefined { const w = this.def; return w?.maps.find((m) => m.id === this.map) ?? w?.maps[0]; }
  credit(): string {
    const w = this.def, m = this.mapDef();
    return w && m ? `${tr(w.name)}: ${m.credit}; names: IAU Gazetteer of Planetary Nomenclature (USGS)` : 'Other worlds: NASA, USGS, Solar System Scope';
  }

  private file(m: WorldMap) { return m.hi && !lowMemory() ? m.hi : m.lo; }
  private async texture(m: WorldMap): Promise<RasterTexture | null> {
    const gl = this.app.renderer.gl;
    if (!gl) return null;
    const f = this.file(m);
    const have = this.tex.get(f);
    if (have && have !== 'loading' && have !== 'failed') return have;
    if (have === 'loading') return null;
    this.tex.set(f, 'loading');
    try {
      const t = await gl.load(dataUrl(`worlds/${f}`));
      this.tex.set(f, t);
      // Keep at most three worlds' maps on the GPU.
      const keys = [...this.tex.keys()];
      if (keys.length > 3) for (const k of keys.slice(0, keys.length - 3)) { const x = this.tex.get(k); if (x && typeof x !== 'string') gl.gl.deleteTexture(x.tex); this.tex.delete(k); }
      this.app.renderer.requestRender();
      return t;
    } catch { this.tex.set(f, 'failed'); return null; }
  }

  /** Whether the current world's map is on the GPU. */
  get ready(): boolean { const m = this.mapDef(); const x = m ? this.tex.get(this.file(m)) : undefined; return !!x && typeof x !== 'string'; }

  private raster(rc: RenderCtx) {
    const m = this.mapDef();
    if (!m) return null;
    const t = this.tex.get(this.file(m));
    if (!t || typeof t === 'string') { if (!t) void this.texture(m); return null; }
    let detail = null;
    const gl = this.app.renderer.gl;
    if (m.detail && gl) {
      let mo = this.mosaics.get(m.detail.src.id);
      if (!mo) this.mosaics.set(m.detail.src.id, (mo = new DetailMosaic(gl, m.detail.src, 1)));
      detail = mo.update(rc.view, m.detail.zStart, () => this.app.renderer.requestRender());
    }
    return [{ texture: t, opacity: 1, detail }];
  }

  /** The mosaic of the map shown (tests and the counter). */
  get mosaic(): DetailMosaic | undefined { const m = this.mapDef(); return m?.detail ? this.mosaics.get(m.detail.src.id) : undefined; }

  free() { for (const m of this.mosaics.values()) m.free(); this.mosaics.clear(); }

  /** This world's landings. */
  get here(): Landing[] { return this.id ? this.all.filter((l) => l.world === this.id) : []; }

  private overlay(rc: RenderCtx) {
    this.spots = [];
    if (!this.id || this.bare || this.quiet || !this.showLandings) return;
    const { ctx, path } = rc;
    // Routes first, under the markers: a dark halo and a bright line.
    for (const l of this.here) {
      if (!l.route || l.route.length < 2) continue;
      const g = { type: 'LineString', coordinates: l.route } as never;
      ctx.beginPath(); path(g);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 4; ctx.stroke();
      ctx.beginPath(); path(g);
      ctx.strokeStyle = ROUTE; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const l of this.here) {
      const p = rc.project(l.at[0], l.at[1]);
      if (!p) continue;
      const r = 11;
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.fillStyle = l.kind === 'crash' || l.kind === 'impact' ? 'rgba(90,30,30,0.85)' : 'rgba(10,20,40,0.85)'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = l.kind === 'crewed' ? '#ffd166' : 'rgba(255,255,255,0.85)'; ctx.stroke();
      ctx.font = '13px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.fillText(LANDING_ICON[l.kind], p[0], p[1] + 1);
      this.spots.push({ l, x: p[0], y: p[1] });
    }
  }

  /** A sea's everyday name ("Sea of Tranquility"), or the IAU name. */
  label(name: string): string { const s = this.seaNames.get(name); return s ? tr(s) : name; }

  private labels(rc: RenderCtx) {
    const w = this.def;
    if (!w || this.bare) return;
    const { view, theme: th, labels } = rc;
    const R = w.radius;
    const k = view.pxPerRadian;
    // Landing names beside their markers.
    if (!this.quiet && this.showLandings) {
      for (const s of this.spots) labels.add({ text: tr(s.l.name), x: s.x, y: s.y, gap: 14, priority: 1500 + (s.l.kind === 'crewed' ? 200 : 0), size: 11.5, weight: 700, color: th.label, halo: th.labelHalo });
    }
    if (!this.showNames || !this.names) return;
    let n = 0;
    const max = this.quiet ? 40 : 260;
    for (const r of this.names.rows) {
      const [lon, lat, name, type, km] = r;
      const big = BIG_TYPES.has(type);
      // How big the place looks on screen; small ones wait until you zoom in.
      const px = ((Math.max(km, 1) / R) * k);
      if (px < (big ? 44 : this.quiet ? 90 : 50)) continue;
      const p = rc.project(lon, lat);
      if (!p) continue;
      const sea = SEA_TYPES.has(type);
      labels.add({
        text: this.label(name), x: p[0], y: p[1], priority: (big ? 500 : 300) + Math.min(400, Math.log2(px) * 40),
        size: Math.max(10, Math.min(big ? 16 : 13, 9 + Math.log2(px) * 0.9)), weight: big ? 600 : 500,
        italic: sea || big, caps: big && px > 260 && type !== 'mo', color: sea ? th.sea : th.label, halo: th.labelHalo,
      });
      if (++n >= max) break;
    }
  }

  // ---- taps ---------------------------------------------------------------------------------------

  /** The landing whose marker is under a screen point. */
  landingAt(x: number, y: number): Landing | null {
    let best: Landing | null = null, bd = 22 * 22;
    for (const s of this.spots) { const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd) { bd = d; best = s.l; } }
    return best;
  }

  /** The named place at a point: the smallest one whose circle holds it (or the nearest within 30 px). */
  nameAt(lon: number, lat: number, x: number, y: number): number | null {
    const w = this.def;
    if (!w || !this.names) return null;
    const v = this.app.renderer.view;
    const R = w.radius, k = v.pxPerRadian;
    let best = -1, bestKm = Infinity, near = -1, nd = 30 * 30;
    const rad = Math.PI / 180;
    this.names.rows.forEach((r, i) => {
      const [lo, la, , , km] = r;
      const d = Math.acos(Math.min(1, Math.sin(la * rad) * Math.sin(lat * rad) + Math.cos(la * rad) * Math.cos(lat * rad) * Math.cos((lo - lon) * rad))) * R;
      if (km > 0 && d <= km / 2 && km < bestKm) { best = i; bestKm = km; }
      const p = v.project(lo, la);
      if (p && (km / R) * k > 20) { const dd = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (dd < nd) { nd = dd; near = i; } }
    });
    return best >= 0 ? best : near >= 0 ? near : null;
  }

  landingRows(l: Landing): InfoRow[] {
    const rows: InfoRow[] = [{ icon: LANDING_ICON[l.kind], label: L('What', 'Qué'), value: tr(LANDING_KIND[l.kind]) }];
    rows.push({ icon: l.flag && l.flag !== 'SU' ? flagEmoji(l.flag) : '🏳️', label: L('Who', 'Quién'), value: tr(l.agency) });
    rows.push({ icon: '📅', label: L('When', 'Cuándo'), value: l.end && l.end !== l.date ? `${fmtDate(l.date)} – ${fmtDate(l.end)}` : fmtDate(l.date) });
    if (l.site) rows.push({ icon: '📍', label: L('Where', 'Dónde'), value: `${tr(l.site)} (${fmtLatLon(l.at)})` });
    if (l.crew?.length) rows.push({ icon: '🧑‍🚀', label: L('On the surface', 'En la superficie'), value: l.crew.join(', ') });
    if (l.craft) rows.push({ icon: '🛰️', label: L('Craft', 'Nave'), value: tr(l.craft) });
    if (l.rover) rows.push({ icon: '🚙', label: tr(l.rover.name), value: l.rover.km != null ? `${l.rover.km.toLocaleString(L('en-GB', 'es-ES'), { maximumFractionDigits: 2 })} km` : '' });
    if (l.firsts) rows.push({ icon: '🥇', label: L('First', 'Primero'), value: tr(l.firsts) });
    return rows;
  }

  landingCard(l: Landing, ui: { card: (icon: string, title: string, sub: string, rows: InfoRow[], links?: { label: string; href?: string; onClick?: () => void }[], notes?: string[], image?: Promise<string | null>) => void }) {
    const links = l.wiki ? [{ label: 'Wikipedia', href: `https://${L('en', 'es')}.wikipedia.org/wiki/${encodeURIComponent((L(l.wiki.en, l.wiki.es) || l.wiki.en).replace(/ /g, '_'))}` }] : [];
    const notes = [tr(l.text), ...(l.details ? [tr(l.details)] : []), ...(l.routeNote ? [tr(l.routeNote)] : [])];
    ui.card(LANDING_ICON[l.kind], tr(l.name), `${tr(this.def?.name)} · ${fmtDate(l.date)}`, this.landingRows(l), links, notes, l.wiki ? wikiThumb(l.wiki) : undefined);
  }

  nameCard(i: number, ui: { card: (icon: string, title: string, sub: string, rows: InfoRow[], links?: { label: string; href?: string; onClick?: () => void }[], notes?: string[]) => void }) {
    const w = this.def!, r = this.names!.rows[i];
    const [lon, lat, name, type, km, oi] = r;
    const rows: InfoRow[] = [{ icon: '🏷️', label: L('Kind', 'Tipo'), value: tr(TYPE_NAMES[type]) || type }];
    if (km > 0) rows.push({ icon: '📏', label: L('Size', 'Tamaño'), value: `${km.toLocaleString(L('en-GB', 'es-ES'), { maximumFractionDigits: km < 10 ? 1 : 0 })} km` });
    rows.push({ icon: '📍', label: L('Where', 'Dónde'), value: fmtLatLon([lon, lat]) });
    const origin = oi >= 0 ? (L('en', 'es') === 'es' ? this.names!.origins.es[oi] ?? null : this.names!.origins.en[oi]) : null;
    if (origin) rows.push({ icon: '✍️', label: L('Named after', 'En honor de'), value: namedAfter(name, origin) });
    const common = this.seaNames.get(name);
    const title = common ? tr(common) : name;
    const sub = common ? `${name} · ${tr(w.name)}` : tr(w.name);
    const links = [{ label: 'IAU / USGS', href: `https://planetarynames.wr.usgs.gov/SearchResults?Target=${encodeURIComponent(w.id === 'moon' ? '16_Moon' : w.name.en.toUpperCase())}&Feature%20Name=${encodeURIComponent(name)}` }];
    ui.card(SEA_TYPES.has(type) ? '🌊' : type === 'cr' ? '🕳️' : type === 'mo' ? '⛰️' : '🏷️', title, sub, rows, links);
  }
}

export function fmtLatLon([lon, lat]: [number, number]): string {
  const f = (v: number) => Math.abs(v).toLocaleString(L('en-GB', 'es-ES'), { maximumFractionDigits: 2 });
  return `${f(lat)}° ${lat >= 0 ? 'N' : 'S'}, ${f(lon)}° ${lon >= 0 ? 'E' : L('W', 'O')}`;
}

export { WORLDS };
