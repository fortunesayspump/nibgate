import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPhalaAiPort,PRIVATE_NOT_DISPATCHED} from './phala-ai-port.js';
const sessionId='a'.repeat(64);
function ready(requestSerialized=async()=>({output:'synthetic'}),verifyReceipt=receipt) {return async()=>({verified:true,productionOs:true,expectedComposeHash:true,sessionFor:async()=>sessionId,requestSerialized,verifyReceipt})}
const receipt=async(_result,expected)=>({verified:true,required:true,...expected});
test('only local failures before dispatch carry zero-spend evidence',async()=>{
  const input={model:'fixture/model',messages:[{role:'user',content:'synthetic'}]};
  const unavailable=createPhalaAiPort({approvedModels:['fixture/model'],connectVerified:async()=>{throw Error('untrusted upstream text')}});
  await assert.rejects(unavailable.infer(input),e=>e[PRIVATE_NOT_DISPATCHED]===true&&e.failureStage==='attestation'&&!JSON.stringify(e).includes('untrusted'));
  const sessionFailure=createPhalaAiPort({approvedModels:['fixture/model'],connectVerified:async()=>({...await ready()(),sessionFor:async()=>{throw Error('no current session')}})});
  await assert.rejects(sessionFailure.infer(input),e=>e[PRIVATE_NOT_DISPATCHED]===true&&e.failureStage==='session');
  const dispatched=createPhalaAiPort({approvedModels:['fixture/model'],connectVerified:ready(async()=>{throw Object.assign(Error('lost response'),{failureStage:'session'})})});
  await assert.rejects(dispatched.infer(input),e=>e[PRIVATE_NOT_DISPATCHED]===undefined&&e.failureStage==='completion');
  const receiptFailure=createPhalaAiPort({approvedModels:['fixture/model'],connectVerified:ready(undefined,async()=>{throw Error('invalid receipt')})});
  await assert.rejects(receiptFailure.infer(input),e=>e[PRIVATE_NOT_DISPATCHED]===undefined&&e.failureStage==='receipt');
});
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
test('bounded structured workflow requests explicitly disable reasoning and bind JSON mode into the receipt digest',async()=>{
  let body;
  const port=createPhalaAiPort({approvedModels:['fixture/model'],disableReasoning:true,connectVerified:ready(async serialized=>{body=JSON.parse(serialized);return {output:'synthetic'}},async(result,expected)=>{
    assert.equal(expected.requestDigest,createHash('sha256').update(JSON.stringify(body)).digest('hex'));
    return receipt(result,expected);
  })});
  await port.infer({model:'fixture/model',messages:[{role:'user',content:'Return JSON'}],json:true});
  assert.equal(body.reasoning_effort,'none');assert.deepEqual(body.response_format,{type:'json_object'});
  await port.infer({model:'fixture/model',messages:[{role:'user',content:'Write prose'}]});
  assert.equal(body.response_format,undefined);assert.equal(body.provider.aci_verified,true);assert.equal(body.provider.allow_fallbacks,false);
});
test('stage reasoning, sampling and output headroom remain receipt-bound and cannot exceed the port ceiling',async()=>{
  let sent,calls=0;
  const port=createPhalaAiPort({approvedModels:['fixture/model'],maxOutputTokens:8192,connectVerified:ready(async body=>{calls++;sent=JSON.parse(body);return {output:'synthetic'}})});
  await port.infer({model:'fixture/model',messages:[{role:'user',content:'synthetic'}],reasoningEffort:'high',temperature:0.3,maxTokens:8192});
  assert.equal(sent.reasoning_effort,'high');assert.equal(sent.temperature,0.3);assert.equal(sent.max_tokens,8192);
  for(const settings of [{maxTokens:8193},{maxTokens:NaN},{temperature:3},{reasoningEffort:'unbounded'}])
    await assert.rejects(port.infer({model:'fixture/model',messages:[{role:'user',content:'synthetic'}],...settings}),{code:'PHALA_PRIVATE_AI_UNAVAILABLE'});
  assert.equal(calls,1);
});
test('failure phase distinguishes session discovery, completion and receipt errors without provider details',async()=>{
  for(const failureStage of ['attestation','session','completion','receipt']){
    let sends=0;
    const fail=()=>{throw Error('SECRET_PROVIDER_BODY')};
    const port=createPhalaAiPort({approvedModels:['fixture/model'],connectVerified:failureStage==='attestation'?fail:async()=>({verified:true,productionOs:true,expectedComposeHash:true,sessionFor:failureStage==='session'?fail:async()=>sessionId,requestSerialized:async()=>{sends++;if(failureStage==='completion')fail();return{}},verifyReceipt:fail})});
    await assert.rejects(port.infer({model:'fixture/model',messages:[{role:'user',content:'synthetic'}]}),error=>error.code==='PHALA_PRIVATE_AI_UNAVAILABLE'&&error.failureStage===failureStage&&!error.message.includes('SECRET'));
    assert.equal(sends,['completion','receipt'].includes(failureStage)?1:0);
  }
});
