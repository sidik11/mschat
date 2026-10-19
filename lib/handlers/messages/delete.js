import { json, method, requireOrigin, session, rootRef, safeError, consumeRateLimit, rateLimitKey } from '../../core.js';
export default async function handler(req, res) {
  if (!method(req, res, ['POST']) || !requireOrigin(req, res)) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    if (!(await consumeRateLimit(rateLimitKey(req, 'message-delete:' + auth.uid), 30, 60 * 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    const conversationId = String(req.body?.conversationId || ''), messageId = String(req.body?.messageId || ''), scope = String(req.body?.scope || '');
    if (!/^[A-Za-z0-9_-]{3,160}$/.test(conversationId) || !/^[A-Za-z0-9_-]{20}$/.test(messageId) || !['me','everyone'].includes(scope)) return json(res, 400, { error: 'INVALID_DELETE_REQUEST' });
    const root = rootRef();
    if (!(await root.child('conversations/' + conversationId + '/members/' + auth.uid).get()).val()) return json(res, 403, { error: 'FORBIDDEN' });
    const ref = root.child('messages/' + conversationId + '/' + messageId), snap = await ref.get(), message = snap.val();
    if (!message) return json(res, 404, { error: 'MESSAGE_NOT_FOUND' });
    if (scope === 'me') {
      await root.child('userConversationState/' + auth.uid + '/' + conversationId + '/hiddenMessages/' + messageId).set(Date.now());
      return json(res, 200, { ok: true, scope });
    }
    if (message.senderId !== auth.uid) return json(res, 403, { error: 'ONLY_SENDER_CAN_DELETE_FOR_EVERYONE' });
    if (message.deletedForEveryone) return json(res, 200, { ok: true, scope, alreadyDeleted: true });
    if (Date.now() - Number(message.createdAt || 0) > 15 * 60 * 1000) return json(res, 409, { error: 'DELETE_WINDOW_EXPIRED' });
    await ref.update({ ciphertext: null, iv: null, deletedForEveryone: true, deletedAt: Date.now(), deletedBy: auth.uid });
    return json(res, 200, { ok: true, scope });
  } catch (error) { return safeError(res, error); }
}
