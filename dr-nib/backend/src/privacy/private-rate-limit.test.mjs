import test from 'node:test';
import assert from 'node:assert/strict';
import {privateRetryAfterMs,privateRateLimitEvidence} from './private-rate-limit.js';
import {createPrivateWorkflowAi} from './private-workflow-ai.js';
import {PRIVATE_NOT_DISPATCHED} from './phala-ai-port.js';
test('rate limit timing accepts bounded seconds or HTTP dates, never arbitrary provider text',()=>{
 const now=Date.parse('2026-10-20T15:00:00Z');
 for(const [raw,want] of [['120',120000],['0',1000],['99999999',3600000],['Tue, 20 Oct 2026 15:00:30 GMT',30000],['secret provider text',60000],['-1',60000],[null,60000]])assert.equal(privateRetryAfterMs(raw,now),want);
});
test('a durable account cooldown blocks a different run before reservation or inference',async()=>{
 let queried=false;
 const tx={
  $queryRaw:async()=>[],researchRun:{findUnique:async()=>({userId:'owner',metadata:{privacyMode:'confidential'}})},
  privateInferenceCall:{findFirst:async query=>{queried=true;assert.equal(query.where.model,'fixture/model');assert.equal(query.where.usageEvidence.equals,429);return {updatedAt:new Date(),usageEvidence:{failure:{retryNotBefore:new Date(Date.now()+120000).toISOString()}}}},count:()=>assert.fail('No reservation checks or writes during cooldown')},
 };
 const ai=createPrivateWorkflowAi({db:{$transaction:async fn=>fn(tx)},aiPort:{privateVerifiedTransport:'phala-aci-v1',infer:()=>assert.fail('No provider retry')},model:'fixture/model',monthlyCapMicroUsd:770000,inputPricePerMillion:200,outputPricePerMillion:1000});
 await assert.rejects(ai({run:{id:'other-run',userId:'owner'},actionId:'new-action',messages:[{role:'user',content:'synthetic'}]}),e=>e.message==='PRIVATE_WORKFLOW_RATE_LIMITED'&&e[PRIVATE_NOT_DISPATCHED]===true);
 assert.equal(queried,true);
});
test('quota diagnostics retain bounded numbers and distinguish a fallback from provider advice',()=>{
 const now=Date.parse('2026-10-20T15:00:00Z');
 assert.deepEqual(privateRateLimitEvidence(new Headers({'retry-after':'120','x-ratelimit-limit-requests':'10','x-ratelimit-remaining-requests':'0','x-ratelimit-limit-tokens':'secret provider text','x-ratelimit-remaining-tokens':'9999999999999999','authorization':'synthetic-secret'}),now),{retryAfterMs:120000,retryAfterSource:'provider-header',requestLimit:10,requestsRemaining:0});
 for(const raw of [null,'invalid private error','Tue, 99 Oct 2026 15:00:00 GMT','Tue, 20 Oct 2026 14:59:00 GMT']){
  const headers=new Headers(raw===null?{}:{'retry-after':raw});
  assert.equal(privateRateLimitEvidence(headers,now).retryAfterSource,'local-default');
 }
 assert.equal(privateRateLimitEvidence(new Headers({'retry-after':'Tue, 20 Oct 2026 15:00:30 GMT'}),now).retryAfterMs,30000);
});
