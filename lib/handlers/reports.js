import { json, method, requireOrigin, session, rootRef, safeError, consumeRateLimit, rateLimitKey } from '../core.js';
export default async function handler(req, res) {
  if (!method(req, res, ['POST']) || !requireOrigin(req, res)) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    if (!(await consumeRateLimit(rateLimitKey(req, 'report:' + auth.uid), 5, 60 * 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    const targetId = String(req.body?.targetUserId || ''), category = String(req.body?.category || ''), details = String(req.body?.details || '').trim();
    if (!/^[A-Za-z0-9_-]{20}$/.test(targetId) || targetId === auth.uid || !['spam','harassment','impersonation','threats','other'].includes(category) || details.length < 10 || details.length > 2000) return json(res, 400, { error: 'INVALID_REPORT' });
    const root = rootRef(), target = (await root.child('users/' + targetId).get()).val();
    if (!target) return json(res, 404, { error: 'USER_NOT_FOUND' });
    const ref = root.child('reports').push(), now = Date.now();
    await ref.set({ id: ref.key, reporterId: auth.uid, targetUserId: targetId, category, details, status: 'open', priority: 'normal', createdAt: now, updatedAt: now });
    await root.child('securityEvents').push({ type: 'report_submitted', actorId: auth.uid, targetId, reportId: ref.key, createdAt: now });
    return json(res, 201, { ok: true, reportId: ref.key });
  } catch (error) { return safeError(res, error); }
}
