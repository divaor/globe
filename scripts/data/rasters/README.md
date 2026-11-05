# Raster and climate layer builders

These scripts build the globe's draped rasters in `public/data/raster/` and the
climate layers in `public/data/layers/`: `koppen.json`, `koppen.png`,
`koppen-classes.json` and `winds.json`. Every raster is equirectangular: x runs
from longitude −180 to 180, y from latitude 90 to −90, with pixel-edge
registration. Sources and licences are listed in
`public/data/raster/SOURCES.md`, and per-file encodings in
`public/data/raster/rasters.json`.

## Re-running

```sh
# 1. inputs (~60 MB) into a NEW empty directory; GitHub raw, npm and PyPI only
scripts/data/rasters/fetch_sources.sh /tmp/raster-src

# 2. a Python environment (system numpy/Pillow are not enough)
python3 -m venv /tmp/raster-venv
/tmp/raster-venv/bin/pip install numpy scipy netCDF4 pillow rasterio shapely matplotlib

# 3. build everything (~40 s); PREVIEWS is optional
SRC=/tmp/raster-src WORK=/tmp/raster-work PY=/tmp/raster-venv/bin/python \
PREVIEWS=/tmp/raster-previews scripts/data/rasters/build_all.sh
```

Python always runs with `-I`, so nothing is imported from the data or working
directories. The Node scripts use `sharp`, `d3-geo`, `topojson-server`,
`topojson-simplify` and `topojson-client` from the repo's `node_modules`. The
build is deterministic: running it twice gives byte-identical files.

## Scripts

| Script | Output |
|---|---|
| `fetch_sources.sh` | Downloads every input: basemap JPEGs, ERSST/ERA-Interim/GPCP netCDF, Natural Earth 50m land, lakes and ice shelves, the Köppen npm package, and the geonamescache wheel (unzipped, not installed). |
| `build_basemaps.mjs` | Lanczos3 resampling of the three basemap images to `bluemarble-4k/2k.jpg`, `relief-8k/4k.jpg` and `etopo-4k.jpg` (q85, baseline). |
| `build_population.py` | `population.png` and `citylights.png`: kernel density on the sphere of GeoNames places, plus each country's unlisted remainder (see SOURCES.md). |
| `build_climate.py` | `sst.png` (ERSST v5, 1991–2020), `temperature.png` (ERA-Interim 2 m, 2005) and `precipitation.png` (GPCP v2.2, 1981–2010, log), all 1440×720, 8-bit. |
| `koppen_classes.py` | `koppen-classes.json`: Beck et al. (2018) colours, en/es names and descriptions, biome mapping. |
| `koppen_raster.py` | `koppen.png` (the native 0.5° grid), plus a smoothed ×8 class raster polygonised to an intermediate GeoJSON. Smoothing works on per-class indicators: Gaussian σ = 0.4 cell, then bilinear ×8, then arg-max. Classes are extended 1.5° offshore and clipped to Natural Earth land plus ice shelves, minus large lakes. |
| `koppen_topology.mjs` | `koppen.json` (TopoJSON). See the steps below. |
| `validate_koppen.py` | Independent shapely check: no invalid polygons, no overlaps, every class present, each grid cell's class matches `koppen.png`. |
| `build_winds.py` | `winds.json`: ERA-Interim 850 hPa u/v for January and July, 2° grid, 0.1 m/s. |
| `write_metadata.py` | `rasters.json`, built from the static basemap entries and the fragments written by the build scripts. |
| `koppen_preview.mjs`, `previews.py` | PNG previews for checking: d3-geo renders of `koppen.json` (equirectangular and orthographic views of the Pacific, the poles and Europe), a contact sheet of every raster, and wind streamlines. |

`koppen_topology.mjs` builds the TopoJSON in these steps:

1. Builds a shared-arc topology.
2. Simplifies it with Visvalingam using spherical areas, pinning corners on ±180° and the poles.
3. Applies Chaikin smoothing twice.
4. Detects arc crossings and relaxes any offending arc.
5. Drops detached specks under 150 km².
6. Densifies east-west edges to 1° or less.
7. Quantises to 1e5.

It then checks every feature with `d3.geoArea` against its pixel area and fails
if any feature is a hemisphere or larger.

## Notes for the app

- **Gray PNGs:** 0 always means no data, land (in `sst.png`) or below the floor (in `population.png` and `citylights.png`).
  - Linear decode: `x = min + (v − 1)/254·(max − min)`.
  - Log decode: `x = 10^(log10 min + (v − 1)/254·(log10 max − log10 min))`.
- **`koppen.json`:** exterior rings are clockwise and holes anticlockwise (d3-geo's spherical convention). Every class is a single MultiPolygon feature with `properties.k`.
  - Polygons are split at the antimeridian, so the arcs that lie exactly on lon = ±180° are artificial. Exclude them when stroking coastlines or borders, for example by filtering mesh arcs whose points all have |lon| = 180.
  - The bottom edge of Antarctica runs along lat −90.
  - The class colours match `koppen.png` exactly.
- **`winds.json`:** values are row-major from north to south. `u[j*nx + i]` sits at `lon = lon0 + i*dx` and `lat = lat0 − j*dy` (`dy` is positive). Units are m/s. 850 hPa is below ground over Tibet, the Andes, Greenland and Antarctica, where the reanalysis values are extrapolated.
