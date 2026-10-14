import assert from 'node:assert/strict';
import test from 'node:test';
process.env.VITEST = '1';
process.env.HUB_DATABASE_URL = 'postgresql://fixture:fixture@127.0.0.1:9/fixture';
process.env.DRNIB_DATABASE_URL = process.env.HUB_DATABASE_URL;
const { researchAvailability } = await import('../dr-nib/backend/src/readiness.js');
test('unconfigured production mainnet cannot accept research runs', () => {
  assert.equal(researchAvailability({ network: 'mainnet', production: true, escrowReady: false }).acceptingRuns, false);
});
test('configured mainnet and the testnet preview have explicit readiness', () => {
  assert.equal(researchAvailability({ network: 'mainnet', production: true, escrowReady: true }).acceptingRuns, true);
  assert.equal(researchAvailability({ network: 'testnet', production: true, escrowReady: true }).acceptingRuns, true);
});
