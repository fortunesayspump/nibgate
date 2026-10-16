import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPhalaWakeController} from './phala-wake-controller.js';

const noTimer={schedule:()=>({}),cancel:()=>{}};
function fixture(overrides={}){
  let state='stopped',starts=0,stops=0,time=0,attests=0;
  const api={state:async()=>state,ensureRunning:async()=>{starts++;state='running'},
    gracefulShutdown:async()=>{stops++;state='stopped'},
    forceStop:async()=>{stops++;state='stopped'}};
  const make=(options={})=>createPhalaWakeController({api,guestReady:async()=>true,
    verifyAttestation:async()=>{attests++;return true},idleMs:10,maxRuntimeMs:100,
    now:()=>time,...noTimer,...overrides,...options});
  return {api,make,setState:value=>{state=value},setTime:value=>{time=value},
    counts:()=>({starts,stops,attests})};
}
test('parallel requests share startup and require fresh attestation before dispatch',async()=>{
  const f=fixture();let release;const gate=new Promise(resolve=>{release=resolve});
  f.api.ensureRunning=async()=>{await gate;f.setState('running')};
  const c=f.make();let calls=0;
  const a=c.run('one',async()=>++calls),b=c.run('two',async()=>++calls);
  await Promise.resolve();assert.equal(c.snapshot().active,0);
  release();assert.deepEqual(await Promise.all([a,b]),[1,2]);
  assert.equal(f.counts().attests,2);
  assert.equal(c.snapshot().generation,1);
  assert.equal(c.peekReady(),true);
});
test('ensureReady never substitutes for independent attestation',async()=>{
  const f=fixture({verifyAttestation:async()=>false});const c=f.make();
  assert.equal(await c.ensureReady(),true);
  assert.equal(c.peekReady(),true);
  await assert.rejects(c.run('private',async()=>assert.fail('private dispatch')),/PHALA_ATTESTATION_UNAVAILABLE/);
});
test('duplicate simultaneous opaque IDs share one dispatch lease',async()=>{
  const f=fixture();const c=f.make();let release,calls=0;
  const gate=new Promise(resolve=>{release=resolve});
  const a=c.run('same',async()=>{calls++;return gate});
  const b=c.run('same',async()=>{calls++;return gate});
  await new Promise(resolve=>setImmediate(resolve));release('ok');
  assert.deepEqual(await Promise.all([a,b]),['ok','ok']);assert.equal(calls,1);
});
test('idle shutdown drains active work, then automatically qualifies for tick',async()=>{
  const f=fixture();const c=f.make();let release;
  const gate=new Promise(resolve=>{release=resolve});
  const job=c.run('one',async()=>gate);
  await new Promise(resolve=>setImmediate(resolve));
  f.setTime(30);assert.equal(await c.tick(),false);assert.equal(f.counts().stops,0);
  release('done');assert.equal(await job,'done');
  f.setTime(40);assert.equal(await c.tick(),true);assert.equal(f.counts().stops,1);
});
test('attestation failure quarantines and never dispatches ciphertext',async()=>{
  const f=fixture({verifyAttestation:async()=>false});const c=f.make();let calls=0;
  await assert.rejects(c.run('one',async()=>{calls++}),/PHALA_ATTESTATION_UNAVAILABLE/);
  assert.equal(calls,0);assert.equal(c.snapshot().blocked,true);
  await assert.rejects(c.run('two',async()=>{calls++}),/PHALA_WAKE_QUARANTINED/);
});
test('runtime deadline aborts a stuck active callback and confirms provider stop',async()=>{
  const f=fixture();const c=f.make({maxRuntimeMs:5,idleMs:0});let release;
  let signal;const gate=new Promise(resolve=>{release=resolve});
  const job=c.run('long',async(_,s)=>{signal=s;return gate});
  await new Promise(resolve=>setImmediate(resolve));
  f.setTime(8);assert.equal(c.snapshot().deadlineReached,true);
  assert.equal(await c.tick(),true);assert.equal(f.counts().stops,1);
  assert.equal(signal.aborted,true);
  await assert.rejects(c.run('new',async()=>{}),/PHALA_WAKE_QUARANTINED/);
  release('unsafe-success');await assert.rejects(job,/PHALA_CVM_UNAVAILABLE/);
});
test('scheduled runtime deadline fires while an active callback is stuck',async()=>{
  const f=fixture();let next=0;const callbacks=new Map();
  const c=f.make({maxRuntimeMs:5,idleMs:50,
    schedule:(fn)=>{const id=++next;callbacks.set(id,fn);return id},
    cancel:id=>callbacks.delete(id)});
  let release,signal;const gate=new Promise(resolve=>{release=resolve});
  const job=c.run('stuck',async(_,s)=>{signal=s;return gate});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(c.snapshot().active,1);assert.equal(callbacks.size,1);
  f.setTime(5);const deadline=[...callbacks.values()][0];deadline();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(signal.aborted,true);assert.equal(f.counts().stops,1);
  release('late');await assert.rejects(job,/PHALA_CVM_UNAVAILABLE/);
});
test('deadline force-stop preempts a hanging idle graceful shutdown',async()=>{
  const f=fixture();let finishGraceful;
  f.api.gracefulShutdown=async()=>new Promise(resolve=>{finishGraceful=resolve});
  const c=f.make({maxRuntimeMs:20,idleMs:5});
  await c.run('short',async()=>true);
  f.setTime(5);const idleStop=c.tick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(typeof finishGraceful,'function');assert.equal(f.counts().stops,0);
  f.setTime(20);assert.equal(await c.tick(),true);
  assert.equal(f.counts().stops,1);assert.equal(await f.api.state(),'stopped');
  finishGraceful();assert.equal(await idleStop,true);
});
test('second request on an already-ready CVM retains the deadline timer',async()=>{
  const f=fixture();let next=0;const callbacks=new Map();
  const c=f.make({maxRuntimeMs:5,idleMs:50,
    schedule:fn=>{const id=++next;callbacks.set(id,fn);return id},
    cancel:id=>callbacks.delete(id)});
  await c.run('first',async()=>true);
  let release,signal;const gate=new Promise(resolve=>{release=resolve});
  const second=c.run('second',async(_,s)=>{signal=s;return gate});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(c.snapshot().active,1);assert.equal(callbacks.size,1);
  f.setTime(5);[...callbacks.values()][0]();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(signal.aborted,true);assert.equal(f.counts().stops,1);
  release('late');await assert.rejects(second,/PHALA_CVM_UNAVAILABLE/);
});
test('external stopped state is reconciled with new boot and attestation',async()=>{
  const f=fixture();const c=f.make();await c.ensureReady();
  f.setState('stopped');let seenGeneration;
  await c.run('one',async()=>{seenGeneration=c.snapshot().generation});
  assert.equal(seenGeneration,2);assert.equal(f.counts().starts,2);
  assert.equal(f.counts().attests,1);
});
test('unknown stop state quarantines until provider stopped state is confirmed',async()=>{
  const f=fixture();const c=f.make();await c.run('one',async()=>true);
  f.api.gracefulShutdown=async()=>{throw new Error('uncertain network')};
  f.setTime(10);await assert.rejects(c.tick(),/PHALA_STOP_STATE_UNKNOWN/);
  assert.equal(c.snapshot().blocked,true);
  await assert.rejects(c.run('next',async()=>true),/PHALA_WAKE_QUARANTINED/);
  f.api.gracefulShutdown=async()=>{f.setState('stopped')};
  assert.equal(await c.recoverUnknownStop(),true);
  assert.equal(c.snapshot().blocked,false);
});
test('unknown provider state after readiness fails closed before dispatch',async()=>{
  const f=fixture();const c=f.make();await c.ensureReady();
  f.setState('mystery');let calls=0;
  await assert.rejects(c.run('one',async()=>{calls++}),/PHALA_CVM_STATE_UNKNOWN/);
  assert.equal(calls,0);assert.equal(c.snapshot().blocked,true);
});
test('failed fresh attestation immediately stops provider with a stuck active sibling',async()=>{
  const f=fixture({verifyAttestation:async({jobId})=>jobId!=='bad'});const c=f.make({idleMs:0});
  let release,signal;
  const gate=new Promise(resolve=>{release=resolve});
  const first=c.run('first',async(_,s)=>{signal=s;return gate});
  await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(c.run('bad',async()=>assert.fail('must not dispatch')),/PHALA_ATTESTATION_UNAVAILABLE/);
  assert.equal(signal.aborted,true);assert.equal(f.counts().stops,1);
  release('unsafe-success');await assert.rejects(first,/PHALA_CVM_UNAVAILABLE/);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(f.counts().stops,1);
});
test('close force-stops provider despite a callback ignoring abort',async()=>{
  const f=fixture();const c=f.make();let release,signal;
  const gate=new Promise(resolve=>{release=resolve});
  const job=c.run('stuck',async(_,s)=>{signal=s;return gate});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(await c.close(),true);
  assert.equal(signal.aborted,true);assert.equal(f.counts().stops,1);
  await assert.rejects(c.run('new',async()=>true),/PHALA_WAKE_QUARANTINED/);
  release('unsafe-success');await assert.rejects(job,/PHALA_CVM_UNAVAILABLE/);
});
test('real timer requests idle shutdown without an external tick loop',async()=>{
  const f=fixture();const c=f.make({idleMs:5,now:Date.now,schedule:(fn,ms)=>setTimeout(fn,ms),cancel:clearTimeout});
  await c.run('short',async()=>true);
  await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(f.counts().stops,1);assert.equal(c.peekReady(),false);
});
