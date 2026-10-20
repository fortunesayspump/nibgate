// Synthetic client transport contracts. These stubs exercise reconnect
// control flow, not attestation, hardware confidentiality or provider billing.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
const require=createRequire(new URL('../frontend/package.json',import.meta.url)),ts=require('typescript');
test('client recovery requires an expired lease, preserves the original request and never reissues unknown work',async()=>{
 const savedStorage=globalThis.localStorage,memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 const runId='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222';let state={state:'processing',requestId},opened=0,dispatched=0,released;
 const result={status:'complete'};
 const mocks={privateConnectionProgress:()=>{},configuredPrivateVerification:()=>({}),privateProjectSecrets:async()=>({tenantId:'fixture',vault:{vaultId:runId},secrets:{workerStateKey:new Uint8Array(32),reportKeySeed:new Uint8Array(32)}}),freshId:()=>runId,freshNonce:()=>new Uint8Array(32),bytesToHex:()=> 'fixture-hash',bytesToBase64:()=> 'fixture-key',base64ToBytes:()=>new Uint8Array(65),equalHex:()=>true,recipientId:async()=> 'fixture',proofDigest:async()=> 'fixture',verifyPrivateSession:async()=>{},openGuestSession:async()=>{opened++;return {sessionId:runId,clientNonce:'fixture-hash',recipientId:'fixture',recipientPublicKey:'fixture'}},proveGuestKey:async()=>({verified:true,sessionId:runId}),sealSource:async(_key,_context,plain)=>{if(plain.length>32)released=JSON.parse(new TextDecoder().decode(plain));return {}},openPrivateObject:async()=>new TextEncoder().encode(JSON.stringify(result)),privateRecordRequest:async(path,options)=>{if(options?.method==='POST'){dispatched++;return {state:'complete',requestId,envelope:{}};}return state;}};
 globalThis.__drNibCheckpointClient=mocks;
 try{
  let source=await readFile(new URL('../frontend/src/lib/dr-nib-private-actions.ts',import.meta.url),'utf8');source=source.replace(/^import .*;\r?\n/gm,'');
  source='const {'+Object.keys(mocks).join(',')+'}=globalThis.__drNibCheckpointClient;\n'+source;
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
  const {privateAction}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
  await assert.rejects(privateAction(runId,'recover',{requestId}),/original worker still owns/);assert.equal(opened,0);
  state={state:'uncertain',requestId};await assert.rejects(privateAction(runId,'recover',{requestId}),/uncertain outcome/);assert.equal(opened,0);
  memory.set('drnib-private-pending-v1:fixture:'+runId,JSON.stringify({requestId,fingerprint:'original-execute'}));
  state={state:'processing',requestId,recoveryAvailable:true};assert.deepEqual(await privateAction(runId,'recover',{requestId}),result);
  assert.equal(opened,1);assert.equal(dispatched,1);assert.equal(released.action,'recover');assert.equal(released.requestId,requestId);assert.equal(memory.size,0);
  state={state:'uncertain',requestId,recoveryAvailable:true};assert.deepEqual(await privateAction(runId,'recover',{requestId}),result);assert.equal(opened,2);assert.equal(dispatched,2);assert.equal(released.requestId,requestId);
  state={state:'complete',requestId,envelope:{}};assert.deepEqual(await privateAction(runId,'recover',{requestId}),result);assert.equal(opened,2);assert.equal(dispatched,2);
  state={state:'uncertain',requestId};memory.set('drnib-private-pending-v1:fixture:'+runId,JSON.stringify({requestId,fingerprint:'fixture-hash'}));
  assert.deepEqual(await privateAction(runId,'export',{format:'pdf'}),result);assert.equal(opened,3);assert.equal(dispatched,3);assert.equal(released.action,'export');assert.equal(released.requestId,requestId);
  memory.set('drnib-private-pending-v1:fixture:'+runId,JSON.stringify({requestId,fingerprint:'different-export'}));
  await assert.rejects(privateAction(runId,'export',{format:'json'}),/uncertain outcome/);assert.equal(opened,3);
  memory.set('drnib-private-pending-v1:fixture:'+runId,JSON.stringify({requestId,fingerprint:'fixture-hash'}));
  await assert.rejects(privateAction(runId,'execute'),/uncertain outcome/);assert.equal(opened,3);assert.equal(dispatched,3);
 }finally{globalThis.localStorage=savedStorage;delete globalThis.__drNibCheckpointClient;}
});
