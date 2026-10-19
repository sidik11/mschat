import { json, method, requireOrigin, session, rootRef, safeError, consumeRateLimit, rateLimitKey, normalizeEmail, sha } from '../../core.js';
async function adminAuth(req, res) {
  const auth = await session(req);
  if (!auth) { json(res, 401, { error: 'UNAUTHENTICATED' }); return null; }
  const snap = await rootRef().child('users/' + auth.uid + '/role').get();
  if (snap.val() !== 'admin') { json(res, 403, { error: 'FORBIDDEN' }); return null; }
  return auth;
}
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,160}$/.test(value);
export default async function handler(req, res) {
  if (!method(req, res, ['GET', 'POST']) || (req.method === 'POST' && !requireOrigin(req, res))) return;
  try {
    const auth = await adminAuth(req, res); if (!auth) return;
    if (!(await consumeRateLimit(rateLimitKey(req, 'admin:' + auth.uid), req.method === 'GET' ? 30 : 20, 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    const root = rootRef();
    if (req.method === 'POST') {
      const uid = String(req.body?.userId || ''), action = String(req.body?.action || ''), now = Date.now();
      if (['resolve-complaint', 'reopen-complaint'].includes(action)) {
        const complaintId = String(req.body?.complaintId || '');
        if (!validId(complaintId)) return json(res, 400, { error: 'INVALID_COMPLAINT' });
        const ref = root.child('complaints/' + complaintId), complaint = (await ref.get()).val();
        if (!complaint) return json(res, 404, { error: 'COMPLAINT_NOT_FOUND' });
        await ref.update({ status: action === 'resolve-complaint' ? 'resolved' : 'open', updatedAt: now, handledBy: auth.uid });
        await root.child('adminAuditLogs').push({ actorId: auth.uid, action, targetId: complaintId, createdAt: now });
        return json(res, 200, { ok: true });
      }
      if (['resolve-report','reopen-report'].includes(action)) {
        const reportId = String(req.body?.reportId || '');
        if (!validId(reportId)) return json(res, 400, { error: 'INVALID_REPORT' });
        const ref = root.child('reports/' + reportId), report = (await ref.get()).val();
        if (!report) return json(res, 404, { error: 'REPORT_NOT_FOUND' });
        await ref.update({ status: action === 'resolve-report' ? 'resolved' : 'open', updatedAt: now, handledBy: auth.uid });
        await root.child('adminAuditLogs').push({ actorId: auth.uid, action, targetId: reportId, createdAt: now });
        return json(res, 200, { ok: true });
      }
      if (!/^[A-Za-z0-9_-]{20}$/.test(uid) || !['block', 'unblock'].includes(action)) return json(res, 400, { error: 'INVALID_ACTION' });
      if (uid === auth.uid) return json(res, 400, { error: 'CANNOT_BLOCK_SELF' });
      const ref = root.child('users/' + uid), snap = await ref.get();
      if (!snap.exists()) return json(res, 404, { error: 'USER_NOT_FOUND' });
      if (snap.val()?.role === 'admin' && action === 'block') return json(res, 403, { error: 'CANNOT_BLOCK_ADMIN' });
      await ref.update({ disabled: action === 'block', updatedAt: now });
      if (action === 'block') {
        await root.child('presence/' + uid).set({ status: 'offline', lastSeenAt: now });
        const sessions = await root.child('sessionIndex/' + uid).get(), revoke = [];
        sessions.forEach(child => revoke.push(Promise.all([root.child('sessions/' + child.key).remove(), child.ref.remove()])));
        await Promise.all(revoke);
      }
      await root.child('adminAuditLogs').push({ actorId: auth.uid, action: 'user_' + action, targetId: uid, createdAt: now });
      return json(res, 200, { ok: true });
    }
    const before = Number(req.query?.before || Number.MAX_SAFE_INTEGER);
    if (!Number.isFinite(before) || before <= 0) return json(res, 400, { error: 'INVALID_CURSOR' });
    const query = String(req.query?.q || '').trim().toLowerCase();
    let users = [];
    if (query) {
      if (/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(query)) {
        const uid = (await root.child('emails/' + sha(normalizeEmail(query))).get()).val();
        if (uid) { const u = (await root.child('users/' + uid).get()).val(); if (u) users.push({ id: uid, fullName: u.fullName, email: u.email, username: u.username, role: u.role || 'user', disabled: Boolean(u.disabled), emailVerified: Boolean(u.emailVerified), createdAt: u.createdAt }); }
      } else if (/^[a-z0-9_]{2,24}$/.test(query)) {
        const matches = await root.child('usernames').orderByKey().startAt(query).endAt(query + '\\uf8ff').limitToFirst(50).get();
        for (const [username, uid] of Object.entries(matches.val() || {})) {
          const u = (await root.child('users/' + uid).get()).val();
          if (u) users.push({ id: uid, fullName: u.fullName, email: u.email, username, role: u.role || 'user', disabled: Boolean(u.disabled), emailVerified: Boolean(u.emailVerified), createdAt: u.createdAt });
        }
      }
    } else {
      const usersSnap = await root.child('users').orderByChild('createdAt').endAt(before - 1).limitToLast(50).get();
      users = Object.entries(usersSnap.val() || {}).map(([id,u]) => ({ id, fullName: u.fullName, email: u.email, username: u.username, role: u.role || 'user', disabled: Boolean(u.disabled), emailVerified: Boolean(u.emailVerified), createdAt: u.createdAt })).sort((a,b) => b.createdAt - a.createdAt);
    }
    const [complaintsSnap, reportsSnap, auditSnap, countersSnap] = await Promise.all([
      root.child('complaints').orderByChild('createdAt').limitToLast(50).get(),
      root.child('reports').orderByChild('createdAt').limitToLast(50).get(),
      root.child('adminAuditLogs').orderByChild('createdAt').limitToLast(50).get(),
      root.child('usageAggregates/counters').get()
    ]);
    const complaints = Object.values(complaintsSnap.val() || {}).sort((a,b) => b.createdAt - a.createdAt);
    const reports = Object.values(reportsSnap.val() || {}).sort((a,b) => b.createdAt - a.createdAt);
    const auditLogs = Object.values(auditSnap.val() || {}).sort((a,b) => b.createdAt - a.createdAt);
    const counters = countersSnap.val() || {};
    const metric = key => Number.isSafeInteger(counters[key]?.value) ? counters[key].value : null;
    const trackingStartedAt = Object.values(counters).map(v => v?.trackingStartedAt).filter(Number.isFinite).sort((a,b) => a-b)[0] || null;
    return json(res, 200, {
      stats: { users: metric('registrations'), activeUsers: null, messages: metric('messages'), attachments: metric('attachmentUploads'), reports: metric('reports'), openComplaints: null, trackingStartedAt, metricsNote: 'Counters are tracked from their recorded start date. Historical totals and active-user counts are unavailable unless a safe one-time aggregation is configured.' },
      users, userCursor: !query && users.length === 50 ? users[users.length - 1].createdAt : null,
      complaints, reports, auditLogs
    });
  } catch (error) { return safeError(res, error); }
}
