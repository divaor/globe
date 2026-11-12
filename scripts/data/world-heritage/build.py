#!/usr/bin/env python3
"""Builds public/data/layers/heritage.json: every site on UNESCO's World Heritage List, for the World Heritage
filter and the cards of story items that are World Heritage sites.

Sources (fetched once with fetch.sh into .cache/v017/, which is not committed):
- Wikipedia, "List of World Heritage Sites by year of inscription": each site's UNESCO reference number, name,
  category (cultural, natural, mixed) and year, and the three sites removed from the list.
- Wikipedia, "List of World Heritage in Danger": the sites on the danger list now and before, with their years.
- Wikidata (CC0), by World Heritage Site ID (P757): coordinates, Spanish name, the English and Spanish Wikipedia
  articles, a picture on Commons, the selection criteria, the countries, and how many Wikipedias have an article.
- overrides.json (committed): fixes and Spanish names checked by hand, by reference number.

  python3 -I scripts/data/world-heritage/build.py            build
  python3 -I scripts/data/world-heritage/build.py --report   also list sites with no Spanish name or no picture
"""
import json, os, re, sys, unicodedata
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
CACHE = os.path.join(ROOT, '.cache/v017')
WIKI = os.path.join(CACHE, 'wiki')
OUT = os.path.join(ROOT, 'public/data/layers/heritage.json')
OVERRIDES = os.path.join(os.path.dirname(__file__), 'overrides.json')
AS_OF = '2026-07'
ROMAN = {'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9, 'x': 10}


def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'\(.*?\)', ' ', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return re.sub(r'\b(the|of|and|its|de|la|el)\b', ' ', s).split()


def parse_list():
    """One row per reference number, in order of inscription."""
    year, rows = None, {}
    for line in open(os.path.join(WIKI, 'List of World Heritage Sites by year of inscription.txt'), encoding='utf-8'):
        line = line.rstrip('\n')
        m = re.match(r'## (\d{4})', line)
        if m:
            year = int(m.group(1)); continue
        if not year or ' | ' not in line or line.startswith('Country |'):
            continue
        cells = [c.strip() for c in line.split(' | ')]
        if not re.fullmatch(r'\d+', cells[-1] or ''):
            continue
        ref, cat, site = int(cells[-1]), cells[-2], cells[-3]
        gone = re.search(r'\(delisted in (\d{4})\)', site)
        site = re.sub(r'\s*\((F|delisted in \d{4})\)', '', site).strip()
        if ref in rows:
            if gone:
                rows[ref]['delisted'] = int(gone.group(1))
            continue
        rows[ref] = {'ref': ref, 'name': site, 'cat': cat, 'year': year, 'delisted': int(gone.group(1)) if gone else None}
    return rows


def parse_danger():
    """[(name, [[from, to or None], ...])] for the danger list now and before."""
    out, prev_years = [], None
    for line in open(os.path.join(WIKI, 'List of World Heritage in Danger.txt'), encoding='utf-8'):
        cells = [c.strip() for c in line.rstrip('\n').split(' | ')]
        if len(cells) < 4 or cells[0] == 'Site' or not re.fullmatch(r'\d{4}', cells[2] or ''):
            continue
        years = cells[3]
        if not re.match(r'\d{4}', years):
            years = prev_years  # a cell shared with the row above (the Syrian sites)
        prev_years = years
        spans = []
        for a, b in re.findall(r'(\d{4})\s*[–-]\s*(\d{4})?', years or ''):
            spans.append([int(a), int(b) if b else None])
        out.append((cells[0], spans))
    return out


def wikidata():
    v = lambda r, k: r.get(k, {}).get('value', '')
    rows = json.load(open(os.path.join(CACHE, 'heritage/wikidata-sites.json')))['results']['bindings']
    links = {r['id']['value']: int(r['n']['value']) for r in json.load(open(os.path.join(CACHE, 'heritage/wikidata-sitelinks.json')))['results']['bindings']}
    by = defaultdict(list)
    for r in rows:
        ref = int(re.match(r'(\d+)', v(r, 'id')).group(1))
        designations = []
        for d in v(r, 'dess').split('|'):
            q, s, e = (d.split('@') + ['', ''])[:3]
            designations.append((q.rsplit('/', 1)[-1], s[:4], e[:4]))
        current = any(q == 'Q9259' and not e for q, s, e in designations)
        by[ref].append({
            'qid': v(r, 's').rsplit('/', 1)[-1], 'id': v(r, 'id'), 'en': v(r, 'en'), 'es': v(r, 'es'),
            'coord': v(r, 'c'), 'enwiki': v(r, 'ew'), 'eswiki': v(r, 'sw'), 'img': v(r, 'im'),
            'crits': [c for c in v(r, 'crits').split('|') if c], 'ccs': [c for c in v(r, 'ccs').split('|') if c],
            'current': current, 'links': links.get(v(r, 'id'), 0),
        })
    return by


def title(url):
    from urllib.parse import unquote
    return unquote(url.rsplit('/wiki/', 1)[-1]).replace('_', ' ') if url else ''


def commons_file(url):
    from urllib.parse import unquote
    return unquote(url.rsplit('/', 1)[-1]).replace('_', ' ') if url else ''


def point(wkt):
    m = re.match(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', wkt or '')
    return [round(float(m.group(1)), 4), round(float(m.group(2)), 4)] if m else None


def main():
    report = '--report' in sys.argv
    sites = parse_list()
    wd = wikidata()
    over = json.load(open(OVERRIDES)) if os.path.exists(OVERRIDES) else {}
    meta = json.load(open(os.path.join(ROOT, 'public/data/base/countries-meta.json')))
    # ISO codes to the app's country ids; a code shared by a country and its territories goes to the country.
    a2 = {}
    for k, m in meta.items():
        main = m.get('type') in ('Sovereign country', 'Country')
        if m.get('a2') and (m['a2'] not in a2 or (main and meta[a2[m['a2']]].get('type') not in ('Sovereign country', 'Country'))):
            a2[m['a2']] = k
    # Coordinates of the parts of a site, for a site whose own item has none (the first part's).
    parts = {}
    comp = os.path.join(CACHE, 'heritage/wikidata-components.json')
    if os.path.exists(comp):
        for r in json.load(open(comp))['results']['bindings']:
            ref = int(re.match(r'(\d+)', r['id']['value']).group(1))
            parts.setdefault(ref, point(r['c']['value']))
    # The danger list, matched to reference numbers by name.
    alias = {'Dubrovnik': 'Old City of Dubrovnik', 'Wieliczka Salt Mine': 'Wieliczka and Bochnia Royal Salt Mines'}
    danger, unmatched = defaultdict(list), []
    for name, spans in parse_danger():
        words = set(norm(alias.get(name, name)))
        best, score = None, 0.0
        for ref, s in sites.items():
            cand = [set(norm(s['name']))] + [set(norm(it['en'])) for it in wd.get(ref, [])]
            for c in cand:
                if not c:
                    continue
                j = len(words & c) / len(words | c)
                if j > score:
                    best, score = ref, j
        if best is None or score < 0.6:
            unmatched.append((name, round(score, 2), sites[best]['name'] if best else None))
            continue
        danger[best].extend(spans)
    out, missing_es, missing_img, missing_at = [], [], [], []
    for ref, s in sorted(sites.items(), key=lambda kv: (kv[1]['year'], kv[0])):
        items = wd.get(ref, [])
        # The item that stands for the site: on the list now, with articles and a place.
        want = set(norm(s['name']))
        def score(it):
            got = set(norm(it['en']))
            sim = len(want & got) / len(want | got) if want and got else 0
            return (it['current'] * 8 + sim * 6 + bool(it['enwiki']) * 4 + bool(it['eswiki']) * 2 + bool(it['coord']) + bool(it['crits']), it['links'])
        items = sorted(items, key=score, reverse=True)
        main_it = items[0] if items else {}
        at = point(main_it.get('coord')) or next((point(it['coord']) for it in items if it['coord']), None) or parts.get(ref)
        crits = sorted({ROMAN[m] for it in items for c in it['crits'] for m in re.findall(r'\(([ivx]+)\)', c)})
        cat = {'Cultural': 'c', 'Natural': 'n', 'Mixed': 'm'}[s['cat']]
        if crits:  # the category follows from the criteria: (i)-(vi) cultural, (vii)-(x) natural
            cult, nat = any(c <= 6 for c in crits), any(c >= 7 for c in crits)
            cat = 'm' if cult and nat else 'c' if cult else 'n'
        ccs = sorted({a2[c] for it in items for c in it['ccs'] if c in a2})
        # The Spanish name and the articles come from the site's own item only (another item may be one of its parts).
        es = main_it.get('es') or title(main_it.get('eswiki'))
        es = es[:1].upper() + es[1:]
        site = {
            'ref': ref,
            'n': [s['name'], es or s['name']],
            'at': at,
            'c': cat,
            'y': s['year'],
            'cc': ccs,
            'cr': crits,
            'w': [title(main_it.get('enwiki')), title(main_it.get('eswiki'))],
            'img': commons_file(main_it.get('img')) or next((commons_file(it['img']) for it in items if it['img'] and set(norm(it['en'])) & want), ''),
            'pop': max((it['links'] for it in items), default=0),
        }
        if danger.get(ref):
            site['d'] = sorted(danger[ref])
        if s['delisted']:
            site['x'] = s['delisted']
        o = over.get(str(ref), {})
        for k, val in o.items():
            if k == 'es':
                site['n'][1] = val
            elif k == 'en':
                site['n'][0] = val
            elif k == 'cc':
                site['cc'] = val
                site['ccx'] = 1  # the countries are fixed by hand: locate.mjs leaves them
            elif k != 'note':
                site[k] = val
        if not es and 'es' not in o:
            missing_es.append(ref)
        if not site['img']:
            missing_img.append(ref)
        if not site['at']:
            missing_at.append(ref)
        out.append(site)
    current = [s for s in out if 'x' not in s and not s.get('merged')]
    counts = {k: sum(1 for s in current if s['c'] == k) for k in 'cnm'}
    in_danger = [s for s in current if any(b is None for a, b in s.get('d', []))]
    doc = {'asOf': AS_OF, 'count': len(current), 'counts': counts, 'danger': len(in_danger), 'sites': out}
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    import subprocess
    subprocess.run(['node', os.path.join(os.path.dirname(__file__), 'locate.mjs')], check=True)
    print(f'{len(out)} sites written ({len(current)} on the list: {counts}; {len(in_danger)} in danger), {os.path.getsize(OUT) // 1024} KB')
    print(f'no Spanish name: {len(missing_es)}, no picture: {len(missing_img)}, no place: {len(missing_at)} {missing_at}')
    if unmatched:
        print('danger list rows not matched:', unmatched)
    if report:
        json.dump({'no_es': [{'ref': r, 'en': sites[r]['name'], 'enwiki': next((s['w'][0] for s in out if s['ref'] == r), '')} for r in missing_es],
                   'no_img': missing_img, 'no_at': missing_at}, open(os.path.join(CACHE, 'heritage/report.json'), 'w'), ensure_ascii=False, indent=1)
    if missing_at:
        sys.exit('every site needs a place: add "at" for these in overrides.json')


if __name__ == '__main__':
    main()
