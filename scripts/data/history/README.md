# History data scripts

These scripts build `public/data/history/` (the political map through time) from
[aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps) (GPL-3.0). The output
format, the processing decisions and the known limitations are documented in
`public/data/history/SOURCES.md`.

| Script | Purpose |
| --- | --- |
| `build-history.mjs` | Full pipeline: snapshot TopoJSONs, `index.json`, `entities.json`, `changes.json`. |
| `check-history.mjs` | Validates the published folder. Exits 1 on errors; files over 250 KB only produce warnings. |
| `preview-history.mjs` | QA PNGs (equirectangular, optional orthographic view or bounding box) via d3-geo and sharp. |

They only use packages already in `package.json`: mapshaper, d3-geo, d3-geo-projection, d3-color,
topojson-client, topojson-server and sharp. Run them from the repository root with Node 20 or later.

## Re-run

```sh
# 1. Source data (a blob-less partial clone is enough; files are fetched on demand)
git clone --filter=blob:none --no-checkout https://github.com/aourednik/historical-basemaps.git /tmp/historical-basemaps

# 2. Build (about 45 s). Extracts geojson/ from HEAD and records the commit in index.json
node scripts/data/history/build-history.mjs --repo /tmp/historical-basemaps --work /tmp/history-work

#    ...or from a folder of world_*.geojson files (no commit recorded)
node scripts/data/history/build-history.mjs --src /path/to/geojson

# 3. Validate
node scripts/data/history/check-history.mjs

# 4. Optional previews
node scripts/data/history/preview-history.mjs --out /tmp/history-previews --years bc2000,100,1492,1914,2010
node scripts/data/history/preview-history.mjs --out /tmp/history-previews --years 2010 --ortho 175,62 --only true
node scripts/data/history/preview-history.mjs --out /tmp/history-previews --years 1815 --bbox -11,35,32,60 --only true
```

The build is deterministic: the same source gives byte-identical files. `--work` (default
`<tmpdir>/atlas-history-build`) receives the extracted sources and `build-report.json`, which holds per-snapshot
statistics:
- sliver and spike counts;
- simplification interval and file size;
- duplicates dropped, names fixed, entities that vanished;
- the colour-conflict list.

Options of `build-history.mjs` (defaults in brackets):

| Option | Meaning |
| --- | --- |
| `--out dir` | Output folder [`public/data/history`]. |
| `--only bc500,1492` | Process only some snapshots. Debugging only: colours, `entities.json` and `changes.json` are then computed from that subset, so do not publish the result. |
| `--interval-km n` | Starting simplification resolution [4]. |
| `--max-interval-km n` | Coarsest allowed resolution [10]. |
| `--target-kb n` | Per-file size the interval is raised for [230]. world_1492 stays above it at the 10 km cap. |
| `--sliver-km2 n` | Merge non-largest parts under this area into a neighbour [300]; 0 disables. |
| `--near-km n` | Distance within which non-touching entities should also differ in colour [150]; 0 disables. |

## Pipeline (per snapshot, then global)

1. **Normalise attributes.**
   - Trim, merge case variants, drop junk values, fix a few mojibake strings.
   - SUBJECTO serves as a fallback name.
   - Explicit fixes are listed in `NAME_FIXES` (Switzerland 1994–2010, New Zealand in 5000 BC) and `PART_FIXES` (Corsica 1914).
   - `WATER_NAMES` lists lakes to drop.
   - Missing BORDERPRECISION takes the snapshot's most common value.
2. **Drop near-duplicate named polygons.** Measured with a mapshaper `-mosaic`; the later feature in the file is
   kept.
3. **mapshaper pass 1:** sort (named first, then smaller first), `-clean overlap-rule=min-id`, then
   `-dissolve n,s,p,pr`.
4. **Sliver elimination** on the topology, then dissolve again.
5. **mapshaper pass 2:** `-simplify weighted keep-shapes interval=…` and TopoJSON output at quantization 1e5.
   - `fix-geometry` is deliberately not used: it writes non-integer quantized coordinates, and rounding them
     later flips tiny spike rings into inverted, hemisphere-sized polygons.
6. **Ring repair** (spikes, degenerate rings, winding by spherical area), `geoStitch` with an area check and ring
   regrouping, then a topology rebuild (topojson-server) quantized on mapshaper's original grid. Repeated until
   the decoded result is clean.
7. **Global steps:**
   - Areas and shared-border lengths per entity.
   - Proximity (vertices within 150 km).
   - Greedy colouring over all snapshots plus local search.
   - Writing all files.

To add a source fix, extend `TEXT_FIXES`, `WATER_NAMES`, `NAME_FIXES` or `PART_FIXES` in `build-history.mjs` and document it in
`SOURCES.md`.
