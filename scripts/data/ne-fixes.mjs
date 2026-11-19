// Natural Earth's populated places with a wrong name (v0.42.0). Every builder that reads
// ne_10m_populated_places runs its features through fixPlaces() first, so the map's city names, the Master the
// world decks and the names in other languages all get the right one.
//   - Maradi (Niger) is written "Niamey" in NAME and NAME_EN (its other languages and NAMEASCII say Maradi): the
//     capitals question showed Niamey twice.
//   - Colón (Panama) has "Bucaramanga" (a city in Colombia) as its English name.
//   - Oujda (Morocco) has "Taza" (another Moroccan city) as its English name.
//   - Bose (Baise, China) has Baicheng's names (a city in Jilin, 2,500 km away) in English and other languages.
const PLACE_FIX = {
  1159149391: { NAME: 'Maradi', NAME_EN: 'Maradi' },
  1159146487: { NAME_EN: 'Colón' },
  1159149507: { NAME_EN: 'Oujda' },
  1159149783: { NAME_EN: 'Baise', NAME_ES: 'Baise', NAME_PT: 'Baise', NAME_FR: 'Baise', NAME_DE: 'Baise' },
};

/** Corrects the known wrong names in a populated-places FeatureCollection (in place) and returns it. */
export function fixPlaces(fc) {
  for (const f of fc.features) {
    const fix = PLACE_FIX[f.properties.NE_ID];
    if (fix) Object.assign(f.properties, fix);
  }
  return fc;
}
