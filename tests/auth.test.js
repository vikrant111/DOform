import assert from 'node:assert/strict';
import test from 'node:test';
import {validatePassword, validateUsername} from '../electron/auth.js';

test('password policy rejects short and all-letter passwords', () => {
  assert.ok(validatePassword('short1'), 'too short');
  assert.ok(validatePassword('alllettershere'), 'no digit');
  assert.ok(validatePassword('12345678'), 'no letter');
  assert.equal(validatePassword('Utkrosh2026'), null);
});

test('username policy', () => {
  assert.ok(validateUsername('ab'), 'too short');
  assert.ok(validateUsername('has space'), 'space not allowed');
  assert.ok(validateUsername('a'.repeat(33)), 'too long');
  assert.equal(validateUsername('r.sharma-01_x'), null);
});
