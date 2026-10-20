import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateModelPool,PRIVATE_CANARY_MODEL_POOL,privateModelPoolPolicy} from './private-model-pool.js';
import {PRIVATE_NOT_DISPATCHED,PRIVATE_USAGE,PRIVATE_CALL_CHARGE,PRIVATE_FAILURE_EVIDENCE} from './phala-ai-port.js';
const [gemma,qwen]=PRIVATE_CANARY_MODEL_POOL;
function fixture({fail,limited=false,cap=1000000,fallbackInfer}={}){
 const calls=[],rows=[];
 const sum=()=>({_sum:{committedMicroUsd:rows.reduce((n,r)=>n+r.committedMicroUsd,0n)}});
 const tx={$queryRaw:async()=>[],researchRun:{findUnique:async()=>({userId:'owner',metadata:{privacyMode:'confidential'}})},
  privateInferenceCall:{findFirst:async q=>limited&&q.where.model===gemma.model?{updatedAt:new Date(),usageEvidence:{failure:{retryNotBefore:new Date(Date.now()+120000).toISOString()}}}:null,
   count:async({where})=>rows.filter(r=>r.runId===where.runId&&r.actionId===where.actionId&&(!where.status||r.status===where.status)).length,
   aggregate:async()=>sum(),create:async({data})=>rows.push({...data}),
   updateMany:async({where,data})=>{for(const row of rows)if(row.id===where.id&&row.status===where.status)Object.assign(row,data)},
   update:async({where,data})=>Object.assign(rows.find(r=>r.id===where.id),data)},
  privateAiBudgetReservation:{aggregate:async()=>({_sum:{committedMicroUsd:0}})}};
 const infer=createPrivateModelPool({db:{$transaction:async fn=>fn(tx),privateInferenceCall:tx.privateInferenceCall},monthlyCapMicroUsd:cap,fallbackInfer,
  createPort:model=>({privateVerifiedTransport:'phala-aci-v1',infer:async req=>{
   calls.push(req);assert.equal(rows.at(-1).status,'reserved');assert.equal(req.model,model);
   if(model===gemma.model&&fail)throw fail();
   const result={choices:[{message:{content:'synthetic result'}}]};
   Object.defineProperty(result,PRIVATE_USAGE,{value:{model,inputTokens:10,outputTokens:5,costMicroUsd:1}});
   return result;
  }})});
 return {infer,calls,rows};
}
const request={run:{id:'fixture',userId:'owner'},actionId:'action',stage:'plan',json:true,messages:[{role:'user',content:'synthetic'}]};
function availability(){const e=Object.assign(Error('unavailable'),{code:'PHALA_PRIVATE_AI_UNAVAILABLE',failureStage:'session'});Object.defineProperty(e,PRIVATE_NOT_DISPATCHED,{value:true});return e;}
test('pool policy is closed and production-unqualified catalog entries cannot be injected',()=>{
 assert.equal(privateModelPoolPolicy('single'),null);
 assert.equal(privateModelPoolPolicy('gemma-qwen-canary-v1'),PRIVATE_CANARY_MODEL_POOL);
 for(const name of ['openrouter','auto','cheapest',undefined])assert.throws(()=>privateModelPoolPolicy(name));
 assert.ok(Object.isFrozen(PRIVATE_CANARY_MODEL_POOL));
});
test('proven session absence rotates to Qwen with distinct pricing, profile, actual-model charge and released first reservation',async()=>{
 const f=fixture({fail:availability}),result=await f.infer(request);
 assert.deepEqual(f.calls.map(c=>c.model),[gemma.model,qwen.model]);
 assert.equal(f.calls[0].reasoningEffort,undefined);assert.equal(f.calls[1].reasoningEffort,'low');
 assert.equal(f.rows[0].status,'not-dispatched');assert.equal(f.rows[0].committedMicroUsd,0n);
 assert.equal(f.rows[1].status,'verified');assert.equal(f.rows[1].committedMicroUsd,1n);
 assert.ok(f.rows[1].reservedMicroUsd>f.rows[0].reservedMicroUsd);
 assert.equal(result[PRIVATE_USAGE].model,qwen.model);assert.equal(result[PRIVATE_CALL_CHARGE].callId,f.rows[1].id);
 await f.infer({...request,actionId:'next-action'});
 assert.equal(f.calls.length,3);assert.equal(f.calls.at(-1).model,qwen.model);
});
test('persisted model cooldown skips Gemma before dispatch and reservation',async()=>{
 const f=fixture({limited:true});await f.infer(request);
 assert.deepEqual(f.calls.map(c=>c.model),[qwen.model]);assert.equal(f.rows.length,1);
});
test('forwarded 429 stays reserved and cannot rotate or replay on a subsequent action recovery',async()=>{
 const f=fixture({fail:()=>{const e=Object.assign(Error('failed'),{code:'PHALA_PRIVATE_AI_UNAVAILABLE',failureStage:'completion',privateCompletionReason:'PHALA_PRIVATE_AI_RATE_LIMITED'});Object.defineProperty(e,PRIVATE_FAILURE_EVIDENCE,{value:{httpStatus:429}});return e;}});
 await assert.rejects(f.infer(request));assert.equal(f.calls.length,1);assert.equal(f.rows[0].status,'reserved');
 await assert.rejects(f.infer(request),{message:'PRIVATE_WORKFLOW_ACTION_UNCERTAIN'});assert.equal(f.calls.length,1);
});
test('unknown outcomes, attestation failures and receipt failures never trigger alternate inference',async()=>{
 for(const stage of ['completion','attestation','receipt']){
  const f=fixture({fail:()=>{const e=Object.assign(Error('failed'),{code:'PHALA_PRIVATE_AI_UNAVAILABLE',failureStage:stage});if(stage==='attestation')Object.defineProperty(e,PRIVATE_NOT_DISPATCHED,{value:true});return e;}});
  await assert.rejects(f.infer(request));assert.equal(f.calls.length,1);
 }
});
test('a more expensive alternative must fit the same cumulative cap',async()=>{
 const f=fixture({fail:availability,cap:24000});
 await assert.rejects(f.infer(request),{message:'PRIVATE_WORKFLOW_CAP'});
 assert.equal(f.calls.length,1);assert.equal(f.rows.length,1);assert.equal(f.rows[0].committedMicroUsd,0n);
});
test('disclosed hybrid route uses fallback after a definite 429, retaining operator exposure without charging the customer',async()=>{
 let fallbackCalls=0;
 const f=fixture({fail:()=>{const e=Object.assign(Error('rejected'),{code:'PHALA_PRIVATE_AI_UNAVAILABLE',failureStage:'completion',privateCompletionReason:'PHALA_PRIVATE_AI_RATE_LIMITED'});Object.defineProperty(e,PRIVATE_FAILURE_EVIDENCE,{value:{httpStatus:429}});return e;},fallbackInfer:async()=>{fallbackCalls++;return {fallback:true}}});
 assert.deepEqual(await f.infer(request),{fallback:true});assert.equal(fallbackCalls,1);assert.equal(f.calls.length,1);
 assert.equal(f.rows[0].status,'rejected-held');assert.equal(f.rows[0].billingKind,'platform');assert.equal(f.rows[0].committedMicroUsd,f.rows[0].reservedMicroUsd);
});
test('hybrid fallback does not bypass an unknown primary outcome',async()=>{
 const f=fixture({fail:()=>Error('lost response'),fallbackInfer:()=>assert.fail('No replay of an unknown result')});await assert.rejects(f.infer(request),{message:'lost response'});
});
