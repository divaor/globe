# Eras and ideas, Food through time, Great structures, Peoples and civilizations, Life through time, Games of the world, Journeys and trade routes, Religions and philosophies, Writing and languages, Plagues and cures, Natural disasters: authoring guide

Eleven time-travel collections share the story format of Wars and conquests:

| Collection | Folder | What a story shows |
|---|---|---|
| Eras and ideas | `scripts/data/eras/` | where a movement happened: its cities, people, works, inventions and how the ideas spread |
| Food through time | `scripts/data/food/` | where crops and animals were tamed, how foods travelled, where dishes were born |
| Great structures | `scripts/data/structures/` | where and when great structures were built, by whom, why and how |
| Peoples and civilizations | `scripts/data/people/` | human origins and migrations, and where civilizations rose and fell, with their capitals, works and what remains |
| Life through time | `scripts/data/life/` | the story of life on the drifting continents: first life, fossils, extinctions, dinosaurs, mammals, the Ice Age, tamed animals, species then and now (see [Life through time](#life-through-time) below) |
| Games of the world | `scripts/data/games/` | every Summer and Winter Olympics and every men's and women's World Cup, with the countries that took part, medals, champions and boycotts; the Tour de France and the great marathons (see [Games of the world](#games-of-the-world) below) |
| Journeys and trade routes | `scripts/data/journeys/` | great journeys followed leg by leg (Marco Polo, Ibn Battuta, Zheng He, Cook, the race to the Poles...) and the trade routes that carried silk, spices, gold, salt and silver, and enslaved people across the Atlantic (see [Journeys and trade routes](#journeys-and-trade-routes) below) |
| Religions and philosophies | `scripts/data/beliefs/` | where faiths and schools of thought began and how they spread, told neutrally: founders and teachers, sacred places, texts, missions and pilgrimages, councils and reforms, persecutions, and where each is followed today (see [Religions and philosophies](#religions-and-philosophies) below) |
| Writing and languages | `scripts/data/writing/` | the separate inventions of writing, how scripts spread and changed, the people who made and deciphered them, and how the great language families spread (see [Writing and languages](#writing-and-languages) below) |
| Plagues and cures | `scripts/data/plagues/` | where epidemics began and how they travelled, month by month where the sources allow, how people lived through them, and the discoveries, vaccines and medicines that fought them (see [Plagues and cures](#plagues-and-cures) below) |
| Natural disasters | `scripts/data/disasters/` | great eruptions, earthquakes, tsunamis, floods and storms, hour by hour where the sources allow, with their effects around the world, the science and the warnings that came after (see [Natural disasters](#natural-disasters) below) |

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
  and `show` the highlights (a step can also `show` an older item). `"catalog": "quakes"` makes a time tour of the
  items in `_catalog-quakes.json` only, for a collection with more than one time tour.

## Items

| Field | |
|---|---|
| `id` | needed in the catalogue (lowercase, hyphens: `great-pyramid-giza`); optional in `places` |
| `name` | `{ "en", "es" }` |
| `at` | `[lon, lat]`, precise (4 decimals) for buildings and sites; for a person, where the step's work happened |
| `cat` | a category id from `_collection.json` (below) |
| `icon` | optional emoji; defaults to the category's (✍️ for a writer, 🎭 for a theatre...) |
| `type` | optional: `person`, `work`, `place`, `invention`, `event`, `site`, `dish`, `crop`, `animal`, `structure`, `institution`, `fossil` (a fossil find), `culture` (a civilization or people as a whole), `species` (a living or extinct kind of organism), `ship`, `goods` (a traded good), `script` (a writing system), `language` (a language or a family of languages), `disease` (a disease or the germ that causes it) (quizzes use it) |
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
| `sample` | Optional. Some text in the item's own script, shown large on its card: `{ "text": "𐤀𐤁𐤂𐤃", "latin"?: "ʾalp bēt gaml dalt", "means"?: { "en", "es" } }`. `text` is 1–40 characters, `latin` how it reads in Latin letters, `means` what it means, shown as written: a translation in quotes (`"'water'"`) or a short note (`"the first four letters"`). A meaning that only repeats the sample ("Hello" for an English reader) is left out of the card. For scripts, languages, inscriptions and books (see [Writing and languages](#writing-and-languages)). |

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
  and maps journeys left), nature (passes, capes, straits, rivers, glaciers), camp (camps, forts and winter quarters),
  ice (polar camps, depots, the Poles),
  slavery (forts, ports, markets and ships of the slave trade), resistance (revolts, maroons, abolition), event
  (turning points: a landing, a death, a shipwreck).
- **Religions and philosophies:** founder (founders, prophets and teachers), thinker (philosophers and scholars), monk
  (monks, nuns and missionaries), sacred (sacred places and temples), text (sacred texts and books), learning (schools,
  monasteries, universities), pilgrimage (pilgrimages and festivals), spread (missions and conversions), ruler (rulers
  and states), council (councils, schisms and reforms), persecution (persecution and conflict), community
  (communities and diaspora), ancient (ancient rites and gods), art (art and music), event (turning points).
- **Writing and languages:** script (writing systems), inscription (inscriptions and tablets), book (books and
  manuscripts), printing (paper and printing), person (scribes, inventors and scholars), decipher (code breakers),
  language (languages), homeland (homelands and origins), city (cities and centres of learning), ruler (rulers and
  states), grammar (grammars and dictionaries), revival (languages lost and revived), code (codes and new media:
  Braille, Morse, Unicode), event (turning points).
- **Plagues and cures:** outbreak (outbreaks and epidemics: where a disease struck), disease (diseases and germs), carrier
  (rats, fleas, mosquitoes, bats and other carriers), route (how it travelled: ships, caravans, armies, railways, flights),
  scientist (doctors and scientists), discovery (discoveries), vaccine (vaccines), medicine (medicines and treatments),
  health (hospitals and public health: quarantine, sewers, the WHO), society (how people lived through it: work, wages,
  faith, daily life), persecution (blame and persecution), art (art, books and memory), event (turning points).
- **Natural disasters:** eruption (eruptions), quake (earthquakes), tsunami (tsunamis), flood (floods), storm (storms and
  cyclones), drought (droughts and famines), climate (effects on weather and climate: a year without a summer, red
  sunsets), town (towns and people hit), site (ruins and sites), witness (witnesses and writings), science (science and
  warnings), relief (rescue and rebuilding), art (art and memory), event (turning points).

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

## Religions and philosophies

`scripts/data/beliefs/` tells where the world's faiths and schools of thought began and how they spread. It is
**told neutrally**: as a good encyclopedia or a museum would, for readers of every faith and of none.

- **Spread on the map.** Give each tradition or branch whose colour means something a side ("Theravada",
  "Mahayana", "Vajrayana"; "Catholic", "Orthodox", "Protestant"; "Sunni", "Shia") and use `control` for the lands
  where it was the faith of most people at the step's date, approximately, as a school atlas would draw it. Grow it
  with `prev`. Sides should not overlap: where faiths shared a land, show the one most people followed, and say in
  the text who else lived there. When a map shows a ruler's lands rather than believers (a caliphate whose people
  were mostly not yet Muslim), say so in the text. `moves` (arrows) can show how a faith travelled: monks on the
  Silk Road, missionaries by sea, merchants across the Sahara (`by` and `icon` as in journeys are optional).
- **Items**: founders and teachers, sacred places, texts, schools, pilgrimages, missions, councils and reforms,
  persecutions, communities. A temple's `icon` may show its kind: ⛪ 🕌 🕍 🛕 ⛩️ ☸️ 🏯.
- **Neutral telling:**
  - Tell beliefs as beliefs and history as history: "Buddhists believe...", "According to the Gospels...", "Muslims
    believe the Quran was revealed to Muhammad...", "Historians date the oldest hymns of the Rigveda to about
    1500–1200 BC". Where tradition and historians differ (dates, authors, events such as the Exodus), give both
    without judging.
  - No faith is presented as true or false, better or worse. A living faith's sacred stories are "stories",
    "accounts" or "traditions", not "myths" or "legends" ("myth" is fine for the gods of ancient Greece or Egypt).
  - Use each tradition's own names, with respect and without honorifics in the text: the Buddha, Guru Nanak,
    Jesus, Muhammad, the Hebrew Bible, the Quran, the Guru Granth Sahib. In Spanish: el islam, el Corán, la
    Biblia hebrea, los sijs, el budismo, el hinduismo.
  - Say how each faith spread: by teachers, monks and missionaries, by traders, marriage and migration, and also by
    conquest, force or law, plainly and for every faith alike. The same goes for persecution, suffered and inflicted:
    the Roman persecutions of Christians, the Crusades, forced conversions, the Inquisition and the expulsions of
    Jews and Muslims from Spain, destroyed temples, libraries and books (Nalanda, the Maya codices), pogroms and the
    Holocaust, the violence of the Partition of India. Neither dwell on it nor leave it out.
  - Today's numbers: the Pew Research Center's estimates for 2020 (published in 2025), with "about"; say the source
    and year for other figures.
  - Don't take sides in today's disputes (holy places claimed by more than one faith, Israel and Palestine, Kashmir,
    Tibet): say what happened in neutral words, and say who claims what.
  - Pictures: the card shows the article's lead picture. Never use a picture that shows Muhammad's face (the article
    "Muhammad" leads with his name in calligraphy) or a portrait of the Báb or of Baháʼu'lláh (Baháʼís don't
    display them). Where an article leads with such a picture, set `img` to a respectful one (a shrine, a mosque,
    calligraphy).
- **The time tour** `faiths-through-time` shows the catalogue (`_catalog-faiths.json`): founding places, sacred
  places and texts of faiths old and new appear in their own time, while its steps tell the big picture. The other
  stories use `places` and the same `id` for the same thing.

## Writing and languages

`scripts/data/writing/` tells the separate inventions of writing, how scripts spread and changed, the people who
made and deciphered them, and how the great language families spread.

- **Spread on the map.** Sides for script families or language branches ("The Phoenician alphabet and its
  children", "Aramaic scripts", "Brahmic scripts"; "Romance", "Germanic", "Slavic"; "Bantu languages"), with
  `control` for where they were written or spoken at the step's date, approximately, grown with `prev`. Arrows
  (`moves`) can show how a script or a language travelled.
- **Samples.** Every script item gets a `sample`, and so does a language, an inscription or a book when its text
  can be typed in Unicode:
  - a script: its first letters in their traditional order, or a short word in it (its own name is nice):
    Phoenician `𐤀𐤁𐤂𐤃`, Greek `ΑΒΓΔ`, Cyrillic `АБВГД`, Hebrew `אבגד`, Arabic `ا ب ت ث`, Devanagari `अ आ इ ई`, Hangul
    `한글`, Cherokee `ᏣᎳᎩ`;
  - a language: a greeting or a well-known short phrase, with `latin` (how it reads) and `means`;
  - use the real Unicode characters (cuneiform, Egyptian hieroglyphs, Linear B, Phoenician, Brahmi, runes, Ogham,
    Gothic, Old Italic, Glagolitic, N'Ko, Vai, Bamum, Adlam, Cherokee, Canadian syllabics, Tifinagh, Mongolian,
    ʼPhags-pa...), checked against the script's Unicode chart. Scripts that are not in Unicode (Maya glyphs, the
    Indus signs, Proto-Sinaitic, rongorongo) have no sample; their card shows a picture.
  - The app carries the fonts for these scripts (`scripts/data/build-fonts.mjs`), so they show on every phone.
  - A script's `icon` may be one to three of its own letters instead of an emoji (`"𐤀"`, `"Α"`, `"Ꭰ"`): the map then
    shows the letter on its marker.
- **Say what is debated**: whether Egyptian writing was invented on its own or after Mesopotamia's; whether the
  Indus signs are writing; the Olmec Cascajal block; where the Brahmi script came from; the Indo-European homeland
  (the steppe hypothesis is favoured, the Anatolian hypothesis has supporters); the dates of the Bantu expansion.
  Give numbers of speakers with their source and year (Ethnologue, the sources' census).
- **Be fair**: name the peoples whose languages were banned or pushed out (Indigenous languages in boarding schools,
  Irish, Kurdish, Catalan under Franco), and credit the speakers, teachers and communities who kept them alive or
  revived them.

## Times of day

A step's `date` (and an item's) may carry a time: `"1755-11-01T09:40"`. Use it when steps are hours apart on the
same day (an eruption, an earthquake and its tsunami). It is the **local time at the place the step is about**, as
the sources give it, and the app shows it as "1 November 1755, 09:40". When a step's time is somewhere else's, say
so in its text ("at 07:58 in Aceh, 01:58 in London"). Times must go forward like dates do.

## Plagues and cures

`scripts/data/plagues/` tells where epidemics began and how they travelled, how people lived through them, and how
doctors and scientists learned to fight them.

- **Spread on the map.** Give the disease a side ("Plague", "Cholera's second pandemic", "Reported cases") and use
  `control` for the lands it had reached by the step's date, as historians' maps draw it, grown with `prev`. For the
  Black Death and other fast spreads, steps may be a month or a season apart (`"1348-06"`). `moves` (arrows) show
  how it travelled: ships from Caffa to Constantinople and Messina, caravans, armies, pilgrims, railways, steamships,
  flights. A second side can show something else that matters: where a vaccine campaign had reached, quarantine.
- **Items**: outbreaks (a town, a ship, a camp), the disease itself (`type: "disease"`), its carriers, doctors and
  scientists, discoveries, vaccines, medicines, hospitals and public health, how people lived through it, blame and
  persecution, art and books.
- **Numbers.** Deaths and cases are estimates: give them as ranges or with "about", with the source and year ("WHO
  estimates 14.9 million excess deaths in 2020–2021"), and say when historians disagree (the Black Death killed
  between a third and half of Europe's people, by different counts). No false precision.
- **Be fair and humane:**
  - Name the people hit hardest, and those blamed and persecuted: Jews murdered in 1348–1349 on the false charge
    of poisoning wells, foreigners and the poor, people with HIV and gay men in the 1980s, Asian people in 2020.
    Say plainly that the accusations were false.
  - Credit the many people behind the cures: variolation in China, India, Africa and the Ottoman Empire (Onesimus in
    Boston, Lady Mary Wortley Montagu), the Quechua healers who knew cinchona bark, Carlos Finlay, Kitasato
    Shibasaburō, Waldemar Haffkine, Tu Youyou, the orphan boys of the Balmis expedition, the health workers of the
    smallpox eradication campaign.
  - Say what is debated: where the Black Death began, where the 1918 flu began, the origin of SARS-CoV-2 (a natural
    spillover from animals or a laboratory accident; there is no consensus) without taking sides.
  - Names: "the 1918 flu" (explain why it was called the "Spanish flu"), "COVID-19", "HIV and AIDS". In Spanish:
    "la gripe de 1918", "la peste negra", "la viruela", "el sida".
  - Vaccines and medicines: tell what they did with the WHO's and historians' figures. This is history, not medical
    advice.
- **Pictures**: no pictures of dead bodies or of sick people's bodies (sores, rashes, wasting), and no photos of
  identifiable patients. Many disease articles lead with such a photo (smallpox, cholera, leprosy): set `img` to a
  map, a microscope image, an engraving, a poster, a hospital or a portrait instead. Paintings such as a Danse
  macabre are fine.
- **The time tour** `medicine-through-time` (`"catalog": "medicine"`) uses `_catalog-medicine.json`: physicians,
  hospitals, discoveries and medicines from the ancient world to today appear in their own time, while its steps tell
  the big picture. The other stories use `places`, with the same `id` for the same thing.

## Natural disasters

`scripts/data/disasters/` tells great eruptions, earthquakes, tsunamis, floods and storms: what happened hour by
hour, who was hit, how far the effects reached, and what science and warnings came after.

- **Hour by hour.** The first steps of a single disaster may be hours apart, with [times of day](#times-of-day): the
  eruption column, the first surges, the tsunami reaching each coast. Later steps move to days and years: relief,
  rebuilding, what science learned, the place today.
- **On the map:**
  - areas (`control`) for what was hit: the shaking felt, the ash fall, the flooded land, the cold summer of 1816;
  - a tsunami front as a ring over the sea: `{ "sea": { "minus": [{ "circle": [lon, lat], "km": 1600 }, { "circle":
    [lon, lat], "km": 1100 }] } }`, or the sea a wave had crossed by then: `{ "sea": { "circle": [lon, lat], "km": 1600 } }`.
    `sea` keeps only the sea inside an area, as `land` keeps the land. Draw the distances from the published
    travel-time maps (NOAA's), not from a constant speed: tsunamis are slower in shallow water;
  - `moves` (arrows) for a pressure wave, an ash cloud on the wind, a wave reaching a far coast, people fleeing.
- **Numbers**: magnitudes (Mw, and say when older ones are estimates), the Volcanic Explosivity Index (VEI), deaths as
  ranges with their source; say when estimates differ.
- **Be fair and humane:**
  - Name who was hit hardest and why: the poor in weak buildings, people under colonial rule, villages without
    warning. Credit the rescuers, the scientists and the people whose knowledge saved lives (the Simeulue islanders'
    *smong*, the evacuation before Pinatubo).
  - No sensationalism. Say plainly what is debated (the date of Vesuvius' eruption, the death toll of Tambora,
    whether Krakatoa inspired *The Scream*).
  - Climate change: say what the IPCC finds (more intense heavy rain, a larger share of the strongest tropical
    cyclones, higher seas), and link a single event to it only when an attribution study did, naming it.
- **Pictures**: no pictures of the dead, of bodies being recovered or of grieving survivors, and not the Pompeii
  body casts: use the place, the volcano, a map, a painting or a satellite image. Set `img` when an article leads
  with such a photo.
- **The time tours** `earthquakes-through-time` (`"catalog": "quakes"`, items in `_catalog-quakes.json`) and
  `volcanoes-through-time` (`"catalog": "volcanoes"`, items in `_catalog-volcanoes.json`) each show their own
  catalogue file, as the faiths tour does; the other stories use `places`, with the same `id` for the same thing.
