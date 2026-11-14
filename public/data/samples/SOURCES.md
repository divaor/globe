# Your data: sample files

Four small tables to try "Your data" (Filters → Your data, or More → Your data), each showing one kind of table the
app reads. `scripts/data/samples/build-samples.mjs` builds them.

| File | Shows | Source |
|---|---|---|
| `life-expectancy.csv` | a row per country and year, with world and regional totals (which the app sets aside) | Life expectancy at birth, every tenth year from 1950 and 2023: Our World in Data, "Life expectancy" (Riley 2005; Zijdeman et al. 2015; HMD 2025; UN World Population Prospects 2024), CC BY 4.0, https://ourworldindata.org/grapher/life-expectancy |
| `latin-america-cities.csv` | points (latitude and longitude), sized by a number and with a category | The 40 most populous cities of Latin America and the Caribbean in the app's own cities (GeoNames, CC BY 4.0) |
| `mexico-world-heritage.csv` | regions inside a country (Mexico's 32 states), with column names in Spanish | World Heritage sites counted from the app's World Heritage list (`public/data/layers/heritage.json`), each site in the state that holds its listed point; 3 of Mexico's 36 sites have their point at sea or on islands outside the states' outlines and are not counted |
| `my-travels.csv` | categories: an invented example of countries someone has visited, lived in or wants to visit | — |
