import { randomInt } from 'node:crypto';
import { json, method, requireOrigin, rootRef, normalizeEmail, sha, consumeRateLimit, rateLimitKey, sendOtpEmail, safeError } from '../../core.js';

export default async function handler(req, res) {
  if (!method(req, res, ['POST']) || !requireOrigin(req, res)) return;
  try {
    const email = normalizeEmail(req.body?.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(res, 400, { error: 'INVALID_EMAIL' });
    if (!(await consumeRateLimit(rateLimitKey(req, 'otp:' + email), 3, 15 * 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const key = sha(email);
    await rootRef().child('otps/' + key).set({ email, codeHash: sha(code), expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0, consumed: false });
    await sendOtpEmail(email, code);
    return json(res, 200, { ok: true, message: 'If this address can receive verification email, a code has been sent. It expires in 10 minutes.' });
  } catch (error) { return safeError(res, error); }
}
