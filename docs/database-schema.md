# Firebase Realtime Database Schema

All application records belong below `mschat/`. Server handlers use Firebase Admin SDK; browser clients must not read or write directly.

| Node | Purpose |
|---|---|
| `users/{uid}` | Private account fields, public profile fields, password hash, status, settings and optional profile-image key. Never return password hashes or DOB to other users. |
| `emails/{sha256(normalizedEmail)}` | Unique email index. |
| `usernames/{normalizedUsername}` | Unique username index. |
| `otps/{emailHash}` | HMAC OTP digest, purpose, expiry, attempts and consumed state. |
| `adminLoginChallenges/{uid}` | One-time admin login OTP digest and expiry. |
| `sessions/{tokenHash}` | Session owner, expiry and last activity; no raw session token. |
| `sessionIndex/{uid}/{tokenHash}` | Per-user session metadata for listing and revocation. |
| `friends/{uid}/{otherUid}` | Accepted relationship and conversation ID. |
| `friendRequests/{sortedUidPair}` | Canonical request state. |
| `friendRequestsByUser/{recipientUid}/{requestId}` | Incoming request index. |
| `friendRequestsSentByUser/{senderUid}/{requestId}` | Outgoing request index. |
| `conversations/{conversationId}` | Members and non-plaintext last-message metadata. |
| `messages/{conversationId}/{messageId}` | Ciphertext, IV, sender, server timestamp, receipts and optional attachment ID. |
| `messageIdempotency/{uid}/{key}` | Retry deduplication state. |
| `userConversationState/{uid}/{conversationId}` | Per-user unread IDs, hidden messages, last-read and last-sent state. |
| `presence/{uid}/sessions/{sessionHash}` | Expiring presence per login session/device and active conversation. |
| `typing/{conversationId}/{uid}` | Short-lived typing state. |
| `blocks/{uid}/{otherUid}` | Directional block. Authorization checks both directions. |
| `attachments/{attachmentId}` | Ownership, conversation, R2 key, size, MIME metadata and lifecycle status. |
| `profileImageUploads/{uploadId}` | Short-lived upload metadata for profile images. |
| `pushSubscriptions/{uid}/{subscriptionHash}` | Per-device Web Push subscription. |
| `pushDelivery/{uid}/{dedupeKey}` | Push deduplication state and expiry. |
| `reports/{reportId}`, `complaints/{id}` | Moderation workflows. |
| `adminBootstrapUsed`, `adminAuditLogs` | Admin setup/audit metadata. Roles are enforced on server-side user records. |
| `securityEvents/{id}` | Security events without passwords, OTPs, session tokens, keys or plaintext messages. |
| `usageAggregates/counters/{name}` | Counters with tracking start time; not historical totals. |
| `accountDeletionRequests/{uid}` | Pending deletion workflow; currently requires further processing. |

## Rules and indexes
Apply `firebase.rules.json` to deny direct client reads/writes. Indexes support timestamp pagination. Admin SDK bypasses client rules, so route authorization remains mandatory.

## Migration cautions
Do not reset the database or seed example records in production. New request/session indexes are not automatically backfilled for legacy records; plan an idempotent migration before relying on them for older data.
