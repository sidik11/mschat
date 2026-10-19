import { json, method, requireOrigin, session, rootRef, safeError, consumeRateLimit, rateLimitKey } from '../core.js';
function validAdultDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  const today = new Date();
  let age = today.getUTCFullYear() - date.getUTCFullYear();
  if (today.getUTCMonth() < date.getUTCMonth() || (today.getUTCMonth() === date.getUTCMonth() && today.getUTCDate() < date.getUTCDate())) age--;
  return age >= 18 && date.getTime() < Date.now();
}
export default async function handler(req, res) {
  if (!method(req, res, ['GET', 'POST']) || (req.method === 'POST' && !requireOrigin(req, res))) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const ref = rootRef().child('users/' + auth.uid);
    if (req.method === 'GET') {
      const snap = await ref.get(), u = snap.val() || {};
      return json(res, 200, { profile: { id: auth.uid, fullName: u.fullName, username: u.username, email: u.email, emailVerified: Boolean(u.emailVerified), avatarUrl: u.avatarKey ? '/api/profile-image?userId=' + u.id : (u.avatarUrl || null), bio: u.bio || '', dateOfBirth: u.dateOfBirth || null, createdAt: u.createdAt } });
    }
    if (!(await consumeRateLimit(rateLimitKey(req, 'profile-update:' + auth.uid), 10, 60 * 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    const body = req.body || {}, update = { updatedAt: Date.now() };
    if (body.fullName !== undefined) {
      const value = String(body.fullName).trim();
      if (value.length < 2 || value.length > 80 || /[\u0000-\u001f\u007f]/.test(value)) return json(res, 400, { error: 'INVALID_NAME' });
      update.fullName = value;
    }
    if (body.bio !== undefined) {
      const value = String(body.bio).trim();
      if (value.length > 280 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return json(res, 400, { error: 'INVALID_BIO' });
      update.bio = value;
    }
    if (body.dateOfBirth !== undefined) {
      if (!validAdultDate(body.dateOfBirth)) return json(res, 400, { error: 'AGE_REQUIREMENT_NOT_MET' });
      update.dateOfBirth = body.dateOfBirth;
      update.ageVerifiedAt = Date.now();
    }
    if (body.avatarUrl !== undefined) return json(res, 400, { error: 'USE_PROFILE_IMAGE_UPLOAD' });
    await ref.update(update);
    const latest = (await ref.get()).val();
    return json(res, 200, { profile: { id: auth.uid, fullName: latest.fullName, username: latest.username, email: latest.email, emailVerified: Boolean(latest.emailVerified), avatarUrl: latest.avatarUrl || null, bio: latest.bio || '', dateOfBirth: latest.dateOfBirth || null, createdAt: latest.createdAt } });
  } catch (error) { return safeError(res, error); }
}
