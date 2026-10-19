import { json, method, requireOrigin, session, rootRef, safeError } from '../_lib/core.js';
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{3,160}$/.test(value);
export default async function handler(req, res) {
  if (!method(req, res, ['GET', 'POST']) || (req.method === 'POST' && !requireOrigin(req, res))) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const root = rootRef();
    if (req.method === 'GET') {
      const conversationId = String(req.query?.conversationId || '');
      if (!validId(conversationId)) return json(res, 400, { error: 'INVALID_CONVERSATION' });
      const [memberSnap, messagesSnap] = await Promise.all([
        root.child('conversations/' + conversationId + '/members/' + auth.uid).get(),
        root.child('messages/' + conversationId).orderByChild('createdAt').limitToLast(100).get()
      ]);
      if (!memberSnap.val()) return json(res, 403, { error: 'FORBIDDEN' });
      const messages = Object.entries(messagesSnap.val() || {}).map(([id, m]) => ({ id, ...m })).sort((a,b) => a.createdAt - b.createdAt);
      return json(res, 200, { messages });
    }
    const conversationId = String(req.body?.conversationId || ''), ciphertext = req.body?.ciphertext, iv = req.body?.iv, keyVersion = req.body?.keyVersion;
    if (!validId(conversationId) || typeof ciphertext !== 'string' || ciphertext.length < 1 || ciphertext.length > 20000 || typeof iv !== 'string' || iv.length > 100 || !Number.isInteger(keyVersion) || keyVersion < 1) return json(res, 400, { error: 'INVALID_MESSAGE' });
    const memberSnap = await root.child('conversations/' + conversationId + '/members/' + auth.uid).get();
    if (!memberSnap.val()) return json(res, 403, { error: 'FORBIDDEN' });
    const now = Date.now(), ref = root.child('messages/' + conversationId).push();
    await ref.set({ senderId: auth.uid, ciphertext, iv, keyVersion, createdAt: now, deliveredTo: {}, readBy: {} });
    await root.child('conversations/' + conversationId + '/lastMessage').set({ messageId: ref.key, senderId: auth.uid, createdAt: now, preview: 'Encrypted message' });
    return json(res, 201, { id: ref.key, createdAt: now });
  } catch (error) { return safeError(res, error); }
}
