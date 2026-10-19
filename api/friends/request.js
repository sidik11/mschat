import { json, method, requireOrigin, session, rootRef, safeError } from '../../lib/core.js';
export default async function handler(req, res) {
  if (!method(req, res, ['POST']) || !requireOrigin(req, res)) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const username = String(req.body?.username || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(username) || username === auth.user.username.toLowerCase()) return json(res, 400, { error: 'INVALID_USERNAME' });
    const root = rootRef(), targetSnap = await root.child('usernames/' + username).get();
    const targetId = targetSnap.val(); if (!targetId) return json(res, 404, { error: 'USER_NOT_FOUND' });
    const target = await root.child('users/' + targetId).get(); if (!target.exists() || target.val().disabled) return json(res, 404, { error: 'USER_NOT_FOUND' });
    const key = [auth.uid, targetId].sort().join('_');
    await root.child('friendRequests/' + key).transaction(old => old?.status === 'accepted' ? old : ({ from: auth.uid, to: targetId, status: 'pending', createdAt: Date.now() }));
    return json(res, 200, { ok: true, message: 'Friend request sent.' });
  } catch (error) { return safeError(res, error); }
}
