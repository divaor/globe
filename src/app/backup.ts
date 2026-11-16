// Your data on another device (v0.31.2). Everything the app keeps on this device (badges, streaks and scores, your
// trip and its places, visited and Want to go countries, settings, playlists, your own data) goes into one file, to
// bring back on a phone or another computer. Saved offline areas stay on each device (their tiles are not in the file).
//
// The file carries a seal: a signature of its contents made with a key in the app (HMAC-SHA256). A file edited by
// hand no longer matches it; it still brings over the trip, places, lists and settings, but not badges, streaks and
// scores, so they can't simply be typed in. The key is in the app's code, so this keeps out casual edits, not a
// determined cheat (who would only be fooling themselves).
import { Download, Upload, Share2 } from 'lucide';
import { h, icon, clear, add } from '../ui/dom';
import { lang } from './i18n';

declare const __APP_VERSION__: string;
const es = () => lang() === 'es';
const L = (en: string, sp: string) => (es() ? sp : en);

/** Kept only where they were made: saved offline areas (their tiles live in this device's cache) and first-run hints. */
const LOCAL_ONLY = new Set(['atlas-globe:saved-areas', 'atlas-saved-tiles', 'atlas-globe:hinted']);
/** What is earned: badges, streaks and scores. Brought over only from a file whose seal matches. */
const earned = (k: string) => k === 'atlas-globe:progress' || k.startsWith('atlas-quiz-best:');
const ours = (k: string) => /^atlas/.test(k) && !LOCAL_ONLY.has(k);

export interface Backup { app: 'Atlas Globe'; kind: 'backup'; v: 1; version: string; made: string; data: Record<string, string>; seal: string }

function keys(): string[] {
  const out: string[] = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && ours(k)) out.push(k); } } catch { /* private mode */ }
  return out.sort();
}

// The seal's key, put together when it is needed.
const K = [97, 116, 108, 97, 115, 45, 103, 108, 111, 98, 101, 58, 115, 101, 97, 108, 58, 118, 49, 58, 107, 101, 101, 112, 45, 105, 116, 45, 104, 111, 110, 101, 115, 116];
const b64u = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** The seal of a backup's contents ('' where the browser has no Web Crypto: such a file brings no badges over). */
async function sealOf(made: string, data: Record<string, string>): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return '';
  const text = `${made}\n${Object.keys(data).sort().map((k) => `${k}\u0000${data[k]}`).join('\u0001')}`;
  const key = await subtle.importKey('raw', new Uint8Array(K.map((c, i) => c ^ (i % 7))), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}

/** Everything, sealed. */
export async function makeBackup(): Promise<Backup> {
  const data: Record<string, string> = {};
  for (const k of keys()) { const v = localStorage.getItem(k); if (v != null) data[k] = v; }
  const made = new Date().toISOString();
  return { app: 'Atlas Globe', kind: 'backup', v: 1, version: __APP_VERSION__, made, data, seal: await sealOf(made, data) };
}

/** A backup file read back: its contents, and whether its seal matches (else its badges stay out). */
export async function readBackup(text: string): Promise<{ b: Backup; sealed: boolean } | null> {
  let b: Backup;
  try { b = JSON.parse(text); } catch { return null; }
  if (!b || b.app !== 'Atlas Globe' || b.kind !== 'backup' || typeof b.data !== 'object' || !b.data || typeof b.made !== 'string') return null;
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.data)) if (ours(k) && typeof v === 'string' && v.length < 5_000_000) data[k] = v;
  const sealed = !!b.seal && b.seal === (await sealOf(b.made, b.data));
  return { b: { ...b, data }, sealed };
}

/** Puts a backup on this device in place of what is here (earned data only from a sealed file; else this device's
 * own badges and scores stay as they are). */
export function restoreBackup(b: Backup, sealed: boolean): void {
  for (const k of keys()) if (sealed || !earned(k)) localStorage.removeItem(k);
  for (const [k, v] of Object.entries(b.data)) if (sealed || !earned(k)) localStorage.setItem(k, v);
}

/** What a backup holds, in a line ("23 badges · a trip of 4 cities and 9 places · 31 countries visited"). */
export function summary(data: Record<string, string>): string {
  const parse = <T>(k: string): T | null => { try { return data[k] ? (JSON.parse(data[k]) as T) : null; } catch { return null; } };
  const out: string[] = [];
  const p = parse<{ badges?: Record<string, string>; daily?: { best?: number } }>('atlas-globe:progress');
  const nb = Object.keys(p?.badges ?? {}).length;
  if (nb) out.push(nb === 1 ? L('1 badge', '1 insignia') : L(`${nb} badges`, `${nb} insignias`));
  const trip = parse<string[]>('atlas-globe:trip') ?? [];
  const places = Object.values(parse<{ places?: Record<string, unknown[]> }>('atlas-globe:trip-places')?.places ?? {}).reduce((n, l) => n + l.length, 0);
  if (trip.length) out.push(L(`a trip of ${trip.length} ${trip.length === 1 ? 'city' : 'cities'}${places ? ` and ${places} ${places === 1 ? 'place' : 'places'}` : ''}`, `un viaje de ${trip.length} ${trip.length === 1 ? 'ciudad' : 'ciudades'}${places ? ` y ${places} ${places === 1 ? 'lugar' : 'lugares'}` : ''}`));
  const me = parse<{ visited?: string[]; wish?: string[] }>('atlas-globe:personal');
  if (me?.visited?.length) out.push(L(`${me.visited.length} countries visited`, `${me.visited.length} países visitados`));
  if (me?.wish?.length) out.push(L(`${me.wish.length} to go`, `${me.wish.length} por visitar`));
  if (data['atlas-mydata']) out.push(L('your own data', 'tus datos propios'));
  return out.join(' · ') || L('settings only', 'solo ajustes');
}

const fileName = () => `atlas-globe-${L('backup', 'respaldo')}-${new Date().toISOString().slice(0, 10)}.json`;

/** Settings' part: save a backup (download, or the phone's share sheet), and bring one back. */
export function backupSettings(toast: (m: string) => void): HTMLElement {
  const box = h('div', { class: 'backup', 'data-backup': '' });
  const status = h('div', { class: 'backup-status' });
  const save = h('button', { type: 'button', class: 'pill sm primary', 'data-backup': 'save' }, icon(Download, 15), L('Save a backup', 'Guardar un respaldo'));
  save.addEventListener('click', () => void (async () => {
    const b = await makeBackup();
    const blob = new Blob([JSON.stringify(b)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: fileName() }) as HTMLAnchorElement;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(L(`Backup saved: ${summary(b.data)}.`, `Respaldo guardado: ${summary(b.data)}.`));
  })());
  const btns: HTMLElement[] = [save];
  // On a phone, straight to another app or device (a chat with yourself, a cloud drive, nearby sharing).
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] })) {
    const share = h('button', { type: 'button', class: 'pill sm', 'data-backup': 'share' }, icon(Share2, 15), L('Send it', 'Enviarlo'));
    share.addEventListener('click', () => void (async () => {
      const b = await makeBackup();
      try { await navigator.share({ files: [new File([JSON.stringify(b)], fileName(), { type: 'application/json' })], title: 'Atlas Globe' }); } catch { /* cancelled */ }
    })());
    btns.push(share);
  }
  const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true, 'data-backup': 'file' }) as HTMLInputElement;
  const load = h('button', { type: 'button', class: 'pill sm', 'data-backup': 'load' }, icon(Upload, 15), L('Bring back a backup', 'Recuperar un respaldo'));
  load.addEventListener('click', () => input.click());
  input.addEventListener('change', () => void (async () => {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    const got = await readBackup(await f.text());
    clear(status);
    if (!got) { status.append(h('p', { class: 'backup-warn' }, L('This is not an Atlas Globe backup.', 'Este no es un respaldo de Atlas Globe.'))); return; }
    const when = new Date(got.b.made).toLocaleString(lang(), { dateStyle: 'medium', timeStyle: 'short' });
    const yes = h('button', { type: 'button', class: 'pill sm primary', 'data-backup': 'replace' }, L('Replace this device’s data', 'Reemplazar los datos de este dispositivo'));
    const no = h('button', { type: 'button', class: 'pill sm', 'data-backup': 'cancel' }, L('Cancel', 'Cancelar'));
    no.addEventListener('click', () => clear(status));
    yes.addEventListener('click', () => {
      restoreBackup(got.b, got.sealed);
      toast(L('Your data is here. Starting again…', 'Tus datos están aquí. Reiniciando…'));
      setTimeout(() => location.reload(), 900);
    });
    add(status,
      h('p', null, h('strong', null, L(`Saved ${when}`, `Guardado el ${when}`)), ` (${got.b.version}): ${summary(got.b.data)}.`),
      got.sealed ? null : h('p', { class: 'backup-warn', 'data-backup': 'unsealed' }, L('This file was changed after it was saved: your trip, places, lists and settings come over, but not its badges, streaks and scores (this device keeps its own).', 'Este archivo se modificó después de guardarlo: tu viaje, lugares, listas y ajustes se recuperan, pero no sus insignias, rachas ni puntuaciones (este dispositivo conserva las suyas).')),
      h('p', { class: 'muted small' }, L('Everything this device keeps is replaced by the file’s.', 'Todo lo que guarda este dispositivo se reemplaza por lo del archivo.')),
      h('div', { class: 'tool-actions' }, yes, no));
  })());
  box.append(
    h('p', { class: 'muted small' }, L('One file with everything this device keeps (badges, streaks and scores, your trip and its places, your countries, settings, playlists, your own data), to bring back on your phone or another computer. Saved offline areas stay on each device.', 'Un archivo con todo lo que guarda este dispositivo (insignias, rachas y puntuaciones, tu viaje y sus lugares, tus países, ajustes, listas, tus datos propios), para recuperarlo en tu teléfono u otra computadora. Las zonas guardadas sin conexión se quedan en cada dispositivo.')),
    h('div', { class: 'tool-actions' }, ...btns, load), input, status);
  return box;
}
