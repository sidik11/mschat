import { randomUUID } from 'node:crypto';
import { json, method, requireOrigin, session, rootRef, safeError } from '../_lib/core.js';
import { r2Client, signPut } from './_r2.js';
export default async function handler(req, res) {
  if (!method(req, res, ['POST']) || !requireOrigin(req, res)) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const conversationId = String(req.body?.conversationId || '');
    const fileName = String(req.body?.fileName || '').replace(/[\\/\\u0000-\\u001f]/g, '_').slice(0, 180);
    const size = Number(req.body?.size);
    if (!/^[A-Za-z0-9_-]{3,160}$/.test(conversationId) || !fileName || !Number.isSafeInteger(size) || size < 1 || size > 25 * 1024 * 1024) return json(res, 400, { error: 'INVALID_ATTACHMENT', message: 'Files must be between 1 byte and 25 MB.' });
    if (!(await rootRef().child('conversations/' + conversationId + '/members/' + auth.uid).get()).val()) return json(res, 403, { error: 'FORBIDDEN' });
    const { client, bucket } = r2Client();
    const attachmentId = randomUUID().replace(/-/g, '');
    const key = 'mschat/attachments/' + conversationId + '/' + attachmentId + '.bin';
    const uploadUrl = await signPut(client, bucket, key);
    await rootRef().child('attachments/' + attachmentId).set({ id: attachmentId, key, conversationId, ownerId: auth.uid, fileName, originalSize: size, encryptedSize: size + 16, status: 'pending', createdAt: Date.now(), expiresAt: Date.now() + 15 * 60 * 1000 });
    return json(res, 200, { attachmentId, uploadUrl, method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, expiresInSeconds: 300 });
  } catch (error) { return safeError(res, error); }
}
