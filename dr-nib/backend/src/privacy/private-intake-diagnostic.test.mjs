import test from 'node:test';import assert from 'node:assert/strict';
import {privateIntakeDiagnostic} from './private-intake-diagnostic.js';
import {PRIVATE_USAGE} from './phala-ai-port.js';
import {createPrivateGeneration} from './private-generation.js';
import {generateIntakeBatch} from '../llm/generate.js';
const secret='SYNTHETIC_PRIVATE_TEXT_NEVER_COPY';
function response(content){return {choices:[{message:{content},finish_reason:'stop'}]};}
test('structure-only diagnostic distinguishes missing list, empty list and invalid choices',()=>{
 assert.equal(privateIntakeDiagnostic(response('{}')).questions,-1);
 assert.equal(privateIntakeDiagnostic(response('{"questions":[]}')).questions,0);
 const r=privateIntakeDiagnostic(response(JSON.stringify({questions:[{type:'free',prompt:secret,options:[]}], [secret]:secret})));
 assert.equal(r.questions,1);assert.equal(r.choiceQuestions,0);assert.equal(r.usableOptions,0);assert.ok(!JSON.stringify(r).includes(secret));
});
test('receipt-verified and hosted routing remain distinct; unknown routing is not verified',()=>{
 const r=response('{}');assert.equal(privateIntakeDiagnostic(r).route,'unknown');
 Object.defineProperty(r,PRIVATE_USAGE,{value:{model:'phala/gemma-4-26b-a4b-uncensored',receiptId:'synthetic',responseDigest:'a'.repeat(64)}});
 assert.equal(privateIntakeDiagnostic(r).route,'receipt-verified');
 const h=response('{}');Object.defineProperty(h,PRIVATE_USAGE,{value:{model:'openai/gpt-4o-mini',privacy:'hosted-provider-visible'}});
 assert.equal(privateIntakeDiagnostic(h).route,'hosted');
});
test('both completed attempts are diagnosed without copying response text or issuing extra calls',async()=>{
 let calls=0;const seen=[];
 const generate=createPrivateGeneration({infer:async()=>{calls++;return response(JSON.stringify({questions:[],note:secret}));},run:{},actionId:'synthetic',onIntakeDiagnostic:d=>seen.push(d)});
 const r=await generate('intake',()=>generateIntakeBatch({topic:secret,count:3,allowEmpty:true}));
 assert.equal(r.source,'fallback');assert.equal(calls,2);assert.equal(seen.length,2);assert.ok(seen.every(d=>d.questions===0));assert.ok(!JSON.stringify(seen).includes(secret));
});
