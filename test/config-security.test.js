import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Firebase rules deny all direct client reads and writes', async () => {
  const config = JSON.parse(await readFile('firebase.rules.json', 'utf8'));
  assert.equal(config.rules['.read'], false);
  assert.equal(config.rules['.write'], false);
  assert.equal(config.rules.mschat['.read'], false);
  assert.equal(config.rules.mschat['.write'], false);
});

test('environment example contains placeholders rather than live credentials', async () => {
  const env = await readFile('.env.example', 'utf8');
  assert.match(env, /FIREBASE_PRIVATE_KEY=/);
  assert.match(env, /OTP_HMAC_SECRET=/);
  assert.match(env, /R2_SECRET_ACCESS_KEY=/);
  assert.doesNotMatch(env, /-----BEGIN PRIVATE KEY-----/);
  assert.doesNotMatch(env, /ya29\.[A-Za-z0-9_-]{20,}/);
});
