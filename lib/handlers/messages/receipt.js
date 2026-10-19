import { json, method, requireOrigin, session, rootRef, safeError } from '../../core.js';
export default async function handler(req, res) {
  if (!method(req, res, ['POST']) || !requireOrigin(req, res)) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const { conversationId, messageId, state } = req.body || {};
    if (typeof conversationId !== 'string' || typeof messageId !== 'string' || !['delivered', 'read'].includes(state)) return json(res, 400, { error: 'INVALID_RECEIPT' });
    const root = rootRef();
    if (!(await root.child('conversations/' + conversationId + '/members/' + auth.uid).get()).val()) return json(res, 403, { error: 'FORBIDDEN' });
    const ref = root.child('messages/' + conversationId + '/' + messageId);
    const snap = await ref.get(), message = snap.val();
    if (!message || message.senderId === auth.uid) return json(res, 404, { error: 'MESSAGE_NOT_FOUND' });
    await ref.child(state === 'read' ? 'readBy' : 'deliveredTo').child(auth.uid).set(Date.now());
    return json(res, 200, { ok: true, state });
  } catch (error) { return safeError(res, error); }
}
