import { json, method, requireOrigin, session, rootRef, safeError } from '../../lib/core.js';
async function adminAuth(req, res) {
  const auth = await session(req);
  if (!auth) { json(res, 401, { error: 'UNAUTHENTICATED' }); return null; }
  const snap = await rootRef().child('users/' + auth.uid + '/role').get();
  if (snap.val() !== 'admin') { json(res, 403, { error: 'FORBIDDEN' }); return null; }
  return auth;
}
export default async function handler(req, res) {
  if (!method(req, res, ['GET', 'POST']) || (req.method === 'POST' && !requireOrigin(req, res))) return;
  try {
    const auth = await adminAuth(req, res); if (!auth) return;
    const root = rootRef();
    if (req.method === 'POST') {
      const uid = String(req.body?.userId || '');
      const action = String(req.body?.action || '');
      if (['resolve-complaint', 'reopen-complaint'].includes(action)) {
        const complaintId = String(req.body?.complaintId || '');
        if (!/^[A-Za-z0-9_-]{8,160}$/.test(complaintId)) return json(res, 400, { error: 'INVALID_COMPLAINT' });
        const complaintRef = root.child('complaints/' + complaintId), complaint = (await complaintRef.get()).val();
        if (!complaint) return json(res, 404, { error: 'COMPLAINT_NOT_FOUND' });
        await complaintRef.update({ status: action === 'resolve-complaint' ? 'resolved' : 'open', updatedAt: Date.now(), handledBy: auth.uid });
        return json(res, 200, { ok: true });
      }
      if (!/^[A-Za-z0-9_-]{8,160}$/.test(uid) || !['block', 'unblock'].includes(action)) return json(res, 400, { error: 'INVALID_ACTION' });
      if (uid === auth.uid) return json(res, 400, { error: 'CANNOT_BLOCK_SELF' });
      const ref = root.child('users/' + uid), snap = await ref.get();
      if (!snap.exists()) return json(res, 404, { error: 'USER_NOT_FOUND' });
      await ref.update({ disabled: action === 'block', updatedAt: Date.now() });
      if (action === 'block') {
        const sessions = await root.child('sessions').get();
        const revoke = [];
        sessions.forEach(child => { if (child.val()?.uid === uid) revoke.push(child.ref.remove()); });
        await Promise.all(revoke);
      }
      return json(res, 200, { ok: true });
    }
    const [usersSnap, complaintsSnap] = await Promise.all([root.child('users').get(), root.child('complaints').get()]);
    const users = Object.entries(usersSnap.val() || {}).map(([id, u]) => ({ id, fullName: u.fullName, email: u.email, username: u.username, role: u.role || 'user', disabled: Boolean(u.disabled), createdAt: u.createdAt })).sort((a,b) => b.createdAt - a.createdAt).slice(0, 500);
    const complaints = Object.values(complaintsSnap.val() || {}).sort((a,b) => b.createdAt - a.createdAt).slice(0, 200);
    return json(res, 200, { stats: { users: Object.keys(usersSnap.val() || {}).length, activeUsers: Object.values(usersSnap.val() || {}).filter(u => !u.disabled).length, openComplaints: complaints.filter(c => c.status === 'open').length }, users, complaints });
  } catch (error) { return safeError(res, error); }
}
