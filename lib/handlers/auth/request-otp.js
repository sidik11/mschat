import { randomInt } from 'node:crypto';
import { json, method, requireOrigin, rootRef, normalizeEmail, sha, otpDigest, consumeRateLimit, rateLimitKey, sendOtpEmail, safeError } from '../../core.js';

export default async function handler(req, res) {
  if (!method(req, res, ['POST']) || !requireOrigin(req, res)) return;
  try {
    const email = normalizeEmail(req.body?.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(res, 400, { error: 'INVALID_EMAIL' });
    if (!(await consumeRateLimit(rateLimitKey(req, 'otp-ip'), 10, 15 * 60 * 1000)) || !(await consumeRateLimit(rateLimitKey(req, 'otp:' + email), 3, 15 * 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    const key = sha(email), ref = rootRef().child('otps/' + key), existing = (await ref.get()).val();
    if (existing?.lastSentAt && Date.now() - existing.lastSentAt < 60 * 1000) return json(res, 429, { error: 'RESEND_COOLDOWN' });
    const code = String(randomInt(0, 1000000)).padStart(6, '0'), now = Date.now(), codeHash = otpDigest(code);
    await ref.set({ email, purpose: 'registration', codeHash, createdAt: now, lastSentAt: now, expiresAt: now + 5 * 60 * 1000, attempts: 0, consumed: false });
    try { await sendOtpEmail(email, code); } catch (error) { await ref.remove(); throw error; }
    return json(res, 200, { ok: true, message: 'If this address can receive verification email, a code has been sent. It expires in 5 minutes.' });
  } catch (error) { return safeError(res, error); }
}
