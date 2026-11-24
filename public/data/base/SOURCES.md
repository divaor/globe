# Base map data

Built by `scripts/data/build-base.mjs` (README in `scripts/data/`).

| Part | Source |
|---|---|
| Countries (`countries-110m.json`, `-50m.json`, `-10m.json`, `countries-meta.json`), land, cities (`cities.json`) | Natural Earth 1:110m, 1:50m and 1:10m (public domain), with Western Sahara drawn whole (v0.43.6) |
| States and provinces (`admin1.json`) | Natural Earth 1:10m admin-1 states and provinces (public domain), except the countries below |
| States and provinces of Bahrain, Bangladesh, Burundi, the Central African Republic, Chad, Côte d'Ivoire, DR Congo, Ethiopia, Ghana, Indonesia, Iraq, Kazakhstan, Kenya, Laos, Lebanon, Madagascar, Mali, Mauritania, Morocco, Namibia, Nepal, Oman, Pakistan, Papua New Guinea, Qatar, Sierra Leone, Sudan, Tanzania, Timor-Leste, Tunisia, Cambodia, Viet Nam and Yemen (v0.47.0) | OCHA Common Operational Datasets of administrative boundaries (COD-AB), on the Humanitarian Data Exchange (HDX), CC BY-IGO, with each country's source (below). Cut to the country's Natural Earth outline; names from Wikidata (CC0) |
| The province a city of those countries is in (`cities.json`) | OCHA's datasets above |

## The countries whose states and provinces come from OCHA (v0.47.0)

Each dataset is `https://data.humdata.org/dataset/cod-ab-<iso3>`, licensed CC BY-IGO (Creative Commons Attribution
for Intergovernmental Organisations 3.0) by OCHA; the source agency is the one OCHA names.

| Country | Divisions | HDX dataset (valid from) | Agency |
|---|---|---|---|
| Bahrain | 4 governorates (2014) | `cod-ab-bhr` (2026-11-16) | Bahrain Ministry of Municipalities Affairs & Urban Planning |
| Bangladesh | 8 divisions (2015) | `cod-ab-bgd` (2023-05-21) | Bangladesh Bureau of Statistics (BBS) |
| Burundi | 5 provinces (2025) | `cod-ab-bdi` (2026-07-07) | Bureau de Centralisation de Géomatique (BCG) |
| Cambodia | 25 provinces (2013) | `cod-ab-khm` (2018-10-04) | Department of Geography of the Ministry of Land Management, Urbanization and Construction; WFP |
| Central African Republic | 20 prefectures (2020) | `cod-ab-caf` (2024-05-30) | ICASEES |
| Chad | 23 provinces (2018) | `cod-ab-tcd` (2025-02-12) | Institut National de la Statistique, des Etudes Economiques et Démographiques (INSEED) |
| Côte d'Ivoire | 12 districts and 2 autonomous districts (2011), each the union of its regions | `cod-ab-civ` (2018-07-06) | Comité National de Télédétection et d'Information Géographique (CNTIG) |
| DR Congo | 26 provinces (2015) | `cod-ab-cod` (2019-09-11) | Référentiel Géographique Commun |
| Ethiopia | 12 regions and 2 chartered cities (2020–2023); the contested area between Oromia and Somali split along Natural Earth's line | `cod-ab-eth` (2025-01-01) | Central Statistics Agency (CSA) and the Regional Bureaus of Finance and Economic Development |
| Ghana | 16 regions (2019) | `cod-ab-gha` (2021-03-08) | Ghana Statistical Services (GSS) |
| Indonesia | 38 provinces (2012, 2022); the four new provinces of Papua made of their regencies | `cod-ab-idn` (2020-04-01) | Badan Pusat Statistik (BPS – Statistics Indonesia) |
| Iraq | 19 governorates (Halabja: 2014, 2025), Halabja made of its district | `cod-ab-irq` (2019-06-03) | Iraq Central Statistics Office |
| Kazakhstan | 17 regions and 3 cities (2018, 2022) | `cod-ab-kaz` (2023-01-05) | UNHCR, from OpenStreetMap data (© OpenStreetMap contributors, ODbL 1.0: these shapes keep that licence) |
| Kenya | 47 counties (2013) | `cod-ab-ken` (2019-10-31) | Independent Electoral and Boundaries Commission (IEBC) |
| Laos | 17 provinces and Vientiane Prefecture (2013) | `cod-ab-lao` (2019-11-12) | National Geographic Department (NGD) |
| Lebanon | 9 governorates (2014, 2017), Keserwan-Jbeil made of its two districts | `cod-ab-lbn` (2024-11-13) | Council for Development and Reconstruction (CDR) |
| Madagascar | 24 regions (2021) | `cod-ab-mdg` (2018-08-10; updated 2026) | Bureau National de Gestion des Risques et Catastrophes (BNGRC) |
| Mali | 19 regions and Bamako (2016, 2023) | `cod-ab-mli` (2025-09-04) | Institut Géographique du Mali (IGM) |
| Mauritania | 15 regions (2014) | `cod-ab-mrt` (2024-03-27) | Agence Nationale de la Statistique, de l'Analyse Démographique et Economique (ANSADE) |
| Morocco | 10 regions north of 27°40′ N (2015; Western Sahara is drawn whole) | `cod-ab-mar` (2020-12-03) | Haut-Commissariat au Plan (HCP) |
| Namibia | 14 regions (2013) | `cod-ab-nam` (2020-01-09) | Namibia Statistics Agency (NSA) |
| Nepal | 7 provinces (2015) | `cod-ab-npl` (2024-03-14) | Survey Department of Nepal; UN Resident Coordinator's Office in Nepal |
| Oman | 11 governorates (2011) | `cod-ab-omn` (2026-11-09) | National Centre for Statistics and Information (NCSI) |
| Pakistan | 4 provinces, 2 territories and Islamabad (2018) | `cod-ab-pak` (2022-09-09) | World Food Programme SDI |
| Papua New Guinea | 22 provinces (2012) | `cod-ab-png` (2019-05-08) | Papua New Guinea National Statistics Office |
| Qatar | 8 municipalities (2014) | `cod-ab-qat` (2024-06-27) | Qatar Planning and Statistics Authority |
| Sierra Leone | 5 provinces (2017) | `cod-ab-sle` (2023-12-15) | Government of Sierra Leone |
| Sudan | 18 states and the Abyei area (2013) | `cod-ab-sdn` (2020-08-31) | Information Management Working Group (IMWG), OCHA |
| Tanzania | 31 regions (2016) | `cod-ab-tza` (2018-10-19) | National Bureau of Statistics; OCHA ROSA |
| Timor-Leste | 14 municipalities (Atauro: 2022), Atauro made of its administrative post | `cod-ab-tls` (2020-09-11) | WHO |
| Tunisia | 24 governorates (the dataset's second level) | `cod-ab-tun` (2022-11-15) | Institut National de la Statistique (INS) |
| Viet Nam | 34 provinces (2025) | `cod-ab-vnm` (2025-09-25) | General Statistics Office of Vietnam (GSO) |
| Yemen | 22 governorates (2013) | `cod-ab-yem` (2019-11-22) | Central Statistical Organization (CSO) |

The datasets' boundaries, names and the dates they are valid from were checked against Wikidata's current first-level
divisions (the audit of v0.47.0). Where a country's divisions changed and no current official dataset was at hand
(Norway's 15 counties of 2024, Latvia's municipalities of 2021, Algeria, Angola, the Republic of the Congo, Equatorial
Guinea, South Sudan's administrative areas, Panamá Oeste, Greenland, Luxembourg, Montenegro), Natural Earth's are kept.
