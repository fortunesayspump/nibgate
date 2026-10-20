import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostedJevPort} from './hosted-jev-port.js';
const policy={contextDisclosure:'openrouter-and-typesafe',decisionsZdrRoutingVerified:true};
test('diagnostic mode cannot send caller-provided content before native route verification',async()=>{
 const invoke=createHostedJevPort({db:{},apiKey:'synthetic',monthlyCapMicroUsd:1000,diagnosticOnly:true,policy:{contextDisclosure:'openrouter-and-typesafe'},fetchImpl:()=>assert.fail('no dispatch')});
 await assert.rejects(invoke({request:{state:'private document',questions:{a:{type:'noul',instructions:'Read this'}}}}),{message:'HOSTED_JEV_UNAVAILABLE'});
});
test('expired logging review prevents admission and dispatch',async()=>{
 const invoke=createHostedJevPort({db:{},apiKey:'synthetic',monthlyCapMicroUsd:1000,policy:{...policy,loggingReviewExpiresAtMs:1},fetchImpl:()=>assert.fail('no dispatch')});
 await assert.rejects(invoke({}),{message:'HOSTED_JEV_UNAVAILABLE'});
});
test('hosted JEV requires explicit provider-visible context and verified native ZDR routing',()=>{
 for(const p of [undefined,{}, {...policy,contextDisclosure:'attested'}, {...policy,decisionsZdrRoutingVerified:false}]){
  assert.throws(()=>createHostedJevPort({db:{},apiKey:'synthetic',monthlyCapMicroUsd:1000,policy:p}),{message:'HOSTED_JEV_UNAVAILABLE'});
 }
});
test('invalid requests cannot reserve budget or dispatch JEV',async()=>{
 const invoke=createHostedJevPort({db:{},apiKey:'synthetic',monthlyCapMicroUsd:1000,policy,fetchImpl:()=>assert.fail('no dispatch')});
 for(const request of [{state:'synthetic',questions:{}},{state:'x'.repeat(12001),questions:{a:{type:'noul',instructions:'Is it supported?'}}},{state:'synthetic',questions:{a:{type:'choice',instructions:'Choose',criteria:{one:'Only one'}}}},{state:'synthetic',questions:{a:{type:'noul',instructions:'Check',criteria:{secret:'context'}}}}]){
  await assert.rejects(invoke({run:{},actionId:'synthetic',request}),{message:'HOSTED_JEV_UNAVAILABLE'});
 }
});
