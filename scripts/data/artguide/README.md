# Art and architecture data

`build-artguide.mjs` builds `public/data/artguide/` (v0.27.0) from Wikidata.

    node scripts/data/artguide/build-artguide.mjs --fetch    # fetch: each museum's works, buildings, Now in, then every name
    node scripts/data/artguide/build-artguide.mjs --labels   # fetch again only the names that came back without English
    node scripts/data/artguide/build-artguide.mjs            # build
    node scripts/data/artguide/build-artguide.mjs --check    # in check:data: fails if the files are out of date or a known museum, work or architect is missing

**Museums.** The candidates are the museums near the travel guide's cities (`scripts/data/guide/wikidata-museums.json`) with articles in 20 Wikipedias or more, minus science museums. For each, the works now in its collection, or in a collection that is part of it (`P195/P361*`, the Louvre's departments), without an end date, with articles in 5 Wikipedias or more. A museum keeps its 25 best known; one with fewer than 3 is left out (a monument listed as a museum holds none). A work in two museums' lists stays with the first.

**Buildings.** Those with an architect (P84) and articles in 15 Wikipedias or more, and those with a style (P149) but no architect in 25 or more. Each is given the nearest travel guide city within 30 km. Styles are grouped into 15 families (Gothic, Baroque, Art Nouveau and Catalan modernism, Modern, Contemporary…) by the patterns in the script.

**Names.** English and Spanish labels; where Wikidata keeps a name only as "mul" (the same in most languages, such as Albrecht Dürer), that is used. A Spanish name the same as the English one is stored as `0`.

**Kept here.** `wikidata-works.json`, `wikidata-buildings.json`, `wikidata-nowin.json` and `wikidata-labels.json` are what Wikidata answered; delete one and run `--fetch` to fetch it again. `scripts/test/artguide.mjs` checks the data.
