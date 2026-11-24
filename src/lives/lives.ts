// Lives on the map (v0.28.0): the list of lives (by field, with a search box), two lives side by side on one map,
// and what a life adds to a step's details and to a marker's card (the person's Wikipedia article, where their works
// are now, the guide of a city to visit, "Follow their life" on a person who has a life of their own).
// The stories themselves are played by modes/stories.ts like any other collection.
import { Search, Users, X } from 'lucide';
import { h, icon, clear, englishNote } from '../ui/dom';
import { t, tx, lang, both, L } from '../app/i18n';
import { livesHook, fmtWhen, type StoryMode, type Conflict, type Entry, type Step, type Item, type Life } from '../modes/stories';
import { mergeLives, twoNames, km, SEP } from './merge';
import { loadJSON } from '../data/store';
import { loadArt, loadArch } from '../artguide/data';
import { loadBornAll, personCard, type Person } from './born';
import { peopleList, personLinks } from '../layers/packs/born';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { Hit } from '../ui/search';
import type { TravelGuide, GuideCity } from '../guide/guide';
import type { ArtGuide } from '../artguide/artguide';

type Text = { en: string; es: string };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const yearOf = (d: string) => /^-?\d+/.exec(d)?.[0] ?? d;
/** "1907–1954", "c. 551–479 BC". */
export function lifeYears(l: Life): string {
  const about = l.bornAbout ? (L('c. ', 'h. ')) : '';
  const b = yearOf(l.born), d = yearOf(l.died);
  if (b.startsWith('-') && d.startsWith('-')) return `${about}${b.slice(1)}–${fmtWhen(d)}`;
  return `${about}${fmtWhen(b)}–${fmtWhen(d)}`;
}

export class Lives {
  private field = 'all';
  private query = '';
  /** Choosing the second life of a pair: the first one's id ('' while choosing the first). */
  private beside: string | null = null;
  private cities: GuideCity[] | null = null;
  private index: Entry[] = [];

  constructor(private app: App, private shell: Shell, private mode: StoryMode, private guide: TravelGuide | null, private art: ArtGuide | null) {
    livesHook.pick = () => this.pick();
    livesHook.openPair = (id, at) => this.openPair(id, at);
    livesHook.details = (c, st) => this.details(c, st);
    livesHook.links = (c, it) => this.links(c, it);
    // A card may link to a life or to a city's guide: have both lists at hand once any story is on.
    app.on('mode', (m) => { if (m) void this.warm(); });
    // Search finds a life by the person's name ("Mozart", "Frida").
    shell.search.extra.push((_q, score) => {
      if (!this.index.length) { void this.warm(); return []; }
      return this.index.flatMap((e): Hit[] => {
        const s = Math.max(score(e.name.en), score(e.name.es));
        return s > 0 && e.life ? [{ kind: 'place', lon: e.life.at[0], lat: e.life.at[1], label: tx(e.name), sub: `${t('livesTitle')} · ${lifeYears(e.life)} · ${tx(e.region)}`, score: s + 12, icon: e.icon, pick: () => this.app.emit('open-story', 'lives', e.id, 0) }] : [];
      });
    });
  }

  /** The lists a card needs (the lives, the guide's cities), fetched once. */
  async warm() {
    if (!this.index.length) { try { this.index = (await this.mode.list()).stories; } catch { /* offline: no links */ } }
    if (!this.cities && this.guide) { try { this.cities = await this.guide.load(); } catch { /* no guide links */ } }
  }

  /** The life of a person, by its id or its English Wikipedia title. */
  lifeOf(key: { id?: string; wiki?: Text; qid?: string }): Entry | null {
    return this.index.find((e) => (key.id && e.id === key.id) || (key.qid && e.life?.qid === key.qid) || (key.wiki?.en && e.life?.wiki?.en === key.wiki.en)) ?? null;
  }

  // ---- the list

  async pick() {
    const { stories, fields, pairs } = await this.mode.list();
    this.index = stories;
    const byId = new Map(stories.map((e) => [e.id, e]));
    const wrap = h('div', { class: 'war-list lives-list' });
    const banner = h('div', { class: 'lives-beside' });
    const input = h('input', { type: 'search', class: 'lives-search', placeholder: t('livesSearch'), 'aria-label': t('livesSearch'), value: this.query }) as HTMLInputElement;
    const chips = h('div', { class: 'chip-row lives-fields', role: 'tablist' });
    const two = h('div', { class: 'lives-pairs' });
    const list = h('div', { class: 'lives-cards' });
    const open = (e: Entry) => {
      if (this.beside === '') { this.beside = e.id; render(); return; }
      if (this.beside && this.beside !== e.id) { const a = this.beside; this.beside = null; void this.openPair(`${a}${SEP}${e.id}`, 0); return; }
      this.beside = null;
      void this.mode.open(e.id);
    };
    const render = () => {
      // Choosing two lives: say which one is being picked.
      clear(banner);
      if (this.beside != null) {
        const first = this.beside ? byId.get(this.beside) : null;
        const cancel = h('button', { type: 'button', class: 'pill sm', 'data-lives': 'cancel' }, icon(X, 14), t('livesCompareCancel'));
        cancel.addEventListener('click', () => { this.beside = null; render(); });
        banner.append(h('span', null, first ? t('livesCompareWith', { name: tx(first.name) }) : t('livesPairsHint')), cancel);
      }
      banner.hidden = this.beside == null;
      two.hidden = this.beside != null;
      clear(chips);
      const count = (f: string) => stories.filter((e) => f === 'all' || e.life?.field === f).length;
      for (const f of [{ id: 'all', name: both('livesAll'), icon: '' }, ...fields.filter((x) => count(x.id))]) {
        const b = h('button', { type: 'button', class: `chip${this.field === f.id ? ' on' : ''}`, 'data-field': f.id, role: 'tab', 'aria-selected': String(this.field === f.id) }, `${f.icon ? `${f.icon} ` : ''}${tx(f.name)} (${count(f.id)})`);
        b.addEventListener('click', () => { this.field = f.id; render(); });
        chips.append(b);
      }
      clear(list);
      const q = norm(this.query.trim());
      const fieldName = new Map(fields.map((f) => [f.id, f.name]));
      const shown = stories.filter((e) => (this.field === 'all' || e.life?.field === this.field)
        && (!q || [e.name.en, e.name.es, e.region.en, e.region.es, e.life?.place.en ?? '', e.life?.place.es ?? '', tx(fieldName.get(e.life?.field ?? ''))].some((s) => norm(s).includes(q))));
      if (!shown.length) list.append(h('p', { class: 'muted small' }, t('livesNone')));
      for (const e of shown) {
        const on = this.beside === e.id || (this.mode.story?.id === e.id);
        const card = h('button', { type: 'button', class: `war-card${on ? ' on' : ''}`, 'data-war': e.id },
          h('span', { class: 'war-icon' }, e.icon),
          h('span', { class: 'war-text' },
            h('span', { class: 'war-name' }, tx(e.name)),
            h('span', { class: 'war-sub' }, `${e.life ? lifeYears(e.life) : ''} · ${tx(e.region)}`),
            h('span', { class: 'war-sum' }, tx(e.summary)),
            e.life ? h('span', { class: 'war-sides' }, h('span', { class: 'war-side' }, h('b', { class: 'story-cat' }, '👶'), tx(e.life.place))) : null));
        card.addEventListener('click', () => open(e));
        list.append(card);
      }
    };
    input.addEventListener('input', () => { this.query = input.value; render(); });
    // Two lives side by side: the pairs worth seeing, and any two.
    const pairRows = pairs.map((p) => [byId.get(p.a), byId.get(p.b)] as const).filter((x): x is readonly [Entry, Entry] => !!x[0] && !!x[1]);
    if (stories.length > 1) {
      const any = h('button', { type: 'button', class: 'pill sm', 'data-lives': 'choose' }, icon(Users, 15), L('Choose two…', 'Elegir dos…'));
      any.addEventListener('click', () => { this.beside = ''; render(); list.scrollIntoView({ block: 'start' }); });
      two.append(h('h3', { class: 'sec-title' }, `👥 ${t('livesPairs')}`), h('p', { class: 'muted small' }, t('livesPairsHint')),
        h('div', { class: 'chip-row lives-pair-row' }, ...pairRows.map(([a, b]) => {
          const btn = h('button', { type: 'button', class: 'chip', 'data-pair': `${a.id}${SEP}${b.id}` }, `${a.icon} ${tx(twoNames(a.name, b.name))}`);
          btn.addEventListener('click', () => void this.openPair(`${a.id}${SEP}${b.id}`, 0));
          return btn;
        }), any));
    }
    wrap.append(h('p', { class: 'muted small' }, t('livesIntro')), h('label', { class: 'lives-search-box' }, icon(Search, 16), input), banner, chips, two, list);
    render();
    const note = englishNote();
    if (note) wrap.prepend(note);
    this.shell.openPanel(this.mode.sheet, t('livesTitle'), wrap, () => { this.beside = null; });
  }

  // ---- a city's People tab (the travel guide)

  /** Who was born in a city and who died there (Wikidata, both files), and the lives of this collection that pass through it. */
  async peopleTab(el: HTMLElement, c: GuideCity, name: string) {
    const [born] = await Promise.all([loadBornAll(), this.warm()]);
    const here = this.index.map((e) => ({ e, steps: (e.life?.path ?? []).map((p, i) => (p && km(p, c.at) <= 25 ? i : -1)).filter((i) => i >= 0) })).filter((x) => x.steps.length);
    if (here.length) {
      el.append(h('h3', { class: 'sec-title' }, `👣 ${L('Lives that pass through here', 'Vidas que pasan por aquí')}`),
        h('div', { class: 'guide-list' }, ...here.map(({ e, steps }) => {
          const row = h('button', { type: 'button', class: 'guide-item', 'data-life': e.id },
            h('span', { class: 'guide-item-ic' }, e.icon),
            h('span', { class: 'guide-item-text' }, h('span', { class: 'guide-item-title' }, tx(e.name)),
              h('span', { class: 'guide-item-sub' }, `${e.life ? lifeYears(e.life) : ''} · ${tx(e.region)} · ${L('{0, plural, one {# step} other {# steps}} here', '{0, plural, one {# paso} other {# pasos}} aquí', steps.length)}`)));
          row.addEventListener('click', () => { this.shell.sheet.close(); this.app.emit('open-story', 'lives', e.id, steps[0]); });
          return row;
        })));
    }
    const x = personLinks();
    const pick = (p: Person) => { void personCard((...a) => this.shell.card.showCustom(...a), p, { ...x, openCity: null }); };
    const bornHere = born?.byCity.get(c.id) ?? [];
    const diedHere = (born?.people ?? []).filter((p) => p.diedAt?.city === c.id && p.place.city !== c.id);
    const list = (title: string, people: Person[], key: string) => {
      if (!people.length) return;
      const more = people.length > 30;
      const box = h('div', { 'data-people': key }, peopleList(people, pick, 30));
      el.append(h('h3', { class: 'sec-title' }, `${title} (${people.length})`), box);
      if (more) {
        const all = h('button', { type: 'button', class: 'pill sm', 'data-people-all': key }, L('Show all', 'Ver todos'));
        all.addEventListener('click', () => { clear(box); box.append(peopleList(people, pick, 500)); all.remove(); });
        el.append(all);
      }
    };
    list(`👶 ${L('Born in {0}', 'Nacieron en {0}', name)}`, bornHere, 'born');
    list(`🕯️ ${L('Died in {0}', 'Murieron en {0}', name)}`, diedHere, 'died');
    if (!here.length && !bornHere.length && !diedHere.length) el.append(h('p', { class: 'muted small' }, L('We have nobody from here yet.', 'No tenemos a nadie de aquí todavía.')));
    else el.append(h('p', { class: 'muted small' }, L('People with articles in many Wikipedias (Wikidata), the best known first. Tap one for their card.', 'Personas con artículos en muchas Wikipedias (Wikidata), las más conocidas primero. Toca una para ver su ficha.')));
  }

  // ---- two lives side by side

  /** Opens two lives ("a~b") as one story: every step of both in the order it happened, each in its colour. */
  async openPair(id: string, at = 0) {
    const [ia, ib] = id.split(SEP);
    try {
      const [a, b] = await Promise.all([loadJSON<Conflict>(`lives/${ia}.json`), loadJSON<Conflict>(`lives/${ib}.json`)]);
      await this.mode.play(mergeLives(a, b, { both: both('livesBoth'), summary: both('livesTwoSummary') }), null, at);
    } catch { this.shell.toast(L('Those lives could not be loaded.', 'No se pudieron cargar esas vidas.'), 2500); }
  }

  /** Starts choosing the life to set beside this one. */
  private besideThis(id: string) { this.beside = id; void this.pick(); }

  // ---- what a life adds to the details and the cards

  private details(c: Conflict, _st: Step): HTMLElement[] {
    const row = h('div', { class: 'tool-actions lives-actions' });
    const lives = c.lives ?? (c.life ? [c.life] : []);
    const names = c.lives ? c.sides.map((s) => tx(s.name)) : [tx(c.name)];
    lives.forEach((l, k) => {
      const many = lives.length > 1 ? ` · ${names[k]}` : '';
      if (l.wiki) row.append(h('a', { class: 'pill sm', href: `https://${lang()}.wikipedia.org/wiki/${encodeURIComponent((tx(l.wiki)).replace(/ /g, '_'))}`, target: '_blank', rel: 'noopener' }, `Wikipedia${many}`));
      // Where their works are now (the art guide's trail), when they have one.
      if (this.art) {
        void loadArt().then((d) => {
          if (!d?.byArtist.has(l.qid) || !row.isConnected) return;
          const b = h('button', { type: 'button', class: 'pill sm', 'data-lives': 'works' }, `🖼️ ${t('livesWorksNow')}${many}`);
          b.addEventListener('click', () => { void this.mode.exit().then(() => this.art!.openArtist(l.qid)); });
          row.append(b);
        });
        void loadArch().then((d) => {
          // (Two buildings at least: Wikidata names a few people as the architect of their own house.)
          if ((d?.byArchitect.get(l.qid)?.length ?? 0) < 2 || !row.isConnected) return;
          const b = h('button', { type: 'button', class: 'pill sm', 'data-lives': 'buildings' }, `📐 ${t('livesBuildings')}${many}`);
          b.addEventListener('click', () => { void this.mode.exit().then(() => this.art!.openArchitect(l.qid)); });
          row.append(b);
        });
      }
    });
    if (c.life && this.index.length > 1) {
      const b = h('button', { type: 'button', class: 'pill sm', 'data-lives': 'beside' }, icon(Users, 15), t('livesCompare'));
      b.addEventListener('click', () => this.besideThis(c.id));
      row.append(b);
    }
    return row.childElementCount || this.art ? [row] : [];
  }

  private links(c: Conflict | null, it: Omit<Item, 'first'>): { label: string; href?: string; onClick?: () => void }[] {
    const out: { label: string; onClick: () => void }[] = [];
    // A person with a life of their own (but not the life on screen).
    if (it.type === 'person') {
      const e = this.lifeOf({ id: it.id, wiki: it.wiki });
      const here = c?.id.split(SEP) ?? [];
      if (e && !here.includes(e.id)) out.push({ label: t('livesFollow'), onClick: () => { this.shell.card.hide(); this.app.emit('open-story', 'lives', e.id, 0); } });
    }
    // In a life: the guide of the city the marker is in.
    if ((c?.life || c?.lives) && this.cities && this.guide) {
      let best: GuideCity | null = null, bd = 25;
      for (const g of this.cities) { const d = km(it.at, g.at); if (d < bd) { bd = d; best = g; } }
      if (best) {
        const city = best;
        out.push({ label: t('livesCityGuide', { city: this.guide.cityLabel(city.id) ?? city.name }), onClick: () => { this.shell.card.hide(); void this.mode.exit().then(() => this.guide!.openCity(city.id, 'see')); } });
      }
    }
    return out;
  }
}
