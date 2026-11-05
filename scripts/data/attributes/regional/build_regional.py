#!/usr/bin/env python3
"""Build public/data/attributes/regional-languages.json (the "Regional languages" filter).

    python3 -I -B scripts/data/attributes/regional/build_regional.py

The facts live in this folder: rl_europe.py, rl_asia.py, rl_africa.py and rl_americas.py list, region
by region (first-level regions as drawn by the app, Natural Earth admin-1), the languages spoken at
home, most spoken first; rl_langs.py has every language (English/Spanish name, family, L1 speakers);
rl_notes.py has per-country notes and rl_sources.py the sources. Only the standard library is used.
Checks: every key must be a region of public/data/base/admin1.json and every code a known language.
"""
import collections
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..'))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True

import rl_core  # noqa: E402
import rl_europe, rl_asia, rl_africa, rl_americas, rl_notes  # noqa: E402,F401  (they register entries)
from rl_langs import L  # noqa: E402
from rl_sources import SOURCES  # noqa: E402


def jload(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as fh:
        return json.load(fh)


admin1 = jload('public', 'data', 'base', 'admin1.json')
keys = collections.Counter(f"{g['properties']['a']}|{g['properties']['n']}" for g in admin1['objects']['admin1']['geometries'])
facts = jload('public', 'data', 'attributes', 'countries.json')
existing = facts['fields']['languages']['categories']
main = {cc: (d.get('languages') or [None])[0] for cc, d in facts['data'].items()}

problems, regions, notes = [], {}, {}
for k, e in rl_core.REGIONS.items():
    if k not in keys:
        problems.append(f'unknown region {k}')
        continue
    langs = e['langs']
    if len(set(langs)) != len(langs) or any(c not in L for c in langs):
        problems.append(f'bad languages {k} {langs}')
        continue
    if langs == [main.get(k.split('|')[0])]:
        continue  # just the national main language: nothing regional to show
    regions[k] = langs
    if e.get('note'):
        notes[k] = e['note']
problems += [f'assigned twice {k}' for k in rl_core.DUPS]
if problems:
    sys.exit('\n'.join(problems))

languages = {}
for c in sorted({c for v in regions.values() for c in v}):
    en, es, fam, spk = L[c]
    if c in existing and c != 'zho':  # the app's own names, except "Chinese" -> "Chinese (Mandarin)"
        en, es = existing[c]['en'], existing[c]['es']
    languages[c] = {'en': en, 'es': es, 'family': fam, 'speakers': spk}

out = {
    'asOf': '2026-11',
    'source': 'Compiled from national censuses and surveys where they exist (e.g. INE/IDESCAT, IGE, ISTAT, INEGI, '
              'INE Guatemala, INEI Peru, INE Bolivia, Pakistan 2023, Paraguay 2024, via citypopulation.de) and '
              'Wikipedia; estimates where no census asks about language. See SOURCES.md.',
    'license': 'CC BY-SA 4.0',
    'languages': languages,
    'regions': dict(sorted(regions.items())),
    'notes': dict(sorted(notes.items())),
    'countryNotes': dict(sorted(rl_core.NOTES.items())),
}
path = os.path.join(ROOT, 'public', 'data', 'attributes', 'regional-languages.json')
with open(path, 'w', encoding='utf-8') as fh:
    json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
with open(os.path.join(HERE, 'SOURCES.txt'), 'w', encoding='utf-8') as fh:
    fh.write('\n'.join(SOURCES) + '\n')
print(f'{path}: {len(regions)} regions, {len(languages)} languages, {len({k.split("|")[0] for k in regions})} countries')
