import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verificationFailure } from './verification-result.ts';

test('verification succeeds only when the check itself succeeds', () => {
  assert.equal(verificationFailure(true, { success: true, verification: { ok: true } }), null);
  assert.equal(verificationFailure(true, { success: true, verification: { ok: false, reason: 'Widget missing' } }), 'Widget missing');
  assert.ok(verificationFailure(true, { success: true }));
  assert.ok(verificationFailure(false, { success: true, verification: { ok: true } }));
  assert.equal(verificationFailure(false, { error: 'Not your site' }), 'Not your site');
});
