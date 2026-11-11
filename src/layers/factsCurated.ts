// Curated settings for the country-facts filters (icons, palettes, categories, colours), shared by
// the Filters panel (layers/packs/facts.ts) and Compare two filters (compare/compare.ts).
import { SEQUENTIAL } from '../engine/colors';
import type { CategoryId } from './types';

export interface Curated {
  icon?: string; cat?: CategoryId; palette?: string[]; scale?: 'log' | 'linear' | 'quantile' | 'sqrt'; colors?: Record<string, string>; order?: string[]; skip?: boolean; keywords?: string;
  /** Categories listed in the legend before "+N more" (default 14). */
  maxLegend?: number;
}
export const P = SEQUENTIAL;
export const CURATED: Record<string, Curated> = {
  population: { icon: '👥', palette: P.ylorrd }, pop_density: { icon: '🏙️', palette: P.magma.slice(1) }, median_age: { icon: '🎂', palette: P.viridis },
  life_expectancy: { icon: '❤️', palette: P.rdylgn }, fertility_rate: { icon: '👶', palette: P.purples }, urban_pct: { icon: '🌆', palette: P.blues },
  literacy_pct: { icon: '📚', palette: P.ylgnbu }, obesity_pct: { icon: '🍔', palette: P.oranges }, alcohol_litres: { icon: '🍷', palette: P.purples },
  tobacco_pct: { icon: '🚬', palette: P.reds }, internet_users_pct: { icon: '🌐', palette: P.ylgnbu }, mobile_per_100: { icon: '📱', palette: P.blues },
  hdi: { icon: '📈', palette: P.rdylgn }, happiness: { icon: '😊', palette: P.spectral.slice().reverse() },
  gdp_ppp_per_capita: { icon: '💵', palette: P.viridis }, gini: { icon: '⚖️', palette: P.ylorrd }, unemployment_pct: { icon: '🧑‍💼', palette: P.oranges },
  gdp_usd: { icon: '🏦', palette: P.cividis }, gdp_per_capita: { icon: '💰', palette: P.viridis, keywords: 'rich poor wealth riqueza' },
  income_group: { icon: '💼', order: ['high', 'upper-middle', 'lower-middle', 'low'], colors: { high: '#1a9850', 'upper-middle': '#a6d96a', 'lower-middle': '#fdae61', low: '#d73027' } },
  currency: { icon: '💱' }, vat_rate: { skip: true }, top_export: { icon: '📦' }, top_export_partner: { icon: '🤝' }, unesco_sites: { icon: '🏛️', palette: P.ylorrd },
  languages: { skip: true }, language_family: { skip: true }, language_branch: { skip: true }, start_of_week: { icon: '📅' },
  script: { icon: '✍️', keywords: 'writing system script alphabet letters abc cyrillic arabic chinese characters hangul alfabeto escritura letras cirílico caracteres',
    order: ['latin', 'cyrillic', 'greek', 'armenian', 'georgian', 'arabic', 'hebrew', 'thaana', 'geez', 'devanagari', 'bengali', 'sinhala', 'tibetan', 'burmese', 'thai', 'lao', 'khmer', 'han', 'japanese', 'hangul'], maxLegend: 24 },
  measurement_system: { icon: '📏', colors: { metric: '#4dabf7', imperial: '#ff6b6b', mixed: '#ffd43b' } }, clock_format: { icon: '🕐' },
  religion: { icon: '🛐' }, religion_pct: { skip: true }, national_colors: { skip: true }, continent: { skip: true }, subregion: { icon: '🧭' },
  area_km2: { icon: '📐', palette: P.ylgnbu }, landlocked: { icon: '🏜️', colors: { yes: '#e8590c', no: '#74c0fc' } }, borders: { skip: true },
  neighbours_count: { icon: '🫂', palette: P.plasma }, coastline_km: { icon: '🏖️', cat: 'nature', palette: P.blues }, mean_elevation_m: { icon: '⛰️', cat: 'nature', palette: P.earth },
  agricultural_land_pct: { icon: '🌾', cat: 'nature', palette: P.greens }, highest_point_m: { icon: '🏔️', cat: 'nature', palette: P.earth }, lowest_point_m: { icon: '⬇️', cat: 'nature', palette: P.blues.slice().reverse() },
  utc_offset: { skip: true }, daylight_saving: { icon: '☀️', colors: { yes: '#fab005', no: '#868e96' } }, avg_temperature: { icon: '🌡️', cat: 'climate', palette: P.thermal },
  un_member: { icon: '🇺🇳', colors: { yes: '#4dabf7', no: '#ff8787' } }, independent: { icon: '🗽', colors: { yes: '#51cf66', no: '#ffa94d' } }, dependency_of: { icon: '🔗' },
  military_spending_pct: { icon: '🛡️', palette: P.reds }, voting_age: { icon: '🗳️', palette: P.plasma }, compulsory_voting: { icon: '🗳️', colors: { yes: '#7950f2', no: '#adb5bd' } },
  government_type: { icon: '🏛️' }, monarchy: { icon: '👑', colors: { yes: '#f59f00', no: '#74c0fc' } }, federal: { icon: '🧩', colors: { yes: '#12b886', no: '#adb5bd' } },
  independence_year: { icon: '🎆', palette: P.turbo }, independence_from: { icon: '🕊️' }, organizations: { skip: true },
  nuclear_weapons: { icon: '☢️', colors: { declared: '#fa5252', undeclared: '#ff922b' } },
  forest_pct: { icon: '🌲', cat: 'flora', palette: P.greens }, national_animal: { skip: true }, national_plant: { icon: '🌸', cat: 'flora' }, natural_resources: { skip: true },
  electricity_access_pct: { icon: '💡', palette: P.ylgnbu }, oil_production: { icon: '🛢️', palette: P.oranges }, gas_production: { icon: '🔥', palette: P.oranges },
  coal_production: { icon: '⛏️', palette: P.purples }, nuclear_reactors: { icon: '⚛️', palette: P.purples }, co2_per_capita: { icon: '🏭', palette: P.reds },
  co2_mt: { icon: '🌫️', palette: P.reds }, renewables_share_elec: { icon: '♻️', palette: P.greens }, low_carbon_share_elec: { icon: '🍃', palette: P.greens },
  nuclear_share_elec: { icon: '⚛️', palette: P.purples }, energy_per_capita: { icon: '⚡', palette: P.ylorrd }, electricity_per_capita: { icon: '🔌', palette: P.ylorrd },
  main_power_source: { icon: '🏭', colors: { coal: '#495057', gas: '#ff922b', oil: '#8d5524', nuclear: '#9775fa', hydro: '#4dabf7', wind: '#38d9a9', solar: '#ffd43b', bioenergy: '#69db7c', other: '#ced4da' } },
  airports: { icon: '✈️', palette: P.blues }, railways_km: { icon: '🚆', palette: P.purples }, space_agency: { icon: '🚀', colors: { yes: '#7950f2', no: '#495057' } },
  space_launch_site: { icon: '🛰️', colors: { yes: '#f06595', no: '#495057' } }, height_male_cm: { icon: '🧍‍♂️', palette: P.viridis }, height_female_cm: { icon: '🧍‍♀️', palette: P.viridis },
  calling_zone: { icon: '☎️' }, paper_size: { icon: '📄', colors: { a4: '#4dabf7', 'us-letter': '#ff6b6b' } }, driving_side: { icon: '🚗', colors: { left: '#e64980', right: '#228be6' }, keywords: 'drive car road left right conducir manejar coche auto carro' },
  speed_unit: { icon: '🚦', colors: { kmh: '#20c997', mph: '#fd7e14' } }, world_cup_titles: { icon: '⚽', palette: P.ylorrd }, womens_world_cup_titles: { icon: '⚽', palette: P.purples },
  olympic_medals: { icon: '🏅', palette: P.ylorrd }, olympic_golds: { icon: '🥇', palette: P.ylorrd },
  plug_types: { skip: true }, mains_voltage: { icon: '⚡', order: ['high', 'low', 'both'], colors: { high: '#4dabf7', low: '#ff922b', both: '#cc5de8' }, keywords: 'volt voltage electricity power travel adapter voltaje electricidad viaje' },
  mains_frequency: { icon: '〰️', order: ['50', '60', '50-60'], colors: { '50': '#4dabf7', '60': '#ff6b6b', '50-60': '#cc5de8' }, keywords: 'hertz frequency electricity hercios frecuencia electricidad' },
};
