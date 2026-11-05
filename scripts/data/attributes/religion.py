"""Largest religion per country from the CIA World Factbook "Religions" text.

The text looks like "Roman Catholic 58.2%, atheist 16.2%, agnostic 10.8%, ..." or
"Christian 93.9% (Roman Catholic 58.6%, Protestant 35.3%), Muslim 3.4%, ...".
Algorithm: split the top-level items, classify each into (religion, branch), add up the
top-level shares per religion, take the largest religion (ignoring "other"/"unspecified"),
then the largest branch inside it (from the items or the parenthetical breakdown).
Missing branches fall back to hints in the text ("predominantly Sunni"), then to the
compiled defaults below, else the generic religion id is used.
"""
import re

CATEGORIES = {
    'christianity-catholic': ('Christianity – Catholic', 'Cristianismo – católico'),
    'christianity-protestant': ('Christianity – Protestant', 'Cristianismo – protestante'),
    'christianity-orthodox': ('Christianity – Orthodox', 'Cristianismo – ortodoxo'),
    'christianity-other': ('Christianity – other churches', 'Cristianismo – otras iglesias'),
    'christianity': ('Christianity (mixed or unspecified)', 'Cristianismo (varias o sin especificar)'),
    'islam-sunni': ('Islam – Sunni', 'Islam suní'),
    'islam-shia': ('Islam – Shia', 'Islam chií'),
    'islam-ibadi': ('Islam – Ibadi', 'Islam ibadí'),
    'hinduism': ('Hinduism', 'Hinduismo'),
    'buddhism': ('Buddhism', 'Budismo'),
    'judaism': ('Judaism', 'Judaísmo'),
    'shinto': ('Shinto', 'Sintoísmo'),
    'taoism': ('Taoism', 'Taoísmo'),
    'sikhism': ('Sikhism', 'Sijismo'),
    'folk': ('Folk or traditional religions', 'Religiones tradicionales o populares'),
    'none': ('No religion (unaffiliated)', 'Sin religión'),
}

NONE = r'\bnone\b|no religion|unaffiliated|atheis|agnostic|non-?believer|nothing in particular|irreligious|without religion'
IGNORE = (r"unspecified|not stated|no answer|refused|unknown|not applicable|don'?t know|no response|undeclared|"
          r"not specified|objected|other religion|^other\b|^others?$|non-christian")
OTHER_SUB = r'^other\s+(christians?|protestants?|evangelical\w*|catholic\w*|orthodox)\b'
VOCAB = [
    (r'believers? unaffiliated|believer \(not belonging|believer but not belonging|^believers?$', ('other', None)),
    (r'old catholic|polish catholic|catholic orthodox', ('christianity', 'other')),
    (r'roman catholic|catholic|maronite|uniate', ('christianity', 'catholic')),
    (r'orthodox|armenian apostolic|coptic|old believer', ('christianity', 'orthodox')),
    (r'church of jesus christ(?! in madagascar)|latter[- ]day|mormon|jehovah|kimbanguist|zion|apostolic sect|'
     r'african instituted|iglesia ni cristo|christian rationalism|god is love|\bmana\b|universal kingdom|'
     r'new apostolic|worship centre|traditions related to christ', ('christianity', 'other')),
    (r'protestant|evangeli|lutheran|anglican|church of england|church of ireland|episcopal|presbyterian|methodist|'
     r'baptist|pentecostal|adventist|reformed|calvinist|congregational|wesleyan|moravian|church of god|'
     r'assembl(y|ies) of god|uniting church|united church|salvation army|salutiste|brethren|mennonite|revival|'
     r'nazarene|church of norway|church of sweden|ekalesia|church of melanesia|south sea|christian fellowship|'
     r'church of tonga|free church|tokaikolo|full gospel|charismatic|born again|apostolic church|'
     r'church of jesus christ in madagascar|malagasy lutheran|awakening|celestial|cook islands christian|'
     r'church of tuvalu|churches of christ|bukot|gospel', ('christianity', 'protestant')),
    (r'christian', ('christianity', None)),
    (r'ibadi', ('islam', 'ibadi')),
    (r'\bshia|shi\'a|shiite|alawi|ismaili', ('islam', 'shia')),
    (r'sunni', ('islam', 'sunni')),
    (r'ahmadi|qadiani', ('islam', 'other')),
    (r'muslim|islam|sufi|bektashi', ('islam', None)),
    (r'hindu', ('hinduism', None)),
    (r'buddhis|lamaistic', ('buddhism', None)),
    (r'jewish|judaism', ('judaism', None)),
    (r'shinto', ('shinto', None)),
    (r'sikh', ('sikhism', None)),
    (r'taoist|daoist', ('taoism', None)),
    (r'folk|tradition|animis|indigenous|ethnic religionist|vodou|vodun|vodoun|badimo|winti|kirat|shaman|customary|'
     r'modekngei|umbanda|candombl|ancestral|maori|african american|pagan|confucian|spiritis|cargo cult|chondogyo|'
     r'prakriti|\bbon\b', ('folk', None)),
    (r"baha'?i|druze|zoroastrian|rastafari|jain|yazidi|scheduled caste|spiritualism|new age", ('other', None)),
]

# Compiled branch defaults where the factbook gives no breakdown.
ISLAM_BRANCH = {'IRN': 'shia', 'IRQ': 'shia', 'AZE': 'shia', 'BHR': 'shia', 'OMN': 'ibadi'}
CHRISTIAN_BRANCH = {
    'CAN': 'catholic',    # Catholics are the largest denomination (2021 census)
    'BGR': 'orthodox',    # Bulgarian Orthodox Church
    'CUB': 'catholic',
    'NAM': 'protestant',  # Lutheran majority
}
# Whole-category overrides (compiled), with the reason.
OVERRIDE = {
    'PAN': 'christianity-catholic',  # factbook entry duplicates Honduras' figures; Panama is majority Catholic
    'PRK': 'none',                   # state atheism; Pew Research estimates ~70% unaffiliated
}


def _pct(s):
    s = s.replace(',', '.').replace('/', '.')
    m = re.search(r'(\d+(?:\.\d+)?)\s*%?\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*%', s)
    if m:
        return (float(m.group(1)) + float(m.group(2))) / 2
    m = re.search(r'(?:<|less than)\s*(\d+(?:\.\d+)?)\s*%', s)
    if m:
        return float(m.group(1)) / 2
    m = re.search(r'(\d+(?:\.\d+)?|\.\d+)\s*%', s)
    if m:
        return float(m.group(1))
    m = re.search(r'more than (\d+)', s)
    if m:
        return float(m.group(1))
    m = re.search(r'\s(\d+(?:\.\d+)?)\s*$', s)   # "89.5" without a % sign
    if m:
        return float(m.group(1))
    return None


def _split(t, seps=',;'):
    """Split at separators outside parentheses/brackets."""
    items, depth, cur = [], 0, ''
    for ch in t:
        if ch in '([':
            depth += 1
        elif ch in ')]':
            depth = max(0, depth - 1)
        if ch in seps and depth == 0:
            items.append(cur)
            cur = ''
        else:
            cur += ch
    items.append(cur)
    return [i.strip() for i in items if i.strip()]


def _paren(item):
    """-> (text outside parentheses, [contents of each top-level parenthetical group])"""
    outer, groups, depth, cur = '', [], 0, ''
    for ch in item:
        if ch in '([':
            if depth > 0:
                cur += ch
            depth += 1
        elif ch in ')]':
            depth = max(0, depth - 1)
            if depth == 0:
                groups.append(cur)
                cur = ''
                outer += ' '
            else:
                cur += ch
        elif depth > 0:
            cur += ch
        else:
            outer += ch
    return outer, groups


def classify(name):
    n = name.lower().strip()
    n = re.sub(r'^(includes|mainly|mostly|and)\s+', '', n)
    if re.search(NONE, n):
        return ('none', None)
    m = re.match(OTHER_SUB, n)
    if m:
        w = m.group(1)
        if w.startswith('christian'):
            return ('christianity', 'unspecified')
        if w.startswith(('protestant', 'evangelical')):
            return ('christianity', 'protestant')
        if w.startswith('catholic'):
            return ('christianity', 'catholic')
        return ('christianity', 'orthodox')
    if re.search(IGNORE, n):
        return None
    for pat, val in VOCAB:
        if re.search(pat, n):
            return val
    return None


def largest_religion(text, iso):
    """-> (category id, share % of the largest religion or None, provenance)

    The share is only given when the listed percentages add up to at least 80%.
    """
    if iso in OVERRIDE:
        return OVERRIDE[iso], None, 'compiled'
    if not text:
        return None, None, None
    t = re.sub(r'\((?:19|20)\d\d(?:-\d\d)?\s*est\.?\)\s*$', '', text.strip())
    t = re.sub(r'\((?:19|20)\d\d\)\s*$', '', t)
    t = re.split(r';\s*less than 1\s*(?:%|percent)\s*:', t)[0]
    t = re.split(r';\s*note\b', t)[0]
    shares, branches, border, hints, order = {}, {}, {}, {}, []
    any_pct = False
    for item in _split(t):
        outer, groups = _paren(item)
        name = re.sub(r'[\d.,/%<>–-]+.*$', '', outer).strip() or outer.strip()
        cls = classify(name)
        if cls is None:
            continue
        rel, br = cls
        p = _pct(outer)
        if p is not None:
            any_pct = True
        order.append(rel)
        shares[rel] = shares.get(rel, 0) + (p or 0)
        inner = ' ; '.join(groups)
        sub = []
        if rel == 'christianity' and re.search(r'\d\s*%', inner):
            for g in groups:
                for part in _split(g):
                    c2 = classify(re.sub(r'[\d.,/%<>–-]+.*$', '', _paren(part)[0]).strip())
                    p2 = _pct(_paren(part)[0])
                    if c2 and c2[0] == rel and c2[1] and p2 is not None:
                        sub.append((c2[1], p2))
        for b, val in (sub or ([(br, p or 0)] if br else [])):
            d = branches.setdefault(rel, {})
            d[b] = d.get(b, 0) + val
            border.setdefault(rel, [])
            if b not in border[rel]:
                border[rel].append(b)
        if inner and rel in ('christianity', 'islam') and not sub:
            low = inner.lower()
            hits = []
            pats = ((('sunni', r'sunni'), ('shia', r'\bshia'), ('ibadi', r'ibadi')) if rel == 'islam' else
                    (('catholic', r'catholic'), ('orthodox', r'orthodox'), ('protestant', r'anglican|lutheran|protestant|evangelical')))
            for b, pat in pats:
                m = re.search(pat, low)
                if m:
                    hits.append((m.start(), b))
            if hits:
                hints.setdefault(rel, sorted(hits)[0][1])
    cands = {k: v for k, v in shares.items() if k != 'other'}
    if not cands:
        return None, None, None
    total = sum(_pct(_paren(i)[0]) or 0 for i in _split(t))
    if any_pct:
        top = max(cands, key=lambda k: cands[k])
        # only report the share when the factbook breakdown is (nearly) complete
        share = round(cands[top], 1) if cands[top] and total >= 80 else None
    else:
        top = next(r for r in order if r != 'other')
        share = None
    cat = top
    if top in ('christianity', 'islam'):
        b = {k: v for k, v in branches.get(top, {}).items() if k not in ('unspecified', 'other' if top == 'islam' else '_')}
        branch = None
        if b:
            if max(b.values()) > 0:
                branch = max(b, key=lambda k: b[k])
            else:
                branch = next(x for x in border[top] if x in b)
        if not branch:
            branch = hints.get(top)
        if not branch:
            branch = ISLAM_BRANCH.get(iso, 'sunni') if top == 'islam' else CHRISTIAN_BRANCH.get(iso)
        cat = '%s-%s' % (top, branch) if branch else top
    return cat, share, 'factbook'
