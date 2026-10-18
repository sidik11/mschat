export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  return res.status(503).json({
    error: 'AUTHENTICATION_NOT_READY',
    message: 'Sign-in is not enabled until secure sessions, password verification, CSRF protection, and revocation are implemented.'
  });
}