import { json, method, requireOrigin, session, rootRef, safeError, consumeRateLimit, rateLimitKey, sha } from '../core.js';
export default async function handler(req, res) {
  if (!method(req, res, ['DELETE']) || !requireOrigin(req, res)) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    if (!(await consumeRateLimit(rateLimitKey(req, 'account-delete:' + auth.uid), 2, 24 * 60 * 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    const confirmation = String(req.body?.confirmation || '');
    if (confirmation !== auth.user.username) return json(res, 400, { error: 'CONFIRMATION_REQUIRED' });
    const root = rootRef(), userRef = root.child('users/' + auth.uid), user = (await userRef.get()).val();
    if (!user || user.deletionRequestedAt) return json(res, 409, { error: 'DELETION_ALREADY_REQUESTED' });
    const now = Date.now();
    await userRef.update({ disabled: true, deletionRequestedAt: now, deletionStatus: 'pending', updatedAt: now });
    const sessions = await root.child('sessionIndex/' + auth.uid).get(), removals = [];
    sessions.forEach(child => { removals.push(Promise.all([root.child('sessions/' + child.key).remove(), child.ref.remove()])); });
    await root.child('pushSubscriptions/' + auth.uid).remove();
    await root.child('presence/' + auth.uid).set({ status: 'offline', lastSeenAt: now });
    await root.child('accountDeletionRequests/' + auth.uid).set({ uid: auth.uid, usernameKey: user.username, emailKey: user.email, requestedAt: now, status: 'pending' });
    await Promise.all(removals);
    res.setHeader('Set-Cookie', 'mschat_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + (process.env.NODE_ENV === 'production' ? '; Secure' : ''));
    await root.child('securityEvents').push({ type: 'account_deletion_requested', actorId: auth.uid, createdAt: now });
    return json(res, 202, { ok: true, status: 'pending', message: 'Account access is disabled. Data cleanup is pending and must complete before deletion can be considered finished.' });
  } catch (error) { return safeError(res, error); }
}
