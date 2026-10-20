import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{createRequire}from'node:module';
const ts=createRequire(new URL('../frontend/package.json',import.meta.url))('typescript'),source=(await readFile(new URL('../frontend/src/lib/dr-nib-private-external-tools.ts',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const{waitForPrivateToolSettlement}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('pending transfer reconciles automatically until durable delivery, without another approval',async()=>{
 let checks=0,waits=0;const pending={status:'reserved',settlementPending:true},complete={status:'complete',envelope:{encrypted:true}};
 assert.equal(await waitForPrivateToolSettlement(pending,async()=>++checks===3?complete:pending,async ms=>{assert.equal(ms,10000);waits++}),complete);assert.equal(checks,3);assert.equal(waits,3);
});
test('unknown outcomes are not retried and settlement checking is bounded',async()=>{
 for(const result of[{status:'reserved'},{status:'complete'},{status:'approved'},{status:'failed'}])assert.equal(await waitForPrivateToolSettlement(result,async()=>assert.fail('Must not dispatch or reconcile this result'),async()=>assert.fail('Must not wait')),result);
 let checks=0;const pending={status:'reserved',settlementPending:true};assert.equal(await waitForPrivateToolSettlement(pending,async()=>{checks++;return pending},async()=>{}),pending);assert.equal(checks,30);
});
