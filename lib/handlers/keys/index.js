import { json, method, requireOrigin, session, rootRef, safeError } from '../../core.js';
const validJwk = key => key && key.kty === 'EC' && key.crv === 'P-256' && typeof key.x === 'string' && typeof key.y === 'string' && key.x.length <= 100 && key.y.length <= 100;

export default async function handler(req, res) {
  if (!method(req, res, ['GET', 'POST']) || (req.method === 'POST' && !requireOrigin(req, res))) return;
  try {
    const auth = await session(req);
    if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const root = rootRef();
    if (req.method === 'POST') {
      const publicKey = req.body?.publicKey;
      if (!validJwk(publicKey)) return json(res, 400, { error: 'INVALID_PUBLIC_KEY' });
      await root.child('users/' + auth.uid + '/publicKey').set(publicKey);
      return json(res, 200, { ok: true });
    }
    const username = String(req.query?.username || '').trim().toLowerCase();
    if (!username) {
      const snap = await root.child('users/' + auth.uid + '/publicKey').get();
      return json(res, 200, { publicKey: snap.val() || null });
    }
    const uidSnap = await root.child('usernames/' + username).get();
    const otherUid = uidSnap.val();
    if (!otherUid) return json(res, 404, { error: 'USER_NOT_FOUND' });
    const isFriend = await root.child('friends/' + auth.uid + '/' + otherUid).get();
    if (!isFriend.exists()) return json(res, 403, { error: 'FRIENDSHIP_REQUIRED' });
    const keySnap = await root.child('users/' + otherUid + '/publicKey').get();
    return json(res, 200, { publicKey: keySnap.val() || null });
  } catch (error) { return safeError(res, error); }
}
