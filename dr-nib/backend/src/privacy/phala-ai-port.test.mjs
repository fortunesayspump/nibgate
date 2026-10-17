import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPhalaAiPort} from './phala-ai-port.js';
const sessionId='a'.repeat(64);
function ready(requestSerialized=async()=>({output:'synthetic'}),verifyReceipt=receipt) {return async()=>({verified:true,productionOs:true,expectedComposeHash:true,sessionFor:async()=>sessionId,requestSerialized,verifyReceipt})}
const receipt=async(_result,expected)=>({verified:true,required:true,...expected});
test('reviewed model request uses pinned channel, mandatory ACI/ZDR and bound receipt',async()=>{
  let sent,wire;
  const port=createPhalaAiPort({approvedModels:['fixture/model'],connectVerified:ready(async x=>{assert.equal(typeof x,'string');wire=x;sent=JSON.parse(x);return {output:'synthetic'}},async(result,expected)=>{
    assert.equal(expected.requestDigest,createHash('sha256').update(wire,'utf8').digest('hex'));
    return receipt(result,expected);
  })});
  assert.deepEqual(await port.infer({model:'fixture/model',messages:[{role:'user',content:'HARMLESS_SYNTHETIC_PRIVATE_CANARY'}]}),{output:'synthetic'});
  assert.deepEqual(sent.provider,{aci_verified:true,zdr:true,data_collection:'deny',allow_fallbacks:false,require_parameters:true,aci_session_ids:[sessionId]});
});
test('missing attested channel fails before private prompt transmission',async()=>{
  let called=0;
  const port=createPhalaAiPort({approvedModels:['fixture/model'],connectVerified:async()=>({verified:false,sessionId,requestSerialized:async()=>{called++},verifyReceipt:receipt})});
  await assert.rejects(port.infer({model:'fixture/model',messages:[{role:'user',content:'HARMLESS_SYNTHETIC_PRIVATE_CANARY'}]}),{code:'PHALA_PRIVATE_AI_UNAVAILABLE'});
  assert.equal(called,0);
});
test('unverified, old-session or wrong-body receipt is not accepted; alternate model denied',async()=>{
  for(const mutate of [e=>({...e,verified:false}),e=>({...e,sessionId:'old_session_1'}),e=>({...e,requestDigest:'0'.repeat(64)})]) {
    const port=createPhalaAiPort({approvedModels:['fixture/model'],connectVerified:ready(undefined,async(_result,e)=>mutate(await receipt(_result,e)))});
    await assert.rejects(port.infer({model:'fixture/model',messages:[{role:'user',content:'synthetic'}]}),{code:'PHALA_PRIVATE_AI_UNAVAILABLE'});
    await assert.rejects(port.infer({model:'other/model',messages:[{role:'user',content:'synthetic'}]}),{code:'PHALA_PRIVATE_AI_UNAVAILABLE'});
  }
});
test('canary-bearing provider exception is replaced by fixed safe error',async()=>{
  const port=createPhalaAiPort({approvedModels:['fixture/model'],connectVerified:ready(async()=>{throw new Error('HARMLESS_SYNTHETIC_PRIVATE_CANARY')})});
  await assert.rejects(port.infer({model:'fixture/model',messages:[{role:'user',content:'synthetic'}]}),error=>error.code==='PHALA_PRIVATE_AI_UNAVAILABLE' && !error.message.includes('CANARY'));
});
