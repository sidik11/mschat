import { useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, Plus, Send, MessageCircle, ShieldCheck, Users, CheckCheck, Check, Bell, RefreshCw, Search, Paperclip, Download, FileText, Settings, Trash2, UserRoundX } from 'lucide-react';
import { getOrCreateDeviceKey, getConversationAesKey, encryptText, decryptText, encryptBytes, decryptBytes, checkRemoteKey, trustRemoteKey, encryptAttachmentBytes, decryptAttachmentBytes } from './chat-crypto.js';

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || 'Request failed');
  return data;
}
const post = (url, body) => api(url, { method: 'POST', body: JSON.stringify(body) });
function uploadWithProgress(url, buffer, onProgress, contentType = 'application/octet-stream') { return new Promise((resolve, reject) => { const xhr = new XMLHttpRequest(); xhr.open('PUT', url); xhr.setRequestHeader('Content-Type', contentType); xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); }; xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('File upload failed (' + xhr.status + ').')); xhr.onerror = () => reject(new Error('Network error during upload.')); xhr.send(buffer); }); }

export default function Chat({ user, onLogout }) {
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [unreadMessageIds, setUnreadMessageIds] = useState([]);
  const [olderMessageCursor, setOlderMessageCursor] = useState(null);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [conversationCursor, setConversationCursor] = useState(null);
  const [loadingOlderConversations, setLoadingOlderConversations] = useState(false);
  const [draft, setDraft] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [privateKey, setPrivateKey] = useState(null);
  const [myPublicKey, setMyPublicKey] = useState(null);
  const [remoteKey, setRemoteKey] = useState(null);
  const [remoteFingerprint, setRemoteFingerprint] = useState('');
  const [search, setSearch] = useState('');
  const [isFriendTyping, setIsFriendTyping] = useState(false);
  const [transferProgress, setTransferProgress] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [complaintSubject, setComplaintSubject] = useState('');
  const [complaintDescription, setComplaintDescription] = useState('');
  const [myComplaints, setMyComplaints] = useState([]);
  const fileInput = useRef(null);
  const avatarInput = useRef(null);
  const pendingTextIdempotency = useRef({ draft: '', key: '' });
  const pendingUploadIdempotency = useRef(new Map());
  const [profile, setProfile] = useState(null);
  const [profileName, setProfileName] = useState(user.fullName || '');
  const [profileBio, setProfileBio] = useState('');
  const [profileDob, setProfileDob] = useState('');
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [privacySettings, setPrivacySettings] = useState({ lastSeenVisibility: 'friends', onlineVisibility: 'friends', readReceiptsEnabled: true, notificationsEnabled: false, notificationPrivacy: 'generic' });
  const [userSearch, setUserSearch] = useState('');
  const [sessions, setSessions] = useState([]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [pushState, setPushState] = useState('');
  const activeFriend = useMemo(() => friends.find(f => f.id === active) || null, [friends, active]);

  async function refresh() {
    const [data, conversationData] = await Promise.all([api('/api/friends'), api('/api/conversations')]);
    const page = (conversationData.conversations || []).map(item => ({ ...item.friend, conversationId: item.conversationId, unreadCount: item.unreadCount || 0, lastMessageAt: item.updatedAt || 0 }));
    const requestedConversation = new URLSearchParams(window.location.search).get('conversation');
    if (requestedConversation) {
      let match = page.find(friend => friend.conversationId === requestedConversation);
      if (!match) {
        try {
          const requested = await api('/api/conversations?conversationId=' + encodeURIComponent(requestedConversation));
          if (requested.conversation) { match = { ...requested.conversation.friend, conversationId: requested.conversation.conversationId, unreadCount: requested.conversation.unreadCount || 0, lastMessageAt: requested.conversation.updatedAt || 0 }; page.unshift(match); }
        } catch {}
      }
      if (match) setActive(match.id);
    }
    setFriends(current => {
      const pageIds = new Set(page.map(friend => friend.id));
      const preserved = current.filter(friend => !pageIds.has(friend.id));
      return [...page, ...preserved];
    });
    setIncoming(data.incoming || []); setOutgoing(data.outgoing || []);
    setConversationCursor(current => current ?? conversationData.nextCursor ?? null);
  }
  async function loadOlderConversations() {
    if (!conversationCursor || loadingOlderConversations) return;
    setLoadingOlderConversations(true);
    try {
      const pageData = await api('/api/conversations?before=' + encodeURIComponent(conversationCursor));
      const page = (pageData.conversations || []).map(item => ({ ...item.friend, conversationId: item.conversationId, unreadCount: item.unreadCount || 0, lastMessageAt: item.updatedAt || 0 }));
      setFriends(current => { const ids = new Set(current.map(friend => friend.id)); return [...current, ...page.filter(friend => !ids.has(friend.id))]; });
      setConversationCursor(pageData.nextCursor || null);
    } catch (e) { setError(e.message); } finally { setLoadingOlderConversations(false); }
  }
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pair = await getOrCreateDeviceKey(user.id);
        await post('/api/keys', { publicKey: pair.publicJwk });
        const me = await api('/api/keys');
        if (!cancelled) { setPrivateKey(pair.privateKey); setMyPublicKey(me.publicKey || pair.publicJwk); }
        await refresh();
        const [profileData, settingsData, blocksData] = await Promise.all([api('/api/profile'), api('/api/settings'), api('/api/blocks')]);
        if (!cancelled) {
          setProfile(profileData.profile); setProfileName(profileData.profile.fullName || ''); setProfileBio(profileData.profile.bio || ''); setProfileDob(profileData.profile.dateOfBirth || '');
          setPrivacySettings(settingsData.settings); setBlockedUsers(blocksData.blocks || []);
        }
      } catch (e) { if (!cancelled) setError(e.message); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const heartbeat = () => { if (document.visibilityState === 'visible') post('/api/presence', { conversationId: activeFriend?.conversationId || '' }).catch(() => {}); };
    heartbeat();
    const timer = setInterval(heartbeat, 45000);
    document.addEventListener('visibilitychange', heartbeat);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', heartbeat); };
  }, [activeFriend?.conversationId]);

  useEffect(() => {
    const online = () => setIsOnline(true), offline = () => setIsOnline(false);
    window.addEventListener('online', online); window.addEventListener('offline', offline);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, []);

  useEffect(() => { return () => { if (attachmentPreview?.url) URL.revokeObjectURL(attachmentPreview.url); }; }, [attachmentPreview?.url]);

  useEffect(() => {
    const timer = setInterval(() => refresh().catch(() => {}), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!activeFriend) { setMessages([]); setUnreadMessageIds([]); setRemoteKey(null); setRemoteFingerprint(''); setIsFriendTyping(false); return; }
    let cancelled = false;
    setRemoteKey(null); setRemoteFingerprint('');
    (async () => {
      try {
        const keyData = await api('/api/keys?username=' + encodeURIComponent(activeFriend.username));
        if (!keyData.publicKey) throw new Error('This contact has not set up an encryption key on this device yet.');
        const trust = await checkRemoteKey(activeFriend.id, keyData.publicKey);
        if (trust.changed) {
          const accepted = window.confirm('SECURITY WARNING: ' + activeFriend.fullName + ' has a different encryption key than the one pinned on this device. This can happen after reinstalling or could indicate impersonation. Verify the new fingerprint with them through another channel before continuing.\n\nPrevious: ' + trust.previous + '\nNew: ' + trust.fingerprint + '\n\nAccept this key change?');
          if (!accepted) throw new Error('Encryption key changed. Messaging is paused until you verify and accept the new key.');
          await trustRemoteKey(activeFriend.id, keyData.publicKey);
        }
        const key = await getConversationAesKey(privateKey, keyData.publicKey);
        if (cancelled) return;
        setRemoteKey(key); setRemoteFingerprint(trust.fingerprint);
        const data = await api('/api/messages?conversationId=' + encodeURIComponent(activeFriend.conversationId));
        const decoded = await Promise.all((data.messages || []).map(async m => {
          try {
            const clear = await decryptText(key, m.ciphertext, m.iv);
            try { const payload = JSON.parse(clear); if (payload?.type === 'attachment' && /^[a-f0-9]{32}$/.test(payload.attachmentId || '')) return { ...m, text: payload.fileName || 'Encrypted attachment', attachment: payload }; } catch {}
            return { ...m, text: clear };
          } catch { return { ...m, text: 'Unable to decrypt on this device' }; }
        }));
        if (!cancelled) { setMessages(decoded); setUnreadMessageIds(data.unreadMessageIds || []); setOlderMessageCursor(data.nextCursor || null); }
      } catch (e) { if (!cancelled) { setMessages([]); setError(e.message); } }
    })();
    return () => { cancelled = true; };
  }, [activeFriend?.conversationId, activeFriend?.username, privateKey]);

  useEffect(() => {
    if (!activeFriend || !remoteKey) return;
    let cancelled = false;
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const data = await api('/api/messages?conversationId=' + encodeURIComponent(activeFriend.conversationId));
        const decoded = await Promise.all((data.messages || []).map(async m => {
          try {
            const clear = await decryptText(remoteKey, m.ciphertext, m.iv);
            try { const payload = JSON.parse(clear); if (payload?.type === 'attachment' && /^[a-f0-9]{32}$/.test(payload.attachmentId || '')) return { ...m, text: payload.fileName || 'Encrypted attachment', attachment: payload }; } catch {}
            return { ...m, text: clear };
          } catch { return { ...m, text: 'Unable to decrypt on this device' }; }
        }));
        if (cancelled) return;
        setUnreadMessageIds(data.unreadMessageIds || []);
        setMessages(current => { const latestIds = new Set(decoded.map(m => m.id)); return [...current.filter(m => !latestIds.has(m.id)), ...decoded]; });
        const typingState = await api('/api/typing?conversationId=' + encodeURIComponent(activeFriend.conversationId));
        if (!cancelled) setIsFriendTyping(Boolean(typingState.typing));
        const unreadIds = new Set(data.unreadMessageIds || []);
        const unread = decoded.filter(m => m.senderId !== user.id && !m.deletedForEveryone && unreadIds.has(m.id));
        for (const m of unread) {
          try {
            if (!m.deliveredTo?.[user.id]) await post('/api/messages/receipt', { conversationId: activeFriend.conversationId, messageId: m.id, state: 'delivered' });
            await post('/api/messages/receipt', { conversationId: activeFriend.conversationId, messageId: m.id, state: 'read', shareReceipt: privacySettings.readReceiptsEnabled });
          } catch {}
        }
        if (unread.length) setUnreadMessageIds(current => current.filter(id => !unreadIds.has(id)));
      } catch {}
    };
    poll();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') poll(); }, 8000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [activeFriend?.conversationId, remoteKey, user.id, privacySettings.readReceiptsEnabled]);

  async function sendFile(file) {
    if (!activeFriend || !remoteKey || !file) return;
    if (file.size < 1 || file.size > 50 * 1024 * 1024) { setError('Choose a file between 1 byte and 50 MB.'); return; }
    const mimeType = file.type || 'application/octet-stream';
    const supportedTypes = ['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm','application/pdf','text/plain','application/zip','application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation'];
    if (!supportedTypes.includes(mimeType) || !(await hasExpectedSignature(file,mimeType))) { setError('The file type or content signature is unsupported or invalid.'); return; }
    const mediaType = mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : 'document';
    if (mediaType === 'video') {
      const duration = await new Promise(resolve => { const video = document.createElement('video'); const url = URL.createObjectURL(file); video.preload = 'metadata'; video.onloadedmetadata = () => { const d = video.duration; URL.revokeObjectURL(url); resolve(d); }; video.onerror = () => { URL.revokeObjectURL(url); resolve(Infinity); }; video.src = url; });
      if (!Number.isFinite(duration) || duration > 30) { setError('Videos must be valid and no longer than 30 seconds.'); return; }
    }
    setBusy(true); setError(''); setTransferProgress({ name: file.name, progress: 0, phase: 'Encrypting locally' });
    try {
      const uploadFingerprint = [file.name, file.size, file.lastModified].join(':');
      if (!pendingUploadIdempotency.current.has(uploadFingerprint)) pendingUploadIdempotency.current.set(uploadFingerprint, crypto.randomUUID());
      const encrypted = await encryptAttachmentBytes(await file.arrayBuffer());
      setTransferProgress({ name: file.name, progress: 5, phase: 'Preparing private upload' });
      const upload = await post('/api/attachments/upload-url', { conversationId: activeFriend.conversationId, fileName: file.name, size: file.size, mimeType, mediaType });
      await uploadWithProgress(upload.uploadUrl, encrypted.buffer, progress => setTransferProgress({ name: file.name, progress, phase: 'Uploading encrypted file' }));
      const complete = await post('/api/attachments/complete', { attachmentId: upload.attachmentId });
      const payload = { type: 'attachment', attachmentId: complete.attachment.id, fileName: file.name, mimeType, mediaType, size: file.size, fileKey: encrypted.fileKey, fileIv: encrypted.iv };
      const encryptedMessage = await encryptText(remoteKey, JSON.stringify(payload));
      const result = await post('/api/messages', { conversationId: activeFriend.conversationId, ...encryptedMessage, keyVersion: 1, attachmentId: payload.attachmentId, idempotencyKey: pendingUploadIdempotency.current.get(uploadFingerprint) });
      pendingUploadIdempotency.current.delete(uploadFingerprint);
      setMessages(old => [...old, { id: result.id, senderId: user.id, text: file.name, attachment: payload, createdAt: result.createdAt, deliveredTo: {}, readBy: {} }]);
      setTransferProgress({ name: file.name, progress: 100, phase: 'Sent securely' });
      setTimeout(() => setTransferProgress(null), 2500);
    } catch (e) { setError(e.message); setTransferProgress(null); }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  }
  async function viewAttachment(attachment) {
    if (!remoteKey || !['image','video'].includes(attachment.mediaType)) return;
    setPreviewLoading(true); setError('');
    try {
      const info = await post('/api/attachments/download-url', { attachmentId: attachment.attachmentId });
      const response = await fetch(info.downloadUrl); if (!response.ok) throw new Error('Could not load the encrypted attachment.');
      const encrypted = await response.arrayBuffer(), clear = await decryptAttachmentBytes(attachment.fileKey, encrypted, attachment.fileIv);
      const blob = new Blob([clear], { type: attachment.mimeType || 'application/octet-stream' }), url = URL.createObjectURL(blob);
      setAttachmentPreview({ url, name: attachment.fileName || 'Attachment', mediaType: attachment.mediaType, mimeType: attachment.mimeType });
    } catch (e) { setError(e.message); } finally { setPreviewLoading(false); }
  }
  async function downloadFile(attachment) {
    if (!remoteKey) return;
    setError('');
    try {
      const info = await post('/api/attachments/download-url', { attachmentId: attachment.attachmentId });
      const response = await fetch(info.downloadUrl);
      if (!response.ok) throw new Error('Could not download the encrypted file.');
      const encrypted = await response.arrayBuffer();
      const clear = await decryptAttachmentBytes(attachment.fileKey, encrypted, attachment.fileIv);
      const blob = new Blob([clear], { type: attachment.mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = attachment.fileName || 'attachment'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e.message); }
  }

  async function addFriend(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try { await post('/api/friends/request', { username }); setUsername(''); setError('Friend request sent.'); await refresh(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function respond(requestId, action) {
    try { await post('/api/friends', { requestId, action }); await refresh(); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => {
    if (!activeFriend) return;
    const conversationId = activeFriend.conversationId;
    const setTyping = isTyping => post('/api/typing', { conversationId, isTyping }).catch(() => {});
    if (!draft.trim()) { setTyping(false); return; }
    setTyping(true);
    const timer = setInterval(() => setTyping(true), 2500);
    return () => { clearInterval(timer); setTyping(false); };
  }, [activeFriend?.conversationId, Boolean(draft.trim())]);

  async function send(e) {
    e.preventDefault();
    if (!activeFriend || !remoteKey || !draft.trim()) return;
    setBusy(true); setError('');
    try {
      const messageText = draft.trim();
      if (pendingTextIdempotency.current.draft !== messageText) pendingTextIdempotency.current = { draft: messageText, key: crypto.randomUUID() };
      const encrypted = await encryptText(remoteKey, messageText);
      const result = await post('/api/messages', { conversationId: activeFriend.conversationId, ...encrypted, keyVersion: 1, idempotencyKey: pendingTextIdempotency.current.key });
      setMessages(old => [...old, { id: result.id, senderId: user.id, text: draft.trim(), createdAt: result.createdAt, deliveredTo: {}, readBy: {} }]);
      setDraft(''); pendingTextIdempotency.current = { draft: '', key: '' };
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function loadSessions() { try { const data = await api('/api/security'); setSessions(data.sessions || []); } catch (e) { setSettingsMessage(e.message); } }
  async function revokeOtherSessions() { try { const data = await post('/api/security', { action: 'revoke-others' }); setSettingsMessage('Revoked ' + data.revoked + ' other session(s).'); await loadSessions(); } catch (e) { setSettingsMessage(e.message); } }
  async function changePassword(e) { e.preventDefault(); setBusy(true); setSettingsMessage(''); try { await post('/api/security', { action: 'change-password', currentPassword, newPassword }); setCurrentPassword(''); setNewPassword(''); setSettingsMessage('Password changed. Other sessions were revoked.'); await loadSessions(); } catch (e) { setSettingsMessage(e.message); } finally { setBusy(false); } }
  async function searchUsers(value) {
    setUserSearch(value);
    const q = value.trim().replace(/^@/, '').toLowerCase();
    if (q.length < 2) { setSearchResults([]); return; }
    try { const data = await api('/api/users?q=' + encodeURIComponent(q)); setSearchResults(data.users || []); } catch { setSearchResults([]); }
  }
  async function uploadProfileImage(file) {
    if (!file) return;
    if (file.size < 1 || file.size > 5 * 1024 * 1024 || !['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)) { setSettingsMessage('Choose a JPEG, PNG, WebP or AVIF image up to 5 MB.'); return; }
    setBusy(true); setSettingsMessage('Uploading profile image…');
    try {
      const upload = await post('/api/profile-image', { action: 'upload-url', size: file.size, mimeType: file.type });
      await uploadWithProgress(upload.uploadUrl, await file.arrayBuffer(), () => {}, file.type);
      const result = await post('/api/profile-image', { action: 'complete', id: upload.id });
      setProfile(p => ({ ...(p || {}), avatarUrl: result.avatarUrl })); setSettingsMessage('Profile image updated.'); await refresh();
    } catch (e) { setSettingsMessage(e.message); } finally { setBusy(false); if (avatarInput.current) avatarInput.current.value = ''; }
  }
  async function removeProfileImage() {
    try { await post('/api/profile-image', { action: 'delete' }); setProfile(p => ({ ...(p || {}), avatarUrl: null })); setSettingsMessage('Profile image removed.'); await refresh(); }
    catch (e) { setSettingsMessage(e.message); }
  }
  async function saveProfile(e) {
    e.preventDefault(); setBusy(true); setSettingsMessage('');
    try {
      const data = await post('/api/profile', { fullName: profileName, bio: profileBio, ...(profileDob ? { dateOfBirth: profileDob } : {}) });
      setProfile(data.profile); setSettingsMessage('Profile saved.');
    } catch (e) { setSettingsMessage(e.message); } finally { setBusy(false); }
  }
  async function savePrivacySettings() {
    setBusy(true); setSettingsMessage('');
    try {
      if (privacySettings.notificationsEnabled) {
        if (Notification.permission !== 'granted') { setBusy(false); await enableNotifications(); return; }
      } else if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration('/');
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) { await api('/api/push/subscribe', { method: 'DELETE', body: JSON.stringify(subscription.toJSON()) }); await subscription.unsubscribe(); }
      }
      const data = await post('/api/settings', privacySettings); setPrivacySettings(data.settings); setSettingsMessage('Privacy settings saved.');
    }
    catch (e) { setSettingsMessage(e.message); } finally { setBusy(false); }
  }
  async function loadBlockedUsers() { try { const d = await api('/api/blocks'); setBlockedUsers(d.blocks || []); } catch (e) { setError(e.message); } }
  async function unblockUser(id) {
    try { await post('/api/blocks', { userId: id, action: 'unblock' }); await loadBlockedUsers(); setSettingsMessage('User unblocked.'); }
    catch (e) { setSettingsMessage(e.message); }
  }
  async function requestAccountDeletion() {
    if (!window.confirm('Disable this account and start the deletion workflow? Cleanup may require administrator processing.')) return;
    const confirmation = window.prompt('Type your username to confirm account deletion:');
    if (confirmation !== user.username) { setSettingsMessage('Username confirmation did not match.'); return; }
    try { await api('/api/account', { method: 'DELETE', body: JSON.stringify({ confirmation }) }); await onLogout(); }
    catch (e) { setSettingsMessage(e.message); }
  }
  async function loadOlderMessages() {
    if (!activeFriend || !remoteKey || !olderMessageCursor || loadingOlderMessages) return;
    setLoadingOlderMessages(true);
    try {
      const data = await api('/api/messages?conversationId=' + encodeURIComponent(activeFriend.conversationId) + '&before=' + encodeURIComponent(olderMessageCursor));
      const decoded = await Promise.all((data.messages || []).map(async m => {
        if (m.deletedForEveryone) return { ...m, text: 'This message was deleted.' };
        try { const clear = await decryptText(remoteKey, m.ciphertext, m.iv); try { const payload = JSON.parse(clear); if (payload?.type === 'attachment' && /^[a-f0-9]{32}$/.test(payload.attachmentId || '')) return { ...m, text: payload.fileName || 'Encrypted attachment', attachment: payload }; } catch {} return { ...m, text: clear }; }
        catch { return { ...m, text: 'Unable to decrypt on this device' }; }
      }));
      setMessages(current => { const existing = new Set(current.map(m => m.id)); return [...decoded.filter(m => !existing.has(m.id)), ...current]; });
      const unreadIds = new Set(data.unreadMessageIds || []);
      for (const m of decoded.filter(m => m.senderId !== user.id && unreadIds.has(m.id) && !m.deletedForEveryone)) {
        try { if (!m.deliveredTo?.[user.id]) await post('/api/messages/receipt', { conversationId: activeFriend.conversationId, messageId: m.id, state: 'delivered' }); await post('/api/messages/receipt', { conversationId: activeFriend.conversationId, messageId: m.id, state: 'read', shareReceipt: privacySettings.readReceiptsEnabled }); } catch {}
      }
      setUnreadMessageIds(current => current.filter(id => !(data.unreadMessageIds || []).includes(id)));
      setOlderMessageCursor(data.nextCursor || null);
    } catch (e) { setError(e.message); } finally { setLoadingOlderMessages(false); }
  }
  async function deleteMessageAction(message, scope) {
    if (!activeFriend) return;
    try {
      await post('/api/messages/delete', { conversationId: activeFriend.conversationId, messageId: message.id, scope });
      if (scope === 'me') setMessages(old => old.filter(m => m.id !== message.id));
      else setMessages(old => old.map(m => m.id === message.id ? { ...m, deletedForEveryone: true, ciphertext: null, iv: null, text: 'This message was deleted.' } : m));
    } catch (e) { setError(e.message); }
  }
  async function toggleMuteActiveConversation() {
    if (!activeFriend) return;
    const mutedConversations = { ...(privacySettings.mutedConversations || {}), [activeFriend.conversationId]: !(privacySettings.mutedConversations || {})[activeFriend.conversationId] };
    try { const data = await post('/api/settings', { mutedConversations }); setPrivacySettings(data.settings); setPushState(mutedConversations[activeFriend.conversationId] ? 'Conversation muted.' : 'Conversation unmuted.'); }
    catch (e) { setError(e.message); }
  }
  async function reportActiveFriend() {
    if (!activeFriend) return;
    const category = window.prompt('Report category: spam, harassment, impersonation, threats, or other');
    if (!category) return;
    const details = window.prompt('Describe the concern (at least 10 characters).');
    if (!details) return;
    try { await post('/api/reports', { targetUserId: activeFriend.id, category: category.trim().toLowerCase(), details }); setPushState('Report submitted for review.'); }
    catch (e) { setError(e.message); }
  }
  async function blockActiveFriend() {
    if (!activeFriend || !window.confirm('Block this user? New messages and attachments will be disabled in this conversation.')) return;
    try { await post('/api/blocks', { userId: activeFriend.id, action: 'block' }); setFriends(old=>old.filter(friend=>friend.id!==activeFriend.id)); setActive(null); await refresh(); await loadBlockedUsers(); }
    catch (e) { setError(e.message); }
  }
  async function removeActiveFriend() {
    if (!activeFriend || !window.confirm('Remove this contact? The conversation history is not erased.')) return;
    try { await post('/api/friends', { userId: activeFriend.id, action: 'remove-friend' }); setFriends(old=>old.filter(friend=>friend.id!==activeFriend.id)); setActive(null); await refresh(); }
    catch (e) { setError(e.message); }
  }
  async function loadComplaints() { try { const d = await api('/api/complaints'); setMyComplaints(d.complaints || []); } catch (e) { setError(e.message); } }
  async function submitComplaint(e) { e.preventDefault(); setBusy(true); try { await post('/api/complaints', { subject: complaintSubject, description: complaintDescription }); setComplaintSubject(''); setComplaintDescription(''); await loadComplaints(); setPushState('Complaint submitted.'); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function enableNotifications() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Push notifications are not supported by this browser.');
      const key = await api('/api/push/public-key');
      if (!key.publicKey) throw new Error('Push notifications are not configured on the server yet.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notification permission was not granted.');
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(atob(key.publicKey.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0)) });
      await post('/api/push/subscribe', subscription.toJSON());
      await post('/api/settings', { notificationsEnabled: true });
      setPrivacySettings(s=>({...s,notificationsEnabled:true}));
      setPushState('Notifications enabled');
    } catch (e) { setPushState(e.message); }
  }
  const visibleFriends = friends.filter(f => (f.fullName + ' ' + f.username).toLowerCase().includes(search.toLowerCase()));

  return <main className="chat-app">
    <header className="chat-topbar"><a className="brand" href="/"><span className="brand-mark"><MessageCircle size={21}/></span><span>ms<span className="brand-light">chat</span><i>.</i></span></a><div className="chat-user"><span className="user-avatar">{(profile?.avatarUrl || user.avatarUrl) ? <img className="avatar-image" src={profile?.avatarUrl || user.avatarUrl} alt="Your profile"/> : (profile?.fullName || user.fullName || 'U').slice(0,1).toUpperCase()}</span><span>{profile?.fullName || user.fullName}</span><button className="chat-icon-btn" onClick={enableNotifications} title="Enable notifications"><Bell size={17}/></button><button className="chat-icon-btn" onClick={()=>{setSettingsOpen(true);loadComplaints();loadSessions()}} title="User settings"><Settings size={17}/></button><button className="chat-icon-btn" onClick={onLogout} title="Logout"><LogOut size={17}/></button></div></header>
    <div className="chat-layout">
      <aside className="contacts-panel">
        <div className="panel-heading"><div><h2>Messages</h2><p>Private one-to-one chats</p></div><span className="online-pill"><span/> Protected</span></div>
        <form className="friend-add" onSubmit={addFriend}><input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Add by username" maxLength={24} required/><button disabled={busy} aria-label="Send friend request"><Plus size={18}/></button></form><div className="directory-search"><input value={userSearch} onChange={e=>searchUsers(e.target.value)} placeholder="Find people by username" aria-label="Search users"/>{searchResults.map(result=><button key={result.id} type="button" onClick={()=>setUsername(result.username)}><span><strong>{result.fullName}</strong><small>@{result.username}</small></span><Plus size={15}/></button>)}</div>
        {incoming.length > 0 && <section className="incoming-list"><h3>Friend requests</h3>{incoming.map(r=><div className="incoming-item" key={r.requestId}><span>@{r.user.username}</span><button onClick={()=>respond(r.requestId,'accept')}>Accept</button><button className="muted-btn" onClick={()=>respond(r.requestId,'reject')}>Ignore</button></div>)}</section>}{outgoing.length > 0 && <section className="incoming-list"><h3>Sent requests</h3>{outgoing.map(r=><div className="incoming-item" key={r.requestId}><span>@{r.user.username}</span><button className="muted-btn" onClick={()=>respond(r.requestId,'cancel')}>Cancel</button></div>)}</section>}
        <div className="contact-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search contacts"/></div>
        <div className="contact-list">{visibleFriends.map(f=><button key={f.id} className={'contact-item '+(active===f.id?'selected':'')} onClick={()=>setActive(f.id)}><span className="contact-avatar">{f.avatarUrl ? <img className="avatar-image" src={f.avatarUrl} alt="" loading="lazy"/> : f.fullName.slice(0,1).toUpperCase()}</span><span className="contact-copy"><strong>{f.fullName}</strong><small>@{f.username}</small><em>{f.unreadCount ? f.unreadCount + ' unread' : (f.lastMessageAt ? new Date(f.lastMessageAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : 'Encrypted conversation')}</em></span>{f.unreadCount>0&&<span className="unread-badge">{f.unreadCount>99?'99+':f.unreadCount}</span>}</button>)}{visibleFriends.length===0&&<div className="empty-contacts"><Users size={24}/><p>No contacts yet</p><small>Add a friend by username to start a conversation.</small></div>}</div>
        {conversationCursor&&<button className="refresh-btn" disabled={loadingOlderConversations} onClick={loadOlderConversations}>{loadingOlderConversations?'Loading…':'Load older conversations'}</button>}
        <button className="refresh-btn" onClick={()=>refresh()}><RefreshCw size={14}/> Refresh contacts</button>
      </aside>
      <section className="conversation-panel">
        {!activeFriend ? <div className="chat-empty"><span className="empty-logo"><MessageCircle size={32}/></span><h2>Your conversations, your space.</h2><p>Choose a contact or add a friend to begin an encrypted chat.</p><div><ShieldCheck size={16}/> Message content is encrypted in your browser before sending.</div></div> :
          <><div className="conversation-head"><span className="contact-avatar">{activeFriend.avatarUrl ? <img className="avatar-image" src={activeFriend.avatarUrl} alt=""/> : activeFriend.fullName.slice(0,1).toUpperCase()}</span><div><strong>{activeFriend.fullName}</strong><small>@{activeFriend.username} · {activeFriend.online?'Online':'Offline'} · <ShieldCheck size={12}/> Client-side encrypted</small>{remoteFingerprint&&<small className="key-fingerprint">Key fingerprint · verify out of band: {remoteFingerprint.split(' ').slice(0,6).join(' ')}</small>}</div><button className="chat-icon-btn" onClick={removeActiveFriend} aria-label="Remove friend" title="Remove contact"><Users size={16}/></button><button className="chat-icon-btn" onClick={toggleMuteActiveConversation} aria-label={privacySettings.mutedConversations?.[activeFriend.conversationId]?'Unmute conversation':'Mute conversation'} title={privacySettings.mutedConversations?.[activeFriend.conversationId]?'Unmute notifications':'Mute notifications'}><Bell size={16} style={{opacity: privacySettings.mutedConversations?.[activeFriend.conversationId] ? 0.5 : 1}}/></button><button className="chat-icon-btn" onClick={reportActiveFriend} aria-label="Report user" title="Report user"><ShieldCheck size={16}/></button><button className="chat-icon-btn" onClick={blockActiveFriend} aria-label="Block user" title="Block user"><UserRoundX size={16}/></button></div>
          {!isOnline&&<div className="network-banner" role="status">You are offline. Your draft stays here; sending will resume when you reconnect.</div>}<div className="message-list">{olderMessageCursor&&<button className="refresh-btn" disabled={loadingOlderMessages} onClick={loadOlderMessages}>{loadingOlderMessages?'Loading…':'Load older messages'}</button>}{messages.map(m=><React.Fragment key={m.id}>{unreadMessageIds.includes(m.id)&&<div className="unread-separator">Unread messages</div>}<div className={'message-row '+(m.senderId===user.id?'mine':'theirs')}><div className="message-bubble">{m.deletedForEveryone ? <em>This message was deleted.</em> : m.attachment ? <div className="attachment-row"><button className="attachment-message" onClick={()=>downloadFile(m.attachment)}><FileText size={17}/><span><strong>{m.attachment.fileName}</strong><small>{Math.max(1,Math.round(m.attachment.size/1024))} KB · encrypted file</small></span><Download size={15}/></button>{['image','video'].includes(m.attachment.mediaType)&&<button className="attachment-preview" onClick={()=>viewAttachment(m.attachment)} disabled={previewLoading}>{previewLoading?'Loading…':'View'}</button>}</div> : m.text}<small>{new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}{m.senderId===user.id&&(Object.keys(m.readBy||{}).length?<CheckCheck className="read-receipt" size={13}/>:Object.keys(m.deliveredTo||{}).length?<CheckCheck size={13}/>:<Check size={13}/>)}</small><div className="message-actions"><button type="button" onClick={()=>deleteMessageAction(m,'me')} title="Hide this message for you"><Trash2 size={12}/> Delete for me</button>{m.senderId===user.id&&!m.deletedForEveryone&&Date.now()-m.createdAt<15*60*1000&&<button type="button" onClick={()=>deleteMessageAction(m,'everyone')} title="Delete this message for everyone">Delete for everyone</button>}</div></div></div></React.Fragment>)}{messages.length===0&&<div className="conversation-hint">Messages are encrypted before they leave your device.</div>}{isFriendTyping&&<div className="typing-indicator">{activeFriend.fullName} is typing…</div>}</div>
          <form className="message-compose" onSubmit={send}><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Write a message…" maxLength={4000} disabled={!remoteKey}/><input ref={fileInput} type="file" accept="image/*,video/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" className="hidden-file-input" onChange={e=>sendFile(e.target.files?.[0])} aria-label="Attach a file"/><button type="button" className="attach-button" disabled={busy||!remoteKey} onClick={()=>fileInput.current?.click()} aria-label="Attach encrypted file"><Paperclip size={17}/></button><button disabled={busy||!remoteKey||!draft.trim()||!isOnline} aria-label="Send message"><Send size={18}/></button></form>{transferProgress&&<div className="file-transfer"><div><strong>{transferProgress.name}</strong><span>{transferProgress.phase} · {transferProgress.progress}%</span></div><div className="transfer-track"><span style={{width:transferProgress.progress+'%'}}/></div></div>}</>}
        {error&&<div className="chat-notice" role="status">{error}<button onClick={()=>setError('')}>×</button></div>}
        {pushState&&<div className="chat-notice" role="status">{pushState}<button onClick={()=>setPushState('')}>×</button></div>}
      </section>
    </div>
    {settingsOpen&&<div className="settings-overlay" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setSettingsOpen(false)}}><section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div className="settings-modal-head"><div><h2 id="settings-title">User settings</h2><p>Account controls and support</p></div><button className="chat-icon-btn" onClick={()=>setSettingsOpen(false)} aria-label="Close settings">×</button></div><div className="settings-profile"><span className="user-avatar">{profile?.avatarUrl ? <img className="avatar-image" src={profile.avatarUrl} alt="Profile image"/> : (profile?.fullName||user.fullName||'U').slice(0,1).toUpperCase()}</span><div><strong>{profile?.fullName || user.fullName}</strong><small>{profile?.email || user.email}</small><small>@{profile?.username || user.username}</small><small>{profile?.emailVerified ? 'Email verified' : 'Email verification status unavailable'}</small></div></div><div className="complaint-form"><input ref={avatarInput} className="hidden-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={e=>uploadProfileImage(e.target.files?.[0])} aria-label="Choose profile image"/><button type="button" className="admin-action" disabled={busy} onClick={()=>avatarInput.current?.click()}>Upload profile image (max 5 MB)</button>{profile?.avatarUrl&&<button type="button" className="admin-action" onClick={removeProfileImage}>Remove profile image</button>}</div><h3>Profile</h3><form className="complaint-form" onSubmit={saveProfile}><input value={profileName} onChange={e=>setProfileName(e.target.value)} minLength={2} maxLength={80} aria-label="Full name" required/><textarea value={profileBio} onChange={e=>setProfileBio(e.target.value)} placeholder="Short bio (optional)" maxLength={280} rows={2}/><label>Date of birth (private)<input type="date" value={profileDob} onChange={e=>setProfileDob(e.target.value)} max={new Date().toISOString().slice(0,10)}/></label><button className="submit-btn" disabled={busy}>Save profile</button></form><h3>Privacy & notifications</h3><div className="complaint-form"><label>Last seen<select value={privacySettings.lastSeenVisibility} onChange={e=>setPrivacySettings(s=>({...s,lastSeenVisibility:e.target.value}))}><option value="everyone">Everyone</option><option value="friends">Friends</option><option value="nobody">Nobody</option></select></label><label>Online status<select value={privacySettings.onlineVisibility} onChange={e=>setPrivacySettings(s=>({...s,onlineVisibility:e.target.value}))}><option value="everyone">Everyone</option><option value="friends">Friends</option><option value="nobody">Nobody</option></select></label><label><input type="checkbox" checked={privacySettings.readReceiptsEnabled} onChange={e=>setPrivacySettings(s=>({...s,readReceiptsEnabled:e.target.checked}))}/> Read receipts enabled</label><label><input type="checkbox" checked={privacySettings.notificationsEnabled} onChange={e=>setPrivacySettings(s=>({...s,notificationsEnabled:e.target.checked}))}/> Notifications enabled</label><label>Notification content<select value={privacySettings.notificationPrivacy} onChange={e=>setPrivacySettings(s=>({...s,notificationPrivacy:e.target.value}))}><option value="generic">Generic preview</option><option value="sender">Show sender name (metadata exposed)</option></select></label><button className="submit-btn" type="button" onClick={savePrivacySettings} disabled={busy}>Save privacy settings</button></div><h3>Password & sessions</h3><form className="complaint-form" onSubmit={changePassword}><input type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} placeholder="Current password" required/><input type="password" autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="New password (12–128 characters)" minLength={12} maxLength={128} required/><button className="submit-btn" disabled={busy}>Change password</button></form><div className="user-complaints">{sessions.map((s,i)=><article key={s.createdAt+'-'+i}><strong>{s.current?'This session':'Other session'}</strong><span>{new Date(s.lastSeenAt||s.createdAt).toLocaleString()}</span><p>Expires {new Date(s.expiresAt).toLocaleString()}</p></article>)}</div><button type="button" className="admin-action" onClick={revokeOtherSessions}>Revoke other sessions</button><h3>Blocked users</h3><div className="user-complaints">{blockedUsers.length ? blockedUsers.map(b=><article key={b.id}><strong>@{b.username}</strong><span>{b.fullName}</span><button type="button" className="admin-action" onClick={()=>unblockUser(b.id)}>Unblock</button></article>):<p>No blocked users.</p>}</div>{settingsMessage&&<div className="notice" role="status">{settingsMessage}</div>}<button className="settings-logout" onClick={requestAccountDeletion}>Request account deletion</button><h3>Submit a complaint</h3><form className="complaint-form" onSubmit={submitComplaint}><input value={complaintSubject} onChange={e=>setComplaintSubject(e.target.value)} placeholder="Subject" minLength={4} maxLength={120} required/><textarea value={complaintDescription} onChange={e=>setComplaintDescription(e.target.value)} placeholder="Describe your issue (10–3000 characters)" minLength={10} maxLength={3000} required rows={3}/><button className="submit-btn" disabled={busy}>Send complaint</button></form><h3>Your complaints</h3><div className="user-complaints">{myComplaints.length?myComplaints.map(c=><article key={c.id}><strong>{c.subject}</strong><span className={'admin-status '+(c.status==='resolved'?'active':'blocked')}>{c.status}</span><p>{c.description}</p></article>):<p>No complaints submitted.</p>}</div><button className="settings-logout" onClick={onLogout}><LogOut size={16}/> Log out of MS Chat</button></section></div>}
    {attachmentPreview&&<div className="attachment-viewer-backdrop" role="dialog" aria-modal="true" aria-label={attachmentPreview.name} onClick={()=>setAttachmentPreview(null)}><div className="attachment-viewer" onClick={e=>e.stopPropagation()}><div className="attachment-viewer-head"><strong>{attachmentPreview.name}</strong><button onClick={()=>setAttachmentPreview(null)} aria-label="Close attachment viewer">×</button></div>{attachmentPreview.mediaType==='image'?<img src={attachmentPreview.url} alt={attachmentPreview.name}/>:<video src={attachmentPreview.url} controls playsInline/>}</div></div>}
    <footer className="chat-footer"><span><ShieldCheck size={14}/> Client-side encryption prototype · not independently audited</span><span><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · Settings & logout are in your profile controls · Install via browser menu</span></footer>
  </main>;
}
