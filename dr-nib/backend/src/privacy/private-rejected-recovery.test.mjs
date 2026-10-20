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
