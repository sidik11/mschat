import { json, method, session, rootRef, safeError, consumeRateLimit, rateLimitKey } from '../core.js';
export default async function handler(req, res) {
  if (!method(req, res, ['GET'])) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    if (!(await consumeRateLimit(rateLimitKey(req, 'conversations-read:' + auth.uid), 30, 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    const before = Number(req.query?.before || Number.MAX_SAFE_INTEGER);
    if (!Number.isFinite(before) || before <= 0) return json(res, 400, { error: 'INVALID_CURSOR' });
    const root = rootRef(), friends = (await root.child('friends/' + auth.uid).get()).val() || {}, state = (await root.child('userConversationState/' + auth.uid).get()).val() || {}, results = [];
    for (const [uid, item] of Object.entries(friends)) {
      const [userSnap, convoSnap, blockA, blockB] = await Promise.all([
        root.child('users/' + uid).get(),
        root.child('conversations/' + item.conversationId + '/lastMessage').get(),
        root.child('blocks/' + auth.uid + '/' + uid).get(),
        root.child('blocks/' + uid + '/' + auth.uid).get()
      ]);
      const user = userSnap.val(), lastMessage = convoSnap.val();
      if (!user || user.disabled || blockA.exists() || blockB.exists()) continue;
      const updatedAt = Number(lastMessage?.createdAt || item.since || 0);
      if (updatedAt >= before) continue;
      results.push({ conversationId: item.conversationId, friend: { id: uid, username: user.username, fullName: user.fullName, avatarUrl: user.avatarUrl || null }, lastMessage: lastMessage ? { messageId: lastMessage.messageId, senderId: lastMessage.senderId, createdAt: lastMessage.createdAt, preview: 'Encrypted message' } : null, unreadCount: Object.keys(state[item.conversationId]?.unreadMessages || {}).length, updatedAt });
    }
    results.sort((a,b) => b.updatedAt - a.updatedAt);
    const page = results.slice(0, 30), nextCursor = results.length > 30 ? page[page.length - 1]?.updatedAt || null : null;
    return json(res, 200, { conversations: page, nextCursor });
  } catch (error) { return safeError(res, error); }
}
