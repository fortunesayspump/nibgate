import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{createRequire}from'node:module';
const require=createRequire(new URL('../frontend/package.json',import.meta.url)),ts=require('typescript');
const source=await readFile(new URL('../frontend/src/lib/dr-nib-private-read.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const{privateRecordFetch}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('a transient read reconnects to the same saved receipt with original credentials and no mutation',async()=>{
 let calls=0;const waits=[],options={credentials:'include',cache:'no-store'};
 const response=await privateRecordFetch('/runs/synthetic/actions/saved',options,async(url,opts)=>{assert.equal(url,'/runs/synthetic/actions/saved');assert.equal(opts,options);calls++;return calls===1?Response.json({code:'account_unavailable'},{status:503}):Response.json({state:'complete'});},async n=>waits.push(n));
 assert.deepEqual(await response.json(),{state:'complete'});assert.equal(calls,2);assert.deepEqual(waits,[300]);
});
test('writes, authentication failures, conflicts, provider rate limits and generic storage errors do not retry',async()=>{
 for(const [method,status] of [['POST',503],['PUT',502],['DELETE',504],['GET',401],['GET',409],['GET',429],['GET',503]]){
  let calls=0;const response=await privateRecordFetch('/synthetic',{method},async()=>{calls++;return Response.json({code:'storage_unavailable'},{status});},()=>assert.fail('No delay expected'));
  assert.equal(response.status,status);assert.equal(calls,1);
 }
});
test('read transport retries are bounded, caller aborts stop immediately, and write response loss never replays',async()=>{
 let calls=0;await assert.rejects(privateRecordFetch('/synthetic',{},async()=>{calls++;throw Error('network')},async()=>{}));assert.equal(calls,3);
 for(const opts of [{method:'POST'},{signal:AbortSignal.abort()}]){calls=0;await assert.rejects(privateRecordFetch('/synthetic',opts,async()=>{calls++;throw Error('network')},()=>assert.fail('No retry')));assert.equal(calls,1);}
});
