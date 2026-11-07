import test from 'node:test';
import assert from 'node:assert/strict';
import {generateIntakeBatch} from '../llm/generate.js';
import {createPrivateGeneration} from './private-generation.js';
const valid={questions:[{key:'audience',type:'pick_one',prompt:'Who will use this comparison?',options:[{id:'a',label:'Shop owner'},{id:'b',label:'Investors'}],allowOther:true}]};
function fixture(outputs){let calls=0;const generate=createPrivateGeneration({infer:async()=>{const value=outputs[calls++];if(value instanceof Error)throw value;return {choices:[{message:{content:JSON.stringify(value)},finish_reason:'stop'}]};},run:{},actionId:'synthetic'});return {run:args=>generate('intake',()=>generateIntakeBatch({topic:'Synthetic bakery solar comparison',allowEmpty:true,...args})),calls:()=>calls};}
for(const bad of [{questions:[]},{questions:[{type:'free',prompt:'Tell me more'}]},{items:[]}])test('repairs a completed unusable initial question response',async()=>{const f=fixture([bad,valid]);const r=await f.run();assert.equal(r.source,'llm');assert.equal(r.questions[0].prompt,valid.questions[0].prompt);assert.equal(f.calls(),2);});
test('valid questions require one call',async()=>{const f=fixture([valid]);assert.equal((await f.run()).questions.length,1);assert.equal(f.calls(),1);});
test('follow-up can finish without another question',async()=>{const f=fixture([{questions:[]}]);assert.deepEqual((await f.run({answered:[{prompt:'Purpose?',answer:'Buying solar'}]})).questions,[]);assert.equal(f.calls(),1);});
test('persistent bad shape retains old fallback after one repair',async()=>{const f=fixture([{questions:[]},{questions:[]}]);const r=await f.run();assert.equal(r.source,'fallback');assert.equal(r.llmError,'model returned no usable questions');assert.equal(f.calls(),2);});
test('unknown transport failure cannot trigger another model call',async()=>{const f=fixture([Error('private synthetic input must not leak')]);await assert.rejects(f.run(),e=>!e.message.includes('synthetic input'));assert.equal(f.calls(),1);});
