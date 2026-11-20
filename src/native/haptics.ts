// A light tap of the phone for a right or a wrong answer (v0.43.0). In the apps it is the phone's own feedback
// (@capacitor/haptics, loaded only there); on the website it is a short buzz where the browser has one (Android),
// as Master the world did before. Off with the phone's own settings (silent mode, haptics off).
import { isNative } from './platform';

export type Feel = 'right' | 'wrong' | 'tap';

let native: typeof import('@capacitor/haptics') | null = null;
let loading: Promise<void> | null = null;
function load() { loading ??= import('@capacitor/haptics').then((m) => { native = m; }).catch(() => {}); return loading; }

export function haptic(kind: Feel) {
  if (isNative()) {
    if (!native) { void load().then(() => haptic(kind)); return; }
    const { Haptics, ImpactStyle, NotificationType } = native;
    if (kind === 'right') void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    else if (kind === 'wrong') void Haptics.notification({ type: NotificationType.Error }).catch(() => {});
    else void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    return;
  }
  // The website: a buzz for a wrong answer only (a right one goes by quietly, as before).
  if (kind === 'wrong') { try { navigator.vibrate?.(90); } catch { /* no buzz here */ } }
}

/**
 * The apps: every game, quiz and deck shows its answer in the same feedback box (.quiz-fb ok / bad, the design
 * kit's), so one watcher gives them all the tap: when a new answer appears (not the same one drawn again when the
 * card is redrawn).
 */
export function watchAnswers() {
  let last: string | null = null;
  let queued = false;
  const check = () => {
    queued = false;
    const fb = document.querySelector('.quiz-fb.ok, .quiz-fb.bad');
    const now = fb ? `${fb.classList.contains('ok') ? 'ok' : 'bad'}|${fb.textContent ?? ''}` : null;
    if (now && now !== last) haptic(now.startsWith('ok') ? 'right' : 'wrong');
    last = now;
  };
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(check); } })
    .observe(document.body, { childList: true, subtree: true });
}
