import { json, method, session, rootRef, safeError, consumeRateLimit, rateLimitKey } from '../core.js';
export default async function handler(req, res) {
  if (!method(req, res, ['GET'])) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    if (!(await consumeRateLimit(rateLimitKey(req, 'user-search:' + auth.uid), 30, 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    const q = String(req.query?.q || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{2,24}$/.test(q)) return json(res, 200, { users: [] });
    const root = rootRef();
    const snap = await root.child('usernames').orderByKey().startAt(q).endAt(q + '\uf8ff').limitToFirst(21).get();
    const matches = Object.entries(snap.val() || {}).filter(([name, uid]) => name !== auth.user.username && uid !== auth.uid).slice(0, 20);
    const users = [];
    for (const [username, uid] of matches) {
      if ((await root.child('blocks/' + auth.uid + '/' + uid).get()).val() || (await root.child('blocks/' + uid + '/' + auth.uid).get()).val()) continue;
      const u = (await root.child('users/' + uid).get()).val();
      if (u && !u.disabled) users.push({ id: uid, username, fullName: u.fullName, avatarUrl: u.avatarKey ? '/api/profile-image?userId=' + u.id : (u.avatarUrl || null), bio: u.bio || '' });
    }
    return json(res, 200, { users });
  } catch (error) { return safeError(res, error); }
}
