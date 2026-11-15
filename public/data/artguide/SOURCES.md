# Art and architecture data

Built by `scripts/data/artguide/build-artguide.mjs` (README there).

| File | What | Source |
|---|---|---|
| `collections.json` | 182 museums and their 2,226 best-known works, with artists, dates and pictures | Wikidata (CC0): works now in each museum's collection (P195, without an end date), ranked by how many Wikipedias write about them; museums from the travel guide's list (`public/data/guide`) |
| `architecture.json` | 4,877 notable buildings with their architects (P84), styles (P149), dates and pictures | Wikidata (CC0); the styles are grouped into 15 families by the build script |
| `nowin.json` | Where the art items of the Time travel stories are now | Wikidata (CC0): the collection of each item's Wikipedia article's item |

**Pictures** are files on Wikimedia Commons (P18), loaded by the browser; each one's licence and author are read live from Commons and shown under it. Most paintings and antiquities are in the public domain; photographs of buildings are mostly CC BY-SA.
