import test from 'node:test';import assert from 'node:assert/strict';
import {createOpenRouterZdrPort,OPENROUTER_ZDR_MODEL as model} from './openrouter-zdr-port.js';
import {PRIVATE_USAGE} from './phala-ai-port.js';
const data=()=>({id:'gen-synthetic-123',model,provider:'Azure',choices:[{message:{content:'{}'}}],usage:{prompt_tokens:10,completion_tokens:2,cost:0.000001}});
test('hosted fallback enforces fixed endpoint, provider, ZDR, no implicit fallback and separate privacy provenance',async()=>{
 const port=createOpenRouterZdrPort({apiKey:'synthetic-only',reviewExpiresAtMs:Date.now()+60000,fetchImpl:async(url,options)=>{
  assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(options.redirect,'error');
  const body=JSON.parse(options.body);assert.deepEqual(body.provider,{only:['Azure'],allow_fallbacks:false,require_parameters:true,zdr:true,data_collection:'deny'});assert.equal(body.max_completion_tokens,20);assert.equal(body.reasoning,undefined);assert.equal(body.reasoning_effort,undefined);return Response.json(data());
 }});
 const r=await port.infer({model,messages:[{role:'user',content:'synthetic'}],json:true,maxTokens:20});assert.equal(r[PRIVATE_USAGE].privacy,'hosted-provider-visible');assert.equal(r[PRIVATE_USAGE].costMicroUsd,1);
});
test('expired reviews, wrong model/provider and unpriced usage cannot become a successful fallback',async()=>{
 for(const patch of [{provider:'Other'},{model:'other'},{usage:{prompt_tokens:1,completion_tokens:1}}]){
  const p=createOpenRouterZdrPort({apiKey:'synthetic',reviewExpiresAtMs:Date.now()+60000,fetchImpl:async()=>Response.json({...data(),...patch})});
  await assert.rejects(p.infer({model,messages:[],maxTokens:20}));
 }
 const p=createOpenRouterZdrPort({apiKey:'synthetic',reviewExpiresAtMs:0,fetchImpl:()=>assert.fail('No dispatch')});await assert.rejects(p.infer({model}));
});
