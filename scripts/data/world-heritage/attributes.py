#!/usr/bin/env python3
"""Updates the "UNESCO World Heritage Sites" country fact in public/data/attributes/countries.json from
public/data/layers/heritage.json, the way scripts/data/attributes/build_attributes.py does, without rebuilding
the other facts (which need their downloads). Run after build.py."""
import json, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
ATTR = os.path.join(ROOT, 'public/data/attributes/countries.json')
wh = json.load(open(os.path.join(ROOT, 'public/data/layers/heritage.json'), encoding='utf-8'))
count = {}
for s in wh['sites']:
    if s.get('x') or s.get('merged'):
        continue
    for c in s['cc']:
        count[c] = count.get(c, 0) + 1
doc = json.load(open(ATTR, encoding='utf-8'))
changed = 0
for iso, row in doc['data'].items():
    old = row.get('unesco_sites')
    new = count.get(iso)
    if new is None:
        row.pop('unesco_sites', None)
    else:
        row['unesco_sites'] = new
    changed += old != new
f = doc['fields']['unesco_sites']
f['year'] = 2026
f['source'] = 'UNESCO World Heritage List after the July 2026 session, via Wikipedia and Wikidata (public/data/layers/heritage.json, made by scripts/data/world-heritage/build.py)'
f['license'] = 'CC BY-SA 4.0 (Wikipedia); CC0 (Wikidata)'
with open(ATTR, 'w', encoding='utf-8') as fh:
    json.dump(doc, fh, ensure_ascii=False, separators=(',', ':'))
print(f'unesco_sites: {changed} countries changed, {len(count)} with sites')
