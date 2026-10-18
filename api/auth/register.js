import { createHash, randomInt, randomBytes, timingSafeEqual } from 'node:crypto';
import { google } from 'googleapis';
import { getDatabase } from '../../server/firebase.js';

const json = (res, status, body) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
};
const normalizeEmail = value => String(value || '').trim().toLowerCase();
const normalizeUsername = value => String(value || '').trim().toLowerCase();
const digestOtp = (otp, secret) => createHash('sha256').update(secret + ':' + otp).digest('hex');
function htmlEscape(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
async function sendOtp(email, otp) {
  const oauth = new google.auth.OAuth2(process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET);
  oauth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: 'v1', auth: oauth });
  const subject = 'Your MS Chat verification code';
  const body = 'Your MS Chat code is ' + otp + '. It expires in 5 minutes. If you did not request this, ignore this email.';
  const raw = [
    'From: MS Chat <' + process.env.GMAIL_SENDER_EMAIL + '>',
    'To: ' + email,
    'Subject: ' + subject,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body
  ].join('\r\n');
  const encoded = Buffer.from(raw).toString('base64url');
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
}
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: 'METHOD_NOT_ALLOWED' }); }
  const origin = req.headers.origin;
  const allowed = String(process.env.ALLOWED_ORIGINS || process.env.APP_BASE_URL || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return json(res, 403, { error: 'ORIGIN_NOT_ALLOWED' });
  const email = normalizeEmail(req.body?.email);
  const username = normalizeUsername(req.body?.username);
  const fullName = String(req.body?.fullName || '').trim();
  const password = String(req.body?.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(res, 400, { error: 'INVALID_INPUT', message: 'Enter a valid email address.' });
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return json(res, 400, { error: 'INVALID_INPUT', message: 'Username must be 3–24 letters, numbers, or underscores.' });
  if (fullName.length < 1 || fullName.length > 80 || password.length < 12 || password.length > 128 || req.body?.ageConfirmed !== true) return json(res, 400, { error: 'INVALID_INPUT', message: 'Check your details and confirm you are at least 18.' });
  if (!process.env.SESSION_SECRET || Buffer.byteLength(process.env.SESSION_SECRET) < 32) return json(res, 503, { error: 'SERVICE_NOT_CONFIGURED', message: 'Account registration is not configured yet.' });
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN || !process.env.GMAIL_SENDER_EMAIL) return json(res, 503, { error: 'EMAIL_NOT_CONFIGURED', message: 'Email verification is not configured yet.' });
  try {
    const db = getDatabase();
    const [emailIndex, usernameIndex] = await Promise.all([
      db.ref('mschat/emailIndex/' + createHash('sha256').update(email).digest('hex')).get(),
      db.ref('mschat/usernameIndex/' + username).get()
    ]);
    if (emailIndex.exists() || usernameIndex.exists()) return json(res, 409, { error: 'ACCOUNT_EXISTS', message: 'An account with these details already exists or the username is unavailable.' });
    const now = Date.now();
    const otp = String(randomInt(0, 1000000)).padStart(6, '0');
    const challengeId = randomBytes(24).toString('hex');
    const secret = process.env.SESSION_SECRET;
    const challengeRef = db.ref('mschat/registrationChallenges/' + challengeId);
    const result = await challengeRef.transaction(current => current || {
      email, username, fullName, passwordHash: null,
      // Password is intentionally not stored in a pending challenge. Complete secure password hashing before enabling account creation.
      otpDigest: digestOtp(otp, secret), createdAt: now, expiresAt: now + 300000, attempts: 0, consumed: false
    }, undefined, false);
    if (!result.committed) return json(res, 429, { error: 'CHALLENGE_CONFLICT', message: 'Please retry registration.' });
    try { await sendOtp(email, otp); }
    catch (e) {
      await challengeRef.remove();
      console.error('MS Chat OTP delivery failed', { code: e?.code || 'GMAIL_ERROR' });
      return json(res, 503, { error: 'EMAIL_DELIVERY_FAILED', message: 'Could not send a verification email. Check the address or try later.' });
    }
    return json(res, 202, { message: 'Verification code sent if the request is eligible. OTP verification and account creation are not yet enabled in this foundation build.' });
  } catch (e) {
    console.error('MS Chat registration challenge failed', { code: e?.code || 'INTERNAL_ERROR' });
    return json(res, 503, { error: 'SERVICE_UNAVAILABLE', message: 'Registration is temporarily unavailable.' });
  }
}