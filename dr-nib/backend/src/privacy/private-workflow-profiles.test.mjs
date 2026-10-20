import test from 'node:test';import assert from 'node:assert/strict';
import {privateWorkflowProfile} from './private-workflow-profiles.js';
import {createPrivateWorkflowAi} from './private-workflow-ai.js';
test('research uses the receipt-tested bounded reasoning profile while intake stays bounded, with immutable closed stage profiles',()=>{
    assert.equal(privateWorkflowProfile('intake').effort,'none');
    for(const stage of ['plan','write','verify']){
        const profile=privateWorkflowProfile(stage);assert.equal(profile.effort,'low');assert.ok(profile.maxTokens>=8192&&profile.maxTokens<=16384);assert.ok(Object.isFrozen(profile));
    }
    assert.equal(privateWorkflowProfile('plan').temperature,0.3);assert.equal(privateWorkflowProfile('write').temperature,0.4);
    for(const stage of ['__proto__','constructor','unrestricted',undefined])assert.throws(()=>privateWorkflowProfile(stage));
});
test('reviewed Gemma instruct route omits unsupported reasoning effort without changing stage bounds',()=>{
 for(const stage of ['intake','plan','write','verify','discuss','thinking','agent','review']){
  const original=privateWorkflowProfile(stage),gemma=privateWorkflowProfile(stage,'phala/gemma-4-26b-a4b-uncensored');
  assert.equal(gemma.effort,undefined);assert.equal(gemma.maxTokens,original.maxTokens);assert.equal(gemma.temperature,original.temperature);assert.ok(Object.isFrozen(gemma));
 }
 assert.equal(privateWorkflowProfile('plan','qwen/qwen3.8-27b').effort,'low');
});
test('Gemma planning reaches the metered port without an unsupported reasoning parameter',async()=>{
 let reserved=false,dispatched=false;
 const tx={$queryRaw:async()=>[],researchRun:{findUnique:async()=>({userId:'owner',metadata:{privacyMode:'confidential'}})},
  privateInferenceCall:{findFirst:async()=>null,count:async()=>0,aggregate:async()=>({_sum:{committedMicroUsd:739311}}),create:async()=>{reserved=true}},
  privateAiBudgetReservation:{aggregate:async()=>({_sum:{committedMicroUsd:0}})}};
 const ai=createPrivateWorkflowAi({db:{$transaction:async fn=>fn(tx)},model:'phala/gemma-4-26b-a4b-uncensored',monthlyCapMicroUsd:770000,inputPricePerMillion:150000,outputPricePerMillion:700000,
  aiPort:{privateVerifiedTransport:'phala-aci-v1',infer:async request=>{dispatched=true;assert.equal(reserved,true);assert.equal(request.reasoningEffort,undefined);assert.equal(request.maxTokens,8192);assert.equal(request.json,true);throw Error('SYNTHETIC_STOP')}}});
 await assert.rejects(ai({run:{id:'fixture',userId:'owner'},actionId:'fixture-plan',stage:'plan',json:true,messages:[{role:'user',content:'synthetic'}]}),{message:'SYNTHETIC_STOP'});
 assert.equal(dispatched,true);
});
