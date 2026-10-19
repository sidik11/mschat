import { json, method, requireOrigin, session, rootRef, safeError, sha } from '../_lib/core.js';
export default async function handler(req, res) {
  if (!method(req, res, ['POST', 'DELETE']) || !requireOrigin(req, res)) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const endpoint = String(req.body?.endpoint || '');
    if (endpoint.length < 20 || endpoint.length > 2048 || !endpoint.startsWith('https://')) return json(res, 400, { error: 'INVALID_SUBSCRIPTION' });
    const key = sha(endpoint);
    const ref = rootRef().child('pushSubscriptions/' + auth.uid + '/' + key);
    if (req.method === 'DELETE') { await ref.remove(); return json(res, 200, { ok: true }); }
    const subscription = req.body;
    if (!subscription.keys?.p256dh || !subscription.keys?.auth || subscription.keys.p256dh.length > 256 || subscription.keys.auth.length > 256) return json(res, 400, { error: 'INVALID_SUBSCRIPTION' });
    await ref.set({ endpoint, keys: subscription.keys, createdAt: Date.now() });
    return json(res, 201, { ok: true });
  } catch (error) { return safeError(res, error); }
}
