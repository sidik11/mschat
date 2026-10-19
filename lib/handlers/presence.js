import { json, method, requireOrigin, session, rootRef, safeError, consumeRateLimit, rateLimitKey } from '../core.js';
export default async function handler(req, res) {
  if (!method(req, res, ['POST']) || !requireOrigin(req, res)) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    if (!(await consumeRateLimit(rateLimitKey(req, 'presence:' + auth.uid), 8, 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    const now = Date.now();
    await rootRef().child('presence/' + auth.uid).set({ lastSeenAt: now, status: 'online' });
    return json(res, 200, { ok: true, lastSeenAt: now });
  } catch (error) { return safeError(res, error); }
}
