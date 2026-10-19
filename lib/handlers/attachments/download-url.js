import { json, method, requireOrigin, session, rootRef, safeError } from '../../core.js';
import { r2Client, signGet } from '../../r2.js';
export default async function handler(req, res) {
  if (!method(req, res, ['POST']) || !requireOrigin(req, res)) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const id = String(req.body?.attachmentId || '');
    if (!/^[a-f0-9]{32}$/.test(id)) return json(res, 400, { error: 'INVALID_ATTACHMENT' });
    const root = rootRef(), snap = await root.child('attachments/' + id).get(), item = snap.val();
    if (!item || item.status !== 'linked' || typeof item.key !== 'string' || !item.key.startsWith('mschat/attachments/' + item.conversationId + '/')) return json(res, 404, { error: 'ATTACHMENT_NOT_FOUND' });
    const membersSnap = await root.child('conversations/' + item.conversationId + '/members').get(), members = membersSnap.val() || {};
    if (!members[auth.uid]) return json(res, 403, { error: 'FORBIDDEN' });
    for (const uid of Object.keys(members).filter(uid => uid !== auth.uid)) {
      const [a,b] = await Promise.all([root.child('blocks/' + auth.uid + '/' + uid).get(), root.child('blocks/' + uid + '/' + auth.uid).get()]);
      if (a.exists() || b.exists()) return json(res, 403, { error: 'CONVERSATION_BLOCKED' });
    }
    const { client, bucket } = r2Client();
    return json(res, 200, { downloadUrl: await signGet(client, bucket, item.key), fileName: item.fileName, size: item.originalSize, mimeType: item.mimeType || 'application/octet-stream', mediaType: item.mediaType || 'document', expiresInSeconds: 180 });
  } catch (error) { return safeError(res, error); }
}
