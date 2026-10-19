import webpush from 'web-push';
import { json, method, requireOrigin, session, rootRef, safeError, consumeRateLimit, rateLimitKey } from '../../lib/core.js';
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{3,160}$/.test(value);
export default async function handler(req, res) {
  if (!method(req, res, ['GET', 'POST']) || (req.method === 'POST' && !requireOrigin(req, res))) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const root = rootRef();
    if (req.method === 'POST' && !(await consumeRateLimit(rateLimitKey(req, 'message:' + auth.uid), 120, 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    if (req.method === 'GET') {
      const conversationId = String(req.query?.conversationId || '');
      if (!validId(conversationId)) return json(res, 400, { error: 'INVALID_CONVERSATION' });
      const [memberSnap, messagesSnap] = await Promise.all([
        root.child('conversations/' + conversationId + '/members/' + auth.uid).get(),
        root.child('messages/' + conversationId).orderByChild('createdAt').limitToLast(100).get()
      ]);
      if (!memberSnap.val()) return json(res, 403, { error: 'FORBIDDEN' });
      const messages = Object.entries(messagesSnap.val() || {}).map(([id, m]) => ({ id, ...m })).sort((a,b) => a.createdAt - b.createdAt);
      return json(res, 200, { messages });
    }
    const conversationId = String(req.body?.conversationId || ''), ciphertext = req.body?.ciphertext, iv = req.body?.iv, keyVersion = req.body?.keyVersion;
    if (!validId(conversationId) || typeof ciphertext !== 'string' || ciphertext.length < 1 || ciphertext.length > 20000 || typeof iv !== 'string' || iv.length > 100 || !Number.isInteger(keyVersion) || keyVersion < 1) return json(res, 400, { error: 'INVALID_MESSAGE' });
    const memberSnap = await root.child('conversations/' + conversationId + '/members/' + auth.uid).get();
    if (!memberSnap.val()) return json(res, 403, { error: 'FORBIDDEN' });
    const now = Date.now(), ref = root.child('messages/' + conversationId).push();
    await ref.set({ senderId: auth.uid, ciphertext, iv, keyVersion, createdAt: now, deliveredTo: {}, readBy: {} });
    await root.child('conversations/' + conversationId + '/lastMessage').set({ messageId: ref.key, senderId: auth.uid, createdAt: now, preview: 'Encrypted message' });
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT) {
      try {
        webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
        const membersSnap = await root.child('conversations/' + conversationId + '/members').get();
        const recipients = Object.keys(membersSnap.val() || {}).filter(uid => uid !== auth.uid);
        for (const recipient of recipients) {
          const subsSnap = await root.child('pushSubscriptions/' + recipient).get();
          const subscriptions = subsSnap.val() || {};
          await Promise.all(Object.entries(subscriptions).map(async ([key, subscription]) => {
            try { await webpush.sendNotification(subscription, JSON.stringify({ title: 'New message · MS Chat', body: 'You received a new encrypted message.', url: '/', tag: 'mschat-' + conversationId })); }
            catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await root.child('pushSubscriptions/' + recipient + '/' + key).remove(); }
          }));
        }
      } catch {}
    }
    return json(res, 201, { id: ref.key, createdAt: now });
  } catch (error) { return safeError(res, error); }
}
