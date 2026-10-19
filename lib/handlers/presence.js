import { json, method, requireOrigin, session, rootRef, safeError, consumeRateLimit, rateLimitKey } from '../core.js';
export default async function handler(req, res) {
  if (!method(req, res, ['POST']) || !requireOrigin(req, res)) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    if (!(await consumeRateLimit(rateLimitKey(req, 'presence:' + auth.uid), 8, 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    const now = Date.now(), conversationId = String(req.body?.conversationId || '');
    const root = rootRef();
    if (conversationId && !/^[A-Za-z0-9_-]{3,160}$/.test(conversationId)) return json(res, 400, { error: 'INVALID_CONVERSATION' });
    if (conversationId) {
      const members = (await root.child('conversations/' + conversationId + '/members').get()).val() || {};
      const others = Object.keys(members).filter(uid => uid !== auth.uid);
      if (!members[auth.uid] || others.length !== 1 || !(await root.child('friends/' + auth.uid + '/' + others[0]).get()).exists()) return json(res, 403, { error: 'FORBIDDEN' });
      const [blockedA, blockedB] = await Promise.all([root.child('blocks/' + auth.uid + '/' + others[0]).get(), root.child('blocks/' + others[0] + '/' + auth.uid).get()]);
      if (blockedA.exists() || blockedB.exists()) return json(res, 403, { error: 'CONVERSATION_BLOCKED' });
    }
    const record = { lastSeenAt: now, status: 'online', expiresAt: now + 90 * 1000, activeConversationId: conversationId || null };
    await root.child('presence/' + auth.uid + '/sessions/' + auth.sessionHash).set(record);
    await root.child('presence/' + auth.uid).update({ lastSeenAt: now, status: 'online' });
    return json(res, 200, { ok: true, lastSeenAt: now });
  } catch (error) { return safeError(res, error); }
}
