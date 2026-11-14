#!/usr/bin/env bash
# Downloads the sources of the sky (v0.21.0) into a folder (default: ./sky-src):
#   - d3-celestial's data (BSD 3-clause, Olaf Frohn): stars to magnitude 6.5 (XHIP), star names, the 88 constellations
#     with their lines, borders and names, the Messier objects and bright deep-sky objects;
#   - ESO's Milky Way panorama (ESO/S. Brunier, CC BY 4.0): the whole sky in galactic coordinates, 6000 x 3000.
# Then:  node scripts/data/sky/build-sky.mjs <folder>
set -euo pipefail
OUT="${1:-sky-src}"
mkdir -p "$OUT"
cd "$OUT"
BASE=https://raw.githubusercontent.com/ofrohn/d3-celestial/master
for f in LICENSE data/stars.6.json data/starnames.json data/constellations.json data/constellations.lines.json \
         data/constellations.borders.json data/constellations.bounds.json data/messier.json data/dsos.bright.json; do
  [ -s "$(basename "$f")" ] || curl -sS -f --retry 3 -o "$(basename "$f")" "$BASE/$f"
done
[ -s eso0932a.jpg ] || curl -sS -f --retry 3 -A 'Mozilla/5.0 (compatible; atlas-globe-data)' -o eso0932a.jpg https://cdn.eso.org/images/large/eso0932a.jpg
ls -la
