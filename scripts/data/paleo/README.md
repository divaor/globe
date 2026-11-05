# Paleo data scripts

These scripts build `public/data/paleo/`, the data for the "Pangea to modern continents" animation. The source is
the Merdith et al. (2021) plate model (1000–0 Ma, CC BY 4.0). The output format, the processing decisions and the
known limitations are documented in `public/data/paleo/SOURCES.md`.

| Script | Purpose |
| --- | --- |
| `fetch_sources.sh` | Fetches the model files from the GPlates web service repository on GitHub at a pinned commit, using a blob-less partial clone. |
| `build_paleo.py` | Full pipeline: `paleo-coastlines.json`, `paleo-continents.json` and `paleo-rotations.json`. It then verifies the rotations against pygplates every 0.1 Myr. |
| `stitch_paleo.mjs` | Called by `build_paleo.py`. It stitches the ±180° and pole cuts, checks d3-geo winding and rebuilds the topology. |
| `build_timescale.py` | Writes `timescale.json` from the table inside the script (ICS chart v2023/09, ages, colours, events in en/es). |
| `check_paleo.mjs` | Checks the published folder using **only the output files**: schema, d3 winding, unit and sign-consistent quaternions. It renders equirectangular and orthographic PNG previews the way the browser would (slerp, rotation, d3-geo, sharp). |
| `compare_pygplates.py` | End-to-end accuracy test. Points inside the output polygons are reconstructed from the shipped quaternions and compared with pygplates using the original source plate ids. |

## Requirements

- git.
- Node 20 or later with the repository's devDependencies (`npm install`). The scripts use mapshaper,
  topojson-server, topojson-client, d3-geo, d3-geo-projection and sharp, which are all in `package.json` already.
- Python 3.10 or later with `pygplates`, `numpy` and `shapely` from PyPI. Tested with Python 3.13, pygplates 1.0.0,
  numpy 2.5.4 and shapely 2.2.0. Install them in a virtualenv outside the repository.

## Re-run

Run from the repository root:

```sh
# 1. Source files (about 5 MB, written into an empty folder)
scripts/data/paleo/fetch_sources.sh /tmp/paleo-src

# 2. Python environment
python3 -m venv /tmp/paleo-venv
/tmp/paleo-venv/bin/pip install pygplates numpy shapely

# 3. Build (about 70 s). -I stops Python from importing modules from the data folder.
/tmp/paleo-venv/bin/python -I scripts/data/paleo/build_paleo.py \
    --src /tmp/paleo-src --out public/data/paleo --work /tmp/paleo-work
python3 -I scripts/data/paleo/build_timescale.py --out public/data/paleo

# 4. Validate and preview (default times 0 66 150 200 250 300 600 1000 Ma)
node scripts/data/paleo/check_paleo.mjs public/data/paleo /tmp/paleo-previews
node scripts/data/paleo/check_paleo.mjs public/data/paleo /tmp/paleo-previews 250 0   # chosen times

# 5. Optional: end-to-end comparison with pygplates
/tmp/paleo-venv/bin/python -I scripts/data/paleo/compare_pygplates.py \
    --src /tmp/paleo-src --data public/data/paleo
```

The build is deterministic: the same sources give byte-identical files.

### Build log

The build log reports:
- the data fixes;
- how many plate ids share rotation tracks;
- mapshaper's statistics, then the stitching and winding results for each layer;
- the number of keyframes and a verification summary (also saved as `verify.json` in `--work`).

The summary gives the maximum slerp error and the model's own rotation discontinuities. `--work` also keeps the
dissolved, unsimplified GeoJSON of both layers.

`check_paleo.mjs` prints `schema/consistency: OK` or a list of problems. It writes `paleo-<t>Ma.png`
(equirectangular) and `paleo-<t>Ma-globe.png` (two orthographic hemispheres with coastline outlines).

### Options of `build_paleo.py`

| Option | Default | Effect |
| --- | --- | --- |
| `--tolerance` | `0.25` | Maximum slerp error in degrees. It sets the number of keyframes and therefore the size of `paleo-rotations.json`. |
| `--tolerance-deep`, `--deep-after` | `= --tolerance`, `541` | Coarser tolerance before the given age. 0.5° before 541 Ma only saves about 30 KB. |
| `--coast-interval`, `--coast-min-island` | `4km`, `40km2` | mapshaper simplification interval and smallest detached island for the coastlines. |
| `--cont-interval`, `--cont-min-island` | `9km`, `150km2` | The same for the continental crust layer. |
| `--mapshaper`, `--node` | repo `node_modules/.bin/mapshaper`, `node` | Tool paths. |
