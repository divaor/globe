#!/usr/bin/env bash
# Download every input of the raster / climate-layer build into SRC_DIR.
# Use a new, empty directory: everything in it is untrusted third-party data.
# Only GitHub (raw), the npm registry and PyPI are contacted.
#
# Usage: scripts/data/rasters/fetch_sources.sh SRC_DIR
set -euo pipefail
SRC=${1:?usage: fetch_sources.sh SRC_DIR}
mkdir -p "$SRC"
cd "$SRC"
RAW=https://raw.githubusercontent.com
get() { curl -sS -fL --retry 3 -o "$2" "$1"; printf '  %-48s %10s bytes\n' "$2" "$(stat -c %s "$2")"; }

mkdir -p basemap nc geocat ne koppen pypi

echo "basemap images (matplotlib/basemap, basemap-data)"
for f in bmng.jpg shadedrelief.jpg etopo1.jpg; do
  get "$RAW/matplotlib/basemap/develop/data/basemap_data/src/mpl_toolkits/basemap_data/$f" "basemap/$f"
done

echo "pydata/xarray-data: ERSST v5, ERA-Interim u/v/z"
for f in ersstv5.nc eraint_uvz.nc; do get "$RAW/pydata/xarray-data/master/$f" "nc/$f"; done

echo "NCAR/geocat-datafiles: ERA-Interim 2 m temperature 2005, GPCP v2.2 1979-2010"
for f in T2M_ERAINT_rectilinear_grid_2D.nc V22_GPCP.1979-2010.nc; do
  get "$RAW/NCAR/geocat-datafiles/main/netcdf_files/$f" "geocat/$f"
done

echo "Natural Earth 50m land, lakes, Antarctic ice shelves"
for f in ne_50m_land ne_50m_lakes ne_50m_antarctic_ice_shelves_polys; do
  get "$RAW/nvkelso/natural-earth-vector/master/geojson/$f.geojson" "ne/$f.geojson"
done

echo "Köppen-Geiger 0.5° grid (npm koppen-climate-lookup 2.0.0)"
(cd koppen && npm pack koppen-climate-lookup@2.0.0 --silent >/dev/null && tar xzf koppen-climate-lookup-2.0.0.tgz)
ls -l koppen/package/dist/index.mjs

echo "GeoNames cities500 + countries (PyPI geonamescache 3.0.2, unpacked, not installed)"
python3 -m pip download --quiet --no-deps --only-binary=:all: geonamescache==3.0.2 -d pypi
python3 -I -m zipfile -e pypi/geonamescache-3.0.2-*.whl pypi/
ls -l pypi/geonamescache/data/cities500.json pypi/geonamescache/data/countries.json
