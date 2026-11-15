# Travel guide data

`build-guide.mjs` builds `public/data/guide/` (v0.26.0): `index.json` lists the guide's 690 cities with their facts and weather, and `c/<city>.json` holds each city's guide.

    node scripts/data/guide/build-guide.mjs --fetch   # download the CRU grids into .cache/climate and fetch Wikidata (museums, page names)
    node scripts/data/guide/build-guide.mjs           # build
    node scripts/data/guide/build-guide.mjs --check   # in check:data: fails if the files are out of date or a known city lacks what it should have

**Cities.** Every capital, every city of a million people or more, and towns with two World Heritage sites or great structures or more within reach. Ids are the English name (`lima`, `mexico-city`), with the country when two share a name (`cordoba-arg`). Each gets its Wikidata id and other names from Natural Earth's populated places (`.cache/ne/`, downloaded by `scripts/data/build-base.mjs --download`).

**Weather.** CRU CL 2.0 (`.cache/climate/grid_10min_{tmp,dtr,pre,rd0}.dat.gz`): the nearest land cell's monthly mean temperature, daily range, rain and wet days. The best months to go are worked out in the app (`src/guide/logic.ts`).

**Kept here.** `wikidata-museums.json` and `wikidata-pages.json` are what Wikidata answered (fetch again with `--fetch` after deleting them). `derived.json` keeps the ids, other names and weather taken from `.cache`, so `--check` (and CI, which has no `.cache`) can rebuild the same files.

**Each city's guide.** What to eat (dishes within 60 km, then the rest of the country, then nearby countries; crops first grown nearby), what to see (World Heritage within 30–40 km and a day trip away within 160 km; great structures), History here (story items within 15–25 km, a few from each collection) and museums (the best known first). `scripts/test/guide.mjs` checks the data and the guide's sums.
