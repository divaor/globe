"""Compiled political facts (source: "compiled"), as of late 2026.  Only long-standing,
well-documented facts are listed; see the notes next to each table."""

# ---------------------------------------------------------------- memberships
ORGS = {
    # id: (English, Spanish, [ISO3 ...], note). Full members as of November 2026, checked against
    # the organisations' own lists or Wikipedia (permanent links, Sep-Nov 2026); see SOURCES.md.
    'eu': ("European Union", "Unión Europea", 'AUT BEL BGR CYP CZE DEU DNK ESP EST FIN FRA GRC HRV HUN IRL ITA LTU LUX LVA MLT NLD POL PRT ROU SVK SVN SWE',
        '27 members; Member states only'),
    'eurozone': ("Eurozone", "Eurozona", 'AUT BEL BGR CYP DEU ESP EST FIN FRA GRC HRV IRL ITA LTU LUX LVA MLT NLD PRT SVK SVN',
        '21 members; EU states using the euro'),
    'schengen': ("Schengen Area", "Espacio Schengen", 'AUT BEL BGR CHE CZE DEU DNK ESP EST FIN FRA GRC HRV HUN ISL ITA LIE LTU LUX LVA MLT NLD NOR POL PRT ROU SVK SVN SWE',
        '29 members; 25 EU states plus ISL, LIE, NOR and CHE'),
    'nato': ("NATO", "OTAN", 'ALB BEL BGR CAN CZE DEU DNK ESP EST FIN FRA GBR GRC HRV HUN ISL ITA LTU LUX LVA MKD MNE NLD NOR POL PRT ROU SVK SVN SWE TUR USA',
        '32 members'),
    'oecd': ("OECD", "OCDE", 'AUS AUT BEL CAN CHE CHL COL CRI CZE DEU DNK ESP EST FIN FRA GBR GRC HUN IRL ISL ISR ITA JPN KOR LTU LUX LVA MEX NLD NOR NZL POL PRT SVK SVN SWE TUR USA',
        '38 members; No accession completed by Nov 2026'),
    'g7': ("G7", "G7", 'CAN DEU FRA GBR ITA JPN USA',
        '7 members; The EU takes part as a "non-enumerated" member and is not a country'),
    'g20': ("G20", "G20", 'ARG AUS BRA CAN CHN DEU FRA GBR IDN IND ITA JPN KOR MEX RUS SAU TUR USA ZAF',
        '19 members; 19 countries plus the EU and the African Union (not countries)'),
    'brics': ("BRICS", "BRICS", 'ARE BRA CHN EGY ETH IDN IND IRN RUS ZAF',
        '10 members; Indonesia joined on 6 Jan 2025'),
    'opec': ("OPEC", "OPEP", 'COG DZA GAB GNQ IRN IRQ KWT LBY NGA SAU VEN',
        '11 members; The UAE left OPEC and OPEC+ with effect from 1 May 2026 (announced 28 Apr 2026)'),
    'commonwealth': ("Commonwealth of Nations", "Mancomunidad de Naciones", 'ATG AUS BGD BHS BLZ BRB BRN BWA CAN CMR CYP DMA FJI GAB GBR GHA GMB GRD GUY IND JAM KEN KIR KNA LCA LKA LSO MDV MLT MOZ MUS MWI MYS NAM NGA NRU NZL PAK PNG RWA SGP SLB SLE SWZ SYC TGO TON TTO TUV TZA UGA VCT VUT WSM ZAF ZMB',
        '56 members'),
    'asean': ("ASEAN", "ASEAN", 'BRN IDN KHM LAO MMR MYS PHL SGP THA TLS VNM',
        '11 members; Timor-Leste was admitted on 26 Oct 2025'),
    'african-union': ("African Union", "Unión Africana", 'AGO BDI BEN BFA BWA CAF CIV CMR COD COG COM CPV DJI DZA EGY ERI ESH ETH GAB GHA GIN GMB GNB GNQ KEN LBR LBY LSO MAR MDG MLI MOZ MRT MUS MWI NAM NER NGA RWA SDN SEN SLE SOM SSD STP SWZ SYC TCD TGO TUN TZA UGA ZAF ZMB ZWE',
        '55 members; Includes the Sahrawi Arab Democratic Republic, mapped to ESH'),
    'arab-league': ("Arab League", "Liga Árabe", 'ARE BHR COM DJI DZA EGY IRQ JOR KWT LBN LBY MAR MRT OMN PSE QAT SAU SDN SOM SYR TUN YEM',
        '22 members; Includes Palestine (PSE)'),
    'mercosur': ("Mercosur", "Mercosur", 'ARG BOL BRA PRY URY',
        '5 members; Full members: Argentina, Brazil, Paraguay, Uruguay and Bolivia (full member since July 2024)'),
    'gcc': ("Gulf Cooperation Council", "Consejo de Cooperación del Golfo", 'ARE BHR KWT OMN QAT SAU',
        '6 members'),
    'efta': ("EFTA", "AELC", 'CHE ISL LIE NOR',
        '4 members'),
    'un': ("United Nations", "Naciones Unidas", 'AFG AGO ALB AND ARE ARG ARM ATG AUS AUT AZE BDI BEL BEN BFA BGD BGR BHR BHS BIH BLR BLZ BOL BRA BRB BRN BTN BWA CAF CAN CHE CHL CHN CIV CMR COD COG COL COM CPV CRI CUB CYP CZE DEU DJI DMA DNK DOM DZA ECU EGY ERI ESP EST ETH FIN FJI FRA FSM GAB GBR GEO GHA GIN GMB GNB GNQ GRC GRD GTM GUY HND HRV HTI HUN IDN IND IRL IRN IRQ ISL ISR ITA JAM JOR JPN KAZ KEN KGZ KHM KIR KNA KOR KWT LAO LBN LBR LBY LCA LIE LKA LSO LTU LUX LVA MAR MCO MDA MDG MDV MEX MHL MKD MLI MLT MMR MNE MNG MOZ MRT MUS MWI MYS NAM NER NGA NIC NLD NOR NPL NRU NZL OMN PAK PAN PER PHL PLW PNG POL PRK PRT PRY QAT ROU RUS RWA SAU SDN SEN SGP SLB SLE SLV SMR SOM SRB SSD STP SUR SVK SVN SWE SWZ SYC SYR TCD TGO THA TJK TKM TLS TON TTO TUN TUR TUV TZA UGA UKR URY USA UZB VCT VEN VNM VUT WSM YEM ZAF ZMB ZWE',
        '193 members; Matches un.org and the dataset\'s un_member field'),
    'wto': ("World Trade Organization", "Organización Mundial del Comercio", 'AFG AGO ALB ARE ARG ARM ATG AUS AUT BDI BEL BEN BFA BGD BGR BHR BLZ BOL BRA BRB BRN BWA CAF CAN CHE CHL CHN CIV CMR COD COG COL COM CPV CRI CUB CYP CZE DEU DJI DMA DNK DOM ECU EGY ESP EST FIN FJI FRA GAB GBR GEO GHA GIN GMB GNB GRC GRD GTM GUY HKG HND HRV HTI HUN IDN IND IRL ISL ISR ITA JAM JOR JPN KAZ KEN KGZ KHM KNA KOR KWT LAO LBR LCA LIE LKA LSO LTU LUX LVA MAC MAR MDA MDG MDV MEX MKD MLI MLT MMR MNE MNG MOZ MRT MUS MWI MYS NAM NER NGA NIC NLD NOR NPL NZL OMN PAK PAN PER PHL PNG POL PRT PRY QAT ROU RUS RWA SAU SEN SGP SLB SLE SLV SUR SVK SVN SWE SWZ SYC TCD TGO THA TJK TLS TON TTO TUN TUR TWN TZA UGA UKR URY USA VCT VEN VNM VUT WSM YEM ZAF ZMB ZWE',
        '165 members; wto.org gives 166 members (the last to join was Timor-Leste, 30 Aug 2024)'),
    'icc': ("International Criminal Court (Rome Statute)", "Corte Penal Internacional (Estatuto de Roma)", 'AFG ALB AND ARG ARM ATG AUS AUT BEL BEN BFA BGD BGR BIH BLZ BOL BRA BRB BWA CAF CAN CHE CHL CIV COD COG COK COL COM CPV CRI CYP CZE DEU DJI DMA DNK DOM ECU ESP EST FIN FJI FRA GAB GBR GEO GHA GIN GMB GRC GRD GTM GUY HND HRV HUN IRL ISL ITA JOR JPN KEN KHM KIR KNA KOR LBR LCA LIE LSO LTU LUX LVA MDA MDG MDV MEX MHL MKD MLI MLT MNE MNG MUS MWI NAM NER NGA NLD NOR NRU NZL PAN PER POL PRT PRY PSE ROU SEN SLE SLV SMR SRB SUR SVK SVN SWE SYC TCD TJK TLS TTO TUN TZA UGA UKR URY VCT VEN VUT WSM ZAF ZMB',
        '125 members; States parties, matching the 125 names on the ICC Assembly of States Parties site'),
    'nam': ("Non-Aligned Movement", "Movimiento de Países No Alineados", 'AFG AGO ARE ATG AZE BDI BEN BFA BGD BHR BHS BLR BLZ BOL BRB BRN BTN BWA CAF CIV CMR COD COG COL COM CPV CUB DJI DMA DOM DZA ECU EGY ERI ETH FJI GAB GHA GIN GMB GNB GNQ GRD GTM GUY HND HTI IDN IND IRN IRQ JAM JOR KEN KHM KNA KWT LAO LBN LBR LBY LCA LKA LSO MAR MDG MDV MLI MMR MNG MOZ MRT MUS MWI MYS NAM NER NGA NIC NPL OMN PAK PAN PER PHL PNG PRK PSE QAT RWA SAU SDN SEN SGP SLE SOM SSD STP SUR SWZ SYC SYR TCD TGO THA TKM TLS TTO TUN TZA UGA UZB VCT VEN VNM VUT YEM ZAF ZMB ZWE',
        '120 members; South Sudan joined in Jan 2024 (121 members) and Chile withdrew on 5 Aug 2026 (120)'),
    'oic': ("Organisation of Islamic Cooperation", "Organización para la Cooperación Islámica", 'AFG ALB ARE AZE BEN BFA BGD BHR BRN CIV CMR COM DJI DZA EGY GAB GIN GMB GNB GUY IDN IRN IRQ JOR KAZ KGZ KWT LBN LBY MAR MDV MLI MOZ MRT MYS NER NGA OMN PAK PSE QAT SAU SDN SEN SLE SOM SUR SYR TCD TGO TJK TKM TUN TUR UGA UZB YEM',
        '57 members; Includes Palestine (PSE)'),
    'francophonie': ("Organisation internationale de la Francophonie", "Organización Internacional de la Francofonía", 'ALB AND ARM BDI BEL BEN BGR CAF CAN CHE CIV CMR COD COG COM CPV CYP DJI DMA EGY FRA GAB GHA GIN GNB GNQ GRC HTI KHM LAO LBN LCA LUX MAR MCO MDA MDG MKD MRT MUS ROU RWA SEN STP SYC TCD TGO TUN VNM VUT',
        '50 members; The OIF has 90 states and governments: 53 members, 5 associate members and 32 observers'),
    'cplp': ("Community of Portuguese Language Countries", "Comunidad de Países de Lengua Portuguesa", 'AGO BRA CPV GNB GNQ MOZ PRT STP TLS',
        '9 members; 9 member states'),
    'coe': ("Council of Europe", "Consejo de Europa", 'ALB AND ARM AUT AZE BEL BGR BIH CHE CYP CZE DEU DNK ESP EST FIN FRA GBR GEO GRC HRV HUN IRL ISL ITA LIE LTU LUX LVA MCO MDA MKD MLT MNE NLD NOR POL PRT ROU SMR SRB SVK SVN SWE TUR UKR',
        '46 members; Russia was expelled in March 2022'),
    'nordic-council': ("Nordic Council", "Consejo Nórdico", 'ALA DNK FIN FRO GRL ISL NOR SWE',
        '8 members'),
    'benelux': ("Benelux", "Benelux", 'BEL LUX NLD',
        '3 members; The Netherlands takes part for its European territory only, so ABW, CUW, SXM and BES are not included'),
    'v4': ("Visegrád Group", "Grupo de Visegrado", 'CZE HUN POL SVK',
        '4 members'),
    'oas': ("Organization of American States", "Organización de los Estados Americanos", 'ARG ATG BHS BLZ BOL BRA BRB CAN CHL COL CRI DMA DOM ECU GRD GTM GUY HND HTI JAM KNA LCA MEX PAN PER PRY SLV SUR TTO URY USA VCT VEN',
        '33 members; Nicaragua\'s withdrawal took effect on 19 Nov 2023 (excluded)'),
    'celac': ("Community of Latin American and Caribbean States (CELAC)", "Comunidad de Estados Latinoamericanos y Caribeños (CELAC)", 'ARG ATG BHS BLZ BOL BRA BRB CHL COL CRI CUB DMA DOM ECU GRD GTM GUY HND HTI JAM KNA LCA MEX NIC PAN PER PRY SLV SUR TTO URY VCT VEN',
        '33 members; All 33 sovereign states of Latin America and the Caribbean'),
    'can': ("Andean Community", "Comunidad Andina", 'BOL COL ECU PER',
        '4 members; Associate states (ARG, BRA, CHL, PRY, URY) and observers are left out'),
    'caricom': ("Caribbean Community (CARICOM)", "Comunidad del Caribe (CARICOM)", 'ATG BHS BLZ BRB DMA GRD GUY HTI JAM KNA LCA MSR SUR TTO VCT',
        '15 members'),
    'usmca': ("USMCA (United States–Mexico–Canada Agreement)", "T-MEC (Tratado entre México, Estados Unidos y Canadá)", 'CAN MEX USA',
        '3 members; At the July 2026 joint review the US declined to extend the agreement'),
    'ecowas': ("Economic Community of West African States (ECOWAS)", "Comunidad Económica de los Estados de África Occidental (CEDEAO)", 'BEN CIV CPV GHA GIN GMB GNB LBR NGA SEN SLE TGO',
        '12 members; Burkina Faso, Mali and Niger left on 29 Jan 2025'),
    'sadc': ("Southern African Development Community", "Comunidad de Desarrollo de África Austral", 'AGO BWA COD COM LSO MDG MOZ MUS MWI NAM SWZ SYC TZA ZAF ZMB ZWE',
        '16 members; 16 member states'),
    'eac': ("East African Community", "Comunidad de África Oriental", 'BDI COD KEN RWA SOM SSD TZA UGA',
        '8 members'),
    'aes': ("Alliance of Sahel States", "Alianza de Estados del Sahel", 'BFA MLI NER',
        '3 members; Formally the Confederation of Sahel States since its treaty of 6 Jul 2024'),
    'apec': ("Asia-Pacific Economic Cooperation (APEC)", "Foro de Cooperación Económica Asia-Pacífico (APEC)", 'AUS BRN CAN CHL CHN HKG IDN JPN KOR MEX MYS NZL PER PHL PNG RUS SGP THA TWN USA VNM',
        '21 members; The 21 members are economies, not states'),
    'sco': ("Shanghai Cooperation Organisation", "Organización de Cooperación de Shanghái", 'BLR CHN IND IRN KAZ KGZ PAK RUS TJK UZB',
        '10 members; The official site says "ten member states"'),
    'pif': ("Pacific Islands Forum", "Foro de las Islas del Pacífico", 'AUS COK FJI FSM KIR MHL NCL NIU NRU NZL PLW PNG PYF SLB TON TUV VUT WSM',
        '18 members'),
    'cis': ("Commonwealth of Independent States", "Comunidad de Estados Independientes", 'ARM AZE BLR KAZ KGZ MDA RUS TJK UZB',
        '9 members; Members are the states that ratified the CIS Charter'),
    'csto': ("Collective Security Treaty Organization", "Organización del Tratado de Seguridad Colectiva", 'ARM BLR KAZ KGZ RUS TJK',
        '6 members; Armenia is counted'),
    'eaeu': ("Eurasian Economic Union", "Unión Económica Euroasiática", 'ARM BLR KAZ KGZ RUS',
        '5 members; Armenia is counted'),
    'ots': ("Organization of Turkic States", "Organización de Estados Túrquicos", 'AZE KAZ KGZ TUR UZB',
        '5 members; Full members only'),
    'five-eyes': ("Five Eyes", "Cinco Ojos", 'AUS CAN GBR NZL USA',
        '5 members; The UKUSA intelligence alliance'),
    'quad': ("Quad (Quadrilateral Security Dialogue)", "Quad (Diálogo de Seguridad Cuadrilateral)", 'AUS IND JPN USA',
        '4 members; An informal dialogue with no treaty or secretariat'),
    'aukus': ("AUKUS", "AUKUS", 'AUS GBR USA',
        '3 members; Partners in Pillar II projects (e.g'),
}

# Countries with a federal constitution (Forum of Federations list).
FEDERATIONS = set('ARG AUS AUT BEL BIH BRA CAN COM ETH DEU IND IRQ MYS MEX FSM NPL NGA PAK RUS KNA SOM SSD SDN CHE ARE USA VEN'.split())

# Sovereign monarchies (43 incl. the 15 Commonwealth realms).
MONARCHIES = set(('ATG AUS BHS BLZ CAN GRD JAM NZL PNG KNA LCA VCT SLB TUV GBR '
                  'AND BHR BEL BTN BRN KHM DNK SWZ JPN JOR KWT LSO LIE LUX MYS MCO MAR NLD NOR OMN QAT SAU ESP SWE THA TON ARE VAT').split())

# States possessing nuclear weapons (Israel: undeclared).
NUCLEAR_WEAPONS = {'USA': 'declared', 'RUS': 'declared', 'GBR': 'declared', 'FRA': 'declared', 'CHN': 'declared',
                   'IND': 'declared', 'PAK': 'declared', 'PRK': 'declared', 'ISR': 'undeclared'}

# FIFA World Cup titles (men's tournaments 1930-2026; women's 1991-2023). Spain won the 2026 final 1-0
# after extra time against Argentina (19 July 2026).
WORLD_CUP_MEN = {'BRA': 5, 'DEU': 4, 'ITA': 4, 'ARG': 3, 'FRA': 2, 'URY': 2, 'ESP': 2, 'GBR': 1}
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
