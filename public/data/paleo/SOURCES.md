# Paleogeography data (Pangea animation)

Data for the "Pangea to modern continents" animation: present-day coastline and continental-crust polygons, each
tagged with the tectonic plate that carries it, plus keyframed plate rotations from 1000 Ma (Rodinia) to today, and
the geologic time scale for the slider.

## Source and licence

- **Plate model:** Merdith, A. S., Williams, S. E., Collins, A. S., Tetley, M. G., Mulder, J. A., Blades, M. L.,
  Young, A., Armistead, S. E., Cannon, J., Zahirovic, S., Müller, R. D. (2021). *Extending full-plate tectonic models
  into deep time: Linking the Neoproterozoic and the Phanerozoic.* Earth-Science Reviews, 214, 103477.
  https://doi.org/10.1016/j.earscirev.2020.103477. Model data: https://doi.org/10.5281/zenodo.10346399.
  It is a full-plate model for 1000–0 Ma in a purely palaeomagnetic reference frame (Tetley 2018). It compiles
  Domeier (2016, 2018), Merdith et al. (2017) and Young et al. (2019).
- **Licence:** CC BY 4.0. The files in this folder are a modified version of the model data: features were selected,
  dissolved, simplified, stitched and converted to TopoJSON, and rotations were resampled as quaternions. Data
  fixes are listed below. They are distributed under the same licence.
- **Files used:** the copy in the GPlates web service repository
  ([GPlates/gplates-web-service](https://github.com/GPlates/gplates-web-service), commit `94fc960`, 27 October 2026),
  folder `django/GWS/data/deprecated/MODELS/MERDITH2021/`:

  | File | SHA-256 |
  | --- | --- |
  | `1000_0_rotfile_Merdith_et_al.rot` | `ffee2bcffb99b5fe8600a8b96635b01a8e8cf243e188b49a9f32cd42134e25da` |
  | `shapes_coastlines_Merdith_et_al_v2.gpmlz` | `e57285e77c96b2f40926c652b10d832f24933d214cdf1ce8ca40ff9f89d7e01a` |
  | `shapes_static_polygons_Merdith_et_al.gpmlz` | `e79daa6aa99bbcf2db018f072a5738781c6b5b672d279a1583ab6a4456f06ac3` |

- **Attribution to show in the app:** "Plate reconstruction: Merdith et al. (2021), Earth-Science Reviews 214,
  103477 (CC BY 4.0), via GPlates". Link it to https://doi.org/10.1016/j.earscirev.2020.103477.
- **Time scale (`timescale.json`):** the boundary ages come from the ICS International Chronostratigraphic Chart
  v2023/09 (Cohen, K. M., Finney, S. C., Gibbard, P. L., Fan, J.-X. (2013; updated). *The ICS International
  Chronostratigraphic Chart.* Episodes 36: 199–204). The colours are the chart's official CCGM/CGMW colours. The
  events are short, widely accepted milestones with approximate ages, compiled for this app.

The generating scripts are in `scripts/data/paleo/` (see the README there).

## Files

| File | Size (gzip) | Content |
| --- | --- | --- |
| `paleo-coastlines.json` | 430 KB (145 KB) | TopoJSON. Object `coastlines`: 423 features, 38.8k points. |
| `paleo-continents.json` | 173 KB (59 KB) | TopoJSON. Object `continents`: 403 features of continental crust (shelves included). |
| `paleo-rotations.json` | 1.27 MiB (290 KB) | 216 keyframes × 259 rotation tracks (unit quaternions). |
| `timescale.json` | 6 KB | Eons, eras, periods and Cenozoic epochs from 1000 Ma, plus 25 events (en/es). |

### `paleo-coastlines.json`, `paleo-continents.json`

- These are quantized TopoJSON files (quantization 1e5, delta-encoded arcs). Each holds exactly one object
  (`coastlines` or `continents`), a `GeometryCollection` of `Polygon`/`MultiPolygon` geometries.
- Coordinates are present-day longitude/latitude. Rings are wound for d3-geo: exterior rings clockwise, holes
  counter-clockwise. Every polygon was checked with `d3.geoArea` (< 2π).
- Cuts along ±180° and at the poles are stitched (`geoStitch`, as in `world-atlas`), so no seam shows once a plate
  is rotated away from the antimeridian. As a consequence, a few rings jump from +180 to −180: north-east Siberia
  and Wrangel Island, the Chukchi shelf, Fiji, the Tonga–Kermadec ridges, the Campbell Plateau, the Ross Sea sector
  of Antarctica, and East Antarctica around the pole. Spherical d3-geo handles this; planar algorithms on raw
  coordinates do not.
- Neighbouring pieces share arcs. Pieces on different plates touch at present day but drift apart in the past.
  - **Fill:** draw a whole layer as one path and fill it once. Filling each piece separately leaves anti-aliasing
    hairlines between neighbours.
  - **Coastline stroke:** use, for each feature, only the arcs that no other feature uses (an arc used twice is an
    internal plate boundary). Rotate them with the feature's plate. `scripts/data/paleo/check_paleo.mjs`
    (`outlines()`) shows how.
- `continents` are the static polygons of the model minus oceanic crust. Draw them under `coastlines` as a lighter
  "shelf" colour. They close the gaps of the Pangea fit (continental margins, Zealandia, the Arctic shelves).

Properties (all features have all three):

| Key | Type | Meaning |
| --- | --- | --- |
| `p` | integer | Rotation track. It is a key of `plates` in `paleo-rotations.json` (look it up as a string). |
| `b` | number, Ma | Appearance age. **4000** means present over the whole 1000 Ma range. |
| `e` | number, Ma | End age. It is always 0 except for one tiny feature in each layer (`e = 400`). |

**Show a feature at time `t` only when `e <= t <= b`.** Features are hidden before they appear. For
example, oceanic islands appear with the oceanic crust they sit on, and accreted terranes appear when the model
starts to carry them. At 1000 Ma 54 of 423 coastline features are visible, at 250 Ma 255, and at 0 Ma 422 (all
but the one with `e = 400`).

- **Nine coastline pieces have `b = 0`.** They sit on the youngest oceanic crust, so they show only at exactly
  0 Ma. They include about 42 % of Iceland (its rift zone), Jan Mayen and the western Azores. Older age bands of
  Iceland disappear step by step as the slider moves back.
- **`b` is also clipped to the oldest time at which the plate has a rotation.** Five features were clipped.

**About `p`:** the model has 438 plate ids in these two layers, but only 259 distinct rotation histories. Some
plate ids have the same total rotation as another plate (to < 0.0001°) at every time when their features are
visible. Those share the other plate's track, and their features carry that plate's id in `p`. For example, the
features of plate 4012 use track `401`. Pieces with the same `p`, `b` and `e` were dissolved into one feature.

### `paleo-rotations.json`

```json
{ "model": "Merdith et al. 2021", "citation": "…", "license": "CC BY 4.0", "source": "…", "anchor": 0, "note": "…",
  "times": [0, 1.2, 2.5, …, 971.5, 1000],
  "plates": { "101": [w,x,y,z, w,x,y,z, …], … } }
```

- `times` are in Ma, ascending and **non-uniform**: 216 keyframes, 0.3–31.5 Myr apart. The median step is
  1.45 Myr for 0–66 Ma, 3 Myr for 66–252 Ma, 3.5 Myr for 252–541 Ma and 8.75 Myr before 541 Ma. Find the interval
  with a binary search.
- `plates[id]` is a flat array of `4 × times.length` numbers: one unit quaternion `[w, x, y, z]` per keyframe
  (5 decimals). It is the total rotation of that plate relative to anchor plate 0 (the palaeomagnetic frame) at that
  time.
- **Rotation:** with `P = (cos lat cos lon, cos lat sin lon, sin lat)`, the reconstructed position is
  `P_t = q P q⁻¹`. Consecutive quaternions have a non-negative dot product, so plain slerp takes the short way.
  Renormalise after slerp, because 5-decimal rounding leaves `|q|` within 2e-5 of 1.

  ```js
  function quatAt(rot, p, t) {            // rot = paleo-rotations.json, p = feature property
    const T = rot.times, q = rot.plates[p], n = T.length;
    if (t <= T[0]) return q.slice(0, 4);
    if (t >= T[n - 1]) return q.slice(4 * n - 4);
    let i = 0, j = n - 1;
    while (j - i > 1) { const m = (i + j) >> 1; if (T[m] <= t) i = m; else j = m; }
    const f = (t - T[i]) / (T[j] - T[i]), a = q.slice(4 * i, 4 * i + 4), b = q.slice(4 * j, 4 * j + 4);
    const d = Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
    const th = Math.acos(d), s = Math.sin(th);
    const wa = s < 1e-9 ? 1 - f : Math.sin((1 - f) * th) / s, wb = s < 1e-9 ? f : Math.sin(f * th) / s;
    const r = a.map((v, k) => wa * v + wb * b[k]), len = Math.hypot(...r);
    return r.map((v) => v / len);
  }
  // rotate [lon, lat] (degrees): v' = v + 2w(u×v) + 2u×(u×v), u = (x, y, z)
  ```

- **Accuracy.** Slerp between keyframes stays within **0.25°** of the pygplates reconstruction. This was measured
  as the largest displacement of each plate's own outline points, every 0.1 Myr, over the time when the plate's
  features are visible. The mean error is 0.012°.
  - An end-to-end test took 564 points inside the output coastline polygons and compared them with
    `RotationModel.get_rotation()` of the original source plate (298 plate ids). The maximum error was 0.242°.
  - The model itself has a few **discontinuities**, where some plates jump at the join between the compiled
    models. The jump is reproduced within ≤ 0.5 Myr of the knot. Times are in Ma, followed by the largest jump among
    visible plates:

    | Ma | Jump | Ma | Jump | Ma | Jump | Ma | Jump |
    | --- | --- | --- | --- | --- | --- | --- | --- |
    | 85 | 0.9° | 86 | 1.3° | 100 | 6.6° | 115 | 8.0° |
    | 250 | 8.3° | 270 | 1.3° | 360 | 1.0° | 410 | 8.5° |
    | 430 | 0.9° | 520 | 2.1° | 530 | 2.2° | 600 | 3.0° |
    | 780 | 2.0° | 900 | 0.1° | | | | |

    250 Ma (Iberia and the western Mediterranean blocks) and 410 Ma are the visible ones.
- **Padding:** when a plate's features have all disappeared, its entries are the identity quaternion. This applies
  from the second keyframe older than the plate's largest `b`. They must not be drawn. This keeps the file about
  25 % smaller.

### `timescale.json`

```json
{ "source": "…",
  "units": [ { "rank": "eon|era|period|epoch", "name_en": "…", "name_es": "…", "start": 538.8, "end": 0, "color": "#9AD9DD" }, … ],
  "events": [ { "ma": 251.9, "en": "…", "es": "…" }, … ] }
```

- Ages are in Ma, with `start` older than `end`.
- The ranks are 2 eons, 4 eras, 15 periods (Tonian to Quaternary) and 7 Cenozoic epochs.
- `start` is the true boundary age. The Proterozoic starts at 2500 Ma, so clip it to the slider range (1000 Ma).
- There are 25 events, from Rodinia (1000 Ma) to *Homo sapiens* (0.3 Ma).

## How the files were built

`scripts/data/paleo/build_paleo.py` uses pygplates 1.0, shapely, mapshaper 0.7 and Node:

1. **Features.** All 2136 features of `shapes_coastlines_Merdith_et_al_v2` were read. These are the present-day
   coastlines cut by the static polygons, valid back to 1000 Ma. The older v1 coastline file stops at about 410 Ma.
   From `shapes_static_polygons_Merdith_et_al`, the 847 polygons that are not oceanic crust (`gpml:Basin`) were
   read. Two Basin polygons with ages of 410 and 600 Ma were also kept: one on the East Greenland margin and one
   small one south of Java.
2. **Data fixes.** Five continental features have placeholder `FROMAGE = 0`: Benue Trough (2 parts), Ahnet and
   Barghot in Africa, and the North Bismarck arc. They would vanish at any `t > 0` and leave holes in Africa, so they
   are treated as always present.
3. **Rotations.** Every plate was sampled with pygplates every 0.5 Myr and at every knot of the rotation file.
   Each feature's appearance age was clipped to its plate's rotation coverage. Identical tracks were merged
   (see `p` above).
4. **Geometry.**
   - Edges longer than 0.5° were densified along great circles, because GPlates edges are geodesic.
   - Pieces with equal `p`, `b` and `e` were dissolved with shapely.
   - mapshaper dropped detached islands under 40 km² (coastlines) or 150 km² (continents). It simplified with
     weighted Visvalingam on the sphere (interval 4 km and 9 km, `keep-shapes`) and quantized at 1e5.
   - `stitch_paleo.mjs` stitched the ±180° and pole cuts, checked the winding with d3-geo and rebuilt the topology
     on the same grid.
5. **Keyframes.** Keyframes were chosen greedily among the sample times. Each interval is stretched as far as
   possible while slerp stays within 0.25° for every visible plate, measured on 32 well-spread outline points per
   plate. The output was then verified against pygplates every 0.1 Myr.
6. **Checks.**
   - `check_paleo.mjs` reads only these files and renders them with d3-geo as the browser would (equirectangular
     and orthographic). The previews were inspected at 0, 66, 150, 200, 250, 300, 600 and 1000 Ma: 0 Ma matches
     today's map, and 250 Ma is a single Pangea.
   - `compare_pygplates.py` is the end-to-end test against pygplates.

## Known limitations

- **Present-day shapes.** These are present-day coastlines moved by plate motion, not palaeo-shorelines. Sea level,
  mountain building, rift stretching and lost crust are not modelled. Overlaps and gaps between pieces at old times
  are those of the model.
- **Longitude.** The reference frame is palaeomagnetic, so palaeolongitude is not constrained by data, especially
  before Pangea. The model README also warns that Pacific plates between 250 and 83 Ma are only placed relative to
  Africa.
- **Deep time.** Before about 410 Ma many younger terranes are hidden, and Rodinia at 1000 Ma consists of the cratons
  that existed then.
