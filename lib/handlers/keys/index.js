import { json, method, requireOrigin, session, rootRef, safeError } from '../../core.js';
const validJwk = key => key && typeof key === 'object' && key.kty === 'EC' && key.crv === 'P-256' && typeof key.x === 'string' && typeof key.y === 'string' && /^[A-Za-z0-9_-]{43}$/.test(key.x) && /^[A-Za-z0-9_-]{43}$/.test(key.y) && !Object.prototype.hasOwnProperty.call(key, 'd');

export default async function handler(req, res) {
  if (!method(req, res, ['GET', 'POST']) || (req.method === 'POST' && !requireOrigin(req, res))) return;
  try {
    const auth = await session(req);
    if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const root = rootRef();
    if (req.method === 'POST') {
      const publicKey = req.body?.publicKey;
      if (!validJwk(publicKey)) return json(res, 400, { error: 'INVALID_PUBLIC_KEY' });
      const safePublicKey = { kty: 'EC', crv: 'P-256', x: publicKey.x, y: publicKey.y, ext: true, key_ops: [] };
      await root.child('users/' + auth.uid + '/publicKey').set(safePublicKey);
      return json(res, 200, { ok: true });
    }
    const username = String(req.query?.username || '').trim().toLowerCase();
    if (!username) {
      const snap = await root.child('users/' + auth.uid + '/publicKey').get();
      return json(res, 200, { publicKey: snap.val() || null });
    }
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return json(res, 400, { error: 'INVALID_USERNAME' });
    const uidSnap = await root.child('usernames/' + username).get();
    const otherUid = uidSnap.val();
    if (!otherUid) return json(res, 404, { error: 'USER_NOT_FOUND' });
    const isFriend = await root.child('friends/' + auth.uid + '/' + otherUid).get();
    if (!isFriend.exists()) return json(res, 403, { error: 'FRIENDSHIP_REQUIRED' });
    const keySnap = await root.child('users/' + otherUid + '/publicKey').get();
    return json(res, 200, { publicKey: keySnap.val() || null });
  } catch (error) { return safeError(res, error); }
}
