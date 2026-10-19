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
    const paths = ['sessions', 'otps', 'rateLimits', 'attachments'];
    const snaps = await Promise.all(paths.map(path => root.child(path).get()));
    const removals = [];
    snaps.forEach((snap, index) => {
      const path = paths[index];
      snap.forEach(child => {
        const value = child.val() || {};
        const expired = path === 'sessions' ? value.expiresAt <= now
          : path === 'otps' ? value.expiresAt <= now
          : path === 'rateLimits' ? value.resetAt <= now
          : (value.status === 'pending' || value.status === 'ready') && value.expiresAt <= now;
        if (expired) removals.push({ path, key: child.key, value, ref: child.ref });
      });
    });
    let r2 = null;
    if (removals.some(x => x.path === 'attachments')) {
      try { r2 = r2Client(); } catch {}
    }
    await Promise.all(removals.map(async item => {
      if (item.path === 'attachments' && r2 && item.value.key) {
        try { await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: item.value.key })); } catch {}
      }
      await item.ref.remove();
    }));
    return json(res, 200, { ok: true, removed: removals.length });
  } catch (error) { return safeError(res, error); }
}
