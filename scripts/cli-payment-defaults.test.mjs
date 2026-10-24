import assert from 'node:assert/strict';
import test from 'node:test';
import { createPaymentProvider } from '../packages/cli/src/core/payments.js';

const ENV_KEYS = [
  'NIBGATE_NETWORK', 'NIBGATE_PAYMENT_NETWORK', 'NIBGATE_BUYER_CHAIN',
  'CIRCLE_GATEWAY_FACILITATOR_URL', 'NIBGATE_PAYMENT_MODE',
];

function withoutPaymentEnv(run) {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  try { return run(); }
  finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test('CLI Gateway defaults follow a mainnet payment network', () => withoutPaymentEnv(() => {
  const provider = createPaymentProvider({ payments: { mode: 'circle-gateway', networks: ['eip155:5042'] }, routes: [] });
  assert.equal(provider.buyerChain, 'arc');
  assert.equal(provider.facilitatorUrl, 'https://gateway-api.circle.com');
  assert.deepEqual(provider.networks, ['eip155:5042']);
}));

test('CLI Gateway recognizes route and environment mainnet forms', () => withoutPaymentEnv(() => {
  let provider = createPaymentProvider({ payments: { mode: 'circle-gateway' }, routes: [{ network: 'arc' }] });
  assert.equal(provider.buyerChain, 'arc');
  assert.deepEqual(provider.networks, ['eip155:5042']);

  process.env.NIBGATE_NETWORK = 'mainnet';
  provider = createPaymentProvider({ payments: { mode: 'circle-gateway', networks: ['eip155:5042002'] }, routes: [] });
  assert.equal(provider.buyerChain, 'arc');
  assert.equal(provider.facilitatorUrl, 'https://gateway-api.circle.com');
  assert.deepEqual(provider.networks, ['eip155:5042']);
}));

test('CLI Gateway defaults stay testnet-safe and never misclassify 5042002 as 5042', () => withoutPaymentEnv(() => {
  const provider = createPaymentProvider({ payments: { mode: 'circle-gateway', networks: ['eip155:5042002'] }, routes: [] });
  assert.equal(provider.buyerChain, 'arcTestnet');
  assert.equal(provider.facilitatorUrl, 'https://gateway-api-testnet.circle.com');
  assert.deepEqual(provider.networks, ['eip155:5042002']);
}));

test('explicit Gateway overrides remain authoritative', () => withoutPaymentEnv(() => {
  process.env.NIBGATE_BUYER_CHAIN = 'arcTestnet';
  process.env.CIRCLE_GATEWAY_FACILITATOR_URL = 'https://facilitator.example';
  const provider = createPaymentProvider({ payments: { mode: 'circle-gateway', networks: ['eip155:5042'] }, routes: [] });
  assert.equal(provider.buyerChain, 'arcTestnet');
  assert.equal(provider.facilitatorUrl, 'https://facilitator.example');
}));
