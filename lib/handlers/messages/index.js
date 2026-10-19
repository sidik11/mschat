import webpush from 'web-push';
import { json, method, requireOrigin, session, rootRef, safeError, consumeRateLimit, rateLimitKey } from '../../core.js';
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{3,160}$/.test(value);
export default async function handler(req, res) {
  if (!method(req, res, ['GET', 'POST']) || (req.method === 'POST' && !requireOrigin(req, res))) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const root = rootRef();
    if (req.method === 'GET' && !(await consumeRateLimit(rateLimitKey(req, 'messages-read:' + auth.uid), 60, 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
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
    const conversationId = String(req.body?.conversationId || ''), ciphertext = req.body?.ciphertext, iv = req.body?.iv, keyVersion = req.body?.keyVersion, attachmentId = req.body?.attachmentId ? String(req.body.attachmentId) : '';
    if (!validId(conversationId) || typeof ciphertext !== 'string' || ciphertext.length < 24 || ciphertext.length > 20000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(ciphertext) || typeof iv !== 'string' || iv.length !== 16 || !/^[A-Za-z0-9+/]{16}$/.test(iv) || keyVersion !== 1) return json(res, 400, { error: 'INVALID_MESSAGE' });
    const memberSnap = await root.child('conversations/' + conversationId + '/members/' + auth.uid).get();
    if (!memberSnap.val()) return json(res, 403, { error: 'FORBIDDEN' });
    let attachmentRef = null;
    if (attachmentId) {
      if (!/^[a-f0-9]{32}$/.test(attachmentId)) return json(res, 400, { error: 'INVALID_ATTACHMENT' });
      attachmentRef = root.child('attachments/' + attachmentId);
      const attachment = (await attachmentRef.get()).val();
      if (!attachment || attachment.ownerId !== auth.uid || attachment.conversationId !== conversationId || attachment.status !== 'ready') return json(res, 400, { error: 'ATTACHMENT_NOT_READY' });
    }
    const now = Date.now(), ref = root.child('messages/' + conversationId).push();
    await ref.set({ senderId: auth.uid, ciphertext, iv, keyVersion, createdAt: now, deliveredTo: {}, readBy: {}, ...(attachmentId ? { attachmentId } : {}) });
    if (attachmentRef) {
      try { await attachmentRef.update({ status: 'linked', messageId: ref.key, linkedAt: now, expiresAt: null }); }
      catch (error) { await ref.remove(); throw error; }
    }
    try { await root.child('conversations/' + conversationId + '/lastMessage').set({ messageId: ref.key, senderId: auth.uid, createdAt: now, preview: 'Encrypted message' }); } catch {}
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
