# MS Chat Architecture

## Runtime
- React/Vite serves the browser application and PWA shell.
- `api/index.js` is the single Vercel serverless dispatcher. It maps API route names to handlers in `lib/handlers/`.
- `lib/core.js` owns session validation, Firebase Admin access, validation helpers, OTP HMAC, rate limits and usage counters.
- Firebase Admin SDK accesses the logical `mschat/` RTDB namespace. Browser clients do not receive Firebase credentials and should not have direct database access.
- Cloudflare R2 stores encrypted attachments and private profile images under `mschat/` keys. Browser uploads use short-lived signed URLs.
- Gmail API delivers registration and administrator-login OTPs. Web Push uses server-side VAPID keys.

## Message path
1. Browser encrypts message text using Web Crypto.
2. API validates the cookie session, friendship, membership, blocks, payload shape and idempotency key.
3. API stores ciphertext and server timestamps in RTDB.
4. Recipient polls the authenticated API; ciphertext is decrypted in the browser.
5. Recipient's client submits delivery/read state through an authenticated receipt endpoint.
6. Push is best-effort, generic by default, deduplicated per recipient/message and suppressed when an active session reports the conversation as visible.

## Important protocol limitation
The current cryptographic code is a static P-256 ECDH + HKDF + AES-GCM prototype. It is not a reviewed Signal Protocol implementation and does not provide forward secrecy, ratcheting, post-compromise recovery or a robust multi-device protocol. Fingerprint pinning detects changes on a device after first contact but does not authenticate first contact against a malicious server. Do not market the current version as Signal-equivalent or production-grade E2EE.

## Serverless limitations
Vercel functions are stateless and short-lived. The application uses bounded polling instead of pretending to provide a persistent WebSocket. Polling is paused when the browser tab is hidden. Background cleanup must run through configured Vercel Cron; it is not a permanent worker.

## Removal policy
Removing a friend removes both friendship indexes and prevents further message sends, but existing history remains readable unless blocked or deleted. Blocking prevents new interactions and hides presence, key lookup, attachments and messages through the API. Message deletion for everyone tombstones the payload and attempts to remove the linked R2 object; recipient copies and screenshots cannot be erased.
