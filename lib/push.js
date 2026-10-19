import webpush from 'web-push';
import { rootRef, sha } from './core.js';
export async function sendGenericPush(uid, payload, dedupeKey) {
  try {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return;
    const root = rootRef(), [settingsSnap, subsSnap] = await Promise.all([
      root.child('users/' + uid + '/settings').get(),
      root.child('pushSubscriptions/' + uid).get()
    ]);
    if (settingsSnap.val()?.notificationsEnabled !== true) return;
    const subscriptions = subsSnap.val() || {};
    if (!Object.keys(subscriptions).length) return;
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    const deliveryRef = root.child('pushDelivery/' + uid + '/event-' + sha(dedupeKey));
    let shouldSend = false;
    await deliveryRef.transaction(old => {
      if (old?.status === 'sent' || (old?.status === 'pending' && old.expiresAt > Date.now())) return;
      shouldSend = true;
      return { status: 'pending', updatedAt: Date.now(), expiresAt: Date.now() + 10 * 60 * 1000 };
    });
    if (!shouldSend) return;
    let delivered = false;
    await Promise.all(Object.entries(subscriptions).map(async ([key, subscription]) => {
      try {
        await webpush.sendNotification(subscription, JSON.stringify({ title: payload.title || 'MS Chat', body: payload.body || 'You have a new notification.', url: payload.url || '/', tag: payload.tag || 'mschat-notification' }));
        delivered = true;
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) await root.child('pushSubscriptions/' + uid + '/' + key).remove();
      }
    }));
    if (delivered) await deliveryRef.set({ status: 'sent', sentAt: Date.now(), expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });
    else await deliveryRef.remove();
  } catch {}
}
