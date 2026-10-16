import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createOnDemandController} from './on-demand.js';
test('parallel jobs share one CVM start, wait for readiness and attestation, then stop after idle',async()=>{
  let time=0,starts=0,stops=0,ready=false,attested=false,release;
  const gate=new Promise(r=>{release=r});
  const c=createOnDemandController({api:{ensureRunning:async()=>{starts++},waitReady:async()=>{await gate;ready=true;return true},gracefulShutdown:async()=>{stops++}},verifyAttestation:async()=>{attested=true;return true},dispatch:async(id)=>{assert.equal(ready,true);assert.equal(attested,true);return id},now:()=>time,idleMs:10,maxRuntimeMs:100});
  const a=c.submit('job1'),b=c.submit('job2');
  await Promise.resolve();assert.equal(starts,1);assert.equal(c.snapshot().active,0);
  release();assert.deepEqual(await Promise.all([a,b]),['job1','job2']);
  assert.equal(await c.tick(),false);time=10;assert.equal(await c.tick(),true);assert.equal(stops,1);
});
test('negative attestation prevents dispatch and budget ceiling prevents restart',async()=>{
  let dispatched=0,stops=0;
  const c=createOnDemandController({api:{ensureRunning:async()=>{},waitReady:async()=>true,gracefulShutdown:async()=>{stops++}},verifyAttestation:async()=>false,dispatch:async()=>{dispatched++},now:()=>0,idleMs:0,maxRuntimeMs:1});
  await assert.rejects(c.submit('job'),/attestation unavailable/);
  assert.equal(dispatched,0);assert.equal(stops,1);
});
test('same completed job is not dispatched twice in one controller lifetime',async()=>{
  let calls=0;
  const c=createOnDemandController({api:{ensureRunning:async()=>{},waitReady:async()=>true,gracefulShutdown:async()=>{}},verifyAttestation:async()=>true,dispatch:async()=>++calls,now:()=>0,idleMs:0,maxRuntimeMs:5});
  assert.equal(await c.submit('same'),1);assert.equal(await c.submit('same'),1);assert.equal(calls,1);
});
test('runtime budget caps a second start after graceful stop',async()=>{
  let time=0,starts=0;
  const c=createOnDemandController({api:{ensureRunning:async()=>{starts++},waitReady:async()=>true,gracefulShutdown:async()=>{}},verifyAttestation:async()=>true,dispatch:async()=>true,now:()=>time,idleMs:0,maxRuntimeMs:5});
  await c.submit('first');time=5;assert.equal(await c.tick(),true);
  await assert.rejects(c.submit('second'),/runtime budget exhausted/);
  assert.equal(starts,1);
});
test('failed graceful shutdown quarantines controller and prevents further dispatch',async()=>{
  let calls=0,time=0;
  const c=createOnDemandController({api:{ensureRunning:async()=>{},waitReady:async()=>true,gracefulShutdown:async()=>{throw new Error('network uncertainty')}},verifyAttestation:async()=>true,dispatch:async()=>++calls,now:()=>time,idleMs:0,maxRuntimeMs:100});
  await c.submit('one');time=1;
  await assert.rejects(c.tick(),/shutdown status unknown/);
  await assert.rejects(c.submit('two'),/shutdown status unknown/);
  assert.equal(calls,1);
});
test('active dispatch may overrun admission cap and is not falsely reported as hard billing control',async()=>{
  let release,time=0;
  const pending=new Promise(r=>{release=r});
  const c=createOnDemandController({api:{ensureRunning:async()=>{},waitReady:async()=>true,gracefulShutdown:async()=>{}},verifyAttestation:async()=>true,dispatch:async()=>pending,now:()=>time,idleMs:0,maxRuntimeMs:5});
  const job=c.submit('long');
  await new Promise(r=>setImmediate(r));
  assert.equal(c.snapshot().active,1);
  time=100;
  assert.equal(await c.tick(),false);
  assert.equal(c.snapshot().usedMs,100);
  release('done');assert.equal(await job,'done');
  assert.equal(await c.tick(),true);
});
test('pending attestation lease prevents idle shutdown and stale dispatch',async()=>{
  let time=0,release,dispatches=0,stops=0;
  const verification=new Promise(r=>{release=r});
  const c=createOnDemandController({api:{ensureRunning:async()=>{},waitReady:async()=>true,gracefulShutdown:async()=>{stops++}},verifyAttestation:async(id)=>id==='later'?verification:true,dispatch:async()=>++dispatches,now:()=>time,idleMs:0,maxRuntimeMs:100});
  await c.submit('first');
  const later=c.submit('later');await new Promise(r=>setImmediate(r));
  assert.equal(c.snapshot().pending,1);time=1;
  assert.equal(await c.tick(),false);assert.equal(stops,0);
  release(true);assert.equal(await later,2);
  assert.equal(await c.tick(),true);assert.equal(stops,1);
});
test('shared startup failure cleans up once for concurrent waiters',async()=>{
  let release,stops=0,starts=0;
  const ready=new Promise(r=>{release=r});
  const c=createOnDemandController({api:{ensureRunning:async()=>{starts++},waitReady:async()=>ready,gracefulShutdown:async()=>{stops++}},verifyAttestation:async()=>true,dispatch:async()=>{throw new Error('must not dispatch')},now:()=>0,idleMs:0,maxRuntimeMs:100});
  const a=c.submit('a'),b=c.submit('b');await new Promise(r=>setImmediate(r));release(false);
  const results=await Promise.allSettled([a,b]);
  assert.equal(results.every(x=>x.status==='rejected'),true);
  assert.equal(starts,1);assert.equal(stops,1);
});
test('failed concurrent verification quarantines a still-pending sibling',async()=>{
  let release,dispatches=0;
  const pending=new Promise(r=>{release=r});
  const c=createOnDemandController({api:{ensureRunning:async()=>{},waitReady:async()=>true,gracefulShutdown:async()=>{}},verifyAttestation:async(id)=>id==='bad'?false:pending,dispatch:async()=>{dispatches++},now:()=>0,idleMs:0,maxRuntimeMs:100});
  const sibling=c.submit('sibling');await new Promise(r=>setImmediate(r));
  await assert.rejects(c.submit('bad'),/attestation unavailable/);
  release(true);await assert.rejects(sibling,/CVM unavailable/);
  assert.equal(dispatches,0);
});
test('failed fresh attestation aborts active dispatch and cannot return success',async()=>{
  let release,signal,stops=0;
  const wait=new Promise(resolve=>{release=resolve});
  const c=createOnDemandController({api:{ensureRunning:async()=>{},waitReady:async()=>true,gracefulShutdown:async()=>{stops++}},
    verifyAttestation:async id=>id!=='bad',dispatch:async(id,s)=>{if(id==='active'){signal=s;return wait}throw new Error('must not dispatch')},
    now:()=>0,idleMs:0,maxRuntimeMs:100});
  const active=c.submit('active');await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(c.submit('bad'),/attestation unavailable/);
  assert.equal(signal.aborted,true);assert.equal(stops,1);
  release('incorrect-success');await assert.rejects(active,/CVM unavailable/);
});
test('verification time counts against admission ceiling before dispatch',async()=>{
  let release,time=0,calls=0;
  const wait=new Promise(resolve=>{release=resolve});
  const c=createOnDemandController({api:{ensureRunning:async()=>{},waitReady:async()=>true,gracefulShutdown:async()=>{}},
    verifyAttestation:async()=>wait,dispatch:async()=>{calls++},now:()=>time,idleMs:0,maxRuntimeMs:5});
  const job=c.submit('slow');await new Promise(resolve=>setImmediate(resolve));
  time=6;release(true);
  await assert.rejects(job,/runtime budget exhausted/);assert.equal(calls,0);
});
