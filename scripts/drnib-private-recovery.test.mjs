import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{createRequire}from'node:module';
const ts=createRequire(new URL('../frontend/package.json',import.meta.url))('typescript'),source=await readFile(new URL('../frontend/src/lib/dr-nib-private-checkpoint-recovery.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const{canCheckPrivateRecovery,admitAutomaticPrivateRecovery,privateRecoveryRoot}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('automatic journal checks require the original funded escrow and admit once across reloads',()=>{
 const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',rows=new Map(),storage={getItem:k=>rows.get(k),setItem:(k,v)=>rows.set(k,v)};
 const state={metadata:{privateRecoveryRequestId:id}},funding={job:{status:'Funded'}};
 assert.equal(canCheckPrivateRecovery(state,funding),true);assert.equal(canCheckPrivateRecovery(state,{job:{status:'Complete'}}),false);assert.equal(canCheckPrivateRecovery(state,{...funding,cancelled:true}),false);assert.equal(canCheckPrivateRecovery({},funding),false);
 assert.equal(admitAutomaticPrivateRecovery(storage,id,id),true);assert.equal(admitAutomaticPrivateRecovery({...storage},id,id),false);assert.equal(admitAutomaticPrivateRecovery(storage,id,other),true);
 assert.equal(admitAutomaticPrivateRecovery({getItem:()=>{throw Error('storage blocked')},setItem:()=>{}},id,id),false);
});

test('setup diagnostics select the authenticated active journal before a manifest checkpoint pointer exists',()=>{
 const root='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 assert.equal(privateRecoveryRoot({}, {state:'uncertain',requestId:root}),root);
 assert.equal(privateRecoveryRoot({}, {state:'processing',requestId:root}),root);
 assert.equal(privateRecoveryRoot({privateCheckpoint:{rootRequestId:other}}, {state:'uncertain',requestId:root}),other);
 assert.equal(privateRecoveryRoot({}, {state:'complete',requestId:root}),null);
 assert.equal(privateRecoveryRoot({}, {state:'uncertain',requestId:'invalid'}),null);
});
