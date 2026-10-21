import{beforeAll,expect,it}from'vitest';import{readFileSync,writeFileSync}from'node:fs';import{randomUUID}from'node:crypto';import{fork}from'node:child_process';
import{db}from'../src/db.js';import{createPrivateLifecycleStore}from'../src/privacy/private-lifecycle-store.js';import{createDurablePhalaWake}from'../src/privacy/phala-durable-wake.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
beforeAll(async()=>{
 const u=new URL(process.env.DRNIB_DATABASE_URL);if(u.hostname!=='127.0.0.1'||u.searchParams.get('schema')!=='drnib_test')throw Error('Local fixture required');
 await db.$executeRawUnsafe('DROP TABLE IF EXISTS "PrivateWorkerLifecycle"');
 await db.$executeRawUnsafe(readFileSync(new URL('../prisma/migrations/0016_private_worker_lifecycle/migration.sql',import.meta.url),'utf8'));
});
function fixture(options={}){let status='stopped',starts=0,stops=0;const id=randomUUID(),tenantId=randomUUID(),store=createPrivateLifecycleStore({db,cvmId:id,tenantId});
 const api={state:async()=>status,ensureRunning:async()=>{starts++;await sleep(10);status='running'},gracefulShutdown:async()=>{stops++;status='stopped'},forceStop:async()=>{stops++;status='stopped'}};
 const make=()=>createDurablePhalaWake({store,api,guestReady:async()=>true,verifyAttestation:async()=>true,idleMs:0,maxRuntimeMs:60000,startupMs:500,operationMs:1000,leaseMs:5000,pollMs:5,tickMs:1000,maxPending:256,...options});
 return{id,tenantId,store,api,make,counts:()=>({starts,stops}),running:()=>{status='running'}};
}
it('isolated concurrent load: 128 dispatches across eight PostgreSQL-backed brokers, one start and stop',async()=>{
 const f=fixture({startupMs:5000,operationMs:10000,leaseMs:30000}),brokers=Array.from({length:8},()=>f.make());const begun=performance.now(),latencies=[];let dispatched=0;
 await Promise.all(Array.from({length:128},(_,i)=>{const t=performance.now();return brokers[i%8].run('fixture-'+i,async()=>{dispatched++;await sleep(i%3);}).then(()=>latencies.push(performance.now()-t));}));
 expect(dispatched).toBe(128);expect(f.counts().starts).toBe(1);await Promise.all(brokers.map(c=>c.tick()));expect(f.counts()).toEqual({starts:1,stops:1});
 const s=await brokers[0].snapshot();expect(s.phase).toBe('stopped');expect(s.holds).toBe(0);expect(JSON.stringify(s)).not.toMatch(/fixture-[0-9]+/);
 latencies.sort((a,b)=>a-b);const result={test:'isolated-local-postgres-lifecycle',requests:128,controllers:8,elapsedMs:Math.round(performance.now()-begun),p50Ms:Math.round(latencies[63]),p95Ms:Math.round(latencies[121]),provider:'synthetic',modelCalls:0,paymentCalls:0,...f.counts()};writeFileSync('/tmp/drnib-lifecycle-local-stress.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
});
it('guest background lease blocks idle stop even with no broker HTTP request',async()=>{
 const f=fixture(),c=f.make();await c.run('one',async()=>{});const r=await db.researchRun.create({data:{userId:f.tenantId,brief:{encrypted:true}}});
 const a=await db.privateActionReceipt.create({data:{runId:r.id,requestId:randomUUID(),digest:'fixture',status:'processing',leaseOwner:randomUUID(),leaseUntil:new Date(Date.now()+60000)}});
 expect(await c.tick()).toBe(false);expect(f.counts().stops).toBe(0);await db.privateActionReceipt.update({where:{id:a.id},data:{status:'complete',leaseUntil:null}});expect(await c.tick()).toBe(true);
});
it('SIGKILL of a dispatching controller releases no live payment or work; watchdog stops after lease expiry',async()=>{
 const f=fixture({leaseMs:150,maxPending:64});f.running();
 const child=fork(new URL('./fixtures/private-lifecycle-crash-child.mjs',import.meta.url),[],{env:{...process.env,FIXTURE_CVM:f.id,FIXTURE_TENANT:f.tenantId},stdio:['ignore','ignore','pipe','ipc']});
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Fixture child did not dispatch')),10000);child.on('message',m=>{if(m.event==='dispatch'){clearTimeout(timer);resolve();}});child.on('exit',code=>{clearTimeout(timer);reject(Error('Fixture child exited '+code));});});
 expect((await f.make().snapshot()).holds).toBe(1);child.kill('SIGKILL');await new Promise(resolve=>child.once('exit',resolve));await sleep(220);
 expect(await f.make().tick()).toBe(true);expect(f.counts()).toEqual({starts:0,stops:1});const snap=await f.make().snapshot();expect(snap.phase).toBe('stopped');expect(snap.holds).toBe(0);
 }finally{child.kill('SIGKILL');}
});
it('expired controller intent is quarantined and reconciled; runtime is retained across replicas',async()=>{
 const f=fixture(),c=f.make();await c.run('one',async()=>{});const before=await c.snapshot();
 await db.$executeRaw`UPDATE "PrivateWorkerLifecycle" SET "state"=jsonb_set(jsonb_set("state",'{phase}','"starting"'::jsonb),'{operation}','{"token":"dead-controller","until":1}'::jsonb) WHERE "id"=${f.id}`;
 expect(await f.make().tick()).toBe(true);const after=await f.make().snapshot();expect(after.phase).toBe('stopped');expect(after.usedMs).toBeGreaterThanOrEqual(before.usedMs);expect(f.counts()).toEqual({starts:1,stops:1});
});
it('same CVM cannot silently change its tenant or runtime policy',async()=>{
 const f=fixture();await f.make().status();const outsider=createPrivateLifecycleStore({db,cvmId:f.id,tenantId:randomUUID()});await expect(outsider.mutate({},()=>true)).rejects.toThrow('TENANT_MISMATCH');
 const altered=createDurablePhalaWake({store:f.store,api:f.api,guestReady:async()=>true,verifyAttestation:async()=>true,idleMs:1,maxRuntimeMs:60000,startupMs:500,operationMs:1000,leaseMs:5000,pollMs:5,tickMs:1000,maxPending:256});await expect(altered.status()).rejects.toThrow('POLICY_MISMATCH');expect(f.counts().starts).toBe(0);
});
it('public watchdog preserves another user active work and refuses silent scope changes',async()=>{
 const id=randomUUID(),tenantId='operator',store=createPrivateLifecycleStore({db,cvmId:id,tenantId,accessMode:'authenticated'});
 let status='stopped',stops=0;
 const c=createDurablePhalaWake({store,api:{state:async()=>status,ensureRunning:async()=>{status='running'},gracefulShutdown:async()=>{stops++;status='stopped'},forceStop:async()=>{stops++;status='stopped'}},guestReady:async()=>true,verifyAttestation:async()=>true,idleMs:0,maxRuntimeMs:60000,startupMs:500,operationMs:1000,leaseMs:5000,pollMs:5});
 await c.run('public-work',async()=>{});
 const r=await db.researchRun.create({data:{userId:'another-user',brief:{encrypted:true},metadata:{privacyMode:'confidential'}}});
 const a=await db.privateActionReceipt.create({data:{runId:r.id,requestId:randomUUID(),digest:'fixture',status:'processing',leaseOwner:randomUUID(),leaseUntil:new Date(Date.now()+60000)}});
 try{
  expect(await c.tick()).toBe(false);expect(stops).toBe(0);
  const ownerOnly=createPrivateLifecycleStore({db,cvmId:id,tenantId});
  await expect(ownerOnly.mutate({},()=>true)).rejects.toThrow('TENANT_MISMATCH');
  await db.privateActionReceipt.update({where:{id:a.id},data:{status:'complete',leaseUntil:null}});
  expect(await c.tick()).toBe(true);expect(stops).toBe(1);
 }finally{await db.privateActionReceipt.delete({where:{id:a.id}});await db.researchRun.delete({where:{id:r.id}});}
});
it('bounded sustained lifecycle soak with repeated admissions and idle checks',async()=>{
 const duration=Number(process.env.DRNIB_LIFECYCLE_SOAK_MS??'5000');expect(duration).toBeGreaterThanOrEqual(1000);expect(duration).toBeLessThanOrEqual(120000);
 const f=fixture({maxRuntimeMs:300000,startupMs:5000,operationMs:10000,leaseMs:15000}),controllers=Array.from({length:8},()=>f.make());const deadline=Date.now()+duration;let completed=0;
 await Promise.all(controllers.map((c,i)=>(async()=>{while(Date.now()<deadline){await c.run('soak-'+i,async()=>{await sleep(20);completed++;});}})()));
 await Promise.all(controllers.map(c=>c.tick()));expect(f.counts()).toEqual({starts:1,stops:1});expect(completed).toBeGreaterThan(100);expect((await controllers[0].snapshot()).holds).toBe(0);
 const proof={durationMs:duration,controllers:8,completed,provider:'synthetic',modelCalls:0,paymentCalls:0,...f.counts()};writeFileSync('/tmp/drnib-lifecycle-soak.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
});
