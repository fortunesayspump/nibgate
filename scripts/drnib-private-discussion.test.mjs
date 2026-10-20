import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{createRequire}from'node:module';const require=createRequire(new URL('../frontend/package.json',import.meta.url)),ts=require('typescript');const source=await readFile(new URL('../frontend/src/lib/dr-nib-private-discussion.ts',import.meta.url),'utf8');const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;const {privateDiscussionShape}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('private discussion rehydrates encrypted message pairs and retains subsequent allowance',()=>{
 const shape=privateDiscussionShape([{role:'user',content:'private question'},{role:'assistant',content:'private answer'}]);assert.deepEqual(shape,{max:50,used:1,remaining:49,log:[{q:'private question',a:'private answer'}]});
 assert.equal(privateDiscussionShape(undefined).remaining,50);
 assert.equal(privateDiscussionShape(Array(100).fill({})).remaining,0);
 assert.equal(privateDiscussionShape([{role:'user',content:'interrupted'}]).remaining,49);
 assert.deepEqual(privateDiscussionShape([{role:'assistant',content:'unpaired'},{role:'user',content:'unpaired'}]).log,[]);
});
test('discussion costs survive reload and invalid cost metadata is not displayed as a price',()=>{
 const answer={role:'assistant',content:'private answer',model:'qwen/reviewed',usage:{costUsd:0.000037,billingKind:'platform'}};
 const shape=privateDiscussionShape([{role:'user',content:'private question'},answer]);assert.deepEqual(shape.log[0].usage,answer.usage);assert.equal(shape.log[0].model,'qwen/reviewed');
 assert.equal(privateDiscussionShape([{role:'user',content:'q'},{...answer,usage:{costUsd:-1,billingKind:'platform'}}]).log[0].usage,undefined);
});
