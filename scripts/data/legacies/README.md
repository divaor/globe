# Legacies of past civilizations: authoring guide

**Legacies** (Explore menu, v0.44.0) shows what past civilizations gave the world that is **still in use
today**: words, writing, numbers, calendars, science, buildings, tools, foods, money, laws, ideas, arts,
games and everyday things. For each one the map shows:

- where it began (a dot) and the civilization's homeland (a coloured area);
- **lines** for how it travelled, step by step, to the people who use it now;
- **colours** on the countries that use it today (darker where it is strongest).

People can browse by civilization, by category, or from their own country ("What did my country borrow from
the past?"), take a quiz ("Who gave us this?") and follow links into the time-travel stories.

This is not a list of inventions or works of art (the Inventions and Art collections do that). It is about
**what a whole civilization left behind that people still use**, and how it got to them.

## Files

One file per civilization: `scripts/data/legacies/<id>.json` (the `id` is the file name: `egyptians`,
`mexica`). Files starting with `_` are ignored.

```sh
node scripts/data/legacies/build-legacies.mjs --only egyptians      # check one file (writes nothing)
NODE_USE_ENV_PROXY=1 node scripts/data/legacies/build-legacies.mjs --only egyptians --titles   # and its Wikipedia titles
node scripts/data/legacies/build-legacies.mjs --list groups         # the groups "where" can use
node scripts/data/legacies/build-legacies.mjs --list cats           # the categories
node scripts/data/legacies/build-legacies.mjs --list items papyrus  # markers in the other collections, for "see"
node scripts/data/legacies/build-legacies.mjs --list stories egypt  # stories in the other collections, for "see"
NODE_USE_ENV_PROXY=1 node scripts/data/legacies/build-legacies.mjs --find en roman numerals   # Wikipedia titles (en and es)
node scripts/data/build-conflicts.mjs --list hist -1500             # polities on the 1500 BC map, for "home"
node scripts/data/legacies/build-legacies.mjs                       # build everything into public/data/legacies/
```

Fix every `FAIL`. Read every `warn` and fix it unless you are sure it is fine.

## A civilization

| Field | |
|---|---|
| `id` | the file name: lowercase letters, digits and hyphens |
| `name` | `{ "en", "es" }`, at most 50 characters: "Ancient Egyptians", "Antiguos egipcios" |
| `short` | optional `{ "en", "es" }`, at most 24 characters, for tight spots: "Egyptians" |
| `icon` | one emoji (or a sign of their own script that phones show: 𓂀) |
| `color` | `"#rrggbb"`, distinct from the other civilizations, readable on a dark blue sea and on light land |
| `from`, `to` | the dates of the civilization (`"-3100"`, `"-30"`; negative years are BC, there is no year 0; `"1428"`, `"1521"`) |
| `at` | `[lon, lat]`: the centre of the homeland, where the map flies to |
| `zoom` | optional, 1–12: how close the map comes (3 for a continent, 5 for a country) |
| `home` | the homeland at its height, an **area expression** (see `scripts/data/conflicts/README.md`, "Territory"): `{ "hist": "Egypt", "year": -1500 }` (a polity on a historical map, names from `--list hist <year>`), `{ "land": [[lon, lat], ...] }` (the land inside a polygon you draw), unions `[a, b]`, `{ "minus": [a, b] }`... Approximate, like a school atlas |
| `defs` | optional named areas for `home` (`{ "ref": "name" }`) |
| `intro` | `{ "en", "es" }`, 80–700 characters: who they were, where and when, in 2–4 sentences |
| `today` | optional `{ "en", "es" }`, at most 400 characters: their heirs today (descendants, the language still spoken and by how many, places that keep the traditions) |
| `story` | optional link to the time-travel story about them: `"people/ancient-egypt"` |
| `wiki` | `{ "en", "es" }` Wikipedia article titles about the civilization |
| `sources` | at least 3 `{ "title", "url" }`: museums, universities, encyclopaedias, books online. Not Wikipedia |
| `legacies` | the list, **at least 12**; see "How many" below |

## A legacy

| Field | |
|---|---|
| `id` | lowercase, hyphens, unique in the file: `365-day-year` |
| `name` | `{ "en", "es" }`, at most 60 characters: what we use today ("The 365-day year", "Paper (the word)") |
| `cat` | `words`, `writing`, `numbers`, `time`, `science`, `build`, `tech`, `food`, `money`, `law`, `ideas`, `arts`, `play`, `daily` (see the table below) |
| `icon` | one emoji |
| `how` | how this civilization gave it (below) |
| `sure` | optional: `likely` or `debated` when scholars are not sure they were first or that the line runs through them; leave it out when it is well known |
| `date` | when they first made, used or named it (`"-2900"`); `"circa": true` when the date is approximate (most are) |
| `end` | optional: when it was completed, for something that took long |
| `at`, `place` | where it began: `[lon, lat]` and `{ "en", "es" }` as a reader would say it today ("Uruk, near Samawah, Iraq") |
| `text` | **required**, 40–240 characters: what it is and that we still use it. One or two sentences, plain and vivid |
| `details` | optional but wanted for most: 40–150 words: the story, how it worked, who carried it on, a striking fact. Shown when the reader taps "More" |
| `roots` | optional, at most 300 characters: what it was **built on**, credit to those before ("Built on Sumerian base-60 counting") |
| `path` | optional list of up to 14 steps, how it travelled to today (below) |
| `where` | **required**: who uses it today, as groups of countries (below) |
| `strong` | optional: the part of `where` where it is strongest or most visible (darker on the map) |
| `note` | **required**, at most 240 characters: who uses it today and how ("Every clock and watch: 60 minutes to the hour"; "Some 1.7 million people still speak Nahuatl in Mexico") |
| `words` | for `words` legacies (and others that gave words): the words (below) |
| `see` | optional, up to 8 links into the other collections (below) |
| `wiki` | `{ "en", "es" }` Wikipedia titles (`"es": ""` when Spanish Wikipedia has none) |
| `img` | optional Wikimedia Commons file name for the card's picture, when the article's own picture would be wrong |

### Categories

| `cat` | | for |
|---|---|---|
| `words` | 🗣️ Words and names | words in today's languages, place names, names of days and months, personal names |
| `writing` | ✍️ Writing and books | scripts, alphabets, writing materials, books, libraries, archives |
| `numbers` | 🔢 Numbers and maths | numerals, zero, base 60, geometry, algebra, units of counting |
| `time` | 📅 Time and calendars | calendars, the week, hours and minutes, sundials, the zodiac |
| `science` | 🔭 Science and medicine | astronomy, maps, medicine, surgery, chemistry, the scientific method |
| `build` | 🏛️ Buildings and cities | arches, domes, columns, concrete, city plans, roads, aqueducts, terraces |
| `tech` | ⚙️ Tools and technology | the wheel, glass, metals, irrigation, the compass, paper, printing |
| `food` | 🌽 Food and farming | crops and animals they bred or spread, dishes, drinks, ways of farming |
| `money` | 🪙 Money and trade | coins, banking, cheques, weights and measures, trade law |
| `law` | ⚖️ Law and government | written law, democracy, senates, juries, citizenship, postal systems |
| `ideas` | 💡 Ideas and beliefs | philosophy, logic, religions and festivals still kept, ethics, history writing |
| `arts` | 🎭 Arts and music | theatre, music, instruments, poetry forms, styles still used |
| `play` | 🎲 Games and sport | board games, ball games, the Olympics, chess, playing cards |
| `daily` | 👕 Daily life | clothes, cosmetics, perfume, soap, furniture, pets, hairstyles, hammocks |

### How (`how`)

| `how` | when |
|---|---|
| `invented` | they are the first known to make or do it (say "first known" in the text unless it is beyond doubt) |
| `developed` | they turned something older into what we use (the Greek alphabet added vowels to the Phoenician one) |
| `spread` | they carried it far beyond where it began (the Arabs and "Arabic" numerals from India) |
| `named` | they gave the **word** we use, even if the thing is older (Nahuatl *tomatl*, tomato) |
| `tamed` | they bred it from a wild plant or animal, or were among the first to farm it |
| `kept` | they preserved and passed on what others had lost (Arabic translations of Greek science) |

**Be honest about credit.** Many things have several homes. Write `how` for what *this* civilization did, put
earlier inventors in `roots`, and use `sure: "debated"` when scholars disagree. Never say the Mexica
domesticated maize (that was in the Balsas valley thousands of years earlier: they *grew* it, named dishes,
spread words) or that the Romans invented the arch (Mesopotamians and Etruscans used it first: the Romans
*developed* and *spread* it). Avoid popular myths (the Egyptians did not use enslaved workers to build the
pyramids as the films show; the Vikings did not wear horned helmets).

### Where it is used today (`where`, `strong`)

A list of groups of countries, added together; a group starting with `!` is taken away.

| Group | |
|---|---|
| `"world"` | every country |
| `"MEX"` | one country (ISO 3166 alpha-3) |
| `"lang:spa"` | countries with this official language (ISO 639-3: `spa`, `eng`, `por`, `fra`, `ara`, `que`, `grn`...) |
| `"branch:romance"`, `"family:indo-european"` | countries whose main language is of this branch or family |
| `"script:latin"`, `"script:arabic"`... | countries whose main script is this |
| `"religion:islam"`, `"religion:christianity-orthodox"`... | main religion (`religion:islam` matches every branch) |
| `"continent:south-america"`, `"subregion:western-asia"`... | places |
| `"org:eu"`, `"org:arab-league"`... | members of an organization |
| `"measure:metric"`, `"week:sun"`, `"clock:24h"`, `"drive:left"`, `"paper:a4"` | habits |

`--list groups` prints every group with how many countries it has. Examples:

- the alphabet's Latin letters: `["script:latin"]`; the Arabic script: `["script:arabic", "PAK", "IRN", "AFG"]`
- Quechua words in Spanish: `["PER", "BOL", "ECU", "ARG", "CHL", "COL"]`, `strong: ["PER", "BOL", "ECU"]`
- base 60 for time and angles: `["world"]`
- Roman law in civil codes: `["branch:romance", "DEU", "AUT", "CHE", "NLD", "BEL", "JPN", "KOR", ...]` with
  `!` for the common-law exceptions

Use `"world"` only for what really is everywhere (the hour, the calendar, glass, the wheel). For most legacies
the countries that use it are the point: think about who actually uses it, and say it in `note`.

### How it travelled (`path`)

Steps from the place it began to where it is used today. The map draws a line from the origin to step 1, step
1 to step 2 and so on; `"from": 0` draws the line from the origin instead, `"from": 2` from step 2, so a path
can branch (the Phoenician alphabet goes to Greece and to the Aramaeans).

```json
{ "at": [12.48, 41.89], "place": { "en": "Rome", "es": "Roma" }, "date": "-46",
  "by": { "en": "Julius Caesar and Sosigenes", "es": "Julio César y Sosígenes" },
  "note": { "en": "The Julian calendar: 365 days and a leap day every four years.", "es": "El calendario juliano: 365 días y un día bisiesto cada cuatro años." } }
```

`by` (who carried it) and `note` (what happened there, at most 240 characters) are optional; `circa` too.
Most legacies should have a path of 2–6 steps. Leave it out only when there is no real journey (a word
that went straight into Spanish in Mexico).

### Words (`words`)

```json
"words": [
  { "en": "tomato", "es": "tomate", "from": "tomatl (Nahuatl)", "means": { "en": "swelling fruit", "es": "fruta que se hincha" } },
  { "es": "cacahuate", "from": "tlālcacahuatl (Nahuatl)", "means": { "en": "earth cocoa bean", "es": "cacao de tierra" } }
]
```

`en` and/or `es`: the word today in English, Spanish or both (only one when the other language did not
borrow it). `from`: the original word with its language, at most 90 characters. `means`: optional, what it
meant.

**One word per entry.** Two words are two entries: `cacao` and `cocoa`, not `"cacao, cocoa"`, and `a.m.` and
`p.m.`, not `"a.m. / p.m."`. What a word means or where it is goes in `means`, not in brackets: `Ravivar` with
`means` "Sunday in Hindi", not `"Ravivar (Sunday in Hindi)"`. A saying that has commas in it ("veni, vidi, vici")
says `"phrase": true`; the app puts it in quotation marks when it lists words in a sentence. The builder stops at a
word with a slash or brackets, or with a comma and no `"phrase": true`. `type`: what kind of word, left out for an
ordinary word:

| `type` | |
|---|---|
| `name` | a person's given name or surname still in use: Susan (Egyptian *sšn*, lotus), Alexander, Julia, Xóchitl, Kofi |
| `place` | a place name still on the map: Mexico, Cádiz, Naples (*Neapolis*), Chicago, Ghana, Hawaii |
| `calendar` | the name of a day or a month: July, Thursday, *lunes* |
| `sky` | the name of a star, planet or constellation: Aldebaran, Mars, Orion, Matariki |

**Words and names come first on a civilization's page** ("They gave us words like paper, ebony and oasis; names
like Susan."), so give **several examples** wherever they really exist: a `words` legacy (or several, by theme)
for everyday words, and separate ones for personal names, place names, days and months or stars when the
civilization gave them. The builder warns when a civilization has fewer than 8 words and names in all. A `words` legacy can group many words on one theme ("Foods named in Nahuatl"), or tell the story of
one word ("Chocolate"). Check etymologies in a good dictionary (Merriam-Webster, Oxford, Etymonline, the
Real Academia Española's *Diccionario*); mark guesses with `sure: "likely"` or `"debated"`.

### Links (`see`)

Links into the other collections, so a reader can jump to the time-travel story:

- `"people/ancient-egypt"`: a story; `"people/ancient-egypt#3"`: its step 3 (steps count from 0)
- `"inventions:papyrus"`: a marker in a collection, which opens its story at its step

Find them with `--list stories <words>` and `--list items <words>`. Link the most relevant one or two.

### Wikipedia titles

Do **not** fetch Wikipedia, Wikidata or Wikimedia pages (no WebFetch, no curl). Use `--find en <words>` (or
`es`) to look up the exact titles: it asks QLever, a copy of Wikidata, and prints each English title with
the same article's Spanish title. Then run `--titles` on your file. A redirect does not count: use the
article's own title ("Ancient Egyptian calendar", not "Egyptian calendar").

## How many, and what to look for

Aim for a **thorough** list. The five the reader named first (Sumerians, Egyptians, Greeks, Mexica, Incas)
need **30–45 legacies** each; the others **18–30**. Cover as many categories as are true for that
civilization, and look beyond the famous: everyday things (soap, beer, cosmetics, pets, hairstyles, board
games), words and place names, units and habits (dozens, the 360° circle, the seven-day week), foods, ways of
building, ideas and institutions, and things that came back (adobe, terrace farming, raised fields).

Prefer things a reader **can still see or use**. Each `text` and `note` should make the link to today
clear: "Every time you check the time…", "If you have eaten a potato…".

## Style

- English is British: colour, centre, metre, theatre, plough, grey, recognise, organisation (but
  "civilization", as the rest of the app writes it). Spanish is **Latin American**: *ustedes*, never
  *vosotros*; *computadora*, *celular*, *papa*, *jugo*, *carro/auto*. Natural Spanish, not a word-by-word
  translation.
- Dates in text: "about 3000 BC" / "hacia el 3000 a. C.", "AD 79" / "79 d. C."; numbers as in each language
  ("1.7 million" / "1,7 millones").
- Plain words, short sentences. No "it is important to note". No exaggeration ("revolutionized the world").
- Be careful and respectful with living peoples, beliefs and sacred things; do not call cultures primitive.
- Coordinates to 2 decimals are enough for cities; check them (a dot in the sea is wrong).

## Example

See `_example.json` beside this file: a short Egyptian file with two legacies, one with a path and one with
words. Real files need at least 12.
