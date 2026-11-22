// Which country a tap means in a game where countries are tapped (Fill the map, Master the world's countries).
// A tiny country is hard to hit: Vatican City sits inside Rome, and Tonga or Kiribati are a few islands spread over
// the ocean. So a tiny country of the game wins when the tap is near it (its middle or any of its islands); then the
// country under the tap; then, for a tap in the sea, the nearest country of the game within reach.
import { geoArea } from 'd3-geo';
import type { App } from '../app/app';

/** Within this many pixels of a tiny country, or of a coast, a tap is meant for it. */
const NEAR = 26;
const tinyCache = new Map<string, boolean>();

/** A country too small to tap easily at most zooms: under ~1.2° across, or under 3,500 km² of land (islands). */
export function isTiny(app: App, id: string): boolean {
  const hit = tinyCache.get(id);
  if (hit != null) return hit;
  const sh = app.data.best('50m').byId.get(id) ?? app.data.best('110m').byId.get(id);
  let tiny = !sh;
  if (sh) {
    const [w, s, e, n] = sh.bbox;
    if (Math.max(e - w, n - s) < 1.2) tiny = true;
    else {
      // geoArea counts a ring the wrong way round as the rest of the globe: take the smaller side.
      let a = geoArea(sh.feature as never);
      if (a > 2 * Math.PI) a = 4 * Math.PI - a;
      tiny = a * 6371 * 6371 < 3500;
    }
  }
  tinyCache.set(id, tiny);
  return tiny;
}

/** The screen distance from a point to a country: its middle, and every vertex of its shape. */
function screenDist(app: App, id: string, tp: [number, number]): number {
  const view = app.renderer.view;
  let best = Infinity;
  const m = app.data.meta[id];
  const mp = m && view.project(m.lx, m.ly);
  if (mp) best = Math.hypot(mp[0] - tp[0], mp[1] - tp[1]);
  const sh = app.data.best('50m').byId.get(id) ?? app.data.best('110m').byId.get(id);
  const geom = (sh?.feature as GeoJSON.Feature | undefined)?.geometry;
  if (!geom) return best;
  const walk = (ring: number[][]) => {
    for (const q of ring) {
      const p = view.project(q[0], q[1]);
      if (p) best = Math.min(best, Math.hypot(p[0] - tp[0], p[1] - tp[1]));
    }
  };
  if (geom.type === 'Polygon') geom.coordinates.forEach(walk);
  else if (geom.type === 'MultiPolygon') geom.coordinates.forEach((poly) => poly.forEach(walk));
  return best;
}

/**
 * A tap on or near this country (v0.43.2, Find the country): any of its islands within reach counts, so a tap between
 * the Bahamas' islands, in the sea, is the Bahamas.
 */
export function tapNear(app: App, g: [number, number], id: string): boolean {
  const tp = app.renderer.view.project(g[0], g[1]);
  return app.renderer.countryAt(g[0], g[1]) === id || (!!tp && screenDist(app, id, tp) < NEAR);
}

/**
 * The country a tap means: `ids` are the game's countries; `tiny` says which tiny ones are still to find (the ones
 * with a ring on the map). Null for a tap on nothing near any country.
 */
export function pickCountry(app: App, g: [number, number], ids: Iterable<string>, tiny: (id: string) => boolean = () => true): string | null {
  const view = app.renderer.view;
  const tp = view.project(g[0], g[1]);
  const list = [...ids];
  if (tp) {
    let best: string | null = null, bd = NEAR;
    for (const id of list) {
      if (!isTiny(app, id) || !tiny(id)) continue;
      const d = screenDist(app, id, tp);
      if (d < bd) { bd = d; best = id; }
    }
    if (best) return best;
  }
  const under = app.renderer.countryAt(g[0], g[1]);
  if (under && list.includes(under)) return under;
  if (tp) {
    // A tap in the sea (or on a country not in the game): the game's country whose coast is nearest, within reach.
    let best: string | null = null, bd = under ? NEAR * 0.6 : NEAR;
    for (const id of list) {
      const sh = app.data.best('50m').byId.get(id) ?? app.data.best('110m').byId.get(id);
      if (!sh) continue;
      const [w, s, e, n] = sh.bbox;
      if (e - w < 300 && (g[0] < w - 4 || g[0] > e + 4 || g[1] < s - 4 || g[1] > n + 4)) continue;
      const d = screenDist(app, id, tp);
      if (d < bd) { bd = d; best = id; }
    }
    if (best) return best;
  }
  return under;
}
