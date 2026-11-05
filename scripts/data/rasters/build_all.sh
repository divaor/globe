#!/usr/bin/env bash
# Rebuild every raster / climate layer from the inputs fetched by fetch_sources.sh.
#
#   SRC=/path/to/src WORK=/path/to/work PY=/path/to/venv/bin/python \
#   [PREVIEWS=/path/to/previews] scripts/data/rasters/build_all.sh
#
# PY must have numpy scipy netCDF4 pillow rasterio shapely (+ matplotlib for PREVIEWS).
# Node scripts use sharp, d3-geo and topojson-* from the repo's node_modules.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../../.." && pwd)
SRC=${SRC:?set SRC to the directory filled by fetch_sources.sh}
WORK=${WORK:?set WORK to a scratch directory}
PY=${PY:-python3}
OUT=$REPO/public/data
NE=$SRC/ne
GN=$SRC/pypi/geonamescache/data
mkdir -p "$WORK/meta" "$OUT/raster" "$OUT/layers"
run() { echo "+ ${*##*/}" | cut -c1-160; "$@"; }

echo "== basemaps"
run node "$HERE/build_basemaps.mjs" "$SRC/basemap" "$OUT/raster"

echo "== population / city lights"
run "$PY" -I "$HERE/build_population.py" "$GN/cities500.json" "$GN/countries.json" "$OUT/raster" "$WORK/meta"

echo "== SST, temperature, precipitation"
run "$PY" -I "$HERE/build_climate.py" --ersst "$SRC/nc/ersstv5.nc" \
  --t2m "$SRC/geocat/T2M_ERAINT_rectilinear_grid_2D.nc" --gpcp "$SRC/geocat/V22_GPCP.1979-2010.nc" \
  --land "$NE/ne_50m_land.geojson" --lakes "$NE/ne_50m_lakes.geojson" \
  --ice-shelves "$NE/ne_50m_antarctic_ice_shelves_polys.geojson" "$OUT/raster" "$WORK/meta"

echo "== Köppen"
run "$PY" -I "$HERE/koppen_classes.py" "$OUT/layers/koppen-classes.json"
run "$PY" -I "$HERE/koppen_raster.py" --mjs "$SRC/koppen/package/dist/index.mjs" \
  --land "$NE/ne_50m_land.geojson" --lakes "$NE/ne_50m_lakes.geojson" \
  --ice-shelves "$NE/ne_50m_antarctic_ice_shelves_polys.geojson" \
  --classes "$OUT/layers/koppen-classes.json" --png "$OUT/layers/koppen.png" --geojson "$WORK/koppen-fine.geojson"
run node --max-old-space-size=8000 "$HERE/koppen_topology.mjs" "$WORK/koppen-fine.geojson" \
  "$WORK/koppen-fine-areas.json" "$OUT/layers/koppen.json"
run "$PY" -I "$HERE/validate_koppen.py" "$OUT/layers/koppen.json" "$OUT/layers/koppen.png" "$OUT/layers/koppen-classes.json"

echo "== winds"
run "$PY" -I "$HERE/build_winds.py" "$SRC/nc/eraint_uvz.nc" "$OUT/layers/winds.json"

echo "== rasters.json"
run "$PY" -I "$HERE/write_metadata.py" "$OUT" "$WORK/meta"

if [ -n "${PREVIEWS:-}" ]; then
  echo "== previews -> $PREVIEWS"
  mkdir -p "$PREVIEWS"
  run node "$HERE/koppen_preview.mjs" "$OUT/layers/koppen.json" "$OUT/layers/koppen-classes.json" "$PREVIEWS"
  run "$PY" -I "$HERE/previews.py" "$OUT" "$PREVIEWS"
fi
du -sh "$OUT/raster"
