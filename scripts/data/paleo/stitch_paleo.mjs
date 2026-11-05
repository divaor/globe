// Post-process one paleo TopoJSON layer written by mapshaper:
//  1. remove the cut lines along ±180° and at the poles (d3-geo-projection's geoStitch, as
//     world-atlas and scripts/data/history do), so outlines show no seam once a plate is
//     rotated away from the antimeridian;
//  2. make every polygon wind the way d3-geo expects (area < 2π);
//  3. rebuild the topology on the same quantization grid (shared arcs are kept).
//
//   node scripts/data/paleo/stitch_paleo.mjs <in.json> <object-name> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { feature, quantize } from "topojson-client";
import { topology } from "topojson-server";
import { geoArea, geoContains } from "d3-geo";
import { geoStitch } from "d3-geo-projection";

const [inPath, name, outPath] = process.argv.slice(2);
if (!inPath || !name || !outPath) {
  console.error("usage: node stitch_paleo.mjs <in.json> <object-name> <out.json>");
  process.exit(2);
}
const topo = JSON.parse(readFileSync(inPath, "utf8"));
const counters = { seam: 0, stitched: 0, reverted: 0, rewound: 0 };
const polysOf = (g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);
const asGeometry = (polys) => (polys.length === 1 ? { type: "Polygon", coordinates: polys[0] } : { type: "MultiPolygon", coordinates: polys });

function touchesSeam(g) {
  for (const rings of polysOf(g)) for (const ring of rings) for (const [x, y] of ring) {
    if (x <= -179.9999 || x >= 179.9999 || y <= -89.9999 || y >= 89.9999) return true;
  }
  return false;
}

// geoStitch appends stitched rings to the polygon of their first fragment, so holes can end up
// in the wrong polygon. Same approach as regroupRings() in scripts/data/history/build-history.mjs:
// exteriors are rings with area < 2π; each hole goes to the smallest exterior containing it.
function regroupRings(geometry) {
  const out = [];
  const pending = [];
  for (const rings of polysOf(geometry)) {
    const ext = [];
    const holes = [];
    for (const ring of rings) {
      const a = geoArea({ type: "Polygon", coordinates: [ring] });
      if (a < 2 * Math.PI) ext.push({ ring, area: a, holes: [] });
      else holes.push(ring);
    }
    if (ext.length === 1) ext[0].holes = holes;
    else pending.push(...holes);
    out.push(...ext);
  }
  const bySize = [...out].sort((x, y) => x.area - y.area);
  for (const hole of pending) {
    const step = Math.max(1, Math.floor((hole.length - 1) / 7));
    const probes = [];
    for (let i = 0; i < hole.length - 1; i += step) probes.push(hole[i]);
    let best = null;
    let bestHits = 0;
    for (const ex of bySize) {
      const hits = probes.filter((pt) => geoContains({ type: "Polygon", coordinates: [ex.ring] }, pt)).length;
      if (hits > bestHits) { best = ex; bestHits = hits; }
      if (hits === probes.length) break;
    }
    if (!best) return null;
    best.holes.push(hole);
  }
  return out.length ? asGeometry(out.map((ex) => [ex.ring, ...ex.holes])) : null;
}

// d3-geo: a polygon whose area exceeds a hemisphere is wound the wrong way round.
function rewind(geometry) {
  return asGeometry(polysOf(geometry).map((rings) => {
    if (geoArea({ type: "Polygon", coordinates: rings }) <= 2 * Math.PI) return rings;
    counters.rewound++;
    return rings.map((r) => [...r].reverse());
  }));
}

const features = feature(topo, topo.objects[name]).features.map((f) => {
  let geometry = f.geometry;
  if (touchesSeam(geometry)) {
    counters.seam++;
    const stitched = geoStitch({ type: "Feature", properties: {}, geometry }).geometry;
    const regrouped = stitched && stitched.coordinates.length ? regroupRings(stitched) : null;
    // geoStitch snaps seam latitudes to 1e-4°, which moves areas by ~1e-5 at most; anything
    // larger (or a polygon bigger than a hemisphere) means the stitch went wrong: keep the cut.
    const a0 = geoArea(geometry);
    const a1 = regrouped ? geoArea(regrouped) : -1;
    const sane = regrouped && polysOf(regrouped).every((rings) => geoArea({ type: "Polygon", coordinates: rings }) < 2 * Math.PI);
    if (sane && Math.abs(a1 - a0) <= 1e-10 + 1e-4 * a0) {
      geometry = regrouped;
      counters.stitched++;
    } else counters.reverted++;
  }
  return { type: "Feature", properties: f.properties, geometry: rewind(geometry) };
});

// Re-quantizing on the original grid is the identity for grid points.
const rebuilt = quantize(topology({ [name]: { type: "FeatureCollection", features } }), topo.transform);
delete rebuilt.bbox;
writeFileSync(outPath, JSON.stringify(rebuilt));
console.log(`  stitch ${name}: ${counters.seam} seam features, ${counters.stitched} stitched, `
  + `${counters.reverted} left as cut (area check), ${counters.rewound} rewound`);
