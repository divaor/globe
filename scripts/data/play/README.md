# Map games data

`build-borders.mjs` builds `public/data/play/borders.json`, the border graph of the map games (v0.24.0), and
`build-pins.mjs` builds `public/data/play/pins.json`, the places of Pin it (v0.25.0).

    node scripts/data/play/build-borders.mjs          # build
    node scripts/data/play/build-borders.mjs --fetch  # refresh the Wikidata check (wikidata-p47.json) first
    node scripts/data/play/build-borders.mjs --check  # in check:data: fails if the file is out of date or a difference is not reviewed

**Neighbours.** Two countries of the app's 1:50m map are neighbours when their outlines share an arc. For each border, the script finds which piece of each country touches it. A border that does not run through both countries' main pieces must be sorted in `border-rules.json`:
- `exclaves`: a smaller piece on the same continent. It counts, and the game shows its note (Kaliningrad, Nakhchivan, Cabinda, Dubrovnik, Gaza, Northern Ireland, East Thrace, Timor, New Guinea, Peninsular Malaysia).
- `overseas`: a region on another continent (French Guiana). It counts only when the player turns overseas regions on. `manual` entries are added although the 1:50m map does not have them (Ceuta and Melilla).
- `links`: tunnels and bridges that count as borders. Ferries do not.
- `add`: land borders too small for the map (Botswana–Zambia at Kazungula).
- `skip`: map units that are not countries (Siachen Glacier).

**Checks.** The graph is compared with the CIA World Factbook's neighbours and with Wikidata's P47. Each pair on only one side is printed until it is listed in `reviewed` with the reason.

**Rules of the games.** The routes, goals, knowledge rounds and daily route are in `src/play/route.ts`, and the scoring in `src/play/score.ts`. `scripts/test/play.mjs` checks both on this data.

## Pin it's places

    node scripts/data/play/build-pins.mjs          # build
    node scripts/data/play/build-pins.mjs --check  # in check:data: fails if the file is out of date, a pack has under 40 places, or a place has no name or position

Seven packs, gathered from the app's own data so a phone does not load every story to play: capitals (one per
country from the app's cities), World Heritage sites, great structures, battles (every war in Time travel), dishes,
inventions and museums (the stories' items). Each place is `[name, nombre, lon, lat, icon, note, nota]`; the note
(its country, or the place and date) is shown after the answer.

**The other games** need no file of their own: Higher or lower and Outline use the country facts and the map,
Grand tour the app's cities and the journeys stories, Name them all and Border chain the border graph. Their rules
and scoring are in `src/play/logic.ts`; `scripts/test/play.mjs` checks them.
