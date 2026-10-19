import { json, method, requireOrigin, session, rootRef, safeError, consumeRateLimit, rateLimitKey } from '../core.js';
export default async function handler(req, res) {
  if (!method(req, res, ['GET', 'POST']) || (req.method === 'POST' && !requireOrigin(req, res))) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const root = rootRef();
    if (req.method === 'GET' && !(await consumeRateLimit(rateLimitKey(req, 'typing-read:' + auth.uid), 40, 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    const conversationId = String(req.method === 'GET' ? req.query?.conversationId || '' : req.body?.conversationId || '');
    if (!/^[A-Za-z0-9_-]{3,160}$/.test(conversationId)) return json(res, 400, { error: 'INVALID_CONVERSATION' });
    const members = (await root.child('conversations/' + conversationId + '/members').get()).val() || {};
    if (!members[auth.uid]) return json(res, 403, { error: 'FORBIDDEN' });
    const others = Object.keys(members).filter(uid => uid !== auth.uid);
    if (others.length !== 1 || !(await root.child('friends/' + auth.uid + '/' + others[0]).get()).exists()) return json(res, 403, { error: 'FRIENDSHIP_REQUIRED' });
    const [blockedA, blockedB] = await Promise.all([root.child('blocks/' + auth.uid + '/' + others[0]).get(), root.child('blocks/' + others[0] + '/' + auth.uid).get()]);
    if (blockedA.exists() || blockedB.exists()) return json(res, 403, { error: 'CONVERSATION_BLOCKED' });
    if (req.method === 'POST') {
      if (!(await consumeRateLimit(rateLimitKey(req, 'typing:' + auth.uid), 15, 10 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
      const isTyping = req.body?.isTyping === true;
      const ref = root.child('typing/' + conversationId + '/' + auth.uid);
      if (isTyping) await ref.set({ isTyping: true, updatedAt: Date.now(), expiresAt: Date.now() + 6000 });
      else await ref.remove();
      return json(res, 200, { ok: true });
    }
    const otherIds = Object.keys(members).filter(uid => uid !== auth.uid);
    let typing = false;
    for (const uid of otherIds) {
      const state = (await root.child('typing/' + conversationId + '/' + uid).get()).val();
      if (state?.isTyping && state.expiresAt > Date.now()) { typing = true; break; }
      if (state && state.expiresAt <= Date.now()) await root.child('typing/' + conversationId + '/' + uid).remove();
    }
    return json(res, 200, { typing });
  } catch (error) { return safeError(res, error); }
}
