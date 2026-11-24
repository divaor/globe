# Who was born here?

`build-born.mjs` builds `public/data/born/people.json` and `public/data/born/more.json`: where well-known people
were born.

```sh
node scripts/data/born/build-born.mjs --fetch   # ask Wikidata again (answers kept in .cache/born)
node scripts/data/born/build-born.mjs           # build public/data/born/people.json and more.json
node scripts/data/born/build-born.mjs --check   # in check:data
```

- **`people.json`, loaded first (15,993 people, 2.31 MB):**
  - the world's best known: every human on Wikidata with articles in enough Wikipedias to keep about 12,000 people
    (48 or more, in November 2026);
  - everyone the app features elsewhere, whatever their fame (4,783 people with a place and year of birth, 3,734 of
    them below the global list). The build looks for Wikidata ids and Wikipedia articles anywhere in `public/data`
    (but `born`, `fill` and `i18n`) and asks Wikidata which are humans: the lives of Lives on the map, the people of
    the Time travel stories (each item's `wiki`) and of their sources, the legacies, and the art guide's artists and
    architects. Master the world names no people of its own (its "Born here" clues come from this list).
- **`more.json`, loaded in the background after it (18,774 people, 2.50 MB):** each country's own best known below
  the global list, by the current country (P17) of the place of birth, down to 8 Wikipedias. Each country's share is
  scaled to its population: `capOf(pop)`, 35 people and 2.5 more for each million people, up to 400 (Mexico: 366,
  down to 21 Wikipedias; Spain: 156; Iceland: 36; India, the United States, Brazil: 400). A base of 40 made the file
  2.6 MB; 35 keeps it at 2.5. Only today's countries count (P31 country or sovereign state, without an end date).
  The best known come first, then the older Wikidata item.
  `ASKED` adds people readers asked for by name, whatever their country's share, if they reach the floor of 8
  (Andrés Quintana Roo and Aleks Syntek are in; Carlos Loret de Mola, with 4, is not). The same rows as `people.json`,
  with places and guide cities of its own; the app joins a place to the first file's when name and point are the same.
- **Places without coordinates:** a place of birth or death with no coordinates of its own (P625) takes the point
  of the nearest place it lies in, up to three steps up its P131 chain, and keeps its own name: Frida Kahlo was born
  in Coyoacán, which takes Mexico City's point. A person with a birthplace that has coordinates keeps that one.
- **Where the answers come from:** QLever, the University of Freiburg's public copy of Wikidata (see
  `../lives/wdqs.mjs`). Each raw answer is kept in `.cache/born`; `wikidata-people.json` (the first file's people,
  with `featured`, the ids found in the app) and `wikidata-more.json` (the candidates for the second, with the
  countries of their birthplace, and `countries`: population, name and how far down each country was asked) are what
  the build reads, so the build needs no network. A list that changes (new stories, new countries) is asked again: its
  cache name carries a fingerprint of the list.
- **Field:** `fieldOf()` reads the description first ("American actor and politician" is film and stage; "40th
  President of the United States" is a leader) and falls back on the occupations. Add a word to `RULES` when a kind of
  person lands in "other".
- **The guide's cities:** a birthplace belongs to a travel-guide city when it is that city on Wikidata, or lies within
  12 km of it (25 km for a city of 3 million or more).
- **Names:** Wikidata's labels in English and Spanish (`mul` when a name is the same in every language). Labels
  vandalised on Wikidata just now (another person's name, an insult) are set back by hand in `NAME_FIX` and
  `DESC_FIX`; compare a list's names with its people's Wikipedia titles after a fetch to find new ones.
- Living people are listed by birthplace only; people known above all for a crime are left out (`DROP`, `DROP_DESC`),
  even when the app features them.
- **`--check`** fails when either file is out of date, a known person is missing or misplaced (Mozart, Velázquez,
  Einstein; Frida Kahlo in Coyoacán; Juan Gabriel, Armando Manzanero, Aleks Syntek and Andrés Quintana Roo, born in
  Mexico), someone the app features is missing, a country's share was not asked far enough down (run `--fetch`
  again), or `more.json` passes 2.6 MB (it is 2.50 MB now).
