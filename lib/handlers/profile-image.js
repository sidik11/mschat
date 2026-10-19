import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { json, method, requireOrigin, session, rootRef, safeError, consumeRateLimit, rateLimitKey } from '../core.js';
import { r2Client, signPut, signGet } from '../r2.js';
const allowed = new Map([['image/jpeg','jpg'],['image/png','png'],['image/webp','webp'],['image/avif','avif']]);
function validSignature(type, bytes) {
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') return bytes.subarray(0,8).toString('hex') === '89504e470d0a1a0a';
  if (type === 'image/webp') return bytes.subarray(0,4).toString('ascii') === 'RIFF' && bytes.subarray(8,12).toString('ascii') === 'WEBP';
  if (type === 'image/avif') return bytes.subarray(4,8).toString('ascii') === 'ftyp' && /avif|avis/.test(bytes.subarray(8,16).toString('ascii'));
  return false;
}
export default async function handler(req, res) {
  if (!method(req, res, ['GET','POST']) || (req.method === 'POST' && !requireOrigin(req, res))) return;
  try {
    const auth = await session(req); if (!auth) return json(res, 401, { error: 'UNAUTHENTICATED' });
    const root = rootRef();
    if (req.method === 'GET') {
      const uid = String(req.query?.userId || auth.uid);
      if (!/^[A-Za-z0-9_-]{20}$/.test(uid)) return json(res, 400, { error: 'INVALID_USER' });
      const user = (await root.child('users/' + uid).get()).val();
      if (!user?.avatarKey || user.disabled || !user.avatarKey.startsWith('mschat/profile-images/' + uid + '/')) return json(res, 404, { error: 'IMAGE_NOT_FOUND' });
      if (uid !== auth.uid) {
        const [blockedA,blockedB] = await Promise.all([root.child('blocks/' + auth.uid + '/' + uid).get(),root.child('blocks/' + uid + '/' + auth.uid).get()]);
        if (blockedA.exists() || blockedB.exists()) return json(res, 404, { error: 'IMAGE_NOT_FOUND' });
      }
      const { client, bucket } = r2Client(), url = await signGet(client,bucket,user.avatarKey, user.avatarMimeType || 'application/octet-stream');
      res.setHeader('Cache-Control','private, max-age=60');
      res.setHeader('Location',url);
      return res.status(302).end();
    }
    if (!(await consumeRateLimit(rateLimitKey(req, 'profile-image:' + auth.uid), 10, 60 * 60 * 1000))) return json(res, 429, { error: 'RATE_LIMITED' });
    const action = String(req.body?.action || '');
    if (action === 'upload-url') {
      const size = Number(req.body?.size), mimeType = String(req.body?.mimeType || '');
      if (!Number.isSafeInteger(size) || size < 1 || size > 5 * 1024 * 1024 || !allowed.has(mimeType)) return json(res,400,{error:'INVALID_PROFILE_IMAGE',message:'Use JPEG, PNG, WebP or AVIF images up to 5 MB.'});
      const { client,bucket } = r2Client(), id = randomUUID().replace(/-/g,''), key = 'mschat/profile-images/' + auth.uid + '/' + id + '.' + allowed.get(mimeType);
      const uploadUrl = await signPut(client,bucket,key,mimeType);
      await root.child('profileImageUploads/' + id).set({ id, ownerId: auth.uid, key, mimeType, size, status:'pending', createdAt:Date.now(), expiresAt:Date.now()+15*60*1000 });
      return json(res,200,{ id,uploadUrl,headers:{'Content-Type':mimeType},expiresInSeconds:300 });
    }
    if (action === 'complete') {
      const id = String(req.body?.id || '');
      if (!/^[a-f0-9]{32}$/.test(id)) return json(res,400,{error:'INVALID_PROFILE_IMAGE'});
      const ref = root.child('profileImageUploads/' + id), item = (await ref.get()).val();
      if (!item || item.ownerId !== auth.uid || item.status !== 'pending' || item.expiresAt <= Date.now() || typeof item.key !== 'string' || !item.key.startsWith('mschat/profile-images/' + auth.uid + '/')) return json(res,404,{error:'UPLOAD_NOT_FOUND'});
      const { client,bucket } = r2Client(), head = await client.send(new (await import('@aws-sdk/client-s3')).HeadObjectCommand({Bucket:bucket,Key:item.key}));
      if (Number(head.ContentLength) !== item.size || head.ContentType !== item.mimeType) return json(res,400,{error:'UPLOAD_METADATA_MISMATCH'});
      const object = await client.send(new GetObjectCommand({Bucket:bucket,Key:item.key,Range:'bytes=0-31'}));
      const bytes = Buffer.from(await object.Body.transformToByteArray());
      if (!validSignature(item.mimeType,bytes)) { await client.send(new DeleteObjectCommand({Bucket:bucket,Key:item.key})); await ref.remove(); return json(res,400,{error:'INVALID_IMAGE_CONTENT'}); }
      const userRef = root.child('users/' + auth.uid), user = (await userRef.get()).val(), oldKey = user?.avatarKey;
      await userRef.update({avatarKey:item.key,avatarMimeType:item.mimeType,avatarUpdatedAt:Date.now(),updatedAt:Date.now()});
      await ref.update({status:'complete',completedAt:Date.now(),expiresAt:null});
      if (oldKey && oldKey.startsWith('mschat/profile-images/' + auth.uid + '/')) {
        try { await client.send(new DeleteObjectCommand({Bucket:bucket,Key:oldKey})); } catch {}
      }
      return json(res,200,{ok:true,avatarUrl:'/api/profile-image?userId='+auth.uid});
    }
    if (action === 'delete') {
      const userRef = root.child('users/' + auth.uid), user = (await userRef.get()).val(), key = user?.avatarKey;
      await userRef.update({avatarKey:null,avatarMimeType:null,avatarUpdatedAt:Date.now(),updatedAt:Date.now()});
      if (key && key.startsWith('mschat/profile-images/' + auth.uid + '/')) {
        const {client,bucket} = r2Client(); try { await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key})); } catch {}
      }
      return json(res,200,{ok:true});
    }
    return json(res,400,{error:'INVALID_ACTION'});
  } catch (error) { return safeError(res,error); }
}
