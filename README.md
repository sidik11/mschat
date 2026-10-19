# MS Chat

MS Chat is a mobile-first one-to-one messaging application built with React/Vite, a single Vercel serverless API dispatcher, Firebase Realtime Database (Admin SDK only), Gmail API OTP, Cloudflare R2 and Web Push.

## Implemented in this branch

- Email OTP registration with date-based 18+ validation, scrypt password hashing, normalized uniqueness indexes, persistent HttpOnly session cookies, logout, password change, session listing/revocation and email-OTP administrator MFA.
- Profile editing, private date of birth, profile image upload to private R2 with content-signature checks, username search, friend requests (incoming/outgoing/cancel), accepted contacts, friend removal and blocking.
- One-to-one messaging with server authorization, idempotency keys, cursor-based message and conversation APIs, unread indicators, sent/delivered/read ticks, deletion for me/everyone, typing state and per-session presence.
- Client-side Web Crypto message encryption, local public-key fingerprint pinning/change warnings, and unique random per-attachment content keys carried inside the encrypted message.
- Private R2 attachments up to 50 MB, client-side supported-format signature checks, client-side video duration checks, authorized upload/download URLs and temporary-object cleanup.
- Web Push for new messages and friend events, settings, per-conversation mute, generic previews by default, visible-chat suppression and duplicate-delivery guards.
- Admin dashboard at `/admin.html`, one-time bootstrap, email OTP MFA, paginated user listing/search, user suspension, complaint/report handling and audit logs.
- PWA service worker, privacy policy and terms pages, restrictive Firebase rules, security headers/CSP, environment example, CI tests and architecture/security/deployment documentation.

## Local development

1. Use Node.js 22.x.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and configure real values locally.
4. Apply `firebase.rules.json` and verify direct client reads/writes are denied.
5. Run `npm run dev`.
6. Run `npm test` and `npm run build`.

## Required production configuration

Configure these in Vercel server-side settings, separately for Preview and Production:

- Firebase Admin: database URL, project ID, service-account email and private key.
- `OTP_HMAC_SECRET`: at least 32 random bytes, kept stable across routine deploys.
- Gmail OAuth: client ID, client secret, refresh token with `gmail.send`, sender email.
- Private Cloudflare R2: account ID, access key, secret and bucket. Set CORS for exact origins and required PUT/GET/HEAD methods and Content-Type header.
- Web Push: VAPID public/private keys and subject.
- `ALLOWED_ORIGINS`, `APP_BASE_URL`, `CRON_SECRET`, `ADMIN_EMAIL`, and one-time `ADMIN_BOOTSTRAP_SECRET`.

After first admin bootstrap at `/admin.html`, remove or rotate `ADMIN_BOOTSTRAP_SECRET` from all Vercel environments. Admin sign-in requires password plus email OTP. Do not expose any server secret through `VITE_*` variables or frontend bundles.

See [deployment guide](docs/deployment.md), [architecture](docs/architecture.md), [database schema](docs/database-schema.md), [security notes](docs/security.md), [privacy notes](docs/privacy.md) and [incident response](docs/incident-response.md).

## Important limitations — not production-ready

**The current encryption implementation is not equivalent to Signal or WhatsApp E2EE.** It uses static ECDH/HKDF/AES-GCM and local key fingerprint pinning. It does not yet implement a reviewed Signal Protocol, forward secrecy, ratcheting, post-compromise recovery, authenticated first contact/key transparency or secure multi-device recovery. Browser data loss can make old messages undecryptable. Do not use this build for highly sensitive communications or advertise it as independently audited.

Other gaps:
- Account deletion disables access and queues a request, but full resumable cleanup of all user-linked RTDB records and R2 objects is not implemented.
- Attachment signature and video-duration checks run in the sender's browser before encryption. Since the server receives ciphertext, it cannot independently validate plaintext signatures/duration against a malicious client. Uploads are not resumable.
- Historical admin counters are not backfilled; metrics are tracked only since their recorded start time. Active-user counts and provider-level storage/bandwidth metrics are not yet available.
- Firebase Emulator authorization tests, real Gmail/R2/Web Push integration tests, independent penetration testing, dependency audit and load testing remain required.

CI/build success is not proof that external credentials or production integrations work. Verify real services before deployment; do not claim production readiness until the security gaps above are resolved.
