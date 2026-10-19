import { useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, Plus, Send, MessageCircle, ShieldCheck, Users, CheckCheck, Bell, RefreshCw, Search, Paperclip, Download, FileText, Settings } from 'lucide-react';
import { getOrCreateDeviceKey, getConversationAesKey, encryptText, decryptText, encryptBytes, decryptBytes } from './chat-crypto.js';

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || 'Request failed');
  return data;
}
const post = (url, body) => api(url, { method: 'POST', body: JSON.stringify(body) });
function uploadWithProgress(url, buffer, onProgress) { return new Promise((resolve, reject) => { const xhr = new XMLHttpRequest(); xhr.open('PUT', url); xhr.setRequestHeader('Content-Type', 'application/octet-stream'); xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); }; xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('File upload failed (' + xhr.status + ').')); xhr.onerror = () => reject(new Error('Network error during upload.')); xhr.send(buffer); }); }

export default function Chat({ user, onLogout }) {
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [privateKey, setPrivateKey] = useState(null);
  const [myPublicKey, setMyPublicKey] = useState(null);
  const [remoteKey, setRemoteKey] = useState(null);
  const [search, setSearch] = useState('');
  const [transferProgress, setTransferProgress] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [complaintSubject, setComplaintSubject] = useState('');
  const [complaintDescription, setComplaintDescription] = useState('');
  const [myComplaints, setMyComplaints] = useState([]);
  const fileInput = useRef(null);
  const [pushState, setPushState] = useState('');
  const activeFriend = useMemo(() => friends.find(f => f.id === active) || null, [friends, active]);

  async function refresh() {
    const data = await api('/api/friends');
    setFriends(data.friends || []);
    setIncoming(data.incoming || []);
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
      } catch (e) { if (!cancelled) setError(e.message); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!activeFriend) { setMessages([]); setRemoteKey(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const keyData = await api('/api/keys?username=' + encodeURIComponent(activeFriend.username));
        if (!keyData.publicKey) throw new Error('This contact has not set up an encryption key on this device yet.');
        const key = await getConversationAesKey(privateKey, keyData.publicKey);
        if (cancelled) return;
        setRemoteKey(key);
        const data = await api('/api/messages?conversationId=' + encodeURIComponent(activeFriend.conversationId));
        const decoded = await Promise.all((data.messages || []).map(async m => {
          try {
            const clear = await decryptText(key, m.ciphertext, m.iv);
            try { const payload = JSON.parse(clear); if (payload?.type === 'attachment' && /^[a-f0-9]{32}$/.test(payload.attachmentId || '')) return { ...m, text: payload.fileName || 'Encrypted attachment', attachment: payload }; } catch {}
            return { ...m, text: clear };
          } catch { return { ...m, text: 'Unable to decrypt on this device' }; }
        }));
        if (!cancelled) setMessages(decoded);
      } catch (e) { if (!cancelled) { setMessages([]); setError(e.message); } }
    })();
    return () => { cancelled = true; };
  }, [active, friends, privateKey]);

  useEffect(() => {
    if (!activeFriend || !remoteKey) return;
    let cancelled = false;
    const poll = async () => {
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
        setMessages(decoded);
        const unread = decoded.filter(m => m.senderId !== user.id && !m.readBy?.[user.id]);
        for (const m of unread) {
          try {
            await post('/api/messages/receipt', { conversationId: activeFriend.conversationId, messageId: m.id, state: 'delivered' });
            await post('/api/messages/receipt', { conversationId: activeFriend.conversationId, messageId: m.id, state: 'read' });
          } catch {}
        }
      } catch {}
    };
    const timer = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [activeFriend, remoteKey, user.id]);

  async function sendFile(file) {
    if (!activeFriend || !remoteKey || !file) return;
    if (file.size < 1 || file.size > 25 * 1024 * 1024) { setError('Choose a file between 1 byte and 25 MB.'); return; }
    setBusy(true); setError(''); setTransferProgress({ name: file.name, progress: 0, phase: 'Encrypting locally' });
    try {
      const encrypted = await encryptBytes(remoteKey, await file.arrayBuffer());
      setTransferProgress({ name: file.name, progress: 5, phase: 'Preparing private upload' });
      const upload = await post('/api/attachments/upload-url', { conversationId: activeFriend.conversationId, fileName: file.name, size: file.size });
      await uploadWithProgress(upload.uploadUrl, encrypted.buffer, progress => setTransferProgress({ name: file.name, progress, phase: 'Uploading encrypted file' }));
      const complete = await post('/api/attachments/complete', { attachmentId: upload.attachmentId });
      const payload = { type: 'attachment', attachmentId: complete.attachment.id, fileName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, fileIv: encrypted.iv };
      const encryptedMessage = await encryptText(remoteKey, JSON.stringify(payload));
      const result = await post('/api/messages', { conversationId: activeFriend.conversationId, ...encryptedMessage, keyVersion: 1 });
      setMessages(old => [...old, { id: result.id, senderId: user.id, text: file.name, attachment: payload, createdAt: result.createdAt, deliveredTo: {}, readBy: {} }]);
      setTransferProgress({ name: file.name, progress: 100, phase: 'Sent securely' });
      setTimeout(() => setTransferProgress(null), 2500);
    } catch (e) { setError(e.message); setTransferProgress(null); }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  }
  async function downloadFile(attachment) {
    if (!remoteKey) return;
    setError('');
    try {
      const info = await post('/api/attachments/download-url', { attachmentId: attachment.attachmentId });
      const response = await fetch(info.downloadUrl);
      if (!response.ok) throw new Error('Could not download the encrypted file.');
      const encrypted = await response.arrayBuffer();
      const clear = await decryptBytes(remoteKey, encrypted, attachment.fileIv);
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
  async function send(e) {
    e.preventDefault();
    if (!activeFriend || !remoteKey || !draft.trim()) return;
    setBusy(true); setError('');
    try {
      const encrypted = await encryptText(remoteKey, draft.trim());
      const result = await post('/api/messages', { conversationId: activeFriend.conversationId, ...encrypted, keyVersion: 1 });
      setMessages(old => [...old, { id: result.id, senderId: user.id, text: draft.trim(), createdAt: result.createdAt, deliveredTo: {}, readBy: {} }]);
      setDraft('');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
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
      setPushState('Notifications enabled');
    } catch (e) { setPushState(e.message); }
  }
  const visibleFriends = friends.filter(f => (f.fullName + ' ' + f.username).toLowerCase().includes(search.toLowerCase()));

  return <main className="chat-app">
    <header className="chat-topbar"><a className="brand" href="/"><span className="brand-mark"><MessageCircle size={21}/></span><span>ms<span className="brand-light">chat</span><i>.</i></span></a><div className="chat-user"><span className="user-avatar">{(user.fullName || 'U').slice(0,1).toUpperCase()}</span><span>{user.fullName}</span><button className="chat-icon-btn" onClick={enableNotifications} title="Enable notifications"><Bell size={17}/></button><button className="chat-icon-btn" onClick={()=>{setSettingsOpen(true);loadComplaints()}} title="User settings"><Settings size={17}/></button><button className="chat-icon-btn" onClick={onLogout} title="Logout"><LogOut size={17}/></button></div></header>
    <div className="chat-layout">
      <aside className="contacts-panel">
        <div className="panel-heading"><div><h2>Messages</h2><p>Private one-to-one chats</p></div><span className="online-pill"><span/> Protected</span></div>
        <form className="friend-add" onSubmit={addFriend}><input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Add by username" maxLength={24} required/><button disabled={busy} aria-label="Send friend request"><Plus size={18}/></button></form>
        {incoming.length > 0 && <section className="incoming-list"><h3>Friend requests</h3>{incoming.map(r=><div className="incoming-item" key={r.requestId}><span>@{r.user.username}</span><button onClick={()=>respond(r.requestId,'accept')}>Accept</button><button className="muted-btn" onClick={()=>respond(r.requestId,'reject')}>Ignore</button></div>)}</section>}
        <div className="contact-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search contacts"/></div>
        <div className="contact-list">{visibleFriends.map(f=><button key={f.id} className={'contact-item '+(active===f.id?'selected':'')} onClick={()=>setActive(f.id)}><span className="contact-avatar">{f.fullName.slice(0,1).toUpperCase()}</span><span className="contact-copy"><strong>{f.fullName}</strong><small>@{f.username}</small><em>Encrypted conversation</em></span></button>)}{visibleFriends.length===0&&<div className="empty-contacts"><Users size={24}/><p>No contacts yet</p><small>Add a friend by username to start a conversation.</small></div>}</div>
        <button className="refresh-btn" onClick={()=>refresh()}><RefreshCw size={14}/> Refresh contacts</button>
      </aside>
      <section className="conversation-panel">
        {!activeFriend ? <div className="chat-empty"><span className="empty-logo"><MessageCircle size={32}/></span><h2>Your conversations, your space.</h2><p>Choose a contact or add a friend to begin an encrypted chat.</p><div><ShieldCheck size={16}/> Message content is encrypted in your browser before sending.</div></div> :
          <><div className="conversation-head"><span className="contact-avatar">{activeFriend.fullName.slice(0,1).toUpperCase()}</span><div><strong>{activeFriend.fullName}</strong><small>@{activeFriend.username} · <ShieldCheck size={12}/> End-to-end encrypted</small></div></div>
          <div className="message-list">{messages.map(m=><div key={m.id} className={'message-row '+(m.senderId===user.id?'mine':'theirs')}><div className="message-bubble">{m.attachment ? <button className="attachment-message" onClick={()=>downloadFile(m.attachment)}><FileText size={17}/><span><strong>{m.attachment.fileName}</strong><small>{Math.max(1,Math.round(m.attachment.size/1024))} KB · encrypted file</small></span><Download size={15}/></button> : m.text}<small>{new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}{m.senderId===user.id&&<CheckCheck size={13} style={{opacity:Object.keys(m.readBy||{}).length?1:Object.keys(m.deliveredTo||{}).length?.75:.45}}/>}</small></div></div>)}{messages.length===0&&<div className="conversation-hint">Messages are encrypted before they leave your device.</div>}</div>
          <form className="message-compose" onSubmit={send}><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Write a message…" maxLength={4000} disabled={!remoteKey}/><input ref={fileInput} type="file" className="hidden-file-input" onChange={e=>sendFile(e.target.files?.[0])} aria-label="Attach a file"/><button type="button" className="attach-button" disabled={busy||!remoteKey} onClick={()=>fileInput.current?.click()} aria-label="Attach encrypted file"><Paperclip size={17}/></button><button disabled={busy||!remoteKey||!draft.trim()} aria-label="Send message"><Send size={18}/></button></form>{transferProgress&&<div className="file-transfer"><div><strong>{transferProgress.name}</strong><span>{transferProgress.phase} · {transferProgress.progress}%</span></div><div className="transfer-track"><span style={{width:transferProgress.progress+'%'}}/></div></div>}</>}
        {error&&<div className="chat-notice" role="status">{error}<button onClick={()=>setError('')}>×</button></div>}
        {pushState&&<div className="chat-notice" role="status">{pushState}<button onClick={()=>setPushState('')}>×</button></div>}
      </section>
    </div>
    {settingsOpen&&<div className="settings-overlay" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setSettingsOpen(false)}}><section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div className="settings-modal-head"><div><h2 id="settings-title">User settings</h2><p>Account controls and support</p></div><button className="chat-icon-btn" onClick={()=>setSettingsOpen(false)} aria-label="Close settings">×</button></div><div className="settings-profile"><span className="user-avatar">{(user.fullName||'U').slice(0,1).toUpperCase()}</span><div><strong>{user.fullName}</strong><small>{user.email}</small><small>@{user.username}</small></div></div><h3>Submit a complaint</h3><form className="complaint-form" onSubmit={submitComplaint}><input value={complaintSubject} onChange={e=>setComplaintSubject(e.target.value)} placeholder="Subject" minLength={4} maxLength={120} required/><textarea value={complaintDescription} onChange={e=>setComplaintDescription(e.target.value)} placeholder="Describe your issue (10–3000 characters)" minLength={10} maxLength={3000} required rows={3}/><button className="submit-btn" disabled={busy}>Send complaint</button></form><h3>Your complaints</h3><div className="user-complaints">{myComplaints.length?myComplaints.map(c=><article key={c.id}><strong>{c.subject}</strong><span className={'admin-status '+(c.status==='resolved'?'active':'blocked')}>{c.status}</span><p>{c.description}</p></article>):<p>No complaints submitted.</p>}</div><button className="settings-logout" onClick={onLogout}><LogOut size={16}/> Log out of MS Chat</button></section></div>}
    <footer className="chat-footer"><span><ShieldCheck size={14}/> Encrypted on this device</span><span>MS Chat · Settings & logout are available from your profile controls</span></footer>
  </main>;
}
