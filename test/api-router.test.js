import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/index.js';

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('API dispatcher returns JSON 404 for unknown routes', async () => {
  const res = response();
  await handler({ method: 'GET', query: { route: 'does-not-exist' }, url: '/api/index?route=does-not-exist' }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error, 'NOT_FOUND');
  assert.match(res.headers['Content-Type'], /application\/json/);
});

test('health route works without requiring configured integrations', async () => {
  const res = response();
  await handler({ method: 'GET', query: { route: 'health' }, url: '/api/index?route=health' }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.service, 'mschat-api');
});
