import { json, method, requireOrigin, session, rootRef, safeError, consumeRateLimit, rateLimitKey } from '../../core.js';
export default async function handler(req, res) {
  if (!method(req, res, ['GET', 'POST']) || (req.method === 'POST' && !requireOrigin(req, res))) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const root = rootRef();
    if (req.method === 'POST') {
      if (!(await consumeRateLimit(rateLimitKey(req, 'complaint:' + auth.uid), 5, 60 * 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
      const subject = String(req.body?.subject || '').trim();
      const description = String(req.body?.description || '').trim();
      if (subject.length < 4 || subject.length > 120 || description.length < 10 || description.length > 3000) return json(res, 400, { error: 'INVALID_COMPLAINT' });
      const ref = root.child('complaints').push();
      await ref.set({ id: ref.key, userId: auth.uid, subject, description, status: 'open', createdAt: Date.now(), updatedAt: Date.now() });
      return json(res, 201, { ok: true, id: ref.key });
    }
    const snap = await root.child('complaints').orderByChild('userId').equalTo(auth.uid).limitToLast(50).get();
    return json(res, 200, { complaints: Object.values(snap.val() || {}).sort((a,b) => b.createdAt - a.createdAt) });
  } catch (error) { return safeError(res, error); }
}
