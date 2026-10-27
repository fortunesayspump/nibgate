import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
const require=createRequire(new URL('../frontend/package.json',import.meta.url)),ts=require('typescript');
// These legacy funding/recovery fixtures are authenticated account runs, not guest planning.
const accountGuestBoundary='const isGuestRun=async()=>false;\n';
const recoveryHelpers=(await readFile(new URL('../frontend/src/lib/dr-nib-private-checkpoint-recovery.ts',import.meta.url),'utf8')).replace(/^export /gm,'');
const updateHelpers=(await readFile(new URL('../frontend/src/lib/dr-nib-private-action-updates.ts',import.meta.url),'utf8')).replace(/^export /gm,'');
test('approval returns before inference, preserves background work and surfaces failure without replay',async()=>{
 let state={id:'11111111-1111-4111-8111-111111111111',status:'planned'},resolveAction,rejectAction,calls=0;
 const previousFetch=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({ledger:{deposited:0.25},job:{status:'Funded'}})});
 globalThis.__drNibApprovalTest={createEncryptedProject:()=>{},getPrivateManifest:async()=>({value:state}),privateRecordRequest:()=>{},privateFundingEnabled:()=>true,requirePrivateInputs:async()=>{},configuredPrivateVerification:()=>({}),privateAction:()=>{calls++;return new Promise((resolve,reject)=>{resolveAction=resolve;rejectAction=reject})},privateDiscussionShape:v=>v,privateFundingShape:v=>v};
 try{
  let source=await readFile(new URL('../frontend/src/lib/dr-nib-private-client.ts',import.meta.url),'utf8');
  source=source.replace(/^import .*;\r?\n/gm,'');
  source=accountGuestBoundary+updateHelpers+recoveryHelpers+'\nconst {createEncryptedProject,getPrivateManifest,privateRecordRequest,privateFundingEnabled,requirePrivateInputs,configuredPrivateVerification,privateAction,privateDiscussionShape,privateFundingShape}=globalThis.__drNibApprovalTest;\n'+source;
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
  const {privateClientRequest:request}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
  const path='/v1/runs/'+state.id;
  assert.equal((await request(path+'/approve',{method:'POST'})).status,'running');
  assert.equal((await request(path)).status,'running');
  await assert.rejects(request(path+'/approve',{method:'POST'}),/already running/);assert.equal(calls,1);
  rejectAction(Error('Verified action failed'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await request(path)).metadata.privateActionError,'Verified action failed');assert.equal(calls,1);
  await request(path+'/approve',{method:'POST'});state={...state,status:'complete'};resolveAction(state);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await request(path)).status,'complete');assert.equal(calls,2);
 }finally{globalThis.fetch=previousFetch;delete globalThis.__drNibApprovalTest;}
});

test('pause queues independently and expired-worker recovery cannot be overwritten by a stale background failure',async()=>{
 const previousFetch=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>({ledger:{deposited:0.25},job:{status:'Funded'}})});
 let state={id:'11111111-1111-4111-8111-111111111111',status:'paused'},active={state:'idle'};const calls=[],pending=[];
 const mocks={createEncryptedProject:()=>{},getPrivateManifest:async()=>({value:state}),privateRecordRequest:async()=>active,privateFundingEnabled:()=>true,requirePrivateInputs:async()=>{},queuePrivateControl:async(_id,command)=>({queued:true,command}),configuredPrivateVerification:()=>({}),privateAction:(_id,action,args)=>{calls.push({action,args});return new Promise((resolve,reject)=>pending.push({resolve,reject}))},privateDiscussionShape:v=>v,privateFundingShape:v=>v};
 globalThis.__drNibRecoveryFlow=mocks;
 try{
  let source=await readFile(new URL('../frontend/src/lib/dr-nib-private-client.ts',import.meta.url),'utf8');source=source.replace(/^import .*;\r?\n/gm,'');
  source=accountGuestBoundary+updateHelpers+recoveryHelpers+'\nconst {'+Object.keys(mocks).join(',')+'}=globalThis.__drNibRecoveryFlow;\n'+source;
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
  const {privateClientRequest:request}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64')),path='/v1/runs/'+state.id;
  assert.equal((await request(path+'/resume',{method:'POST'})).status,'running');assert.equal((await request(path)).status,'running');
  assert.equal((await request(path+'/pause',{method:'POST'})).queued,true);assert.equal(calls.length,1);
  active={state:'processing',requestId:'22222222-2222-4222-8222-222222222222',recoveryAvailable:true};
  await request(path+'/resume',{method:'POST'});assert.equal(calls[1].action,'recover');assert.deepEqual(calls[1].args,{requestId:active.requestId});
  pending[0].reject(Error('stale worker failure'));await new Promise(resolve=>setImmediate(resolve));
  const current=await request(path);assert.equal(current.status,'running');assert.equal(current.metadata.privateActionError,null);
  state={...state,status:'complete'};pending[1].resolve(state);await new Promise(resolve=>setImmediate(resolve));assert.equal((await request(path)).status,'complete');
 }finally{globalThis.fetch=previousFetch;delete globalThis.__drNibRecoveryFlow;}
});

test('only the exact setup-approved free public query continues without another owner prompt',async()=>{
 const previousFetch=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>({ledger:{deposited:.25},job:{status:'Funded'}})});
 const id='11111111-1111-4111-8111-111111111111',question={id:'a'.repeat(64),externalRequest:{tool:'web_search',query:'approved public query',preferCreators:true,maxMicroUsd:0}};
 let state={id,status:'planned',brief:{liveWeb:true,tipCreators:true,publicResearch:{approved:true,brief:'approved public query'}}};const calls=[],tools=[];
 const mocks={createEncryptedProject:()=>{},getPrivateManifest:async()=>({value:state}),privateRecordRequest:async()=>({}),privateFundingEnabled:()=>true,requirePrivateInputs:async()=>{},configuredPrivateVerification:()=>({}),privateDiscussionShape:v=>v,privateFundingShape:v=>v,approvePrivateExternalTool:async(runId,q)=>{tools.push(q.externalRequest);assert.equal(runId,id);return {toolCallId:'synthetic',toolResult:{sources:[]}}},privateAction:async(_id,action,args)=>{calls.push({action,args});state=action==='execute'?{...state,status:'awaiting',pendingQuestion:question}:{...state,status:'complete'};return state}};
 globalThis.__drNibPublicContinuation=mocks;
 try{
  let source=await readFile(new URL('../frontend/src/lib/dr-nib-private-client.ts',import.meta.url),'utf8');source=source.replace(/^import .*;\r?\n/gm,'');source=accountGuestBoundary+updateHelpers+recoveryHelpers+'\nconst {'+Object.keys(mocks).join(',')+'}=globalThis.__drNibPublicContinuation;\n'+source;
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
  const {privateClientRequest:request,isPreapprovedPublicResearch:allowed}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
  const waiting={...state,status:'awaiting',pendingQuestion:question};assert.equal(allowed(waiting),true);
  for(const patch of [{query:'different public query'},{maxMicroUsd:1},{tool:'tip_creator'},{body:{private:'not approved'}},{preferCreators:false}])assert.equal(allowed({...waiting,pendingQuestion:{...question,externalRequest:{...question.externalRequest,...patch}}}),false);
  assert.equal(allowed({...waiting,brief:{...waiting.brief,liveWeb:false}}),false);
  await request(`/v1/runs/${id}/approve`,{method:'POST'});await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls.map(c=>c.action),['execute','answer']);assert.equal(tools.length,1);assert.equal(calls[1].args.questionId,question.id);assert.equal(calls[1].args.optionId,'approve');assert.equal((await request(`/v1/runs/${id}`)).status,'complete');
 }finally{globalThis.fetch=previousFetch;delete globalThis.__drNibPublicContinuation;}
});

test('opening saved uncertain work stays read-only; explicit resume admits bounded automatic recovery',async()=>{
 const oldFetch=globalThis.fetch,oldWindow=globalThis.window,oldStorage=globalThis.localStorage,rows=new Map();
 globalThis.window={};globalThis.localStorage={getItem:k=>rows.get(k),setItem:(k,v)=>rows.set(k,v)};
 let payments=0;globalThis.fetch=async(_url,options)=>{if(options.method==='POST')payments++;return {ok:true,json:async()=>({ledger:{deposited:0.25},job:{status:'Funded'}})}};
 const id='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222',state={id,status:'paused',pauseReason:'uncertain',metadata:{privateUncertainRequestId:requestId,privateRecoveryRequestId:requestId,privateActionError:'Saved work needs checking.'}},calls=[];
 const mocks={createEncryptedProject:()=>{},getPrivateManifest:async()=>({value:state}),privateRecordRequest:async()=>({actions:true}),privateFundingEnabled:()=>true,requirePrivateInputs:async()=>{},configuredPrivateVerification:()=>({}),privateAction:async(_id,action,args)=>{calls.push({action,args});throw Error('Journal has an unresolved operation; no replay.')},privateDiscussionShape:v=>v,privateFundingShape:v=>v};globalThis.__drNibAutoRecovery=mocks;
 try{
  let source=await readFile(new URL('../frontend/src/lib/dr-nib-private-client.ts',import.meta.url),'utf8');source=source.replace(/^import .*;\r?\n/gm,'');source=accountGuestBoundary+updateHelpers+recoveryHelpers+'\nconst {'+Object.keys(mocks).join(',')+'}=globalThis.__drNibAutoRecovery;\n'+source;
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText,{privateClientRequest:request}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
  await request('/v1/runs/'+id);await new Promise(resolve=>setImmediate(resolve));
  await request('/v1/runs/'+id);assert.deepEqual(calls,[]);assert.equal(payments,0);
  // The owner explicitly resumes. A transient failure can then receive one
  // bounded journal recovery; subsequent reads cannot start a replacement.
  await request('/v1/runs/'+id+'/resume',{method:'POST'});await new Promise(resolve=>setImmediate(resolve));
  await request('/v1/runs/'+id);await new Promise(resolve=>setImmediate(resolve));
  const after=await request('/v1/runs/'+id);await request('/v1/runs/'+id);
  assert.deepEqual(calls,[{action:'resume',args:{}},{action:'recover',args:{requestId}}]);assert.equal(after.status,'paused');assert.match(after.metadata.privateActionError,/unresolved/);assert.equal(payments,0);
 }finally{globalThis.fetch=oldFetch;globalThis.window=oldWindow;globalThis.localStorage=oldStorage;delete globalThis.__drNibAutoRecovery;}
});

test('opening a saved public question never starts tools or worker recovery',async()=>{
 const oldFetch=globalThis.fetch;let tools=0,actions=0;
 globalThis.fetch=async()=>({ok:true,json:async()=>({ledger:{deposited:.25},job:{status:'Funded'}})});
 const id='11111111-1111-4111-8111-111111111111',state={id,status:'awaiting',metadata:{},brief:{liveWeb:true,tipCreators:true,publicResearch:{approved:true,brief:'approved public query'}},pendingQuestion:{id:'a'.repeat(64),externalRequest:{tool:'web_search',query:'approved public query',preferCreators:true,maxMicroUsd:0}}};
 const mocks={createEncryptedProject:()=>{},getPrivateManifest:async()=>({value:state}),privateRecordRequest:async()=>({actions:true}),privateFundingEnabled:()=>true,requirePrivateInputs:async()=>{},configuredPrivateVerification:()=>({}),privateDiscussionShape:v=>v,privateFundingShape:v=>v,approvePrivateExternalTool:async()=>{tools++;throw Error('Must not dispatch a duplicate public request')},privateAction:async()=>{actions++;throw Error('Must not start replacement research')}};globalThis.__drNibActivePublicQuestion=mocks;
 try{
  let source=await readFile(new URL('../frontend/src/lib/dr-nib-private-client.ts',import.meta.url),'utf8');source=source.replace(/^import .*;\r?\n/gm,'');source=accountGuestBoundary+updateHelpers+recoveryHelpers+'\nconst {'+Object.keys(mocks).join(',')+'}=globalThis.__drNibActivePublicQuestion;\n'+source;
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText,{privateClientRequest:request}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
  await request('/v1/runs/'+id);await new Promise(resolve=>setImmediate(resolve));await request('/v1/runs/'+id);assert.equal(tools,0);assert.equal(actions,0);
 }finally{globalThis.fetch=oldFetch;delete globalThis.__drNibActivePublicQuestion;}
});
