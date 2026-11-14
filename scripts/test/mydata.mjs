// Checks how your own data is read (src/mydata/parse.ts, v0.22.0): delimiters, quotes and preambles; numbers
// written with a decimal point or a decimal comma; country names in English and Spanish, aliases and ISO codes;
// world and regional totals set aside; a row per place and year (Our World in Data), a column per year (World
// Bank); regions inside a country; points; and the sample files in public/data/samples/.
// Usage: node scripts/test/mydata.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { rolldown } = await import('rolldown');
const bundle = await rolldown({ input: path.join(ROOT, 'src/mydata/parse.ts'), platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
const P = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));

const C = P.countryIndex(read('base/countries-meta.json'));
const topo = read('base/admin1.json');
const R = P.regionIndex(topo.objects.admin1.geometries.map((g) => g.properties));
const load = (csv) => { const t = P.parseTable(csv); const p = P.planTable(t, C, R); return { t, p, b: p.error ? null : P.buildData(t, p, C, R) }; };

// Numbers.
check(P.toNumber('1,234.5', '.') === 1234.5 && P.toNumber('1.234,5', ',') === 1234.5 && P.toNumber('12 345', '.') === 12345, 'numbers with thousands separators, either way');
check(P.toNumber('45%', '.') === 45 && P.toNumber('$1,200', '.') === 1200 && P.toNumber('(3.5)', '.') === -3.5 && P.toNumber('−2', '.') === -2, 'percentages, currency signs, brackets and the minus sign');
check(P.toNumber('..', '.') === null && P.toNumber('n/a', '.') === null && P.toNumber('', '.') === null && P.toNumber('abc', '.') === null, 'missing values (.., n/a, empty) and text are not numbers');
check(P.guessDecimal(['3,5', '12,75', '0,4'], ';') === ',' && P.guessDecimal(['3.5', '1,234.5'], ',') === '.', 'the decimal mark is worked out from the values');

// Names.
const m = (s) => C.match(s);
check(m('Brasil') === 'BRA' && m('Alemania') === 'DEU' && m('Estados Unidos') === 'USA' && m('México') === 'MEX', 'country names in Spanish');
check(m('United States') === 'USA' && m('Korea, Rep.') === 'KOR' && m("Côte d'Ivoire") === 'CIV' && m('Türkiye') === 'TUR' && m('Viet Nam') === 'VNM' && m('Congo, Dem. Rep.') === 'COD', 'aliases used by the World Bank and the UN');
check(m('ARG') === 'ARG' && m('ar') === null && m('AR') === 'ARG' && m('OWID_KOS') === 'XKX', 'ISO codes (alpha-3, alpha-2) and Our World in Data’s code for Kosovo');
check(m('World') === 'group' && m('High income') === 'group' && m('European Union (27)') === 'group' && m('OWID_WRL') === 'group' && m('Sub-Saharan Africa') === 'group', 'world and regional totals are set aside');
check(m('South Africa') === 'ZAF' && m('Central African Republic') === 'CAF' && m('American Samoa') === 'ASM', 'countries whose names contain a region’s are still countries');

// A simple file: countries and a number, semicolons and decimal commas (a spreadsheet saved in Spanish).
{
  const { p, b } = load('País;Café por persona (kg)\nBrasil;6,2\nColombia;3,1\nAlemania;5,5\nFinlandia;12\nMundo;1,3\nAtlantis;9\n');
  check(p.geo === 'country' && p.decimal === ',' && b.values['1'][''].BRA === 6.2 && b.values['1'][''].FIN === 12, 'semicolons and decimal commas: Brazil 6.2, Finland 12');
  check(b.matched === 4 && b.groups.join() === 'Mundo' && b.unmatched.join() === 'Atlantis', `4 countries matched, "Mundo" set aside, "Atlantis" reported (${b.unmatched})`);
}
// Quotes, a category column and a pasted table (tabs).
{
  const { p, b } = load('"Country","Visited","Note"\n"Peru","yes","Machu Picchu, 2019"\n"Japan","want to go","cherry blossom"\n"Chile","yes","Atacama"\n');
  check(p.geo === 'country' && b.columns.find((c) => c.name === 'Visited')?.kind === 'category' && b.values['1'][''].PER === 'yes', 'quoted fields with commas inside; a column of words becomes categories');
  const tab = load('Country\tGDP\nFrance\t3.1\nSpain\t1.6\n');
  check(tab.p.geo === 'country' && tab.b.values['1'][''].ESP === 1.6, 'a table pasted from a spreadsheet (tabs)');
}
// A World Bank download: four lines of preamble, a column per year, trailing commas.
{
  const csv = '"Data Source","World Development Indicators",\n\n"Last Updated Date","2026-10-01",\n\n"Country Name","Country Code","Indicator Name","Indicator Code","2020","2021","2022",\n"Argentina","ARG","Access to electricity (% of population)","EG.ELC.ACCS.ZS","100","100","100",\n"Chad","TCD","Access to electricity (% of population)","EG.ELC.ACCS.ZS","11.1","11.7","",\n"World","WLD","Access to electricity (% of population)","EG.ELC.ACCS.ZS","90.4","91.1","91.4",\n';
  const { t, p, b } = load(csv);
  check(t.skipped === 2 && p.yearCols.length === 3 && b.years.join() === '2020,2021,2022', `a World Bank file: preamble skipped, a column per year (${b?.years})`);
  check(b.columns[0].name === 'Access to electricity (% of population)' && b.values[b.columns[0].key]['2021'].TCD === 11.7 && b.groups.includes('World'), 'its indicator named, Chad 11.7 % in 2021, World set aside');
}
// Regions inside a country, with the country's column.
{
  const { p, b } = load('Country,State,Visitors\nMexico,Jalisco,120\nMexico,Ciudad de México,300\nMexico,Yucatán,95\nArgentina,Mendoza,40\n');
  check(p.geo === 'region' && b.matched === 4 && b.unmatched.length === 0, `states and provinces: 4 regions of 2 countries (${b.unmatched})`);
}
// Points.
{
  const { p, b } = load('name,lat,lon,people\nLima,-12.05,-77.04,10000000\nQuito,-0.22,-78.51,2800000\n');
  check(p.geo === 'points' && b.points.length === 2 && b.points[0].label === 'Lima' && b.values['3'][''].p1 === 2800000, 'latitude and longitude columns make points, named by their name column');
}
// The sample files.
const dir = path.join(ROOT, 'public/data/samples');
const samples = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.csv')) : [];
check(samples.length >= 3, `${samples.length} sample files in public/data/samples/`);
for (const f of samples) {
  const { p, b } = load(fs.readFileSync(path.join(dir, f), 'utf8'));
  check(!p.error && b.matched > 0 && b.unmatched.length === 0, `${f}: ${p.geo ?? p.error}, ${b?.matched} places, ${b?.years.length ? `${b.years.length} years, ` : ''}${b?.unmatched.length ?? '?'} unknown${b?.unmatched.length ? ` (${b.unmatched.slice(0, 5)})` : ''}`);
}

console.log(fails ? `\n${fails} check(s) failed` : '\nyour-data checks passed');
process.exit(fails ? 1 : 0);
