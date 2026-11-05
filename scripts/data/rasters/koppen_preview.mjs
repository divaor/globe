#!/usr/bin/env node
// Render koppen.json with d3-geo into PNG previews (SVG -> sharp) to check that
// the polygons draw correctly on the sphere: winding, antimeridian, poles.
// Usage: node koppen_preview.mjs koppen.json koppen-classes.json OUT_DIR
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { feature } from "topojson-client";
import { geoPath, geoEquirectangular, geoOrthographic, geoGraticule10 } from "d3-geo";

const [topoPath, classesPath, outDir] = process.argv.slice(2);
const topo = JSON.parse(fs.readFileSync(topoPath, "utf8"));
const legend = JSON.parse(fs.readFileSync(classesPath, "utf8"));
const fc = feature(topo, topo.objects.koppen);

async function render(name, projection, w, h, { stroke = false } = {}) {
  const p = geoPath(projection);
  const paths = fc.features
    .map((f) => `<path d="${p(f)}" fill="${legend[f.properties.k].color}" fill-rule="evenodd"${stroke ? ' stroke="#000" stroke-width="0.4" stroke-opacity="0.6"' : ""}/>`)
    .join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<rect width="100%" height="100%" fill="#000"/>
<path d="${p({ type: "Sphere" })}" fill="#14284a"/>
${paths}
<path d="${p(geoGraticule10())}" fill="none" stroke="#fff" stroke-opacity="0.25" stroke-width="0.5"/>
</svg>`;
  const out = path.join(outDir, name);
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log("wrote", out);
}

const W = 1440, H = 720;
await render("koppen-d3-equirect.png", geoEquirectangular().fitExtent([[0, 0], [W, H]], { type: "Sphere" }), W, H);
await render("koppen-d3-ortho-pacific.png", geoOrthographic().rotate([-180, -20]).fitExtent([[10, 10], [790, 790]], { type: "Sphere" }), 800, 800, { stroke: true });
await render("koppen-d3-ortho-southpole.png", geoOrthographic().rotate([0, 90]).fitExtent([[10, 10], [790, 790]], { type: "Sphere" }), 800, 800);
await render("koppen-d3-ortho-northpole.png", geoOrthographic().rotate([0, -90]).fitExtent([[10, 10], [790, 790]], { type: "Sphere" }), 800, 800);
await render("koppen-d3-ortho-europe.png", geoOrthographic().rotate([-15, -45]).fitExtent([[10, 10], [790, 790]], { type: "Sphere" }), 800, 800);
await render("koppen-d3-ortho-chukotka.png", geoOrthographic().rotate([-178, -64]).scale(1800).translate([400, 400]), 800, 800, { stroke: true });
