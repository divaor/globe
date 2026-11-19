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

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
