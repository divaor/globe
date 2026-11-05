"""Helpers for reading the CIA World Factbook JSON profiles (github.com/factbook/factbook.json).

The profiles are keyed by GEC codes (e.g. ``sp`` = Spain, ``gm`` = Germany); values are
free text such as ``"47.2 years (2025 est.)"``.  This module maps GEC -> ISO 3166-1 alpha-3
and offers small parsers for the numbers, units and years inside those texts.
"""
import glob
import html
import json
import os
import re

# GEC codes the ``countries`` gem does not map (or maps to something we key differently).
GEC_EXTRA = {
    'kv': 'XKX',   # Kosovo (user-assigned code used by the app)
    'we': 'PSE',   # West Bank  -> merged with Gaza Strip into PSE
    'gz': 'PSE',   # Gaza Strip -> merged with West Bank into PSE
    'wi': 'ESH',   # Western Sahara
    'tw': 'TWN',   # Taiwan
    'sv': 'SJM',   # Svalbard  (Jan Mayen 'jn' is folded into SJM only if Svalbard is missing)
}
# Profiles that are not countries/territories we key (EU, World, oceans, tiny islands and
# reefs that Natural Earth either does not draw or folds into another feature).
GEC_SKIP = {'ee', 'xx', 'oo', 'xo', 'xq', 'zh', 'zn', 'at', 'cr', 'wq', 'bq', 'pf', 'pg',
            'ax', 'dx', 'jn', 'ip'}
# Profiles whose GEC code the gem does not carry but which have an ISO code.
GEC_KEEP = {'ay': 'ATA', 'fs': 'ATF', 'io': 'IOT', 'bv': 'BVT', 'hm': 'HMD', 'sx': 'SGS',
            'tb': 'BLM', 'um': 'UMI'}


def clean(text):
    """Strip HTML tags/entities and squeeze whitespace."""
    if text is None:
        return None
    text = re.sub(r'<br\s*/?>', ' ', text)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = html.unescape(text)
    return re.sub(r'\s+', ' ', text).strip()


def load_profiles(factbook_dir, gec_to_iso):
    """Return {ISO3: [ (gec, profile_dict), ... ]}.  PSE gets two profiles (West Bank, Gaza)."""
    out = {}
    for path in sorted(glob.glob(os.path.join(factbook_dir, '*', '*.json'))):
        region = os.path.basename(os.path.dirname(path))
        if region in ('meta', 'oceans', 'world'):
            continue
        gec = os.path.basename(path)[:-5]
        iso = GEC_EXTRA.get(gec) or GEC_KEEP.get(gec)
        if iso is None:
            if gec in GEC_SKIP:
                continue
            iso = gec_to_iso.get(gec)
        if not iso:
            continue
        with open(path, encoding='utf-8') as fh:
            prof = json.load(fh)
        out.setdefault(iso, []).append((gec, prof))
    return out


def node(profile, *keys):
    """Walk nested dict keys; returns None when missing."""
    cur = profile
    for k in keys:
        if not isinstance(cur, dict):
            return None
        if k in cur:
            cur = cur[k]
        else:
            # some keys carry stray spaces (e.g. 'total ')
            alt = [kk for kk in cur if kk.strip() == k]
            if not alt:
                return None
            cur = cur[alt[0]]
    return cur


def text(profile, *keys):
    n = node(profile, *keys)
    if isinstance(n, dict):
        n = n.get('text')
    if isinstance(n, str):
        return clean(n)
    return None


def latest_text(profile, section, field):
    """For fields keyed by year ('Real GDP per capita 2024': {...}) return (text, year) of the latest."""
    n = node(profile, section, field)
    if not isinstance(n, dict):
        return None, None
    best = None
    for k, v in n.items():
        m = re.search(r'(19|20)\d\d$', k.strip())
        if m and isinstance(v, dict) and v.get('text'):
            y = int(m.group(0))
            if best is None or y > best[1]:
                best = (clean(v['text']), y)
    if best:
        return best
    if n.get('text'):
        t = clean(n['text'])
        return t, year_of(t)
    return None, None


MULT = {'thousand': 1e3, 'million': 1e6, 'billion': 1e9, 'trillion': 1e12}


def number(t, allow_negative=True):
    """First number in a text, honouring 'million/billion/trillion' multipliers.

    '1.072 trillion cubic meters' -> 1.072e12 ; '$48,400' -> 48400 ; '-28 m' -> -28
    """
    if not t:
        return None
    m = re.search(r'(-|−)?\s?\$?\s?(\d[\d,]*(?:\.\d+)?|\.\d+)\s*(thousand|million|billion|trillion)?', t)
    if not m:
        return None
    raw = m.group(2).replace(',', '')
    try:
        v = float(raw)
    except ValueError:
        return None
    if m.group(3):
        v *= MULT[m.group(3)]
    if m.group(1) and allow_negative:
        v = -v
    return v


def year_of(t):
    """Year in parentheses like '(2023 est.)' or '(2021)'."""
    if not t:
        return None
    m = re.findall(r'\((?:[^()]*?)((?:19|20)\d\d)(?:-\d\d)?\s*(?:est\.?)?\)', t)
    if m:
        return int(m[-1])
    return None


def percent(t):
    if not t:
        return None
    m = re.search(r'(\d+(?:\.\d+)?)\s?%', t)
    return float(m.group(1)) if m else None


def name_and_metres(t):
    """'Pico de Teide (Tenerife) on Canary Islands 3,718 m' -> ('Pico de Teide (Tenerife) on Canary Islands', 3718)."""
    if not t:
        return None, None
    t = re.sub(r'\s*note\b.*$', '', t, flags=re.I).strip()
    m = re.search(r'^(.*?)[\s,]*(-|−)?\s?(\d[\d,]*(?:\.\d+)?)\s*m\b', t)
    if not m:
        return None, None
    name = m.group(1).strip(' ,;:-')
    v = float(m.group(3).replace(',', ''))
    if m.group(2):
        v = -v
    return (name or None), v
