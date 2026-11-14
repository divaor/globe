# Map games: the border graph

`borders.json` is what Border hop plays on: which countries share a land border, and what each round scores and asks about. `scripts/data/play/build-borders.mjs` builds it (README there).

| Part | Source |
|---|---|
| Land borders (323) | The app's own 1:50m country map (`public/data/base/countries-50m.json`, Natural Earth, public domain): two countries are neighbours when their outlines share an edge |
| Exclaves, overseas regions, tunnels and bridges | Sorted by hand in `scripts/data/play/border-rules.json`, with the notes the game shows |
| Checks | CIA World Factbook neighbours (in `public/data/attributes/countries.json`); Wikidata P47 "shares border with" (CC0), cached in `scripts/data/play/wikidata-p47.json` |
| Population, area, capital | `public/data/attributes/countries.json` (World Bank, CIA World Factbook); capitals from the app's cities (GeoNames, CC BY 4.0) |
| Knowledge rounds | Official languages, driving side and NATO and EU membership from `public/data/attributes/countries.json`; Olympic hosts from the Games of the world data (`public/data/games/items.json`) |
