#!/usr/bin/env python3
"""Sanity checks for public/data/attributes/{countries,minerals}.json.

    python3 -I scripts/data/attributes/validate_attributes.py [<dir>] [ISO3 ...]

Prints per-field coverage, checks types and that every category/list value has a
translated category entry, and prints a few countries for eyeballing.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
args = [a for a in sys.argv[1:] if a != '--markdown']
d = args[0] if args and os.path.isdir(args[0]) else os.path.normpath(
    os.path.join(HERE, '..', '..', '..', 'public', 'data', 'attributes'))
spot = [a for a in args if not os.path.isdir(a)] or ['USA', 'BRA', 'ESP', 'MEX', 'IND', 'CHN', 'NGA', 'AUS', 'JPN', 'GBR']

if '--markdown' in sys.argv:   # field table for SOURCES.md
    with open(os.path.join(d, 'countries.json'), encoding='utf-8') as fh:
        doc = json.load(fh)
    for fid, f in doc['fields'].items():
        n = sum(1 for rec in doc['data'].values() if fid in rec)
        print('| `%s` | %s | %s | %d | %s | %s |' % (fid, f['group'], f['type'], n, f['source'], f['license']))
    sys.exit(0)

path = os.path.join(d, 'countries.json')
size = os.path.getsize(path)
with open(path, encoding='utf-8') as fh:
    doc = json.load(fh)
fields, data = doc['fields'], doc['data']
errors = []
GROUPS = {'people', 'economy', 'culture', 'geography', 'politics', 'nature', 'energy', 'fun'}
TYPES = {'number', 'category', 'list', 'boolean', 'text'}
print('countries.json: %.0f KB, %d entities, %d fields' % (size / 1024, len(data), len(fields)))
print('%-28s %-9s %-9s %5s  %s' % ('field', 'group', 'type', 'n', 'source'))
for fid, f in fields.items():
    for k in ('label_en', 'label_es', 'group', 'type', 'source', 'license'):
        if not f.get(k):
            errors.append('%s: missing %s' % (fid, k))
    if f.get('group') not in GROUPS:
        errors.append('%s: bad group %s' % (fid, f.get('group')))
    if f.get('type') not in TYPES:
        errors.append('%s: bad type %s' % (fid, f.get('type')))
    cats = f.get('categories')
    if f['type'] in ('category', 'list'):
        if not cats:
            errors.append('%s: no categories' % fid)
            cats = {}
        for cid, c in cats.items():
            if not c.get('en') or not c.get('es'):
                errors.append('%s: category %s lacks en/es' % (fid, cid))
    if f['type'] == 'number':
        for k in ('unit', 'scale', 'higherIs'):
            if k not in f:
                errors.append('%s: number field lacks %s' % (fid, k))
    n = 0
    for iso, rec in data.items():
        if fid not in rec:
            continue
        v = rec[fid]
        n += 1
        t = f['type']
        ok = ((t == 'number' and isinstance(v, (int, float)) and not isinstance(v, bool)) or
              (t == 'boolean' and isinstance(v, bool)) or (t == 'text' and isinstance(v, str)) or
              (t == 'category' and isinstance(v, str) and v in cats) or
              (t == 'list' and isinstance(v, list) and all(x in cats for x in v)))
        if not ok:
            errors.append('%s.%s: bad value %r' % (iso, fid, v))
    print('%-28s %-9s %-9s %5d  %s' % (fid, f['group'], f['type'], n, f['source'][:60]))
    if n == 0:
        errors.append('%s: no data' % fid)
for iso, rec in data.items():
    for k in rec:
        if k not in fields:
            errors.append('%s: undeclared field %s' % (iso, k))
    if not (len(iso) == 3 and iso.isupper()):
        errors.append('bad key %s' % iso)

with open(os.path.join(d, 'minerals.json'), encoding='utf-8') as fh:
    minerals = json.load(fh)
print('\nminerals.json: %d resources' % len(minerals))
for rid, m in minerals.items():
    tot = sum(p[1] for p in m['producers'])
    bad = [p[0] for p in m['producers'] if p[0] not in data]
    print('  %-12s %-3s %3d producers, listed share %5.1f%%, top: %s' % (
        rid, m.get('emoji', ''), len(m['producers']), tot, ', '.join('%s %s' % (p[0], p[1]) for p in m['producers'][:4])))
    if tot > 100.5 or bad or not m.get('en') or not m.get('es'):
        errors.append('minerals %s: total %.1f, unknown %s' % (rid, tot, bad))

print('\nspot checks')
for iso in spot:
    rec = data.get(iso, {})
    print('--', iso)
    out = []
    for fid, v in rec.items():
        f = fields[fid]
        if f['type'] == 'category':
            v = '%s (%s)' % (v, f['categories'][v]['es'])
        elif f['type'] == 'list' and fid != 'borders':
            v = ','.join(v[:6]) + ('…' if len(v) > 6 else '')
        elif fid == 'borders':
            v = len(v)
        out.append('%s=%s' % (fid, v))
    print('   ' + '; '.join(out))

if errors:
    print('\n%d ERRORS' % len(errors))
    for e in errors[:80]:
        print('  ', e)
    sys.exit(1)
print('\nOK: no errors')
