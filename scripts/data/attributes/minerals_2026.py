"""World production shares from the USGS Mineral Commodity Summaries 2026 (2025 estimates; uranium from the World
Nuclear Association, diamonds from the Kimberley Process), researched for v0.21.0 with a source for each commodity in
minerals_usgs2026.json. They replace the approximate 2024 shares of compiled_minerals.py and add the commodities that
yield the other elements (the "Where the elements come from" table links to them).

    python3 -I scripts/data/attributes/minerals_2026.py     (updates public/data/attributes/minerals.json in place)

build_attributes.py calls merge() too, so a full rebuild gives the same file.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'minerals_usgs2026.json')


def merge(minerals):
    """Replaces or adds every commodity of minerals_usgs2026.json in an (ordered) minerals dict; the energy entries
    (oil, natural gas, coal) are left as they are. Existing commodities keep their place; new ones follow by name."""
    with open(SRC, encoding='utf-8') as fh:
        new = json.load(fh)['commodities']
    added = []
    for key, c in new.items():
        d = {k: c[k] for k in ('en', 'es', 'emoji', 'unit', 'unit_es', 'year', 'source', 'license') if k in c}
        if c.get('approximate'):
            d['approximate'] = True
        for k in ('note', 'note_es'):
            if c.get(k):
                d[k] = c[k]
        d['elements'] = c['elements']
        d['producers'] = [list(p) for p in c['producers']]
        if key not in minerals:
            added.append(key)
        minerals[key] = d
    # New commodities after the old ones, sorted by English name.
    old = [k for k in minerals if k not in added]
    return {k: minerals[k] for k in old + sorted(added, key=lambda k: minerals[k]['en'].lower())}


if __name__ == '__main__':
    out = os.path.join(HERE, '../../../public/data/attributes/minerals.json')
    with open(out, encoding='utf-8') as fh:
        cur = json.load(fh)
    res = merge(cur)
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump(res, fh, ensure_ascii=False, indent=1)
    print('wrote', os.path.normpath(out), len(res), 'resources')
