import { useEffect, useState } from 'react';
import Chat from './Chat.jsx';
import Admin from './Admin.jsx';
import { MessageCircle, ShieldCheck, Zap, LockKeyhole, Eye, EyeOff, ArrowRight, Check, Smartphone, Sparkles, Sun, Moon, LoaderCircle } from 'lucide-react';

const features = [
  { icon: ShieldCheck, title: 'Private by design', copy: 'Built around privacy-first architecture, not ad tracking.' },
  { icon: Zap, title: 'Made to feel instant', copy: 'A lightweight interface with thoughtful loading states.' },
  { icon: LockKeyhole, title: 'Your account, your choice', copy: 'Clear session controls and transparent security settings.' },
];

export default function App() {
  const [mode, setMode] = useState('signup');
  const [authenticatedUser, setAuthenticatedUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('mschat-theme') || 'light');
  const [form, setForm] = useState({ name: '', email: '', username: '', password: '', ageConfirmed: false });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState('info');
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCode, setOtpCode] = useState('');

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(data => { if (!cancelled && data?.user) setAuthenticatedUser(data.user); }).catch(() => {}).finally(() => { if (!cancelled) setCheckingSession(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('mschat-theme', theme);
  }, [theme]);

  const update = (key, value) => setForm(old => ({ ...old, [key]: value }));
  async function submit(event) {
    event.preventDefault();
    setNotice('');
    if (mode === 'signup' && !form.ageConfirmed) {
      setNoticeType('error'); setNotice('Please confirm that you are at least 18 years old.'); return;
    }
    if (mode === 'signup' && !/^[a-zA-Z0-9_]{3,24}$/.test(form.username)) {
      setNoticeType('error'); setNotice('Username must be 3–24 characters using letters, numbers, or underscores.'); return;
    }
    setBusy(true);
    try {
      if (mode === 'signup' && !otpRequested) {
        const otpResponse = await fetch('/api/auth/request-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ email: form.email.trim() }) });
        const otpData = await otpResponse.json().catch(() => ({}));
        if (!otpResponse.ok) throw new Error(otpData.message || otpData.error || 'Could not request a verification code.');
        setOtpRequested(true); setNoticeType('success'); setNotice('Verification code requested. Check your email and enter the 6-digit code below.'); return;
      }
      const response = await fetch(`/api/auth/${mode === 'signup' ? 'register' : 'login'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(mode === 'signup'
          ? { fullName: form.name.trim(), email: form.email.trim(), username: form.username.trim(), password: form.password, ageConfirmed: form.ageConfirmed, code: otpCode }
          : { identity: form.email.trim(), password: form.password })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const friendly = { EMAIL_ALREADY_REGISTERED: 'An account already uses this email address.', USERNAME_TAKEN: 'That username is already taken.', INVALID_CREDENTIALS: 'Email/username or password is incorrect.', OTP_EXPIRED_OR_MISSING: 'Request a new email verification code.', INVALID_CODE: 'The verification code is incorrect.', RATE_LIMITED: 'Too many attempts. Wait a little and try again.', SERVICE_NOT_CONFIGURED: 'The server is missing required environment variables.' };
        throw new Error(data.message || friendly[data.error] || data.error || 'This service is not configured yet. Please try again later.');
      }
      if (data.user) { setAuthenticatedUser(data.user); return; }
      setNoticeType('success');
      setNotice(data.message || 'Signed in successfully.');
    } catch (error) {
      setNoticeType('error');
      setNotice(error.message || 'Could not connect. Check your connection and retry.');
    } finally { setBusy(false); }
  }

  async function logout() {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
    setAuthenticatedUser(null); setMode('login'); setForm({ name: '', email: '', username: '', password: '', ageConfirmed: false }); setOtpRequested(false); setOtpCode('');
  }

  if (checkingSession) return <main className="app-shell"><header className="topbar"><a className="brand" href="/"><span className="brand-mark"><MessageCircle size={21}/></span><span>ms<span className="brand-light">chat</span><i>.</i></span></a></header><section className="chat-empty"><span className="empty-logo"><LoaderCircle className="spin" size={28}/></span><h2>Opening your space…</h2><p>Checking your secure session.</p></section></main>;
  if (authenticatedUser && window.location.pathname.startsWith('/admin')) return <Admin user={authenticatedUser} onLogout={logout} />;
  if (authenticatedUser) return <Chat user={authenticatedUser} onLogout={logout} />;

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="/" aria-label="MS Chat home"><span className="brand-mark"><MessageCircle size={21} strokeWidth={2.6}/></span><span>ms<span className="brand-light">chat</span><i>.</i></span></a>
      <div className="top-actions"><span className="availability"><span/> Built for real conversations</span><button className="theme-toggle" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}>{theme === 'light' ? <Moon size={18}/> : <Sun size={18}/>}</button></div>
    </header>

    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><Sparkles size={14}/> A calmer kind of messaging</div>
        <h1>Good conversations.<br/><span>Better connections.</span></h1>
        <p className="hero-sub">Your people, your space. MS Chat is being built for private one-to-one conversations with a little more care in every detail.</p>
        <div className="feature-list">{features.map(({icon: Icon, title, copy}) => <div className="feature" key={title}><span className="feature-icon"><Icon size={19}/></span><div><h3>{title}</h3><p>{copy}</p></div></div>)}</div>
        <div className="trust-note"><LockKeyhole size={15}/> No ads. No public message feeds. Privacy comes first.</div>
      </div>

      <section className="auth-card" aria-labelledby="auth-title">
        <div className="card-orb orb-one"/><div className="card-orb orb-two"/>
        <div className="auth-inner">
          <div className="auth-icon"><MessageCircle size={23}/></div>
          <p className="auth-kicker">YOUR SPACE IS WAITING</p>
          <h2 id="auth-title">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
          <p className="auth-description">{mode === 'signup' ? 'Start with the basics. Your inbox comes next.' : 'Sign in to continue your conversations.'}</p>
          <div className="mode-switch" role="tablist" aria-label="Account action">
            <button role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => {setMode('signup');setNotice('');setOtpRequested(false);setOtpCode('')}}>Create account</button>
            <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => {setMode('login');setNotice('');setOtpRequested(false);setOtpCode('')}}>Sign in</button>
          </div>
          <form onSubmit={submit}>
            {mode === 'signup' && <label>Full name<div className="input-wrap"><input autoComplete="name" value={form.name} onChange={e=>update('name',e.target.value)} placeholder="How should we call you?" required maxLength={80}/></div></label>}
            <label>{mode === 'signup' ? 'Email address' : 'Email or username'}<div className="input-wrap"><input type={mode === 'signup' ? 'email' : 'text'} autoComplete={mode === 'signup' ? 'email' : 'username'} value={form.email} onChange={e=>update('email',e.target.value)} placeholder={mode === 'signup' ? 'you@example.com' : 'you@example.com or username'} required maxLength={254}/></div></label>
            {mode === 'signup' && <label>Unique username<div className="input-wrap username-input"><span>@</span><input autoComplete="username" value={form.username} onChange={e=>update('username',e.target.value.replace(/\s/g,''))} placeholder="yourname" required minLength={3} maxLength={24}/></div><span className="field-hint">3–24 letters, numbers or underscores. Usernames are checked when you create your account.</span></label>}
            <label>Password<div className="input-wrap"><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={form.password} onChange={e=>update('password',e.target.value)} placeholder={mode === 'signup' ? 'At least 12 characters recommended' : 'Your password'} required minLength={mode === 'signup' ? 12 : 1} maxLength={128}/><button className="show-password" type="button" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>
            {mode === 'signup' && otpRequested && <label>6-digit email verification code<div className="input-wrap"><input inputMode="numeric" autoComplete="one-time-code" value={otpCode} onChange={e=>setOtpCode(e.target.value.replace(/\\D/g,'').slice(0,6))} placeholder="000000" required pattern="[0-9]{6}" maxLength={6}/></div><span className="field-hint">The code expires in 10 minutes. You can request another code after switching modes or retrying later.</span></label>}
            {mode === 'signup' && <label className="age-check"><input type="checkbox" checked={form.ageConfirmed} onChange={e=>update('ageConfirmed',e.target.checked)}/><span>I confirm that I am at least 18 years old.</span></label>}
            {notice && <div className={`notice ${noticeType}`} role="status">{notice}</div>}
            <button className="submit-btn" type="submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={18}/> Please wait…</> : <>{mode === 'signup' ? (otpRequested ? 'Verify & create account' : 'Email me a code') : 'Sign in'} <ArrowRight size={17}/></>}</button>
          </form>
          <div className="secure-foot"><ShieldCheck size={15}/><span>Persistent HttpOnly sessions and email verification protect account access.</span></div>
        </div>
      </section>
    </section>

    <section className="bottom-strip"><div><span className="strip-icon"><Smartphone size={18}/></span><div><strong>Feels at home on every screen</strong><span>Phone, tablet, laptop — your layout adapts.</span></div></div><div><span className="check-dot"><Check size={14}/></span><span>Thoughtful by default</span></div><div className="bottom-status"><span className="status-pulse"/> Foundation build</div></section>
    <footer><a className="footer-brand" href="/">MS Chat</a><span>Private conversations deserve thoughtful design.</span><span>© {new Date().getFullYear()} MS Chat</span></footer>
  </main>;
}