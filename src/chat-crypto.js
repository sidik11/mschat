const DB_NAME = 'mschat-private-cache';
const STORE = 'keys';
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function getValue(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}
async function setValue(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

export async function getOrCreateDeviceKey(userId) {
  if (typeof userId !== 'string' || !/^[A-Za-z0-9_-]{8,160}$/.test(userId)) throw new Error('Invalid account key namespace');
  const privateKeyName = 'ecdh-private:' + userId;
  const publicKeyName = 'ecdh-public-jwk:' + userId;
  let privateKey = await getValue(privateKeyName);
  let publicJwk = await getValue(publicKeyName);
  if (privateKey && publicJwk) return { privateKey, publicJwk };
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  privateKey = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  await setValue(privateKeyName, privateKey);
  await setValue(publicKeyName, publicJwk);
  return { privateKey, publicJwk };
}
export async function getConversationAesKey(privateKey, remotePublicJwk) {
  const remotePublic = await crypto.subtle.importKey('jwk', remotePublicJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: remotePublic }, privateKey, 256);
  const digest = await crypto.subtle.digest('SHA-256', bits);
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
export async function encryptText(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return { ciphertext: b64(encrypted), iv: b64(iv) };
}
export async function decryptText(key, ciphertext, iv) {
  const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ciphertext));
  return new TextDecoder().decode(clear);
}

export async function encryptBytes(key, buffer) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buffer);
  return { buffer: encrypted, iv: b64(iv) };
}
export async function decryptBytes(key, buffer, ivText) {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivText) }, key, buffer);
}
