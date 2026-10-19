# MS Chat

MS Chat is a mobile-first one-to-one messaging application using React/Vite, Vercel serverless APIs, Firebase Realtime Database (Admin SDK only), Gmail API OTP, Cloudflare R2, Web Push, and Web Crypto.

## Implemented in this branch

- Email OTP registration, scrypt password hashing, normalized email/username uniqueness indexes, persistent HttpOnly session cookies, logout/revocation, and basic rate limiting.
- Authenticated contacts and friend requests, direct conversations, encrypted message payloads, sent/delivered/read receipt endpoints, and periodic message refresh.
- Browser-generated P-256 ECDH device keypair with a non-extractable private key stored in IndexedDB; AES-GCM encryption for messages and files before upload.
- Private Cloudflare R2 upload/download URLs; uploaded file content is encrypted in the browser and the API validates conversation membership.
- Web Push subscription storage and generic push notifications that do not expose message contents.
- Responsive purple/black/white UI, light/dark theme preference in localStorage, user settings, logout, complaint submission, admin dashboard, account blocking, and complaint resolution.
- PWA manifest and service worker.
- CI workflow runs tests and the production build on feature branches.

## Local development

1. Install Node.js 22+.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and fill in real values.
4. Configure Firebase RTDB rules using `firebase.rules.json`; direct client access must remain denied.
5. Run `npm run dev`.
6. Run `npm test` and `npm run build`.

## Vercel and external services

- Set `ALLOWED_ORIGINS` to the exact production origin(s), including the deployed Vercel domain and any custom domain. Keep localhost only for local development.
- Configure Firebase Admin service-account credentials server-side only.
- Configure Gmail API OAuth with the `gmail.send` scope.
- Configure a private R2 bucket and credentials. Configure bucket CORS to allow PUT from the deployed origin with `Content-Type`.
- Generate VAPID keys and set all three `VAPID_*` variables.
- Set `ADMIN_EMAIL` and a long random `ADMIN_BOOTSTRAP_SECRET`; create and verify that account through OTP, then sign in and visit `/admin` to bootstrap. Remove/rotate the bootstrap secret after use.
- Never put service-account credentials, Gmail tokens, R2 secrets, or the admin bootstrap secret in client-side environment variables.

## Important security limitations

This branch is an implementation pass, not a security certification. The E2EE currently uses a static ECDH key per browser/device and does not yet provide forward secrecy, authenticated key fingerprints/key transparency, multi-device key recovery, or a reviewed ratcheting protocol. Clearing browser data or using another device loses the local private key, so prior messages may no longer decrypt. Do not advertise this as equivalent to Signal/WhatsApp-grade E2EE until those properties are implemented and independently reviewed.

The message transport currently refreshes by polling rather than Firebase client subscriptions. Push notifications are best-effort and require browser permission plus VAPID configuration. R2 requires correct bucket CORS. Admin bootstrap must be configured carefully. This branch must pass CI and a real deployment/integration test with configured services before production use.
