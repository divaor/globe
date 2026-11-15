# Who was born here?

Built by `scripts/data/born/build-born.mjs` (README there).

| File | What | Source |
|---|---|---|
| `people.json` | About 12,000 well-known people: name, years of birth and death, where they were born and (if they have died) where they died, a few words on what they were, and a field | Wikidata (CC0): every human with articles in 48 Wikipedias or more and a place of birth with coordinates |

- **Field:** worked out by the build script from the first words of Wikidata's description ("Brazilian footballer": sport), or else from the person's occupations. The people of Lives on the map keep their life's field.
- **Living people** are listed by birthplace only. The file has no place of residence for anyone.
- **Left out:** people known above all for a crime.
- **Portraits** are files on Wikimedia Commons (P18), asked live by the browser; each one's licence and author are read live from Commons and shown under it.
- The questions go to QLever, the University of Freiburg's public copy of Wikidata (https://qlever.dev/wikidata), which is refreshed from Wikidata's own dumps.
