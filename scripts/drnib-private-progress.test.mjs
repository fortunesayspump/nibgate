import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{createRequire}from'node:module';
const ts=createRequire(new URL('../frontend/package.json',import.meta.url))('typescript'),source=await readFile(new URL('../frontend/src/lib/dr-nib-private-progress.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const{mergePrivateProgressRows}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('replayed progress retains existing cards once and preserves additional repeated work',()=>{
 const row=(id,text)=>({id,at:id,type:'thinking',phase:'agent',text}),saved=[row('base','Base'),row('start','Sources'),row('a','JEV'),row('b','JEV'),row('pause','Paused')],incoming=[row('rs','Sources'),row('ra','JEV'),row('rb','JEV'),row('new','JEV'),row('result','28')];
 const out=mergePrivateProgressRows(saved,incoming,true);assert.equal(out.length,7);assert.equal(out[1],saved[1]);assert.deepEqual(out.slice(-2),incoming.slice(-2));assert.equal(saved.length,5);
});
test('decision replay ignores presentation and omitted question fields but retains different decisions',()=>{
 const saved=[{id:'old',createdAt:'old',kind:'decision',question:{state:'private'},output:{choice:'execute'}}],replay={id:'new',createdAt:'new',kind:'decision',output:{choice:'execute'}};
 assert.deepEqual(mergePrivateProgressRows(saved,[replay],true,true),saved);assert.equal(mergePrivateProgressRows(saved,[{...replay,output:{choice:'skip'}}],true,true).length,2);assert.equal(mergePrivateProgressRows(saved,[replay],false,true).length,2);
});
