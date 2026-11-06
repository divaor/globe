# Eras and ideas, Food through time, Great structures: authoring guide

Three time-travel collections share the story format of Wars and conquests:

| Collection | Folder | What a story shows |
|---|---|---|
| Eras and ideas | `scripts/data/eras/` | where a movement happened: its cities, people, works, inventions and how the ideas spread |
| Food through time | `scripts/data/food/` | where crops and animals were tamed, how foods travelled, where dishes were born |
| Great structures | `scripts/data/structures/` | where and when great structures were built, by whom, why and how |

**Read `scripts/data/conflicts/README.md` first.** It covers dates, the camera, sides and their territory
(`control` with area expressions), `moves` (routes), `events`, `aftermath` and sources, which work the
same here. `structures/seven-wonders.json` is a complete example that uses the catalogue.

## What is different from wars

- There are no `battles`, `casualties` or `deaths`.
- `sides` are optional (0 to 8). Use them for coloured regions (`control`: where the Renaissance flourished,
  the Fertile Crescent, the corn belt) and coloured routes (`moves`: how printing spread, how maize
  travelled, a voyage). A side's `name` is its legend label, so name it for what the colour means.
- `outcome` is the legacy: what the era, food or building left to the world (2–4 sentences).
- Markers, called **items**, are the heart of these stories: people, works, places, inventions, dishes,
  structures. A step shows items in two ways:
  - `places`: items written inside the step;
  - `show`: ids of items in the collection's shared catalogue (`_collection.json`).

  Each step's items pop up on the map. Items from earlier steps stay as small dots, and tapping any of
  them opens its card, with a picture from Wikipedia.
- `"catalog": "all"` at the top of a story makes a **time tour**: every catalogue item dated from the
  story's `start` to its last step appears on the map from its `date` on, while the steps tell the story
  and `show` the highlights (a step can also `show` an older item).

## Items

| Field | |
|---|---|
| `id` | needed in the catalogue (lowercase, hyphens: `great-pyramid-giza`); optional in `places` |
| `name` | `{ "en", "es" }` |
| `at` | `[lon, lat]`, precise (4 decimals) for buildings and sites; for a person, where the step's work happened |
| `cat` | a category id from `_collection.json` (below) |
| `icon` | optional emoji; defaults to the category's (✍️ for a writer, 🎭 for a theatre...) |
| `type` | optional: `person`, `work`, `place`, `invention`, `event`, `site`, `dish`, `crop`, `animal`, `structure`, `institution` (quizzes use it) |
| `date` | when it happened or was made: a work's creation, an invention, a dish's first record, the start of a building |
| `end` | optional: when it was finished (a building, a long work) |
| `life` | people only: `["born", "died"]` dates (`died` may be `null`) |
| `place` | `{ "en", "es" }`: where, as a reader would say it today ("Florence, Italy") |
| `text` | **required**: 1–2 sentences (about 220 characters at most): what it is and why it matters |
| `details` | optional: 60–150 words of story, shown on the card |
| `why`, `how`, `by` | optional (structures above all): why it was built, how (materials, workforce, techniques), who built or designed it |
| `size`, `status` | optional: dimensions; what is left today (standing, ruins, lost, rebuilt) |
| `facts` | optional: `[{ "label": {en, es}, "value": {en, es} }]`, e.g. a record, a famous quote, an ingredient list |
| `country` | optional: ISO A3 code of today's country of origin (dishes above all: the dish quiz uses it) |
| `wiki` | `{ "en": "Article title", "es": "Título del artículo" }`: the **exact** titles of the Wikipedia articles (the card shows their picture). Check that both exist, for example `https://en.wikipedia.org/api/rest_v1/page/summary/Mona_Lisa` and `https://es.wikipedia.org/api/rest_v1/page/summary/La_Gioconda`. |

A step usually shows 2–8 items; a story has 8–16 steps (up to about 20 for a big time tour) and 30–80 items.

**One thing, one entry.** A dish or structure that is in the catalogue is shown with `show`, not written again
in `places`. When the same person, place or crop appears in several stories of a collection, give it the same
`id` in each: each story keeps its own text, and Browse everything and the quizzes list it once. A full build
warns when two items of a collection have the same name.

## The collection file

`scripts/data/<folder>/_collection.json` holds the collection's `name`, its fixed `categories` (id, icon,
colour) and the `catalog`, a list of items with `id` that any story of the collection can `show`.
Catalogue items are listed once; several stories may show the same item. A big catalogue may be split
into extra files beside it, `_catalog-<part>.json`, each `{ "catalog": [...] }`; ids must be unique
across all of them.

- **Eras:** art, architecture, literature, music, philosophy, science, medicine, technology, exploration,
  politics, learning, economy, space, place.
- **Food:** crop, animal, site, bread, noodles, rice, stew, street, main, sweet, drink, ferment, spice, trade.
- **Structures:** megalith, pyramid, temple, church, mosque, fort, palace, city, bridge, water, tunnel,
  tower, monument, arena, science.

Don't add or rename categories without asking. Only one person edits a `_collection.json` at a time.

## Workflow

```sh
node scripts/data/build-conflicts.mjs --kind eras --only renaissance --check --lint --preview <dir>
node scripts/data/build-conflicts.mjs --kind structures --check          # the whole collection
```

Look at every preview PNG. The current step's items are large dots with their names, and earlier items
are small dots. Fix anything in the wrong place (a museum in the sea, a city on the wrong river).

## Content

- **Be accurate.** Check every date, place, attribution and figure, and give the sources you used.
  Wikipedia articles and their infoboxes are fine. When sources disagree, say "about" or give a range,
  and say so in the text.
- **Be fair and humane.** Name who paid the price: enslaved people on sugar and cotton plantations,
  colonial violence, child labour in early factories, famines, workers who died building great structures.
  Treat religions and cultures with respect, and credit the many places where ideas were born: paper,
  printing and gunpowder in China, mathematics in India and Baghdad, cacao and maize in the Americas.
- **Write plain, vivid language** for a curious general reader, in short sentences.
- **Spanish:** write natural Spanish with the usual Spanish names (Miguel Ángel, la Ilustración, Gutenberg,
  la Gioconda, el maíz). Put a space as the thousands separator (`40 000`) and write BC as `a. C.`.
- **Steps go in date order.** Each step's title is 2–6 words, and its text is 1–2 sentences (at most
  about 220 characters).
