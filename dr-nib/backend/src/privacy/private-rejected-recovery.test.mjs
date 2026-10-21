import test from 'node:test';import assert from 'node:assert/strict';import{rejected429Recovery}from'./private-rejected-recovery.js';
function fixture(){return {requestId:'request',failure:{error:'PHALA_PRIVATE_AI_RATE_LIMITED'},checkpoint:{entries:[{kind:'infer',state:'complete'},{kind:'infer',state:'started'}]},calls:[{id:'call',actionId:'request',model:'model',status:'reserved',committedMicroUsd:29168n,usageEvidence:{failure:{httpStatus:429,model:'model',requestDigest:'a'.repeat(64),receiptId:'rcpt-synthetic'}}}]}}
test('definite 429 recovery retains full allowance rather than claiming zero bill or non-dispatch',()=>{
 const f=fixture(),r=rejected429Recovery(f);assert.equal(r.retainedMicroUsd,'29168');assert.equal(r.callId,'call');assert.equal(f.calls[0].committedMicroUsd,29168n);
});
test('unknown failures, tools, non-tail starts, ambiguous calls and exhausted retries stay blocked',()=>{
 for(const change of [f=>f.failure.error='PHALA_PRIVATE_AI_COMPLETION_FAILED',f=>f.checkpoint.entries.at(-1).kind='terminal',f=>f.checkpoint.entries.push({kind:'infer',state:'complete'}),f=>f.calls.push({...f.calls[0]}),f=>f.calls[0].usageEvidence.failure.httpStatus=503,f=>f.calls[0].actionId='other',f=>f.checkpoint.reconciliations=[{kind:'operator-covered-429'},{kind:'operator-covered-429'}]]){
  const f=fixture();change(f);assert.equal(rejected429Recovery(f),null);
 }
});

test('interrupted inference recovery keeps the full unknown operator reserve and never admits tool replay',async()=>{
 const {interruptedInferenceRecovery:recover}=await import('./private-rejected-recovery.js');
 const make=()=>({requestId:'request',receiptStatus:'processing',checkpoint:{entries:[{kind:'terminal',state:'complete',result:{value:'saved exit 0'}},{kind:'infer',state:'started'}]},calls:[{id:'call',actionId:'request',model:'model',status:'reserved',reservedMicroUsd:29168n,committedMicroUsd:29168n,usageEvidence:null}]});
 assert.deepEqual(recover(make()),{callId:'call',model:'model',retainedMicroUsd:'29168'});
 for(const change of [f=>f.receiptStatus='uncertain',f=>f.checkpoint.entries.at(-1).kind='terminal',f=>f.checkpoint.entries.at(-1).kind='public-retrieval',f=>f.checkpoint.entries.at(-1).kind='judge',f=>f.checkpoint.entries.push({kind:'infer',state:'complete'}),f=>f.calls.push({...f.calls[0]}),f=>f.calls[0].actionId='other',f=>f.calls[0].usageEvidence={failure:{httpStatus:429}},f=>f.calls[0].committedMicroUsd=0n,f=>f.checkpoint.reconciliations=[{kind:'operator-covered-interrupted-inference'},{kind:'operator-covered-interrupted-inference'}]]){
  const f=make();change(f);assert.equal(recover(f),null);
 }
});
