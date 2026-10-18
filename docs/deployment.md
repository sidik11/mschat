# Deployment setup (foundation)

## Local prerequisites

- Node.js 22 or newer and npm.
- A Firebase project with Realtime Database.
- Gmail API OAuth client and refresh token for sending verification email.
- Cloudflare R2 private bucket for future attachment support.
- Vercel project connected to this repository.

## Local setup

1. Clone the repository and run `npm install`.
2. Copy `.env.example` to `.env` and replace placeholders locally. Never commit `.env`.
3. Set Firebase Admin service-account values in server-only environment variables.
4. Configure Gmail API OAuth credentials if testing registration email delivery.
5. Run `npm run dev`; run `npm run build` to verify the frontend build.
6. Use `npm test` for the Node test suite (additional tests are still required).

## Firebase

1. Create a dedicated RTDB for MS Chat or use a database whose data is safely isolated.
2. Deploy `firebase.rules.json` as restrictive rules; Admin SDK server operations bypass these rules, so API authorization is mandatory.
3. Keep all app records under `mschat/`; never run a destructive reset in a shared database.
4. Do not enable account creation until atomic email/username reservations and concurrency tests are complete.

## Vercel environment

Add server-only variables from `.env.example` to Vercel's Project Settings for Development, Preview, and Production as appropriate. Do not use `VITE_` prefixes for secrets. Deploy only after configuring the variables required by the enabled routes.

## Release status

The current code is a foundation build and is not a production messaging application. E2EE, secure session lifecycle, message APIs, R2 upload/download, push, admin security, and full test coverage are outstanding. Do not enable production user registration or represent the service as secure messaging until these are implemented and verified.
