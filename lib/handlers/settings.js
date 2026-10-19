import { json, method, requireOrigin, session, rootRef, safeError } from '../core.js';
const defaults = { theme: 'light', notificationsEnabled: false, notificationPrivacy: 'generic', lastSeenVisibility: 'friends', onlineVisibility: 'friends', readReceiptsEnabled: true, mutedConversations: {} };
export default async function handler(req, res) {
  if (!method(req, res, ['GET', 'POST']) || (req.method === 'POST' && !requireOrigin(req, res))) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const ref = rootRef().child('users/' + auth.uid + '/settings');
    if (req.method === 'GET') return json(res, 200, { settings: { ...defaults, ...((await ref.get()).val() || {}) } });
    const body = req.body || {}, allowed = Object.keys(defaults), update = {};
    for (const key of Object.keys(body)) if (!allowed.includes(key)) return json(res, 400, { error: 'UNKNOWN_SETTING' });
    if (body.theme !== undefined) { if (!['light','dark'].includes(body.theme)) return json(res, 400, { error: 'INVALID_THEME' }); update.theme = body.theme; }
    if (body.notificationsEnabled !== undefined) { if (typeof body.notificationsEnabled !== 'boolean') return json(res, 400, { error: 'INVALID_SETTING' }); update.notificationsEnabled = body.notificationsEnabled; }
    if (body.notificationPrivacy !== undefined) { if (!['generic','sender'].includes(body.notificationPrivacy)) return json(res, 400, { error: 'INVALID_SETTING' }); update.notificationPrivacy = body.notificationPrivacy; }
    for (const key of ['lastSeenVisibility','onlineVisibility']) if (body[key] !== undefined) { if (!['everyone','friends','nobody'].includes(body[key])) return json(res, 400, { error: 'INVALID_SETTING' }); update[key] = body[key]; }
    if (body.readReceiptsEnabled !== undefined) { if (typeof body.readReceiptsEnabled !== 'boolean') return json(res, 400, { error: 'INVALID_SETTING' }); update.readReceiptsEnabled = body.readReceiptsEnabled; }
    if (body.mutedConversations !== undefined) {
      if (!body.mutedConversations || typeof body.mutedConversations !== 'object' || Array.isArray(body.mutedConversations) || Object.keys(body.mutedConversations).length > 200 || Object.values(body.mutedConversations).some(v => typeof v !== 'boolean')) return json(res, 400, { error: 'INVALID_SETTING' });
      update.mutedConversations = body.mutedConversations;
    }
    await ref.update(update);
    return json(res, 200, { settings: { ...defaults, ...((await ref.get()).val() || {}) } });
  } catch (error) { return safeError(res, error); }
}
