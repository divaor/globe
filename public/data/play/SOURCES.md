# Map games data

## The border graph

`borders.json` is what Border hop, Border chain, Name them all's neighbours and the quiz's "Which country in between?" play on: which countries share a land border, and what each round scores and asks about. `scripts/data/play/build-borders.mjs` builds it (README there).

| Part | Source |
|---|---|
| Land borders (323) | The app's own 1:50m country map (`public/data/base/countries-50m.json`, Natural Earth, public domain): two countries are neighbours when their outlines share an edge |
| Exclaves, overseas regions, tunnels and bridges | Sorted by hand in `scripts/data/play/border-rules.json`, with the notes the game shows |
| Checks | CIA World Factbook neighbours (in `public/data/attributes/countries.json`); Wikidata P47 "shares border with" (CC0), cached in `scripts/data/play/wikidata-p47.json` |
| Population, area, capital | `public/data/attributes/countries.json` (World Bank, CIA World Factbook); capitals from the app's cities (GeoNames, CC BY 4.0) |
| Knowledge rounds | Official languages, driving side and NATO and EU membership from `public/data/attributes/countries.json`; Olympic hosts from the Games of the world data (`public/data/games/items.json`) |

## Pin it's places

`pins.json` is gathered from the app's own data by `scripts/data/play/build-pins.mjs` (README there).

| Pack | Source |
|---|---|
| Capitals | The app's cities (GeoNames, CC BY 4.0), one per country |
| World Heritage sites | `public/data/layers/heritage.json` (UNESCO World Heritage List) |
| Great structures, dishes, inventions, museums | The Time travel stories' items (`structures`, `food`, `inventions`, `art`), with the sources listed for each story |
| Battles | Every war in Time travel (`public/data/conflicts/`) |
