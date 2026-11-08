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

test('intake prompt gives valid JSON and distinguishes opening from finished follow-up',async()=>{
 const {intakeBatchMessages}=await import('../llm/prompts.js');
 const opening=intakeBatchMessages({topic:'Synthetic bakery',answered:[],count:3})[1].content;
 assert.match(opening,/Return at least one concrete choice question/);
 assert.match(opening,/Never use null, omit questions/);
 assert.ok(!opening.includes('"pick_one" | "pick_any"'));
 const sample=opening.split('Return JSON with exactly this shape:')[1].split('\nThe example')[0].trim();
 const q=JSON.parse(sample).questions[0];assert.ok(q.prompt.length>=12);assert.equal(q.options.length,2);
 const followup=intakeBatchMessages({topic:'Synthetic bakery',answered:[{prompt:'Purpose?',answer:'Reduce bills'}]})[1].content;
 assert.match(followup,/return exactly \{"questions":\[\]\}/);
 assert.match(followup,/JEV separately decides/);
});
