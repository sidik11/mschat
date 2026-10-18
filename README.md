# MS Chat

MS Chat is a privacy-conscious, mobile-first one-to-one messaging application. This repository is being bootstrapped from the agreed master development specification.

## Status

This initial commit establishes the project foundation. It is **not yet production-ready**: secure authentication, verified email OTP delivery, established-protocol end-to-end encryption, attachments, push notifications, admin bootstrap, and external-service integration must be implemented and tested before launch.

## Planned stack

- React + Vite frontend
- Vercel serverless API routes
- Firebase Realtime Database through Firebase Admin SDK
- Cloudflare R2 private object storage
- Gmail API for email verification
- HTTP-only persistent session cookies

## Local development

See `.env.example` and `docs/deployment.md` as they are added. Never commit real credentials or `.env` files.
