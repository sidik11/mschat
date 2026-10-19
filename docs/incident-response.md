# Incident Response

## Suspected account compromise
1. Suspend the account and revoke sessions through the admin dashboard.
2. Ask the user to change their password from a trusted device and review active sessions.
3. Review security events and admin audit logs. Do not copy passwords, OTPs, tokens, keys or private message contents into tickets.
4. Check for unexpected public-key changes and advise contacts to verify fingerprints out of band.

## Suspected leaked server secret
1. Rotate the affected secret in Vercel and its provider immediately.
2. For a leaked Firebase service-account key, revoke it in Google Cloud and create a least-privilege replacement.
3. For R2 keys, revoke and replace the key, then review object access and deletion events.
4. For Gmail OAuth, revoke the refresh token and generate a replacement.
5. Rotate VAPID keys only with a planned subscription migration; existing subscriptions may need renewal.
6. Preserve relevant provider audit evidence without copying sensitive payloads.

## Suspected data exposure
1. Pause affected routes or deployments without weakening authentication or Firebase rules.
2. Determine whether exposure involved account data, message metadata, encrypted payloads, profile images or a server secret.
3. Inspect Vercel, Firebase and Cloudflare logs/metrics where available.
4. Notify affected users and authorities where legally required.
5. Document scope, containment, recovery and follow-up tests.

## Recovery limitations
The implementation is not independently audited. Static ECDH does not provide forward secrecy, and account deletion cleanup is incomplete. Treat suspected compromise of deployed JavaScript or server secrets as potentially affecting message confidentiality.
