# The sky: sources

The night sky, our galaxy and the elements (v0.21.0). `scripts/data/sky/fetch_sky.sh` downloads the sources and
`scripts/data/sky/build-sky.mjs` builds these files from them and from the researched files in `scripts/data/sky/`.
Positions are J2000 right ascension and declination in degrees.

## Stars, constellations and the Milky Way

| File | What | Source |
|---|---|---|
| `stars.json` | 5,044 stars to magnitude 6.5, with their colour index, names and Bayer or Flamsteed designations | d3-celestial (Olaf Frohn, BSD 3-clause): XHIP (Anderson & Francis 2012), star name cross-indexes (Kostjuk 2002; Smith 1996), names after the IAU Working Group on Star Names, translations from Stellarium's sky cultures |
| `constellations.json` | the 88 constellations: names, figures, borders, label, area, brightest star, best month, objects in them, and their cards | d3-celestial (IAU figures and names; borders from Davenhall & Leggett 1989, VizieR VI/49); cards researched for Atlas Globe (sources in `scripts/data/sky/_constellations.json`) |
| `objects.json` | 152 deep-sky objects: the Messier catalogue and famous others | Atlas Globe research from Wikipedia, NASA, ESA and ESO (sources per object in `scripts/data/sky/_objects.json`); Messier positions from d3-celestial (SEDS) |
| `starinfo.json`, `galaxy.json` | cards of the brightest and best-known stars, the nearest star systems, the Milky Way's features and the Local Group | Atlas Globe research (sources in `scripts/data/sky/_stars.json`) |
| `milkyway-2k.jpg`, `milkyway-4k.jpg` | the whole sky in galactic coordinates (l = 0 in the middle, increasing to the left), drawn behind the stars | ESO/S. Brunier, "The Milky Way panorama" (eso0932a), CC BY 4.0 |
| `milkyway-top.jpg` | the Milky Way seen from above, placed by the Sun's position on it | NASA/JPL-Caltech/ESO/R. Hurt, artist's impression (eso1339g) |

The Sun, the Moon and the planets are computed in the app (`src/sky/astro.ts`): planets from JPL's approximate
positions (E. M. Standish), the Moon from the Astronomical Almanac's low-precision series, precession after Lieske
(1977), planets' brightness after Mallama & Hilton (2018). `scripts/test/sky.mjs` checks them against the 2020 great
conjunction, the 2024 eclipse and full moon, and the galactic centre.

## The elements

| File | What | Source |
|---|---|---|
| `elements.json` | the 118 elements: the share of each made by the Big Bang, cosmic rays, dying low-mass stars, exploding massive stars, exploding white dwarfs and merging neutron stars; where that happens in the sky; how each is obtained on Earth; its discovery, uses and a fact | the shares measured from J. A. Johnson (2019), "Populating the periodic table: Nucleosynthesis of the elements", *Science* 363, 474–478 (rounded to 5 %); texts researched for Atlas Globe (sources per element in `scripts/data/sky/_elements.json`) |

Who mines each element is the "Natural resources: top producers" filter (`public/data/attributes/minerals.json`):
world production shares from the USGS Mineral Commodity Summaries 2026 (2025 estimates), the World Nuclear Association
(uranium) and the Kimberley Process (diamonds), sources per commodity in
`scripts/data/attributes/minerals_usgs2026.json`.
