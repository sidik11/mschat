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
import presence from '../lib/handlers/presence.js';
import typing from '../lib/handlers/typing.js';
import profile from '../lib/handlers/profile.js';
import users from '../lib/handlers/users.js';
import settings from '../lib/handlers/settings.js';
import blocks from '../lib/handlers/blocks.js';
import reports from '../lib/handlers/reports.js';
import account from '../lib/handlers/account.js';
import deleteMessage from '../lib/handlers/messages/delete.js';
import conversations from '../lib/handlers/conversations.js';
import security from '../lib/handlers/security.js';

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
  ['health', health],
  ['presence', presence],
  ['typing', typing],
  ['profile', profile],
  ['users', users],
  ['settings', settings],
  ['blocks', blocks],
  ['reports', reports],
  ['account', account],
  ['messages/delete', deleteMessage],
  ['conversations', conversations],
  ['security', security]
]);

function routeName(req) {
  const path = new URL(req.url || '/', 'http://localhost').pathname;
  let directRoute = path.startsWith('/api/') ? path.slice(5) : '';
  while (directRoute.startsWith('/')) directRoute = directRoute.slice(1);
  while (directRoute.endsWith('/')) directRoute = directRoute.slice(0, -1);
  if (directRoute && directRoute !== 'index') return directRoute;
  let value = req.query?.route;
  if (Array.isArray(value)) value = value[0];
  if (!value) value = directRoute;
  try { value = decodeURIComponent(String(value || '')); } catch {}
  value = String(value || '');
  while (value.startsWith('/')) value = value.slice(1);
  while (value.endsWith('/')) value = value.slice(0, -1);
  return value;
}

export default async function handler(req, res) {
  const route = routeName(req);
  const handler = routes.get(route);
  if (!handler) return json(res, 404, { error: 'NOT_FOUND' });
  return handler(req, res);
}
