# Security baseline and open items

## Implemented in this foundation

- No secret values are committed; `.env.example` contains placeholders.
- Firebase Admin initialization is server-side.
- Default Firebase rules deny client reads and writes.
- Registration and login endpoints fail closed with 503 while secure authentication is not implemented.
- Health response reports whether integrations appear configured, not credentials.
- UI honors `prefers-reduced-motion`.

## Not yet safe to release

- Registration currently stops before account creation. Do not treat the 202 response as verified registration.
- Registration challenge rate limiting and resend cooldowns still need a durable, abuse-resistant implementation.
- The account uniqueness check must be converted to an atomic reservation/commit protocol to prevent race conditions before enabling account creation.
- Session creation, rotation, CSRF protection, origin policy, and revocation are not complete.
- No E2EE protocol is integrated yet; do not send private content through this foundation as though it is encrypted.
- R2 upload authorization, push notifications, admin MFA, audit logging, reports, and account deletion remain to be implemented.
- Configure restrictive production CSP and security headers, review dependencies, and run automated security tests.

Never expose secrets in logs, API responses, frontend bundles, or Git history. If a secret is ever committed, rotate it.
