"""Compiled language facts (source: "compiled", well-established linguistic classification).

* LANG_FAMILY: ISO 639-3 code -> (family id, branch id).  Classification follows the
  standard top-level families used by Glottolog / Ethnologue; creoles, pidgins and sign
  languages are grouped separately.
* NAME_EN / NAME_ES: names used when CLDR has no entry for the code (or a nicer short
  form is wanted).
* PRIMARY_FIRST: countries whose main (most widely used first) language must be put
  first by hand because the CLDR speaker share counts second-language speakers.
"""

LANG_FAMILY = {
    'afr': ('indo-european', 'germanic'), 'amh': ('afro-asiatic', 'semitic'),
    'ara': ('afro-asiatic', 'semitic'), 'arc': ('afro-asiatic', 'semitic'),
    'aym': ('aymaran', 'aymaran'), 'aze': ('turkic', 'oghuz'),
    'bar': ('indo-european', 'germanic'), 'bel': ('indo-european', 'slavic'),
    'ben': ('indo-european', 'indo-aryan'), 'ber': ('afro-asiatic', 'berber'),
    'bis': ('creole', 'english-creole'), 'bjz': ('creole', 'english-creole'),
    'bos': ('indo-european', 'slavic'), 'bul': ('indo-european', 'slavic'),
    'bwg': ('niger-congo', 'bantu'), 'cal': ('austronesian', 'malayo-polynesian'),
    'cat': ('indo-european', 'romance'), 'ces': ('indo-european', 'slavic'),
    'cha': ('austronesian', 'malayo-polynesian'), 'ckb': ('indo-european', 'iranian'),
    'cnr': ('indo-european', 'slavic'), 'crs': ('creole', 'french-creole'),
    'dan': ('indo-european', 'germanic'), 'deu': ('indo-european', 'germanic'),
    'div': ('indo-european', 'indo-aryan'), 'dzo': ('sino-tibetan', 'tibeto-burman'),
    'ell': ('indo-european', 'hellenic'), 'eng': ('indo-european', 'germanic'),
    'est': ('uralic', 'finnic'), 'fao': ('indo-european', 'germanic'),
    'fas': ('indo-european', 'iranian'), 'fij': ('austronesian', 'malayo-polynesian'),
    'fil': ('austronesian', 'malayo-polynesian'), 'fin': ('uralic', 'finnic'),
    'fra': ('indo-european', 'romance'), 'gil': ('austronesian', 'malayo-polynesian'),
    'gle': ('indo-european', 'celtic'), 'glv': ('indo-european', 'celtic'),
    'grn': ('tupian', 'tupi-guarani'), 'gsw': ('indo-european', 'germanic'),
    'hat': ('creole', 'french-creole'), 'heb': ('afro-asiatic', 'semitic'),
    'her': ('niger-congo', 'bantu'), 'hgm': ('khoe-kwadi', 'khoe'),
    'hif': ('indo-european', 'indo-aryan'), 'hin': ('indo-european', 'indo-aryan'),
    'hmo': ('creole', 'other-creole'), 'hrv': ('indo-european', 'slavic'),
    'hun': ('uralic', 'ugric'), 'hye': ('indo-european', 'armenian'),
    'ind': ('austronesian', 'malayo-polynesian'), 'isl': ('indo-european', 'germanic'),
    'ita': ('indo-european', 'romance'), 'jam': ('creole', 'english-creole'),
    'jpn': ('japonic', 'japonic'), 'kal': ('eskimo-aleut', 'inuit'),
    'kat': ('kartvelian', 'kartvelian'), 'kaz': ('turkic', 'kipchak'),
    'kck': ('niger-congo', 'bantu'), 'khi': ('khoe-kwadi', 'khoe'),
    'khm': ('austroasiatic', 'khmer'), 'kin': ('niger-congo', 'bantu'),
    'kir': ('turkic', 'kipchak'), 'kon': ('niger-congo', 'bantu'),
    'kor': ('koreanic', 'koreanic'), 'kwn': ('niger-congo', 'bantu'),
    'lao': ('kra-dai', 'tai'), 'lat': ('indo-european', 'romance'),
    'lav': ('indo-european', 'baltic'), 'lin': ('niger-congo', 'bantu'),
    'lit': ('indo-european', 'baltic'), 'loz': ('niger-congo', 'bantu'),
    'ltz': ('indo-european', 'germanic'), 'lua': ('niger-congo', 'bantu'),
    'mah': ('austronesian', 'malayo-polynesian'), 'mey': ('afro-asiatic', 'semitic'),
    'mfe': ('creole', 'french-creole'), 'mkd': ('indo-european', 'slavic'),
    'mlg': ('austronesian', 'malayo-polynesian'), 'mlt': ('afro-asiatic', 'semitic'),
    'mon': ('mongolic', 'mongolic'), 'mri': ('austronesian', 'malayo-polynesian'),
    'msa': ('austronesian', 'malayo-polynesian'), 'mya': ('sino-tibetan', 'tibeto-burman'),
    'nau': ('austronesian', 'malayo-polynesian'), 'nbl': ('niger-congo', 'bantu'),
    'ndc': ('niger-congo', 'bantu'), 'nde': ('niger-congo', 'bantu'),
    'ndo': ('niger-congo', 'bantu'), 'nep': ('indo-european', 'indo-aryan'),
    'nfr': ('indo-european', 'romance'), 'niu': ('austronesian', 'malayo-polynesian'),
    'nld': ('indo-european', 'germanic'), 'nno': ('indo-european', 'germanic'),
    'nob': ('indo-european', 'germanic'), 'nor': ('indo-european', 'germanic'),
    'nrf': ('indo-european', 'romance'), 'nso': ('niger-congo', 'bantu'),
    'nya': ('niger-congo', 'bantu'), 'nzs': ('sign-language', 'sign-language'),
    'pap': ('creole', 'portuguese-creole'), 'pau': ('austronesian', 'malayo-polynesian'),
    'pih': ('creole', 'english-creole'), 'pol': ('indo-european', 'slavic'),
    'por': ('indo-european', 'romance'), 'pov': ('creole', 'portuguese-creole'),
    'prs': ('indo-european', 'iranian'), 'pus': ('indo-european', 'iranian'),
    'que': ('quechuan', 'quechuan'), 'rar': ('austronesian', 'malayo-polynesian'),
    'roh': ('indo-european', 'romance'), 'ron': ('indo-european', 'romance'),
    'run': ('niger-congo', 'bantu'), 'rus': ('indo-european', 'slavic'),
    'sag': ('creole', 'other-creole'), 'sin': ('indo-european', 'indo-aryan'),
    'slk': ('indo-european', 'slavic'), 'slv': ('indo-european', 'slavic'),
    'smi': ('uralic', 'sami'), 'smo': ('austronesian', 'malayo-polynesian'),
    'sna': ('niger-congo', 'bantu'), 'som': ('afro-asiatic', 'cushitic'),
    'sot': ('niger-congo', 'bantu'), 'spa': ('indo-european', 'romance'),
    'sqi': ('indo-european', 'albanian'), 'srp': ('indo-european', 'slavic'),
    'ssw': ('niger-congo', 'bantu'), 'swa': ('niger-congo', 'bantu'),
    'swe': ('indo-european', 'germanic'), 'tam': ('dravidian', 'dravidian'),
    'tet': ('austronesian', 'malayo-polynesian'), 'tgk': ('indo-european', 'iranian'),
    'tha': ('kra-dai', 'tai'), 'tir': ('afro-asiatic', 'semitic'),
    'tkl': ('austronesian', 'malayo-polynesian'), 'toi': ('niger-congo', 'bantu'),
    'ton': ('austronesian', 'malayo-polynesian'), 'tpi': ('creole', 'english-creole'),
    'tsn': ('niger-congo', 'bantu'), 'tso': ('niger-congo', 'bantu'),
    'tuk': ('turkic', 'oghuz'), 'tur': ('turkic', 'oghuz'),
    'tvl': ('austronesian', 'malayo-polynesian'), 'ukr': ('indo-european', 'slavic'),
    'urd': ('indo-european', 'indo-aryan'), 'uzb': ('turkic', 'karluk'),
    'ven': ('niger-congo', 'bantu'), 'vie': ('austroasiatic', 'vietic'),
    'xho': ('niger-congo', 'bantu'), 'zdj': ('niger-congo', 'bantu'),
    'zho': ('sino-tibetan', 'sinitic'), 'zib': ('sign-language', 'sign-language'),
    'zul': ('niger-congo', 'bantu'),
    # languages added for the non-ISO entities / overrides
    'kur': ('indo-european', 'iranian'),
}

FAMILY_NAMES = {
    'indo-european': ('Indo-European', 'Indoeuropea'),
    'afro-asiatic': ('Afro-Asiatic', 'Afroasiática'),
    'niger-congo': ('Niger–Congo', 'Nígero-congoleña'),
    'austronesian': ('Austronesian', 'Austronesia'),
    'sino-tibetan': ('Sino-Tibetan', 'Sinotibetana'),
    'turkic': ('Turkic', 'Túrquica'),
    'uralic': ('Uralic', 'Urálica'),
    'dravidian': ('Dravidian', 'Drávida'),
    'austroasiatic': ('Austroasiatic', 'Austroasiática'),
    'kra-dai': ('Kra–Dai (Tai–Kadai)', 'Kra-dai (tai-kadai)'),
    'japonic': ('Japonic', 'Japónica'),
    'koreanic': ('Koreanic', 'Coreánica'),
    'kartvelian': ('Kartvelian', 'Kartveliana'),
    'mongolic': ('Mongolic', 'Mongólica'),
    'eskimo-aleut': ('Eskimo–Aleut', 'Esquimo-aleutiana'),
    'aymaran': ('Aymaran', 'Aimara'),
    'quechuan': ('Quechuan', 'Quechua'),
    'tupian': ('Tupian', 'Tupí'),
    'khoe-kwadi': ('Khoe–Kwadi (Khoisan)', 'Khoe-kwadi (joisana)'),
    'creole': ('Creole or pidgin', 'Criolla o pidgin'),
    'sign-language': ('Sign language', 'Lengua de señas'),
}

BRANCH_NAMES = {
    'germanic': ('Germanic', 'Germánica'),
    'romance': ('Romance', 'Romance'),
    'slavic': ('Slavic', 'Eslava'),
    'baltic': ('Baltic', 'Báltica'),
    'celtic': ('Celtic', 'Celta'),
    'hellenic': ('Hellenic (Greek)', 'Helénica (griego)'),
    'albanian': ('Albanian', 'Albanesa'),
    'armenian': ('Armenian', 'Armenia'),
    'indo-aryan': ('Indo-Aryan', 'Indoaria'),
    'iranian': ('Iranian', 'Irania'),
    'semitic': ('Semitic', 'Semítica'),
    'cushitic': ('Cushitic', 'Cusita'),
    'berber': ('Berber', 'Bereber'),
    'bantu': ('Bantu', 'Bantú'),
    'finnic': ('Finnic', 'Fínica'),
    'ugric': ('Ugric', 'Úgrica'),
    'sami': ('Sami', 'Sami'),
    'oghuz': ('Oghuz Turkic', 'Túrquica oghuz'),
    'kipchak': ('Kipchak Turkic', 'Túrquica kipchak'),
    'karluk': ('Karluk Turkic', 'Túrquica karluk'),
    'malayo-polynesian': ('Malayo-Polynesian', 'Malayo-polinesia'),
    'sinitic': ('Sinitic (Chinese)', 'Sinítica (chino)'),
    'tibeto-burman': ('Tibeto-Burman', 'Tibetano-birmana'),
    'tai': ('Tai', 'Tai'),
    'khmer': ('Khmer', 'Jemer'),
    'vietic': ('Vietic', 'Vietica'),
    'dravidian': ('Dravidian', 'Drávida'),
    'japonic': ('Japonic', 'Japónica'),
    'koreanic': ('Koreanic', 'Coreánica'),
    'kartvelian': ('Kartvelian', 'Kartveliana'),
    'mongolic': ('Mongolic', 'Mongólica'),
    'inuit': ('Inuit', 'Inuit'),
    'aymaran': ('Aymaran', 'Aimara'),
    'quechuan': ('Quechuan', 'Quechua'),
    'tupi-guarani': ('Tupi–Guarani', 'Tupí-guaraní'),
    'khoe': ('Khoe', 'Khoe'),
    'english-creole': ('English-based creole', 'Criollo de base inglesa'),
    'french-creole': ('French-based creole', 'Criollo de base francesa'),
    'portuguese-creole': ('Portuguese-based creole', 'Criollo de base portuguesa'),
    'other-creole': ('Other creole or pidgin', 'Otro criollo o pidgin'),
    'sign-language': ('Sign language', 'Lengua de señas'),
}

# English names: mledoze names are used, except where a shorter/clearer one is preferable.
NAME_EN = {
    'fas': 'Persian', 'nld': 'Dutch', 'msa': 'Malay', 'zho': 'Chinese', 'smi': 'Sami',
    'sot': 'Sotho', 'ron': 'Romanian', 'grn': 'Guaraní', 'ber': 'Berber (Tamazight)',
    'nau': 'Nauruan', 'toi': 'Tonga (Zambia)', 'lua': 'Tshiluba', 'kur': 'Kurdish',
}

# Spanish names used when CLDR 'es' has no entry for the code.
NAME_ES = {
    'prs': 'darí', 'ber': 'bereber (tamazight)', 'hif': 'hindi de Fiyi', 'cnr': 'montenegrino',
    'mey': 'hassanía', 'pov': 'criollo de Guinea-Bisáu', 'bjz': 'criollo beliceño',
    'jam': 'patois jamaicano', 'hgm': 'khoekhoe', 'kck': 'kalanga', 'khi': 'lenguas joisanas',
    'ndc': 'ndau', 'ndo': 'ndonga', 'kwn': 'kwangali', 'nfr': 'guernesiano',
    'nrf': 'jerseyés', 'pih': 'norfuk', 'zdj': 'comorense', 'mah': 'marshalés',
    'cal': 'carolinio', 'cha': 'chamorro', 'hmo': 'hiri motu', 'bwg': 'chibarwe',
    'smi': 'sami', 'zib': 'lengua de señas de Zimbabue', 'nzs': 'lengua de señas neozelandesa',
    'bar': 'bávaro', 'lat': 'latín', 'toi': 'tonga (Zambia)', 'her': 'herero',
    'sot': 'sesoto', 'nya': 'chichewa', 'lua': 'chiluba', 'nau': 'nauruano',
    'kon': 'kikongo', 'nor': 'noruego', 'nob': 'noruego bokmal', 'nno': 'noruego nynorsk',
    'fas': 'persa', 'msa': 'malayo', 'zho': 'chino', 'kur': 'kurdo', 'grn': 'guaraní',
}

# Code mapping to CLDR locale ids where CLDR's 3->2 letter aliases do not cover it.
CLDR_CODE = {'prs': 'fa', 'nor': 'no', 'zho': 'zh', 'msa': 'ms', 'fas': 'fa'}

# Main language first, where the CLDR speaker shares (which include second-language
# speakers) would otherwise put a lingua franca first.
PRIMARY_FIRST = {
    'LUX': 'ltz',  # Luxembourgish is the national language
    'PHL': 'fil',  # Filipino (Tagalog) is the national language
    'PRY': 'spa',  # Spanish dominates government and education; Guaraní co-official
    'HKG': 'zho', 'MAC': 'zho',
    'BOL': 'spa', 'PER': 'spa',
    'IRL': 'eng', 'MLT': 'mlt',
    'PAK': 'urd', 'IND': 'hin',
    'TZA': 'swa', 'KEN': 'swa',
    'AFG': 'prs',  # Dari is the most widely spoken (lingua franca)
    'SGP': 'eng', 'FJI': 'eng',
    'BDI': 'run', 'RWA': 'kin',
    'CAF': 'sag',  # Sango is spoken by nearly everyone; French is the elite language
    'MDG': 'mlg', 'HTI': 'hat',
    'SOM': 'som', 'ETH': 'amh', 'ERI': 'tir',
    'LSO': 'sot', 'SWZ': 'ssw', 'BWA': 'tsn',
    'TON': 'ton', 'WSM': 'smo', 'TUV': 'tvl', 'NRU': 'nau', 'KIR': 'gil', 'MHL': 'mah',
    'PLW': 'pau', 'COK': 'rar', 'NIU': 'niu', 'TKL': 'tkl',
    'GRL': 'kal', 'FRO': 'fao', 'BTN': 'dzo', 'MDV': 'div', 'LKA': 'sin',
    'CYP': 'ell', 'FIN': 'fin', 'BEL': 'nld', 'CHE': 'gsw', 'CAN': 'eng', 'NZL': 'eng',
    'ISR': 'heb', 'DZA': 'ara', 'MAR': 'ara', 'TLS': 'tet', 'VUT': 'bis',
    'PNG': 'tpi', 'SLB': 'eng', 'BLZ': 'eng', 'SYC': 'crs', 'MUS': 'mfe',
    'ABW': 'pap',  # Papiamento is the most spoken language
    'KAZ': 'kaz',  # Kazakh is the state language
    'MWI': 'nya',  # Chichewa is the national language
    'UGA': 'eng', 'NAM': 'eng',  # English is the main official language
    'COM': 'zdj',  # Comorian is the majority language
}

# Official-language lists replacing mledoze's where it uses a dialect code.
LANG_FIX = {
    'AUT': ['deu'],                       # mledoze: Austro-Bavarian (bar); official language is German
    'CHE': ['deu', 'fra', 'ita', 'roh'],  # mledoze: Swiss German (gsw); official is (Standard) German
}

# Writing systems: the script each language is officially written in (`script` field, the Writing systems filter).
# Sign languages have none. Where a language uses two scripts the usual one comes first in the note of the field.
_SCRIPT_LANGS = {
    'latin': 'afr aym aze bis bjz bos bwg cal cat ces cha cnr crs dan deu eng est fao fij fil fin fra gil gle glv grn hat her '
             'hgm hif hmo hrv hun ind isl ita jam kal kck khi kin kon kwn lat lav lin lit loz ltz lua mah mfe mlg mlt mri msa '
             'nau nbl ndc nde ndo nfr niu nld nno nob nor nrf nso nya pap pau pih pol por pov que rar roh ron run sag slk slv '
             'smi smo sna som sot spa sqi ssw swa swe tet tkl toi ton tpi tsn tso tuk tur tvl uzb ven vie xho zdj zul',
    'cyrillic': 'bel bul kaz kir mkd mon rus srp tgk ukr',
    'arabic': 'ara ckb mey prs fas pus urd',
    'hebrew': 'heb', 'syriac': 'arc', 'greek': 'ell', 'armenian': 'hye', 'georgian': 'kat', 'geez': 'amh tir',
    'devanagari': 'hin nep', 'bengali': 'ben', 'tamil': 'tam', 'sinhala': 'sin', 'thaana': 'div', 'tibetan': 'dzo',
    'thai': 'tha', 'lao': 'lao', 'khmer': 'khm', 'burmese': 'mya', 'han': 'zho', 'japanese': 'jpn', 'hangul': 'kor',
    'tifinagh': 'ber',
}
LANG_SCRIPT = {code: script for script, codes in _SCRIPT_LANGS.items() for code in codes.split()}

# id -> (English, Spanish, a letter of the script for the legend, colour). Neighbours get distinct colours.
SCRIPT_NAMES = {
    'latin': ('Latin', 'Latino', 'A', '#3d7ec9'),
    'cyrillic': ('Cyrillic', 'Cirílico', 'Ж', '#8e44ad'),
    'greek': ('Greek', 'Griego', 'Ω', '#17a589'),
    'armenian': ('Armenian', 'Armenio', 'Ա', '#5d6d7e'),
    'georgian': ('Georgian', 'Georgiano', 'ა', '#48c9b0'),
    'arabic': ('Arabic', 'Árabe', 'ع', '#27ae60'),
    'hebrew': ('Hebrew', 'Hebreo', 'א', '#f1c40f'),
    'syriac': ('Syriac', 'Siríaco', 'ܐ', '#7d6608'),
    'thaana': ('Thaana', 'Thaana', 'ތ', '#0e6655'),
    'geez': ("Ge'ez (Ethiopic)", "Ge'ez (etíope)", 'ሀ', '#b9770e'),
    'devanagari': ('Devanagari', 'Devanagari', 'अ', '#e67e22'),
    'bengali': ('Bengali', 'Bengalí', 'অ', '#c0392b'),
    'tamil': ('Tamil', 'Tamil', 'த', '#d98880'),
    'sinhala': ('Sinhala', 'Cingalés', 'අ', '#e84393'),
    'tibetan': ('Tibetan', 'Tibetano', 'ཀ', '#6e2c00'),
    'burmese': ('Burmese', 'Birmano', 'က', '#d4ac0d'),
    'thai': ('Thai', 'Tailandés', 'ก', '#ec7063'),
    'lao': ('Lao', 'Lao', 'ກ', '#7dcea0'),
    'khmer': ('Khmer', 'Jemer', 'ក', '#5b2c6f'),
    'han': ('Chinese characters', 'Caracteres chinos', '字', '#922b21'),
    'japanese': ('Japanese (kanji and kana)', 'Japonés (kanji y kana)', 'あ', '#f1948a'),
    'hangul': ('Hangul (Korean)', 'Hangul (coreano)', '한', '#1abc9c'),
    'tifinagh': ('Tifinagh', 'Tifinag', 'ⵣ', '#a04000'),
}
