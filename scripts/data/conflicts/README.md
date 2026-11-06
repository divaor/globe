# Wars and conquests: authoring guide

Each file here describes one conflict for the "Wars and conquests" time-travel mode: who fought,
step by step what each side held, where armies moved, the big battles with their casualties,
declarations of war and treaties, optional longer details for each step, and what came after.
`scripts/data/build-conflicts.mjs` checks the files and turns them into `public/data/conflicts/`.
`alexander.json` is a complete example; read it first.

## Workflow

```sh
node scripts/data/build-conflicts.mjs --find mongol            # building blocks whose name matches
node scripts/data/build-conflicts.mjs --list countries          # today's countries (ISO A3 codes)
node scripts/data/build-conflicts.mjs --list admin1 ESP         # provinces/states of a country
node scripts/data/build-conflicts.mjs --list hist 1279          # polities on the 1279 historical map
node scripts/data/build-conflicts.mjs --only <id> --preview <dir>   # build one, draw every step as PNG
node scripts/data/build-conflicts.mjs --only <id> --check --lint  # also warn: sides overlapping, untranslated text...
node scripts/data/build-conflicts.mjs --check                   # validate everything, write nothing
```

Look at every preview PNG and fix what looks wrong (a side covering the sea, a gap, an arrow going
the wrong way, a battle in the wrong place). Historical maps exist for these years:
-123000 -10000 -8000 -5000 -4000 -3000 -2000 -1500 -1000 -700 -500 -400 -323 -300 -200 -100 -1
100 200 300 400 500 600 700 800 900 1000 1100 1200 1279 1300 1400 1492 1500 1530 1600 1650 1700
1715 1783 1800 1815 1878 1880 1900 1914 1920 1930 1938 1945 1960 1994 2000 2010 2026.

## File format

`scripts/data/conflicts/<id>.json`, where `id` is short, lowercase, with hyphens (`ww2`,
`hundred-years-war`). Every text is `{ "en": "...", "es": "..." }`.

| Field | |
|---|---|
| `id` | same as the file name |
| `name` | the conflict's usual name |
| `icon` | one emoji for the list (⚔️ 🏹 🐎 🛡️ 🚢 ✈️ 💣 🏰 ⛵ 🗡️ ...) |
| `era` | `ancient` (to 500), `medieval` (500–1500), `early-modern` (1500–1800), `modern` (1800–1945), `contemporary` (after 1945) |
| `region` | where, in a few words |
| `start`, `end` | dates of the conflict itself |
| `summary` | 1–2 sentences for the list |
| `camera` | `{ "lon", "lat", "zoom" }`: zoom 1 = whole globe, 2–3 = a continent, 4–6 = a country, up to 30 for a front or a siege |
| `sides` | 2–8 sides: `{ "id", "name", "color": "#rrggbb", "members"?, "derive"? }` |
| `casualties` | optional overall `{ "<side>" or "total": n or [low, high], "note"? }` |
| `casualtiesNote` | optional text about the overall human cost |
| `defs` | optional named areas reused by the steps (`{ "ref": "name" }`); they are worked out once, so they can't use `prev` or `cur` |
| `steps` | at least 3; see below |
| `outcome` | 2–4 sentences: what changed for good |
| `sources` | `[{ "title", "url" }]`, the pages you used (Wikipedia is fine) |

### Steps

| Field | |
|---|---|
| `date` | `YYYY`, `YYYY-MM` or `YYYY-MM-DD`; BC years are negative (`-334-05` = May 334 BC; no year 0). Steps go in date order. |
| `title` | short, 2–6 words |
| `text` | 1–2 sentences (at most about 220 characters), shown under the map |
| `details` | optional, 60–180 words, shown when the reader asks for more |
| `control` | territory of the sides at this date; sides left out keep their previous territory; `null` = none |
| `moves` | arrows: `{ "side", "path": [[lon, lat], ...], "label"? }`, in marching order |
| `battles` | `{ "name", "at": [lon, lat], "date"?, "winner": side or "none", "casualties"?, "result"?, "details"? }`; they pop up in date order (undated ones at the step's date) |
| `events` | `{ "icon", "text", "at"?: [lon, lat], "date"? }`: declarations of war, treaties, deaths of leaders, massacres, famines..., also shown in date order |
| `deaths` | optional cumulative death toll so far (n or [low, high]); only when a source gives one |
| `camera` | optional; where to look from this step on |
| `aftermath` | `true` for steps after the end of the fighting that show the result (new borders, partitions) |

`casualties` on a battle is `{ "<side>": n or [low, high], "note"?: text }` with the killed (or killed
and wounded, say which in the note) of each side, as the sources give them. Prefer ranges when
sources disagree, and say in the note when figures are ancient and unreliable.

### Territory

`control` values are area expressions:

| Expression | Meaning |
|---|---|
| `"DEU"` | a country of today (ISO A3, see `--list countries`) |
| `{ "a1": "ESP", "names": ["Navarre", "Gipuzkoa"] }` | provinces/states (`"except": [...]` or all of them) |
| `{ "hist": "Mongol Empire", "year": 1279 }` | a polity on a historical map (exact name, see `--list hist`) |
| `{ "poly": [[lon, lat], ...] }` | a polygon you draw (no more than 180° wide; don't cross ±180°) |
| `{ "land": [[lon, lat], ...] }` | the land inside a drawn polygon (real coastlines; the best way to draw) |
| `{ "land": <area> }` | the land inside any area |
| `{ "circle": [lon, lat], "km": 40 }` | a disc (a besieged city, a beachhead) |
| `{ "ref": "name" }` | an area from `defs` |
| `{ "prev": "side" }` / `{ "prev": true }` | that side's (or this side's) territory at the previous step |
| `{ "cur": "side" }` | that side's territory at this step (the side must come earlier in `sides`) |
| `[a, b, ...]` / `{ "union": [...] }` | union |
| `{ "and": [a, b] }` | intersection: `{ "and": ["RUS", { "poly": ... }] }` = the part of Russia inside the polygon |
| `{ "minus": [a, b, ...] }` | `a` without `b`, ... |

A side's `derive` is an expression evaluated at every step that doesn't set that side, for example
`"derive": { "minus": [{ "ref": "persian_empire" }, { "cur": "mac" }] }`: Persia is whatever of its
old empire Macedon doesn't hold yet. Setting a side to `null` ends it (and its `derive`) until a
later step gives it territory again.

Tips:

- Don't mix a country's code with its own provinces in one area (`["TUR", { "a1": "TUR", ... }]`, or
  `"TUR"` minus some Turkish provinces): the two outlines differ slightly, which leaves hairline gaps and
  slivers along coasts and borders, and can crash the geometry library. When any part of a side uses a
  country's provinces, write the whole country as `{ "a1": "TUR" }` (all its provinces) too.
- Build fronts from real pieces: the part of a country behind a front line is
  `{ "and": ["RUS", { "poly": [ ...front line points..., then far behind it ] }] }`.
- Use `prev` for gains and losses: `[{ "prev": true }, "FRA"]`, `{ "minus": [{ "prev": true }, "ITA"] }`.
- Sides should not overlap in a step; use `minus` / `cur`.
- Historical maps for the years around the conflict give ready-made empires; clip them with `and`.
- Territory is approximate. Aim for what a good school atlas shows, not trench-level detail.

## Content

- Be accurate: check dates, places and figures (Wikipedia infoboxes are a good start:
  `https://en.wikipedia.org/w/api.php?action=parse&page=<Title>&prop=wikitext&section=0&format=json`).
  Give the sources you used.
- Be neutral and humane: no glorification. Say who suffered: civilians, massacres, famines, genocides
  (for example the Holocaust in World War II) must be stated plainly and accurately.
- Plain, vivid language for a curious general reader. Short sentences.
- Spanish: natural Latin American Spanish with the usual Spanish names (Gengis Kan, Normandía, Stalingrado,
  Aníbal), thousands with a space (`40 000`), BC as `a. C.` (see `scripts/data/STORIES.md` for the words to use).
- Colours: clearly different from each other and from the beige land and blue sea; mid-dark tones
  (`#c0392b`, `#2e6f9e`, `#7d3c98`, `#16a085`, `#d4a017`, `#5d6d7e`, `#e67e22`, `#8e5a2b`...). Use the
  conventional ones where they exist (Axis dark grey or black-brown, Allies blue, the USSR red...).
- Steps: 8–25 for a major war, 5–12 for a smaller one. One step per turning point. The last steps
  show the outcome (`aftermath`) when borders changed.
