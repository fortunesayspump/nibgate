import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPhalaLifecycleApi} from './phala-lifecycle-api.js';

test('official SDK port starts stopped CVM and waits for confirmed running state',async()=>{
  let state='stopped';const calls=[];
  const api=createPhalaLifecycleApi({cvmId:'cvm-1',client:{
    getCvmState:async arg=>{calls.push(['state',arg]);return {status:state}},
    startCvm:async arg=>{calls.push(['start',arg]);state='starting'},
    shutdownCvm:async()=>assert.fail('must not stop'),stopCvm:async()=>assert.fail('must not force stop'),
    watchCvmState:async arg=>{calls.push(['watch',arg]);state='running';return {status:'running'}}
  }});
  assert.equal(await api.ensureRunning(),true);
  assert.equal(calls.filter(([name])=>name==='start').length,1);
  assert.deepEqual(calls.find(([name])=>name==='start')[1],{id:'cvm-1'});
  assert.equal(calls.find(([name])=>name==='watch')[1].target,'running');
  await api.ensureRunning();
  assert.equal(calls.filter(([name])=>name==='start').length,1);
});
test('graceful shutdown waits for provider-confirmed stopped state',async()=>{
  let state='running';let shutdowns=0;
  const api=createPhalaLifecycleApi({cvmId:'id',client:{
    getCvmState:async()=>({status:state}),startCvm:async()=>{},
    shutdownCvm:async()=>{shutdowns++;state='stopping'},stopCvm:async()=>assert.fail('must not force stop'),
    watchCvmState:async({target})=>{assert.equal(target,'stopped');state='stopped';return {status:'stopped'}}
  }});
  await api.gracefulShutdown();await api.gracefulShutdown();assert.equal(shutdowns,1);
});
test('unknown provider state or stale SSE confirmation fails closed',async()=>{
  const client={getCvmState:async()=>({status:'mystery'}),startCvm:async()=>{},shutdownCvm:async()=>{},stopCvm:async()=>{},watchCvmState:async()=>({status:'running'})};
  const api=createPhalaLifecycleApi({cvmId:'id',client});
  await assert.rejects(api.ensureRunning(),/PHALA_CVM_STATE_UNKNOWN/);
  client.getCvmState=async()=>({status:'starting'});
  await assert.rejects(api.ensureRunning(),/PHALA_CVM_TARGET_NOT_REACHED/);
});
test('emergency stop uses documented force-stop method and confirms stopped',async()=>{
  let state='running',calls=0;
  const api=createPhalaLifecycleApi({cvmId:'id',client:{
    getCvmState:async()=>({status:state}),startCvm:async()=>{},
    shutdownCvm:async()=>assert.fail('must not graceful stop'),
    stopCvm:async({id})=>{assert.equal(id,'id');calls++;state='stopping'},
    watchCvmState:async({target})=>{assert.equal(target,'stopped');state='stopped';return {status:'stopped'}}
  }});
  assert.equal(await api.forceStop(),true);assert.equal(calls,1);
});
test('installed official SDK lifecycle client includes the separately bound watch helper without network',async()=>{
 const{createOfficialPhalaLifecycleClient}=await import('./phala-lifecycle-api.js');
 const client=await createOfficialPhalaLifecycleClient({apiKey:'phak_synthetic_fixture_only'});
 for(const name of ['getCvmState','startCvm','shutdownCvm','stopCvm','watchCvmState'])assert.equal(typeof client[name],'function');
});
test('SDK transport adapter accepts nullable unused progress while requiring a valid state and safe path',async()=>{
 const{adaptOfficialPhalaLifecycleClient}=await import('./phala-lifecycle-api.js');const paths=[];
 const c=adaptOfficialPhalaLifecycleClient({get:async p=>{paths.push(p);return {status:'stopped',shutdown_progress:null}},post:async p=>{paths.push(p)}});
 assert.deepEqual(await c.getCvmState({id:'fixture'}),{status:'stopped'});await c.startCvm({id:'fixture'});assert.deepEqual(paths,['/cvms/fixture/state','/cvms/fixture/start']);await assert.rejects(c.getCvmState({id:'../escape'}));
});
test('known 409 during previous stop drains before start retry; unknown start transport is never replayed',async()=>{
 let starts=0,status='stopped';const client={getCvmState:async()=>({status}),startCvm:async()=>{starts++;if(starts===1)throw Object.assign(Error('operation busy'),{status:409});status='starting'},shutdownCvm:async()=>{},stopCvm:async()=>{},watchCvmState:async()=>{status='running';return {status}}};
 const api=createPhalaLifecycleApi({client,cvmId:'fixture',pause:async()=>{}});await api.ensureRunning();assert.equal(starts,2);
 starts=0;status='stopped';client.startCvm=async()=>{starts++;throw Error('socket lost')};await assert.rejects(api.ensureRunning());assert.equal(starts,1);
});

for(const observed of ['starting','running'])test(`lost start response reconciles confirmed ${observed} without another start`,async()=>{
 let status='stopped',starts=0,watches=0;const client={getCvmState:async()=>({status}),startCvm:async()=>{starts++;status=observed;throw Object.assign(Error('response lost'),{status:503});},shutdownCvm:async()=>assert.fail('no shutdown'),stopCvm:async()=>assert.fail('no stop'),watchCvmState:async()=>{watches++;status='running';return{status}}};
 const api=createPhalaLifecycleApi({client,cvmId:'fixture'});assert.equal(await api.ensureRunning(),true);assert.equal(starts,1);assert.equal(watches,observed==='starting'?1:0);
});
test('positive authorization rejection never becomes an accepted start',async()=>{
 let reads=0,starts=0;const client={getCvmState:async()=>{reads++;return{status:'stopped'}},startCvm:async()=>{starts++;throw Object.assign(Error('denied'),{status:403})},shutdownCvm:async()=>{},stopCvm:async()=>{},watchCvmState:async()=>assert.fail('no watch')};
 await assert.rejects(createPhalaLifecycleApi({client,cvmId:'fixture'}).ensureRunning(),/denied/);assert.equal(reads,1);assert.equal(starts,1);
});
