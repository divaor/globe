// The apps' reminders (v0.43.0): real notifications from the phone (@capacitor/local-notifications), scheduled ahead
// by src/today/remind-plan.ts. Android shows them around the time (inexact: no "alarms and reminders" permission);
// iOS at the time. Tapping one opens Today.
import { LocalNotifications } from '@capacitor/local-notifications';
import { planReminders, REMIND_IDS, type RemindSnapshot } from '../today/remind-plan';

/** Asks once (the phone's own prompt); true when the app may notify. */
export async function allowNotifications(): Promise<boolean> {
  try {
    let p = (await LocalNotifications.checkPermissions()).display;
    if (p === 'prompt' || p === 'prompt-with-rationale') p = (await LocalNotifications.requestPermissions()).display;
    return p === 'granted';
  } catch { return false; }
}

export async function notificationsAllowed(): Promise<boolean> {
  try { return (await LocalNotifications.checkPermissions()).display === 'granted'; } catch { return false; }
}

/** Replaces the scheduled reminders with the plan for the next eight days. */
export async function scheduleReminders(snap: RemindSnapshot | null, now = new Date()): Promise<number> {
  try {
    await LocalNotifications.cancel({ notifications: REMIND_IDS.map((id) => ({ id })) });
    if (!(await notificationsAllowed())) return 0;
    const plan = planReminders(snap, now);
    if (!plan.length) return 0;
    await LocalNotifications.schedule({
      notifications: plan.map((r) => ({
        id: r.id, title: r.title, body: r.body,
        schedule: { at: r.at, allowWhileIdle: false },
        extra: { open: 'today', source: r.source },
        smallIcon: 'ic_stat_globe', iconColor: '#3fd0e0',
      })),
    });
    return plan.length;
  } catch (e) { console.warn('reminders', e); return 0; }
}

/** A reminder tapped: Today opens (in the app open already, or just started by the tap). */
export function onReminderTap(open: () => void) {
  void LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    if ((a.notification.extra as { open?: string } | undefined)?.open === 'today') open();
  }).catch(() => {});
}
