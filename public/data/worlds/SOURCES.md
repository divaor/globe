# Other worlds: sources

The maps of the other worlds, their place names and heights. `scripts/data/space/fetch_worlds.sh` downloads the
sources and `scripts/data/space/build-worlds.mjs` builds these files (maps as equirectangular JPEGs from 180°W to
180°E, north up; longitudes east-positive).

## Maps (`<world>-4k.jpg`, `<world>-2k.jpg`)

Public domain (NASA, USGS) unless noted. Where the world has them, sharper tiles of the same mosaics load from NASA's
Solar System Treks (trek.nasa.gov) as you zoom in.

| World | Map | Source |
|---|---|---|
| Mercury | MESSENGER MDIS global mosaic, 250 m (2013) | NASA/JHUAPL/Carnegie Institution, via NASA Solar System Treks |
| Venus | Magellan radar mosaic (C3-MDIR), colourised | NASA/JPL, USGS, via NASA Solar System Treks |
| Venus (clouds) | Venus atmosphere texture | Solar System Scope, CC BY 4.0 |
| The Moon | LRO Wide Angle Camera global mosaic, 303 px/° | NASA/GSFC/Arizona State University, via NASA Solar System Treks |
| The Moon (heights) | LRO LOLA colour-shaded relief, 256 px/° (v6) | NASA/GSFC, via NASA Solar System Treks |
| Mars | Viking MDIM 2.1 colour mosaic, 232 m | NASA/USGS, via NASA Solar System Treks |
| Mars (heights) | MGS MOLA colour-shaded relief, 463 m | NASA/GSFC, via NASA Solar System Treks |
| Ceres | Dawn Framing Camera global mosaic, 20 px/° (Oct 2015) | NASA/JPL-Caltech/DLR, USGS Astrogeology |
| Vesta | Dawn true-colour HAMO mosaic, 74 px/° | NASA/JPL-Caltech/DLR, via NASA Solar System Treks |
| Jupiter, Saturn, Uranus, Neptune | Planet textures | Solar System Scope, CC BY 4.0, based on NASA mission images |
| Io | Galileo SSI and Voyager colour mosaic, 1 km | NASA/JPL/USGS, via NASA Solar System Treks |
| Europa | Voyager and Galileo blended colour mosaic | NASA/JPL/USGS, via NASA Solar System Treks |
| Ganymede | Voyager and Galileo SSI colour mosaic, 1.4 km | NASA/JPL/USGS, via NASA Solar System Treks |
| Callisto | Voyager and Galileo SSI global mosaic, 1 km | NASA/JPL, USGS Astrogeology |
| Titan | Cassini ISS infrared global mosaic (PIA19658), 4 km | NASA/JPL-Caltech/Space Science Institute, USGS Astrogeology |
| Enceladus | Cassini global mosaic, 110 m | NASA/JPL/Space Science Institute, via NASA Solar System Treks |
| Triton | Voyager 2 colour mosaic, filled | NASA/JPL, USGS Astrogeology |
| Pluto, Charon | New Horizons global mosaics, 300 m (July 2017) | NASA/JHUAPL/SwRI, USGS Astrogeology |

`thumbs/<world>.png` are small round views made from the same maps (the Earth's from the app's Blue Marble).

## Place names (`<world>-names.json`)

The IAU Gazetteer of Planetary Nomenclature (International Astronomical Union Working Group for Planetary System
Nomenclature, maintained by the USGS Astrogeology Science Center, planetarynames.wr.usgs.gov): every adopted name
except the lettered satellite craters, with its type, size and centre. Each row is `[lon, lat, name, type, km,
origin]`; `origins` lists what each place is named after, in the Gazetteer's English and in Spanish
(translated for Atlas Globe: `scripts/data/space/origins-es/`).

## Heights for the 3D view (`moon/h/`, `mars/h/`)

Terrarium tiles (height = R·256 + G + B/256 − 32768 m, in steps of 16 m) on an equirectangular grid of
2^(z+1) × 2^z tiles, zooms 0 to 3, as lossless WebP:

- **The Moon**: LRO LOLA gridded heights at 16 px/°, relative to a sphere of 1737.4 km (NASA/GSFC; via NASA SVS's
  CGI Moon Kit, ldem_16_uint.tif).
- **Mars**: MGS MOLA Mission Experiment Gridded Data Record at 16 px/° (megt90n000eb), heights above the areoid
  (NASA/GSFC, PDS Geosciences Node).

## Facts, landings and orbits

- `facts.json`: facts about each world (NASA planetary fact sheets, NASA Science, JPL Solar System
  Dynamics, the IAU); sources per world in `scripts/data/space/_worlds.json`.
- `landings.json`: every landing on another world, with the rovers' routes; sources per landing in
  `scripts/data/space/_landings.json`.
- The solar system view computes positions from JPL's "Approximate Positions of the Planets" (E. M. Standish) and
  osculating elements from JPL's Small-Body Database (Ceres, Pluto, Eris, Haumea, Makemake, Halley's Comet).
