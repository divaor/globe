#!/usr/bin/env node
// Finds polygons whose rings run the wrong way round and flips them. d3 draws polygons on the
// sphere, so a ring with reversed winding means "the whole Earth except this shape" and paints over
// everything (a 10m lake did exactly that). Usage: node scripts/data/winding.mjs file.json [...]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { geoArea } from 'd3-geo';
import { feature } from 'topojson-client';

const HEMISPHERE = 2 * Math.PI;

/** Rewinds, in place, every polygon of a TopoJSON topology that covers more than a hemisphere. */
export function rewindTopology(topo) {
  const fixed = [];
  for (const [name, obj] of Object.entries(topo.objects)) {
    const geoms = obj.type === 'GeometryCollection' ? obj.geometries : [obj];
    for (const g of geoms) {
      if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') continue;
      const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
      polys.forEach((rings, i) => {
        const f = feature(topo, { type: 'Polygon', arcs: rings });
        if (geoArea(f) <= HEMISPHERE) return;
        // A ring is a list of arc indexes; reversing it means reversing the list and each arc (~i).
        const rev = rings.map((ring) => ring.slice().reverse().map((a) => ~a));
        if (g.type === 'Polygon') g.arcs = rev; else g.arcs[i] = rev;
        fixed.push(`${name}:${g.id ?? g.properties?.n ?? g.properties?.name ?? '?'}`);
      });
    }
  }
  return fixed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // --check: only report (exit code 1 when a file needs fixing), for CI.
  const check = process.argv.includes('--check');
  const files = process.argv.slice(2).filter((a) => a !== '--check');
  let bad = 0;
  for (const file of files) {
    // A shell glob that matched nothing (an empty collection) arrives as the pattern itself.
    if (!existsSync(file)) { if (/[*?]/.test(file)) continue; throw new Error(`${file}: no such file`); }
    const topo = JSON.parse(readFileSync(file, 'utf8'));
    if (topo.type !== 'Topology') continue;
    const fixed = rewindTopology(topo);
    if (!fixed.length) continue;
    bad++;
    if (check) console.error(`${file}: inverted polygons ${fixed.join(', ')} (run node scripts/data/winding.mjs ${file})`);
    else { writeFileSync(file, JSON.stringify(topo)); console.log(`${file}: rewound ${fixed.join(', ')}`); }
  }
  if (check) {
    console.log(bad ? `${bad} file(s) with inverted polygons` : `winding ok (${files.length} files)`);
    process.exit(bad ? 1 : 0);
  }
}
