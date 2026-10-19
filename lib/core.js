import { randomBytes, createHash, createHmac, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { google } from 'googleapis';

const scrypt = promisify(scryptCb);
const ROOT = 'mschat';
const SESSION_COOKIE = 'mschat_session';
const requestedSessionSeconds = Number(process.env.SESSION_TTL_SECONDS || 2592000);
const SESSION_SECONDS = Number.isFinite(requestedSessionSeconds) ? Math.min(Math.max(requestedSessionSeconds, 3600), 2592000) : 2592000;

export function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}
export function method(req, res, allowed) {
  if (!allowed.includes(req.method)) {
    res.setHeader('Allow', allowed.join(', '));
    json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    return false;
  }
  return true;
}
export function checkOrigin(req) {
  const origin = req.headers.origin;
  const allowed = (process.env.ALLOWED_ORIGINS || process.env.APP_BASE_URL || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return false;
  const fetchSite = req.headers['sec-fetch-site'];
  return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none';
}
export function requireOrigin(req, res) {
  if (!checkOrigin(req)) { json(res, 403, { error: 'ORIGIN_REJECTED' }); return false; }
  return true;
}
export function database() {
  if (!process.env.FIREBASE_DATABASE_URL || !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    const e = new Error('Firebase Admin environment is not configured'); e.code = 'CONFIG_MISSING'; throw e;
  }
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    }), databaseURL: process.env.FIREBASE_DATABASE_URL });
  }
  return getDatabase();
}
export const rootRef = () => database().ref(ROOT);
export const sha = value => createHash('sha256').update(value).digest('hex');
export function otpDigest(value) {
  const secret = process.env.OTP_HMAC_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) { const e = new Error('OTP_HMAC_SECRET must contain at least 32 bytes'); e.code = 'CONFIG_MISSING'; throw e; }
  return createHmac('sha256', secret).update(String(value)).digest('hex');
}
export const normalizeEmail = value => String(value || '').trim().toLowerCase();
export const normalizeUsername = value => String(value || '').trim().toLowerCase();
export function randomToken(bytes = 32) { return randomBytes(bytes).toString('base64url'); }
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}
export async function verifyPassword(password, stored) {
  try {
    const [kind, saltText, hashText] = String(stored).split('$');
    if (kind !== 'scrypt' || !saltText || !hashText) return false;
    const expected = Buffer.from(hashText, 'base64url');
    const actual = Buffer.from(await scrypt(password, Buffer.from(saltText, 'base64url'), expected.length, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}
function cookieOptions(maxAge) {
  const secure = process.env.NODE_ENV === 'production';
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
export function clearSessionCookie(res) { res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; ${cookieOptions(0)}`); }
function readCookie(req, name) {
  const raw = String(req.headers.cookie || '');
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return ''; }
    }
  }
  return '';
}
export async function issueSession(res, uid) {
  const token = randomToken(32), tokenHash = sha(token), now = Date.now();
  const record = { uid, createdAt: now, expiresAt: now + SESSION_SECONDS * 1000, lastSeenAt: now };
  await rootRef().child(`sessions/${tokenHash}`).set(record);
  await rootRef().child(`sessionIndex/${uid}/${tokenHash}`).set({ createdAt: now, expiresAt: record.expiresAt, lastSeenAt: now });
  return tokenHash;
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${cookieOptions(SESSION_SECONDS)}`);
}
export async function session(req) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token || token.length > 200) return null;
  const ref = rootRef().child(`sessions/${sha(token)}`);
  const snap = await ref.get();
  const data = snap.val();
  if (!data || !data.uid || data.expiresAt <= Date.now()) {
    if (data) { await ref.remove(); await rootRef().child(`sessionIndex/${data.uid}/${sha(token)}`).remove(); }
    return null;
  }
  if (Date.now() - Number(data.lastSeenAt || 0) > 5 * 60 * 1000) {
    const now = Date.now();
    await ref.update({ lastSeenAt: now });
    await rootRef().child(`sessionIndex/${data.uid}/${sha(token)}`).update({ lastSeenAt: now });
  }
  const userSnap = await rootRef().child(`users/${data.uid}`).get();
  const user = userSnap.val();
  if (!user || user.disabled) return null;
  return { uid: data.uid, sessionHash: sha(token), user: publicUser(user) };
}
export function publicUser(user) {
  return { id: user.id, fullName: user.fullName, username: user.username, email: user.email, avatarUrl: user.avatarKey ? '/api/profile-image?userId=' + user.id : (user.avatarUrl || null), createdAt: user.createdAt };
}
export async function revokeSession(req) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) {
    const tokenHash = sha(token), root = rootRef(), ref = root.child(`sessions/${tokenHash}`), snap = await ref.get(), uid = snap.val()?.uid;
    await ref.remove();
    if (uid) await root.child(`sessionIndex/${uid}/${tokenHash}`).remove();
  }
}
export function rateLimitKey(req, suffix) {
  const forwarded = String(req.headers['x-real-ip'] || req.headers['x-vercel-forwarded-for'] || String(req.headers['x-forwarded-for'] || '').split(',').at(-1) || 'unknown').trim().slice(0, 64);
  return sha(`${forwarded || 'unknown'}:${suffix}`).slice(0, 48);
}
export async function consumeRateLimit(key, max, windowMs) {
  const ref = rootRef().child(`rateLimits/${key}`), now = Date.now();
  let allowed = false;
  await ref.transaction(old => {
    const state = old && old.resetAt > now ? old : { count: 0, resetAt: now + windowMs };
    if (state.count >= max) { allowed = false; return; }
    allowed = true; return { count: state.count + 1, resetAt: state.resetAt };
  });
  return allowed;
}
export async function sendOtpEmail(to, code) {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER_EMAIL } = process.env;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN || !GMAIL_SENDER_EMAIL) {
    const e = new Error('Gmail OAuth is not configured'); e.code = 'CONFIG_MISSING'; throw e;
  }
  const auth = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: 'v1', auth });
  const subject = 'Your MS Chat verification code';
  const body = `Your MS Chat verification code is ${code}. It expires in 5 minutes. If you did not request this, ignore this email.`;
  const mime = [
    `From: MS Chat <${GMAIL_SENDER_EMAIL}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body
  ].join('\r\n');
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw: Buffer.from(mime).toString('base64url') } });
}
export function safeError(res, error) {
  if (error?.code === 'CONFIG_MISSING') return json(res, 503, { error: 'SERVICE_NOT_CONFIGURED', message: error.message });
  return json(res, 500, { error: 'INTERNAL_ERROR', message: 'The request could not be completed.' });
}
export function validatePassword(password) {
  return typeof password === 'string' && password.length >= 12 && password.length <= 128 && !/[\u0000-\u001f\u007f]/.test(password);
}

export async function incrementCounter(name, delta = 1) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(name) || !Number.isSafeInteger(delta) || delta < 1) throw new Error('Invalid aggregate counter');
  const ref = rootRef().child('usageAggregates/counters/' + name), now = Date.now();
  await ref.transaction(old => old == null ? { value: delta, trackingStartedAt: now } : { ...old, value: (Number(old.value) || 0) + delta });
}
