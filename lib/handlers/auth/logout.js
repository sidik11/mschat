import { json, method, requireOrigin, revokeSession, clearSessionCookie, session, rootRef, safeError } from '../../core.js';
export default async function handler(req, res) {
  if (!method(req, res, ['POST']) || !requireOrigin(req, res)) return;
  try {
    const auth = await session(req).catch(() => null);
    await revokeSession(req);
    if (auth) await rootRef().child('presence/' + auth.uid).set({ status: 'offline', lastSeenAt: Date.now() });
    clearSessionCookie(res);
    return json(res, 200, { ok: true });
  }
  catch (error) { clearSessionCookie(res); return safeError(res, error); }
}
