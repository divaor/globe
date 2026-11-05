# Historical political map data

Data for the "political map through time" view: 54 world snapshots from 123,000 BC to AD 2010.

## Source and licence

- **Source:** [historical-basemaps](https://github.com/aourednik/historical-basemaps) by André Ourednik and
  contributors, files `geojson/world_*.geojson`, commit `4b5039e` (2 November 2026). The project credits part of
  its original material to anonymous students of the ThinkQuest team C006628.
- **Licence:** GNU General Public License v3.0 (GPL-3.0). The files in this folder are a modified version of the
  source (re-attributed, cleaned, simplified, converted to TopoJSON). They are distributed under the same licence.
  The generating scripts are in `scripts/data/history/`.
- **Attribution to show in the app:** "Historical borders: historical-basemaps © André Ourednik and contributors
  (GPL-3.0)", linking to https://github.com/aourednik/historical-basemaps.

The upstream README calls the data "work in progress". Its maps should be checked against other sources before
any academic use.

## Files

| File | Content |
| --- | --- |
| `world_<year>.json` | One TopoJSON per snapshot, e.g. `world_1880.json` or `world_bc500.json` (BC years carry a `bc` prefix). |
| `index.json` | Snapshot list. |
| `entities.json` | Stable colour index and lifespan for each entity name. |
| `changes.json` | Differences between consecutive snapshots. |

### `world_<year>.json`

- A quantized TopoJSON (`transform` set, quantization 1e5, integer delta-encoded arcs).
- It holds exactly one object, `world`, a `GeometryCollection` of `Polygon`/`MultiPolygon` geometries.
- Neighbours share arcs. Borders can therefore be drawn as a mesh:
  - Internal borders: `topojson.mesh(t, t.objects.world, (a, b) => a !== b)`.
  - Coastlines: `(a, b) => a === b`.
- There are no overlaps and no gaps wider than the cleaning tolerance.

Properties (absent keys mean "none"):

| Key | Type | Meaning |
| --- | --- | --- |
| `n` | string | Entity name (source `NAME`). Missing on land that the source attributes to no polity ("unclaimed" land, e.g. most of the Sahara in 1492, Antarctica). |
| `s` | string | Sovereign or colonial power (source `SUBJECTO`), only when it differs from `n`. |
| `p` | string | Larger cultural or political unit (source `PARTOF`), only when it differs from `n`. |
| `pr` | 1, 2, 3 | Border precision (source `BORDERPRECISION`). 1 = approximate, 2 = moderately precise, 3 = determined by international law. It is always present. A missing or `0` value takes the snapshot's most common value (18 features). Snapshots up to 1600 are almost entirely 1; from 1650 on they are almost entirely 3 (1878 and 1880 also contain two features with 2). |
| `c` | 0–23 | Colour index; present only when `n` is present. It is the same for a given name in every snapshot. |

An entity is usually one feature. A name can occur on several features when they differ in `s`, `p` or `pr`.
Mesh filters that compare entities should therefore compare `n`, not the feature objects.

Coordinates are longitude/latitude (WGS 84). Rings are wound for d3-geo: exterior rings clockwise, holes
counter-clockwise. Polygons crossing ±180°, and Antarctica around the South Pole, are stitched (as in
`world-atlas`), so no cut line shows along the antimeridian or at the pole on a globe. A consequence: a few rings
(Russia/Chukotka, Fiji, Antarctica and similar) jump from +180 to −180. Spherical d3-geo handles this, but planar
algorithms on raw coordinates (planar centroids, polylabel, `topojson.merge`) do not.

### `index.json`

```json
{ "source": "historical-basemaps by André Ourednik and contributors, https://… (commit 4b5039e, 2026-11-02)",
  "license": "GPL-3.0",
  "snapshots": [ { "year": -123000, "file": "world_bc123000.json", "label_en": "123,000 BC",
                   "label_es": "123 000 a. C.", "features": 4 }, … ] }
```

- Snapshots are sorted by year, ascending. BC years are negative and there is no year 0 (`world_bc1` is −1).
- Labels: `"5000 BC"` / `"5000 a. C."`, `"10,000 BC"` / `"10 000 a. C."`, `"AD 100"` / `"100 d. C."`, `"1492"`.
- `features` is the number of geometries in the file.

### `entities.json`

`{ "<name>": { "c": <0–23>, "first": <year>, "last": <year>, "n": <number of snapshots> } }`. There are 2,984
names, sorted. `first` and `last` are snapshot years, not historical dates.

How colour indices were assigned:

1. Build one adjacency graph across all snapshots.
   - Entities sharing a border get an edge weighted, per snapshot, by `1 + ln(1 + shared border km / 100)`.
   - Entities within 150 km of each other without touching (across straits, for example) get 0.25 per snapshot.
2. Colour greedily, processing entities by total area summed over the snapshots (large, long-lived first).
   Each entity takes the cheapest index, and ties go to the least-used index.
3. Run local search passes until no recolouring lowers the conflict cost.

Result: none of the 18,345 pairs of touching entities shares an index in any snapshot, and 43 of 26,118
near-but-not-touching pairs do. Indices are categorical and used evenly (about 124 names each). The app's
24-colour palette only needs distinguishable entries.

### `changes.json`

One entry per pair of consecutive snapshots (53 entries):

```json
{ "from": 1914, "to": 1920, "appeared": ["USSR", …], "disappeared": ["Russian Empire", …],
  "grew": [["French Equatorial Africa", 485], …], "shrank": [["French West Africa", -27], …] }
```

- Areas are spherical (d3 `geoArea`, R = 6371 km), measured on the published geometry and summed per name.
- Only entities of at least 20,000 km² count.
- **appeared:** ≥ 20,000 km² now, and absent or under 2,000 km² before.
- **disappeared:** the reverse.
- **grew/shrank:** the remaining entities whose area changed by at least 15%. The percentage is rounded, and
  shrinkage is floored at −99 while the entity still exists.
- Each list holds at most 12 names, largest entities first.
- Names are matched exactly: a renamed polity shows as one name disappearing and another appearing.

## Processing (scripts/data/history/build-history.mjs)

1. **Attributes:**
   - Whitespace is trimmed and collapsed. Empty and whitespace-only names become unnamed.
   - Junk values (`"1"`, `"3"`, `"true"`) are removed.
   - Five mojibake strings are fixed: `M?ori`, `Arag�n`, `Monte Alb?n`/`Alb�n`, `Teotihuac�n`.
   - Case variants are merged into the most frequent spelling (e.g. `Chinese warlords` → `Chinese Warlords`).
   - Features without NAME but with a SUBJECTO take SUBJECTO as their name (Dutch East Indies and United
     Kingdom of Netherlands in 1815, Cardial Ware culture in 5000 BC, Arctic marine mammal hunters in 2000 BC).
2. **Explicit fixes of obvious source errors:**
   - Switzerland is a nameless polygon in 1994, 2000 and 2010; the feature named "Switzerland" there is a
     zero-area sliver. The polygon is named Switzerland.
   - New Zealand is labelled "Kelteminar" (a Central Asian culture) in 5000 BC; it is set to unnamed.
   - Corsica is filed under "Kingdom of Italy" in 1914 only (French in 1900 and 1920); it is moved to France.
   - Two lakes tagged as entities in AD 700 (Lake Vygozero, Lake Segozerskoye) are removed.
3. **Duplicates:** near-identical named polygons (each covering ≥ 90% of the other) keep the later one in the file,
   which is what the source author saw drawn on top.
   - 1938: Israel → Mandatory Palestine (GB); Oman (British Raj) → Muscat and Oman; Yemen (UK) → Yemen. Qatar
     and Trucial Oman keep their British-protectorate version.
   - 1492: 8 Native Land territories listed twice under different names.
4. **Overlaps** (mapshaper `-clean`): named land wins over unnamed land, then the smaller polygon wins, so a small
   state drawn on top of an empire keeps its territory. Small gaps are filled, and features are then dissolved by
   name and attributes.
5. **Slivers:** polygon parts under 300 km² that are not an entity's largest part and that touch other entities
   are merged into the neighbour with the longest shared border. These are mostly remnants of resolved overlaps.
   The step also absorbs very small exclaves such as Llívia and Campione. Islands are kept.
6. **Simplification:** weighted Visvalingam on the sphere (mapshaper, `keep-shapes`), starting at a 4 km
   resolution and coarsened until a file is about 230 KB, up to 10 km.
   - 4 km for most snapshots; 5 km for 5000 BC, 1994, 2000 and 2010; 6.3 km for 1815.
   - About 10 km for 1492 and 1600–1800, which contain hundreds of indigenous territories.
   - Quantization is 1e5.
7. **Repair and stitching:**
   - Spikes and degenerate rings are removed and wrong windings fixed. Every feature is checked to have a
     spherical area below a hemisphere.
   - Polygons are stitched across ±180° and the poles (d3 `geoStitch`) and accepted only if their area is
     unchanged.
   - The topology is rebuilt on the same quantization grid.

## Known limitations

- **Approximate borders.** Before about 1650 almost every border is BORDERPRECISION 1, i.e. approximate. Prehistoric
  and ancient snapshots show cultural or archaeological areas and hunter-gatherer regions rather than states.
  Pre-modern borders were zones, not lines; render `pr` 1 borders softly (blur, dashes, low opacity).
- **Overlaps are flattened.** The source contains overlapping claims; here they are resolved into a flat mosaic,
  so they no longer show.
  - 1492 is the extreme case. It embeds about 1,300 Native Land territories of the Americas, which overlap
    heavily. The resulting file is about 420 KB.
  - Five 1492 territories are entirely covered by smaller overlapping ones and do not appear: Ndé Kónitsąąíí
    Gokíyaa (Lipan Apache), Kwazá, Puyanawa, Shigom, Chibuleo.
  - About 50 other territories keep less than 10% of their source area.
- **Sliver-only names are dropped.** Some names exist in the source only as zero-area slivers and are absent
  here: West African cereal farmers (900), Bahmani Kingdom (1500), Athabascan (1600, 1650), Algiers and Tunis
  (1650), Andean and Savanna hunter-gatherers (1783), Kuwait and Jordan (1938).
- **Names are not harmonised across snapshots** (e.g. "Ming Empire" in 1492 vs "Ming Chinese Empire" in 1600,
  "Sultinate of Zanzibar" in 1878). Colours follow exact names, so a renamed polity changes colour. Modern
  snapshots keep the source's names (e.g. "Zaire", "Burma" in 2010).
- **Unnamed islands.** Some islands are unnamed even in modern snapshots: Gotland, Shetland, Lewis, the Faroe
  Islands and Okinawa; also Crete and Lesbos in 1914. They render as unclaimed land.
- **Unnamed land** means "no polity recorded in the source", not necessarily uninhabited land.
- **Repeated snapshots.** 2000 and 2010 are identical in the source, and 1878 and 1880 are nearly so.
- **Coordinate shift.** The upstream notes that some snapshots are shifted by up to about 20 km.
- **No places layer.** `places.geojson` from the same repository is not included:
  - Only 70 of its 2,340 points have a start year and 6 an end year. Abandoned cities such as Ur, Uruk or
    Harappa would therefore appear to exist today.
  - It has no rank or population field.
  - Most points are undated OpenStreetMap archaeological features (tells, tombs, shell middens, peaks)
    concentrated in Israel/Palestine and Australia.
