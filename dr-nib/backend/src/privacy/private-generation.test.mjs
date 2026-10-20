import test from 'node:test';import assert from 'node:assert/strict';
import {chat,isLlmConfigured,withPrivateLlmPort} from '../llm/provider.js';
import {generatePlan,generateReportLong} from '../llm/generate.js';
import {createPrivateGeneration} from './private-generation.js';
test('private generation intercepts the ordinary provider even with an ordinary fetch override',async()=>{
    let privateCalls=0,ordinaryCalls=0;
    const result=await withPrivateLlmPort({privateVerifiedTransport:'phala-aci-v1',chat:async()=>{privateCalls++;return {text:'protected'}}},async()=>{
        assert.equal(isLlmConfigured(),true);return chat({messages:[{role:'user',content:'synthetic'}],fetchImpl:async()=>{ordinaryCalls++;throw Error('ordinary fetch forbidden')}});
    });
    assert.equal(result.text,'protected');assert.equal(privateCalls,1);assert.equal(ordinaryCalls,0);
    await assert.rejects(withPrivateLlmPort({chat:async()=>{}},async()=>{}));
});
test('shared generator output limits reach the protected admission port',async()=>{
 let request;
 const generate=createPrivateGeneration({infer:async input=>{request=input;return {choices:[{message:{content:'Synthetic evidence.'},finish_reason:'stop'}]}},run:{},actionId:'synthetic'});
 await generate('write',()=>chat({messages:[{role:'user',content:'synthetic'}],maxTokens:800}));
 assert.equal(request.maxTokens,800);
});
test('a detached callback retains an expired private scope and cannot fall through to ordinary inference',async()=>{
    let calls=0;let finish;const done=new Promise(resolve=>{finish=resolve});let failure;
    await withPrivateLlmPort({privateVerifiedTransport:'phala-aci-v1',chat:async()=>{calls++}},()=>{
        setTimeout(async()=>{try{await chat({messages:[{role:'user',content:'synthetic'}]})}catch(error){failure=error.message}finally{finish()}},10);
    });
    await done;assert.equal(failure,'Private generation scope expired');assert.equal(calls,0);
});
test('existing generation retries cannot repeat an unknown paid call or expose its exception',async()=>{
    let calls=0;const generate=createPrivateGeneration({infer:async()=>{calls++;throw Error('SYNTHETIC_PRIVATE_PROVIDER_CANARY')},run:{},actionId:'synthetic'});
    await assert.rejects(generate('plan',()=>generatePlan({brief:{topic:'synthetic'}})),error=>!error.message.includes('CANARY'));
    assert.equal(calls,1);
});
test('the existing parallel report path serializes receipt-bound calls within an action',async()=>{
    let active=0,maxActive=0;const generate=createPrivateGeneration({infer:async()=>{active++;maxActive=Math.max(active,maxActive);await new Promise(resolve=>setTimeout(resolve,5));active--;return {choices:[{message:{content:'Synthetic evidence.'},finish_reason:'stop'}]}},run:{},actionId:'synthetic'});
    const result=await generate('write',()=>Promise.all([chat({messages:[]}),chat({messages:[]}),chat({messages:[]})]));
    assert.equal(result.length,3);assert.equal(maxActive,1);
});
test('strict report assembly preserves the sanitized original AI failure and cannot redispatch it',async()=>{
    let calls=0;
    const generate=createPrivateGeneration({infer:async()=>{calls++;throw Object.assign(Error('SYNTHETIC_PRIVATE_PROVIDER_CANARY'),{code:'PHALA_PRIVATE_AI_UNAVAILABLE'})},run:{},actionId:'synthetic'});
    await assert.rejects(generate('write',()=>generateReportLong({brief:{topic:'Synthetic study',length:'custom',lengthWords:500},sections:['Synthetic observations'],getEvidence:async()=>[{excerpt:'Synthetic evidence.',citationIndex:1}],requireGeneratedSections:true})),{message:'PHALA_PRIVATE_AI_UNAVAILABLE'});
    assert.equal(calls,1);
});
