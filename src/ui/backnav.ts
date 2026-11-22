// The phone's back gesture on the website (v0.43.2). In the apps, Android's back button closes what is on top
// (src/native/chrome.ts); on the website the gesture went back in the browser's history and so left the app, even
// with a picture open full screen over a quiz. Now each thing a tap opens (a picture, a panel, a list, a game or quiz,
// a country's card) adds one step to the history, and the back gesture takes it off by closing that thing
// (Shell.back). With nothing open, back leaves as before.
//
// A step is added just after the tap that opened the thing (a browser keeps, for its back button, only the steps a
// person made), and taken off again when the thing is closed another way (its X), so that no back does nothing. The
// address stays the newest one the app wrote (a story's step, the filters), whichever step it is on.
import type { Shell } from './shell';

/** Our steps above the page in the history are marked with their level. */
const KEY = 'atlasBack';
const level = () => Number((history.state as Record<string, unknown> | null)?.[KEY] ?? 0) || 0;

export function backGesture(shell: Shell) {
  let depth = level();
  // The address the app wrote last (its filters, a story's step…): a step taken off must not bring back an older one.
  let href = location.href;
  const replace = history.replaceState.bind(history);
  history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => { replace(data, unused, url); href = location.href; };
  /** History moves made here (taking off the steps of things closed by their X): their popstate is not a gesture. */
  let quiet = 0;
  const sync = () => {
    if (quiet) return;
    const open = shell.openCount();
    if (open > depth) {
      // One step per tap: a second one would not count as made by the person, and back would skip it.
      history.pushState({ ...((history.state as object | null) ?? {}), [KEY]: depth + 1 }, '');
      depth++;
    } else if (open < depth) {
      quiet++;
      history.go(open - depth);
    }
  };
  addEventListener('popstate', () => {
    const was = depth;
    depth = level();
    if (location.href !== href) replace(history.state, '', href);
    if (quiet) { quiet--; return; }
    // The back gesture: what is on top closes.
    if (depth < was) shell.back();
    later();
  });
  // After a tap, and once what it opens is up (a quiz may load for a moment), the steps follow what is open: checked
  // at most every 300 ms while the page changes.
  let timer = 0;
  const later = () => { if (!timer) timer = window.setTimeout(() => { timer = 0; sync(); }, 300); };
  for (const ev of ['click', 'keyup']) addEventListener(ev, later, true);
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  later();
}
