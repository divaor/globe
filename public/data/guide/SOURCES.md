# Travel guide data

`index.json` (the guide's cities, their facts and weather) and `c/<city>.json` (each city's guide) are built by `scripts/data/guide/build-guide.mjs` (README there).

| Part | Source |
|---|---|
| The cities | The app's own cities (`public/data/base/cities.json`, Natural Earth, public domain): every capital, every city of a million people or more, and towns with two or more World Heritage sites or great structures nearby |
| Wikidata ids and other names | Natural Earth's populated places (`WIKIDATAID`, `NAMEALT`…), public domain |
| Weather by month | CRU CL 2.0, mean monthly climate 1961–1990 on a 10′ grid: mean temperature, daily temperature range, rain and wet days (New, M., Lister, D., Hulme, M. and Makin, I., 2002: A high-resolution data set of surface climate over global land areas. Climate Research 21, 1–25). Climatic Research Unit, University of East Anglia; free to use with this citation |
| Museums | Wikidata (CC0): museums within 6–18 km of the city centre with articles in three Wikipedias or more, their kind, visitors a year (P1174) and website (P856) |
| Wikivoyage and Wikipedia page names | Wikidata sitelinks (CC0) |
| What to eat, see and History here | The app's own collections: Food through time, Great structures, World Heritage (`public/data/layers/heritage.json`, UNESCO), and every Time travel story |
| Wikivoyage's "Eat" text | Not stored: read live in the browser from Wikivoyage (CC BY-SA 4.0) and credited where it is shown |
