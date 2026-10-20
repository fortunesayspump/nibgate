import{test}from'node:test';import assert from'node:assert/strict';
import{createDurablePhalaWake}from'./phala-durable-wake.js';
function fixture(){let t=1000,state,busy=false,tail=Promise.resolve(),status='stopped';const calls=[];
 const store={mutate(initial,fn){const p=tail.then(()=>{state??=structuredClone(initial);return fn(state,t,busy)});tail=p.catch(()=>{});return p;}};
 const api={state:async()=>status,ensureRunning:async()=>{calls.push('start');status='running'},gracefulShutdown:async()=>{calls.push('shutdown');status='stopped'},forceStop:async()=>{calls.push('force');status='stopped'}};
 const make=overrides=>createDurablePhalaWake({store,api,guestReady:async()=>true,verifyAttestation:async()=>true,idleMs:10,maxRuntimeMs:10000,startupMs:100,operationMs:200,leaseMs:1000,pollMs:1,tickMs:1,now:()=>t,...overrides});
 return{store,api,calls,make,advance:n=>{t+=n},busy:v=>{busy=v},get:()=>state};}
test('128 concurrent requests across eight controllers share one start and idle shutdown',async()=>{
 const f=fixture(),c=Array.from({length:8},()=>f.make({maxPending:256}));let dispatched=0;
 await Promise.all(Array.from({length:128},(_,i)=>c[i%8].run('job'+i,async()=>{dispatched++;return i})));assert.equal(dispatched,128);assert.deepEqual(f.calls,['start']);
 f.advance(11);await Promise.all(c.map(x=>x.tick()));assert.deepEqual(f.calls,['start','shutdown']);assert.equal((await c[0].snapshot()).phase,'stopped');
});
test('background action lease prevents shutdown after the HTTP lease ends',async()=>{
 const f=fixture(),c=f.make();await c.run('request',async()=>true);f.busy(true);f.advance(100);assert.equal(await c.tick(),false);f.busy(false);f.advance(11);assert.equal(await c.tick(),true);
});
test('controller restart preserves running-time budget and idle deadline',async()=>{
 const f=fixture();await f.make().run('one',async()=>true);f.advance(101);const c=f.make();await c.tick();assert.equal((await c.snapshot()).usedMs,101);await c.run('two',async()=>true);assert.deepEqual(f.calls,['start','shutdown','start']);
});
test('unknown stop is quarantined; no new assignment before bounded reconciliation',async()=>{
 const f=fixture(),c=f.make();await c.run('one',async()=>{});const force=f.api.forceStop;f.api.gracefulShutdown=async()=>{throw Error('network partition')};f.api.forceStop=async()=>{throw Error('stop state unknown')};f.advance(11);await assert.rejects(c.tick());await assert.rejects(c.run('two',async()=>assert.fail('dispatch')));assert.equal((await c.status()).phase,'quarantined');f.advance(201);f.api.forceStop=force;await c.tick();assert.equal((await c.status()).phase,'stopped');assert.deepEqual(f.calls,['start','force']);
});
test('attestation failure delivers no job and quarantines the guest',async()=>{
 const f=fixture(),c=f.make({verifyAttestation:async()=>false});await assert.rejects(c.run('one',async()=>assert.fail('dispatch')));await c.tick();assert.deepEqual(f.calls,['start','force']);
});
test('expired start intent from a dead controller is stopped without redispatch',async()=>{
 const f=fixture(),c=f.make();await c.run('one',async()=>{});f.get().phase='starting';f.get().operation={token:'dead-owner',until:1200};f.advance(201);await f.make().tick();assert.equal((await c.status()).phase,'stopped');assert.deepEqual(f.calls,['start','force']);
});
test('capacity and policy changes fail closed without extra provider calls',async()=>{
 const f=fixture();await f.make().status();await assert.rejects(f.make({idleMs:20}).status(),/POLICY_MISMATCH/);assert.deepEqual(f.calls,[]);
});
test('status polling never wakes compute or refreshes the idle deadline',async()=>{
 const f=fixture(),c=f.make();for(let i=0;i<10;i++)await c.status();assert.deepEqual(f.calls,[]);await c.run('one',async()=>{});f.advance(11);for(let i=0;i<10;i++)await c.status();assert.equal(await c.tick(),true);
});
test('runtime exhaustion aborts active dispatch and survives controller restart',async()=>{
 const f=fixture(),c=f.make();let release,enter;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
 const p=c.run('active',async(_id,signal)=>{enter();await gate;assert.equal(signal.aborted,true);});await entered;f.advance(10001);await c.tick();release();await assert.rejects(p,/FENCED/);await assert.rejects(f.make().run('new',async()=>assert.fail('dispatch')),/BUDGET_EXHAUSTED/);assert.deepEqual(f.calls,['start','force']);
});
test('bounded capacity rejects excess work without additional start or dispatch',async()=>{
 const f=fixture(),c=f.make({maxPending:1});let release,enter;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
 const p=c.run('active',async()=>{enter();await gate});await entered;await assert.rejects(c.run('excess',async()=>assert.fail('dispatch')),/CAPACITY/);release();await p;assert.deepEqual(f.calls,['start']);
});
test('new request during draining cannot race a stop into a restart',async()=>{
 const f=fixture(),c=f.make();await c.run('one',async()=>{});f.advance(11);let release,enter;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r),original=f.api.gracefulShutdown;f.api.gracefulShutdown=async()=>{enter();await gate;await original()};const stop=c.tick();await entered;await assert.rejects(c.run('two',async()=>assert.fail('dispatch')),/STOPPING/);release();await stop;assert.deepEqual(f.calls,['start','shutdown']);
});
test('watchdog reconciles an out-of-band late start even when durable state says stopped',async()=>{
 const f=fixture(),c=f.make();await c.status();await f.api.ensureRunning();assert.equal(await c.tick(),true);assert.deepEqual(f.calls,['start','force']);assert.equal((await c.status()).phase,'stopped');
});
test('execution slots bound concurrent dispatch independently of queued request capacity',async()=>{
 const f=fixture(),c=f.make({maxActive:2,maxPending:32});let active=0,peak=0;
 await Promise.all(Array.from({length:20},(_,i)=>c.run('slot-'+i,async()=>{peak=Math.max(peak,++active);await new Promise(r=>setTimeout(r,2));active--;})));assert.equal(peak,2);assert.deepEqual(f.calls,['start']);
});
test('failed graceful shutdown force-stops only after draining and confirms stopped',async()=>{
 const f=fixture(),c=f.make();await c.run('one',async()=>{});f.api.gracefulShutdown=async()=>{throw Error('guest shutdown failed')};f.advance(11);assert.equal(await c.tick(),true);assert.equal((await c.status()).phase,'stopped');assert.deepEqual(f.calls,['start','force']);
});
test('insufficient remaining startup-operation allowance rejects before any paid VM start',async()=>{
 const f=fixture(),c=f.make({maxRuntimeMs:150});await assert.rejects(c.run('too-small',async()=>assert.fail('dispatch')),/BUDGET_EXHAUSTED/);assert.deepEqual(f.calls,[]);
});
