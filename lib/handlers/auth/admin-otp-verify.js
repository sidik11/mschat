import { json, method, requireOrigin, rootRef, normalizeEmail, normalizeUsername, sha, verifyPassword, issueSession, consumeRateLimit, rateLimitKey, safeError, publicUser, otpDigest } from '../../core.js';
export default async function handler(req,res) {
  if (!method(req,res,['POST']) || !requireOrigin(req,res)) return;
  try {
    const identity = String(req.body?.identity || '').trim(), password = req.body?.password, code = String(req.body?.code || '');
    if (!identity || typeof password !== 'string' || !/^\\d{6}$/.test(code)) return json(res,400,{error:'INVALID_CREDENTIALS'});
    if (!(await consumeRateLimit(rateLimitKey(req,'admin-mfa:' + identity.toLowerCase()),5,15*60*1000))) return json(res,429,{error:'RATE_LIMITED'});
    const root = rootRef(), isEmail = identity.includes('@'), key = isEmail ? sha(normalizeEmail(identity)) : normalizeUsername(identity);
    const uid = (await root.child((isEmail ? 'emails/' : 'usernames/') + key).get()).val();
    const user = uid ? (await root.child('users/' + uid).get()).val() : null;
    if (!user || user.disabled || user.role !== 'admin' || !(await verifyPassword(password,user.passwordHash))) return json(res,401,{error:'INVALID_CREDENTIALS',message:'Email/username or password is incorrect.'});
    const ref = root.child('adminLoginChallenges/' + uid);
    let accepted = false, wrong = false;
    const result = await ref.transaction(old => {
      if (!old || old.purpose !== 'admin-login' || old.consumed || old.expiresAt <= Date.now() || old.attempts >= 5) return;
      if (old.codeHash !== otpDigest(code)) { wrong = true; return { ...old, attempts: (old.attempts || 0) + 1 }; }
      accepted = true;
      return { ...old, consumed: true, consumedAt: Date.now() };
    });
    if (!result.committed || !accepted) return json(res,401,{error:wrong?'INVALID_CODE':'OTP_EXPIRED_OR_MISSING',message:wrong?'The verification code is incorrect.':'Request a new administrator verification code.'});
    const sessionHash = await issueSession(res,uid), mfaVerifiedAt = Date.now();
    await Promise.all([root.child('sessions/' + sessionHash).update({ adminMfaVerifiedAt: mfaVerifiedAt }), root.child('sessionIndex/' + uid + '/' + sessionHash).update({ adminMfaVerifiedAt: mfaVerifiedAt })]);
    try { await root.child('adminAuditLogs').push({actorId:uid,action:'admin_login_mfa_verified',createdAt:Date.now()}); } catch {}
    return json(res,200,{ok:true,user:publicUser(user)});
  } catch(error) { return safeError(res,error); }
}
