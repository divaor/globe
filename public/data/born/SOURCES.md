# Who was born here?

Built by `scripts/data/born/build-born.mjs` (README there).

| File | What | Source |
|---|---|---|
| `people.json` | 15,993 people, loaded first: the world's best known (12,259 with articles in 48 Wikipedias or more) and everyone the app features elsewhere, whatever their fame (lives, the people of the Time travel stories and legacies, the art guide's artists and architects: 4,783, of whom 3,734 are not among the best known). Name, years of birth and death, where they were born and (if they have died) where they died, a few words on what they were, and a field | Wikidata (CC0): humans with a year and a place of birth |
| `more.json` | 18,774 more people, loaded after it: each country's own best known below the global list, by the current country (P17) of their birthplace, down to 8 Wikipedias, up to a share scaled to its population (35 people and 2.5 more for each million, up to 400: Mexico 366, Spain 156, Iceland 36), and a few people readers asked for by name. The same rows, with places of its own | Wikidata (CC0) |

- **Places without coordinates:** a birthplace (or place of death) with no coordinates on Wikidata takes those of the place it lies in (P131, up to three steps up) and keeps its own name: Coyoacán, where Frida Kahlo was born, takes Mexico City's.
- **Field:** worked out by the build script from the first words of Wikidata's description ("Brazilian footballer": sport), or else from the person's occupations. The people of Lives on the map keep their life's field.
- **Names:** Wikidata's labels in English and Spanish; a few labels vandalised on Wikidata just now are set back to the person's name by hand (`NAME_FIX`, `DESC_FIX` in the build script).
- **Living people** are listed by birthplace only. The files have no place of residence for anyone.
- **Left out:** people known above all for a crime, even when the app features them elsewhere.
- **Portraits** are files on Wikimedia Commons (P18), asked live by the browser; each one's licence and author are read live from Commons and shown under it.
- The questions go to QLever, the University of Freiburg's public copy of Wikidata (https://qlever.dev/wikidata), which is refreshed from Wikidata's own dumps.
