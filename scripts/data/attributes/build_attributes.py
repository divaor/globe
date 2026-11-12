#!/usr/bin/env python3
"""Build public/data/attributes/countries.json and minerals.json from the downloaded sources.

    python3 -I scripts/data/attributes/build_attributes.py <download-dir> [<out-dir>]

<download-dir> is the directory filled by fetch_sources.sh (+ derived/wdi_country.csv from
extract_wdi.py).  Only the Python standard library is used.  See README.md / SOURCES.md.
"""
import collections
import csv
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)  # our own helper modules (never the download directory)
sys.dont_write_bytecode = True  # keep the repository free of __pycache__

import compiled_extra as CX        # noqa: E402
import compiled_languages as CL    # noqa: E402
import compiled_minerals as CM     # noqa: E402
import compiled_politics as CP     # noqa: E402
import compiled_symbols as CS      # noqa: E402
import factbook as fb              # noqa: E402
import religion as REL             # noqa: E402

SRC = os.path.abspath(sys.argv[1])
OUT = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.normpath(
    os.path.join(HERE, '..', '..', '..', 'public', 'data', 'attributes'))


def P(*parts):
    return os.path.join(SRC, *parts)


def jload(*parts):
    with open(P(*parts), encoding='utf-8') as fh:
        return json.load(fh)


def csv_rows(*parts):
    with open(P(*parts), encoding='utf-8', newline='') as fh:
        return list(csv.DictReader(fh))


# ------------------------------------------------------------------ sources / licences
S = {
    'mledoze': ('mledoze/countries (github.com/mledoze/countries)', 'ODbL-1.0'),
    'ne': ('Natural Earth 1:10m Admin 0 – Countries (github.com/nvkelso/natural-earth-vector)', 'Public domain'),
    'factbook': ('CIA World Factbook, final edition (2025/26), via github.com/factbook/factbook.json',
                 'Public domain (U.S. Government work); repository CC0-1.0'),
    'wb_pop': ('World Bank WDI – SP.POP.TOTL via DataHub (github.com/datasets/population)', 'CC BY 4.0'),
    'wb_gdp': ('World Bank WDI – NY.GDP.MKTP.CD via DataHub (github.com/datasets/gdp)', 'CC BY 4.0'),
    'wb_income': ('World Bank country classification by income, via the WDI R package cache (github.com/vincentarelbundock/WDI, Aug 2026)', 'CC BY 4.0'),
    'owid_co2': ('Our World in Data – CO₂ and greenhouse gas emissions (Global Carbon Project), github.com/owid/co2-data', 'CC BY 4.0'),
    'owid_energy': ('Our World in Data – energy dataset (Ember; Energy Institute Statistical Review), github.com/owid/energy-data', 'CC BY 4.0'),
    'owid_hdi': ('UNDP Human Development Report 2025 via Our World in Data (ourworldindata.org/grapher/human-development-index)', 'CC BY 4.0 (OWID); UNDP data CC BY 3.0 IGO'),
    'owid_whr': ('World Happiness Report 2026 (Wellbeing Research Centre; Gallup World Poll) via Our World in Data (ourworldindata.org/grapher/happiness-cantril-ladder)',
                 'CC BY 4.0 (OWID); WHR data free to use with attribution'),
    'wiki_mains': ('Wikipedia, "Mains electricity by country" (from IEC World Plugs and national standards)', 'CC BY-SA 4.0'),
    'owid_height': ('NCD-RisC (2017) via Our World in Data (github.com/owid/owid-datasets)', 'CC BY 4.0'),
    'cldr': ('Unicode CLDR 49 (cldr-json npm packages)', 'Unicode-3.0'),
    'coder': ('@rapideditor/country-coder 5.6.1 (OpenStreetMap community data)', 'ISC'),
    'gem': ('countries Ruby gem data (github.com/countries/countries)', 'MIT'),
    'samayo': ('samayo/country-json (github.com/samayo/country-json)', 'MIT'),
    'olympedia': ('Olympedia results via github.com/KeithGalli/Olympics-Dataset', 'MIT (repository); facts from olympedia.org'),
    'wiki_olympics': ('Wikipedia, "All-time Olympic Games medal table" (via scripts/data/games/_data/medals-alltime.json)', 'CC BY-SA 4.0'),
    'compiled': ('compiled', 'CC0-1.0 (compiled facts)'),
    'heritage': ('UNESCO World Heritage List after the July 2026 session, via Wikipedia and Wikidata (public/data/layers/heritage.json, made by scripts/data/world-heritage/build.py)',
                 'CC BY-SA 4.0 (Wikipedia); CC0 (Wikidata)'),
}

FIELDS = collections.OrderedDict()
DATA = collections.defaultdict(dict)

# Amounts that add up over a country (people, area, money, tonnes, things counted), as opposed to
# rates, shares, averages and ranks. Only a total divided by a total makes a meaningful ratio
# ("Olympic medals per million people"), so the app offers ratios for these alone.
TOTALS = {'population', 'area_km2', 'gdp_usd', 'coastline_km', 'oil_production', 'gas_production', 'coal_production',
          'nuclear_reactors', 'airports', 'railways_km', 'unesco_sites', 'co2_mt', 'olympic_medals', 'olympic_golds',
          'world_cup_titles', 'womens_world_cup_titles'}


def field(fid, label_en, label_es, group, ftype, src, **kw):
    meta = {'label_en': label_en, 'label_es': label_es, 'group': group, 'type': ftype}
    for k in ('unit', 'year', 'scale', 'higherIs'):
        if k in kw:
            meta[k] = kw.pop(k)
    if fid in TOTALS:
        meta['measure'] = 'total'
    if 'unit' in meta:
        meta['unit_es'] = CX.UNIT_ES.get(meta['unit'])
        if meta['unit_es'] is None:
            print('WARNING: no Spanish unit for', fid, meta['unit'])
            meta['unit_es'] = meta['unit']
    if 'categories' in kw:
        meta['categories'] = kw.pop('categories')
    meta['source'], meta['license'] = (kw.pop('source'), kw.pop('license')) if 'source' in kw else S[src]
    if 'note' in kw:
        meta['note'] = kw.pop('note')
    assert not kw, kw
    FIELDS[fid] = meta
    return meta


def put(iso, fid, value):
    if value is None or value == [] or value == '':
        return
    if isinstance(value, float):
        if value != value:  # NaN
            return
    DATA[iso][fid] = value


def r(v, nd=1):
    """Round floats; large values to 3-4 significant digits."""
    if v is None:
        return None
    if abs(v) >= 1e6:
        mag = 10 ** (len(str(int(abs(v)))) - 4)
        return int(round(v / mag) * mag)
    if abs(v) >= 100 and nd <= 1:
        return int(round(v))
    out = round(v, nd)
    return int(out) if out == int(out) and nd <= 0 else out


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


# ------------------------------------------------------------------ load base sources
mled = {}
for c in jload('raw', 'mledoze-countries.json'):
    iso = 'XKX' if c['cca3'] == 'UNK' else c['cca3']
    mled[iso] = c
iso2 = {k: v['cca2'] for k, v in mled.items()}
a2_to_iso = {v: k for k, v in iso2.items()}

NE_SPECIAL = {'KOS': 'XKX', 'SOL': 'SOL', 'CYN': 'CYN', 'SAH': 'ESH', 'PSX': 'PSE', 'SDS': 'SSD', 'ALD': 'ALA'}
ne = {}
for f in jload('raw', 'ne_10m_admin_0_countries.geojson')['features']:
    p = f['properties']
    a3 = p['ADM0_A3']
    key = NE_SPECIAL.get(a3)
    if not key:
        if p['ISO_A3'] != '-99':
            key = p['ISO_A3']
        elif p['ISO_A3_EH'] == a3:
            key = a3
    if not key:
        continue
    if key not in ne or (a3 == key and ne[key]['ADM0_A3'] != key):
        ne[key] = p

KEYS = sorted(set(mled) | set(ne) | set(CX.NON_ISO))

gem = jload('repos', 'countries_countries', 'lib', 'countries', 'cache', 'countries.json')
gem3 = {c['alpha3']: c for c in gem.values()}
gec_to_iso = {c['gec'].lower(): c['alpha3'] for c in gem.values() if c.get('gec')}
profiles = fb.load_profiles(P('repos', 'factbook_factbook.json'), gec_to_iso)


def fbt(iso, *keys):
    """Factbook text for the entity (West Bank profile first for PSE)."""
    for gec, prof in sorted(profiles.get(iso, []), key=lambda x: x[0] != 'we'):
        t = fb.text(prof, *keys)
        if t:
            return t
    return None


def fb_all(iso, *keys):
    return [fb.text(prof, *keys) for gec, prof in profiles.get(iso, [])]


# CLDR
CLDR = P('npm')
cldr_core = os.path.join(CLDR, 'cldr-core-49.0.0', 'package', 'supplemental')
cldr_names = os.path.join(CLDR, 'cldr-localenames-full-49.0.0', 'package', 'main')
cldr_num = os.path.join(CLDR, 'cldr-numbers-full-49.0.0', 'package', 'main')


def cj(path):
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)


lang_names = {lc: cj(os.path.join(cldr_names, lc, 'languages.json'))['main'][lc]['localeDisplayNames']['languages']
              for lc in ('en', 'es')}
terr_names = {lc: cj(os.path.join(cldr_names, lc, 'territories.json'))['main'][lc]['localeDisplayNames']['territories']
              for lc in ('en', 'es')}
cur_names = {lc: cj(os.path.join(cldr_num, lc, 'currencies.json'))['main'][lc]['numbers']['currencies']
             for lc in ('en', 'es')}
aliases = cj(os.path.join(cldr_core, 'aliases.json'))['supplemental']['metadata']['alias']['languageAlias']
week = cj(os.path.join(cldr_core, 'weekData.json'))['supplemental']['weekData']
measure = cj(os.path.join(cldr_core, 'measurementData.json'))['supplemental']['measurementData']
timedata = cj(os.path.join(cldr_core, 'timeData.json'))['supplemental']['timeData']
terrinfo = cj(os.path.join(cldr_core, 'territoryInfo.json'))['supplemental']['territoryInfo']
curdata = cj(os.path.join(cldr_core, 'currencyData.json'))['supplemental']['currencyData']['region']


def country_name(iso, lang):
    if iso in CX.NON_ISO:
        return CX.NON_ISO[iso]['name'][0 if lang == 'en' else 1]
    a2 = iso2.get(iso)
    names = terr_names[lang]
    if a2 in ('HK', 'MO', 'PS') and (a2 + '-alt-short') in names:
        return names[a2 + '-alt-short']
    if a2 and a2 in names:
        return names[a2]
    return mled[iso]['name']['common'] if iso in mled else iso


def country_cats(isos):
    return {i: {'en': country_name(i, 'en'), 'es': country_name(i, 'es')} for i in sorted(isos)}


# ------------------------------------------------------------------ GEOGRAPHY basics
cont_cats, sub_cats = {}, {}
for iso in KEYS:
    p = ne.get(iso)
    if not p:
        continue
    cid, en, es = CX.CONTINENTS[p['CONTINENT']]
    put(iso, 'continent', cid)
    cont_cats[cid] = {'en': en, 'es': es}
    sid, en, es = CX.SUBREGIONS[p['SUBREGION']]
    put(iso, 'subregion', sid)
    sub_cats[sid] = {'en': en, 'es': es}
# territories Natural Earth does not draw separately (e.g. Réunion, Cocos Is.): fall back to mledoze regions
for iso in KEYS:
    if iso in ne or iso not in mled:
        continue
    reg, sub = mled[iso].get('region'), mled[iso].get('subregion')
    sub = {'North America': 'Northern America'}.get(sub, sub)
    if reg == 'Antarctic':
        cont = 'Antarctica'
    elif reg == 'Americas':
        cont = 'South America' if sub == 'South America' else 'North America'
    else:
        cont = reg
    if cont in CX.CONTINENTS:
        put(iso, 'continent', CX.CONTINENTS[cont][0])
    if sub in CX.SUBREGIONS:
        put(iso, 'subregion', CX.SUBREGIONS[sub][0])
        sid, en, es = CX.SUBREGIONS[sub]
        sub_cats[sid] = {'en': en, 'es': es}
field('continent', 'Continent', 'Continente', 'geography', 'category', 'ne', categories=cont_cats,
      note='Natural Earth CONTINENT; remote islands are "open ocean". Territories not drawn separately by Natural Earth use mledoze/countries regions.')
field('subregion', 'Region (UN geoscheme)', 'Región (geoesquema de la ONU)', 'geography', 'category', 'ne',
      categories=sub_cats, note='Natural Earth SUBREGION (UN M49 sub-regions).')

for iso, c in mled.items():
    area = c.get('area') if c.get('area') and c['area'] > 0 else None
    if area is None and iso in profiles:   # e.g. Svalbard: use the factbook total area
        area = fb.number(fbt(iso, 'Geography', 'Area', 'total'))
    put(iso, 'area_km2', area)
    put(iso, 'landlocked', bool(c.get('landlocked')))
    b = ['XKX' if x == 'UNK' else x for x in c.get('borders') or []]
    put(iso, 'borders', b)
    put(iso, 'neighbours_count', len(b))
    cap = c.get('capital') or []
    put(iso, 'capital', ', '.join(cap) if cap else None)
    put(iso, 'un_member', bool(c.get('unMember')))
    if c.get('independent') is not None:
        put(iso, 'independent', bool(c['independent']))
    tld = [t for t in c.get('tld') or [] if t.isascii()]
    put(iso, 'tld', ' '.join(tld) if tld else None)
put('XKX', 'independent', True)  # mledoze leaves it null; declared 2008, recognised by ~100 UN members
for iso, fix in CX.UN_MEMBER_FIX.items():
    put(iso, 'un_member', fix)
for iso, x in CX.NON_ISO.items():
    for k in ('capital', 'landlocked', 'un_member', 'independent', 'borders'):
        put(iso, k, x[k])
    put(iso, 'neighbours_count', len(x['borders']))
    for b in x['borders']:  # make neighbours list the non-ISO entity too
        DATA[b].setdefault('borders', [])
        if iso not in DATA[b]['borders']:
            DATA[b]['borders'].append(iso)
            DATA[b]['neighbours_count'] = len(DATA[b]['borders'])

field('area_km2', 'Area', 'Superficie', 'geography', 'number', 'mledoze', unit='km²', scale='log', higherIs='neutral')
field('landlocked', 'Landlocked', 'Sin litoral', 'geography', 'boolean', 'mledoze')
all_border_isos = {b for v in DATA.values() for b in v.get('borders', [])}
field('borders', 'Neighbouring countries', 'Países vecinos', 'geography', 'list', 'mledoze',
      categories=country_cats(all_border_isos), note='Land borders (ISO alpha-3).')
field('neighbours_count', 'Number of land neighbours', 'Número de países vecinos', 'geography', 'number', 'mledoze',
      unit='countries', scale='linear', higherIs='neutral')
field('capital', 'Capital', 'Capital', 'politics', 'text', 'mledoze', note='Names as given by mledoze/countries (mostly English).')
field('un_member', 'UN member', 'Miembro de la ONU', 'politics', 'boolean', 'mledoze',
      note='Holy See corrected to false (observer state).')
field('independent', 'Sovereign state', 'Estado soberano', 'politics', 'boolean', 'mledoze',
      note='false for dependencies and territories; Kosovo set to true; Somaliland and Northern Cyprus false (de facto states).')
field('tld', 'Internet domain', 'Dominio de internet', 'fun', 'text', 'mledoze')

# dependency_of (sovereign of non-independent entities) from Natural Earth SOV_A3
SOV_FIX = {'FR1': 'FRA', 'GB1': 'GBR', 'US1': 'USA', 'NL1': 'NLD', 'DN1': 'DNK', 'AU1': 'AUS', 'NZ1': 'NZL',
           'FI1': 'FIN', 'CH1': 'CHN', 'IS1': None, 'KA1': 'KAZ', 'CU1': 'CUB'}
DEP_FALLBACK = {'REU': 'FRA', 'GLP': 'FRA', 'MTQ': 'FRA', 'GUF': 'FRA', 'MYT': 'FRA', 'BES': 'NLD', 'SJM': 'NOR',
                'BVT': 'NOR', 'TKL': 'NZL', 'CCK': 'AUS', 'CXR': 'AUS', 'UMI': 'USA', 'ATF': 'FRA'}
dep_vals = set()
for iso in KEYS:
    if DATA[iso].get('independent') is False and iso not in ('PSE', 'ESH', 'TWN', 'SOL', 'CYN', 'ATA'):
        sov = ne[iso]['SOV_A3'] if iso in ne else DEP_FALLBACK.get(iso)
        sov = SOV_FIX.get(sov, sov)
        if sov and sov != iso:
            put(iso, 'dependency_of', sov)
            dep_vals.add(sov)
field('dependency_of', 'Territory of', 'Territorio de', 'politics', 'category', 'ne', categories=country_cats(dep_vals),
      note='Sovereign state of dependencies (Natural Earth SOV_A3); not set for disputed areas (Palestine, Western Sahara, Taiwan).')

# ------------------------------------------------------------------ factbook-derived numbers
def fb_number(iso, section, fld, sub=None, pct=False, latest=False):
    if latest:
        t, y = None, None
        for gec, prof in profiles.get(iso, []):
            t, y = fb.latest_text(prof, section, fld)
            if t:
                break
    else:
        t = fbt(iso, section, fld, sub) if sub else fbt(iso, section, fld)
        y = fb.year_of(t)
    if not t or re.match(r'\s*(NA|na|not available|negl)\b', t):
        return None, None
    t = re.sub(r'\([^()]*(?:19|20)\d\d[^()]*\)', ' ', t)   # '(2017 est.) 77.9' -> '77.9'
    v = fb.percent(t) if pct else fb.number(t)
    return v, y


def fb_field(fid, section, fld, sub=None, pct=False, latest=False, conv=None, nd=1, keep=None):
    years = collections.Counter()
    for iso in KEYS:
        if iso not in profiles:
            continue
        if iso == 'PSE':
            vals = []
            for gec, prof in profiles['PSE']:
                t = fb.text(prof, section, fld, sub) if sub else fb.text(prof, section, fld)
                v = fb.percent(t) if pct else fb.number(t) if t else None
                pop = fb.number(fb.text(prof, 'People and Society', 'Population', 'total'))
                if v is not None and pop:
                    vals.append((v, pop, fb.year_of(t)))
            if len(vals) == 2:
                if keep == 'sum':
                    v = sum(x[0] for x in vals)
                else:
                    v = sum(x[0] * x[1] for x in vals) / sum(x[1] for x in vals)
                put('PSE', fid, r(conv(v) if conv else v, nd))
                years[vals[0][2]] += 1
            continue
        v, y = fb_number(iso, section, fld, sub, pct, latest)
        if v is None:
            continue
        if keep and keep != 'sum' and not keep(v):
            continue
        put(iso, fid, r(conv(v) if conv else v, nd))
        if y:
            years[y] += 1
    return years.most_common(1)[0][0] if years else None


y = fb_field('median_age', 'People and Society', 'Median age', 'total', keep=lambda v: 10 <= v <= 70)
field('median_age', 'Median age', 'Edad mediana', 'people', 'number', 'factbook', unit='years', year=y, scale='linear', higherIs='neutral')
y = fb_field('life_expectancy', 'People and Society', 'Life expectancy at birth', 'total population', keep=lambda v: 30 <= v <= 100)
field('life_expectancy', 'Life expectancy at birth', 'Esperanza de vida al nacer', 'people', 'number', 'factbook', unit='years', year=y, scale='linear', higherIs='good')
y = fb_field('fertility_rate', 'People and Society', 'Total fertility rate', nd=2)
field('fertility_rate', 'Fertility rate', 'Tasa de fecundidad', 'people', 'number', 'factbook', unit='children per woman', year=y, scale='linear', higherIs='neutral')
y = fb_field('urban_pct', 'People and Society', 'Urbanization', 'urban population', pct=True)
field('urban_pct', 'Urban population', 'Población urbana', 'people', 'number', 'factbook', unit='% of population', year=y, scale='linear', higherIs='neutral')
y = fb_field('literacy_pct', 'People and Society', 'Literacy', 'total population', pct=True)
field('literacy_pct', 'Literacy rate', 'Tasa de alfabetización', 'people', 'number', 'factbook', unit='% of people aged 15+', year=y, scale='linear', higherIs='good',
      note='Survey years vary by country.')
y = fb_field('obesity_pct', 'People and Society', 'Obesity - adult prevalence rate', pct=True)
field('obesity_pct', 'Adult obesity', 'Obesidad adulta', 'people', 'number', 'factbook', unit='% of adults', year=y, scale='linear', higherIs='bad')
y = fb_field('alcohol_litres', 'People and Society', 'Alcohol consumption per capita', 'total', nd=2)
field('alcohol_litres', 'Alcohol consumption', 'Consumo de alcohol', 'people', 'number', 'factbook', unit='litres of pure alcohol per person (15+) per year', year=y, scale='linear', higherIs='neutral')
y = fb_field('tobacco_pct', 'People and Society', 'Tobacco use', 'total', pct=True)
field('tobacco_pct', 'Tobacco use', 'Consumo de tabaco', 'people', 'number', 'factbook', unit='% of adults', year=y, scale='linear', higherIs='bad')
y = fb_field('internet_users_pct', 'Communications', 'Internet users', 'percent of population', pct=True)
field('internet_users_pct', 'Internet users', 'Usuarios de internet', 'people', 'number', 'factbook', unit='% of population', year=y, scale='linear', higherIs='good')
y = fb_field('mobile_per_100', 'Communications', 'Telephones - mobile cellular', 'subscriptions per 100 inhabitants', nd=0, keep=lambda v: 0 < v <= 400)
field('mobile_per_100', 'Mobile phone subscriptions', 'Líneas de telefonía móvil', 'people', 'number', 'factbook', unit='per 100 people', year=y, scale='linear', higherIs='neutral')

y = fb_field('gdp_ppp_per_capita', 'Economy', 'Real GDP per capita', latest=True, nd=0)
for iso in list(DATA):   # keep only values expressed in 2021 dollars (a few profiles use other base years)
    if 'gdp_ppp_per_capita' in DATA[iso]:
        notes = [fb.clean(str((fb.node(pr, 'Economy', 'Real GDP per capita') or {}).get('note', ''))) for g, pr in profiles.get(iso, [])]
        if not any('2021 dollars' in n for n in notes):
            del DATA[iso]['gdp_ppp_per_capita']
field('gdp_ppp_per_capita', 'GDP per capita (PPP)', 'PIB per cápita (PPA)', 'economy', 'number', 'factbook', unit='international $ (2021 prices)', year=y, scale='log', higherIs='good')
y = fb_field('gini', 'Economy', 'Gini Index coefficient - distribution of family income', latest=True)
field('gini', 'Income inequality (Gini index)', 'Desigualdad de ingresos (índice de Gini)', 'economy', 'number', 'factbook', unit='index (0–100)', year=y, scale='linear', higherIs='bad',
      note='Survey years vary by country.')
y = fb_field('unemployment_pct', 'Economy', 'Unemployment rate', latest=True, pct=True)
field('unemployment_pct', 'Unemployment rate', 'Tasa de desempleo', 'economy', 'number', 'factbook', unit='% of labour force', year=y, scale='linear', higherIs='bad')
y = fb_field('military_spending_pct', 'Military and Security', 'Military expenditures', latest=True, pct=True)
field('military_spending_pct', 'Military spending', 'Gasto militar', 'politics', 'number', 'factbook', unit='% of GDP', year=y, scale='linear', higherIs='neutral')

y = fb_field('coastline_km', 'Geography', 'Coastline', nd=0, keep='sum')
field('coastline_km', 'Coastline', 'Longitud de costa', 'geography', 'number', 'factbook', unit='km', scale='log', higherIs='neutral',
      note='0 for landlocked countries.')
y = fb_field('mean_elevation_m', 'Geography', 'Elevation', 'mean elevation', nd=0)
field('mean_elevation_m', 'Mean elevation', 'Altitud media', 'geography', 'number', 'factbook', unit='m', scale='linear', higherIs='neutral')
y = fb_field('forest_pct', 'Geography', 'Land use', 'forest', pct=True)
for iso in ('TWN', 'HKG', 'MAC'):   # factbook reports 0% (not covered by FAO statistics): treat as missing
    DATA[iso].pop('forest_pct', None)
field('forest_pct', 'Forest cover', 'Superficie forestal', 'nature', 'number', 'factbook', unit='% of land area', year=y, scale='linear', higherIs='good')
y = fb_field('agricultural_land_pct', 'Geography', 'Land use', 'agricultural land', pct=True)
field('agricultural_land_pct', 'Agricultural land', 'Superficie agrícola', 'geography', 'number', 'factbook', unit='% of land area', year=y, scale='linear', higherIs='neutral')

for which, fid_m, fid_n in (('highest point', 'highest_point_m', 'highest_point_name'), ('lowest point', 'lowest_point_m', 'lowest_point_name')):
    for iso in KEYS:
        cands = []
        for gec, prof in profiles.get(iso, []):
            name, m = fb.name_and_metres(fb.text(prof, 'Geography', 'Elevation', which))
            if m is not None:
                cands.append((m, name))
        if not cands:
            continue
        m, name = max(cands) if which == 'highest point' else min(cands)
        if name:
            name = re.sub(r'\s*\((?:[^()]*\b(?:highest|lowest|point|peak|summit|tallest|deepest|located|note)\b[^()]*)\)', '', name).strip(' ,;')
        put(iso, fid_m, int(m) if m == int(m) else m)
        put(iso, fid_n, name)
field('highest_point_m', 'Highest point', 'Punto más alto', 'geography', 'number', 'factbook', unit='m', scale='linear', higherIs='neutral')
field('highest_point_name', 'Highest point (name)', 'Punto más alto (nombre)', 'geography', 'text', 'factbook', note='Names in English as given by the factbook.')
field('lowest_point_m', 'Lowest point', 'Punto más bajo', 'geography', 'number', 'factbook', unit='m', scale='linear', higherIs='neutral',
      note='Negative values are below sea level.')
field('lowest_point_name', 'Lowest point (name)', 'Punto más bajo (nombre)', 'geography', 'text', 'factbook')

y = fb_field('electricity_access_pct', 'Energy', 'Electricity access', 'electrification - total population', pct=True)
field('electricity_access_pct', 'Access to electricity', 'Acceso a la electricidad', 'energy', 'number', 'factbook', unit='% of population', year=y, scale='linear', higherIs='good')
y = fb_field('oil_production', 'Energy', 'Petroleum', 'total petroleum production', nd=0, keep=lambda v: v > 0)
field('oil_production', 'Oil production', 'Producción de petróleo', 'energy', 'number', 'factbook', unit='barrels per day', year=y, scale='log', higherIs='neutral',
      note='Total petroleum and other liquids (crude, NGL, biofuels…), EIA estimates as published by the factbook.')
y = fb_field('gas_production', 'Energy', 'Natural gas', 'production', conv=lambda v: v / 1e9, nd=3, keep=lambda v: v >= 1e6)
field('gas_production', 'Natural gas production', 'Producción de gas natural', 'energy', 'number', 'factbook', unit='billion m³ per year', year=y, scale='log', higherIs='neutral')
y = fb_field('coal_production', 'Energy', 'Coal', 'production', conv=lambda v: v / 1e6, nd=3, keep=lambda v: v >= 1e3)
field('coal_production', 'Coal production', 'Producción de carbón', 'energy', 'number', 'factbook', unit='million tonnes per year', year=y, scale='log', higherIs='neutral')
y = fb_field('nuclear_reactors', 'Energy', 'Nuclear energy', 'Number of operational nuclear reactors', nd=0)
field('nuclear_reactors', 'Operational nuclear reactors', 'Reactores nucleares en operación', 'energy', 'number', 'factbook', unit='reactors', year=y, scale='linear', higherIs='neutral',
      note='Countries without reactors have no value.')
y = fb_field('airports', 'Transportation', 'Airports', nd=0, keep='sum')
field('airports', 'Airports', 'Aeropuertos', 'fun', 'number', 'factbook', unit='airports and airfields', year=y, scale='log', higherIs='neutral')
y = fb_field('railways_km', 'Transportation', 'Railways', 'total', nd=0)
field('railways_km', 'Railway network', 'Red ferroviaria', 'fun', 'number', 'factbook', unit='km', scale='log', higherIs='neutral',
      note='Survey years vary.')

# UNESCO World Heritage Sites: from the app's own World Heritage data (every site counts for each of its countries).
_wh = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../public/data/layers/heritage.json'), encoding='utf-8'))
_whc = {}
for _s in _wh['sites']:
    if _s.get('x') or _s.get('merged'):
        continue
    for _c in _s['cc']:
        _whc[_c] = _whc.get(_c, 0) + 1
for iso in KEYS:
    if iso in _whc:
        put(iso, 'unesco_sites', _whc[iso])
field('unesco_sites', 'UNESCO World Heritage Sites', 'Sitios del Patrimonio Mundial (UNESCO)', 'culture', 'number', 'heritage', unit='sites', year=2026,
      scale='linear', higherIs='neutral', note='Transnational sites count for every country involved.')

# Suffrage
for iso in KEYS:
    t = fbt(iso, 'Government', 'Suffrage')
    if not t:
        continue
    m = re.search(r'(\d\d)(?:\s*-\s*\d\d)?\s*years? of age', t)
    if m:
        put(iso, 'voting_age', int(m.group(1)))
    put(iso, 'compulsory_voting', bool(re.search(r'compulsory', t, re.I)))
field('voting_age', 'Voting age', 'Edad para votar', 'politics', 'number', 'factbook', unit='years', scale='linear', higherIs='neutral',
      note='Minimum age for general elections (first age given by the factbook).')
field('compulsory_voting', 'Compulsory voting', 'Voto obligatorio', 'politics', 'boolean', 'factbook',
      note='true when the factbook suffrage entry mentions compulsory voting (enforcement varies).')

# Capital UTC offset & DST from the IANA time zone database (Python zoneinfo + zone.tab):
# the capital is matched to the nearest zone.tab location of its country.
import datetime as _dt          # noqa: E402
import math as _math            # noqa: E402
from zoneinfo import ZoneInfo, TZPATH   # noqa: E402


def _tab_coord(s):
    m = re.match(r'([+-])(\d{2})(\d{2})(\d{2})?([+-])(\d{3})(\d{2})(\d{2})?$', s)
    lat = int(m.group(2)) + int(m.group(3)) / 60 + int(m.group(4) or 0) / 3600
    lon = int(m.group(6)) + int(m.group(7)) / 60 + int(m.group(8) or 0) / 3600
    return (lat if m.group(1) == '+' else -lat, lon if m.group(5) == '+' else -lon)


def _fb_coord(t):
    m = re.search(r'(\d+)\s+(\d+)\s*([NS]),?\s*(\d+)\s+(\d+)\s*([EW])', t or '')
    if not m:
        return None
    lat = int(m.group(1)) + int(m.group(2)) / 60
    lon = int(m.group(4)) + int(m.group(5)) / 60
    return (lat if m.group(3) == 'N' else -lat, lon if m.group(6) == 'E' else -lon)


zone_tab = collections.defaultdict(list)
_tab = next((os.path.join(d, 'zone.tab') for d in TZPATH if os.path.exists(os.path.join(d, 'zone.tab'))), None)
if _tab:
    with open(_tab, encoding='utf-8') as fh:
        for line in fh:
            if line.startswith('#') or not line.strip():
                continue
            parts = line.rstrip('\n').split('\t')
            zone_tab[parts[0]].append((_tab_coord(parts[1]), parts[2]))
TZ_FIX = {'SOL': 'Africa/Mogadishu', 'CYN': 'Asia/Famagusta', 'XKX': 'Europe/Belgrade'}
tz_version = None
for _d in TZPATH:
    _zi = os.path.join(_d, 'tzdata.zi')
    if os.path.exists(_zi):
        with open(_zi, encoding='utf-8') as fh:
            tz_version = fh.readline().strip().replace('# version ', '')
        break
for iso in KEYS:
    zone = TZ_FIX.get(iso)
    if not zone:
        cands = zone_tab.get(iso2.get(iso, ''), [])
        if not cands:
            continue
        cap = _fb_coord(fbt(iso, 'Government', 'Capital', 'geographic coordinates'))
        if cap is None and iso in mled and mled[iso].get('latlng'):
            cap = tuple(mled[iso]['latlng'])
        if cap and len(cands) > 1:
            def _dist(c):
                (la, lo), _z = c
                return (la - cap[0]) ** 2 + ((lo - cap[1]) * _math.cos(_math.radians(cap[0]))) ** 2
            zone = min(cands, key=_dist)[1]
        else:
            zone = cands[0][1]
    tz = ZoneInfo(zone)
    jan = _dt.datetime(2026, 1, 15, 12, tzinfo=tz).utcoffset().total_seconds() / 3600
    jul = _dt.datetime(2026, 7, 15, 12, tzinfo=tz).utcoffset().total_seconds() / 3600
    put(iso, 'utc_offset', min(jan, jul) if min(jan, jul) != int(min(jan, jul)) else int(min(jan, jul)))
    put(iso, 'daylight_saving', jan != jul)
field('utc_offset', 'Time zone of the capital', 'Huso horario de la capital', 'geography', 'number', 'compiled', unit='hours from UTC (standard time)',
      year=2026, scale='linear', higherIs='neutral', source='IANA Time Zone Database %s (via Python zoneinfo); capital matched to the nearest zone.tab location' % (tz_version or ''),
      license='Public domain', note="Countries spanning several time zones show the capital's zone; standard (winter) offset.")
field('daylight_saving', 'Daylight saving time', 'Horario de verano', 'geography', 'boolean', 'compiled', year=2026,
      source='IANA Time Zone Database %s (via Python zoneinfo)' % (tz_version or ''), license='Public domain',
      note="Whether the capital's time zone changes its clocks in 2026.")

# Space
for iso in KEYS:
    if iso not in profiles:
        continue
    agency = fbt(iso, 'Space', 'Space agency/agencies')
    launch = fbt(iso, 'Space', 'Space launch site(s)')
    put(iso, 'space_agency', bool(agency))
    put(iso, 'space_launch_site', bool(launch))
field('space_agency', 'Has a space agency', 'Tiene agencia espacial', 'fun', 'boolean', 'factbook', year=2025)
field('space_launch_site', 'Has a space launch site', 'Tiene base de lanzamiento espacial', 'fun', 'boolean', 'factbook', year=2025)

# ------------------------------------------------------------------ population / GDP (World Bank)
wb_pop = collections.defaultdict(dict)
for row in csv_rows('raw', 'wb-population.csv'):
    if row['Value']:
        wb_pop[row['Country Code']][int(row['Year'])] = float(row['Value'])
wb_gdp = collections.defaultdict(dict)
for row in csv_rows('raw', 'wb-gdp.csv'):
    if row['Value']:
        wb_gdp[row['Country Code']][int(row['Year'])] = float(row['Value'])
pop_year = collections.Counter()
for iso in KEYS:
    if iso in wb_pop:
        y = max(wb_pop[iso])
        put(iso, 'population', int(wb_pop[iso][y]))
        pop_year[y] += 1
    else:
        vals = [fb.number(t) for t in fb_all(iso, 'People and Society', 'Population', 'total') if t]
        vals = [v for v in vals if v]
        if vals:
            put(iso, 'population', int(sum(vals)))
        elif iso in ne and ne[iso]['POP_EST'] and ne[iso]['POP_EST'] > 0:
            put(iso, 'population', int(ne[iso]['POP_EST']))
    gy = [y for y in wb_gdp.get(iso, {}) if y in wb_pop.get(iso, {})]
    if gy:
        y = max(gy)
        if y >= 2020:
            put(iso, 'gdp_usd', r(wb_gdp[iso][y]))
            put(iso, 'gdp_per_capita', int(round(wb_gdp[iso][y] / wb_pop[iso][y])))
DATA['ATA'].pop('population', None)   # only seasonal research staff
for iso in KEYS:
    pop, area = DATA[iso].get('population'), DATA[iso].get('area_km2')
    if pop and area and area > 0:
        dens = pop / area
        put(iso, 'pop_density', r(dens, 1) if dens >= 1 else float('%.2g' % dens))
field('population', 'Population', 'Población', 'people', 'number', 'wb_pop', unit='people', year=pop_year.most_common(1)[0][0], scale='log', higherIs='neutral',
      note='World Bank 2025; territories without World Bank data use the CIA World Factbook 2024 estimate, Somaliland and Northern Cyprus use Natural Earth (2014/2017).')
field('pop_density', 'Population density', 'Densidad de población', 'people', 'number', 'compiled', unit='people per km²', year=pop_year.most_common(1)[0][0], scale='log', higherIs='neutral',
      source='computed: population / area_km2', license='see population and area_km2')
field('gdp_usd', 'GDP', 'PIB', 'economy', 'number', 'wb_gdp', unit='US$ (current)', year=2023, scale='log', higherIs='neutral',
      note='Latest year available (2023 for most countries; 2020–2022 for a few).')
field('gdp_per_capita', 'GDP per capita', 'PIB per cápita', 'economy', 'number', 'wb_gdp', unit='US$ (current)', year=2023, scale='log', higherIs='good',
      note='World Bank GDP (current US$) divided by World Bank population of the same year.')

# income group
INC = {'Low income': 'low', 'Lower middle income': 'lower-middle', 'Upper middle income': 'upper-middle', 'High income': 'high'}
wdi_path = P('derived', 'wdi_country.csv')
if os.path.exists(wdi_path):
    for row in csv_rows('derived', 'wdi_country.csv'):
        if row['income'] in INC and row['iso3c'] in KEYS:
            put(row['iso3c'], 'income_group', INC[row['income']])
    field('income_group', 'Income group (World Bank)', 'Grupo de ingresos (Banco Mundial)', 'economy', 'category', 'wb_income', year=2026,
          categories={'low': {'en': 'Low income', 'es': 'Ingreso bajo'}, 'lower-middle': {'en': 'Lower-middle income', 'es': 'Ingreso mediano bajo'},
                      'upper-middle': {'en': 'Upper-middle income', 'es': 'Ingreso mediano alto'}, 'high': {'en': 'High income', 'es': 'Ingreso alto'}},
          note='Fiscal year 2027 classification (published July 2026), based on 2025 GNI per capita (Atlas method).')
else:
    print('WARNING: derived/wdi_country.csv missing - run extract_wdi.py; income_group skipped')

# ------------------------------------------------------------------ OWID CO2 / energy / HDI / happiness / height
owid_name_to_iso = {}
co2_latest = {}
for row in csv_rows('raw', 'owid-co2-data.csv'):
    iso = 'XKX' if row['iso_code'] == 'OWID_KOS' else row['iso_code']
    if len(iso) == 3:
        owid_name_to_iso[row['country']] = iso
        for col in ('co2_per_capita', 'co2'):
            if row[col]:
                yy = int(row['year'])
                if yy >= co2_latest.get((iso, col), (0, 0))[0]:
                    co2_latest[(iso, col)] = (yy, float(row[col]))
owid_name_to_iso['Kosovo'] = 'XKX'
yrs = collections.Counter()
for (iso, col), (yy, v) in co2_latest.items():
    if yy >= 2020 and iso != 'ATA' and v > 0:
        put(iso, 'co2_per_capita' if col == 'co2_per_capita' else 'co2_mt', r(v, 2 if col == 'co2_per_capita' or v < 10 else 1))
        yrs[yy] += 1
field('co2_per_capita', 'CO₂ emissions per person', 'Emisiones de CO₂ por persona', 'energy', 'number', 'owid_co2', unit='tonnes CO₂ per person', year=2024,
      scale='linear', higherIs='bad', note='Fossil fuels and industry (excludes land use).')
field('co2_mt', 'CO₂ emissions', 'Emisiones de CO₂', 'energy', 'number', 'owid_co2', unit='million tonnes CO₂', year=2024, scale='log', higherIs='bad',
      note='Fossil fuels and industry (excludes land use).')

energy = collections.defaultdict(dict)   # iso -> col -> (year, value)
world_energy = {}
ECOLS = ['renewables_share_elec', 'low_carbon_share_elec', 'nuclear_share_elec', 'energy_per_capita', 'per_capita_electricity',
         'coal_share_elec', 'gas_share_elec', 'oil_share_elec', 'nuclear_share_elec', 'hydro_share_elec', 'wind_share_elec',
         'solar_share_elec', 'biofuel_share_elec', 'other_renewables_share_elec', 'oil_production', 'gas_production', 'coal_production']
for row in csv_rows('raw', 'owid-energy-data.csv'):
    iso = 'XKX' if row['iso_code'] == 'OWID_KOS' else row['iso_code']
    yy = int(row['year'])
    if row['country'] == 'World':
        for col in ('oil_production', 'gas_production', 'coal_production'):
            if row[col]:
                world_energy.setdefault(col, {})[yy] = float(row[col])
    if len(iso) != 3:
        continue
    for col in ECOLS:
        if row.get(col):
            if yy >= energy[iso].get(col, (0, 0))[0]:
                energy[iso][col] = (yy, float(row[col]))
SRC_IDS = {'coal_share_elec': 'coal', 'gas_share_elec': 'gas', 'oil_share_elec': 'oil', 'nuclear_share_elec': 'nuclear',
           'hydro_share_elec': 'hydro', 'wind_share_elec': 'wind', 'solar_share_elec': 'solar', 'biofuel_share_elec': 'bioenergy',
           'other_renewables_share_elec': 'other-renewables'}
for iso, cols in energy.items():
    for col, fid, nd in (('renewables_share_elec', 'renewables_share_elec', 1), ('low_carbon_share_elec', 'low_carbon_share_elec', 1),
                         ('nuclear_share_elec', 'nuclear_share_elec', 1), ('energy_per_capita', 'energy_per_capita', 0),
                         ('per_capita_electricity', 'electricity_per_capita', 0)):
        if col in cols and cols[col][0] >= 2020 and iso != 'ATA':
            if fid in ('energy_per_capita', 'electricity_per_capita') and cols[col][1] <= 0:
                continue   # zeros are data gaps for small territories
            put(iso, fid, r(cols[col][1], nd))
    shares = {SRC_IDS[c]: cols[c][1] for c in SRC_IDS if c in cols and cols[c][0] >= 2020}
    if shares and max(shares.values()) > 0:
        put(iso, 'main_power_source', max(shares, key=lambda k: shares[k]))
field('renewables_share_elec', 'Renewable electricity', 'Electricidad renovable', 'energy', 'number', 'owid_energy', unit='% of electricity generation', year=2025,
      scale='linear', higherIs='good', note='Latest year available (2024 or 2025 for most countries). Hydro, wind, solar, bioenergy, geothermal…')
field('low_carbon_share_elec', 'Low-carbon electricity', 'Electricidad baja en carbono', 'energy', 'number', 'owid_energy', unit='% of electricity generation', year=2025,
      scale='linear', higherIs='good', note='Renewables plus nuclear.')
field('nuclear_share_elec', 'Nuclear electricity', 'Electricidad nuclear', 'energy', 'number', 'owid_energy', unit='% of electricity generation', year=2025,
      scale='linear', higherIs='neutral')
field('energy_per_capita', 'Energy use per person', 'Consumo de energía por persona', 'energy', 'number', 'owid_energy', unit='kWh of primary energy per person', year=2024,
      scale='log', higherIs='neutral')
field('electricity_per_capita', 'Electricity generation per person', 'Generación eléctrica por persona', 'energy', 'number', 'owid_energy', unit='kWh per person', year=2025,
      scale='log', higherIs='neutral')
MP = {'coal': ('Coal', 'Carbón'), 'gas': ('Natural gas', 'Gas natural'), 'oil': ('Oil', 'Petróleo'), 'nuclear': ('Nuclear', 'Nuclear'),
      'hydro': ('Hydropower', 'Hidroeléctrica'), 'wind': ('Wind', 'Eólica'), 'solar': ('Solar', 'Solar'), 'bioenergy': ('Bioenergy', 'Bioenergía'),
      'other-renewables': ('Geothermal and other renewables', 'Geotermia y otras renovables')}
used = {v['main_power_source'] for v in DATA.values() if 'main_power_source' in v}
field('main_power_source', 'Main source of electricity', 'Principal fuente de electricidad', 'energy', 'category', 'owid_energy', year=2025,
      categories={k: {'en': v[0], 'es': v[1]} for k, v in MP.items() if k in used})

def grapher_latest(fn, col, minyear):
    """Latest value per country from an Our World in Data chart CSV (entity, code, year, <col>)."""
    latest = {}
    for row in csv_rows('raw', fn):
        code = 'XKX' if row['code'] == 'OWID_KOS' else row['code']
        if len(code) != 3 or not row.get(col):
            continue
        yy = int(row['year'])
        if yy >= minyear and yy >= latest.get(code, (0, 0))[0]:
            latest[code] = (yy, float(row[col]))
    return latest


hdi = grapher_latest('owid-hdi.csv', 'hdi__sex_total', 2018)
for iso, (yy, v) in hdi.items():
    put(iso, 'hdi', round(v, 3))
hdi_year = collections.Counter(yy for yy, _ in hdi.values()).most_common(1)[0][0]
field('hdi', 'Human Development Index', 'Índice de Desarrollo Humano', 'people', 'number', 'owid_hdi', unit='index (0–1)', year=hdi_year, scale='linear', higherIs='good',
      note=f'{hdi_year} values from the Human Development Report 2025 (life expectancy, education and income).')


def owid_dataset(dirname, colname, fid, nd, minyear):
    path = P('repos', 'owid_owid-datasets', 'datasets', dirname, dirname + '.csv')
    if not os.path.exists(path):
        return None
    latest = {}
    with open(path, encoding='utf-8', newline='') as fh:
        for row in csv.DictReader(fh):
            iso = owid_name_to_iso.get(row['Entity'])
            if not iso or not row.get(colname):
                continue
            yy = int(row['Year'])
            if yy >= latest.get(iso, (0, 0))[0]:
                latest[iso] = (yy, float(row[colname]))
    yc = collections.Counter()
    for iso, (yy, v) in latest.items():
        if yy >= minyear:
            put(iso, fid, round(v, nd))
            yc[yy] += 1
    return yc.most_common(1)[0][0] if yc else None


whr = grapher_latest('owid-happiness.csv', 'cantril_ladder_score', 2019)
for iso, (yy, v) in whr.items():
    put(iso, 'happiness', round(v, 2))
whr_year = collections.Counter(yy for yy, _ in whr.values()).most_common(1)[0][0]
field('happiness', 'Life satisfaction (happiness)', 'Satisfacción con la vida (felicidad)', 'people', 'number', 'owid_whr', unit='Cantril ladder score (0–10)',
      year=whr_year, scale='linear', higherIs='good',
      note=f'World Happiness Report 2026: average answer, 0 (worst possible life) to 10 (best), {whr_year} or the latest year surveyed.')
y = owid_dataset('Human Height - NCD RisC (2017)', 'Mean male height (cm)', 'height_male_cm', 1, 1990)
owid_dataset('Human Height - NCD RisC (2017)', 'Mean female height (cm)', 'height_female_cm', 1, 1990)
if y:
    field('height_male_cm', 'Average height of men', 'Estatura media de los hombres', 'fun', 'number', 'owid_height', unit='cm', year=y, scale='linear', higherIs='neutral',
          note='Adults born in 1996 (NCD-RisC 2017).')
    field('height_female_cm', 'Average height of women', 'Estatura media de las mujeres', 'fun', 'number', 'owid_height', unit='cm', year=y, scale='linear', higherIs='neutral',
          note='Adults born in 1996 (NCD-RisC 2017).')

# ------------------------------------------------------------------ languages
def lang_cldr_code(code3):
    if code3 in CL.CLDR_CODE:
        return CL.CLDR_CODE[code3]
    a = aliases.get(code3)
    if a and a.get('_replacement'):
        return a['_replacement'].split('_')[0]
    return code3


lang_en_mled = {}
for c in mled.values():
    for k, v in (c.get('languages') or {}).items():
        lang_en_mled.setdefault(k, v)


def lang_share(iso, code3):
    a2 = iso2.get(iso)
    info = terrinfo.get(a2, {}).get('languagePopulation', {}) if a2 else {}
    cc = lang_cldr_code(code3)
    best = 0.0
    for k, v in info.items():
        if k.split('_')[0] == cc or (code3 == 'gsw' and k == 'de'):
            best = max(best, float(v.get('_populationPercent', 0)))
    return best


lang_used = set()
for iso in KEYS:
    if iso in CX.NON_ISO:
        codes = list(CX.NON_ISO[iso]['languages'])
    elif iso in CL.LANG_FIX:
        codes = list(CL.LANG_FIX[iso])
    elif iso in mled:
        codes = list((mled[iso].get('languages') or {}).keys())
    else:
        codes = []
    if not codes:
        continue
    codes.sort(key=lambda c: -lang_share(iso, c))
    first = CL.PRIMARY_FIRST.get(iso)
    if first in codes:
        codes.remove(first)
        codes.insert(0, first)
    put(iso, 'languages', codes)
    lang_used.update(codes)
    fam = CL.LANG_FAMILY.get(codes[0])
    if fam:
        put(iso, 'language_family', fam[0])
        put(iso, 'language_branch', fam[1])
    script = CL.LANG_SCRIPT.get(codes[0])
    if script:
        put(iso, 'script', script)
lang_cats = {}
for code in sorted(lang_used):
    cc = lang_cldr_code(code)
    en = CL.NAME_EN.get(code) or lang_en_mled.get(code) or lang_names['en'].get(cc) or code
    es = CL.NAME_ES.get(code) or lang_names['es'].get(cc) or lang_names['es'].get(code)
    if not es:
        print('WARNING: no Spanish name for language', code)
        es = en
    lang_cats[code] = {'en': en, 'es': es[0].upper() + es[1:]}
    if code in CL.LANG_FAMILY:
        lang_cats[code]['family'], lang_cats[code]['branch'] = CL.LANG_FAMILY[code]   # the "Which language family?" quiz
field('languages', 'Official languages', 'Lenguas oficiales', 'culture', 'list', 'mledoze', categories=lang_cats,
      note='ISO 639-3 codes; ordered main language first (by speaker share from Unicode CLDR territoryInfo plus compiled adjustments). Spanish names from CLDR.')
# every official language's family has a name (the quiz asks about them all), not only the main languages'
fam_used = {v['language_family'] for v in DATA.values() if 'language_family' in v} | {CL.LANG_FAMILY[c][0] for c in lang_used if c in CL.LANG_FAMILY}
br_used = {v['language_branch'] for v in DATA.values() if 'language_branch' in v}
field('language_family', 'Language family (main language)', 'Familia lingüística (lengua principal)', 'culture', 'category', 'compiled',
      categories={k: {'en': v[0], 'es': v[1]} for k, v in CL.FAMILY_NAMES.items() if k in fam_used},
      note='Family of the first language in "languages" (standard classification).')
field('language_branch', 'Language branch (main language)', 'Rama lingüística (lengua principal)', 'culture', 'category', 'compiled',
      categories={k: {'en': v[0], 'es': v[1]} for k, v in CL.BRANCH_NAMES.items() if k in br_used})
sc_used = {v['script'] for v in DATA.values() if 'script' in v}
field('script', 'Writing system (main language)', 'Sistema de escritura (lengua principal)', 'culture', 'category', 'compiled',
      categories={k: {'en': v[0], 'es': v[1], 'emoji': v[2], 'color': v[3]} for k, v in CL.SCRIPT_NAMES.items() if k in sc_used},
      note='Script of the first language in "languages", as it is officially written. Several countries use more than one: '
           'Serbia and Montenegro (Cyrillic and Latin), Kazakhstan (moving from Cyrillic to Latin), Mongolia (Cyrillic and the '
           'traditional Mongolian script), Morocco and Algeria (Arabic, and Tifinagh or Latin for Amazigh), and many countries '
           'with English or French in Latin letters beside a language of their own.')

# ------------------------------------------------------------------ currencies
def cldr_current_currencies(a2):
    out = []
    for entry in curdata.get(a2, []):
        for code, info in entry.items():
            if '_to' not in info and info.get('_tender', 'true') != 'false':
                out.append(code)
    return out


cur_used = set()
for iso in KEYS:
    if iso in CX.NON_ISO:
        codes = CX.NON_ISO[iso].get('currency', [])
    elif iso in mled:
        codes = list((mled[iso].get('currencies') or {}).keys())
    else:
        codes = []
    if not codes:
        continue
    pref = cldr_current_currencies(iso2.get(iso, ''))
    own = iso2.get(iso, '??')   # the country's own ISO currency (e.g. LSL in Lesotho) goes first
    codes.sort(key=lambda c: (0 if c[:2] == own and c in cur_names['en'] else 1, pref.index(c) if c in pref else 99, c))
    put(iso, 'currency', codes)
    cur_used.update(codes)
cur_cats = {}
mled_cur_names = {}
for c in mled.values():
    for k, v in (c.get('currencies') or {}).items():
        mled_cur_names.setdefault(k, v.get('name'))
for code in sorted(cur_used):
    en = (cur_names['en'].get(code) or {}).get('displayName') or mled_cur_names.get(code) or code
    es = (cur_names['es'].get(code) or {}).get('displayName') or en
    cur_cats[code] = {'en': en[0].upper() + en[1:], 'es': es[0].upper() + es[1:]}
field('currency', 'Currency', 'Moneda', 'economy', 'list', 'mledoze', categories=cur_cats,
      note='ISO 4217 codes; main currency first (CLDR currency data). Names from Unicode CLDR.')

# calling codes
ZONES = {'1': ('North American Numbering Plan', 'Plan de numeración norteamericano'), '2': ('Africa (and some islands)', 'África (y algunas islas)'),
         '3': ('Europe (+3)', 'Europa (+3)'), '4': ('Europe (+4)', 'Europa (+4)'), '5': ('Latin America', 'América Latina'),
         '6': ('Southeast Asia and Oceania', 'Sudeste Asiático y Oceanía'), '7': ('Russia and Kazakhstan', 'Rusia y Kazajistán'),
         '8': ('East Asia and special services', 'Asia Oriental y servicios especiales'), '9': ('West, Central and South Asia', 'Asia Occidental, Central y del Sur')}
for iso, c in mled.items():
    idd = c.get('idd') or {}
    root, suf = idd.get('root') or '', idd.get('suffixes') or []
    if not root:
        continue
    if iso == 'VAT':
        code = '+39'   # Vatican uses the Italian +39 06 698
    elif len(suf) == 1:
        code = root + suf[0]
        if root == '+1' and len(suf[0]) == 3:
            code = '+1 ' + suf[0]
    elif root == '+1':
        code = '+1' if len(suf) > 3 else '+1 ' + '/'.join(suf)   # e.g. Dominican Republic +1 809/829/849
    elif root == '+7':
        code = '+7'
    else:
        lcp = os.path.commonprefix(suf)
        code = root + (lcp[:2] if lcp else suf[0])   # Western Sahara +212, Saint Helena +290
    put(iso, 'calling_code', code)
    put(iso, 'calling_zone', root[1])
for iso, x in CX.NON_ISO.items():
    put(iso, 'calling_code', x['calling_code'])
    put(iso, 'calling_zone', x['calling_code'][1])
field('calling_code', 'International calling code', 'Prefijo telefónico internacional', 'fun', 'text', 'mledoze')
field('calling_zone', 'Telephone numbering zone', 'Zona de numeración telefónica', 'fun', 'category', 'mledoze',
      categories={k: {'en': v[0], 'es': v[1]} for k, v in ZONES.items()}, note='First digit of the calling code (ITU world numbering zones).')

# ------------------------------------------------------------------ CLDR conventions
DAYS = {'mon': ('Monday', 'Lunes'), 'sun': ('Sunday', 'Domingo'), 'sat': ('Saturday', 'Sábado'), 'fri': ('Friday', 'Viernes')}
MEAS = {'metric': ('Metric', 'Sistema métrico'), 'us': ('US customary units', 'Sistema anglosajón (EE. UU.)'),
        'uk': ('Mixed metric / imperial (UK style)', 'Mixto métrico / imperial (estilo británico)')}
PAPER = {'a4': ('A4', 'A4'), 'us-letter': ('US Letter', 'Carta (EE. UU.)')}
CLOCK = {'24h': ('24-hour clock', 'Reloj de 24 horas'), '12h': ('12-hour clock (AM/PM)', 'Reloj de 12 horas (a. m./p. m.)')}
for iso in KEYS:
    a2 = CX.NON_ISO[iso]['cldr_proxy'] if iso in CX.NON_ISO else iso2.get(iso)
    if not a2:
        continue
    put(iso, 'start_of_week', week['firstDay'].get(a2, week['firstDay']['001']))
    ms = measure['measurementSystem'].get(a2, 'metric')
    put(iso, 'measurement_system', {'metric': 'metric', 'US': 'us', 'UK': 'uk'}[ms])
    put(iso, 'paper_size', 'us-letter' if measure['paperSize'].get(a2) == 'US-Letter' else 'a4')
    td = timedata.get(a2) or timedata.get('001')
    put(iso, 'clock_format', '12h' if td['_preferred'] == 'h' else '24h')
field('start_of_week', 'First day of the week', 'Primer día de la semana', 'culture', 'category', 'cldr',
      categories={k: {'en': v[0], 'es': v[1]} for k, v in DAYS.items()})
field('measurement_system', 'Measurement system', 'Sistema de medidas', 'culture', 'category', 'cldr',
      categories={k: {'en': v[0], 'es': v[1]} for k, v in MEAS.items()},
      note='CLDR measurementData: US customary in the US and Liberia; UK-style mix in the UK and Myanmar.')
field('paper_size', 'Paper size', 'Tamaño de papel', 'fun', 'category', 'cldr', categories={k: {'en': v[0], 'es': v[1]} for k, v in PAPER.items()})
field('clock_format', 'Preferred clock format', 'Formato horario preferido', 'culture', 'category', 'cldr',
      categories={k: {'en': v[0], 'es': v[1]} for k, v in CLOCK.items()})

# ------------------------------------------------------------------ driving side (country-coder)
borders_cc = jload('npm', 'country-coder-5.6.1', 'package', 'src', 'data', 'borders.json')['features']
by_code = {}
for f in borders_cc:
    pr = f['properties']
    for k in ('iso1A2', 'iso1A3', 'm49', 'wikidata'):
        if pr.get(k):
            by_code[pr[k]] = f


def cc_attr(iso, attr, default):
    """country-coder value for a country; features without geometry (e.g. GBR, FRA, USA) take the
    common value of their parts, ignoring parts that are separate entities in our data."""
    f = by_code.get(iso)
    if not f:
        return None
    pr = f['properties']
    if f.get('geometry'):
        return pr.get(attr) or default
    codes = {c for c in (pr.get('iso1A2'), pr.get('iso1A3'), pr.get('wikidata')) if c}
    vals = set()
    for m in borders_cc:
        mp = m['properties']
        groups = set(mp.get('groups') or [])
        if not m.get('geometry') or not (mp.get('country') == pr.get('iso1A2') or codes & groups):
            continue
        if mp.get('level') == 'subterritory' and not codes & groups:
            continue          # outlying parts (e.g. Akrotiri and Dhekelia for the UK, Ceuta for Spain)
        own = mp.get('iso1A3')
        if own and own != iso and own in KEYS:
            continue          # e.g. Puerto Rico inside USA
        if any(a2_to_iso.get(g) not in (None, iso) and a2_to_iso[g] in KEYS for g in groups):
            continue          # part of another entity of ours (e.g. Saint Helena, BIOT islands)
        vals.add(mp.get(attr) or default)
    return vals.pop() if len(vals) == 1 else None


for iso in KEYS:
    if iso in CX.NON_ISO:
        put(iso, 'driving_side', CX.NON_ISO[iso]['driving_side'])
        put(iso, 'speed_unit', 'kmh')
        continue
    if iso in ('ATA', 'BVT', 'HMD', 'SGS', 'ATF', 'UMI'):
        continue   # (nearly) uninhabited, no road network
    ds = cc_attr(iso, 'driveSide', 'right')
    put(iso, 'driving_side', ds)
    su = cc_attr(iso, 'roadSpeedUnit', 'km/h')
    put(iso, 'speed_unit', {'km/h': 'kmh', 'mph': 'mph'}.get(su))
field('driving_side', 'Driving side', 'Sentido de circulación', 'fun', 'category', 'coder',
      categories={'left': {'en': 'Drives on the left', 'es': 'Conducción por la izquierda'},
                  'right': {'en': 'Drives on the right', 'es': 'Conducción por la derecha'}})
field('speed_unit', 'Road speed unit', 'Unidad de velocidad en carretera', 'fun', 'category', 'coder',
      categories={'kmh': {'en': 'km/h', 'es': 'km/h'}, 'mph': {'en': 'mph', 'es': 'mph (millas por hora)'}})

# ------------------------------------------------------------------ countries gem: VAT & vehicle codes
for iso in KEYS:
    g = gem3.get(iso)
    if not g:
        continue
    vat = (g.get('vat_rates') or {}).get('standard')
    if isinstance(vat, (int, float)) and (g.get('eu_member') or g.get('eea_member') or iso in ('GBR', 'CHE')):
        put(iso, 'vat_rate', vat)
    put(iso, 'vehicle_code', g.get('vehicle_registration_code'))
field('vat_rate', 'Standard VAT rate (Europe)', 'Tipo general del IVA (Europa)', 'economy', 'number', 'gem', unit='%', year=2025, scale='linear', higherIs='neutral',
      note='Standard VAT rate for EU/EEA countries, the UK and Switzerland as listed by the countries gem (other countries omitted: values not maintained).')
field('vehicle_code', 'International vehicle code', 'Código internacional de vehículos', 'fun', 'text', 'gem',
      note='Distinguishing sign of vehicles in international traffic (e.g. E for Spain).')

# ------------------------------------------------------------------ religion
for iso in KEYS:
    if iso in CX.NON_ISO:
        put(iso, 'religion', CX.NON_ISO[iso]['religion'])
        continue
    if iso in CX.RELIGION_FIX:
        put(iso, 'religion', CX.RELIGION_FIX[iso])
        continue
    t = fbt(iso, 'People and Society', 'Religions')
    if iso == 'PSE':
        t = fb.text(dict(profiles['PSE'])['gz'], 'People and Society', 'Religions')
    cat, share, prov = REL.largest_religion(t, iso)
    put(iso, 'religion', cat)
    if share and iso != 'PSE':
        put(iso, 'religion_pct', share)
rel_used = {v['religion'] for v in DATA.values() if 'religion' in v}
field('religion', 'Largest religion', 'Religión mayoritaria', 'culture', 'category', 'factbook',
      categories={k: {'en': v[0], 'es': v[1]} for k, v in REL.CATEGORIES.items() if k in rel_used},
      note='Largest religious group (plurality) from the factbook "Religions" breakdown, with its largest branch; '
           'Islamic branch defaults (Iran, Iraq, Azerbaijan, Bahrain: Shia; Oman: Ibadi; others Sunni) and a few corrections are compiled.')
field('religion_pct', 'Share of the largest religion', 'Porcentaje de la religión mayoritaria', 'culture', 'number', 'factbook', unit='% of population',
      scale='linear', higherIs='neutral', note='Only where the factbook breakdown is (nearly) complete; survey years vary.')

# ------------------------------------------------------------------ government type, independence
for iso in KEYS:
    if iso in CX.NON_ISO:
        put(iso, 'government_type', CX.NON_ISO[iso]['government_type'])
        continue
    t = fbt(iso, 'Government', 'Government type')
    if not t:
        continue
    tl = t.lower()
    if iso in ('ESH', 'ATA', 'PSE'):
        continue   # disputed / no government
    if iso in CP.GOV_OVERRIDE:
        g = CP.GOV_OVERRIDE[iso]
    elif (DATA[iso].get('independent') is False and iso != 'TWN') or (
            DATA[iso].get('independent') is None and re.search(r'territor|overseas|dependency|part of the kingdom|special administrative|'
                                                               r'collectivity|commonwealth in political|crown dependency', tl)):
        g = 'dependent-territory'
    elif re.search(r'absolute monarchy|ecclesiastical', tl):
        g = 'absolute-monarchy'
    elif re.search(r'monarchy|commonwealth realm|co-principality|emirate', tl):
        g = 'constitutional-monarchy'
    elif 'communist' in tl:
        g = 'one-party-state'
    elif 'theocratic' in tl:
        g = 'theocracy'
    elif re.search(r'military|in transition|transitional|formerly', tl):
        g = 'military-transitional'
    elif 'semi-presidential' in tl:
        g = 'semi-presidential-republic'
    elif 'presidential' in tl or 'constitutional federal republic' in tl:
        g = 'presidential-republic'
    elif 'parliamentary' in tl:
        g = 'parliamentary-republic'
    else:
        g = None
        print('WARNING: unclassified government type', iso, t[:80])
    put(iso, 'government_type', g)
gov_used = {v['government_type'] for v in DATA.values() if 'government_type' in v}
field('government_type', 'System of government', 'Sistema de gobierno', 'politics', 'category', 'factbook',
      categories={k: {'en': v[0], 'es': v[1]} for k, v in CP.GOV_CATEGORIES.items() if k in gov_used},
      note='Keyword classification of the factbook "Government type" text, with a few compiled corrections (e.g. Switzerland directorial, UAE absolute monarchy).')

for iso in KEYS:
    if DATA[iso].get('independent') is False and iso not in ('PSE', 'ESH', 'TWN', 'SOL', 'CYN'):
        continue
    if DATA[iso].get('government_type') == 'dependent-territory':
        continue
    put(iso, 'monarchy', iso in CP.MONARCHIES)
    put(iso, 'federal', iso in CP.FEDERATIONS)
field('monarchy', 'Monarchy', 'Monarquía', 'politics', 'boolean', 'compiled', note='Sovereign states with a monarch as head of state (incl. the 15 Commonwealth realms).')
field('federal', 'Federal state', 'Estado federal', 'politics', 'boolean', 'compiled', note='Countries with a federal constitution (Forum of Federations list).')

from_used = set()
for iso in KEYS:
    if iso not in profiles:
        continue
    t = fbt(iso, 'Government', 'Independence')
    if not t or re.match(r'\s*(none|no official)', t, re.I):
        continue
    if iso in CP.INDEP_YEAR_OVERRIDE:
        yr = CP.INDEP_YEAR_OVERRIDE[iso]
    else:
        m = re.search(r'\b(\d{3,4})\b(?!\s*B\.C\.)', t)
        yr = int(m.group(1)) if m and 'B.C.' not in t[:m.end() + 6] else None
    if yr:
        put(iso, 'independence_year', yr)
    low = t.lower()
    src = None
    # "(from X)"-style groups with the year in front; take the first one close to the independence year
    for gm in re.finditer(r'(\d{3,4})\s*\(([^)]*)', low):
        if 'from ' not in gm.group(2) or (yr and abs(int(gm.group(1)) - yr) > 10):
            continue
        frag = gm.group(2).split('from ', 1)[1]
        for pat, sid in CP.INDEP_FROM_PATTERNS:
            if re.search(pat, frag):
                src = sid
                break
        if src:
            break
    if src is None:
        for pat, sid in ((r'czechoslovakia split', 'czechoslovakia'), (r'union with sweden', 'swe'), (r'expulsion of the portuguese', 'prt'),
                         (r'danish crown', 'dnk'), (r'mandate under british administration', 'gbr'), (r'within the ottoman empire', 'ottoman-empire')):
            if re.search(pat, low):
                src = sid
    if src is None and re.search(r'british|\buk\b', low) and re.search(r'colon|statute of westminster', low):
        src = 'gbr'   # dominions: Canada, South Africa
    if src:
        put(iso, 'independence_from', src)
        from_used.add(src)
field('independence_year', 'Year of independence', 'Año de independencia', 'politics', 'number', 'factbook', unit='year', scale='linear', higherIs='neutral',
      note='First date in the factbook "Independence" entry. For states never colonised this is a founding or unification date '
           '(e.g. Spain 1492, Thailand 1238); empty where none applies (UK, France, Austria, Japan, Ethiopia, territories).')
field('independence_from', 'Independence from', 'Independencia de', 'politics', 'category', 'factbook',
      categories={k: {'en': v[0], 'es': v[1]} for k, v in CP.INDEP_FROM_NAMES.items() if k in from_used},
      note='State or administration from which independence was obtained (first "from …" in the factbook entry).')

# ------------------------------------------------------------------ memberships & compiled politics
for oid, (en, es, members_s, note) in CP.ORGS.items():
    for iso in members_s.split():
        DATA[iso].setdefault('organizations', []).append(oid)
field('organizations', 'Membership of international organisations', 'Pertenencia a organizaciones internacionales', 'politics', 'list', 'compiled',
      categories={k: {'en': v[0], 'es': v[1]} for k, v in CP.ORGS.items()}, year=2026,
      note='Full members as of 2026: ' + '; '.join('%s – %s' % (v[0], v[3]) for v in CP.ORGS.values() if v[3]))
for iso, kind in CP.NUCLEAR_WEAPONS.items():
    put(iso, 'nuclear_weapons', kind)
field('nuclear_weapons', 'Nuclear weapons', 'Armas nucleares', 'politics', 'category', 'compiled', year=2026,
      categories={'declared': {'en': 'Declared nuclear-weapon state', 'es': 'Potencia nuclear declarada'},
                  'undeclared': {'en': 'Undeclared (widely believed)', 'es': 'No declarada (ampliamente asumida)'}})
for iso, n in CP.WORLD_CUP_MEN.items():
    put(iso, 'world_cup_titles', n)
for iso, n in CP.WORLD_CUP_WOMEN.items():
    put(iso, 'womens_world_cup_titles', n)
field('world_cup_titles', "FIFA World Cup titles (men's)", 'Mundiales de fútbol ganados (masculino)', 'fun', 'number', 'compiled', year=2026, unit='titles',
      scale='linear', higherIs='good', note="Tournaments 1930–2026 (Spain won in 2010 and 2026). Germany includes West Germany; GBR = England (1966).")
field('womens_world_cup_titles', "FIFA Women's World Cup titles", 'Mundiales de fútbol femenino ganados', 'fun', 'number', 'compiled', year=2023, unit='titles',
      scale='linear', higherIs='good', note='Tournaments 1991–2023. Germany includes West Germany.')

# ------------------------------------------------------------------ national symbols
def classify_symbols(text, vocab):
    out = []
    if not text:
        return out
    for item in re.split(r'[;,]|\band\b', text):
        il = item.lower().strip()
        if not il:
            continue
        for entry in vocab:
            if re.search(entry[0], il):
                if entry[1]:
                    out.append(entry)
                break
    return out


animal_cats, plant_cats = {}, {}
ANIMAL_BY_ID = {e[1]: e for e in CS.ANIMALS if e[1]}
PLANT_BY_ID = {e[1]: e for e in CS.PLANTS if e[1]}
for iso in KEYS:
    t = fbt(iso, 'Government', 'National symbol(s)')
    if iso in CS.ANIMAL_OVERRIDE:
        a = ANIMAL_BY_ID[CS.ANIMAL_OVERRIDE[iso]]
    else:
        found = classify_symbols(t, CS.ANIMALS)
        real = [e for e in found if len(e) < 6]
        a = (real or found or [None])[0]
    if a:
        put(iso, 'national_animal', a[1])
        animal_cats[a[1]] = {'en': a[2], 'es': a[3], **({'emoji': a[4]} if a[4] else {})}
    if iso in CS.PLANT_OVERRIDE:
        pid = CS.PLANT_OVERRIDE[iso]
        pl = PLANT_BY_ID[pid] if pid else None
    else:
        found = classify_symbols(t, CS.PLANTS)
        pl = found[0] if found else None
    if pl:
        put(iso, 'national_plant', pl[1])
        plant_cats[pl[1]] = {'en': pl[2], 'es': pl[3], **({'emoji': pl[4]} if pl[4] else {})}
field('national_animal', 'National animal', 'Animal nacional', 'nature', 'category', 'factbook', categories=animal_cats,
      note='First real animal among the factbook "National symbol(s)" (mythical or heraldic creatures such as dragons or garudas only when no '
           'real animal is listed). Spanish names and emoji compiled; India and Japan corrected (compiled).')
field('national_plant', 'National flower or tree', 'Flor o árbol nacional', 'nature', 'category', 'factbook', categories=plant_cats,
      note='First plant among the factbook "National symbol(s)". Spanish names and emoji compiled.')

color_cats = {}
for iso in KEYS:
    if iso in CS.COLOR_OVERRIDE:
        ids = CS.COLOR_OVERRIDE[iso]
    else:
        t = fbt(iso, 'Government', 'National color(s)')
        if not t:
            continue
        ids = []
        for item in re.split(r'[,;]', t.split(';')[0] if iso != 'GBR' else t):
            for pat, cid, en, es, hx in CS.COLORS:
                if re.search(pat, item.lower()):
                    if cid not in ids:
                        ids.append(cid)
                    break
    if ids:
        put(iso, 'national_colors', ids)
for pat, cid, en, es, hx in CS.COLORS:
    color_cats[cid] = {'en': en, 'es': es, 'color': hx}
used = {c for v in DATA.values() for c in v.get('national_colors', [])}
field('national_colors', 'National colours', 'Colores nacionales', 'culture', 'list', 'factbook',
      categories={k: v for k, v in color_cats.items() if k in used}, note='"color" gives an indicative hex value for drawing.')

res_cats = {}
for iso in KEYS:
    t = fbt(iso, 'Geography', 'Natural resources')
    if not t:
        continue
    ids = []
    for item in re.split(r'[,;]', re.sub(r'\((?:19|20)\d\d[^)]*\)', '', t)):
        il = item.lower()
        if re.search(r'\bnone\b|negligible|negl\b|possible|potential|unexploited|no longer', il):
            continue
        for pat, rid, en, es in CS.RESOURCES:
            if re.search(pat, il):
                if rid not in ids:
                    ids.append(rid)
                res_cats[rid] = {'en': en, 'es': es}
                break
    put(iso, 'natural_resources', ids)
field('natural_resources', 'Natural resources', 'Recursos naturales', 'nature', 'list', 'factbook', categories=res_cats,
      note='Resources listed by the factbook (normalised; "potential"/"unexploited" items dropped). See minerals.json for producer shares.')

# ------------------------------------------------------------------ exports
exp_cats, partner_isos = {}, set()
name_to_iso = {}
for iso in mled:
    for lang in ('en',):
        name_to_iso[country_name(iso, lang).lower()] = iso
    name_to_iso[mled[iso]['name']['common'].lower()] = iso
for iso, lst in profiles.items():
    for gec, prof in lst:
        n = fb.text(prof, 'Government', 'Country name', 'conventional short form')
        if n and n.lower() != 'none':
            name_to_iso.setdefault(n.lower(), iso)
name_to_iso.update(CX.PARTNER_ALIASES)
unmatched = collections.Counter()
for iso in KEYS:
    t = fbt(iso, 'Economy', 'Exports - commodities')
    if t:
        first = re.sub(r'\s*\d+(\.\d+)?%', '', re.sub(r'\((?:19|20)\d\d[^)]*\)', '', t).split(',')[0]).strip().lower()
        e = CX.EXPORTS.get(first)
        if e:
            put(iso, 'top_export', e[0])
            exp_cats[e[0]] = {'en': e[1], 'es': e[2]}
        else:
            unmatched['export:' + first] += 1
    t = fbt(iso, 'Economy', 'Exports - partners')
    if t:
        first = re.sub(r'\((?:19|20)\d\d[^)]*\)', '', t).split(',')[0]
        first = re.sub(r'\s*\d+(\.\d+)?\s*%.*$', '', first).strip().lower()
        pi = name_to_iso.get(first)
        if pi and pi != iso:
            put(iso, 'top_export_partner', pi)
            partner_isos.add(pi)
        else:
            unmatched['partner:' + first] += 1
if unmatched:
    print('unmatched export items:', dict(unmatched))
field('top_export', 'Main export', 'Principal producto de exportación', 'economy', 'category', 'factbook', year=2023, categories=exp_cats,
      note='First of the top-five export commodities by value (factbook, from OEC data).')
field('top_export_partner', 'Main export market', 'Principal destino de las exportaciones', 'economy', 'category', 'factbook', year=2023,
      categories=country_cats(partner_isos))

# ------------------------------------------------------------------ samayo: national dish & temperature
samayo_name = {}
for iso, c in mled.items():
    for n in [c['name']['common'], c['name']['official']] + list(c.get('altSpellings') or []):
        samayo_name.setdefault(n.lower(), iso)
samayo_name.update({'east timor': 'TLS', 'ivory coast': 'CIV', 'the democratic republic of congo': 'COD', 'congo': 'COG',
                    'fiji islands': 'FJI', 'holy see (vatican city state)': 'VAT', 'macao': 'MAC', 'micronesia, federated states of': 'FSM',
                    'reunion': 'REU', 'virgin islands, british': 'VGB', 'virgin islands, u.s.': 'VIR', 'swaziland': 'SWZ',
                    'libyan arab jamahiriya': 'LBY', 'saint helena': 'SHN', 'svalbard and jan mayen': 'SJM', 'russian federation': 'RUS',
                    'south korea': 'KOR', 'north korea': 'PRK', 'united states': 'USA', 'united kingdom': 'GBR', 'palestine': 'PSE',
                    'french southern territories': 'ATF', 'heard island and mcdonald islands': 'HMD', 'czech republic': 'CZE'})
DISH_FIX = {'CAN': 'Poutine', 'LVA': 'Grey peas with bacon (pelēkie zirņi ar speķi)', 'IND': None}
for fn, key, fid in (('country-by-national-dish.json', 'dish', 'national_dish'), ('country-by-yearly-average-temperature.json', 'temperature', 'avg_temperature')):
    path = P('repos', 'samayo_country-json', 'src', fn)
    with open(path, encoding='utf-8') as fh:
        rows = json.load(fh)
    for row in rows:
        iso = samayo_name.get(row['country'].lower())
        v = row.get(key)
        if not iso or v in (None, ''):
            continue
        if fid == 'national_dish':
            if iso in DISH_FIX:
                v = DISH_FIX[iso]
            if v is None or 'no official' in v.lower():
                continue
            v = ', '.join(p.strip() for p in re.split(r'\s*,\s*', v) if p.strip())
            v = v[0].upper() + v[1:]
        put(iso, fid, v)
field('national_dish', 'National dish', 'Plato nacional', 'culture', 'text', 'samayo',
      note='Dish names as listed by samayo/country-json (often several, in English or the original language); Canada, Latvia and India corrected (compiled).')
field('avg_temperature', 'Average yearly temperature', 'Temperatura media anual', 'geography', 'number', 'samayo', unit='°C', scale='linear', higherIs='neutral',
      note='Country-average climatological mean; the repository does not document the original source or period.')

# ------------------------------------------------------------------ Olympics
# Every country's medals through Milano Cortina 2026, from Wikipedia's all-time table (read by
# scripts/data/games/build-games-data.mjs); without it, the Olympedia results up to 2022.
alltime_path = os.path.join(HERE, '..', 'games', '_data', 'medals-alltime.json')
ol_path = P('repos', 'KeithGalli_Olympics-Dataset', 'clean-data', 'results.csv')
if os.path.exists(alltime_path):
    with open(alltime_path, encoding='utf-8') as fh:
        alltime = json.load(fh)
    for iso, (g, s_, b) in alltime['iso'].items():
        put(iso, 'olympic_medals', g + s_ + b)
        put(iso, 'olympic_golds', g)
    note = ('Summer and Winter Games 1896–2026 (through Milano Cortina 2026), from Wikipedia\'s all-time Olympic medal table: '
            'art competitions and the 1906 Intercalated Games are not counted, stripped medals are; medals of teams of the past '
            '(Soviet Union, East and West Germany, Yugoslavia, Czechoslovakia, Unified Team…) and of neutral teams (ROC, OAR, AIN…) '
            'are not given to today\'s countries.')
    field('olympic_medals', 'Olympic medals (all-time)', 'Medallas olímpicas (histórico)', 'fun', 'number', 'wiki_olympics', unit='medals', year=2026,
          scale='log', higherIs='good', note=note)
    field('olympic_golds', 'Olympic gold medals (all-time)', 'Medallas de oro olímpicas (histórico)', 'fun', 'number', 'wiki_olympics', unit='gold medals', year=2026,
          scale='log', higherIs='good', note=note)
elif os.path.exists(ol_path):
    noc_to_iso = {}
    for iso, g in gem3.items():
        if g.get('ioc'):
            noc_to_iso[g['ioc']] = iso
    for iso, c in mled.items():
        if c.get('cioc'):
            noc_to_iso.setdefault(c['cioc'], iso)
    noc_to_iso.update({'TPE': 'TWN', 'HKG': 'HKG', 'PUR': 'PRI', 'KOS': 'XKX', 'ROC': None, 'OAR': None})
    medals = set()
    with open(ol_path, encoding='utf-8', newline='') as fh:
        for row in csv.DictReader(fh):
            if not row['medal'] or not row['event'].endswith('(Olympic)') or row['discipline'] == 'Art Competitions':
                continue
            medals.add((row['year'], row['type'], row['discipline'], row['event'], row['noc'], row['medal']))
    tot, gold = collections.Counter(), collections.Counter()
    for (yy, typ, disc, ev, noc, med) in medals:
        iso = noc_to_iso.get(noc)
        if iso:
            tot[iso] += 1
            if med == 'Gold':
                gold[iso] += 1
    for iso, n in tot.items():
        put(iso, 'olympic_medals', n)
        put(iso, 'olympic_golds', gold.get(iso, 0))
    note = ('Summer and Winter Games 1896–2022 (Paris 2024 and Milano Cortina 2026 not included); team medals counted once; '
            'art competitions, 1906 Intercalated and Youth Games excluded; medals of predecessor teams (Soviet Union, East/West Germany, '
            'Yugoslavia, Czechoslovakia, ROC/OAR…) are not attributed to successor states. Counts may differ slightly from official IOC tables.')
    field('olympic_medals', 'Olympic medals (all-time)', 'Medallas olímpicas (histórico)', 'fun', 'number', 'olympedia', unit='medals', year=2022,
          scale='log', higherIs='good', note=note)
    field('olympic_golds', 'Olympic gold medals (all-time)', 'Medallas de oro olímpicas (histórico)', 'fun', 'number', 'olympedia', unit='gold medals', year=2022,
          scale='log', higherIs='good', note=note)

# ------------------------------------------------------------------ minerals.json
minerals = collections.OrderedDict()
for rid, (col, en, es, emoji) in CM.ENERGY.items():
    yr = max(y for y in world_energy[col] if any(energy[i].get(col, (0,))[0] == y for i in energy))
    world = world_energy[col][yr]
    prods = []
    for iso, cols in energy.items():
        if col in cols and cols[col][0] == yr and cols[col][1] > 0:
            prods.append((iso, round(100 * cols[col][1] / world, 1)))
    prods = sorted([p for p in prods if p[1] >= 0.1], key=lambda x: -x[1])
    minerals[rid] = {'en': en, 'es': es, 'emoji': emoji, 'unit': '% of world production (energy content)',
                     'unit_es': CX.UNIT_ES['% of world production (energy content)'], 'year': yr,
                     'source': S['owid_energy'][0] + ' – Energy Institute Statistical Review of World Energy', 'license': S['owid_energy'][1],
                     'producers': [list(p) for p in prods]}
for mid, m in CM.MINERALS.items():
    d = {'en': m['en'], 'es': m['es'], 'emoji': m['emoji'], 'unit': m['unit'], 'unit_es': CX.UNIT_ES[m['unit']], 'year': m['year'], 'source': m['source'],
         'approximate': True, 'producers': [list(p) for p in m['producers']]}
    if m.get('note'):
        d['note'] = m['note']
    minerals[mid] = d

# ------------------------------------------------------------------ mains electricity (Wikipedia)
PLUGS = {
    'A': ('Type A: two flat pins (US, Japan)', 'Tipo A: dos clavijas planas (EE. UU., Japón)'),
    'B': ('Type B: two flat pins and earth (US)', 'Tipo B: dos clavijas planas y tierra (EE. UU.)'),
    'C': ('Type C: Europlug, two round pins', 'Tipo C: europeo, dos clavijas redondas'),
    'D': ('Type D: three large round pins (India)', 'Tipo D: tres clavijas redondas grandes (India)'),
    'E': ('Type E: two round pins, earth pin in the socket (France)', 'Tipo E: dos clavijas redondas, tierra en la toma (Francia)'),
    'F': ('Type F: Schuko (Germany)', 'Tipo F: Schuko (Alemania)'),
    'G': ('Type G: three rectangular pins (UK)', 'Tipo G: tres clavijas rectangulares (Reino Unido)'),
    'H': ('Type H: three pins (Israel)', 'Tipo H: tres clavijas (Israel)'),
    'I': ('Type I: angled flat pins (Australia, China)', 'Tipo I: clavijas planas en V (Australia, China)'),
    'J': ('Type J: three round pins (Switzerland)', 'Tipo J: tres clavijas redondas (Suiza)'),
    'K': ('Type K: Denmark', 'Tipo K: Dinamarca'),
    'L': ('Type L: three round pins in a row (Italy)', 'Tipo L: tres clavijas en línea (Italia)'),
    'M': ('Type M: three large round pins (South Africa)', 'Tipo M: tres clavijas redondas grandes (Sudáfrica)'),
    'N': ('Type N: three round pins (Brazil)', 'Tipo N: tres clavijas redondas (Brasil)'),
    'O': ('Type O: Thailand', 'Tipo O: Tailandia'),
}
WIKI_ALIASES = {'bahamas': 'BHS', 'turkey': 'TUR', 'gambia': 'GMB', 'congo, republic of the': 'COG', 'congo, democratic republic of the': 'COD',
                'timor-leste': 'TLS', 'us virgin islands': 'VIR', 'saint helena, ascension and tristan da cunha': 'SHN',
                'bonaire': 'BES', 'french guiana': 'GUF', 'guadeloupe': 'GLP', 'martinique': 'MTQ', 'réunion': 'REU'}


def wiki_mains():
    path = P('raw', 'wikipedia-mains-electricity.json')
    if not os.path.exists(path):
        print('WARNING: no Wikipedia mains table; plug and voltage fields skipped')
        return {}
    text = jload('raw', 'wikipedia-mains-electricity.json')['parse']['wikitext']
    start = text.index('{|')
    table = text[start:text.index('\n|}', start)]
    names = dict(samayo_name)
    names.update(WIKI_ALIASES)
    clean = lambda x: re.sub(r'<!--.*?-->', '', re.sub(r'<ref[^>]*>.*?</ref>|<ref[^>/]*/>', '', x, flags=re.S), flags=re.S)
    out, unmatched = {}, []
    for row in table.split('\n|-')[1:]:
        cells = [ln[1:].strip() for ln in clean(row).split('\n') if ln.startswith('|')]
        if len(cells) < 5:
            continue
        m = re.search(r'\{\{flag(?:country|u)?\|([^}|]+)', cells[0])
        name = (m.group(1) if m else cells[0]).strip()
        iso = names.get(name.lower())
        if not iso or iso not in KEYS:
            unmatched.append(name)
            continue
        # Source order: where a country lists its main type first (UK "G, D, M") that stays first.
        plugs = list(dict.fromkeys(re.findall(r'\b([A-O])\b', re.sub(r'<br\s*/?>', ' ', cells[1]).replace('NEMA', ''))))
        volts = []
        for part in re.split(r'<br\s*/?>', cells[3].replace('&nbsp;', ' ').replace('&#x20;', ' ')):
            mm = re.match(r'\s*(\d{3})', part)
            if mm and int(mm.group(1)) <= 250 and int(mm.group(1)) not in volts:
                volts.append(int(mm.group(1)))   # single-phase (line to neutral) voltage; 3-phase/industrial values skipped
        hz = sorted(set(re.findall(r'(50|60)\s*(?:&nbsp;)?\s*(?:\[\[Hertz\|)?Hz', cells[4])))
        out[iso] = (plugs, volts, hz)
    if unmatched:
        print('mains: unmatched', unmatched)
    return out


mains = wiki_mains()
for iso, (plugs, volts, hz) in mains.items():
    put(iso, 'plug_types', plugs)
    low = any(v <= 130 for v in volts)
    high = any(v >= 220 for v in volts)
    if volts:
        put(iso, 'mains_voltage', 'both' if low and high else 'low' if low else 'high')
        put(iso, 'mains_volts', ' / '.join(f'{v} V' for v in sorted(volts)))
    if hz:
        put(iso, 'mains_frequency', '50-60' if len(hz) > 1 else hz[0])
if mains:
    used_plugs = {p for v in DATA.values() for p in v.get('plug_types', [])}
    field('plug_types', 'Plug types', 'Tipos de enchufe', 'fun', 'list', 'wiki_mains',
          categories={k: {'en': v[0], 'es': v[1]} for k, v in PLUGS.items() if k in used_plugs},
          note='Plug and socket types in use (letters as in the IEC World Plugs list), main type first where the source says so.')
    field('mains_voltage', 'Mains voltage', 'Tensión de la red', 'fun', 'category', 'wiki_mains',
          categories={'low': {'en': '100–127 V', 'es': '100–127 V'}, 'high': {'en': '220–240 V', 'es': '220–240 V'},
                      'both': {'en': 'Both, by region or building', 'es': 'Ambas, según la región o el edificio'}},
          note='Household (single-phase) voltage.')
    field('mains_volts', 'Mains voltage (volts)', 'Tensión de la red (voltios)', 'fun', 'text', 'wiki_mains')
    field('mains_frequency', 'Mains frequency', 'Frecuencia de la red', 'fun', 'category', 'wiki_mains',
          categories={'50': {'en': '50 Hz', 'es': '50 Hz'}, '60': {'en': '60 Hz', 'es': '60 Hz'},
                      '50-60': {'en': 'Both (50 and 60 Hz)', 'es': 'Ambas (50 y 60 Hz)'}})

# ------------------------------------------------------------------ write
# order fields by group for readability
GROUP_ORDER = ['people', 'economy', 'culture', 'geography', 'politics', 'nature', 'energy', 'fun']
FIELDS = collections.OrderedDict(sorted(FIELDS.items(), key=lambda kv: (GROUP_ORDER.index(kv[1]['group']), list(FIELDS).index(kv[0]))))
data = {}
for iso in sorted(DATA):
    rec = {k: DATA[iso][k] for k in FIELDS if k in DATA[iso]}
    if rec:
        data[iso] = rec
countries = {
    'meta': {
        'generated': 'build_attributes.py',
        'keys': 'ISO 3166-1 alpha-3; non-ISO entities drawn by Natural Earth: XKX (Kosovo), SOL (Somaliland), CYN (Northern Cyprus); '
                'Taiwan TWN, Western Sahara ESH and Palestine PSE use their ISO codes. Natural Earth features with ISO_A3 = -99 '
                '(France, Norway) map through ISO_A3_EH / ADM0_A3; KOS -> XKX.',
        'attribution': 'Data: CIA World Factbook; World Bank; Our World in Data; Natural Earth; mledoze/countries (ODbL); Unicode CLDR; '
                       'country-coder; Olympedia; samayo/country-json; compiled facts. See SOURCES.md.',
    },
    'fields': FIELDS,
    'data': data,
}
os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, 'countries.json'), 'w', encoding='utf-8') as fh:
    json.dump(countries, fh, ensure_ascii=False, separators=(',', ':'))
with open(os.path.join(OUT, 'minerals.json'), 'w', encoding='utf-8') as fh:
    json.dump(minerals, fh, ensure_ascii=False, indent=1)
print('wrote', os.path.join(OUT, 'countries.json'), len(data), 'entities,', len(FIELDS), 'fields')
print('wrote', os.path.join(OUT, 'minerals.json'), len(minerals), 'resources')
