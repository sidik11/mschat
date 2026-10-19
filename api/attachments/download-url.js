import { json, method, requireOrigin, session, rootRef, safeError } from '../../lib/core.js';
import { r2Client, signGet } from '../../lib/r2.js';
export default async function handler(req, res) {
  if (!method(req, res, ['POST']) || !requireOrigin(req, res)) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const id = String(req.body?.attachmentId || '');
    if (!/^[a-f0-9]{32}$/.test(id)) return json(res, 400, { error: 'INVALID_ATTACHMENT' });
    const root = rootRef(), snap = await root.child('attachments/' + id).get(), item = snap.val();
    if (!item || item.status !== 'ready') return json(res, 404, { error: 'ATTACHMENT_NOT_FOUND' });
    if (!(await root.child('conversations/' + item.conversationId + '/members/' + auth.uid).get()).val()) return json(res, 403, { error: 'FORBIDDEN' });
    const { client, bucket } = r2Client();
    return json(res, 200, { downloadUrl: await signGet(client, bucket, item.key), fileName: item.fileName, size: item.originalSize, expiresInSeconds: 180 });
  } catch (error) { return safeError(res, error); }
}
