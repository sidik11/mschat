import { randomUUID } from 'node:crypto';
import { json, method, requireOrigin, session, rootRef, safeError, consumeRateLimit, rateLimitKey, incrementCounter } from '../../core.js';
import { r2Client, signPut } from '../../r2.js';
const allowedMimeTypes = new Set(['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm','application/pdf','text/plain','application/zip','application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation']);
export default async function handler(req, res) {
  if (!method(req, res, ['POST']) || !requireOrigin(req, res)) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    if (!(await consumeRateLimit(rateLimitKey(req, 'attachment-upload:' + auth.uid), 10, 60 * 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    const conversationId = String(req.body?.conversationId || '');
    const fileName = String(req.body?.fileName || '').replace(/[\\/\\u0000-\\u001f]/g, '_').slice(0, 180);
    const size = Number(req.body?.size), mimeType = String(req.body?.mimeType || 'application/octet-stream'), mediaType = String(req.body?.mediaType || 'document');
    if (!/^[A-Za-z0-9_-]{3,160}$/.test(conversationId) || !fileName || !Number.isSafeInteger(size) || size < 1 || size > 50 * 1024 * 1024 || !['image','document','video'].includes(mediaType) || mimeType.length > 120 || !allowedMimeTypes.has(mimeType) || (mediaType === 'image' && !mimeType.startsWith('image/')) || (mediaType === 'video' && !mimeType.startsWith('video/')) || (mediaType === 'document' && (mimeType.startsWith('image/') || mimeType.startsWith('video/')))) return json(res, 400, { error: 'INVALID_ATTACHMENT', message: 'Images, documents and videos must be 50 MB or smaller.' });
    const root = rootRef();
    if (!(await root.child('conversations/' + conversationId + '/members/' + auth.uid).get()).val()) return json(res, 403, { error: 'FORBIDDEN' });
    const members = (await root.child('conversations/' + conversationId + '/members').get()).val() || {};
    for (const uid of Object.keys(members).filter(uid => uid !== auth.uid)) {
      const [a,b] = await Promise.all([root.child('blocks/' + auth.uid + '/' + uid).get(), root.child('blocks/' + uid + '/' + auth.uid).get()]);
      if (a.exists() || b.exists()) return json(res, 403, { error: 'CONVERSATION_BLOCKED' });
    }
    const { client, bucket } = r2Client();
    const attachmentId = randomUUID().replace(/-/g, '');
    const key = 'mschat/attachments/' + conversationId + '/' + attachmentId + '.bin';
    const uploadUrl = await signPut(client, bucket, key);
    await root.child('attachments/' + attachmentId).set({ id: attachmentId, key, conversationId, ownerId: auth.uid, fileName, mimeType, mediaType, originalSize: size, encryptedSize: size + 16, status: 'pending', createdAt: Date.now(), expiresAt: Date.now() + 15 * 60 * 1000 });
    try { await incrementCounter('attachmentUploads'); } catch {}
    return json(res, 200, { attachmentId, uploadUrl, method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, expiresInSeconds: 300 });
  } catch (error) { return safeError(res, error); }
}
