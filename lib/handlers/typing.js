import { json, method, requireOrigin, session, rootRef, safeError, consumeRateLimit, rateLimitKey } from '../core.js';
export default async function handler(req, res) {
  if (!method(req, res, ['GET', 'POST']) || (req.method === 'POST' && !requireOrigin(req, res))) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const root = rootRef();
    const conversationId = String(req.method === 'GET' ? req.query?.conversationId || '' : req.body?.conversationId || '');
    if (!/^[A-Za-z0-9_-]{3,160}$/.test(conversationId)) return json(res, 400, { error: 'INVALID_CONVERSATION' });
    const members = (await root.child('conversations/' + conversationId + '/members').get()).val() || {};
    if (!members[auth.uid]) return json(res, 403, { error: 'FORBIDDEN' });
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
    }
    return json(res, 200, { typing });
  } catch (error) { return safeError(res, error); }
}
