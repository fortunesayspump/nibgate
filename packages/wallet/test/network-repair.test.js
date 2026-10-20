import test from 'node:test'
import assert from 'node:assert/strict'
import { repairArcNetwork, classifyArcRpcError, ensureArcNetwork } from '../src/network.js'
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

test('an explicit payment repairs one stale wallet RPC and verifies it before continuing',async()=>{
 let repaired=false,adds=0;
 const provider={request:async({method})=>{
  if(method==='eth_chainId')return ARC_TESTNET.chainIdHex;
  if(method==='eth_blockNumber'){if(!repaired)throw Object.assign(Error('HTTP 404'),{status:404});return '0xabc';}
  if(method==='wallet_addEthereumChain'){adds++;repaired=true;return null;}
  if(method==='wallet_switchEthereumChain')return null;
  assert.fail(method);
 }};
 const result=await ensureArcNetwork(provider,{chain:ARC_TESTNET});assert.equal(result.repaired,true);assert.equal(result.blockNumber,'0xabc');assert.equal(adds,1);
});
test('a failed or rejected automatic repair never loops',async()=>{
 for(const rejection of [Object.assign(Error('rejected'),{code:4001}),Object.assign(Error('HTTP 404'),{status:404})]){
  let adds=0;
  const provider={request:async({method})=>{if(method==='eth_chainId')return ARC_TESTNET.chainIdHex;if(method==='wallet_addEthereumChain'){adds++;throw rejection;}throw Object.assign(Error('HTTP 404'),{status:404});}};
  await assert.rejects(ensureArcNetwork(provider,{chain:ARC_TESTNET}));assert.equal(adds,1);
 }
});
