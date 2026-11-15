# Lives on the map: authoring guide

A **life** follows one person on the map, place by place: where they were born, grew up and studied, where they
worked and made their great works, the moments that mattered, where they were exiled or imprisoned, and where they
died. It plays like any Time travel story: each step flies to a place, the route from the last place is drawn, and
the borders of that year are shown behind it.

Lives are written **only for people who have died**.

`frida-kahlo.json` is a complete example. Read it first.

## The file

One file per person, `scripts/data/lives/<id>.json` (the ids are in `_people.json`):

```json
{
  "id": "frida-kahlo",
  "qid": "Q5588",
  "name": { "en": "Frida Kahlo", "es": "Frida Kahlo" },
  "icon": "🎨",
  "field": "arts",
  "known": { "en": "Mexican painter", "es": "Pintora mexicana" },
  "born": "1907-07-06",
  "died": "1954-07-13",
  "summary": { "en": "…", "es": "…" },
  "steps": [ … ],
  "visit": [ … ],
  "legacy": { "en": "…", "es": "…" },
  "sources": [ { "title": "…", "url": "https://…" } ]
}
```

| Field | |
|---|---|
| `id` | the file name; from `_people.json` |
| `qid` | the person's Wikidata id; from their fact sheet |
| `name` | as each language usually writes it ("Michelangelo" / "Miguel Ángel", "Confucius" / "Confucio") |
| `icon` | one emoji for the person: 🎨 a painter, 🎻 🎹 🎤 🎸 a musician, ✍️ a writer, 🔭 🧪 🧬 a scientist, 👑 a ruler, ⚽ ⚾ 🥊 an athlete… |
| `field` | from `_people.json`: `science`, `letters`, `arts`, `music`, `leaders`, `rights`, `thought` or `sport` |
| `known` | a few words: who they were ("Mexican painter", "Composer of the Baroque", "Liberator of South America") |
| `born`, `died` | `YYYY-MM-DD`; `YYYY-MM` or `YYYY` when no more is known; years BC are negative (`-0069` is 69 BC; there is no year 0). Add `"bornAbout": true` or `"diedAbout": true` when the date is uncertain |
| `summary` | 1–2 sentences, 240 characters at most: why this life is worth following |
| `unsure` | optional, for the whole life: what is not known for certain ("Almost nothing certain is known of Hypatia's early life; the dates are historians' estimates.") |
| `steps` | the life, in date order (below) |
| `visit` | places you can visit today (below) |
| `legacy` | 2–3 sentences: what they left to the world |
| `sources` | at least two: `{ "title", "url" }` (Wikipedia articles are fine; add a biography, a museum or a foundation) |

## Steps

**8 to 14 steps** (4 at least, for a life we know little about; 16 at most). A step is one place and one date:

```json
{
  "date": "1925-09-17",
  "kind": "struggle",
  "place": { "en": "Mexico City, Mexico", "es": "Ciudad de México, México" },
  "at": [-99.1347, 19.4232],
  "title": { "en": "The bus crash", "es": "El choque del autobús" },
  "text": { "en": "…", "es": "…" },
  "details": { "en": "…", "es": "…" }
}
```

| Field | |
|---|---|
| `date` | when it happened, or when they arrived. `"about": true` marks an approximate date |
| `kind` | `born` · `home` (a home, family, childhood) · `study` · `career` (a job, a post, a workshop, a team) · `made` (a great work or discovery made here) · `moment` (a great moment: a concert, a match, a speech, a premiere, a battle) · `journey` · `love` (marriage, a great friendship) · `struggle` (prison, exile, war, illness, persecution) · `power` (crowned, elected, in command) · `honour` (a prize, a triumph) · `died` |
| `place` | where, as a reader would say it today: `{ "en": "Florence, Italy", "es": "Florencia, Italia" }`. For a place that has changed its name, today's name first: "Kaliningrad (then Königsberg), Russia" |
| `label` | optional: the short place name shown beside the step's date and age, when the first part of `place` would not do (`place` "Kaliningrad (then Königsberg), Russia" → `label` `{ "en": "Königsberg", "es": "Königsberg" }`) |
| `at` | `[lon, lat]`: the building when it is known (4 decimals), else the town |
| `title` | 2–6 words |
| `text` | 1–2 sentences, 220 characters at most: what happened here |
| `details` | optional: 40–110 more words. Give them to the four or five steps that deserve a story |
| `unsure` | optional: `{ "en", "es" }`, one sentence on what is not certain about this place or date (see below) |
| `by` | optional: how they came here from the last step's place: `sea`, `air`, `river` or `land`. A sea voyage is drawn dashed with a ship; a flight with a plane. Leave it out when you don't know |
| `icon` | optional: one emoji for the traveller, when you know how they went: 🚶 on foot, 🐎 on horseback, 🚂 by train, 🚗 by car |
| `via` | optional: `[[lon, lat], …]`, points on the way here, for a voyage that would otherwise be drawn across land (Europe to India round the Cape: add points off West Africa, the Cape and Mozambique) |
| `places` | optional: up to 3 markers of this step: a work made here, a person met, a building (below) |

### Choosing the steps

- **Only the places that matter.** Keep where something important happened, or where they stayed for years:
  the birthplace, the school or master that formed them, the homes of their working life, the great works,
  the turning points, exile and prison, the death. Leave out the places they only passed through. A musician
  or an athlete who toured the whole world gets the few concerts, matches or cities that made history, not
  the tour.
- **The first step is the birth** (`"kind": "born"`, its date is `born`). **One step is the death**
  (`"kind": "died"`, its date is `died`). After the death a step can only be a `journey` (the body or ashes
  moved) or an `honour` (a state funeral, a late prize).
- **Several steps may share a place** (Kant never left Königsberg): give each the same `place` and `at`.
- **The age is added by the build** from `born` and the step's date; don't put it in the title. Do use it in
  the text when it helps ("At 15 she entered…").
- Tell it in order, and let each step stand on its own: someone may open the life at any step.

### When historians are not sure

For older lives, and for some modern ones, places and dates are uncertain. Say so, and still tell the life:

- `"unsure"` on a step, when the place or the date is a tradition or an estimate: "Tradition places his
  school at Stagira's Nymphaeum of Mieza; the ruins shown today were identified in the 1960s."
- `"about": true` on a step whose date is approximate; the app writes "c. 470 BC".
- `"bornAbout": true` / `"diedAbout": true` when the birth or death date is uncertain.
- `"unsure"` at the top of the file, when little is certain about the whole life.
- Where sources disagree, give the best-supported version and say that others exist. Don't present a legend
  as fact: say "according to Plutarch", "legend says".
- Use `at` for where historians place the event: the ancient site (Stagira, Carthage, Chang'an), not just the
  modern capital.

## Markers in a step (`places`)

The step's own place gets a marker by itself, named with the step's title. Add up to 3 more **when they add something**:

- **A work** made or shown here: `"cat": "opus"`, `"type": "work"`, `"by"` its maker, `at` **where it is now**
  when it can be visited (the museum), else where it was made. Say in the text where it is today.
- **A person** they met, married or worked with here: `"cat": "person"`, `"type": "person"`, with `"life":
  ["born", "died"]`. When that person has a life of their own in `_people.json`, give the item that life's
  `id`.
- **A building or site** of the step: `"cat": "place"`, `"type": "site"` or `"structure"`.

They are ordinary story items (see `../STORIES.md`, "Items"): `name`, `at`, `cat`, `type`, `date`, `text`
(required, 1–2 sentences), and optionally `icon`, `by`, `life`, `details`, `wiki`, `img`, `whs`.

`wiki` is `{ "en": "Exact article title", "es": "Título exacto" }`, for the card's picture. Give it only when
you have seen that both articles exist; leave it out otherwise.

## Places to visit today (`visit`)

Up to 6 places a traveller can go to: the house where they were born or lived (above all when it is a museum),
their workshop or laboratory, their grave, a great memorial, the museum with their main works.

```json
{
  "name": { "en": "Frida Kahlo Museum (the Blue House)", "es": "Museo Frida Kahlo (la Casa Azul)" },
  "at": [-99.1625, 19.355],
  "kind": "house",
  "text": { "en": "…what you see there…", "es": "…" },
  "wiki": { "en": "Frida Kahlo Museum", "es": "Museo Frida Kahlo" }
}
```

`kind` is `house`, `museum`, `grave`, `memorial` or `site`. `at` must be the place itself (4 decimals). Only
list places that exist and can be visited now; a life with none has no `visit`. The build adds a last step,
"In their footsteps today", that shows them.

## Finding coordinates

Wrong coordinates are the commonest mistake. Don't write them from memory:

1. **The fact sheet** of each person has Wikidata's coordinates for their birthplace, place of death, grave,
   and the museums and memorials named after them.
2. **Towns:** `node scripts/data/lives/gazetteer.mjs "Stratford-upon-Avon"` gives a town's coordinates
   (add a country code to tell namesakes apart: `"Cambridge" GB`). `--near <lon> <lat>` lists the towns
   around a point.
3. **Buildings** (a house museum, a concert hall, a stadium, a grave): take the coordinates shown in its
   Wikipedia article or on its official site. If you can't find them, use the town's.
4. `--lint` warns when no town named in `place` lies within 35 km of `at`. Fix the coordinates, or name the
   nearest town in `place` ("Saint Helena" → "Longwood, Saint Helena").

## Writing

- **Be accurate.** Check every date, place and name against your sources; give the sources you used. The
  fact sheet's dates come from Wikidata and are sometimes wrong: where your sources say otherwise, follow
  the sources, and `--lint` will show the difference for the reviewer.
- **Be fair and humane.** Tell lives whole: the conquests and the people conquered, the fortune and the
  enslaved people who made it, the genius and the people around them who paid for it. No hagiography, no
  scandal for its own sake. Religious and political figures are told as history, with respect and without
  taking sides.
- **Write plain, vivid language** for a curious general reader, in short sentences. Prefer a concrete detail
  (what they saw, said, lost) to a general judgement.
- **Spanish:** natural Latin American Spanish with the usual Spanish names of people and places (Miguel
  Ángel, Londres, Nueva York, Florencia, Aquisgrán): computadora, auto, papa, jugo; never the words of Spain
  (ordenador, coche, patata, zumo, vosotros). Thousands with a space (`40 000`), BC as `a. C.`. Translate the
  meaning, not word by word.
- Quote only short, famous lines, and only when you are sure of them.

## Build and check

```sh
node scripts/data/build-conflicts.mjs --kind lives --only frida-kahlo --check --lint --preview <dir>
```

It must end with `ok   lives/<id>: …`. Read every warning: fix it, or be ready to say why it stands. Then
look at the preview PNGs: each step's marker must sit where it should (a house in the right town, nothing
in the sea).

Write only your own lives' files. Don't edit `_people.json`, `_collection.json`, `_facts.json` or the
scripts.

## Before you hand it in

- [ ] 8–14 steps, each one a place that mattered; the first is the birth, one is the death.
- [ ] Every date and place checked against a source; uncertain ones say so.
- [ ] Coordinates from the fact sheet, the gazetteer or a source, never from memory.
- [ ] English and Spanish for every text; the Spanish reads naturally.
- [ ] `--check --lint` passes and every warning is fixed or explained; the previews look right.
