const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../dist/auth/password');

test('password hashes use independent salts and reject incorrect passwords', async () => {
  const first = await hashPassword('a strong test password');
  const second = await hashPassword('a strong test password');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('a strong test password', first), true);
  assert.equal(await verifyPassword('incorrect', first), false);
  assert.equal(await verifyPassword('anything', 'invalid'), false);
});
