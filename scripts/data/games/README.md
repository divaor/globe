# Games of the world: data

The stories of this collection (`<id>.json` here, format in `../STORIES.md`) name each Games or World Cup
with `"games": "summer-1936"`; the build (`../build-conflicts.mjs`, through `attach.mjs`) adds its teams,
colours, arcs and host city from the files below.

| File | What it holds | Made by |
|---|---|---|
| `games.mjs` | every Games (30 Summer, 25 Winter Olympics, 23 men's and 9 women's World Cups) and the Wikipedia articles they are read from | by hand |
| `_data/events.json` | each Games' host, dates, nations, athletes, events, teams (with their athletes), medal table; each World Cup's teams in FIFA's final ranking and its final; the revisions read | `build-games-data.mjs` |
| `_codes.json` | every IOC and FIFA code → the countries of today it colours (`@GB-ENG`, `@DE-E`... are areas drawn from `public/data/regions/`), names of the teams of the past and where their arcs start | drafted from datahub.io country-codes, checked by hand |
| `_hosts.json` | each Games' name in English and Spanish, its stadium (or the final's) and place, the final and the top scorer | drafted from `events.json` and the stadiums' coordinates on Wikipedia, checked by hand |
| `_away.json` | who boycotted, withdrew or was kept out of each Games, and why (`"override": true` for a team that took part in a small part first) | by hand, from Wikipedia |

## Re-run

```sh
NODE_USE_ENV_PROXY=1 node scripts/data/games/fetch-wiki.mjs        # the articles, into .cache/games/wiki/
node scripts/data/games/build-games-data.mjs --report              # check the table it reads
node scripts/data/games/build-games-data.mjs                       # write _data/events.json
node scripts/data/build-conflicts.mjs --kind games --check --lint  # then build the stories
```

`fetch-wiki.mjs --coords "Title" ...` and `--langlinks "Title" ...` look up articles' coordinates and Spanish
titles (into `.cache/games/`). Wikipedia limits how fast a client may ask; the fetcher batches its requests
and waits when told to slow down.
