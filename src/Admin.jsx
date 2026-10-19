import { useEffect, useState } from 'react';
import { ArrowLeft, ShieldCheck, Users, MessageCircle, Ban, CheckCircle2, RefreshCw, LogOut } from 'lucide-react';
async function request(url, options={}) {
  const r=await fetch(url,{credentials:'include',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.message||d.error||'Request failed');
  return d;
}
export default function Admin({user,onLogout}) {
  const [data,setData]=useState(null),[secret,setSecret]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function load(){try{setData(await request('/api/admin'));setError('')}catch(e){setData(null);setError(e.message)}}
  useEffect(()=>{load()},[]);
  async function bootstrap(e){e.preventDefault();setBusy(true);setError('');try{await request('/api/admin/bootstrap',{method:'POST',headers:{'x-admin-bootstrap-secret':secret}});setSecret('');await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
  async function toggle(u,action){setBusy(true);try{await request('/api/admin',{method:'POST',body:JSON.stringify({userId:u.id,action})});await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
  return <main className="admin-shell"><header className="admin-top"><a href="/" className="brand"><span className="brand-mark"><MessageCircle size={20}/></span><span>ms<span className="brand-light">chat</span><i>.</i></span></a><div className="chat-user"><span>{user.fullName}</span><button className="chat-icon-btn" onClick={()=>location.href='/'}><ArrowLeft size={17}/></button><button className="chat-icon-btn" onClick={onLogout}><LogOut size={17}/></button></div></header>
  <div className="admin-heading"><div><span className="admin-kicker"><ShieldCheck size={14}/> SECURE CONTROL CENTER</span><h1>Admin dashboard</h1><p>Manage accounts and review user complaints.</p></div><button className="refresh-btn" onClick={load}><RefreshCw size={14}/> Refresh</button></div>
  {error==='FORBIDDEN'||error==='Request failed'||!data ? <section className="admin-bootstrap"><ShieldCheck size={30}/><h2>Administrator access</h2><p>Only the configured administrator email can perform the one-time bootstrap. Add the secret in memory only; do not save it in the browser.</p><form onSubmit={bootstrap}><label>One-time bootstrap secret<input type="password" value={secret} onChange={e=>setSecret(e.target.value)} required autoComplete="off"/></label><button className="submit-btn" disabled={busy||!secret}>{busy?'Checking…':'Activate administrator access'}</button></form>{error&&<div className="notice error">{error}</div>}</section> : <>
  <div className="admin-stats"><div><Users/><span>Total accounts</span><strong>{data.stats.users}</strong></div><div><CheckCircle2/><span>Active accounts</span><strong>{data.stats.activeUsers}</strong></div><div><MessageCircle/><span>Open complaints</span><strong>{data.stats.openComplaints}</strong></div></div>
  <section className="admin-section"><h2>Accounts <small>{data.users.length} shown</small></h2><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.users.map(u=><tr key={u.id}><td><strong>{u.fullName}</strong><small>@{u.username}</small></td><td>{u.email}</td><td>{u.role}</td><td><span className={'admin-status '+(u.disabled?'blocked':'active')}>{u.disabled?'Blocked':'Active'}</span></td><td>{u.role!=='admin'&&<button className="admin-action" disabled={busy} onClick={()=>toggle(u,u.disabled?'unblock':'block')}>{u.disabled?<CheckCircle2 size={14}/>:<Ban size={14}/>} {u.disabled?'Unblock':'Block'}</button>}</td></tr>)}</tbody></table></div></section>
  <section className="admin-section"><h2>Complaints <small>{data.complaints.length} shown</small></h2>{data.complaints.length===0?<p className="admin-muted">No complaints have been submitted.</p>:data.complaints.map(c=><article className="complaint-card" key={c.id}><div><strong>{c.subject}</strong><span>{c.status} · {new Date(c.createdAt).toLocaleString()}</span></div><p>{c.description}</p><small>Account ID: {c.userId}</small></article>)}</section>
  </>}
  <footer className="chat-footer"><span><ShieldCheck size={14}/> Admin actions are authorized server-side</span><span>MS Chat</span></footer></main>;
}
