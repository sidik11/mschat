import { json, method, requireOrigin, revokeSession, clearSessionCookie, safeError } from '../../core.js';
export default async function handler(req, res) {
  if (!method(req, res, ['POST']) || !requireOrigin(req, res)) return;
  try { await revokeSession(req); clearSessionCookie(res); return json(res, 200, { ok: true }); }
  catch (error) { clearSessionCookie(res); return safeError(res, error); }
}
