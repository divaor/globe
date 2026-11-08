// The Games of "Games of the world": every Summer and Winter Olympics and every men's and women's
// FIFA World Cup, with the Wikipedia articles their data comes from (fetch-wiki.mjs downloads them,
// build-games-data.mjs reads them).

export const SUMMER = [1896, 1900, 1904, 1908, 1912, 1920, 1924, 1928, 1932, 1936, 1948, 1952, 1956, 1960, 1964,
  1968, 1972, 1976, 1980, 1984, 1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020, 2024];
export const WINTER = [1924, 1928, 1932, 1936, 1948, 1952, 1956, 1960, 1964, 1968, 1972, 1976, 1980, 1984, 1988,
  1992, 1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022, 2026];
export const WORLD_CUP = [1930, 1934, 1938, 1950, 1954, 1958, 1962, 1966, 1970, 1974, 1978, 1982, 1986, 1990, 1994,
  1998, 2002, 2006, 2010, 2014, 2018, 2022, 2026];
export const WOMENS_WORLD_CUP = [1991, 1995, 1999, 2003, 2007, 2011, 2015, 2019, 2023];

/** Every event: its id (`summer-1896`, `winter-2026`, `wc-1930`, `wwc-1991`), kind, year and articles. */
export const EVENTS = [
  ...SUMMER.map((y) => ({ id: `summer-${y}`, kind: 'summer', year: y, main: `${y} Summer Olympics`, medals: `${y} Summer Olympics medal table` })),
  ...WINTER.map((y) => ({ id: `winter-${y}`, kind: 'winter', year: y, main: `${y} Winter Olympics`, medals: `${y} Winter Olympics medal table` })),
  // 1950 had no final: a final round, decided by Uruguay v Brazil (the "Maracanazo").
  ...WORLD_CUP.map((y) => ({ id: `wc-${y}`, kind: 'wc', year: y, main: `${y} FIFA World Cup`, final: y === 1950 ? 'Uruguay v Brazil (1950 FIFA World Cup)' : `${y} FIFA World Cup final` })),
  ...WOMENS_WORLD_CUP.map((y) => ({ id: `wwc-${y}`, kind: 'wwc', year: y, main: `${y} FIFA Women's World Cup`, final: `${y} FIFA Women's World Cup final` })),
];

/** Pages read for the whole collection: participation tables, boycotts, all-time medals. */
export const EXTRA = [
  'List of participating nations at the Summer Olympic Games',
  'List of participating nations at the Winter Olympic Games',
  'List of Olympic Games boycotts',
  'All-time Olympic Games medal table',
  'List of IOC country codes',
  'National team appearances in the FIFA World Cup',
  "National team appearances in the FIFA Women's World Cup",
  'List of FIFA World Cup finals',
  "List of FIFA Women's World Cup finals",
];

/** Every article to download. */
export function allTitles() {
  const out = new Set(EXTRA);
  for (const e of EVENTS) for (const k of ['main', 'medals', 'final']) if (e[k]) out.add(e[k]);
  return [...out];
}
