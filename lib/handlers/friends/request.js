import { json, method, requireOrigin, session, rootRef, safeError, consumeRateLimit, rateLimitKey } from '../../core.js';
import { sendGenericPush } from '../../push.js';
export default async function handler(req, res) {
  if (!method(req, res, ['POST']) || !requireOrigin(req, res)) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    if (!(await consumeRateLimit(rateLimitKey(req, 'friend-request:' + auth.uid), 20, 60 * 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    const username = String(req.body?.username || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(username) || username === auth.user.username.toLowerCase()) return json(res, 400, { error: 'INVALID_USERNAME' });
    const root = rootRef(), targetSnap = await root.child('usernames/' + username).get();
    const targetId = targetSnap.val(); if (!targetId) return json(res, 404, { error: 'USER_NOT_FOUND' });
    const target = await root.child('users/' + targetId).get(); if (!target.exists() || target.val().disabled) return json(res, 404, { error: 'USER_NOT_FOUND' });
    const [blockedByMe, blockedByThem, existingFriend] = await Promise.all([root.child('blocks/' + auth.uid + '/' + targetId).get(), root.child('blocks/' + targetId + '/' + auth.uid).get(), root.child('friends/' + auth.uid + '/' + targetId).get()]);
    if (blockedByMe.exists() || blockedByThem.exists()) return json(res, 403, { error: 'INTERACTION_BLOCKED' });
    if (existingFriend.exists()) return json(res, 409, { error: 'ALREADY_FRIENDS' });
    const key = [auth.uid, targetId].sort().join('_'), now = Date.now();
    const ref = root.child('friendRequests/' + key);
    let result;
    await ref.transaction(old => {
      if (old?.status === 'accepted' || old?.status === 'pending') { result = 'EXISTS'; return; }
      return { from: auth.uid, to: targetId, status: 'pending', createdAt: now, updatedAt: now };
    });
    if (result === 'EXISTS') return json(res, 409, { error: 'REQUEST_ALREADY_EXISTS' });
    await Promise.all([
      root.child('friendRequestsByUser/' + targetId + '/' + key).set({ from: auth.uid, createdAt: now }),
      root.child('friendRequestsSentByUser/' + auth.uid + '/' + key).set({ to: targetId, createdAt: now })
    ]);
    try { await sendGenericPush(targetId, { title: 'MS Chat', body: 'You have a new friend request.', url: '/', tag: 'mschat-friend-request' }, 'friend-request:' + key + ':' + now); } catch {}
    return json(res, 200, { ok: true, message: 'Friend request sent.' });
  } catch (error) { return safeError(res, error); }
}
