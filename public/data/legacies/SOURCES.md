# Legacies of the past

`index.json` (categories, civilizations, every legacy in brief and the country groups), `<civilization>.json` (one
civilization in full) and `areas.json` (the homelands) are built by `scripts/data/legacies/build-legacies.mjs` from
`scripts/data/legacies/<civilization>.json` (README there).

| Part | Source |
|---|---|
| The legacies, their journeys, words and notes | Written for the app from museums, universities, encyclopaedias and dictionaries; each civilization's file lists its own sources (`sources`), shown at the end of its page |
| Who uses each legacy today | The groups each legacy names (`where`), resolved with the app's country facts (`public/data/attributes/countries.json`: official languages, language family and branch, script, main religion, continent and region, organisations, habits; its own SOURCES.md) |
| Homelands | Area expressions resolved as the time-travel stories' territories are (`scripts/data/build-conflicts.mjs`): historical maps by aourednik/historical-basemaps (GPL-3.0), today's countries and provinces (Natural Earth, public domain), and outlines drawn for the app |
| Wikipedia article titles | Checked against Wikidata's sitelinks (CC0) on QLever (University of Freiburg); pictures come from the articles, shown with Wikipedia's licence |
