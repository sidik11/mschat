import { json, method, requireOrigin, session, rootRef, safeError } from '../../core.js';
export default async function handler(req, res) {
  if (!method(req, res, ['POST']) || !requireOrigin(req, res)) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const { conversationId, messageId, state } = req.body || {};
    if (typeof conversationId !== 'string' || !/^[A-Za-z0-9_-]{3,160}$/.test(conversationId) || typeof messageId !== 'string' || !/^[A-Za-z0-9_-]{20}$/.test(messageId) || !['delivered', 'read'].includes(state)) return json(res, 400, { error: 'INVALID_RECEIPT' });
    const root = rootRef();
    if (!(await root.child('conversations/' + conversationId + '/members/' + auth.uid).get()).val()) return json(res, 403, { error: 'FORBIDDEN' });
    const prefs = (await root.child('users/' + auth.uid + '/settings').get()).val() || {};
    if (state === 'read' && prefs.readReceiptsEnabled === false) return json(res, 200, { ok: true, state, suppressed: true });
    const ref = root.child('messages/' + conversationId + '/' + messageId);
    const snap = await ref.get(), message = snap.val();
    if (!message || message.senderId === auth.uid) return json(res, 404, { error: 'MESSAGE_NOT_FOUND' });
    const other = Object.keys((await root.child('conversations/' + conversationId + '/members').get()).val() || {}).filter(uid => uid !== auth.uid);
    if (other.length !== 1) return json(res, 403, { error: 'INVALID_CONVERSATION' });
    const [blockedA, blockedB] = await Promise.all([root.child('blocks/' + auth.uid + '/' + other[0]).get(), root.child('blocks/' + other[0] + '/' + auth.uid).get()]);
    if (blockedA.exists() || blockedB.exists()) return json(res, 403, { error: 'CONVERSATION_BLOCKED' });
    const receiptRef = ref.child(state === 'read' ? 'readBy' : 'deliveredTo').child(auth.uid);
    await receiptRef.transaction(old => old || Date.now());
    return json(res, 200, { ok: true, state });
  } catch (error) { return safeError(res, error); }
}
