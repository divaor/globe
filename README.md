# Atlas Globe

A detailed, colourful, installable world globe (PWA). Stack any of ~140 map filters, morph between 14
projections, travel through 123,000 years of borders and a billion years of plate tectonics, and leave it
spinning full-screen as an ambient display. English and Spanish.

- **App:** https://divaor.github.io/globe/ (GitHub Pages, deployed from `main`)
- **Install:** open it in Chrome, Edge or Safari, then "Install app" / "Add to Home Screen". Works offline after the first visit.

| | |
|---|---|
| ![Political globe](docs/screenshots/globe.jpg) | ![Robinson projection](docs/screenshots/robinson.jpg) |
| ![Earth at night](docs/screenshots/night.jpg) | ![Köppen climate](docs/screenshots/climate.jpg) |
| ![Borders in 1400](docs/screenshots/history.jpg) | ![Pangea](docs/screenshots/pangea.jpg) |
| ![Flags on the map](docs/screenshots/flags.jpg) | ![Live layers](docs/screenshots/live.jpg) |

## What it does

- **Political map (default):** every country has its own shade; the colour family shows its continent.
  Capitals, cities and sea names appear as you zoom. Tap a country for a card with its flag and facts.
- **Navigation:** drag with fling, pinch, mouse wheel, double-tap, keyboard; search any country or city.
- **14 projections, smooth morph:** Globe, Plate Carrée, Mercator, Miller, Robinson, Winkel Tripel, Equal Earth,
  Natural Earth, Mollweide, Gall–Peters, Eckert IV, azimuthal equidistant, Lambert azimuthal, stereographic.
  Every filter (vector and imagery) works in every projection.
- **Filter stack:** turn on several filters, set opacity and order; each has a legend (tap an entry to highlight
  its countries) and values in the country card. Filters include:
  - Political: time zones with live clocks, alliances (EU, NATO, G20, BRICS…), government, independence…
  - People: population, density glow, life expectancy, median age, languages (main / family / branch), writing
    systems (the script of each country's main language, with a letter of each), religion…
  - Climate & weather: Köppen climate zones, temperature, rainfall, sea temperature, animated winds.
  - Landforms & water: mountain ranges, deserts, plateaus, peaks, rivers and lakes, shaded relief, elevation.
  - Flora & fauna: vegetation zones, forest cover, animal realms with the Wallace Line, 60 iconic animals,
    animated migrations, biodiversity hotspots, national animals and plants.
  - Earth science: tectonic plates by boundary type, volcanoes, animated ocean currents.
  - Economy & energy: GDP, income groups, top producers of 21 resources (oil, lithium, cobalt…), CO₂, renewables…
  - Culture & fun: flags on the map, national colours, driving side, calling codes, Olympic medals and more.
  - World Heritage: every site on UNESCO's World Heritage List after the July 2026 session (1,273, plus the 3
    removed), by category or by year listed, with the 58 in danger ringed in red. "Watch the list grow" plays the
    years from the first 12 sites of 1978; a tap on a site opens its picture, Wikipedia's summary, its year,
    criteria and UNESCO's page, and a country's card counts its sites.
  - Where things were invented: the inventions of the Inventions stories where they were made, by age and field.
  - Imagery: NASA Blue Marble, yesterday's real satellite view (NASA GIBS), shaded relief, ETOPO.
- **Terrain in detail:** zoomed in, Shaded relief and Elevation are drawn by the GPU from terrain heights
  (Terrain Tiles on AWS: SRTM, GMTED, ETOPO1 and national data), and Satellite from Sentinel-2 cloudless 2016
  (about 10 m), for just the area on screen, sharper the closer you go; the zoom goes about four levels deeper. Tiles
  are kept in memory up to a cap and freed as you move on. In Settings: detail on or off, only on Wi-Fi (where the
  browser says how it is connected), and how much was downloaded. **Save an area for offline use** from the
  filter's legend: choose the detail, see the size first, and find the saved areas in Settings with their size and
  a delete button. **3D terrain** (the mountain button by the zoom buttons): the area on screen as a landscape on
  the curved Earth, draped with satellite, relief or elevation colours, with a slider that raises the mountains;
  drag to turn, pinch to zoom.
  - Live: day and night with city lights, earthquakes (USGS), weather now (Open-Meteo), the ISS.
- **Compare two filters:** any two country facts at once. Two numbers make a two-colour map (each in thirds,
  3 × 3 squares to tap) and a scatter chart linked to the globe both ways (tap a dot to fly to its country, tap
  a square to light its countries on the chart), with Spearman's ρ and Pearson's r in plain words, the
  countries furthest from the trend, and a reminder that correlation is not causation. A total against another
  (Olympic medals and population, oil and area…) can be divided ("per million people"). A category against a
  number gives a dot plot with medians; two categories give a cross table with Cramér's V. Start from the
  Filters panel, the More menu, or "Compare with…" in any country-facts filter's legend.
- **Time travel:** borders through time (54 maps, 123,000 BC → 2010) with start/end, play, speed and
  "What changed"; Pangea to today (Merdith et al. 2021 plate model, 1,000 Ma → today) with the geological time scale.
  Researched stories play step by step on the map, with territory, routes, markers and a card with a Wikipedia
  picture for every person, work, place, dish or building:
  - Wars and conquests: 26 conflicts, from Alexander and Rome to the World Wars, with battles and aftermath.
  - Eras and ideas: 11 stories, from classical Athens and the Islamic Golden Age to the Renaissance, the
    Enlightenment, the Industrial Revolution, modern art, rights and freedom, the Space Age and computing.
  - Food through time: 10 stories (the dawn of farming, maize, wheat, rice, the potato, the Columbian Exchange,
    spices, sugar, coffee, tea and chocolate) and 248 dishes of the world, with where and when they were born.
  - Great structures: about 220 structures from Göbekli Tepe to the Burj Khalifa (why, how and by whom), the
    Seven Wonders, the race to the sky, and bridges, canals and dams.
  - Peoples and civilizations: 18 stories and 936 items. The human story from Toumaï, 7 million years ago, to
    Homo erectus, the Neanderthals and Denisovans, Out of Africa, the peopling of the Americas and the
    Austronesian voyages; eleven civilizations (Mesopotamia, Egypt, the Indus, Persia, Kush and Aksum, ancient
    China, the Khmer, Ghana-Mali-Songhai, Great Zimbabwe and the Swahili coast, the Olmecs and Maya, the Andes);
    and 126 civilizations rising and falling in a time tour from 3300 BC to 1600. Dates before 10,000 BC read
    "N years ago".
  - Life through time: 13 stories, 198 steps and 539 fossils, sites, species and finders. A step older than 5
    million years is drawn on the continents of its age (the Merdith et al. 2021 plate model): every fossil moves
    with its plate, the continents drift from one step's age to the next, a tap on old land says what it is
    today, and a fossil's card gives the latitude it lay at. The stories run from the first life and the
    Cambrian explosion, through life coming ashore, the five mass extinctions, the dinosaurs, sea reptiles and
    pterosaurs, the age of mammals and the Ice Age giants, to the fossil hunters, where animals were tamed,
    species lost and saved, and ranges then and now. A time tour in 23 chapters places a catalogue of 136
    famous fossils on the drifting continents, from 3.7 billion years ago to today.
  - Games of the world: 11 stories, 130 steps and 431 items. Every Summer and Winter Olympics (1896–2026) and
    every men's and women's FIFA World Cup (1930–2026) is a step: each country is coloured by how it took part
    (host, champion, medals, took part, boycotted, banned or not invited), arcs fly from every team to the host
    city, and the host's card holds its medal table or last four. A tap on a country tells how its team did, or
    why it stayed away (Kazakhstan in 1980: part of the Soviet Union's team). Also the Women's World Cup from the
    1921 ban, a century of boycotts and bans, the Tour de France and the marathon, from Marathon to the first
    race under two hours.
  - Journeys and trade routes: 14 stories, 216 steps and 627 items. Each step draws the next stretch of the
    journey, with the traveller (a ship, a caravan, a sledge) moving along it, and the way already travelled
    stays on the map as a faded trail; sea routes are dashed and kept at sea. The journeys of Xuanzang, Marco
    Polo, Ibn Battuta, Zheng He, Magellan and Elcano, Cook, Lewis and Clark, the Arctic explorers and the race to
    the South Pole; the Silk Road, the incense and spice routes, gold and salt across the Sahara, silver and the
    Manila galleons, and the Atlantic slave trade, told plainly with the Slave Voyages numbers and the
    resistance. The peoples met are named, with the guides and interpreters the journeys depended on.
  - Religions and philosophies: 10 stories, 159 steps and 482 items. Where the faiths and schools of thought
    began and how they spread, told plainly and with respect: what believers hold is given as their belief
    ("Muslims believe…", "by tradition"), and debated dates are given as debated. Hinduism, Judaism, Buddhism,
    the first philosophers of Greece, India and China, Confucius, the Dao and the kami, Christianity, Islam,
    Sikhism, and the African faiths carried to the Americas; and a time tour of the world's faiths from Göbekli
    Tepe to today, with today's numbers of believers from the Pew Research Center (2020).
  - Writing and languages: 9 stories, 139 steps and 357 items. The separate inventions of writing in
    Mesopotamia, Egypt, China and Mesoamerica, the alphabet's journey from Egyptian pictures to Unicode, the
    characters of East Asia, scripts made by one person (Hangul, Cherokee, N'Ko…), the code breakers and the
    scripts still unread, the world's language families, the Indo-European languages, the Bantu expansion, and
    Spanish from Latin to the world. 161 cards show a sample in its own script (cuneiform, hieroglyphs,
    Phoenician, Brahmi, Mongolian in columns…), drawn with small font files that are fetched only for the
    letters on screen.
  - Plagues and cures: 11 stories, 177 steps and 498 items. How epidemics spread and how people learned to
    fight them, told plainly: death tolls are given as ranges with their sources, and the people wrongly
    blamed are named as wrongly blamed. The Black Death month by month, plague through the ages, smallpox from
    variolation to eradication, cholera and John Snow, germs and antibiotics, malaria, yellow fever and the
    mosquito, the 1918 flu, HIV and AIDS, COVID-19 (with the debate over its origin as it stands) and vaccines
    for all; and a time tour of medicine from Egypt's papyri to mRNA vaccines, with 103 healers, books,
    hospitals and discoveries.
  - Natural disasters: 9 stories, 144 steps and 352 items. Eruptions, earthquakes, tsunamis, floods and
    storms, and how far their effects reached. Some go hour by hour, in the local time of each place
    ("1 November 1755, 09:40"): Vesuvius in AD 79, the Lisbon earthquake and its tsunami across the Atlantic,
    Krakatoa, the Indian Ocean tsunami of 2004 and the tsunamis that crossed the Pacific, drawn as they
    spread. Also Tambora and the year without a summer, floods, storms and droughts since 1887, and time
    tours of volcanoes and of earthquakes, with today's plate boundaries.
  - Music and dance: 7 stories, 112 steps and 383 items, 90 of them with a short clip of a free recording on
    Wikimedia Commons. Tap play on a card, or turn on ♪ in the story bar to hear each step's clip while the map
    moves, in stories and in tours. A time tour from the Ice Age flutes of the Swabian Jura to streaming, with a
    catalogue of 93 instruments, styles, pieces and musicians; classical music from Bach's Leipzig to the Rite of
    Spring; instruments of the world, each with its own sound; jazz, blues and soul, from Congo Square to
    International Jazz Day; rock, pop and hip hop, from Bombay's film songs to Afrobeats; Latin rhythms; and dances
    of the world, from the Natya Shastra to breaking at the Paris Olympics. Music still under copyright has no clip.
  - Books and writers: 7 stories, 116 steps and 319 items, 105 of them with a famous line in its own language and
    script (Homer's Greek, Murasaki's Japanese, Ferdowsi's Persian…), with how it reads and what it means. A time
    tour from Gilgamesh to e-books with a catalogue of 96 books, writers and libraries; epics of the world; tales
    that travel, from the Panchatantra to Pinocchio; novels at the places where they happen; poetry of the world;
    literature in Spanish, from the jarchas to today; and the story of the book, from clay tablets to screens.
    Long quotes come only from texts in the public domain; books still under copyright get one short line.
  - Art of the world: 7 stories, 113 steps and 341 items. Each work sits where it was made, its card shows the work
    itself (to open full screen and zoom) and where it is now. A time tour from the ochre of Blombos Cave to street
    art with a catalogue of 109 works, artists and museums; cave and rock art; the ancient world; Renaissance and
    Baroque painting; art of Asia; Impressionism to modern art; and works taken in war and by empires, and
    returned, with each side's case. Works still under copyright have no picture.
  - Inventions: 10 stories, 163 steps and 539 items. Where things were invented and how they travelled: a time
    tour from the stone tools of Lomekwi, 3.3 million years ago, to generative AI, with a catalogue of 113
    inventions; China's four great inventions and their journeys west; keeping time, from shadow clocks to the end
    of the leap second; lenses, from Ibn al-Haytham to the Webb telescope; flight, from kites to drones; messages,
    from Inca runners to undersea cables; power, from water wheels to solar panels; everyday inventions; who really
    invented it, with the disputed firsts and forgotten inventors; and inventions from Latin America.
  - World Heritage: 4 stories, 61 steps and 170 items. How World Heritage began with the rescue of Abu Simbel;
    sites destroyed and rebuilt, from Warsaw to Mosul; saving nature's wonders; and Latin America's history told
    through its World Heritage. Any story card for a World Heritage site says when it was listed and whether it is
    in danger, with a link to UNESCO.
  - Browse and search every item of a story or a whole collection; shared links open a story at its step.
- **Explore:** measure distances (great circles, flight time), compare two countries, "true size" of countries.
- **Learn & play:** quizzes (find the country, flags, capitals, states and provinces of 48 countries, where in
  the world, when was it built or made, dishes of the world, which era, which civilization, which geologic
  period, who won, guess the link between two country facts, which journey, which faith, which script, which
  language family, which epidemic, which disaster, what are you hearing, which book is it from, who made it, which World Heritage site, who invented it), each ending with every answer and its picture; two games of time:
  Put them in order (four things from the stories, oldest first, then shown in order with their dates and pins on the
  map) and Time detective (a map of old borders with no names: which of four years is it from?); a daily challenge
  of seven questions, the same for everyone each day, with a streak and a result to share; your progress, with right
  answers, day streaks and badges for six subjects, the daily challenge and the tours (kept in this browser);
  guided tours (our planet, twenty cities through time, from Athens, Baghdad and Xi'an to Buenos Aires, Rio de
  Janeiro and Cusco, history and culture, Out of Africa, capitals of the ancient world, the dinosaur trail, the five
  mass extinctions, Olympic cities, World Cup finals, the Winter Games, great races, along the Silk Road, around
  the world under sail, to the ends of the Earth, gold, silver and spices, holy places, pilgrims' ways, writing
  is born, code breakers, the story of the alphabet, languages of the world, pandemics that changed history,
  medicine's great discoveries, tsunamis across the oceans, the year without a summer, disasters of the Ring of Fire, first lines,
  great libraries, masterpieces and where they are, sounds of the world, cities of music, Latin America's World
  Heritage, nature's wonders, lost and rebuilt, China's great inventions, from the telegraph to the Web, invented in
  Latin America); "On this day", any day of the year: what the Time travel stories tell of it, each opening its
  step, and Wikipedia's selection of events, linked to the story that tells the same event.
- **Personal:** visited / want-to-go travel map with stats, notes per country, PNG / 4K / phone wallpaper export.
- **Ambient mode:** full-screen rotating globe with your filters, screen kept awake, clock, optional filter cycling.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build (with service worker) into dist/
```

Browser checks (Playwright, pre-installed in CI images):
`node scripts/test/shot.mjs <url> out.png`, `scripts/test/hero-shots.mjs`, `phone.mjs`, `live-mock.mjs` (live APIs mocked).

## Adding a filter

A filter is one object implementing `LayerDef` (`src/layers/types.ts`). Most data filters are one call:

```ts
import { numericLayer } from './choropleth';
export const myFilter = numericLayer({
  id: 'my-filter', category: 'economy', icon: '📈',
  name: { en: 'My filter', es: 'Mi filtro' }, desc: { en: '…', es: '…' },
  palette: SEQUENTIAL.viridis, scale: 'log',
  values: () => ({ USA: 1, MEX: 2 /* ISO alpha-3 → value */ }),
});
```

Register it in `src/layers/index.ts`, or drop a module in `src/layers/packs/` whose default export registers
filters. Even simpler: add a field to `public/data/attributes/countries.json` (with `label_en`, `label_es`,
`type`…) and it becomes a filter automatically, and one Compare two filters can use (a number with
`"measure": "total"`, such as a production or a count, can also be divided by population, area or GDP).

## Data

All data are pre-built and committed under `public/data/`; the scripts that build them are in `scripts/data/`
(each folder has a README) and every folder has a `SOURCES.md` with sources, licences and attribution.
Main sources: Natural Earth (public domain), NASA Blue Marble and GIBS, NOAA ETOPO1 and ERSST, ECMWF ERA-Interim,
GPCP, Köppen–Geiger (Kottek/Rubel), GeoNames (CC BY 4.0), aourednik/historical-basemaps (GPL-3.0),
Merdith et al. 2021 plate model (CC BY 4.0), PB2002 plates (ODC-By), CIA World Factbook, World Bank,
Our World in Data (CC BY 4.0), mledoze/countries (ODbL), Unicode CLDR, flag-icons (MIT).
Time detective measures, for nine regions, which polities hold each borders map's land and how different two years
look there (`scripts/data/history/detective.mjs`, `public/data/history/detective.json`); On this day lists the
stories' dated steps and items by day (`scripts/data/build-onthisday.mjs`, `public/data/onthisday/`); and
`scripts/test/tours.mjs` checks that every tour stop opens a story step that exists.
The States and provinces quiz uses Natural Earth's admin-1 regions (`scripts/data/build-regions.mjs`; France,
Spain, Italy and the United Kingdom grouped into their regions). The Time travel stories are written from
Wikipedia and the sources listed in each story
(`scripts/data/conflicts/README.md`, `scripts/data/STORIES.md`); item pictures are Wikipedia page images,
loaded from Wikipedia when a card opens, or a Wikimedia Commons file named by the item. Each Games' host,
dates, nations, athletes, medal table or World Cup ranking, and who boycotted or was kept out, are read from
Wikipedia's articles on that Games (`scripts/data/games/README.md`, with the revisions read). The Journeys and
trade routes stories are written from the Wikipedia articles listed in each story; the numbers of the Atlantic
slave trade are those of the Trans-Atlantic Slave Trade Database (SlaveVoyages), as Wikipedia reports them. The Religions and
philosophies and Writing and languages stories are written from the Wikipedia articles listed in each story.
So are the Plagues and cures and Natural disasters stories, with figures from the WHO, UNAIDS and NOAA where
the stories say so; the tsunami fronts are computed from NOAA's seafloor depths and checked against the
arrival times that tide gauges recorded.
The Music and dance, Books and writers and Art of the world stories are written from the Wikipedia articles listed
in each story. Their clips are free recordings on Wikimedia Commons (public domain or Creative Commons, each credited
with its licence and a link to its page), streamed from Commons by the reader's browser only when played; quotes in
other languages come from Wikisource and the articles, translated plainly where no public-domain translation exists.
The Inventions and World Heritage stories are written from the Wikipedia articles listed in each story. The World
Heritage List (`public/data/layers/heritage.json`, made by `scripts/data/world-heritage/build.py`) comes from
Wikipedia's lists of World Heritage Sites by year of inscription and in danger, with places, pictures and articles
from Wikidata (CC0) and Spanish names from Spanish Wikipedia's lists by country; it also gives the country fact
"UNESCO World Heritage Sites".
The script samples use subsets of the Noto fonts (SIL Open Font License 1.1) and, for rare Chinese characters,
Jigmo (CC0), made by `scripts/data/build-fonts.mjs` (`public/data/fonts/`, with the licence in `OFL.txt`).

## Licence

Code: GPL-3.0-or-later. Data keep their own licences as listed in the SOURCES files.
