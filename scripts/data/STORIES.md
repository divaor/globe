# Eras and ideas, Food through time, Great structures, Peoples and civilizations, Life through time, Games of the world, Journeys and trade routes: authoring guide

Seven time-travel collections share the story format of Wars and conquests:

| Collection | Folder | What a story shows |
|---|---|---|
| Eras and ideas | `scripts/data/eras/` | where a movement happened: its cities, people, works, inventions and how the ideas spread |
| Food through time | `scripts/data/food/` | where crops and animals were tamed, how foods travelled, where dishes were born |
| Great structures | `scripts/data/structures/` | where and when great structures were built, by whom, why and how |
| Peoples and civilizations | `scripts/data/people/` | human origins and migrations, and where civilizations rose and fell, with their capitals, works and what remains |
| Life through time | `scripts/data/life/` | the story of life on the drifting continents: first life, fossils, extinctions, dinosaurs, mammals, the Ice Age, tamed animals, species then and now (see [Life through time](#life-through-time) below) |
| Games of the world | `scripts/data/games/` | every Summer and Winter Olympics and every men's and women's World Cup, with the countries that took part, medals, champions and boycotts; the Tour de France and the great marathons (see [Games of the world](#games-of-the-world) below) |
| Journeys and trade routes | `scripts/data/journeys/` | great journeys followed leg by leg (Marco Polo, Ibn Battuta, Zheng He, Cook, the race to the Poles...) and the trade routes that carried silk, spices, gold, salt and silver, and enslaved people across the Atlantic (see [Journeys and trade routes](#journeys-and-trade-routes) below) |

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
| `type` | optional: `person`, `work`, `place`, `invention`, `event`, `site`, `dish`, `crop`, `animal`, `structure`, `institution`, `fossil` (a fossil find), `culture` (a civilization or people as a whole), `species` (a living or extinct kind of organism), `ship`, `goods` (a traded good) (quizzes use it) |
| `date` | when it happened or was made: a work's creation, an invention, a dish's first record, the start of a building. Dates older than 10,000 BC are written as years ago (14,400 years ago is `-14400`, 3.2 million years ago is `-3200000`); the app shows them as "14,400 years ago" |
| `end` | optional: when it was finished (a building, a long work) |
| `until` | optional: when it stopped existing (a civilization's fall, a city abandoned, a building lost). The card shows `date`–`until`, and a time tour takes it off the map after `until` |
| `life` | people only: `["born", "died"]` dates (`died` may be `null`) |
| `place` | `{ "en", "es" }`: where, as a reader would say it today ("Florence, Italy") |
| `text` | **required**: 1–2 sentences (about 220 characters at most): what it is and why it matters |
| `details` | optional: 60–150 words of story, shown on the card |
| `why`, `how`, `by` | optional (structures above all): why it was built, how (materials, workforce, techniques), who built or designed it |
| `size`, `status` | optional: dimensions; what is left today (standing, ruins, lost, rebuilt) |
| `facts` | optional: `[{ "label": {en, es}, "value": {en, es} }]`, e.g. a record, a famous quote, an ingredient list |
| `country` | optional: ISO A3 code of today's country of origin (dishes above all: the dish quiz uses it) |
| `wiki` | `{ "en": "Article title", "es": "Título del artículo" }`: the **exact** titles of the Wikipedia articles (the card shows their picture). Check that both exist, for example `https://en.wikipedia.org/api/rest_v1/page/summary/Mona_Lisa` and `https://es.wikipedia.org/api/rest_v1/page/summary/La_Gioconda`. |
| `img` | Optional. A Wikimedia Commons file name such as `"Pane di Pompei.jpg"` (no `File:`), for the card's picture when neither article has a lead picture of its own (the summary address above then has no `thumbnail`). It is used before the articles' picture. |

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
- **Peoples:** fossil, tools, art, journey, farming, city, temple, ruler, tomb, writing, knowledge, trade, war,
  person, place, culture.
- **Life:** microbe, invertebrate, fish, plant (plants and fungi), amphibian, reptile (sea reptiles too), dinosaur,
  flyer (pterosaurs and birds), mammal (mammals and their ancestors), tamed (tamed animals), event (Earth events:
  impacts, eruptions, ice ages), site (fossil sites and places), scientist (fossil hunters and scientists).
- **Structures:** megalith, pyramid, temple, church, mosque, fort, palace, city, bridge, water, tunnel,
  tower, monument, arena, science.
- **Games:** summer, winter, football (the host markers of the Olympics and World Cups), athlete (athletes and
  players), moment (a famous moment: a race, a goal, a ceremony), protest (protests, boycotts and bans), venue
  (stadiums, courses), cycling, running, ancient (the games of Olympia and other ancient games).
- **Journeys:** traveller (explorers, merchants, pilgrims, sailors, guides), city (cities and courts), port, caravan
  (oases, caravanserais, desert and mountain stations), ship (ships and fleets), goods (silk, spices, gold, salt,
  silver, porcelain...), encounter (peoples and rulers met), discovery (discoveries and science), book (the books
  and maps journeys left), nature (passes, capes, straits, rivers, glaciers), ice (polar camps, depots, the Poles),
  slavery (forts, ports, markets and ships of the slave trade), resistance (revolts, maroons, abolition), event
  (turning points: a landing, a death, a shipwreck).

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
- **Spanish:** write natural Latin American Spanish with the usual Spanish names (Miguel Ángel, la Ilustración,
  Gutenberg, la Gioconda, el maíz): papa, frijol, maní, jugo, crema, carne de res (ternera is veal), camarón,
  computadora, celular, auto, not the words of Spain (patata, judía, cacahuete, zumo, nata, gamba, ordenador,
  móvil, coche). Put a space as the thousands separator (`40 000`) and write BC as `a. C.`.
- **Steps go in date order.** Each step's title is 2–6 words, and its text is 1–2 sentences (at most
  about 220 characters).

## Life through time

`scripts/data/life/` tells the story of life, from the first microbes to the animals we live with. Its stories
are drawn on **the continents of their age**: a step older than 5 million years shows the continents where the
plate model of "Pangea to today" puts them at the step's date (Merdith et al. 2021, back to 1000 million years
ago), and every marker, route and camera on it moves with its plate.

- **Dates** are years ago, as negative numbers (up to ten digits): 66 million years ago is `-66000000`, 3.7
  billion years ago is `-3700000000`, 20,000 years ago is `-20000`. Steps go in date order; a story may end
  with a step in our time (`2024`).
- **Write every `at` as today's place**: the longitude and latitude where the fossil is found or the rock is
  today (4 decimals for a site). Do the same for `moves` paths, `events` and cameras. The app moves each point
  with the plate it is on, so a *Tyrannosaurus* from Montana appears where Montana was 66 million years ago,
  and fossils of the same animal in Africa, India and Antarctica come together on Pangea.
- **The map of a step**:
  - younger than 5 million years: today's map, as in the other collections (areas with `control` allowed:
    ice sheets, a species' range);
  - from 5 to 1000 million years ago: the continents of the step's age. These steps can't have territory
    (`control`): show items, `moves` and `events`. The coastlines are today's, moved with their plates (the
    model doesn't redraw old seas and shorelines), so don't describe a step as if the map showed a shallow
    sea or a vanished coast;
  - older than 1000 million years: today's land, greyed, because the plate model doesn't go back so far. Say
    in the text that the rocks are found today in Australia, Greenland..., not where they were.
- **Cameras** in old steps: point at a place on land today; the view follows it to where it was. Zoom 1–1.3
  shows a whole supercontinent. On a phone the view zooms out until the step's markers fit.
- **Items**: `type` is `species` for an organism, `fossil` for a famous find (a specimen with a name, a
  fossil bed), `site`, `event`, `person`, `place` or `animal` (a tamed animal). `date` is when it lived (the
  age of the fossil or the species' first appearance) and `until` when it died out; a living species has no
  `until`. Who found it and when goes in `details` or `facts`.
- **Eras**: `precambrian`, `paleozoic`, `mesozoic` or `cenozoic`, by the story's main period; a story about
  people (the fossil hunters) uses the human eras (`modern`...).
- **Check the previews**: in an old step the preview shows that age's continents with the markers where they
  were. `--lint` warns when a place is far from any land of the plate model or sits on land the model only
  adds later; look at those markers.
- **Be careful with science**: give ages as the sources do ("about 375 million years ago") and say when a find
  or an idea is debated. Write scientific names as plain text, with no markup (Tiktaalik, Tyrannosaurus rex).

## Games of the world

`scripts/data/games/` tells the story of the world's great sporting events. A step that **is** a Games or a
World Cup names it with `"games"`, and the build adds the rest from Wikipedia's data:

```json
{ "date": "1936-08-01", "games": "summer-1936", "title": {...}, "text": {...}, "details": {...}, "places": [...] }
```

- **Ids**: `summer-1896` … `summer-2024`, `winter-1924` … `winter-2026`, `wc-1930` … `wc-2026` (men's World
  Cup), `wwc-1991` … `wwc-2023` (Women's World Cup). The list and every Games' facts are in
  `scripts/data/games/_data/events.json`: host, dates, nations, athletes, events, the teams with their
  athletes, the medal table, and, for a World Cup, the teams in FIFA's final ranking and the final.
- **What the build adds to such a step** (don't write it):
  - every country coloured by how its team took part: host, won medals or took part (Olympics); champions,
    runners-up, host or took part (World Cups); boycotted, withdrew, banned or not invited (from
    `games/_away.json`). Teams of the past colour the countries they are today (the Soviet Union, Yugoslavia;
    England, Scotland, Wales and Northern Ireland, East and West Germany are drawn as their own areas);
  - an arc from each team's country to the host city;
  - the host city's marker (`games-summer-1936`, from `games/_hosts.json`) with the facts and the medal table
    (or the last four of a World Cup), shown first;
  - a camera on the host city, unless the step has one;
  - the legend's sides (`g_host`, `g_medals`, `g_champion`, `g_runnerup`, `g_took`, `g_boycott`, `g_banned`).
- **What you write**: the step's `title`, `text` and `details` (what made these Games: records, stars,
  politics, firsts), and 2–5 items with `places`: athletes and players (`type: "person"`, `cat: "athlete"`,
  `at` where they won or the venue; `country`: their country's ISO A3 code), moments (`type: "event"`, `cat:
  "moment"` or `"protest"`) and venues (`type: "site"`, `cat: "venue"`). Give a person who appears in several
  stories the same `id` everywhere (`jesse-owens`, `pele`, `simone-biles`).
- **Steps without `games`** are ordinary steps: the ancient Olympics at Olympia, the founding of the IOC, a
  boycott's story, a Tour de France route (`moves`), a marathon's course.
- **Be fair**: name the boycotts and who paid for them (athletes kept home), apartheid South Africa's
  exclusion, the 1968 protests and the Tlatelolco massacre, the Munich massacre, doping scandals as the
  sources state them (bans, stripped medals), women's long fight to compete, and the workers who died building
  some venues.

## Journeys and trade routes

`scripts/data/journeys/` follows great journeys leg by leg, and the trade routes that tied the world together.

- **The route is the story.** Give each traveller or expedition a side (`sides`: `{ "id", "name", "color" }`, the
  name is its legend label: "Marco Polo", "Amundsen's party", "Scott's party", "The caravans") and draw each
  step's stretch as a `moves` entry. The routes of earlier steps **stay on the map** as a thin, faded trail, so the
  whole journey so far is always in view (a story can turn this off with `"trail": false`).
- **A route** (`moves`) is `{ "side", "path": [[lon, lat], ...], "by"?, "icon"?, "label"? }`, in travelling order:
  - `path`: enough points to follow the real way: along coasts and around capes at sea, through the passes and oases
    on land, along a river's course. The app joins the points with great circles, so a long open-ocean crossing
    needs only a few points, but a coastal voyage needs one every few hundred kilometres. Start each step's route
    where the last one ended.
  - `by`: `"sea"`, `"land"`, `"river"`, `"ice"` or `"air"`. A sea route is drawn dashed, and `--lint` warns
    where it crosses more than 40 km of land (add points around the coast; canals such as Suez are fine).
  - `icon`: one emoji drawn at the head of the route as it is drawn, the traveller on the move: ⛵ 🚢 for ships, 🐪
    for a caravan, 🐎 for a rider, 🚶 on foot, 🛶 for a canoe, 🛷 for a sledge, ✈️ 🎈 for aircraft. Leave it out on the
    routes of the slave trade: there, draw the routes and tell the people's story, without a moving ship.
  - `label`: optional; the name of a road or a sea route ("The Incense Road", "The Middle Passage"), shown halfway
    along once it is drawn.
- **Cameras**: the view widens on its own to fit the step's route and items on a phone, so set the camera on the
  step's region at the zoom you'd like on a computer (2–3 for an ocean crossing, 4–6 for a country).
- **Items**: the places on the way (`city`, `port`, `caravan`, `nature`), the people met (`encounter`), the goods
  (`goods`, `at` where they came from or were traded), discoveries, books and maps, events. `type`: `person`,
  `place`, `site`, `event`, `work` (a book or map), `structure`, `culture`, `animal` (a giraffe, a horse), `ship`
  (a ship or fleet) or `goods` (a traded good). A traveller is an item too (`type: "person"`, `cat: "traveller"`, `at` where they were
  born or set out).
- **Dates**: a step's `date` is when that stretch ended (the arrival), with day and month when they are known.
  Say "about" in the text when the sources only give a year or disagree.
- **Be fair and humane.** The people met were not "discovered": name them and their lands (the Tupinambá, the
  Lakota, the Mandan, the Māori, the Inuit) and say how the encounter went for them: guides and interpreters
  (Sacagawea, Tupaia, Enrique of Malacca), violence and disease, land taken. On trade routes, say who did the work:
  porters, sailors, miners at Potosí, the enslaved. **The Atlantic slave trade** is told plainly, with the numbers
  of the Trans-Atlantic Slave Trade Database (about 12.5 million people embarked, about 10.7 million landed),
  the conditions of the Middle Passage, the resistance (revolts on ships, maroons, the Haitian Revolution), the
  long road to abolition, and its legacy; no euphemisms ("enslaved people", not "slaves" as a label for a people;
  "slave traders", "enslavers").
