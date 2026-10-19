import { randomInt } from 'node:crypto';
import { sendOtpEmail } from '../../core.js';
import { json, method, requireOrigin, rootRef, normalizeEmail, normalizeUsername, sha, verifyPassword, issueSession, consumeRateLimit, rateLimitKey, safeError, publicUser, otpDigest, rootRef } from '../../core.js';
export default async function handler(req, res) {
  if (!method(req, res, ['POST']) || !requireOrigin(req, res)) return;
  try {
    const identity = String(req.body?.identity || req.body?.email || '').trim();
    const password = req.body?.password;
    if (!identity || identity.length > 254 || typeof password !== 'string' || password.length > 128) return json(res, 400, { error: 'INVALID_CREDENTIALS' });
    if (!(await consumeRateLimit(rateLimitKey(req, 'login:' + identity.toLowerCase()), 10, 15 * 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    const root = rootRef();
    const isEmail = identity.includes('@');
    const key = isEmail ? sha(normalizeEmail(identity)) : normalizeUsername(identity);
    const index = await root.child(isEmail ? 'emails/' + key : 'usernames/' + key).get();
    const uid = index.val();
    const userSnap = uid ? await root.child('users/' + uid).get() : null;
    const user = userSnap?.val();
    if (!user || user.disabled || !(await verifyPassword(password, user.passwordHash))) return json(res, 401, { error: 'INVALID_CREDENTIALS', message: 'Email/username or password is incorrect.' });
    if (user.role === 'admin') {
      const challengeRef = root.child('adminLoginChallenges/' + uid), existing = (await challengeRef.get()).val();
      if (existing?.expiresAt > Date.now() && existing.lastSentAt && Date.now() - existing.lastSentAt < 60 * 1000) return json(res, 202, { ok: true, requiresAdminOtp: true, message: 'Enter the administrator verification code sent to your email.' });
      const code = String(randomInt(0,1000000)).padStart(6,'0'), now = Date.now();
      await challengeRef.set({ uid, codeHash: otpDigest(code), purpose: 'admin-login', createdAt: now, lastSentAt: now, expiresAt: now + 5 * 60 * 1000, attempts: 0, consumed: false });
      try { await sendOtpEmail(user.email, code); } catch (error) { await challengeRef.remove(); throw error; }
      return json(res, 202, { ok: true, requiresAdminOtp: true, message: 'Enter the administrator verification code sent to your email.' });
    }
    await issueSession(res, uid);
    return json(res, 200, { ok: true, user: publicUser(user) });
  } catch (error) { return safeError(res, error); }
}