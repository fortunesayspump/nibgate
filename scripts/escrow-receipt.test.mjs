import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createdJobFromReceipt, requireSuccessfulReceipt } from '../frontend/src/lib/escrow-receipt.js';
const { encodeEventTopics, encodeAbiParameters, parseAbiItem } = createRequire(new URL('../frontend/package.json', import.meta.url))('viem');
const address = n => `0x${String(n).padStart(40, '0')}`;
const expected = { core: address(1), client: address(2), evaluator: address(3), provider: address(4), hook: address(0), expiredAt: 1000n };
const event = parseAbiItem('event JobCreated(uint256 indexed jobId, address indexed client, address indexed evaluator, address provider, address hook, uint256 expiredAt)');
function receipt(overrides = {}) {
  const values = { ...expected, ...overrides };
  return { status: 'success', logs: [{ address: values.core,
    topics: encodeEventTopics({ abi: [event], eventName: 'JobCreated', args: { jobId: 7n, client: values.client, evaluator: values.evaluator } }),
    data: encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint256' }], [values.provider, values.hook, values.expiredAt]),
  }] };
}
test('uses the job in this transaction receipt without scanning concurrent jobs', () => {
  assert.equal(createdJobFromReceipt(receipt(), expected), 7n);
});
test('reverted transactions stop the flow', () => {
  assert.throws(() => requireSuccessfulReceipt({ status: 'reverted' }, 'fund'), /fund transaction reverted/);
  assert.throws(() => createdJobFromReceipt({ ...receipt(), status: 'reverted' }, expected), /reverted/);
});
for (const key of ['core', 'client', 'evaluator', 'provider', 'hook']) {
  test(`rejects a mismatching ${key}`, () => assert.throws(() => createdJobFromReceipt(receipt({ [key]: address(9) }), expected), /no matching escrow/));
}
test('rejects wrong expiry and missing logs', () => {
  assert.throws(() => createdJobFromReceipt(receipt({ expiredAt: 999n }), expected), /no matching escrow/);
  assert.throws(() => createdJobFromReceipt({ status: 'success', logs: [] }, expected), /no matching escrow/);
});
