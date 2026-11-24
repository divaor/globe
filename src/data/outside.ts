// Outside services (v0.47.0): every call to a website Mundora doesn't run goes through here, so that:
// - with no connection, nothing waits: the call fails at once, and the feature that asked says so or stays quiet;
// - a slow service can't hold a panel open: after `timeout` (15 s) the call gives up;
// - iNaturalist is asked at most 60 times a minute (its limit), and after a "too many" answer not for a minute;
// - Wikimedia's sites (Wikipedia, Wikidata, Commons, Wikivoyage) are told who is asking, by name and version, in the
//   Api-User-Agent header they ask browser tools to send. A site that refuses the header is asked again without it.
// It works like fetch: a Response, or an error to catch.

declare const __APP_VERSION__: string;

const WIKI = /(^|\.)(wikipedia|wikidata|wikimedia|wikivoyage)\.org$/;
const INAT = 'api.inaturalist.org';
/** Answers the app's own copy keeps (see the service worker's caches in vite.config.ts). */
const KEPT = (u: URL) => /\.wikipedia\.org$/.test(u.hostname) && u.pathname.startsWith('/api/rest_v1/page/summary/');

/** Who is asking, for Wikimedia: the app's name and version, and the website it runs on. */
export function clientName(): string {
  const v = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0';
  const site = /^https:$/.test(location.protocol) && !/^(localhost|127\.)/.test(location.hostname) ? ` (${location.origin}/)` : '';
  return `Mundora/${v}${site}`;
}

/** Hosts that refused the Api-User-Agent header (a failed check before the call); asked without it from then on. */
const plain = new Set<string>();

/** iNaturalist: the times of the calls in the last minute, and when a "too many" answer lets it be asked again. */
const inatCalls: number[] = [];
let inatPause = 0;
const LIMIT = 60, WINDOW = 60_000;

/** Waits until iNaturalist can be asked without going over 60 a minute (calls are spaced, never dropped). */
async function inatTurn(): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (inatCalls.length && now - inatCalls[0] >= WINDOW) inatCalls.shift();
    const wait = Math.max(inatPause - now, inatCalls.length >= LIMIT ? inatCalls[0] + WINDOW - now : 0);
    if (wait <= 0) { inatCalls.push(now); return; }
    await new Promise((r) => setTimeout(r, Math.min(wait, 5000)));
  }
}

/** How many iNaturalist calls the last minute holds (for the tests). */
export const inatLoad = () => { const now = Date.now(); return inatCalls.filter((t) => now - t < WINDOW).length; };

export class Offline extends Error { constructor() { super('offline'); this.name = 'Offline'; } }

export async function outside(url: string, init: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const u = new URL(url), host = u.hostname;
  // Offline, fail at once; except for what the app keeps a copy of (Wikipedia's summaries), which its copy answers.
  if (typeof navigator !== 'undefined' && navigator.onLine === false && !KEPT(u)) throw new Offline();
  if (host === INAT) await inatTurn();
  const ctl = new AbortController();
  const outer = init.signal;
  if (outer) { if (outer.aborted) ctl.abort(); else outer.addEventListener('abort', () => ctl.abort(), { once: true }); }
  const timer = setTimeout(() => ctl.abort(), init.timeout ?? 15_000);
  const go = (named: boolean) => {
    const headers = new Headers(init.headers);
    if (named) headers.set('Api-User-Agent', clientName());
    return fetch(url, { ...init, headers, signal: ctl.signal });
  };
  try {
    const wiki = WIKI.test(host);
    let r: Response;
    if (wiki && !plain.has(host)) {
      try { r = await go(true); } catch (e) {
        if (ctl.signal.aborted) throw e;
        plain.add(host);
        r = await go(false);
      }
    } else r = await go(false);
    if (host === INAT && r.status === 429) inatPause = Date.now() + WINDOW;
    return r;
  } finally { clearTimeout(timer); }
}

/** The JSON at an outside address, or null when it can't be had (offline, refused, slow or not JSON). */
export async function outsideJSON<T>(url: string, init?: RequestInit & { timeout?: number }): Promise<T | null> {
  try {
    const r = await outside(url, init);
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}
