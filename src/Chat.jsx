import { useEffect, useMemo, useState } from 'react';
import { LogOut, Plus, Send, MessageCircle, ShieldCheck, Users, CheckCheck, Bell, RefreshCw, Search } from 'lucide-react';
import { getOrCreateDeviceKey, getConversationAesKey, encryptText, decryptText } from './chat-crypto.js';

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || 'Request failed');
  return data;
}
const post = (url, body) => api(url, { method: 'POST', body: JSON.stringify(body) });

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
        const pair = await getOrCreateDeviceKey();
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
          try { return { ...m, text: await decryptText(key, m.ciphertext, m.iv) }; }
          catch { return { ...m, text: 'Unable to decrypt on this device' }; }
        }));
        if (!cancelled) setMessages(decoded);
      } catch (e) { if (!cancelled) { setMessages([]); setError(e.message); } }
    })();
    return () => { cancelled = true; };
  }, [active, friends, privateKey]);

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
      setMessages(old => [...old, { id: result.id, senderId: user.id, text: draft.trim(), createdAt: result.createdAt }]);
      setDraft('');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
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
    <header className="chat-topbar"><a className="brand" href="/"><span className="brand-mark"><MessageCircle size={21}/></span><span>ms<span className="brand-light">chat</span><i>.</i></span></a><div className="chat-user"><span className="user-avatar">{(user.fullName || 'U').slice(0,1).toUpperCase()}</span><span>{user.fullName}</span><button className="chat-icon-btn" onClick={enableNotifications} title="Enable notifications"><Bell size={17}/></button><button className="chat-icon-btn" onClick={onLogout} title="Logout"><LogOut size={17}/></button></div></header>
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
          <div className="message-list">{messages.map(m=><div key={m.id} className={'message-row '+(m.senderId===user.id?'mine':'theirs')}><div className="message-bubble">{m.text}<small>{new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}{m.senderId===user.id&&<CheckCheck size={13}/>}</small></div></div>)}{messages.length===0&&<div className="conversation-hint">Messages are encrypted before they leave your device.</div>}</div>
          <form className="message-compose" onSubmit={send}><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Write a message…" maxLength={4000} disabled={!remoteKey}/><button disabled={busy||!remoteKey||!draft.trim()} aria-label="Send message"><Send size={18}/></button></form></>}
        {error&&<div className="chat-notice" role="status">{error}<button onClick={()=>setError('')}>×</button></div>}
        {pushState&&<div className="chat-notice" role="status">{pushState}<button onClick={()=>setPushState('')}>×</button></div>}
      </section>
    </div>
    <footer className="chat-footer"><span><ShieldCheck size={14}/> Encrypted on this device</span><span>MS Chat · Settings & logout are available from your profile controls</span></footer>
  </main>;
}
