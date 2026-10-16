import {test} from 'node:test';
import assert from 'node:assert/strict';
import {wakeAwareGuestHealth,withPrivateBrokerWake} from './private-broker-wake.js';
const runId='11111111-1111-4111-8111-111111111111';

test('waking happens before guest health; no health result substitutes for a job lease',async()=>{
  const order=[];
  const wake={ensureReady:async()=>{order.push('wake')}};
  const health=wakeAwareGuestHealth(wake,async()=>{order.push('health');return {privateReady:true}});
  assert.deepEqual(await health(),{privateReady:true});
  assert.deepEqual(order,['wake','health']);
  assert.equal(typeof wake.run,'undefined');
  await assert.rejects(withPrivateBrokerWake(wake,async()=>{},runId),/PRIVATE_WAKE_CONFIG_INVALID/);
});

test('forwarding is held inside a fresh per-request lease and receives abort signal',async()=>{
  const ids=[];const signals=[];
  const wake={run:async(id,fn)=>{ids.push(id);const controller=new AbortController();
    signals.push(controller.signal);return fn(id,controller.signal)}};
  const one=await withPrivateBrokerWake(wake,async signal=>{assert.equal(signal,signals[0]);return 'ciphertext receipt'},runId);
  const two=await withPrivateBrokerWake(wake,async signal=>{assert.equal(signal,signals[1]);return 'ciphertext status'},runId);
  assert.equal(one,'ciphertext receipt');assert.equal(two,'ciphertext status');
  assert.equal(ids.length,2);assert.notEqual(ids[0],ids[1]);
  assert.match(ids[0],/^11111111-1111-4111-8111-111111111111:[0-9a-f-]{36}$/);
});

test('manual bounded mode preserves direct forwarding without a wake controller',async()=>{
  assert.equal(await withPrivateBrokerWake(undefined,async signal=>{
    assert.equal(signal,undefined);return 202;
  }),202);
});
