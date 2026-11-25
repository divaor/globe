#!/usr/bin/env node
// The website's own pages (v0.48.0): the privacy policy, help and support, and the credits, in the app's five
// languages. The stores link to them (privacy policy and support addresses), and the app's About opens them.
//   site/<page>/<lang>.html   the text of a page in one language (a fragment: no <head>, no menu)
//   public/data/credits/credits.json   the credits (the same list as the app's About)
//   src/app/donate.json       the Ko-fi page's name; with none, the donation parts are left out
// Built into public/<page>.html (English) and public/<page>.<lang>.html, which Vite copies with the rest of public/.
// They are made by every build (npm run build) and are not kept in git. The English page sends a reader whose
// browser prefers another of the five languages to that language's page, unless the address says ?lang=en.
// Opened from the iOS or Android app (?app=1), the pages show no donation parts: the apps have none (v0.48.0).
//   node scripts/site/build.mjs           builds the pages
//   node scripts/site/build.mjs --check   checks every page has every language, the same sections and links
import fs from 'node:fs';
import path from 'node:path';

const CHECK = process.argv.includes('--check');
const LANGS = ['en', 'es', 'pt', 'fr', 'de'];
const PAGES = ['privacy', 'support', 'credits'];
const OUT = 'public';
const SITE = 'site';
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const kofi = (JSON.parse(fs.readFileSync('src/app/donate.json', 'utf8')).kofi ?? '').trim();
if (kofi && !/^[A-Za-z0-9_]{2,40}$/.test(kofi)) { console.error(`src/app/donate.json: "${kofi}" is not a Ko-fi page name`); process.exit(1); }
const kofiUrl = kofi ? `https://ko-fi.com/${kofi}` : '';

/** The words around the pages, in each language. */
const UI = {
  en: { name: 'English', privacy: 'Privacy', support: 'Help', credits: 'Credits', open: 'Open Mundora', t: { privacy: 'Privacy policy', support: 'Help and support', credits: 'Credits and licences' }, foot: 'Mundora {v} · free, with no ads, no account and no tracking · open source (GPL-3.0)', lang: 'Language', desc: { privacy: 'Mundora collects nothing about you: no account, no ads, no analytics, no tracking.', support: 'Answers to common questions about Mundora, and where to ask for help.', credits: 'Every source Mundora is made from: what each gives the app, who made it, and its licence.' } },
  es: { name: 'Español', privacy: 'Privacidad', support: 'Ayuda', credits: 'Créditos', open: 'Abrir Mundora', t: { privacy: 'Política de privacidad', support: 'Ayuda y soporte', credits: 'Créditos y licencias' }, foot: 'Mundora {v} · gratis, sin anuncios, sin cuenta y sin rastreo · código abierto (GPL-3.0)', lang: 'Idioma', desc: { privacy: 'Mundora no recopila nada sobre ti: sin cuenta, sin anuncios, sin analíticas, sin rastreo.', support: 'Respuestas a preguntas frecuentes sobre Mundora, y dónde pedir ayuda.', credits: 'Todas las fuentes con que está hecha Mundora: qué le da cada una a la app, quién la hizo y su licencia.' } },
  pt: { name: 'Português', privacy: 'Privacidade', support: 'Ajuda', credits: 'Créditos', open: 'Abrir o Mundora', t: { privacy: 'Política de privacidade', support: 'Ajuda e suporte', credits: 'Créditos e licenças' }, foot: 'Mundora {v} · gratuito, sem anúncios, sem conta e sem rastreamento · código aberto (GPL-3.0)', lang: 'Idioma', desc: { privacy: 'O Mundora não coleta nada sobre você: sem conta, sem anúncios, sem análises, sem rastreamento.', support: 'Respostas para perguntas comuns sobre o Mundora, e onde pedir ajuda.', credits: 'Todas as fontes de que o Mundora é feito: o que cada uma dá ao app, quem a fez e sua licença.' } },
  fr: { name: 'Français', privacy: 'Confidentialité', support: 'Aide', credits: 'Crédits', open: 'Ouvrir Mundora', t: { privacy: 'Politique de confidentialité', support: 'Aide et assistance', credits: 'Crédits et licences' }, foot: 'Mundora {v} · gratuit, sans publicité, sans compte et sans pistage · open source (GPL-3.0)', lang: 'Langue', desc: { privacy: 'Mundora ne collecte rien sur vous : ni compte, ni publicité, ni statistiques, ni pistage.', support: 'Les réponses aux questions courantes sur Mundora, et où demander de l’aide.', credits: 'Toutes les sources dont Mundora est fait : ce que chacune apporte, qui l’a faite et sa licence.' } },
  de: { name: 'Deutsch', privacy: 'Datenschutz', support: 'Hilfe', credits: 'Quellen', open: 'Mundora öffnen', t: { privacy: 'Datenschutzerklärung', support: 'Hilfe und Support', credits: 'Quellen und Lizenzen' }, foot: 'Mundora {v} · kostenlos, ohne Werbung, ohne Konto und ohne Tracking · Open Source (GPL-3.0)', lang: 'Sprache', desc: { privacy: 'Mundora sammelt nichts über dich: kein Konto, keine Werbung, keine Analyse, kein Tracking.', support: 'Antworten auf häufige Fragen zu Mundora und wo du Hilfe bekommst.', credits: 'Alle Quellen, aus denen Mundora gemacht ist: was jede beiträgt, wer sie gemacht hat und ihre Lizenz.' } },
};

/** The credits' group names and licences in words: English and Spanish as in src/ui/credits.ts, the others from the
 * app's language files (public/data/i18n/<lang>.json), so the page says what the app's About says. */
const GROUPS = {
  maps: ['Maps and country facts', 'Mapas y datos de los países'],
  nature: ['Nature', 'Naturaleza'],
  earth: ['The Earth: inside, climate and deep time', 'La Tierra: por dentro, el clima y el tiempo profundo'],
  space: ['Space and the sky', 'El espacio y el cielo'],
  history: ['History', 'Historia'],
  words: ['Names, languages and people', 'Nombres, idiomas y población'],
  pictures: ['Pictures', 'Imágenes'],
  live: ['Read live while you use it', 'Se consulta en vivo mientras la usas'],
  code: ['The code and fonts it is built with', 'El código y las tipografías con que está hecha'],
};
const LICENCES = {
  'Public domain': 'Dominio público',
  'Public domain and CC BY-SA 4.0': 'Dominio público y CC BY-SA 4.0',
  'CC0 and CC BY 4.0': 'CC0 y CC BY 4.0',
  'Free to use': 'De uso libre',
  'Free to use with attribution': 'De uso libre citando la fuente',
  'Free to use with citation': 'De uso libre con cita',
  'Cited as a source': 'Citado como fuente',
  'Each file’s own licence': 'La licencia de cada archivo',
  'Each photo’s own licence': 'La licencia de cada foto',
};
const INTRO = ['Mundora is made from the work of many people and organisations. Here are all {0} sources: what each gives the app, who made it, and its licence.', 'Mundora está hecha con el trabajo de muchas personas y organizaciones. Aquí están las {0} fuentes: qué le da cada una a la app, quién la hizo y su licencia.'];
const catalog = Object.fromEntries(['pt', 'fr', 'de'].map((l) => [l, JSON.parse(fs.readFileSync(`public/data/i18n/${l}.json`, 'utf8'))]));
const problems = [];
const say = (lang, [en, es]) => {
  if (lang === 'en') return en;
  if (lang === 'es') return es;
  const t = catalog[lang][en];
  if (!t) { problems.push(`${lang}: no translation of "${en}" in public/data/i18n/${lang}.json`); return en; }
  return t;
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const file = (page, lang) => (lang === 'en' ? `${page}.html` : `${page}.${lang}.html`);
const numberIn = (lang, n) => new Intl.NumberFormat(lang === 'es' ? 'es-419' : lang === 'pt' ? 'pt-BR' : lang).format(n);

function creditsBody(lang) {
  const c = JSON.parse(fs.readFileSync('public/data/credits/credits.json', 'utf8'));
  const n = c.groups.reduce((s, g) => s + g.items.length, 0);
  const lic = (it) => {
    const words = LICENCES[it.licence] ? say(lang, [it.licence, LICENCES[it.licence]]) : it.licence;
    return it.licenceUrl ? `<a class="lic" href="${esc(it.licenceUrl)}">${esc(words)}</a>` : `<span class="lic">${esc(words)}</span>`;
  };
  return [
    `<h1>${esc(UI[lang].t.credits)}</h1>`,
    `<p class="lead">${esc(say(lang, INTRO).replace('{0}', numberIn(lang, n)))}</p>`,
    `<nav class="chips" aria-label="${esc(UI[lang].credits)}">${c.groups.map((g) => `<a href="#${g.id}">${esc(say(lang, GROUPS[g.id]))}</a>`).join('')}</nav>`,
    ...c.groups.map((g) => [
      `<section id="${g.id}"><h2>${esc(say(lang, GROUPS[g.id]))}</h2>`,
      ...g.items.map((it) => `<article><div class="head"><a class="name" href="${esc(it.url)}">${esc(it.name)}</a>${lic(it)}</div><p>${esc(it.what[lang] ?? it.what.en)}</p>${it.by ? `<p class="by">${esc(it.by)}</p>` : ''}</article>`),
      '</section>',
    ].join('\n')),
  ].join('\n');
}

function fragment(page, lang) {
  if (page === 'credits') return creditsBody(lang);
  const f = path.join(SITE, page, `${lang}.html`);
  if (!fs.existsSync(f)) { problems.push(`${f} is missing`); return ''; }
  let body = fs.readFileSync(f, 'utf8');
  // The donation parts: with a Ko-fi page, its address; with none, left out.
  body = body.replace(/<!--donate-->([\s\S]*?)<!--\/donate-->/g, (_, part) => (kofiUrl ? part : ''));
  body = body.replace(/<a class="btn" data-kofi>/g, `<a class="btn" data-kofi href="${kofiUrl}">`);
  // Links between the pages go to the same language's page.
  body = body.replace(/href="(privacy|support|credits)\.html"/g, (_, p) => `href="${file(p, lang)}" data-keep`);
  return body;
}

/** What a page must keep in every language: its sections, its outside links and its donation parts. */
function shape(page, lang) {
  const f = path.join(SITE, page, `${lang}.html`);
  if (!fs.existsSync(f)) return null;
  const s = fs.readFileSync(f, 'utf8');
  return {
    h: (s.match(/<h[12][ >]/g) ?? []).length,
    q: (s.match(/<summary>/g) ?? []).length,
    links: (s.match(/href="(?:https?|mailto):[^"]+"/g) ?? []).sort().join(' '),
    donate: (s.match(/<!--\/?donate-->/g) ?? []).length,
    rows: (s.match(/<tr>/g) ?? []).length,
  };
}

const CSS = `:root{color-scheme:light dark;--bg:#f7f6f2;--fg:#17181c;--muted:#5b5e66;--line:#dcdad3;--card:#fff;--accent:#2a5bd7;--accent-fg:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#07101f;--fg:#e9ecf3;--muted:#a3aab8;--line:#22304a;--card:#0d1a30;--accent:#7fb2ff;--accent-fg:#07101f}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:1.0625rem/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}a:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
header{border-bottom:1px solid var(--line);background:var(--card)}
.bar{max-width:46rem;margin:0 auto;padding:.75rem 1rem;display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:center}
.brand{display:flex;align-items:center;gap:.5rem;font-weight:700;font-size:1.15rem;color:var(--fg);text-decoration:none;margin-right:auto}
.brand img{width:2rem;height:2rem;border-radius:.5rem}
nav.pages{display:flex;gap:.25rem 1rem;flex-wrap:wrap}nav.pages a{text-decoration:none;padding:.4rem 0;min-height:44px;display:inline-flex;align-items:center}nav.pages a[aria-current]{color:var(--fg);font-weight:600}
main{max-width:46rem;margin:0 auto;padding:1.5rem 1rem 3rem}
h1{font-size:1.9rem;line-height:1.2;margin:.5rem 0 1rem}h2{font-size:1.3rem;margin:2rem 0 .5rem}
.lead{font-size:1.15rem}.updated,.by{color:var(--muted);font-size:.9rem}
table{width:100%;border-collapse:collapse;margin:1rem 0;font-size:.95rem}th,td{text-align:left;vertical-align:top;padding:.5rem;border-bottom:1px solid var(--line)}
details{border:1px solid var(--line);border-radius:.75rem;background:var(--card);margin:.5rem 0;padding:0 1rem}summary{cursor:pointer;font-weight:600;padding:.75rem 0;min-height:44px}details p{margin-top:0}
.btn{display:inline-flex;align-items:center;min-height:44px;padding:.5rem 1.25rem;border-radius:999px;background:var(--accent);color:var(--accent-fg);font-weight:600;text-decoration:none}
.donate{border:1px solid var(--line);border-radius:1rem;background:var(--card);padding:.25rem 1.25rem 1rem;margin-top:2rem}
.chips{display:flex;flex-wrap:wrap;gap:.5rem;margin:1rem 0}.chips a{border:1px solid var(--line);border-radius:999px;padding:.35rem .8rem;text-decoration:none;background:var(--card);font-size:.95rem}
article{border-bottom:1px solid var(--line);padding:.6rem 0}article p{margin:.25rem 0}.head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.25rem 1rem}.name{font-weight:600}.lic{color:var(--muted);font-size:.9rem}
footer{border-top:1px solid var(--line);color:var(--muted);font-size:.9rem}footer .bar{display:block}
.langs{display:flex;flex-wrap:wrap;gap:.25rem .9rem;margin:.25rem 0}.langs a[aria-current]{color:var(--fg);font-weight:600;text-decoration:none}
.in-app [data-donate]{display:none}`;

/** The English page goes to the reader's language (once, not after a choice); ?app=1 (the apps) hides donations. */
const SCRIPT = (page, lang) => `(function(){var q=new URLSearchParams(location.search),d=document.documentElement;
if(q.get('app')==='1'){d.classList.add('in-app');document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('a[data-keep]').forEach(function(a){var u=new URL(a.href);u.searchParams.set('app','1');a.href=u.href})})}
${lang === 'en' ? `if(!q.has('lang')){var l=(navigator.languages||[navigator.language]).map(function(x){return String(x).slice(0,2).toLowerCase()}).filter(function(x){return ${JSON.stringify(LANGS)}.indexOf(x)>=0})[0];if(l&&l!=='en')location.replace('${page}.'+l+'.html'+location.search+location.hash)}` : ''}})();`;

function render(page, lang) {
  const u = UI[lang];
  const nav = PAGES.map((p) => `<a href="${file(p, lang)}" data-keep${p === page ? ' aria-current="page"' : ''}>${esc(u[p])}</a>`).join('');
  const langs = LANGS.map((l) => `<a href="${file(page, l)}${l === 'en' ? '?lang=en' : ''}" hreflang="${l}" lang="${l}" data-keep${l === lang ? ' aria-current="true"' : ''}>${esc(UI[l].name)}</a>`).join('');
  const alts = LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${file(page, l)}">`).join('');
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(u.t[page])} · Mundora</title>
<meta name="description" content="${esc(u.desc[page])}">
<meta name="theme-color" content="#07101f">
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
${alts}
<script>${SCRIPT(page, lang)}</script>
<style>${CSS}</style>
</head>
<body>
<header><div class="bar"><a class="brand" href="./"><img src="icons/icon-192.png" alt="">Mundora</a><nav class="pages" aria-label="Mundora">${nav}</nav></div></header>
<main data-page="${page}">
${fragment(page, lang)}
</main>
<footer><div class="bar"><nav class="langs" aria-label="${esc(u.lang)}">${langs}</nav><p>${esc(u.foot.replace('{v}', version))} · <a href="./">${esc(u.open)}</a></p></div></footer>
</body>
</html>
`;
}

// Every language keeps the English page's shape.
for (const page of PAGES.filter((p) => p !== 'credits')) {
  const en = shape(page, 'en');
  for (const lang of LANGS.slice(1)) {
    const s = shape(page, lang);
    if (!s) { problems.push(`${SITE}/${page}/${lang}.html is missing`); continue; }
    for (const k of Object.keys(en)) if (s[k] !== en[k]) problems.push(`${SITE}/${page}/${lang}.html: ${k} differs from English (${JSON.stringify(s[k])} / ${JSON.stringify(en[k])})`);
  }
}
const built = [];
for (const page of PAGES) for (const lang of LANGS) {
  const html = render(page, lang);
  if (!CHECK) fs.writeFileSync(path.join(OUT, file(page, lang)), html);
  built.push(file(page, lang));
}
if (problems.length) { console.error(problems.map((p) => `site: ${p}`).join('\n')); process.exit(1); }
console.log(`site: ${CHECK ? 'checked' : 'built'} ${built.length} pages (${PAGES.join(', ')} × ${LANGS.join(', ')})${kofi ? `; Ko-fi: ${kofi}` : '; no Ko-fi page yet, so no donation parts'}`);
