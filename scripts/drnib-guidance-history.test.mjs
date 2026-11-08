import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
const ts=createRequire(new URL('../frontend/package.json',import.meta.url))('typescript');
const source=await readFile(new URL('../frontend/src/lib/dr-nib-guidance-history.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {privateGuidanceEvent,privateGuidanceConsumption,mergeGuidanceEvents}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const id='11111111-1111-4111-8111-111111111111',target='22222222-2222-4222-8222-222222222222';
const intent={format:'drnib-control-v1',command:'guidance',targetRequestId:target,text:'Use the corrected public source.\nPreserve the spending limit.',submittedAt:'2026-11-08T19:04:00Z'};
test('an acknowledged encrypted intent restores its exact user text and submission time without exposing other fields',()=>{
 const event=privateGuidanceEvent(id,{...intent,unrelatedSecret:'NEVER DISPLAY',toolResult:{text:'NEVER DISPLAY'}});
 assert.equal(event.guidance.text,intent.text);assert.equal(event.at,intent.submittedAt);assert.equal(event.delivery,'queued');assert.ok(!JSON.stringify(event).includes('NEVER DISPLAY'));
});
test('only a consumed control ID establishes worker receipt; saved messages do not imply a model already used them',()=>{
 const consumed=privateGuidanceConsumption({format:'drnib-checkpoint-v1',consumed:[id,42,'invalid'],entries:[{kind:'infer',result:'NEVER DISPLAY'}]});
 assert.deepEqual(consumed,[id]);assert.equal(privateGuidanceEvent(id,intent,consumed.includes(id)).delivery,'received');assert.equal(privateGuidanceEvent(target,intent,consumed.includes(target)).delivery,'queued');
});
test('a stale activity refresh cannot erase an acknowledged bubble or regress its received status',()=>{
 const queued=privateGuidanceEvent(id,intent),received=privateGuidanceEvent(id,intent,true),tool={id:'tool',type:'tool.call'};
 assert.deepEqual(mergeGuidanceEvents([tool],[queued]),[tool,queued]);
 const merged=mergeGuidanceEvents([received,tool],[queued]);assert.equal(merged.length,2);assert.equal(merged[0].delivery,'received');assert.equal(merged[1],tool);
});
test('separate steering messages with identical text remain distinct while repeat reads are deduplicated',()=>{
 const a=privateGuidanceEvent(id,intent),b=privateGuidanceEvent(target,intent);
 assert.equal(mergeGuidanceEvents([a],[a,b]).length,2);
});
test('legacy steering is visible without fabricating its original timestamp; invalid or non-guidance intents are excluded',()=>{
 const old=privateGuidanceEvent(id,{...intent,submittedAt:undefined});assert.equal(old.at,undefined);assert.equal(old.historyNoTimestamp,true);
 for(const value of [{...intent,command:'pause'},{...intent,text:''},{...intent,format:'other'},{...intent,targetRequestId:'invalid'},{...intent,text:'x'.repeat(8001)}])assert.equal(privateGuidanceEvent(id,value),null);
 assert.deepEqual(privateGuidanceConsumption({format:'other',consumed:[id]}),[]);
});
