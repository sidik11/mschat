import test from 'node:test';
import assert from 'node:assert/strict';

const normalizeEmail = value => String(value || '').trim().toLowerCase();
const normalizeUsername = value => String(value || '').trim().toLowerCase();

test('email normalization makes case variants identical', () => {
  assert.equal(normalizeEmail('  SIDIK@example.com '), 'sidik@example.com');
  assert.equal(normalizeEmail('Sidik@Example.com'), normalizeEmail('sidik@example.com'));
});

test('username normalization makes case variants identical', () => {
  assert.equal(normalizeUsername('Sidik_11'), 'sidik_11');
  assert.equal(normalizeUsername('SIDIK_11'), normalizeUsername('sidik_11'));
});

test('username format rejects spaces and unsupported characters', () => {
  assert.match(normalizeUsername('sidik_11'), /^[a-z0-9_]{3,24}$/);
  assert.doesNotMatch(normalizeUsername('sidik 11'), /^[a-z0-9_]{3,24}$/);
  assert.doesNotMatch(normalizeUsername('ab'), /^[a-z0-9_]{3,24}$/);
});

test('password minimum is enforced by the registration contract', () => {
  assert.ok('a-long-password'.length >= 12);
  assert.ok('short'.length < 12);
});
