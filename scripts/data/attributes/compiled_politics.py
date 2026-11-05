"""Compiled political facts (source: "compiled"), as of late 2026.  Only long-standing,
well-documented facts are listed; see the notes next to each table."""

# ---------------------------------------------------------------- memberships
ORGS = {
    # id: (English, Spanish, [ISO3 ...], note)
    'eu': ('European Union', 'Unión Europea', 'AUT BEL BGR HRV CYP CZE DNK EST FIN FRA DEU GRC HUN IRL ITA LVA LTU LUX MLT NLD POL PRT ROU SVK SVN ESP SWE', '27 member states'),
    'eurozone': ('Eurozone', 'Eurozona', 'AUT BEL BGR HRV CYP EST FIN FRA DEU GRC IRL ITA LVA LTU LUX MLT NLD PRT SVK SVN ESP', '21 members since Bulgaria adopted the euro on 1 Jan 2026'),
    'schengen': ('Schengen Area', 'Espacio Schengen', 'AUT BEL BGR HRV CZE DNK EST FIN FRA DEU GRC HUN ISL ITA LVA LIE LTU LUX MLT NLD NOR POL PRT ROU SVK SVN ESP SWE CHE', '29 members (Bulgaria and Romania fully since 1 Jan 2025)'),
    'nato': ('NATO', 'OTAN', 'ALB BEL BGR CAN HRV CZE DNK EST FIN FRA DEU GRC HUN ISL ITA LVA LTU LUX MNE NLD MKD NOR POL PRT ROU SVK SVN ESP SWE TUR GBR USA', '32 members (Finland 2023, Sweden 2024)'),
    'oecd': ('OECD', 'OCDE', 'AUS AUT BEL CAN CHL COL CRI CZE DNK EST FIN FRA DEU GRC HUN ISL IRL ISR ITA JPN KOR LVA LTU LUX MEX NLD NZL NOR POL PRT SVK SVN ESP SWE CHE TUR GBR USA', '38 members'),
    'g7': ('G7', 'G7', 'CAN FRA DEU ITA JPN GBR USA', ''),
    'g20': ('G20', 'G20', 'ARG AUS BRA CAN CHN FRA DEU IND IDN ITA JPN KOR MEX RUS SAU ZAF TUR GBR USA', '19 countries (plus the EU and the African Union)'),
    'brics': ('BRICS', 'BRICS', 'BRA RUS IND CHN ZAF EGY ETH IRN ARE IDN', 'full members as of 2025; Saudi Arabia has not formally confirmed membership'),
    'opec': ('OPEC', 'OPEP', 'DZA COG GNQ GAB IRN IRQ KWT LBY NGA SAU ARE VEN', '12 members (Angola left in 2024)'),
    'commonwealth': ('Commonwealth of Nations', 'Mancomunidad de Naciones', 'BWA CMR GAB GMB GHA KEN LSO MWI MUS MOZ NAM NGA RWA SYC SLE ZAF SWZ TZA TGO UGA ZMB BGD BRN IND MYS MDV PAK SGP LKA ATG BHS BRB BLZ CAN DMA GRD GUY JAM KNA LCA VCT TTO CYP MLT GBR AUS FJI KIR NRU NZL PNG WSM SLB TON TUV VUT', '56 members'),
    'asean': ('ASEAN', 'ASEAN', 'BRN KHM IDN LAO MYS MMR PHL SGP THA VNM TLS', '11 members (Timor-Leste admitted in October 2025)'),
    'african-union': ('African Union', 'Unión Africana', 'DZA AGO BEN BWA BFA BDI CPV CMR CAF TCD COM COG COD CIV DJI EGY GNQ ERI SWZ ETH GAB GMB GHA GIN GNB KEN LSO LBR LBY MDG MWI MLI MRT MUS MAR MOZ NAM NER NGA RWA STP SEN SYC SLE SOM ZAF SSD SDN TZA TGO TUN UGA ZMB ZWE ESH', '55 members incl. the Sahrawi Republic (some currently suspended)'),
    'arab-league': ('Arab League', 'Liga Árabe', 'DZA BHR COM DJI EGY IRQ JOR KWT LBN LBY MRT MAR OMN PSE QAT SAU SOM SDN SYR TUN ARE YEM', '22 members'),
    'mercosur': ('Mercosur', 'Mercosur', 'ARG BRA PRY URY BOL', 'full members (Bolivia since 2024; Venezuela suspended)'),
    'gcc': ('Gulf Cooperation Council', 'Consejo de Cooperación del Golfo', 'BHR KWT OMN QAT SAU ARE', ''),
    'efta': ('EFTA', 'AELC', 'ISL LIE NOR CHE', ''),
}

# Countries with a federal constitution (Forum of Federations list).
FEDERATIONS = set('ARG AUS AUT BEL BIH BRA CAN COM ETH DEU IND IRQ MYS MEX FSM NPL NGA PAK RUS KNA SOM SSD SDN CHE ARE USA VEN'.split())

# Sovereign monarchies (43 incl. the 15 Commonwealth realms).
MONARCHIES = set(('ATG AUS BHS BLZ CAN GRD JAM NZL PNG KNA LCA VCT SLB TUV GBR '
                  'AND BHR BEL BTN BRN KHM DNK SWZ JPN JOR KWT LSO LIE LUX MYS MCO MAR NLD NOR OMN QAT SAU ESP SWE THA TON ARE VAT').split())

# States possessing nuclear weapons (Israel: undeclared).
NUCLEAR_WEAPONS = {'USA': 'declared', 'RUS': 'declared', 'GBR': 'declared', 'FRA': 'declared', 'CHN': 'declared',
                   'IND': 'declared', 'PAK': 'declared', 'PRK': 'declared', 'ISR': 'undeclared'}

# FIFA World Cup titles (men's tournaments 1930-2022; women's 1991-2023).
WORLD_CUP_MEN = {'BRA': 5, 'DEU': 4, 'ITA': 4, 'ARG': 3, 'FRA': 2, 'URY': 2, 'GBR': 1, 'ESP': 1}
WORLD_CUP_WOMEN = {'USA': 4, 'DEU': 2, 'NOR': 1, 'JPN': 1, 'ESP': 1}

# ---------------------------------------------------------------- government
GOV_CATEGORIES = {
    'presidential-republic': ('Presidential republic', 'República presidencialista'),
    'semi-presidential-republic': ('Semi-presidential republic', 'República semipresidencialista'),
    'parliamentary-republic': ('Parliamentary republic', 'República parlamentaria'),
    'directorial-republic': ('Directorial republic', 'República directorial'),
    'constitutional-monarchy': ('Constitutional monarchy', 'Monarquía constitucional'),
    'absolute-monarchy': ('Absolute monarchy', 'Monarquía absoluta'),
    'one-party-state': ('One-party (communist) state', 'Estado de partido único (comunista)'),
    'theocracy': ('Theocracy', 'Teocracia'),
    'military-transitional': ('Military or transitional government', 'Gobierno militar o de transición'),
    'dependent-territory': ('Dependent territory', 'Territorio dependiente'),
}
# Corrections to the keyword classification of the factbook "Government type" text.
GOV_OVERRIDE = {
    'CHE': 'directorial-republic',     # Swiss Federal Council
    'ARE': 'absolute-monarchy',        # federation of seven hereditary emirates
    'FSM': 'parliamentary-republic',   # president elected by Congress
    'MHL': 'parliamentary-republic',   # president elected by the Nitijela
    'AND': 'constitutional-monarchy',  # co-principality
    'TKM': 'presidential-republic',
    'BLR': 'presidential-republic',
    'ERI': 'presidential-republic',    # one-party presidential state without elections
    'SMR': 'parliamentary-republic',
    'BRB': 'parliamentary-republic',   # republic since 2021 (factbook still says "Commonwealth realm")
    # factbook text predates these changes (compiled):
    'TUN': 'presidential-republic',    # 2022 constitution
    'KGZ': 'presidential-republic',    # 2021 constitution
    'GEO': 'parliamentary-republic',   # indirect presidency since 2024
    'SDN': 'military-transitional',    # military rule since 2021, civil war since 2023
    'MLI': 'military-transitional',    # junta since 2020-21
    'BFA': 'military-transitional',    # junta since 2022
    'MDG': 'military-transitional',    # military takeover in October 2025
}

# ---------------------------------------------------------------- independence
# keyword in the factbook "(from ...)" text -> id ; names below
INDEP_FROM_PATTERNS = [
    (r'france and the uk', 'fra-gbr'),
    (r'egypt and the uk', 'gbr'),
    (r'soviet union', 'soviet-union'),
    (r'russia', 'russia'),
    (r'state union of serbia and montenegro', 'serbia-montenegro'),
    (r'yugoslavia', 'yugoslavia'),
    (r'czechoslovakia', 'czechoslovakia'),
    (r'ottoman', 'ottoman-empire'),
    (r'holy roman empire', 'holy-roman-empire'),
    (r'south african mandate', 'zaf'),
    (r'belgian administration|belgium', 'bel'),
    (r'french administration|french-administered|france', 'fra'),
    (r'british administration|british india|great britain|the uk|uk protectorate|uk control|federation of uk colonies|\buk\b|british', 'gbr'),
    (r'australia-administered|australia-, nz-|australia', 'aus'),
    (r'new zealand', 'nzl'),
    (r'us-administered|us administration|the us\b', 'usa'),
    (r'spain', 'esp'), (r'portug', 'prt'), (r'netherlands', 'nld'),
    (r'ethiopia', 'eth'), (r'sudan', 'sdn'), (r'pakistan', 'pak'), (r'malaysia', 'mys'),
    (r'haiti', 'hti'), (r'brazil', 'bra'), (r'colombia', 'col'), (r'japan', 'jpn'),
    (r'china', 'chn'), (r'denmark', 'dnk'), (r'sweden', 'swe'), (r'serbia', 'srb'),
    (r'indonesia', 'idn'), (r'italian|italy', 'ita'),
    (r'un trusteeship', 'un-trusteeship'),
]
INDEP_FROM_NAMES = {
    'gbr': ('United Kingdom', 'Reino Unido'), 'fra': ('France', 'Francia'), 'esp': ('Spain', 'España'),
    'prt': ('Portugal', 'Portugal'), 'nld': ('Netherlands', 'Países Bajos'), 'bel': ('Belgium', 'Bélgica'),
    'ita': ('Italy', 'Italia'), 'usa': ('United States', 'Estados Unidos'), 'aus': ('Australia', 'Australia'),
    'nzl': ('New Zealand', 'Nueva Zelanda'), 'zaf': ('South Africa', 'Sudáfrica'), 'jpn': ('Japan', 'Japón'),
    'chn': ('China', 'China'), 'dnk': ('Denmark', 'Dinamarca'), 'swe': ('Sweden', 'Suecia'),
    'srb': ('Serbia', 'Serbia'), 'eth': ('Ethiopia', 'Etiopía'), 'sdn': ('Sudan', 'Sudán'),
    'pak': ('Pakistan', 'Pakistán'), 'mys': ('Malaysia', 'Malasia'), 'hti': ('Haiti', 'Haití'),
    'bra': ('Brazil', 'Brasil'), 'col': ('Colombia', 'Colombia'), 'idn': ('Indonesia', 'Indonesia'),
    'fra-gbr': ('France and the UK (condominium)', 'Francia y Reino Unido (condominio)'),
    'soviet-union': ('Soviet Union', 'Unión Soviética'), 'russia': ('Russia (Empire / Soviet Russia)', 'Rusia (Imperio / Rusia soviética)'),
    'yugoslavia': ('Yugoslavia', 'Yugoslavia'), 'serbia-montenegro': ('Serbia and Montenegro', 'Serbia y Montenegro'),
    'czechoslovakia': ('Czechoslovakia (dissolution)', 'Checoslovaquia (disolución)'),
    'ottoman-empire': ('Ottoman Empire', 'Imperio otomano'), 'holy-roman-empire': ('Holy Roman Empire', 'Sacro Imperio Romano Germánico'),
    'un-trusteeship': ('UN trusteeship', 'Fideicomiso de la ONU'),
}
# years that the factbook text would give wrongly for "independence"
INDEP_YEAR_OVERRIDE = {'JPN': None, 'ETH': None, 'CHN': None, 'IRN': None}  # factbook gives constitution/regime dates
