# Security Notes and Known Gaps

## Controls present in this branch
- scrypt password hashes with salts; no plaintext passwords.
- Random opaque session cookies with HttpOnly, Secure in production and SameSite=Lax attributes; server stores token hashes.
- Per-user session indexes, password change with session rotation, logout and revoke-other-sessions.
- Registration OTP digest uses HMAC-SHA-256 with server-only `OTP_HMAC_SECRET`; OTPs expire in five minutes, are attempt-limited and resend-throttled.
- Administrator sessions require password plus email OTP. Bootstrap is one-time and secret comparison is constant-time.
- Origin checks on state-changing routes, per-route rate limits, restrictive headers/CSP, and generic errors.
- Server-side conversation membership, friendship, block and attachment ownership checks.
- RTDB direct client access is denied in `firebase.rules.json`; records are under `mschat/`.
- R2 keys are prefix-checked before access/deletion; profile images are signature-checked after upload.
- Private message bodies are not intentionally logged or exposed to the admin dashboard.

## Not yet production-complete
- No independently reviewed Signal Protocol or ratcheting implementation. Current static ECDH/AES-GCM lacks forward secrecy and post-compromise recovery.
- First-contact key authenticity/key transparency is not provided; local fingerprint pinning only warns about later changes on that browser.
- No secure multi-device key transfer or encrypted recovery mechanism.
- Account deletion disables access and queues work, but automated end-to-end cleanup of all account-linked records and objects is not complete.
- Attachment signatures and video duration are checked in the sender's browser before encryption. Since the server receives ciphertext, it cannot independently verify the underlying plaintext file or duration without a different trust model. A malicious client can bypass these checks.
- Direct uploads are not resumable; a failed upload must be restarted.
- Provider-level Firebase/R2 metrics, full API latency/error telemetry, and historical aggregate initialization are not implemented. Admin counters are tracked only from their recorded start time.
- Administrator MFA is email OTP, not TOTP or hardware-backed MFA.
- No independent penetration test, dependency audit report or load test has been completed.

## Release rule
Do not claim production readiness until a reviewed E2EE protocol, complete deletion workflow, Firebase Emulator authorization tests, real Gmail/R2/Web Push integration tests, dependency audit, and realistic load test pass.
