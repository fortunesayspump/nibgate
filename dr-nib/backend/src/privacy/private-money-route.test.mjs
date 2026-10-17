import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import {createHmac} from 'node:crypto';
import {createPrivateMoneyRouter} from './private-money-route.js';

const SECRET = 'x'.repeat(48);
const RUN = '11111111-1111-4111-8111-111111111111';
const TENANT = 'owner-1';
const TS = 1_700_000_000;

function app({store, drawImpl, settleImpl = async () => ({ ok: true }), secret = SECRET} = {}) {
  const instance = express();
  instance.use(createPrivateMoneyRouter({store, secret, drawImpl, settleImpl, now: () => TS}));
  return instance;
}

function signed(payload, secret = SECRET) {
  const body = JSON.stringify(payload);
  const sig = createHmac('sha256', secret).update(`${TS}.`).update(body).digest('hex');
  return { body, sig };
}

function confidentialRun(extra = {}) {
  return { id: RUN, userId: TENANT, deletedAt: null, settledAt: null, metadata: { privacyMode: 'confidential' }, ...extra };
}

test('a signed draw for a confidential run reaches the ledger with the verified amount and txRef', async () => {
  const calls = [];
  const res = await request(app({ store: { researchRun: { findUnique: async () => confidentialRun() } }, drawImpl: async (...args) => { calls.push(args); return { ok: true, spend: 0.02 }; } }))
    .post('/internal/draw')
    .set('Content-Type', 'application/json')
    .set('x-drnib-ts', String(TS))
    .set('x-drnib-sig', signed({ runId: RUN, tenantId: TENANT, amountUsd: '0.02', txRef: 'receipt-1' }).sig)
    .send(signed({ runId: RUN, tenantId: TENANT, amountUsd: '0.02', txRef: 'receipt-1' }).body);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, spend: 0.02 });
  assert.deepEqual(calls, [[RUN, '0.02', 'spend', 'receipt-1']]);
});

test('a forged, stale or malformed request never reaches the ledger', async () => {
  let drew = 0;
  const instance = app({ store: { researchRun: { findUnique: async () => confidentialRun() } }, drawImpl: async () => { drew++; return { ok: true }; } });
  const good = signed({ runId: RUN, tenantId: TENANT, amountUsd: '0.02', txRef: 'r' });

  const badSig = await request(instance).post('/internal/draw')
    .set('Content-Type', 'application/json').set('x-drnib-ts', String(TS)).set('x-drnib-sig', 'a'.repeat(64)).send(good.body);
  assert.equal(badSig.status, 401);

  const staleSig = createHmac('sha256', SECRET).update(`${TS - 120}.${good.body}`).digest('hex');
  const stale = await request(instance).post('/internal/draw')
    .set('Content-Type', 'application/json').set('x-drnib-ts', String(TS - 120)).set('x-drnib-sig', staleSig).send(good.body);
  assert.equal(stale.status, 401);

  const badAmount = await request(instance).post('/internal/draw')
    .set('Content-Type', 'application/json').set('x-drnib-ts', String(TS)).set('x-drnib-sig', signed({ runId: RUN, tenantId: TENANT, amountUsd: '1e3' }).sig)
    .send(signed({ runId: RUN, tenantId: TENANT, amountUsd: '1e3' }).body);
  assert.equal(badAmount.status, 400);

  assert.equal(drew, 0);
});

test('a draw against a non-confidential, foreign, settled or missing run is refused', async () => {
  let drew = 0;
  const drawImpl = async () => { drew++; return { ok: true }; };
  const payload = { runId: RUN, tenantId: TENANT, amountUsd: '0.02', txRef: 'r' };
  const { body, sig } = signed(payload);
  const post = run => request(app({ store: { researchRun: { findUnique: async () => run } }, drawImpl }))
    .post('/internal/draw').set('Content-Type', 'application/json').set('x-drnib-ts', String(TS)).set('x-drnib-sig', sig).send(body);

  assert.equal((await post({ ...confidentialRun(), metadata: { privacyMode: 'legacy' } })).status, 404);
  assert.equal((await post(confidentialRun({ userId: 'someone-else' }))).status, 404);
  assert.equal((await post(confidentialRun({ settledAt: new Date() }))).status, 404);
  assert.equal((await post(null)).status, 404);
  assert.equal(drew, 0);
});

test('the router refuses to construct without a strong shared secret', () => {
  assert.throws(() => createPrivateMoneyRouter({ secret: 'short' }), { message: 'PRIVATE_MONEY_SECRET_INVALID' });
  assert.throws(() => createPrivateMoneyRouter({ secret: undefined }), { message: 'PRIVATE_MONEY_SECRET_INVALID' });
});
