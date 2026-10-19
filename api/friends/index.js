import { json, method, requireOrigin, session, rootRef, safeError } from '../_lib/core.js';
export default async function handler(req, res) {
  if (!method(req, res, ['GET', 'POST']) || (req.method === 'POST' && !requireOrigin(req, res))) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const root = rootRef();
    if (req.method === 'POST') {
      const key = String(req.body?.requestId || '');
      const snap = await root.child('friendRequests/' + key).get(), request = snap.val();
      if (!request || request.to !== auth.uid || request.status !== 'pending') return json(res, 404, { error: 'REQUEST_NOT_FOUND' });
      if (req.body?.action === 'reject') { await snap.ref.update({ status: 'rejected', updatedAt: Date.now() }); return json(res, 200, { ok: true }); }
      if (req.body?.action !== 'accept') return json(res, 400, { error: 'INVALID_ACTION' });
      const pair = [request.from, request.to].sort(), conversationId = pair.join('_');
      await root.child('friendRequests/' + key).update({ status: 'accepted', updatedAt: Date.now() });
      await root.child('friends/' + auth.uid + '/' + request.from).set({ since: Date.now(), conversationId });
      await root.child('friends/' + request.from + '/' + auth.uid).set({ since: Date.now(), conversationId });
      await root.child('conversations/' + conversationId + '/members').set({ [pair[0]]: true, [pair[1]]: true });
      return json(res, 200, { ok: true, conversationId });
    }
    const [friendsSnap, requestsSnap] = await Promise.all([root.child('friends/' + auth.uid).get(), root.child('friendRequests').get()]);
    const friends = [], incoming = [];
    const friendMap = friendsSnap.val() || {};
    for (const [uid, item] of Object.entries(friendMap)) {
      const u = (await root.child('users/' + uid).get()).val();
      if (u && !u.disabled) friends.push({ ...{ id: uid, fullName: u.fullName, username: u.username, avatarUrl: u.avatarUrl || null }, conversationId: item.conversationId });
    }
    for (const [id, req] of Object.entries(requestsSnap.val() || {})) if (req.to === auth.uid && req.status === 'pending') {
      const u = (await root.child('users/' + req.from).get()).val();
      if (u) incoming.push({ requestId: id, user: { id: req.from, fullName: u.fullName, username: u.username } });
    }
    return json(res, 200, { friends, incoming });
  } catch (error) { return safeError(res, error); }
}
