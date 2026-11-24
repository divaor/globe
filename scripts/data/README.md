# Base map data

`build-base.mjs` builds `public/data/base/` (countries at three levels of detail, their facts, cities, states and
provinces, land) and the physical layers in `public/data/layers/` from Natural Earth (public domain). Sources and
licences: `public/data/base/SOURCES.md`.

```sh
NODE_USE_ENV_PROXY=1 node scripts/data/build-base.mjs --download   # once: Natural Earth into .cache/ne/, OCHA's datasets into .cache/cod-ab/
node scripts/data/build-base.mjs                                   # everything
node scripts/data/build-base.mjs admin1 cities                     # or some steps
```

The steps run in this order: `countries`, `admin1`, `cities` (a city's state, in the updated countries, is looked up in
the built states), `physical`, `landforms`, `timezones`, `land`. Western Sahara is drawn whole (v0.43.6; see the main
README).

## States and provinces brought up to date (v0.47.0)

Natural Earth's first-level divisions are out of date where a country has redrawn them since its data was made. An
audit (every country's states and provinces against Wikidata's current first-level divisions, through QLever) found
33 such countries with a current official dataset; their provinces now come from OCHA's Common Operational Datasets of
administrative boundaries (COD-AB) on the Humanitarian Data Exchange (CC BY-IGO), each country's own agency's
boundaries. Among them: Kenya's 47 counties (2013; 8 provinces before), DR Congo's 26 provinces (2015; 11), Nepal's 7
provinces (2015; 14 zones), Ethiopia's 12 regions and 2 cities (2020–2023), Kazakhstan's 17 regions and 3 cities (2018,
2022), Côte d'Ivoire's 14 districts (2011; 19 regions), Viet Nam's 34 provinces (2025; 63), Morocco's regions (2015),
Ghana's 16 regions (2019), Indonesia's 38 provinces (2022) and Mali's 19 regions (2023). The list, with each dataset
and the date its boundaries are valid from, is `UPDATES` in `admin1-updates.mjs`.

- **Download.** `--download` fetches each dataset's metadata (`package_show`) and its GeoJSON (or shapefile) archive
  into `.cache/cod-ab/<iso3>/` (git-ignored); the build unzips the layers it needs there.
- **Checked.** The build stops if a dataset's `valid_on` date or its number of units is not the one recorded: a newer
  dataset must be looked at (and its date and units updated) before it is used.
- **Units.** Usually the dataset's first level. Côte d'Ivoire's districts are made of OCHA's regions; Tunisia's
  governorates are OCHA's second level; Indonesia's four new provinces of Papua (2022), Iraq's Halabja, Lebanon's
  Keserwan-Jbeil and Timor-Leste's Atauro are made of second-level units. Ethiopia's contested area between Oromia and
  Somali is split along Natural Earth's line between them.
- **Shapes.** Each country's new provinces are simplified to about Natural Earth's detail (an interval of 1/250 of
  the country's size, 0.8–5 km) and cut to the outline its Natural Earth provinces have on the map, after
  simplification: coasts and borders stay Natural Earth's and line up with the countries and their neighbours, whose
  shapes do not move. Where Natural Earth's outline reaches beyond the dataset's (a strip of coast, an island), that
  land goes to the nearest province it touches. Morocco's are cut at Western Sahara's boundary like Natural Earth's were.
- **Names.** `admin1-updates.json`, by unit: the Wikidata item; the English and Latin American Spanish names (Natural
  Earth's where the province is one it had, else the Wikidata labels without their type words), Natural Earth's name
  (`ne`) of a province it had, whose label point and rank are kept; the type where it is not the country's; and the
  Portuguese, French and German names from Wikidata's labels where they differ from the English (`scripts/i18n/names.mjs`
  puts them in `public/data/i18n/<lang>-data.json`).
- **Cities.** In these countries a city's state (`cities.json`) is the province of the dataset's own, detailed lines it
  lies in (the built shapes' for a coastal town beyond them).
- **What else follows.** The regional languages (`scripts/data/attributes/regional/`) list the new provinces; the
  travel guide was rebuilt for its cities' states. Stories written before name Natural Earth's provinces: for these
  countries `build-conflicts.mjs` draws such names from `conflicts/_admin1-legacy.json` (the provinces as v0.46.1 had
  them), so the stories keep their shapes; a story that names today's provinces (or says `"now": true`) gets today's.

Countries found outdated with no current official dataset at hand keep Natural Earth's provinces: Norway (15 counties
since 2024; no COD), Latvia (2021), South Korea (renamed provinces; Jeonnam-Gwangju, 2026), Algeria, Angola, the
Republic of the Congo, Equatorial Guinea (their CODs predate the change), South Sudan's administrative areas,
Panamá Oeste (the COD comes from GADM), Greenland, Luxembourg, Montenegro and Turkmenistan's cities.
