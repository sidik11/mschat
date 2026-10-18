const json = (res, status, body) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }
  // Intentionally fail closed until OTP consumption, password hashing, atomic uniqueness
  // reservation, account creation, session issuance, and rate limiting are implemented.
  // Do not send an OTP that the application cannot verify or create an account from.
  return json(res, 503, {
    error: 'REGISTRATION_NOT_READY',
    message: 'Account creation is not enabled yet. Registration will open after verification and account-integrity checks are complete.'
  });
}