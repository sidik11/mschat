# MS Chat architecture

## Current repository status

This is a foundation build, not a completed or audited messaging service. The UI is responsive and includes theme persistence, reduced-motion support, client-side form checks, and a registration API integration point. Registration and login endpoints deliberately return 503 until secure verification, password handling, uniqueness reservations, and session lifecycle are implemented.

## Trust boundaries

- Browser: untrusted client. Never authoritative for identity, age, roles, message status, ownership, or timestamps.
- Vercel API: intended enforcement point for authentication, authorization, validation, and rate limits.
- Firebase Admin SDK: server-only access. Database rules deny direct client access by default.
- Cloudflare R2: intended private object storage with `mschat/` object-key prefix and short-lived authorization.
- Browser storage: localStorage is for theme/UI preferences only. Never put session tokens or passwords in localStorage/IndexedDB.

## Namespace

All application records must live under `mschat/`. Reserve case-normalized email and username indexes with atomic transactions before account creation is enabled. Email index keys should be hashes of normalized email addresses to avoid storing raw addresses in index paths.

## Required before release

1. Complete registration challenge consumption, OTP attempt accounting, password hashing, atomic uniqueness reservations, account creation, and persistent secure sessions.
2. Select and integrate a maintained E2EE protocol; do not invent cryptography. Verify compatibility, maintenance, license, and security assumptions.
3. Implement message APIs, friend authorization, receipts, blocking, attachment signing, push subscriptions, account deletion, admin bootstrap, and audit logs.
4. Add rate limiting suitable for serverless deployment and test concurrent operations against Firebase Emulator.
5. Configure secrets and providers in separate development/preview/production environments.
6. Run security review, integration tests, and load tests. Do not market the service as audited or production-ready until this work is completed.
