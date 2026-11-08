// Small helpers to read wikitext: templates with their parameters, sections, and plain text.

/** The end of a balanced {{...}} (or [[...]]) that starts at `i`, or -1. */
function closeAt(s, i, open = '{{', close = '}}') {
  let depth = 0;
  for (let k = i; k < s.length - 1; k++) {
    if (s.startsWith(open, k)) { depth++; k++; continue; }
    if (s.startsWith(close, k)) { depth--; k++; if (!depth) return k + 1; }
  }
  return -1;
}

/** Splits a template's inside at its top-level pipes (not inside {{ }}, [[ ]] or <ref>s). */
function splitPipes(inner) {
  const out = [];
  let depthT = 0, depthL = 0, cur = '';
  for (let k = 0; k < inner.length; k++) {
    const two = inner.slice(k, k + 2);
    if (two === '{{') { depthT++; cur += two; k++; continue; }
    if (two === '}}') { depthT--; cur += two; k++; continue; }
    if (two === '[[') { depthL++; cur += two; k++; continue; }
    if (two === ']]') { depthL--; cur += two; k++; continue; }
    if (inner[k] === '|' && !depthT && !depthL) { out.push(cur); cur = ''; continue; }
    cur += inner[k];
  }
  out.push(cur);
  return out;
}

/** Every call of a template (by name, case-insensitive, spaces or underscores): { name, pos: [...], named: {}, at, end }. */
export function templates(w, name) {
  const out = [];
  const re = new RegExp(`\\{\\{\\s*${name.replace(/[ _]/g, '[ _]')}\\s*(\\||\\}\\})`, 'gi');
  for (let m; (m = re.exec(w));) {
    const end = closeAt(w, m.index);
    if (end < 0) continue;
    const parts = splitPipes(w.slice(m.index + 2, end - 2));
    const pos = [], named = {};
    for (const p of parts.slice(1)) {
      const eq = p.indexOf('=');
      const key = eq > 0 ? p.slice(0, eq).trim() : '';
      if (eq > 0 && /^[\w\s-]+$/.test(key)) named[key] = p.slice(eq + 1).trim();
      else pos.push(p.trim());
    }
    out.push({ name: parts[0].trim(), pos, named, at: m.index, end });
  }
  return out;
}

/** The first call of a template, or null. */
export function template(w, name) { return templates(w, name)[0] ?? null; }

/** The text of a section (from its heading to the next heading of the same or a higher level). */
export function section(w, heading) {
  const re = new RegExp(`^(=+)\\s*${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\1\\s*$`, 'mi');
  const m = re.exec(w);
  if (!m) return null;
  const level = m[1].length;
  const rest = w.slice(m.index + m[0].length);
  const next = new RegExp(`^={1,${level}}[^=].*?={1,${level}}\\s*$`, 'm').exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

/** The target of the first wiki link in a text ("[[Olympiastadion (Berlin)|Olympiastadion]]" → its title). */
export function linkTarget(s) {
  const m = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/.exec(s ?? '');
  return m ? m[1].trim() : null;
}

/** Plain text: no references, comments, templates (but a few that show text), links as their text, no markup. */
export function plain(s) {
  if (s == null) return '';
  let t = String(s)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  // Templates that show their text: {{nowrap|x}}, {{lang|de|x}}, {{langx|de|x}}, {{small|x}}, {{nobr|x}}.
  for (let guard = 0; guard < 20 && /\{\{/.test(t); guard++) {
    t = t.replace(/\{\{\s*(?:nowrap|nobr|small|big|nowiki)\s*\|([^{}]*)\}\}/gi, '$1')
      .replace(/\{\{\s*(?:lang|langx)\s*\|[^|{}]*\|([^|{}]*)(?:\|[^{}]*)?\}\}/gi, '$1')
      .replace(/\{\{\s*(?:sortname)\s*\|([^|{}]*)\|([^|{}]*)(?:\|[^{}]*)?\}\}/gi, '$1 $2')
      .replace(/\{\{\s*(?:fbicon|flagicon|flagIOC|flag IOC|fb|flag)\s*\|[^{}]*\}\}/gi, '')
      .replace(/\{\{[^{}]*\}\}/g, '');
  }
  t = t.replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
  return t.replace(/\s+,/g, ',').replace(/^,\s*|,\s*$/g, '');
}

/** The first whole number in a text ("3,963 (3,632 men, 331 women)" → 3963), or null. */
export function firstNumber(s) {
  const m = /(\d[\d,.]*)/.exec(plain(s));
  return m ? Number(m[1].replace(/[,.](?=\d{3}\b)/g, '').replace(/,/g, '')) : null;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
/** A date in words ("1 August 1936", "August 1, 1936", "13 June") → "1936-08-01"; `year` fills a missing year. */
export function isoDate(s, year) {
  // {{start date|1952|7|19}}, {{end date|...}}, {{start date and age|...}}, {{date|2021-07-23|DMY}}.
  const tm = /\{\{\s*(?:start date and age|start date|end date|dts)\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i.exec(s ?? '');
  if (tm) return `${tm[1]}-${tm[2].padStart(2, '0')}-${tm[3].padStart(2, '0')}`;
  const td = /\{\{\s*date\s*\|\s*(\d{4})-(\d{2})-(\d{2})/i.exec(s ?? '');
  if (td) return `${td[1]}-${td[2]}-${td[3]}`;
  const t = plain(s);
  let m = /(\d{1,2})\s+([A-Za-z]+)\s*,?\s*(\d{4})?/.exec(t);
  let d, mon, y;
  if (m && MONTHS.includes(m[2].toLowerCase())) { d = Number(m[1]); mon = MONTHS.indexOf(m[2].toLowerCase()) + 1; y = m[3] ? Number(m[3]) : year; }
  else if ((m = /([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})?/.exec(t)) && MONTHS.includes(m[1].toLowerCase())) { mon = MONTHS.indexOf(m[1].toLowerCase()) + 1; d = Number(m[2]); y = m[3] ? Number(m[3]) : year; }
  else return null;
  if (!y) return null;
  return `${y}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** The permanent address of the revision read. */
export const permalink = (title, revid) => `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(title.replace(/ /g, '_'))}&oldid=${revid}`;

/** A range of dates ("13–30 July", "8 June – 7 July", "31 May – 30 June 2002") → [first, last]. */
export function dateRange(s, year) {
  const t = plain(s);
  const m = /^(\d{1,2})\s*[–-]\s*(\d{1,2})\s+([A-Za-z]+)/.exec(t);
  if (m) return [isoDate(`${m[1]} ${m[3]} ${year}`, year), isoDate(`${m[2]} ${m[3]} ${year}`, year)];
  const parts = t.split(/\s*[–-]\s*/);
  return [isoDate(parts[0], year), isoDate(parts[parts.length - 1], year)];
}
