// Browser coordination regression: a failed background action must wake the
// run view even when its authenticated manifest has not changed.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
const ts=createRequire(new URL('../frontend/package.json',import.meta.url))('typescript');
async function load(file,prefix=''){
 const source=(await readFile(new URL('../frontend/src/lib/'+file,import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
 return import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(prefix+source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
}
test('background failure refreshes a stable saved run and preserves manual recovery without replay',async()=>{
 const updates=await load('dr-nib-private-action-updates.ts'),originalFetch=globalThis.fetch;
 const id='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222';
 const state={id,status:'paused',metadata:{privateRecoveryRequestId:requestId,privateUncertainRequestId:requestId,privateActionError:'Old failure'}};
 let rejectWork,calls=0,notified=0;const requests=[];
 const mocks={...updates,isGuestRun:async()=>false,privateFundingEnabled:()=>true,privateFundingShape:x=>x,privateDiscussionShape:()=>null,canCheckPrivateRecovery:()=>false,admitAutomaticPrivateRecovery:()=>false,requirePrivateInputs:async()=>{},getPrivateManifest:async()=>({value:state}),privateRecordRequest:async()=>({state:'uncertain',requestId,recoveryAvailable:true}),privateAction:()=>{calls++;return new Promise((_,reject)=>{rejectWork=reject})}};
 globalThis.__drNibUpdateMocks=mocks;
 globalThis.fetch=async path=>{requests.push(path);return {ok:true,json:async()=>({job:{status:'Funded'}})}};
 const unsubscribe=updates.subscribePrivateActionUpdates(runId=>{if(runId===id)notified++});
 try{
  const client=await load('dr-nib-private-client.ts','const {'+Object.keys(mocks).join(',')+'}=globalThis.__drNibUpdateMocks;\n');
  await client.privateClientRequest('/v1/runs/'+id+'/resume',{method:'POST'});
  const working=await client.privateSnapshotRun(state);
  assert.equal(working.metadata.privateActionPending,true);assert.equal(working.metadata.privateActionError,null);
  rejectWork(Error('Saved model result is unresolved.'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(notified,1);
  const paused=await client.privateSnapshotRun(state);
  assert.equal(paused.status,'paused');assert.equal(paused.metadata.privateActionPending,undefined);
  assert.equal(paused.metadata.privateActionError,'Saved model result is unresolved.');
  assert.equal(paused.metadata.privateRecoveryRequestId,requestId);assert.equal(calls,1);
  assert.ok(requests.every(path=>!path.endsWith('/complete')&&!path.endsWith('/cancel')));
  unsubscribe();updates.notifyPrivateActionUpdate(id);assert.equal(notified,1);
 }finally{unsubscribe();globalThis.fetch=originalFetch;delete globalThis.__drNibUpdateMocks;}
});
