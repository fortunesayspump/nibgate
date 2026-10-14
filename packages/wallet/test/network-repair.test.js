import test from 'node:test'
import assert from 'node:assert/strict'
import { repairArcNetwork, classifyArcRpcError } from '../src/network.js'
import { ARC_TESTNET } from '../src/chain.js'

test('a wallet that never answers repair releases the UI within the time budget', async () => {
  const provider = { request: () => new Promise(() => {}) }
  await assert.rejects(repairArcNetwork(provider, { chain: ARC_TESTNET, timeoutMs: 20 }), error => error.reason === 'timeout')
  await assert.rejects(repairArcNetwork(provider, { chain: ARC_TESTNET, timeoutMs: 20 }), error => error.reason === 'timeout')
})

test('embedded wallet disallowed network request gives an actionable unsupported error', () => {
  const error = classifyArcRpcError(new Error('Requested RPC call is not allowed'), 'wallet_addEthereumChain', { chain: ARC_TESTNET })
  assert.equal(error.reason, 'unsupported')
  assert.equal(error.canRepair, false)
})
