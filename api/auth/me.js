import { json, method, session, safeError } from '../../lib/core.js';
export default async function handler(req, res) {
  if (!method(req, res, ['GET'])) return;
  try {
    const auth = await session(req);
    if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    return json(res, 200, { user: auth.user });
  } catch (error) { return safeError(res, error); }
}
