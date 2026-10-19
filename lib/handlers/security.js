import { json, method, requireOrigin, session, rootRef, safeError, verifyPassword, validatePassword, hashPassword, issueSession, consumeRateLimit, rateLimitKey } from '../core.js';
async function clearRevokedPresence(root, uid, revokedHashes) {
  if (!revokedHashes.length) return;
  const ref = root.child('presence/' + uid + '/sessions'), snap = await ref.get();
  const remove = Object.entries(snap.val() || {}).filter(([,record]) => revokedHashes.includes(record?.sessionHash)).map(([key]) => ref.child(key).remove());
  await Promise.all(remove);
}
export default async function handler(req, res) {
  if (!method(req, res, ['GET','POST']) || (req.method === 'POST' && !requireOrigin(req, res))) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const root = rootRef();
    if (req.method === 'GET') {
      const snap = await root.child('sessionIndex/' + auth.uid).get(), now = Date.now();
      const sessions = Object.entries(snap.val() || {}).filter(([,s]) => s?.expiresAt > now).map(([hash,s]) => ({ current: hash === auth.sessionHash, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, expiresAt: s.expiresAt }));
      return json(res, 200, { sessions });
    }
    if (!(await consumeRateLimit(rateLimitKey(req, 'security:' + auth.uid), 8, 60 * 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    const action = String(req.body?.action || '');
    if (action === 'revoke-others') {
      const ref = root.child('sessionIndex/' + auth.uid), snap = await ref.get(), removals = [], revokedHashes = Object.keys(snap.val() || {}).filter(hash => hash !== auth.sessionHash);
      for (const hash of revokedHashes) removals.push(Promise.all([root.child('sessions/' + hash).remove(), ref.child(hash).remove()]));
      await Promise.all(removals); await clearRevokedPresence(root, auth.uid, revokedHashes);
      await root.child('securityEvents').push({ actorId: auth.uid, action: 'revoke_other_sessions', createdAt: Date.now() });
      return json(res, 200, { ok: true, revoked: removals.length });
    }
    if (action === 'change-password') {
      const currentPassword = req.body?.currentPassword, newPassword = req.body?.newPassword;
      if (!validatePassword(newPassword)) return json(res, 400, { error: 'WEAK_PASSWORD' });
      const userRef = root.child('users/' + auth.uid), user = (await userRef.get()).val();
      if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) return json(res, 401, { error: 'INVALID_CREDENTIALS' });
      const passwordHash = await hashPassword(newPassword), now = Date.now();
      await userRef.update({ passwordHash, passwordChangedAt: now, updatedAt: now });
      const newHash = await issueSession(res, auth.uid), indexRef = root.child('sessionIndex/' + auth.uid), snap = await indexRef.get(), removals = [], revokedHashes = Object.keys(snap.val() || {}).filter(hash => hash !== newHash);
      for (const hash of revokedHashes) removals.push(Promise.all([root.child('sessions/' + hash).remove(), indexRef.child(hash).remove()]));
      await Promise.all(removals); await clearRevokedPresence(root, auth.uid, revokedHashes);
      await root.child('securityEvents').push({ actorId: auth.uid, action: 'password_changed', createdAt: now });
      return json(res, 200, { ok: true, message: 'Password changed. Other sessions were revoked.' });
    }
    return json(res, 400, { error: 'INVALID_ACTION' });
  } catch (error) { return safeError(res, error); }
}
