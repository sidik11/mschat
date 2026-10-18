# MS Chat

MS Chat is a privacy-conscious, mobile-first messaging app foundation.

## Current status

This repository is **not yet a working or production-ready messaging service**. The current UI and theme toggle are implemented, but registration and login endpoints intentionally return `503` until secure authentication is completed. Messaging, end-to-end encryption, sessions, email verification, file transfers, push notifications, and admin workflows are not yet implemented.

## Stack

- React + Vite
- Vercel serverless API routes
- Firebase Realtime Database via Firebase Admin SDK (server-only)
- Planned: Gmail API, Cloudflare R2, Web Push

## Local development

1. Install Node.js 22+ and npm.
2. Run `npm install`.
3. Copy `.env.example` to `.env` for local configuration.
4. Run `npm run dev`.
5. Run `npm test` and `npm run build`.

## Vercel setup

The `.env.example` file is a **template**, not a ready-to-use set of credentials. Do not paste placeholder values into Vercel expecting integrations to work. Add only real values for features that are implemented and enabled. Use Vercel Project Settings → Environment Variables; never commit `.env` or expose server secrets using a `VITE_` prefix.

## Security

Firebase rules in `firebase.rules.json` deny direct client reads and writes. Admin SDK access bypasses those rules, so server-side authorization is still required. Do not enable real users or send private messages until authentication, authorization, session security, encryption, and integration tests are complete.
