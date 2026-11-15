# Who was born here?

`build-born.mjs` builds `public/data/born/people.json`: where the world's best-known people were born.

```sh
node scripts/data/born/build-born.mjs --fetch   # ask Wikidata again (about twenty short questions)
node scripts/data/born/build-born.mjs           # build public/data/born/people.json
node scripts/data/born/build-born.mjs --check   # in check:data
```

- **Who:** every human on Wikidata with articles in enough Wikipedias to keep about 12,000 people (48 or more, in November 2026), who has a place of birth with coordinates.
- **Where the answers come from:** QLever, the University of Freiburg's public copy of Wikidata (see `../lives/wdqs.mjs`). Each raw answer is kept in `.cache/born`; `wikidata-people.json` here is what the build reads, so the build needs no network.
- **Field:** `fieldOf()` reads the description first ("American actor and politician" is film and stage; "40th President of the United States" is a leader) and falls back on the occupations. Add a word to `RULES` when a kind of person lands in "other".
- **The guide's cities:** a birthplace belongs to a travel-guide city when it is that city on Wikidata, or lies within 12 km of it (25 km for a city of 3 million or more).
- Living people are listed by birthplace only; people known above all for a crime are left out (`DROP`, `DROP_DESC`).
