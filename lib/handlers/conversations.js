import { json, method, session, rootRef, safeError, consumeRateLimit, rateLimitKey } from '../core.js';
async function buildConversation(root, uid, conversationId, state = {}) {
  const members = (await root.child('conversations/' + conversationId + '/members').get()).val() || {};
  if (!members[uid]) return null;
  const others = Object.keys(members).filter(id => id !== uid);
  if (others.length !== 1 || !(await root.child('friends/' + uid + '/' + others[0]).get()).exists()) return null;
  const otherId = others[0];
  const [userSnap,lastSnap,blockA,blockB,presenceSnap,settingsSnap] = await Promise.all([
    root.child('users/' + otherId).get(),
    root.child('conversations/' + conversationId + '/lastMessage').get(),
    root.child('blocks/' + uid + '/' + otherId).get(),
    root.child('blocks/' + otherId + '/' + uid).get(),
    root.child('presence/' + otherId).get(),
    root.child('users/' + otherId + '/settings').get()
  ]);
  const user = userSnap.val(), lastMessage = lastSnap.val(), presence = presenceSnap.val() || {}, privacy = settingsSnap.val() || {};
  if (!user || user.disabled || blockA.exists() || blockB.exists()) return null;
  const activePresence = Object.values(presence.sessions || {}).filter(s => s?.expiresAt > Date.now());
  const online = activePresence.length > 0 && privacy.onlineVisibility !== 'nobody';
  const lastSeenAt = privacy.lastSeenVisibility === 'nobody' ? null : Math.max(0,...activePresence.map(s => s.lastSeenAt || 0),Number(presence.lastSeenAt || 0));
  return {
    conversationId,
    friend: { id: otherId, username: user.username, fullName: user.fullName, avatarUrl: user.avatarKey ? '/api/profile-image?userId=' + otherId : null, online, lastSeenAt },
    lastMessage: lastMessage ? { messageId: lastMessage.messageId, senderId: lastMessage.senderId, createdAt: lastMessage.createdAt, preview: 'Encrypted message' } : null,
    unreadCount: Object.keys(state.unreadMessages || {}).length,
    updatedAt: Number(state.lastMessageAt || lastMessage?.createdAt || 0)
  };
}
export default async function handler(req, res) {
  if (!method(req, res, ['GET'])) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    if (!(await consumeRateLimit(rateLimitKey(req, 'conversations-read:' + auth.uid), 30, 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    const root = rootRef(), requestedId = String(req.query?.conversationId || '');
    if (requestedId) {
      if (!/^[A-Za-z0-9_-]{3,160}$/.test(requestedId)) return json(res, 400, { error: 'INVALID_CONVERSATION' });
      const state = (await root.child('userConversationState/' + auth.uid + '/' + requestedId).get()).val() || {};
      const item = await buildConversation(root, auth.uid, requestedId, state);
      if (!item) return json(res, 404, { error: 'CONVERSATION_NOT_FOUND' });
      return json(res, 200, { conversation: item });
    }
    const before = Number(req.query?.before || Number.MAX_SAFE_INTEGER);
    if (!Number.isFinite(before) || before <= 0) return json(res, 400, { error: 'INVALID_CURSOR' });
    const stateSnap = await root.child('userConversationState/' + auth.uid).orderByChild('lastMessageAt').endAt(before - 1).limitToLast(31).get();
    const rawState = stateSnap.val() || {}, results = [];
    for (const [conversationId,state] of Object.entries(rawState)) {
      const item = await buildConversation(root, auth.uid, conversationId, state || {});
      if (item) results.push(item);
    }
    results.sort((a,b) => b.updatedAt - a.updatedAt);
    const conversations = results.slice(0,30);
    const oldestRawTimestamp = Math.min(...Object.values(rawState).map(state => Number(state?.lastMessageAt || 0)).filter(value => value > 0));
    const nextCursor = results.length > 30 ? conversations[conversations.length-1]?.updatedAt || null : Object.keys(rawState).length === 31 && Number.isFinite(oldestRawTimestamp) ? oldestRawTimestamp : null;
    return json(res, 200, { conversations, nextCursor });
  } catch (error) { return safeError(res, error); }
}
