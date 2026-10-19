import { ArrowLeft, ShieldCheck } from 'lucide-react';
export default function Legal({ type }) {
  const privacy = type === 'privacy';
  return <main className="legal-shell">
    <header className="chat-topbar"><a className="brand" href="/"><span className="brand-mark"><ShieldCheck size={20}/></span><span>ms<span className="brand-light">chat</span><i>.</i></span></a><a className="refresh-btn" href="/"><ArrowLeft size={14}/> Back to MS Chat</a></header>
    <article className="legal-document">
      <p className="admin-kicker">{privacy ? 'PRIVACY & DATA' : 'SERVICE TERMS'}</p>
      <h1>{privacy ? 'Privacy Policy' : 'Terms of Use'}</h1>
      <p>Last updated: October 19, 2026. These documents describe the current implementation and are not a substitute for jurisdiction-specific legal advice.</p>
      {privacy ? <>
        <h2>Information we process</h2><p>MS Chat processes account name, username, email address and verification state, a date of birth used for the minimum-age check, profile information, friendships, blocks, message metadata, reports, settings, session records, push subscriptions and security events.</p>
        <h2>Message encryption and its limits</h2><p>The current code encrypts message payloads and attachment contents in the browser using Web Crypto. It uses a static ECDH-derived key and has not yet implemented the reviewed ratcheting protocol, forward secrecy, identity key transparency, or multi-device recovery required by the product specification. It has not received an independent security audit. Do not treat the current implementation as equivalent to Signal or WhatsApp, and do not use it for highly sensitive communications.</p>
        <h2>Metadata and service providers</h2><p>The backend can process account identities, conversation participants, timestamps, message counts, delivery/read state, IP-related rate-limit inputs, attachment metadata and reports. Firebase Realtime Database stores application records under the logical mschat/ namespace. Encrypted attachment objects use the mschat/ prefix in a private Cloudflare R2 bucket. Gmail API sends verification email. Browser push providers and operating systems may receive notification metadata.</p>
        <h2>Browser storage and notifications</h2><p>The app uses a persistent HttpOnly cookie for authentication, localStorage for non-sensitive preferences, IndexedDB for device cryptographic state, and a service worker for app functionality. Push notifications are best-effort and default to generic text; browser and operating-system behavior may expose metadata. Never store passwords or session tokens in browser JavaScript storage.</p>
        <h2>Retention and deletion</h2><p>Sessions and temporary uploads expire through scheduled cleanup. Account deletion currently disables access and queues a pending deletion request; it does not yet guarantee complete automated removal of every record or object. Deleting a message cannot erase screenshots, recipient copies, exports, backups or content already seen.</p>
        <h2>Your choices</h2><p>You can manage profile details, privacy preferences, notification settings, blocks and sessions in the app, and submit a complaint for review. Browser notification permission can also be changed in browser or operating-system settings. Avoid sharing information you would not want retained in message metadata.</p>
      </> : <>
        <h2>Eligibility and account security</h2><p>You must be at least 18 years old, provide accurate account information and protect your credentials. Do not attempt to access another account, bypass a block, abuse reporting, scrape users or disrupt the service.</p>
        <h2>Messages and attachments</h2><p>You are responsible for the content you send and for ensuring you have rights to share it. The service may enforce size, format, abuse and account restrictions. Message deletion does not guarantee erasure from other devices, screenshots or backups.</p>
        <h2>Security and availability</h2><p>MS Chat is under active development. The current encryption implementation is not independently audited and lacks some properties required for a production-grade secure messenger. The service may be unavailable, and push notifications may be delayed or suppressed. Do not rely on it as an emergency service or sole archive.</p>
        <h2>Moderation and account deletion</h2><p>You may block users and submit reports. Administrators may investigate reports and suspend accounts under the service's abuse rules. Account deletion currently enters a pending workflow and may require further processing before cleanup is complete.</p>
        <h2>Changes</h2><p>These terms may be updated as the application changes. Continued use after an update constitutes acceptance where permitted by applicable law. Contact the service through the in-app complaint/support workflow for questions.</p>
      </>}
      <p className="legal-note">Transparency note: this document intentionally does not promise perfect security, guaranteed notification delivery, or complete deletion before those capabilities are verified.</p>
    </article>
  </main>;
}
