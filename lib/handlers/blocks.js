import { json, method, requireOrigin, session, rootRef, safeError, consumeRateLimit, rateLimitKey } from '../core.js';
export default async function handler(req, res) {
  if (!method(req, res, ['GET','POST']) || (req.method === 'POST' && !requireOrigin(req, res))) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const root = rootRef();
    if (req.method === 'GET') {
      const snap = await root.child('blocks/' + auth.uid).get(), blocks = [];
      for (const uid of Object.keys(snap.val() || {})) {
        const u = (await root.child('users/' + uid).get()).val();
        if (u) blocks.push({ id: uid, username: u.username, fullName: u.fullName, blockedAt: snap.val()[uid].createdAt || null });
      }
      return json(res, 200, { blocks });
    }
    if (!(await consumeRateLimit(rateLimitKey(req, 'block-action:' + auth.uid), 20, 60 * 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    const targetId = String(req.body?.userId || ''), action = String(req.body?.action || '');
    if (!/^[A-Za-z0-9_-]{20}$/.test(targetId) || targetId === auth.uid || !['block','unblock'].includes(action)) return json(res, 400, { error: 'INVALID_ACTION' });
    const target = (await root.child('users/' + targetId).get()).val();
    if (!target || target.disabled) return json(res, 404, { error: 'USER_NOT_FOUND' });
    const pair = [auth.uid,targetId].sort().join('_'), now = Date.now();
    if (action === 'block') {
      await root.child('blocks/' + auth.uid + '/' + targetId).set({ createdAt: now });
      await root.child('typing/' + pair + '/' + auth.uid).remove();
      await root.child('typing/' + pair + '/' + targetId).remove();
    } else await root.child('blocks/' + auth.uid + '/' + targetId).remove();
    await root.child('securityEvents').push({ type: 'user_' + action, actorId: auth.uid, targetId, createdAt: now });
    return json(res, 200, { ok: true, action });
  } catch (error) { return safeError(res, error); }
}
