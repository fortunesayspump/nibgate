import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createPrivateBrokerMoney} from './private-broker-money.js';

const SECRET = 's'.repeat(40);
const URL_BASE = 'https://api.example.test/v1/private';
const ENV = { DRNIB_PRIVATE_BROKER_MONEY_URL: URL_BASE, DRNIB_PRIVATE_BROKER_MONEY_SECRET: SECRET };

test('broker money stays disabled unless the secret and an https backend are configured', () => {
  assert.equal(createPrivateBrokerMoney({ env: {} }), null);
  assert.equal(createPrivateBrokerMoney({ env: { ...ENV, DRNIB_PRIVATE_BROKER_MONEY_SECRET: 'short' } }), null);
  assert.equal(createPrivateBrokerMoney({ env: { ...ENV, DRNIB_PRIVATE_BROKER_MONEY_URL: 'http://api.example.test/v1/private' } }), null);
});

test('draw signs the exact body and posts to the internal route', async () => {
  const calls = [];
  const money = createPrivateBrokerMoney({ env: ENV, now: () => 1234, fetchImpl: async (url, init) => {
    calls.push({ url: String(url), init });
    return { ok: true, redirected: false, json: async () => ({ ok: true, spend: 0.03 }) };
  } });
  assert.equal(money.enabled, true);
  const out = await money.draw({ runId: 'run-1', tenantId: 'owner-1', amountUsd: '0.03', txRef: 'receipt-9' });
  assert.deepEqual(out, { ok: true, spend: 0.03 });
  assert.equal(calls[0].url, 'https://api.example.test/v1/private/internal/draw');
  const body = JSON.stringify({ runId: 'run-1', tenantId: 'owner-1', amountUsd: '0.03', txRef: 'receipt-9' });
  assert.equal(calls[0].init.body, body);
  assert.equal(calls[0].init.headers['x-drnib-ts'], '1234');
  assert.equal(calls[0].init.headers['x-drnib-sig'], createHmac('sha256', SECRET).update(`1234.${body}`).digest('hex'));
});

test('a rejected or redirected backend response resolves to null, never a partial charge', async () => {
  const money = createPrivateBrokerMoney({ env: ENV, fetchImpl: async () => ({ ok: false, redirected: false, json: async () => ({}) }) });
  assert.equal(await money.settle({ runId: 'r', tenantId: 't', reason: 'complete' }), null);
  const redirected = createPrivateBrokerMoney({ env: ENV, fetchImpl: async () => ({ ok: true, redirected: true, json: async () => ({ ok: true }) }) });
  assert.equal(await redirected.draw({ runId: 'r', tenantId: 't', amountUsd: '0.01', txRef: 'x' }), null);
});
