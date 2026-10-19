import webpush from 'web-push';
import { json, method, requireOrigin, session, rootRef, safeError, consumeRateLimit, rateLimitKey, incrementCounter } from '../../core.js';
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
      const before = Number(req.query?.before || Number.MAX_SAFE_INTEGER);
      if (!Number.isFinite(before) || before <= 0) return json(res, 400, { error: 'INVALID_CURSOR' });
      const [memberSnap, messagesSnap, membersSnap, stateSnap] = await Promise.all([
        root.child('conversations/' + conversationId + '/members/' + auth.uid).get(),
        root.child('messages/' + conversationId).orderByChild('createdAt').endAt(before - 1).limitToLast(100).get(),
        root.child('conversations/' + conversationId + '/members').get(),
        root.child('userConversationState/' + auth.uid + '/' + conversationId).get()
      ]);
      if (!memberSnap.val()) return json(res, 403, { error: 'FORBIDDEN' });
      const otherIds = Object.keys(membersSnap.val() || {}).filter(uid => uid !== auth.uid);
      for (const uid of otherIds) {
        const [a, b] = await Promise.all([root.child('blocks/' + auth.uid + '/' + uid).get(), root.child('blocks/' + uid + '/' + auth.uid).get()]);
        if (a.exists() || b.exists()) return json(res, 403, { error: 'CONVERSATION_BLOCKED' });
      }
      const hidden = (await root.child('userConversationState/' + auth.uid + '/' + conversationId + '/hiddenMessages').get()).val() || {};
      const messages = Object.entries(messagesSnap.val() || {}).filter(([id]) => !hidden[id]).map(([id, m]) => ({ id, ...m })).sort((a,b) => a.createdAt - b.createdAt);
      const state = stateSnap.val() || {};
      return json(res, 200, { messages, nextCursor: messages.length ? messages[0].createdAt : null, unreadMessageIds: Object.keys(state.unreadMessages || {}), lastReadAt: state.lastReadAt || 0 });
    }
    const conversationId = String(req.body?.conversationId || ''), ciphertext = req.body?.ciphertext, iv = req.body?.iv, keyVersion = req.body?.keyVersion, attachmentId = req.body?.attachmentId ? String(req.body.attachmentId) : '', idempotencyKey = String(req.body?.idempotencyKey || '');
    if (!validId(conversationId) || !/^[A-Za-z0-9_-]{16,80}$/.test(idempotencyKey) || typeof ciphertext !== 'string' || ciphertext.length < 24 || ciphertext.length > 20000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(ciphertext) || typeof iv !== 'string' || iv.length !== 16 || !/^[A-Za-z0-9+/]{16}$/.test(iv) || keyVersion !== 1) return json(res, 400, { error: 'INVALID_MESSAGE' });
    const [memberSnap, membersSnap] = await Promise.all([root.child('conversations/' + conversationId + '/members/' + auth.uid).get(), root.child('conversations/' + conversationId + '/members').get()]);
    if (!memberSnap.val()) return json(res, 403, { error: 'FORBIDDEN' });
    const otherIds = Object.keys(membersSnap.val() || {}).filter(uid => uid !== auth.uid);
    if (otherIds.length !== 1 || !(await root.child('friends/' + auth.uid + '/' + otherIds[0]).get()).exists()) return json(res, 403, { error: 'FRIENDSHIP_REQUIRED' });
    for (const uid of otherIds) {
      const [a, b] = await Promise.all([root.child('blocks/' + auth.uid + '/' + uid).get(), root.child('blocks/' + uid + '/' + auth.uid).get()]);
      if (a.exists() || b.exists()) return json(res, 403, { error: 'CONVERSATION_BLOCKED' });
    }
    let attachmentRef = null;
    if (attachmentId) {
      if (!/^[a-f0-9]{32}$/.test(attachmentId)) return json(res, 400, { error: 'INVALID_ATTACHMENT' });
      attachmentRef = root.child('attachments/' + attachmentId);
      const attachment = (await attachmentRef.get()).val();
      if (!attachment || attachment.ownerId !== auth.uid || attachment.conversationId !== conversationId || attachment.status !== 'ready') return json(res, 400, { error: 'ATTACHMENT_NOT_READY' });
    }
    const now = Date.now(), messageId = root.child('messages/' + conversationId).push().key;
    const idempotencyRef = root.child('messageIdempotency/' + auth.uid + '/' + idempotencyKey);
    const reservation = await idempotencyRef.transaction(old => old || { messageId, conversationId, status: 'pending', createdAt: now });
    const reserved = reservation.snapshot.val();
    if (reserved.conversationId !== conversationId) return json(res, 409, { error: 'IDEMPOTENCY_KEY_REUSED' });
    if (reserved.messageId !== messageId || !reservation.committed) {
      const existing = await root.child('messages/' + conversationId + '/' + reserved.messageId).get();
      if (existing.exists()) { if (reserved.status !== 'complete') await idempotencyRef.update({ status: 'complete' }); return json(res, 200, { id: reserved.messageId, createdAt: existing.val().createdAt, duplicate: true }); }
      return json(res, 409, { error: 'MESSAGE_RETRY_PENDING' });
    }
    const ref = root.child('messages/' + conversationId + '/' + messageId);
    let attachmentLinked = false;
    try {
      await ref.set({ senderId: auth.uid, ciphertext, iv, keyVersion, createdAt: now, idempotencyKey, deliveredTo: {}, readBy: {}, ...(attachmentId ? { attachmentId } : {}) });
      if (attachmentRef) {
        await attachmentRef.update({ status: 'linked', messageId: ref.key, linkedAt: now, expiresAt: null });
        attachmentLinked = true;
      }
      await idempotencyRef.update({ status: 'complete' });
    } catch (error) {
      try { await ref.remove(); } catch {}
      try { await idempotencyRef.remove(); } catch {}
      if (attachmentLinked && attachmentRef) {
        try { await attachmentRef.update({ status: 'ready', messageId: null, linkedAt: null, expiresAt: Date.now() + 24 * 60 * 60 * 1000 }); } catch {}
      }
      throw error;
    }
    try { await incrementCounter('messages'); } catch {}
    try { await root.child('userConversationState/' + otherIds[0] + '/' + conversationId + '/unreadMessages/' + ref.key).set(true); } catch {}
    try {
      await root.child('conversations/' + conversationId + '/lastMessage').set({ messageId: ref.key, senderId: auth.uid, createdAt: now, preview: 'Encrypted message' });
      await root.child('userConversationState/' + auth.uid + '/' + conversationId + '/lastSentAt').set(now);
    } catch {}
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT) {
      try {
        webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
        const recipients = otherIds;
        const sender = (await root.child('users/' + auth.uid).get()).val() || {};
        for (const recipient of recipients) {
          const [subsSnap, settingsSnap, presenceSnap] = await Promise.all([
            root.child('pushSubscriptions/' + recipient).get(),
            root.child('users/' + recipient + '/settings').get(),
            root.child('presence/' + recipient + '/sessions').get()
          ]);
          const settings = settingsSnap.val() || {};
          if (settings.notificationsEnabled !== true || settings.mutedConversations?.[conversationId] === true) continue;
          const activeHere = Object.values(presenceSnap.val() || {}).some(s => s?.expiresAt > Date.now() && s.activeConversationId === conversationId);
          if (activeHere) continue;
          const subscriptions = subsSnap.val() || {};
          if (!Object.keys(subscriptions).length) continue;
          const deliveryRef = root.child('pushDelivery/' + recipient + '/' + ref.key);
          let shouldSend = false;
          await deliveryRef.transaction(old => {
            if (old?.status === 'sent' || (old?.status === 'pending' && old.expiresAt > Date.now())) return;
            shouldSend = true;
            return { status: 'pending', updatedAt: Date.now(), expiresAt: Date.now() + 10 * 60 * 1000 };
          });
          if (!shouldSend) continue;
          let delivered = false;
          const body = settings.notificationPrivacy === 'sender' && sender.username ? 'New message from @' + sender.username : 'You received a new encrypted message.';
          await Promise.all(Object.entries(subscriptions).map(async ([key, subscription]) => {
            try {
              await webpush.sendNotification(subscription, JSON.stringify({ title: 'MS Chat', body, url: '/?conversation=' + encodeURIComponent(conversationId), tag: 'mschat-' + conversationId }));
              delivered = true;
            } catch (e) {
              if (e.statusCode === 404 || e.statusCode === 410) await root.child('pushSubscriptions/' + recipient + '/' + key).remove();
            }
          }));
          if (delivered) await deliveryRef.set({ status: 'sent', sentAt: Date.now(), expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });
          else await deliveryRef.remove();
        }
      } catch {}
    }
    return json(res, 201, { id: ref.key, createdAt: now });
  } catch (error) { return safeError(res, error); }
}
