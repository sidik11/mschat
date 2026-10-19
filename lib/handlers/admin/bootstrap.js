import { timingSafeEqual, createHash } from 'node:crypto';
import { json, method, requireOrigin, session, rootRef, safeError, consumeRateLimit, rateLimitKey } from '../../core.js';
function matches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = createHash('sha256').update(a).digest(), y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y);
}
export default async function handler(req, res) {
  if (!method(req, res, ['POST']) || !requireOrigin(req, res)) return;
  try {
    if (!(await consumeRateLimit(rateLimitKey(req, 'admin-bootstrap'), 5, 60 * 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const secret = String(req.headers['x-admin-bootstrap-secret'] || '');
    if (!process.env.ADMIN_BOOTSTRAP_SECRET || !process.env.ADMIN_EMAIL || !matches(secret, process.env.ADMIN_BOOTSTRAP_SECRET)) return json(res, 403, { error: 'FORBIDDEN' });
    const root = rootRef(), userRef = root.child('users/' + auth.uid), snap = await userRef.get(), user = snap.val();
    if (!user || user.email !== process.env.ADMIN_EMAIL.trim().toLowerCase() || user.emailVerified !== true) return json(res, 403, { error: 'FORBIDDEN' });
    const existing = await root.child('adminBootstrapUsed').get();
    if (existing.exists()) return json(res, 409, { error: 'BOOTSTRAP_ALREADY_USED' });
    await userRef.update({ role: 'admin', updatedAt: Date.now() });
    await root.child('adminBootstrapUsed').set(auth.uid);
    await root.child('adminAuditLogs').push({ actorId: auth.uid, action: 'initial_admin_bootstrap', createdAt: Date.now() });
    return json(res, 200, { ok: true, message: 'Administrator role enabled.' });
  } catch (error) { return safeError(res, error); }
}
