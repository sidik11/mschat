import { json, method } from '../../lib/core.js';
export default async function handler(req, res) {
  if (!method(req, res, ['GET'])) return;
  res.setHeader('Cache-Control', 'no-store');
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  if (!publicKey) return json(res, 200, { publicKey: null, configured: false });
  return json(res, 200, { publicKey, configured: true });
}
