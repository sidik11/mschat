import { json, method, requireOrigin, session, rootRef, safeError } from '../_lib/core.js';
import { r2Client, objectExists } from './_r2.js';
export default async function handler(req, res) {
  if (!method(req, res, ['POST']) || !requireOrigin(req, res)) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const id = String(req.body?.attachmentId || '');
    if (!/^[a-f0-9]{32}$/.test(id)) return json(res, 400, { error: 'INVALID_ATTACHMENT' });
    const root = rootRef(), ref = root.child('attachments/' + id), snap = await ref.get(), item = snap.val();
    if (!item || item.ownerId !== auth.uid || item.status !== 'pending' || item.expiresAt <= Date.now()) return json(res, 404, { error: 'UPLOAD_NOT_FOUND' });
    if (!(await root.child('conversations/' + item.conversationId + '/members/' + auth.uid).get()).val()) return json(res, 403, { error: 'FORBIDDEN' });
    const { client, bucket } = r2Client();
    const head = await objectExists(client, bucket, item.key);
    if (Number(head.ContentLength) !== item.encryptedSize) return json(res, 400, { error: 'UPLOAD_SIZE_MISMATCH' });
    await ref.update({ status: 'ready', readyAt: Date.now() });
    return json(res, 200, { ok: true, attachment: { id, fileName: item.fileName, size: item.originalSize } });
  } catch (error) { return safeError(res, error); }
}
