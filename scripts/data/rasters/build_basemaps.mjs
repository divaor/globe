#!/usr/bin/env node
// Resample the equirectangular basemap JPEGs (matplotlib/basemap data package)
// to power-of-two sizes for the WebGL globe. Lanczos3, JPEG q85, baseline.
// Usage: node build_basemaps.mjs SRC_DIR OUT_DIR
import path from "node:path";
import sharp from "sharp";

const [srcDir, outDir] = process.argv.slice(2);
const jobs = [
  ["bmng.jpg", "bluemarble-4k.jpg", 4096, 2048],
  ["bmng.jpg", "bluemarble-2k.jpg", 2048, 1024],
  ["shadedrelief.jpg", "relief-8k.jpg", 8192, 4096],
  ["shadedrelief.jpg", "relief-4k.jpg", 4096, 2048],
  ["etopo1.jpg", "etopo-4k.jpg", 4096, 2048],
];
sharp.cache(false);
for (const [src, dst, w, h] of jobs) {
  const input = path.join(srcDir, src);
  const meta = await sharp(input).metadata();
  if (meta.width !== 2 * meta.height) throw new Error(`${src} is not 2:1 (${meta.width}x${meta.height})`);
  const info = await sharp(input, { limitInputPixels: false })
    .resize(w, h, { kernel: "lanczos3", fit: "fill" })
    .toColourspace("srgb")
    .jpeg({ quality: 85, progressive: false, mozjpeg: false, chromaSubsampling: "4:2:0" })
    .toFile(path.join(outDir, dst));
  console.log(`${src} ${meta.width}x${meta.height} -> ${dst} ${info.width}x${info.height} ${(info.size / 1048576).toFixed(2)} MiB`);
}
