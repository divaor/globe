// Spain's Spanish on screen (v0.23.0). The app's Spanish texts are written once, in Latin American Spanish; with
// "Español (España)" chosen, what the page shows is given Spain's words (src/app/spain.ts) where it is shown:
// - the page's texts, as they appear and change (a MutationObserver), and a few attributes (titles, placeholders);
// - the labels drawn on the map's canvases (fillText, strokeText and measureText, so label sizes still fit).
// Nothing else changes: data, links and searches keep the texts as written. Switching back puts the texts back.
import { spainOn } from '../app/i18n';
import { toSpain } from '../app/spain';

const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
/** Where texts are left as they are: what people type, code, and anything marked translate="no". */
const SKIP = 'script, style, textarea, input, [contenteditable="true"], [translate="no"]';
const texts = new WeakMap<Text, { from: string; to: string }>();
const attrs = new WeakMap<Element, Map<string, { from: string; to: string }>>();
let observer: MutationObserver | null = null;

const worth = (s: string) => s.length >= 3 && /\p{L}{2}/u.test(s);

function fixText(n: Text) {
  const d = n.data;
  if (texts.get(n)?.to === d || !worth(d)) return;
  const el = n.parentElement;
  if (!el || el.closest(SKIP)) return;
  const to = toSpain(d);
  if (to === d) return;
  texts.set(n, { from: d, to });
  n.data = to;
}

function fixAttr(el: Element, a: string) {
  const v = el.getAttribute(a);
  if (!v || !worth(v)) return;
  const seen = attrs.get(el);
  if (seen?.get(a)?.to === v || el.closest(SKIP)) return;
  const to = toSpain(v);
  if (to === v) return;
  (seen ?? attrs.set(el, new Map()).get(el)!).set(a, { from: v, to });
  el.setAttribute(a, to);
}

function walk(root: Node, fn: (n: Node) => void) {
  if (root.nodeType === Node.TEXT_NODE || root.nodeType === Node.ELEMENT_NODE) fn(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) fn(n);
}
const fix = (n: Node) => {
  if (n.nodeType === Node.TEXT_NODE) fixText(n as Text);
  else for (const a of ATTRS) if ((n as Element).hasAttribute(a)) fixAttr(n as Element, a);
};
const unfix = (n: Node) => {
  if (n.nodeType === Node.TEXT_NODE) {
    const t = n as Text, was = texts.get(t);
    if (was && t.data === was.to) t.data = was.from;
    texts.delete(t);
  } else {
    const seen = attrs.get(n as Element);
    if (seen) for (const [a, was] of seen) if ((n as Element).getAttribute(a) === was.to) (n as Element).setAttribute(a, was.from);
    attrs.delete(n as Element);
  }
};

// ---- Canvas labels -------------------------------------------------------------------------------
let patched = false;
function patchCanvas() {
  if (patched) return;
  patched = true;
  const protos = [globalThis.CanvasRenderingContext2D?.prototype, (globalThis.OffscreenCanvasRenderingContext2D?.prototype as unknown as CanvasRenderingContext2D | undefined)];
  for (const P of protos) {
    if (!P) continue;
    const fill = P.fillText, stroke = P.strokeText, measure = P.measureText;
    const sp = (t: unknown) => (typeof t === 'string' && spainOn() && worth(t) ? toSpain(t) : t) as string;
    P.fillText = function (this: CanvasRenderingContext2D, t: string, x: number, y: number, w?: number) { return w === undefined ? fill.call(this, sp(t), x, y) : fill.call(this, sp(t), x, y, w); };
    P.strokeText = function (this: CanvasRenderingContext2D, t: string, x: number, y: number, w?: number) { return w === undefined ? stroke.call(this, sp(t), x, y) : stroke.call(this, sp(t), x, y, w); };
    P.measureText = function (this: CanvasRenderingContext2D, t: string) { return measure.call(this, sp(t)); };
  }
}

/** Shows the page in Spain's Spanish (on) or puts its texts back (off). Call it whenever the language changes. */
export function spainView(on = spainOn()) {
  if (on) {
    patchCanvas();
    if (observer || !document.body) return;
    observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'characterData') fixText(r.target as Text);
        else if (r.type === 'attributes') fixAttr(r.target as Element, r.attributeName!);
        else r.addedNodes.forEach((n) => walk(n, fix));
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    walk(document.body, fix);
  } else if (observer) {
    observer.disconnect();
    observer = null;
    walk(document.body, unfix);
  }
}
