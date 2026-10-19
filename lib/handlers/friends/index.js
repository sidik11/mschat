import { json, method, requireOrigin, session, rootRef, safeError, consumeRateLimit, rateLimitKey, incrementCounter } from '../../core.js';
import { sendGenericPush } from '../../push.js';
export default async function handler(req, res) {
  if (!method(req, res, ['GET', 'POST']) || (req.method === 'POST' && !requireOrigin(req, res))) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const root = rootRef();
    if (req.method === 'GET' && !(await consumeRateLimit(rateLimitKey(req, 'friends-read:' + auth.uid), 30, 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    if (req.method === 'POST') {
      const action = String(req.body?.action || '');
      if (action === 'remove-friend') {
        const targetId = String(req.body?.userId || '');
        if (!/^[A-Za-z0-9_-]{20}$/.test(targetId) || targetId === auth.uid) return json(res, 400, { error: 'INVALID_USER' });
        await Promise.all([root.child('friends/' + auth.uid + '/' + targetId).remove(), root.child('friends/' + targetId + '/' + auth.uid).remove()]);
        return json(res, 200, { ok: true });
      }
      const key = String(req.body?.requestId || '');
      if (!/^[A-Za-z0-9_-]{41}$/.test(key)) return json(res, 400, { error: 'INVALID_REQUEST_ID' });
      const snap = await root.child('friendRequests/' + key).get(), request = snap.val();
      if (!request || request.to !== auth.uid || request.status !== 'pending') return json(res, 404, { error: 'REQUEST_NOT_FOUND' });
      if (action === 'cancel') {
        if (request.from !== auth.uid) return json(res, 403, { error: 'FORBIDDEN' });
        await snap.ref.update({ status: 'cancelled', updatedAt: Date.now() });
        await root.child('friendRequestsByUser/' + request.to + '/' + key).remove();
        return json(res, 200, { ok: true });
      }
      if (action === 'reject') { await snap.ref.update({ status: 'rejected', updatedAt: Date.now() }); await root.child('friendRequestsByUser/' + auth.uid + '/' + key).remove(); return json(res, 200, { ok: true }); }
      if (action !== 'accept') return json(res, 400, { error: 'INVALID_ACTION' });
      const [blockedA, blockedB] = await Promise.all([root.child('blocks/' + request.from + '/' + request.to).get(), root.child('blocks/' + request.to + '/' + request.from).get()]);
      if (blockedA.exists() || blockedB.exists()) return json(res, 403, { error: 'INTERACTION_BLOCKED' });
      const pair = [request.from, request.to].sort(), conversationId = pair.join('_');
      const acceptedAt = Date.now();
      const acceptance = await root.child('friendRequests/' + key).transaction(old => old && old.to === auth.uid && old.status === 'pending' ? { ...old, status: 'accepted', updatedAt: acceptedAt } : undefined);
      if (!acceptance.committed) return json(res, 409, { error: 'REQUEST_ALREADY_PROCESSED' });
      await root.child('friendRequestsByUser/' + auth.uid + '/' + key).remove();
      await root.child('friends/' + auth.uid + '/' + request.from).set({ since: Date.now(), conversationId });
      await root.child('friends/' + request.from + '/' + auth.uid).set({ since: Date.now(), conversationId });
      await root.child('conversations/' + conversationId + '/members').set({ [pair[0]]: true, [pair[1]]: true });
      try { await incrementCounter('conversations'); } catch {}
      try { await sendGenericPush(request.from, { title: 'MS Chat', body: 'Your friend request was accepted.', url: '/', tag: 'mschat-friend-accepted' }, 'friend-accepted:' + key); } catch {}
      return json(res, 200, { ok: true, conversationId });
    }
    const [friendsSnap, requestsSnap] = await Promise.all([root.child('friends/' + auth.uid).get(), root.child('friendRequestsByUser/' + auth.uid).get()]);
    const friends = [], incoming = [];
    const friendMap = friendsSnap.val() || {};
    for (const [uid, item] of Object.entries(friendMap)) {
      const [userSnap, presenceSnap, settingsSnap, blockedSnap] = await Promise.all([root.child('users/' + uid).get(), root.child('presence/' + uid).get(), root.child('users/' + uid + '/settings').get(), root.child('blocks/' + uid + '/' + auth.uid).get()]);
      const u = userSnap.val(), presence = presenceSnap.val() || {}, privacy = settingsSnap.val() || {};
      const activePresence = Object.values(presence.sessions || {}).filter(s => s?.expiresAt > Date.now());
      const isOnline = activePresence.length > 0 && privacy.onlineVisibility !== 'nobody' && !blockedSnap.exists();
      const lastSeenAt = privacy.lastSeenVisibility === 'nobody' || blockedSnap.exists() ? null : Math.max(0, ...activePresence.map(s => s.lastSeenAt || 0), Number(presence.lastSeenAt || 0));
      if (u && !u.disabled && !blockedSnap.exists()) friends.push({ id: uid, fullName: u.fullName, username: u.username, avatarUrl: u.avatarKey ? '/api/profile-image?userId=' + u.id : (u.avatarUrl || null), online: isOnline, lastSeenAt, conversationId: item.conversationId });
    }
    for (const [id, indexed] of Object.entries(requestsSnap.val() || {})) {
      const req = (await root.child('friendRequests/' + id).get()).val();
      if (!req || req.to !== auth.uid || req.status !== 'pending') continue;
      const u = (await root.child('users/' + req.from).get()).val();
      if (u && !u.disabled) incoming.push({ requestId: id, user: { id: req.from, fullName: u.fullName, username: u.username } });
    }
    return json(res, 200, { friends, incoming });
  } catch (error) { return safeError(res, error); }
}
