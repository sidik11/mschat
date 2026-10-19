import { json, method, requireOrigin, rootRef, normalizeEmail, normalizeUsername, sha, otpDigest, hashPassword, validatePassword, issueSession, consumeRateLimit, rateLimitKey, safeError, publicUser } from '../../core.js';

export default async function handler(req, res) {
  if (!method(req, res, ['POST']) || !requireOrigin(req, res)) return;
  let emailKey = '', usernameKey = '', uid = '', emailReserved = false, usernameReserved = false;
  try {
    const fullName = String(req.body?.fullName || '').trim();
    const email = normalizeEmail(req.body?.email);
    const username = String(req.body?.username || '').trim();
    const normalizedUsername = normalizeUsername(username);
    const password = req.body?.password;
    const code = String(req.body?.code || '').trim();
    if (fullName.length < 2 || fullName.length > 80 || /[\u0000-\u001f\u007f]/.test(fullName)) return json(res, 400, { error: 'INVALID_NAME' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(res, 400, { error: 'INVALID_EMAIL' });
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) return json(res, 400, { error: 'INVALID_USERNAME' });
    if (!validatePassword(password)) return json(res, 400, { error: 'WEAK_PASSWORD', message: 'Use 12–128 characters for your password.' });
    if (!/^\d{6}$/.test(code)) return json(res, 400, { error: 'INVALID_CODE' });
    const dateOfBirth = String(req.body?.dateOfBirth || '');
    const dob = /^\\d{4}-\\d{2}-\\d{2}$/.test(dateOfBirth) ? new Date(dateOfBirth + 'T00:00:00.000Z') : null;
    if (!dob || Number.isNaN(dob.getTime()) || dob.toISOString().slice(0,10) !== dateOfBirth) return json(res, 400, { error: 'DATE_OF_BIRTH_REQUIRED' });
    const today = new Date(); let age = today.getUTCFullYear() - dob.getUTCFullYear();
    if (today.getUTCMonth() < dob.getUTCMonth() || (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() < dob.getUTCDate())) age--;
    if (age < 18 || dob.getTime() >= Date.now() || req.body?.ageConfirmed !== true) return json(res, 400, { error: 'AGE_REQUIREMENT_NOT_MET' });
    if (!(await consumeRateLimit(rateLimitKey(req, 'register:' + email), 5, 60 * 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    const root = rootRef(), otpRef = root.child('otps/' + sha(email));
    const otp = (await otpRef.get()).val();
    if (!otp || otp.email !== email || otp.purpose !== 'registration' || otp.consumed || otp.expiresAt <= Date.now() || otp.attempts >= 5) return json(res, 400, { error: 'OTP_EXPIRED_OR_MISSING', message: 'Request a new verification code.' });
    if (otp.codeHash !== otpDigest(code)) {
      await otpRef.transaction(old => old && !old.consumed && old.expiresAt > Date.now() ? { ...old, attempts: (old.attempts || 0) + 1 } : old);
      return json(res, 400, { error: 'INVALID_CODE', message: 'The verification code is incorrect.' });
    }
    emailKey = sha(email);
    usernameKey = normalizedUsername;
    const userRef = root.child('users').push();
    uid = userRef.key;
    const emailReservation = await root.child('emails/' + emailKey).transaction(old => old == null ? uid : undefined);
    if (!emailReservation.committed) return json(res, 409, { error: 'EMAIL_ALREADY_REGISTERED' });
    emailReserved = true;
    const usernameReservation = await root.child('usernames/' + usernameKey).transaction(old => old == null ? uid : undefined);
    if (!usernameReservation.committed) {
      await root.child('emails/' + emailKey).remove();
      emailReserved = false;
      return json(res, 409, { error: 'USERNAME_TAKEN' });
    }
    usernameReserved = true;
    const consumed = await otpRef.transaction(old => old && !old.consumed && old.expiresAt > Date.now() && old.codeHash === otpDigest(code) && (old.attempts || 0) < 5 ? { ...old, consumed: true, consumedAt: Date.now() } : undefined);
    if (!consumed.committed) {
      await Promise.all([root.child('emails/' + emailKey).remove(), root.child('usernames/' + usernameKey).remove()]);
      emailReserved = false; usernameReserved = false;
      return json(res, 400, { error: 'OTP_ALREADY_USED', message: 'Request a new verification code.' });
    }
    const now = Date.now();
    const user = { id: uid, fullName, email, username, normalizedUsername, dateOfBirth, ageVerifiedAt: now, passwordHash: await hashPassword(password), createdAt: now, updatedAt: now, emailVerified: true, role: 'user', disabled: false };
    await userRef.set(user);
    await issueSession(res, uid);
    return json(res, 201, { ok: true, user: publicUser(user) });
  } catch (error) {
    try {
      const root = rootRef();
      if (emailReserved && emailKey) await root.child('emails/' + emailKey).remove();
      if (usernameReserved && usernameKey) await root.child('usernames/' + usernameKey).remove();
      if (uid) await root.child('users/' + uid).remove();
    } catch {}
    return safeError(res, error);
  }
}