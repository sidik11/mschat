import { json, method, requireOrigin, revokeSession, clearSessionCookie, session, rootRef, safeError } from '../../core.js';
export default async function handler(req, res) {
  if (!method(req, res, ['POST']) || !requireOrigin(req, res)) return;
  try {
    const auth = await session(req).catch(() => null);
    await revokeSession(req);
    if (auth) {
      const presence = rootRef().child('presence/' + auth.uid);
      await presence.child('sessions/' + auth.sessionHash).remove();
      const sessions = (await presence.child('sessions').get()).val() || {};
      const active = Object.values(sessions).filter(s => s?.expiresAt > Date.now());
      await presence.update({ status: active.length ? 'online' : 'offline', lastSeenAt: active.length ? Math.max(...active.map(s => s.lastSeenAt || 0)) : Date.now() });
    }
    clearSessionCookie(res);
    return json(res, 200, { ok: true });
  }
  catch (error) { clearSessionCookie(res); return safeError(res, error); }
}
