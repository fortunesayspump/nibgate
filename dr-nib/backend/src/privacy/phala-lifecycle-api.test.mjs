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
