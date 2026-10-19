import { timingSafeEqual, createHash } from 'node:crypto';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { json, method, rootRef, safeError } from '../../core.js';
import { r2Client } from '../../r2.js';
function matches(a, b) {
  if (!a || !b) return false;
  return timingSafeEqual(createHash('sha256').update(String(a)).digest(), createHash('sha256').update(String(b)).digest());
}
export default async function handler(req, res) {
  if (!method(req, res, ['GET', 'POST'])) return;
  if (!process.env.CRON_SECRET || !matches(req.headers.authorization, 'Bearer ' + process.env.CRON_SECRET)) return json(res, 401, { error: 'UNAUTHORIZED' });
  try {
    const root = rootRef(), now = Date.now();
    const paths = ['sessions', 'otps', 'adminLoginChallenges', 'rateLimits', 'attachments', 'profileImageUploads'];
    const snaps = await Promise.all(paths.map(path => root.child(path).get()));
    const removals = [];
    snaps.forEach((snap, index) => {
      const path = paths[index];
      snap.forEach(child => {
        const value = child.val() || {};
        const expired = path === 'sessions' ? value.expiresAt <= now
          : path === 'otps' || path === 'adminLoginChallenges' ? value.expiresAt <= now
          : path === 'rateLimits' ? value.resetAt <= now
          : path === 'attachments' ? (value.status === 'pending' || value.status === 'ready' || value.status === 'deleted') && value.expiresAt <= now
          : path === 'profileImageUploads' ? value.status === 'pending' && value.expiresAt <= now : false;
        if (expired) removals.push({ path, key: child.key, value, ref: child.ref });
      });
    });
    let r2 = null;
    if (removals.some(x => ['attachments','profileImageUploads'].includes(x.path))) {
      try { r2 = r2Client(); } catch {}
    }
    let removed = 0, failures = 0;
    await Promise.all(removals.map(async item => {
      if (item.path === 'sessions' && item.value.uid) {
        try { await root.child('sessionIndex/' + item.value.uid + '/' + item.key).remove(); } catch { failures++; }
      }
      if (['attachments','profileImageUploads'].includes(item.path) && item.value.key) {
        const allowedPrefix = item.path === 'attachments' ? 'mschat/attachments/' + String(item.value.conversationId || '') + '/' : 'mschat/profile-images/' + String(item.value.ownerId || '') + '/';
        if (!item.value.key.startsWith(allowedPrefix) || !r2) { failures++; return; }
        try { await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: item.value.key })); }
        catch { failures++; return; }
      }
      try { await item.ref.remove(); removed++; } catch { failures++; }
    }));
    return json(res, 200, { ok: true, removed, failures });
  } catch (error) { return safeError(res, error); }
}
