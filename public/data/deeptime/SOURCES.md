# Deep time

`deeptime.json` (groups, kinds of events, the Earth's vital signs through time, the events, the narration) and
`species.json` (past species with their fossil sites) are built by `scripts/data/deeptime/build-deeptime.mjs` from
`scripts/data/deeptime/` (README there).

| Part | Source |
|---|---|
| Continents through time | The plate model of `public/data/paleo/` (Merdith et al. 2021, CC BY 4.0, via GPlates); before 1 billion years ago the app shows an impression, not a map |
| Geologic time scale | The ICS International Chronostratigraphic Chart (`public/data/paleo/timescale.json`) |
| The Earth's vital signs (oxygen, carbon dioxide, temperature, sea level, day length, the Moon's distance, diversity) | Peer-reviewed compilations, each listed in `deeptime.json` under `sources` and shown in the app; values are approximate, with ranges where known |
| The Sun's brightness | Gough (1981), Solar interior structure and luminosity variations, Solar Physics 74 |
| Species' ages and fossil sites | The Paleobiology Database (https://paleobiodb.org, CC BY 4.0) and the papers the texts are written from |
| The universe's age, temperature and size (the cosmos chapter) | Planck Collaboration (2020), Planck 2018 results VI: Cosmological parameters, Astronomy & Astrophysics 641, A6 (flat ΛCDM: H₀ 67.66, Ωm 0.3111, ΩΛ 0.6889, age 13.787 billion years); the temperature of the oldest light today, 2.7255 K (Fixsen 2009) |
| The solar system's first millions of years | Connelly et al. (2012, the first solids), Kruijer et al. (2014, 2017: iron meteorites, Jupiter), Dauphas & Pourmand (2011, Mars), Wang et al. (2017, the gas clears) |
| Events and texts | Written for the app from museums, universities, geological surveys, space agencies and papers |
| Pictures | From each species' or event's Wikipedia article, shown with Wikipedia's licence |
