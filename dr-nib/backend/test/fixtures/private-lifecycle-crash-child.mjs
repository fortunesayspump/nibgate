// Disposable local PostgreSQL only. No actual cloud/model/payment ports.
const u=new URL(process.env.DRNIB_DATABASE_URL);if(u.hostname!=='127.0.0.1'||u.searchParams.get('schema')!=='drnib_test')throw Error('Local fixture required');
const {db}=await import('../../src/db.js');
const{createPrivateLifecycleStore}=await import('../../src/privacy/private-lifecycle-store.js');
const{createDurablePhalaWake}=await import('../../src/privacy/phala-durable-wake.js');
const c=createDurablePhalaWake({store:createPrivateLifecycleStore({db,cvmId:process.env.FIXTURE_CVM,tenantId:process.env.FIXTURE_TENANT}),api:{state:async()=> 'running',ensureRunning:async()=>process.send({event:'started'}),gracefulShutdown:async()=>{},forceStop:async()=>{}},guestReady:async()=>true,verifyAttestation:async()=>true,idleMs:0,maxRuntimeMs:60000,startupMs:500,operationMs:1000,leaseMs:150,pollMs:5,tickMs:1000});
await c.run('crash-fixture',async()=>{process.send({event:'dispatch'});await new Promise(()=>{});});
