import { json } from '../lib/core.js';
import requestOtp from '../lib/handlers/auth/request-otp.js';
import register from '../lib/handlers/auth/register.js';
import login from '../lib/handlers/auth/login.js';
import me from '../lib/handlers/auth/me.js';
import logout from '../lib/handlers/auth/logout.js';
import friendRequest from '../lib/handlers/friends/request.js';
import friends from '../lib/handlers/friends/index.js';
import messages from '../lib/handlers/messages/index.js';
import receipt from '../lib/handlers/messages/receipt.js';
import keys from '../lib/handlers/keys/index.js';
import pushSubscribe from '../lib/handlers/push/subscribe.js';
import pushPublicKey from '../lib/handlers/push/public-key.js';
import complaints from '../lib/handlers/complaints/index.js';
import adminBootstrap from '../lib/handlers/admin/bootstrap.js';
import admin from '../lib/handlers/admin/index.js';
import cleanup from '../lib/handlers/cron/cleanup.js';
import uploadUrl from '../lib/handlers/attachments/upload-url.js';
import completeUpload from '../lib/handlers/attachments/complete.js';
import downloadUrl from '../lib/handlers/attachments/download-url.js';
import health from '../lib/handlers/health.js';

const routes = new Map([
  ['auth/request-otp', requestOtp],
  ['auth/register', register],
  ['auth/login', login],
  ['auth/me', me],
  ['auth/logout', logout],
  ['friends/request', friendRequest],
  ['friends', friends],
  ['messages', messages],
  ['messages/receipt', receipt],
  ['keys', keys],
  ['push/subscribe', pushSubscribe],
  ['push/public-key', pushPublicKey],
  ['complaints', complaints],
  ['admin/bootstrap', adminBootstrap],
  ['admin', admin],
  ['cron/cleanup', cleanup],
  ['attachments/upload-url', uploadUrl],
  ['attachments/complete', completeUpload],
  ['attachments/download-url', downloadUrl],
  ['health', health]
]);

function routeName(req) {
  let value = req.query?.route;
  if (Array.isArray(value)) value = value[0];
  if (!value) {
    const path = new URL(req.url || '/', 'http://localhost').pathname;
    value = path.replace(/^\/api\/?/, '');
  }
  try { value = decodeURIComponent(String(value)); } catch {}
  return value.replace(/^\/+|\/+$/g, '');
}

export default async function handler(req, res) {
  const route = routeName(req);
  const handler = routes.get(route);
  if (!handler) return json(res, 404, { error: 'NOT_FOUND' });
  return handler(req, res);
}
