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
| Events and texts | Written for the app from museums, universities, geological surveys and papers |
| Pictures | From each species' or event's Wikipedia article, shown with Wikipedia's licence |
