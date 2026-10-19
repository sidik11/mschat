import test from 'node:test';
import assert from 'node:assert/strict';
import { getConversationAesKey, encryptText, decryptText, encryptBytes, decryptBytes, encryptAttachmentBytes, decryptAttachmentBytes } from '../src/chat-crypto.js';

test('ECDH-derived AES keys decrypt messages on both peers', async () => {
  const alice = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const bob = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const alicePublic = await crypto.subtle.exportKey('jwk', alice.publicKey);
  const bobPublic = await crypto.subtle.exportKey('jwk', bob.publicKey);
  const aliceKey = await getConversationAesKey(alice.privateKey, bobPublic);
  const bobKey = await getConversationAesKey(bob.privateKey, alicePublic);
  const encrypted = await encryptText(aliceKey, 'private test message');
  assert.equal(await decryptText(bobKey, encrypted.ciphertext, encrypted.iv), 'private test message');
});

test('file encryption rejects tampered ciphertext', async () => {
  const alice = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const bob = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const bobPublic = await crypto.subtle.exportKey('jwk', bob.publicKey);
  const key = await getConversationAesKey(alice.privateKey, bobPublic);
  const bytes = new TextEncoder().encode('encrypted file sample');
  const encrypted = await encryptBytes(key, bytes.buffer);
  const clear = await decryptBytes(key, encrypted.buffer, encrypted.iv);
  assert.equal(new TextDecoder().decode(clear), 'encrypted file sample');
  const tampered = encrypted.buffer.slice(0);
  new Uint8Array(tampered)[0] ^= 1;
  await assert.rejects(() => decryptBytes(key, tampered, encrypted.iv));
});

test('attachments use random per-file keys delivered only inside the encrypted message', async () => {
  const plain = new TextEncoder().encode('private attachment payload').buffer;
  const first = await encryptAttachmentBytes(plain);
  const second = await encryptAttachmentBytes(plain);
  assert.notEqual(first.fileKey, second.fileKey);
  assert.notEqual(first.iv, second.iv);
  const clear = await decryptAttachmentBytes(first.fileKey, first.buffer, first.iv);
  assert.equal(new TextDecoder().decode(clear), 'private attachment payload');
  await assert.rejects(() => decryptAttachmentBytes(second.fileKey, first.buffer, first.iv));
});
