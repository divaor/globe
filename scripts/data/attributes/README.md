# Country attribute data (map filters)

Builds `public/data/attributes/countries.json` (≈100 country-level fields in English and
Spanish, keyed by ISO 3166-1 alpha-3) and `public/data/attributes/minerals.json`
(natural resources by producer). Sources and licences: `public/data/attributes/SOURCES.md`.

## Re-run

```sh
D=/path/to/new/empty/scratch/dir        # downloads (~180 MB) – keep outside the repo
scripts/data/attributes/fetch_sources.sh "$D"

# income groups: the World Bank table is cached in an R data file -> CSV (needs `rdata`)
python3 -m venv /path/to/venv && /path/to/venv/bin/pip install rdata
/path/to/venv/bin/python -I scripts/data/attributes/extract_wdi.py "$D"

python3 -I scripts/data/attributes/build_attributes.py "$D"      # -> public/data/attributes/*.json
python3 -I scripts/data/attributes/validate_attributes.py       # coverage table, checks, spot checks
```

* `fetch_sources.sh` only downloads (curl, partial `git clone` + sparse checkout, npm tarballs
  unpacked with `tar`); nothing downloaded is executed. Reachable hosts needed: GitHub, ourworldindata.org, en.wikipedia.org, the npm
  registry (and PyPI for `rdata`).
* `build_attributes.py` uses only the Python standard library (3.9+). Run it with `python3 -I`
  and pass the download directory as an argument (it never imports from there). An optional
  second argument sets the output directory.
* Time zones come from the system IANA tz database through `zoneinfo` (2026e when built); a
  newer tzdata may change `utc_offset` / `daylight_saving` where rules changed.
* Without `derived/wdi_country.csv` the build still runs and just skips `income_group`.
* Olympic medals come from `scripts/data/games/_data/medals-alltime.json` (Wikipedia's all-time Olympic
  medal table, through Milano Cortina 2026, written by `scripts/data/games/build-games-data.mjs`); without it,
  from the Olympedia results (to 2022).
* The output is deterministic: two runs on the same downloads give byte-identical files.
* The field table in `SOURCES.md` can be regenerated with
  `python3 -I scripts/data/attributes/validate_attributes.py --markdown`.

## Files

| file | purpose |
|---|---|
| `fetch_sources.sh` | download all inputs into a scratch directory |
| `extract_wdi.py` | World Bank income classification: `WDI_data.RData` → `derived/wdi_country.csv` |
| `build_attributes.py` | main build: loads every source, derives fields, writes both JSON files |
| `factbook.py` | CIA World Factbook helpers (GEC → ISO mapping, number/unit/year parsing) |
| `religion.py` | largest religion + branch from the factbook "Religions" text |
| `compiled_languages.py` | language families/branches, Spanish names CLDR lacks, main-language fixes |
| `compiled_politics.py` | memberships (EU, NATO, …), monarchies, federations, World Cups, government-type vocabulary |
| `compiled_symbols.py` | vocabularies for national animals/plants/colours and natural resources (en/es/emoji) |
| `compiled_extra.py` | continents/regions, export products, Somaliland & Northern Cyprus, unit translations |
| `compiled_minerals.py` | approximate producer shares (USGS MCS 2025 etc.) for minerals.json |
| `validate_attributes.py` | coverage table, type/category checks, spot checks |

## countries.json format

```js
{
  "meta":   { "keys": "...", "attribution": "..." },
  "fields": { "<fieldId>": { "label_en", "label_es", "group", "type", "unit", "unit_es", "year",
                             "scale", "higherIs", "categories": { "<id>": { "en", "es", ["emoji"], ["color"] } },
                             "source", "license", "note" } },
  "data":   { "<ISO3>": { "<fieldId>": value } }
}
```

Types: `number`, `category` (string id), `list` (array of ids), `boolean`, `text`. Every id used in a
`category`/`list` field has an entry in that field's `categories`. Keys are ISO alpha-3, plus `XKX`
(Kosovo; Natural Earth `ADM0_A3` = KOS), `SOL` (Somaliland) and `CYN` (Northern Cyprus). Natural
Earth features with `ISO_A3` = -99 (France, Norway) match through `ISO_A3_EH` / `ADM0_A3`.

## Editing compiled facts

Compiled tables are plain Python dicts with a comment per non-obvious entry. Only add
well-established facts (no estimated numbers); mark new compiled fields with
`'compiled'` as the source key so `SOURCES.md` stays accurate.
