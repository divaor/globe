# Collector for regional-language entries
REGIONS = {}      # key -> dict(langs=[...], note=str)
DUPS = []         # keys assigned more than once
NOTES = {}        # country -> note

def R(cc, names, langs, note=None):
    if isinstance(names, str):
        names = [names]
    codes = langs.split() if isinstance(langs, str) else list(langs)
    for n in names:
        key = f'{cc}|{n}'
        if key in REGIONS:
            DUPS.append(key)
        e = {'langs': codes}
        if note:
            e['note'] = note
        REGIONS[key] = e

def CN(cc, note):
    NOTES[cc] = note
