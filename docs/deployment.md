# Deployment Guide

## Local setup
1. Use Node.js 22.x.
2. Run `npm install`.
3. Copy `.env.example` to `.env`; use placeholders only in source control.
4. Set `ALLOWED_ORIGINS=http://localhost:5173` locally and exact HTTPS origins in Vercel.
5. Set `OTP_HMAC_SECRET` to at least 32 cryptographically random bytes. Keep it stable across deployments so outstanding OTP digests remain valid.
6. Run `npm test`, then `npm run build`.

## Firebase
1. Create a dedicated Firebase project and Realtime Database.
2. Apply `firebase.rules.json`; confirm unauthenticated client reads/writes are denied.
3. Create a dedicated service account with least privilege.
4. Add database URL, project ID, service-account email and private key to Vercel server-side variables.
5. Keep all application paths under `mschat/`. Do not put service-account keys in RTDB.

## Gmail API
1. Enable Gmail API and configure OAuth consent.
2. Generate a refresh token with `gmail.send` scope.
3. Configure `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` and `GMAIL_SENDER_EMAIL`.
4. Test registration and admin OTP delivery using a real mailbox. CI does not prove delivery.

## Cloudflare R2
1. Create a dedicated private bucket for MS Chat.
2. Add account ID, access key, secret and bucket name to server-side variables.
3. Configure bucket CORS for exact app origins and required PUT/GET/HEAD methods and Content-Type header.
4. Keep keys under `mschat/attachments/` and `mschat/profile-images/`; do not configure a public bucket.
5. Test upload, complete, download, profile image replacement, deletion and cleanup against real R2. Attachment upload is not resumable.

## Web Push
Generate VAPID keys with `npx web-push generate-vapid-keys`. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and a valid `VAPID_SUBJECT`. Test on target browsers; support varies by platform.

## Admin bootstrap
1. Register and verify the intended administrator account.
2. Set `ADMIN_EMAIL` and a long random `ADMIN_BOOTSTRAP_SECRET`.
3. Sign in and visit `/admin.html`; enter the bootstrap secret once.
4. Remove or rotate the bootstrap secret in every Vercel environment immediately after success.
5. Administrator login requires password plus email OTP. Protect the mailbox and OAuth credentials.

## Vercel
1. Import the repository and select the intended branch.
2. Configure Preview and Production environment variables separately.
3. Confirm Node.js 22.x runtime, HTTPS, exact origins, and cron authentication.
4. Configure `CRON_SECRET` and ensure scheduled cleanup invokes the cleanup route with `Authorization: Bearer <CRON_SECRET>`.
5. Deploy only after CI passes, then verify `/api/health`, registration, login persistence, logout, friend requests, messaging, R2, push and cleanup with real services.

## Operational notes
Historical counters are not initialized automatically; dashboard metrics are tracked only since their recorded start time. Account deletion currently queues a pending request but does not finish all data cleanup. Do not run destructive migrations without backup and rollback plans.
