#!/usr/bin/env node
/**
 * Quick-look PNG previews of the history snapshots (QA only, not used by the app).
 *
 *   node scripts/data/history/preview-history.mjs --out <dir> [--data public/data/history]
 *        [--years bc2000,100,1492,1914,2010] [--width 2400] [--ortho 180,60] [--labels 40]
 *        [--bbox west,south,east,north]
 *
 * Fills use a throw-away 24-colour palette indexed by the `c` property; unnamed land is beige.
 * Internal borders are drawn from the topology mesh (a !== b), coastlines from (a === b), so
 * gaps, overlaps, seams along ±180° and colour clashes between neighbours are easy to spot.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoArea, geoCentroid, geoEquirectangular, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { hcl } from 'd3-color';
import { feature, mesh } from 'topojson-client';
import sharp from 'sharp';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
  return acc;
}, []));
const dataDir = args.data || path.resolve(SCRIPT_DIR, '../../../public/data/history');
const outDir = args.out;
if (!outDir) throw new Error('--out <dir> is required');
const width = Number(args.width || 2400);
const nLabels = Number(args.labels || 40);
const years = (args.years || 'bc2000,100,1492,1914,2010').split(',');
fs.mkdirSync(outDir, { recursive: true });

const index = JSON.parse(fs.readFileSync(path.join(dataDir, 'index.json'), 'utf8'));
const PALETTE = Array.from({ length: 24 }, (_, i) => {
  const h = ((i * 7) % 24) * 15;
  const l = [68, 80, 58][i % 3];
  return hcl(h, 42, l).formatHex();
});
const LAND = '#ece6d6';
const OCEAN = '#bcd3e3';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function render(snapshot, view) {
  const topo = JSON.parse(fs.readFileSync(path.join(dataDir, snapshot.file), 'utf8'));
  const obj = topo.objects.world;
  const fc = feature(topo, obj);
  let projection;
  let w = width;
  let h = width / 2;
  if (view.ortho) {
    w = h = Math.round(width / 2);
    projection = geoOrthographic().rotate([-view.ortho[0], -view.ortho[1]]).fitExtent([[8, 8], [w - 8, h - 8]], { type: 'Sphere' });
  } else if (view.bbox) {
    const [x0, y0, x1, y1] = view.bbox;
    h = Math.round(width * (y1 - y0) / (x1 - x0) / Math.cos(((y0 + y1) / 2) * Math.PI / 180));
    projection = geoEquirectangular().fitExtent([[0, 0], [w, h]], {
      type: 'Polygon', coordinates: [[[x0, y0], [x0, y1], [x1, y1], [x1, y0], [x0, y0]]],
    });
  } else {
    projection = geoEquirectangular().fitExtent([[0, 0], [w, h]], { type: 'Sphere' });
  }
  const p = geoPath(projection).digits(1);
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`);
  parts.push(`<rect width="${w}" height="${h}" fill="#fff"/>`);
  parts.push(`<path d="${p({ type: 'Sphere' })}" fill="${OCEAN}"/>`);
  parts.push(`<path d="${p(geoGraticule10())}" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="0.5"/>`);
  for (const f of fc.features) {
    const d = p(f);
    if (!d) continue;
    const fill = f.properties.n ? PALETTE[f.properties.c] : LAND;
    parts.push(`<path d="${d}" fill="${fill}"/>`);
  }
  const borders = mesh(topo, obj, (a, b) => a !== b && (a.properties.n || '') !== (b.properties.n || ''));
  const coast = mesh(topo, obj, (a, b) => a === b);
  parts.push(`<path d="${p(coast)}" fill="none" stroke="#3d5a73" stroke-width="0.6"/>`);
  parts.push(`<path d="${p(borders)}" fill="none" stroke="#222" stroke-width="0.55" stroke-opacity="0.85"/>`);

  // Labels for the largest entities, at the centroid of their largest polygon.
  const byName = new Map();
  for (const f of fc.features) {
    if (!f.properties.n) continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      const g = { type: 'Polygon', coordinates: poly };
      const a = geoArea(g);
      const e = byName.get(f.properties.n) || { total: 0, best: null, bestA: 0 };
      e.total += a;
      if (a > e.bestA) { e.best = g; e.bestA = a; }
      byName.set(f.properties.n, e);
    }
  }
  const top = [...byName].sort((a, b) => b[1].total - a[1].total).slice(0, nLabels);
  for (const [name, e] of top) {
    const xy = projection(geoCentroid(e.best));
    if (!xy || !Number.isFinite(xy[0]) || (view.ortho && !p({ type: 'Point', coordinates: geoCentroid(e.best) }))) continue;
    parts.push(`<text x="${xy[0].toFixed(1)}" y="${xy[1].toFixed(1)}" font-family="DejaVu Sans" font-size="11" text-anchor="middle" fill="#111" stroke="#fff" stroke-width="2.5" stroke-opacity="0.8" paint-order="stroke">${esc(name.length > 34 ? `${name.slice(0, 33)}…` : name)}</text>`);
  }
  parts.push(`<text x="14" y="28" font-family="DejaVu Sans" font-size="22" font-weight="bold" fill="#111" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(snapshot.label_en)} · ${fc.features.length} features</text>`);
  parts.push('</svg>');
  return parts.join('\n');
}

const views = [{ name: 'world' }];
if (args.ortho) views.push({ name: `ortho_${args.ortho.replace(/,/g, '_')}`, ortho: args.ortho.split(',').map(Number) });
if (args.bbox) views.push({ name: `bbox_${args.bbox.replace(/,/g, '_')}`, bbox: args.bbox.split(',').map(Number) });
for (const y of years) {
  const snapshot = index.snapshots.find((s) => s.file === `world_${y}.json`);
  if (!snapshot) throw new Error(`No snapshot world_${y}.json in index.json`);
  for (const view of (args.only ? views.filter((v) => v.name !== 'world') : views)) {
    const svg = render(snapshot, view);
    const out = path.join(outDir, `history_${y}_${view.name}.png`);
    await sharp(Buffer.from(svg), { limitInputPixels: false }).png({ compressionLevel: 9 }).toFile(out);
    console.log(out);
  }
}
