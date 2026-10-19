import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, validatePassword, normalizeEmail, normalizeUsername, sha, publicUser } from '../lib/core.js';

test('normalization is deterministic and case-insensitive', () => {
  assert.equal(normalizeEmail('  USER@Example.COM '), 'user@example.com');
  assert.equal(normalizeUsername('  SiDiK_01 '), 'sidik_01');
  assert.equal(sha('same'), sha('same'));
  assert.notEqual(sha('same'), sha('different'));
});

test('password policy rejects weak and oversized values', () => {
  assert.equal(validatePassword('short'), false);
  assert.equal(validatePassword('long-enough-password'), true);
  assert.equal(validatePassword('x'.repeat(129)), false);
  assert.equal(validatePassword('valid-password\nwith-line-break'), false);
});

test('password hashes verify without storing plaintext', async () => {
  const password = 'a-long-unique-test-password';
  const stored = await hashPassword(password);
  assert.match(stored, /^scrypt\$/);
  assert.equal(stored.includes(password), false);
  assert.equal(await verifyPassword(password, stored), true);
  assert.equal(await verifyPassword('wrong-password', stored), false);
  assert.equal(await verifyPassword(password, 'invalid'), false);
});

test('public user serialization excludes password and private fields', () => {
  const safe = publicUser({ id: 'u1', fullName: 'Example User', username: 'example', email: 'e@example.com', passwordHash: 'secret', role: 'admin', publicKey: { x: 'secret' }, createdAt: 1 });
  assert.deepEqual(Object.keys(safe).sort(), ['avatarUrl', 'createdAt', 'email', 'fullName', 'id', 'username'].sort());
  assert.equal('passwordHash' in safe, false);
  assert.equal('publicKey' in safe, false);
});
