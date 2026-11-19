// Checks the text patterns (src/app/i18n.ts, v0.41.0): values, plurals and selects in English and Spanish, a
// language file keyed by the English, the fallback to English, and the pseudo-language.
// Usage: node scripts/test/i18n.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { rolldown } = await import('rolldown');
const bundle = await rolldown({ input: path.join(ROOT, 'src/app/i18n.ts'), platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
globalThis.document = { documentElement: {} };
Object.defineProperty(globalThis, 'navigator', { value: { languages: ['en-GB'] }, configurable: true });
const I = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
let fails = 0;
const check = (got, want, msg) => { const ok = got === want; if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}: "${got}"${ok ? '' : ` (expected "${want}")`}`); };

const DAYS = ['{0, plural, one {# day} other {# days}} in a row', '{0, plural, one {# día seguido} other {# días seguidos}}'];
I.setLang('en');
check(I.L('Out of {0}', 'De {0}', '1,000'), 'Out of 1,000', 'a value');
check(I.L(DAYS[0], DAYS[1], 1), '1 day in a row', 'plural one');
check(I.L(DAYS[0], DAYS[1], 3), '3 days in a row', 'plural other');
check(I.L('{0, plural, one {# day} other {# days}}', '', 12000), '12,000 days', '# is written as a number');
check(I.L('{0, plural, =0 {nothing yet} one {# badge} other {# badges}}', '', 0), 'nothing yet', 'an exact case');
check(I.L('Tap {1} {0}', 'Toca {1} {0}', 'B', 'A'), 'Tap A B', 'values in another order');
check(I.L('{0, select, states {States} other {Countries}} right', '', 'states'), 'States right', 'select');
check(I.L('{0, select, states {States} other {Countries}} right', '', 'capitals'), 'Countries right', 'select other');
check(I.L('a {name} b', 'x'), 'a {name} b', 'braces that are not values stay');
check(I.L('It is in {0}.', 'Está en {0}.'), 'It is in {0}.', 'no values: the text as written');
I.setLang('es');
check(I.L(DAYS[0], DAYS[1], 1), '1 día seguido', 'Spanish plural one');
check(I.L(DAYS[0], DAYS[1], 5), '5 días seguidos', 'Spanish plural other');
const fem = ['Start learning the {0}', 'Empieza a aprender {1, select, f {las {0}: unas cuantas} other {los {0}: unos cuantos}}'];
check(I.L(fem[0], fem[1], 'capitales', 'f'), 'Empieza a aprender las capitales: unas cuantas', 'select with a value inside');
check(I.L(fem[0], fem[1], 'países', 'm'), 'Empieza a aprender los países: unos cuantos', 'select other with a value inside');
check(I.tx({ en: 'Map', es: 'Mapa' }), 'Mapa', 'tx in Spanish');
check(I.tx({ en: 'Map', es: '' }), 'Map', 'tx falls back to English');
check(I.L(' ρ', ''), '', 'an empty Spanish in the code means nothing');
check(I.inLang('en', () => I.L('Your data', 'Tus datos')), 'Your data', 'inLang');
check(I.L('Your data', 'Tus datos'), 'Tus datos', 'inLang puts the language back');
// A language file, keyed by the English.
I.setLang('en');
I.setMessages({ 'Out of {0}': 'Sur {0}', [DAYS[0]]: '{0, plural, one {# jour} other {# jours}} de suite', Map: 'Carte' });
check(I.L('Out of {0}', 'De {0}', 10), 'Sur 10', 'a language file');
check(I.L(DAYS[0], DAYS[1], 2), '2 jours de suite', 'a language file with a plural');
check(I.tx({ en: 'Map', es: 'Mapa' }), 'Carte', 'tx through the language file');
check(I.L('Settings', 'Ajustes'), 'Settings', 'a text the file does not have shows in English');
I.setMessages(null);
I.setPseudo(true);
check(I.L('Share', 'Compartir'), '[Ŝháré]', 'pseudo-language');
I.setPseudo(false);
check(I.L('Share', 'Compartir'), 'Share', 'pseudo-language off');

// v0.42.0: Portuguese, French and German from their files.
const fs = await import('node:fs');
const cat = (l) => JSON.parse(fs.readFileSync(path.join(ROOT, `public/data/i18n/${l}.json`), 'utf8'));
const names = (l) => JSON.parse(fs.readFileSync(path.join(ROOT, `public/data/i18n/${l}-data.json`), 'utf8'));
I.setLang('pt'); I.setMessages(cat('pt')); I.setNames(names('pt'));
check(I.L('Settings', 'Ajustes'), 'Configurações', 'Portuguese: a text');
check(I.L(DAYS[0], DAYS[1], 3), '3 dias seguidos', 'Portuguese: a plural');
check(I.nm('Germany', 'Alemania'), 'Alemanha', 'Portuguese: a country name');
check(I.tx({ en: 'North Sea', es: 'Mar del Norte' }), 'Mar do Norte', 'Portuguese: a data name through tx');
check(I.nm('Atlantis of the test', 'x'), 'Atlantis of the test', 'Portuguese: a name with none shows in English');
check(I.ordinal(3), '3º', 'Portuguese: ordinal');
I.setLang('fr'); I.setMessages(cat('fr')); I.setNames(names('fr'));
check(I.L(DAYS[0], DAYS[1], 1), '1 jour d’affilée', 'French: plural one');
check(I.nm('Germany'), 'Allemagne', 'French: a country name');
check(I.ordinal(1), '1er', 'French: ordinal');
I.setLang('de'); I.setMessages(cat('de')); I.setNames(names('de'));
check(I.nm('Vienna'), 'Wien', 'German: a city name');
check(I.lower('Hauptstädte'), 'Hauptstädte', 'German keeps a noun\'s capital');
check(I.ordinal(2), '2.', 'German: ordinal');
check(I.inLang('en', () => I.nm('Vienna')), 'Vienna', 'inLang English leaves the names file out');
// Every country with its own name in a language has it in that language's file.
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/base/countries-meta.json'), 'utf8'));
for (const l of ['pt', 'fr', 'de']) {
  const n = names(l);
  const differ = Object.values(meta).filter((m) => m.n && n[m.n]).length;
  const known = ['Germany', 'Spain', 'Egypt', 'Greece', 'South Africa', 'United Kingdom'].filter((c) => !n[c]);
  check(known.join(', '), '', `${l}: countries whose name differs have it (${differ} of ${Object.keys(meta).length} differ from English)`);
}

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
