import { createElement, type IconNode } from 'lucide';
import { proseInEnglish, L } from '../app/i18n';

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> & { class?: string; style?: string | Partial<CSSStyleDeclaration> };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'html') el.innerHTML = String(v);
      else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function icon(node: IconNode, size = 20, cls = 'ic'): SVGElement {
  const el = createElement(node, { width: size, height: size, 'stroke-width': 2 });
  el.setAttribute('class', cls);
  el.setAttribute('aria-hidden', 'true');
  return el;
}

export function button(opts: { icon?: IconNode; label?: string; title?: string; cls?: string; onClick?: (e: MouseEvent) => void; iconSize?: number }) {
  return h('button', { class: `btn ${opts.cls ?? ''}`.trim(), type: 'button', title: opts.title ?? opts.label, 'aria-label': opts.title ?? opts.label, onclick: opts.onClick },
    opts.icon ? icon(opts.icon, opts.iconSize ?? 20) : null,
    opts.label ? h('span', { class: 'btn-label' }, opts.label) : null);
}

/** append() that skips null/false children. */
export function add(el: Element, ...children: (Node | string | null | undefined | false)[]) {
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function toggle(checked: boolean, onChange: (v: boolean) => void, label?: string) {
  const input = h('input', { type: 'checkbox', class: 'switch-input' }) as HTMLInputElement;
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'switch' }, input, h('span', { class: 'switch-track' }, h('span', { class: 'switch-thumb' })), label ? h('span', { class: 'switch-label' }, label) : null);
}

export function segmented<T extends string>(value: T, options: { value: T; label: string }[], onChange: (v: T) => void) {
  const wrap = h('div', { class: 'seg', role: 'radiogroup' });
  for (const o of options) {
    const b = h('button', { type: 'button', class: `seg-btn${o.value === value ? ' on' : ''}`, role: 'radio', 'aria-checked': String(o.value === value) }, o.label);
    b.addEventListener('click', () => {
      wrap.querySelectorAll('.seg-btn').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); });
      b.classList.add('on'); b.setAttribute('aria-checked', 'true');
      onChange(o.value);
    });
    wrap.append(b);
  }
  return wrap;
}

/** A range slider; `label` names it for screen readers (v0.47.0; the words beside it are not tied to it). */
export function slider(value: number, min: number, max: number, step: number, onInput: (v: number) => void, label?: string) {
  const s = h('input', { type: 'range', class: 'slider', min: String(min), max: String(max), step: String(step) }) as HTMLInputElement;
  if (label) s.setAttribute('aria-label', label.replace(/[:\s]+$/, ''));
  s.value = String(value);
  s.addEventListener('input', () => onInput(Number(s.value)));
  return s;
}

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Fills a <select> with choices, inside <optgroup>s when choices name a group (in order of appearance). */
export function fillSelect(sel: HTMLSelectElement, choices: { value: string; label: string; group?: string }[]) {
  let current: HTMLElement = sel;
  let currentGroup: string | undefined;
  for (const c of choices) {
    if (c.group !== currentGroup) {
      currentGroup = c.group;
      current = c.group ? h('optgroup', { label: c.group }) : sel;
      if (c.group) sel.append(current);
    }
    current.append(h('option', { value: c.value }, c.label));
  }
}

/** In a language read from files (v0.42.0), stories, lives and guides are still written in English and Spanish: a line
 *  at the top of their panels says so. Null in English and Spanish. */
export function englishNote(): HTMLElement | null {
  if (!proseInEnglish()) return null;
  return h('p', { class: 'prose-note', 'data-prose-note': '' }, `🌐 ${L('Stories, lives and guides are in English for now: they will come in your language step by step.', 'Las historias, las vidas y las guías están en inglés por ahora: llegarán a tu idioma poco a poco.')}`);
}
