# Deep time: authoring guide

**Deep time** (Explore menu, v0.45.0) is one animated timeline from the formation of the Earth (v0.45.0) and the Big
Bang (v0.46.0) to today. On the globe, the continents move (the plate model in `public/data/paleo/`), the climate
changes, the great events happen where they happened, and past species appear at their fossil sites while they
lived. At any moment the reader can stop and see:

- the eon, era and period;
- the Earth's vital signs (oxygen, carbon dioxide, temperature…), with a plain verdict on whether a person could
  survive there;
- what lived then, in the sea, on land and in the air.

**Play the whole story** flies through it all with a narration that stops at about 80 key moments.

This folder holds the sources; `build-deeptime.mjs` checks them and writes `public/data/deeptime/`.

```sh
node scripts/data/deeptime/build-deeptime.mjs --only                       # check every file (writes nothing)
node scripts/data/deeptime/build-deeptime.mjs --only species-mesozoic       # check one file
NODE_USE_ENV_PROXY=1 node scripts/data/deeptime/build-deeptime.mjs --only species-mesozoic --titles   # and its Wikipedia titles
NODE_USE_ENV_PROXY=1 node scripts/data/deeptime/build-deeptime.mjs --only species-mesozoic --pbdb     # and its ages against the Paleobiology Database
NODE_USE_ENV_PROXY=1 node scripts/data/deeptime/build-deeptime.mjs --find en tyrannosaurus           # Wikipedia titles with these words (en and es)
node scripts/data/deeptime/build-deeptime.mjs --list events                # ids already used (events, species, beats)
node scripts/data/deeptime/build-deeptime.mjs                              # build everything into public/data/deeptime/
```

Fix every `FAIL`. Read every `warn` and fix it unless you are sure it is fine.

## Time

Every time is in **Ma**, millions of years ago, as a number: `66.04` is 66.04 million years ago, `0.3` is
300,000 years ago, `4540` is 4.54 billion years ago, `0` is today. Use the ICS chart's ages for boundaries (the
app's `public/data/paleo/timescale.json` has them) and the best current dates for events. Where the date is
uncertain, give the best estimate in `ma` and the uncertainty in `err` (± Ma), and say so in the text.

## The files

| File | What | Written by |
|---|---|---|
| `vitals.json` | the Earth's vital signs through time, with sources | research helper |
| `events-*.json` | events: planet, climate, life's firsts, extinctions, impacts, eruptions, ice ages, continents; any number of files (`events-precambrian.json`…), all are read | research helpers |
| `species-*.json` | past species, any number of files (`species-paleozoic.json`, `species-mesozoic.json`…); all are read | research helpers |
| `script.json` | the narration of "Play the whole story": ordered beats | written last, from the events and species |

Files starting with `_` are ignored.

## `vitals.json`: the Earth's vital signs

```json
{
  "sources": [ { "id": "scotese2021", "title": "Scotese et al. 2021, Phanerozoic paleotemperatures, Earth-Science Reviews 215", "url": "https://doi.org/10.1016/j.earscirev.2021.103503" } ],
  "series": {
    "temp": { "src": ["scotese2021"], "points": [[0, 14.5], [0.02, 9, 7, 11], [56, 28, 25, 31], [66, 23]] }
  },
  "ice": [ { "from": 34, "to": 0, "kind": "south" } ],
  "notes": { "o2": { "en": "…", "es": "…" } }
}
```

`points` are `[ma, value]` or `[ma, value, low, high]`: the best estimate and, where known, a likely range. The
app draws a straight line between points, so give enough points to follow the real curve: more where it changes
fast (the Great Oxidation, the Great Dying, the PETM, the last ice age), at most one every 0.01 Ma near today.
Sort points from the youngest (0) to the oldest. Every series must reach back to **4540** (the Earth's first
days) or say in `notes` where it stops and why.

| Series | Unit | What |
|---|---|---|
| `o2` | % of the air by volume | oxygen (today 20.95) |
| `co2` | ppm | carbon dioxide (today 420; pre-industrial 280) |
| `ch4` | ppm | methane, where it mattered (the Archean haze); optional |
| `temp` | °C | the global mean surface temperature (today about 14.5) |
| `sea` | m | sea level compared with today (only where known, the Phanerozoic) |
| `day` | hours | the length of the day (the Earth spun faster; tidal rhythmites, models) |
| `moon` | thousand km | the Earth–Moon distance (today 384.4) |
| `genera` | count | marine animal genera known from fossils (Phanerozoic), as a guide to how varied life was |
| `ocean_ph` | pH | optional, where known |

The Sun's brightness is not a series: the app works it out from Gough (1981).

`ice` lists the times with permanent ice, each `{ from, to, kind }` in Ma:

| `kind` | |
|---|---|
| `snowball` | the whole Earth frozen, or nearly (Huronian, Sturtian, Marinoan) |
| `south` | an ice sheet on the south pole's land (Gondwana's in the Late Paleozoic, Antarctica's since 34 Ma) |
| `north` | ice sheets in the north too |
| `glacial` | a glacial maximum (the last one, about 26,000–19,000 years ago) |
| `caps` | small ice caps or mountain glaciers only |

**Sources:** peer-reviewed compilations, with a DOI or a university or agency page. Not Wikipedia. Good starting
points:

| Topic | Sources |
|---|---|
| Temperature | Scotese et al. 2021 (Phanerozoic); Westerhold et al. 2020 (Cenozoic); Judd et al. 2024 (PhanDA) |
| Carbon dioxide | Foster et al. 2017; the CenCO2PIP consortium 2023 (Cenozoic); Royer 2014 |
| Oxygen | Lyons et al. 2014 (Precambrian); Berner 2009 (GEOCARBSULF); Krause et al. 2018 |
| Sea level | Haq 2014, 2018; Miller et al. 2005, 2020 |
| Day length | Williams 2000; Mitchell & Kirscher 2023 |
| Moon distance | Waltham 2015 |
| Diversity | Alroy et al. 2008; Fan et al. 2020 (marine species, Science 367) |

## `events-*.json`

```json
{
  "events": [
    {
      "id": "chicxulub",
      "kind": "impact",
      "ma": 66.04, "err": 0.01,
      "name": { "en": "The asteroid strikes", "es": "Impacta el asteroide" },
      "at": [-89.52, 21.40],
      "r": 90,
      "text": { "en": "A rock about 10 km wide hit what is now Mexico's Yucatán…", "es": "Una roca de unos 10 km…" },
      "wiki": { "en": "Chicxulub crater", "es": "Cráter de Chicxulub" },
      "species": ["tyrannosaurus", "triceratops"]
    }
  ]
}
```

| Field | |
|---|---|
| `id` | lowercase letters, digits and hyphens; unique across events, species and beats |
| `kind` | see below |
| `ma` | when it happened, or began (Ma) |
| `to` | optional: when it ended (Ma), for things that lasted (an eruption, an ice age, an extinction pulse); younger than `ma` |
| `err` | optional ± Ma |
| `name` | `{ "en", "es" }`, at most 50 characters |
| `at` | optional `[lon, lat]`, **today's coordinates** of the place (the crater, the lava fields, the fossil site). The app moves it with its plate. Leave it out for global events (the Great Oxidation, a Snowball Earth) |
| `r` | optional radius in km of the area it covered (a crater's radius, the extent of a lava field) |
| `text` | `{ "en", "es" }`, 120–600 characters: what happened, why it mattered, how we know |
| `first` | optional `true` for a **first**: the first cells, the first animals, the first flowers… These get a pulse and a place in "Firsts" |
| `sure` | optional `"likely"` or `"debated"` (the oldest signs of life, the Late Heavy Bombardment) |
| `wiki` | `{ "en", "es" }` Wikipedia article titles (checked with `--titles`; `""` when there is no Spanish article) |
| `species` | optional ids of species tied to it |
| `item` | optional id of a marker in the Life through time stories (`node scripts/data/deeptime/build-deeptime.mjs --list items <words>`) |

| `kind` | The map shows |
|---|---|
| `planet` | the Earth itself: the magma ocean, the first ocean, the first continents, the Moon moving away |
| `impact` | an asteroid strike at `at`: the rock, the flash, the shock rings, the crater (`r`) |
| `volcano` | a great eruption (a large igneous province) at `at`, glowing over `r` km from `ma` to `to` |
| `ice` | an ice age or Snowball Earth (also list it in `vitals.json` `ice`) |
| `climate` | a climate event: a hothouse, the PETM, an ocean without oxygen |
| `air` | a change in the air: the Great Oxidation, the ozone layer |
| `continent` | a supercontinent forms or breaks up, an ocean opens, mountains rise, an isthmus closes |
| `life` | a milestone of life (with `first: true` for the firsts) |
| `extinction` | a mass extinction (`ma` to `to`), with how much died in `text` |
| `human` | our own story: the first humans, fire, art, farming |
| `cosmic` | (v0.46.0) the universe, the Sun and the solar system before the Earth |

## `species-*.json`

```json
{
  "species": [
    {
      "id": "tyrannosaurus",
      "name": { "en": "Tyrannosaurus rex", "es": "Tyrannosaurus rex" },
      "common": { "en": "T. rex", "es": "T. rex" },
      "group": "dinosaur",
      "icon": "🦖",
      "life": "land",
      "from": 68, "to": 66,
      "sites": [ { "at": [-106.9, 47.6], "place": { "en": "Hell Creek, Montana, United States", "es": "Hell Creek, Montana, Estados Unidos" } } ],
      "len": 12.3, "mass": 8400,
      "diet": "meat",
      "text": { "en": "One of the largest meat-eaters ever to walk…", "es": "Uno de los mayores carnívoros…" },
      "kin": { "en": "Birds, its living descendants; then crocodiles", "es": "Las aves, sus descendientes vivos; luego los cocodrilos" },
      "wiki": { "en": "Tyrannosaurus", "es": "Tyrannosaurus rex" },
      "pbdb": "Tyrannosaurus"
    }
  ]
}
```

| Field | |
|---|---|
| `id` | lowercase letters, digits and hyphens; unique across all files |
| `name` | `{ "en", "es" }` the scientific name (genus, or genus and species), at most 40 characters |
| `common` | optional `{ "en", "es" }` a common name, at most 40 characters ("Woolly mammoth", "Mamut lanudo") |
| `group` | `microbe`, `plant`, `invertebrate`, `fish`, `amphibian`, `reptile`, `dinosaur`, `flyer` (pterosaurs, early birds, flying insects), `mammal`, `human` (our genus and its relatives) |
| `icon` | one emoji |
| `life` | where it lived: `sea`, `fresh` (rivers and lakes), `shore`, `land`, `air` |
| `from`, `to` | when it lived: first and last appearance in Ma (`to: 0` for a living species, and set `alive: true`) |
| `alive` | optional `true`: still alive today (the coelacanth's lineage, horseshoe crabs, ginkgo, nautilus) |
| `sites` | 1–4 fossil sites, each `{ "at": [lon, lat], "place": { "en", "es" } }`, **today's coordinates**. The best-known finds first |
| `len`, `mass` | optional typical adult length in metres and mass in kg (leave out what is not known) |
| `diet` | `meat`, `plants`, `both`, `filter` (filter feeders), `small` (insects and small prey), `light` (photosynthesis), `chem` (chemicals, like vent microbes), `fish` |
| `text` | `{ "en", "es" }`, 120–500 characters: what it was like and why it matters |
| `kin` | optional `{ "en", "es" }`, at most 120 characters: its closest living relatives today |
| `wiki` | `{ "en", "es" }` Wikipedia article titles (`""` when there is no Spanish article) |
| `pbdb` | optional: the name to look up in the Paleobiology Database for `--pbdb` (the genus is usually best) |
| `item` | optional id of the same creature's marker in the Life through time stories |

**Ages:** use the Paleobiology Database (https://paleobiodb.org, CC BY) and recent papers. `--pbdb` compares
`from`/`to` with the database's first and last appearance of `pbdb` and warns when they differ by more than a
fifth. The database is often wider than the best estimate (it counts uncertain finds); keep your own value when you
are sure, with a source in your notes to the reviewer.

**Sites:** the places where its best fossils were found, with today's coordinates (the Paleobiology Database's
`/data1.2/occs/list.json?base_name=<name>&show=coords` lists them). The app moves each site with its plate.

**Choosing species:** famous ones first (the ones people ask about), then the ones that show a step in evolution
(a first fish with jaws, a fish with legs, the first seed plants, the first mammals, the first birds), then the
giants and the strange ones. Cover the sea, the land and the air, the plants too, in every period.

## `script.json`: the narration

```json
{
  "beats": [
    { "id": "beat-first-ocean", "ma": 4400, "focus": "first-ocean", "text": { "en": "…", "es": "…" } }
  ]
}
```

| Field | |
|---|---|
| `id` | unique, `beat-…` |
| `ma` | when the beat stops |
| `focus` | optional id of an event or a species: the camera flies to it and its card opens |
| `cam` | optional `[lon, lat, zoom]` (today's coordinates) when there is no `focus` |
| `text` | `{ "en", "es" }`, 80–420 characters: what the narrator says. Written to be **read aloud**: short sentences, no brackets, numbers in words where it reads better ("sixty-six million years ago") |

Beats are in order, from the oldest to today. The app flies between them faster through quiet times and slower
through busy ones.

## Style

- **English:** British spelling (colour, metre, sulphur → *sulfur* is the IUPAC spelling and is fine).
  **Spanish:** Latin American (*computadora*, *carro*), written naturally rather than translated word for word.
- Plain words for a curious 12-year-old and their parents. Explain a technical word the first time
  ("cyanobacteria, microbes that live off sunlight").
- Numbers: "about 66 million years ago", "252 million years ago"; in Spanish "hace unos 66 millones de años".
- Be honest about doubt: "the oldest **possible** signs of life", "many scientists think", "debated".
