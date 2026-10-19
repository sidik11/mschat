import { json, method, requireOrigin, rootRef, normalizeEmail, normalizeUsername, sha, hashPassword, validatePassword, issueSession, consumeRateLimit, rateLimitKey, safeError, publicUser } from '../_lib/core.js';

export default async function handler(req, res) {
  if (!method(req, res, ['POST']) || !requireOrigin(req, res)) return;
  let emailKey = '', usernameKey = '', uid = '';
  try {
    const fullName = String(req.body?.fullName || '').trim();
    const email = normalizeEmail(req.body?.email);
    const username = String(req.body?.username || '').trim();
    const normalizedUsername = normalizeUsername(username);
    const password = req.body?.password;
    const code = String(req.body?.code || '').trim();
    if (fullName.length < 2 || fullName.length > 80) return json(res, 400, { error: 'INVALID_NAME' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(res, 400, { error: 'INVALID_EMAIL' });
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) return json(res, 400, { error: 'INVALID_USERNAME' });
    if (!validatePassword(password)) return json(res, 400, { error: 'WEAK_PASSWORD', message: 'Use 12–128 characters for your password.' });
    if (!/^\d{6}$/.test(code)) return json(res, 400, { error: 'INVALID_CODE' });
    if (req.body?.ageConfirmed !== true) return json(res, 400, { error: 'AGE_CONFIRMATION_REQUIRED' });
    if (!(await consumeRateLimit(rateLimitKey(req, 'register:' + email), 5, 60 * 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    const root = rootRef(), otpRef = root.child('otps/' + sha(email));
    const otp = (await otpRef.get()).val();
    if (!otp || otp.email !== email || otp.consumed || otp.expiresAt <= Date.now() || otp.attempts >= 5) return json(res, 400, { error: 'OTP_EXPIRED_OR_MISSING', message: 'Request a new verification code.' });
    if (otp.codeHash !== sha(code)) {
      await otpRef.transaction(old => old && !old.consumed && old.expiresAt > Date.now() ? { ...old, attempts: (old.attempts || 0) + 1 } : old);
      return json(res, 400, { error: 'INVALID_CODE', message: 'The verification code is incorrect.' });
    }
    emailKey = sha(email);
    usernameKey = normalizedUsername;
    const userRef = root.child('users').push();
    uid = userRef.key;
    const emailReservation = await root.child('emails/' + emailKey).transaction(old => old == null ? uid : undefined);
    if (!emailReservation.committed) return json(res, 409, { error: 'EMAIL_ALREADY_REGISTERED' });
    const usernameReservation = await root.child('usernames/' + usernameKey).transaction(old => old == null ? uid : undefined);
    if (!usernameReservation.committed) {
      await root.child('emails/' + emailKey).remove();
      return json(res, 409, { error: 'USERNAME_TAKEN' });
    }
    const consumed = await otpRef.transaction(old => old && !old.consumed && old.expiresAt > Date.now() && old.codeHash === sha(code) && (old.attempts || 0) < 5 ? { ...old, consumed: true, consumedAt: Date.now() } : undefined);
    if (!consumed.committed) {
      await Promise.all([root.child('emails/' + emailKey).remove(), root.child('usernames/' + usernameKey).remove()]);
      return json(res, 400, { error: 'OTP_ALREADY_USED', message: 'Request a new verification code.' });
    }
    const now = Date.now();
    const user = { id: uid, fullName, email, username, normalizedUsername, passwordHash: await hashPassword(password), createdAt: now, updatedAt: now, disabled: false };
    await userRef.set(user);
    await issueSession(res, uid);
    return json(res, 201, { ok: true, user: publicUser(user) });
  } catch (error) {
    try {
      const root = rootRef();
      if (emailKey) await root.child('emails/' + emailKey).remove();
      if (usernameKey) await root.child('usernames/' + usernameKey).remove();
      if (uid) await root.child('users/' + uid).remove();
    } catch {}
    return safeError(res, error);
  }
}