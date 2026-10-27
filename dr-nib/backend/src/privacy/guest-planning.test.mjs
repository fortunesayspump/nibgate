// Entirely synthetic database/crypto envelopes. No live accounts or inference.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import request from 'supertest';
process.env.HUB_DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:1/test';
process.env.DRNIB_DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:1/test';
const {createGuestPlanningService,createGuestPlanningRouter,guestPlanningSettings,guestNetworkIdentity}=await import('./guest-planning.js');
function fixture(){
 let clock=Date.now(),data={sessions:[],rates:[],runs:[],vaults:[],objects:[],receipts:[]},tail=Promise.resolve();
 const match=(row,where={})=>Object.entries(where).every(([k,v])=>k==='runId_objectId'?row.runId===v.runId&&row.objectId===v.objectId:k==='metadata'?row.metadata?.privacyMode===v.equals:v&&typeof v==='object'&&!(v instanceof Date)?v.lt?new Date(row[k])<v.lt:v.in?v.in.includes(row[k]):match(row[k],v):row[k]===v);
 const table=name=>({
  findUnique:async({where})=>structuredClone(data[name].find(r=>match(r,where))??null),
  findFirst:async({where})=>structuredClone(data[name].find(r=>match(r,where))??null),
  findMany:async({where,take})=>structuredClone(data[name].filter(r=>match(r,where)).slice(0,take)),
  count:async({where})=>data[name].filter(r=>match(r,where)).length,
  create:async({data:d})=>{const r={id:randomUUID(),revision:1,deletedAt:null,removed:false,requests:0,status:'active',createdAt:new Date(clock),...structuredClone(d)};data[name].push(r);return structuredClone(r);},
  update:async({where,data:d})=>{const r=data[name].find(r=>match(r,where));assert.ok(r);for(const [k,v] of Object.entries(d))r[k]=v?.increment!==undefined?r[k]+v.increment:structuredClone(v);return structuredClone(r);},
  updateMany:async({where,data:d})=>{const rows=data[name].filter(r=>match(r,where));for(const r of rows)Object.assign(r,structuredClone(d));return {count:rows.length};},
  deleteMany:async({where})=>{const n=data[name].length;data[name]=data[name].filter(r=>!match(r,where));return {count:n-data[name].length};},
  upsert:async({where,create,update})=>{const r=data[name].find(r=>match(r,where));if(r){r.count+=update.count.increment;return structuredClone(r);}data[name].push(structuredClone(create));return structuredClone(create);},
 });
 const store={guestPlanningSession:table('sessions'),guestPlanningRateWindow:table('rates'),researchRun:table('runs'),privateVaultRecord:table('vaults'),privateClientObject:table('objects'),privateActionReceipt:table('receipts'),$queryRaw:async()=>[]};
 store.$transaction=async work=>{const previous=tail;let done;tail=new Promise(r=>done=r);await previous;const saved=structuredClone(data);try{return await work(store);}catch(e){data=saved;throw e;}finally{done();}};
 const settings={...guestPlanningSettings({DRNIB_PRIVATE_RECORDS_ENABLED:'true',DRNIB_GUEST_PLANNING_ENABLED:'true',DRNIB_GUEST_WORKER_REVIEWED:'true'}),maxSessionsPerDay:4,maxSessionsPerIpHour:2};
 return {store,settings,service:createGuestPlanningService({store,settings,now:()=>clock}),get data(){return data;},advance:n=>clock+=n};
}
function envelope(g,kind,id,tenant=g.tenantId,vault=g.vaultId,run=g.runId){return {version:1,algorithm:'AES-256-GCM',iv:Buffer.alloc(12).toString('base64'),ciphertext:Buffer.alloc(kind==='project-keys'?80:kind==='vault-recovery'?48:40).toString('base64'),context:kind==='vault-recovery'?{tenantId:tenant,vaultId:vault,runId:null,revision:1,purpose:kind}:kind==='project-keys'?{tenantId:tenant,vaultId:vault,runId:run,revision:1,purpose:kind}:{tenantId:tenant,vaultId:vault,runId:run,objectId:id,revision:1,purpose:kind}};}
async function boot(f){const g=await f.service.issue('synthetic-ip'),manifestId=randomUUID(),b={manifestId,vaultRecoveryEnvelope:envelope(g,'vault-recovery'),projectKeysEnvelope:envelope(g,'project-keys'),manifestEnvelope:envelope(g,'manifest',manifestId)};await f.service.bootstrap(g.token,b);return {g,b};}
async function target(f,g,a){const vaultId=randomUUID();await f.store.privateVaultRecord.create({data:{userId:'account',vaultId,recoveryEnvelope:{}}});const id=a.targetRunId,manifestId=randomUUID();return {adoptionId:a.adoptionId,id,vaultId,expectedVaultRevision:1,manifestId,manifestEnvelope:envelope(g,'manifest',manifestId,'account',vaultId,id),projectKeysEnvelope:envelope(g,'project-keys',null,'account',vaultId,id)};}
test('session capability is random, hashed at rest, fixed-lived and IP/global issuance limited transactionally',async()=>{
 const f=fixture(),a=await f.service.issue('ip'),b=await f.service.issue('ip');assert.notEqual(a.token,b.token);assert.ok(!JSON.stringify(f.data).includes(a.token));assert.equal((await f.service.authorize(a.token)).runId,a.runId);
 await assert.rejects(f.service.issue('ip'),{code:'GUEST_RATE_LIMIT'});await f.service.issue('other');await f.service.issue('third');await assert.rejects(f.service.issue('fourth'),{code:'GUEST_RATE_LIMIT'});assert.equal(f.data.sessions.length,4);
 await assert.rejects(f.service.authorize('0'.repeat(64)),{code:'GUEST_SESSION_EXPIRED'});f.advance(7200001);await assert.rejects(f.service.authorize(a.token),{code:'GUEST_SESSION_EXPIRED'});
});
test('bootstrap validates exact guest AAD and idempotent ciphertext; cannot overwrite existing run',async()=>{
 const f=fixture(),{g,b}=await boot(f);await f.service.bootstrap(g.token,b);assert.equal(f.data.runs.length,1);const changed=structuredClone(b);changed.manifestEnvelope.ciphertext=Buffer.alloc(40,1).toString('base64');await assert.rejects(f.service.bootstrap(g.token,changed),{code:'GUEST_BOOTSTRAP_CONFLICT'});
 const wrong=structuredClone(b);wrong.projectKeysEnvelope.context.tenantId='account';await assert.rejects(f.service.bootstrap(g.token,wrong),{code:'GUEST_BOOTSTRAP_INVALID'});
});
test('adoption freezes source, rejects cross-account claims, reencrypts into new account context and is idempotent',async()=>{
 const f=fixture(),{g}=await boot(f),adoptionId=randomUUID(),a=await f.service.prepare(g.token,{id:'account'},adoptionId);
 assert.equal(f.data.runs[0].metadata.guestPlanning.frozen,true);await assert.rejects(f.service.authorize(g.token),{code:'GUEST_SESSION_EXPIRED'});
 await assert.rejects(f.service.prepare(g.token,{id:'thief'},adoptionId),{code:'GUEST_ADOPTION_CLAIMED'});
 const b=await target(f,g,a),wrong=structuredClone(b);wrong.manifestEnvelope.context.tenantId=g.tenantId;await assert.rejects(f.service.commit(g.token,{id:'account'},wrong),{code:'GUEST_ADOPTION_INVALID'});
 const out=await f.service.commit(g.token,{id:'account'},b);assert.equal(out.id,a.targetRunId);assert.deepEqual(await f.service.commit(g.token,{id:'account'},b),out);assert.equal(f.data.runs.length,2);assert.equal(f.data.runs[0].userId,g.tenantId);assert.equal(f.data.runs[1].userId,'account');assert.equal(f.data.runs[1].metadata.privateFundingInputs,undefined);assert.equal(f.data.runs[0].metadata.guestPlanning.adopted,true);
 assert.equal((await f.service.prepare(g.token,{id:'account'},adoptionId)).state,'committed');
});
test('unresolved action prevents freeze; cancelled claim unfreezes without authorizing new inference',async()=>{
 const f=fixture(),{g}=await boot(f),adoptionId=randomUUID();f.data.receipts.push({runId:g.runId,status:'uncertain'});await assert.rejects(f.service.prepare(g.token,{id:'account'},adoptionId),{code:'GUEST_ACTION_UNRESOLVED'});f.data.receipts.length=0;
 await f.service.prepare(g.token,{id:'account'},adoptionId);await f.service.cancel(g.token,{id:'account'},adoptionId);assert.equal(f.data.runs[0].metadata.guestPlanning.frozen,false);assert.equal((await f.service.authorize(g.token)).status,'active');
});
test('commit rejects changed vault and frozen source revision without partial target',async()=>{
 const f=fixture(),{g}=await boot(f),a=await f.service.prepare(g.token,{id:'account'},randomUUID()),b=await target(f,g,a);
 f.data.vaults.find(v=>v.userId==='account').revision=2;await assert.rejects(f.service.commit(g.token,{id:'account'},b),{code:'GUEST_ADOPTION_CONFLICT'});f.data.vaults.find(v=>v.userId==='account').revision=1;f.data.objects.find(v=>v.kind==='manifest').revision=2;await assert.rejects(f.service.commit(g.token,{id:'account'},b),{code:'GUEST_ADOPTION_CONFLICT'});assert.equal(f.data.runs.length,1);
});
test('concurrent adoption attempts produce only one account claim',async()=>{
 const f=fixture(),{g}=await boot(f);const results=await Promise.allSettled([f.service.prepare(g.token,{id:'account'},randomUUID()),f.service.prepare(g.token,{id:'other'},randomUUID())]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
test('guest HTTP origin, route and run scoping deny uploads, funding, arbitrary vaults and execute',async()=>{
 const f=fixture(),{g}=await boot(f),app=express();app.use(express.json());app.use(createGuestPlanningRouter({store:f.store,storage:{},settings:f.settings,allowedOrigins:['https://test.invalid'],broker:{accessMode:'authenticated',ready:async()=>true,workflowReady:async()=>true,guestPlanningReady:async()=>true},authenticate:(_req,res)=>res.status(401).end()}));const api=request(app),auth='Bearer '+g.token;
 assert.equal((await api.post('/session').send({})).status,403);assert.equal((await api.post('/session').set('Origin','https://evil.invalid').send({})).status,403);
 assert.equal((await api.get('/identity').set('Authorization',auth)).body.tenantId,g.tenantId);
 for(const p of ['/vaults','/projects',`/runs/${g.runId}/objects/${randomUUID()}`,`/sessions/${randomUUID()}/execute`,`/runs/${g.runId}/escrow`])assert.equal((await api.post(p).set('Authorization',auth).set('Origin','https://test.invalid').send({runId:g.runId})).status,403);
 assert.equal((await api.get(`/runs/${randomUUID()}/objects`).set('Authorization',auth)).status,403);
 assert.equal((await api.post('/adoption/prepare').set('Authorization',auth).set('Origin','https://test.invalid').send({adoptionId:randomUUID()})).status,401);
});
test('capability readiness requires enabled operator policy and verified worker workflow readiness',async()=>{
 for(const enabled of [false,true])for(const worker of [false,true]){const f=fixture(),app=express();app.use(createGuestPlanningRouter({store:f.store,storage:{},settings:{...f.settings,enabled},allowedOrigins:[],broker:{accessMode:'authenticated',ready:async()=>worker,workflowReady:async()=>worker,guestPlanningReady:async()=>worker}}));assert.equal((await request(app).get('/capabilities')).body.guestPlanning,enabled&&worker);}
});
test('expired capability can read/freeze/save existing work but cannot start another action',async()=>{
 const f=fixture(),{g}=await boot(f);f.advance(7200001);await assert.rejects(f.service.authorize(g.token),{code:'GUEST_SESSION_EXPIRED'});assert.equal((await f.service.authorize(g.token,{read:true})).runId,g.runId);
 const a=await f.service.prepare(g.token,{id:'account'},randomUUID()),b=await target(f,g,a);assert.equal((await f.service.commit(g.token,{id:'account'},b)).state,'committed');
});
test('adoption carries trusted worker plan proof but never copies funding authorization',async()=>{
 const f=fixture(),{g}=await boot(f),run=f.data.runs[0];run.status='planned';run.budgetCap=2.5;run.metadata.guestPlan={version:1,planDigest:'a'.repeat(64),inputDigest:'b'.repeat(64),issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+10000).toISOString()};run.metadata.privateFundingInputs={unsafe:'must not copy'};
 const a=await f.service.prepare(g.token,{id:'account'},randomUUID()),b=await target(f,g,a);await f.service.commit(g.token,{id:'account'},b);const saved=f.data.runs.find(r=>r.id===b.id);assert.equal(saved.status,'planned');assert.equal(saved.budgetCap,2.5);assert.deepEqual(saved.metadata.guestPlan,run.metadata.guestPlan);assert.equal(saved.metadata.guestAdoption.validationRequired,true);assert.equal(saved.metadata.privateFundingInputs,undefined);
});
test('concurrent identical commits return one durable target and forged target IDs fail',async()=>{
 const f=fixture(),{g}=await boot(f),a=await f.service.prepare(g.token,{id:'account'},randomUUID()),b=await target(f,g,a);await assert.rejects(f.service.commit(g.token,{id:'account'},{...b,id:randomUUID()}),{code:'GUEST_ADOPTION_INVALID'});
 const [one,two]=await Promise.all([f.service.commit(g.token,{id:'account'},b),f.service.commit(g.token,{id:'account'},b)]);assert.deepEqual(one,two);assert.equal(f.data.runs.length,2);
});
test('HTTP forwarded IP is not used to bypass issuance quotas and unreadied guest worker stays unavailable',async()=>{
 const f=fixture(),app=express();app.set('trust proxy',true);app.use(express.json());app.use(createGuestPlanningRouter({store:f.store,storage:{},settings:f.settings,allowedOrigins:['https://test.invalid'],broker:{accessMode:'authenticated',ready:async()=>true,workflowReady:async()=>true,guestPlanningReady:async()=>true}}));const api=request(app);
 for(let i=0;i<3;i++){const response=await api.post('/session').set('Origin','https://test.invalid').set('X-Forwarded-For',`192.0.2.${i}`).send({});assert.equal(response.status,i<2?201:429);}
 const cold=express();cold.use(createGuestPlanningRouter({store:f.store,storage:{},settings:f.settings,broker:{accessMode:'authenticated',ready:async()=>true,workflowReady:async()=>true,guestPlanningReady:async()=>false}}));assert.equal((await request(cold).get('/capabilities')).body.enabled,false);
});

test('trusted proxy chain stops at first untrusted hop and direct spoofed headers are ignored',()=>{
 const req=(peer,header)=>({socket:{remoteAddress:peer},get:()=>header}),settings={trustedProxyAddresses:['10.0.0.1','10.0.0.2']};
 assert.equal(guestNetworkIdentity(req('192.0.2.8','1.2.3.4'),settings),'192.0.2.8');
 assert.equal(guestNetworkIdentity(req('10.0.0.1','1.2.3.4, 192.0.2.8, 10.0.0.2'),settings),'192.0.2.8');
 assert.equal(guestNetworkIdentity(req('10.0.0.1','garbage, 192.0.2.8'),settings),'10.0.0.1');
 assert.equal(guestNetworkIdentity(req('::ffff:10.0.0.1','192.0.2.8'),settings),'192.0.2.8');
 assert.equal(guestNetworkIdentity(req('10.0.0.1',Array(20).fill('192.0.2.8').join(',')),settings),'10.0.0.1');
 assert.throws(()=>guestPlanningSettings({DRNIB_GUEST_TRUSTED_PROXY_IPS:'0.0.0.0/0'}),/PROXY_CONFIG/);
});

test('offline adoption resumes after preparation expiry with same frozen target and one commit',async()=>{
 const f=fixture(),{g}=await boot(f),user={id:'account'},adoptionId=randomUUID(),a=await f.service.prepare(g.token,user,adoptionId),b=await target(f,g,a);
 f.advance(1800001);await assert.rejects(f.service.commit(g.token,user,b),{code:'GUEST_ADOPTION_EXPIRED'});
 const renewed=await f.service.prepare(g.token,user,adoptionId);assert.equal(renewed.targetRunId,a.targetRunId);assert.equal(renewed.manifestDigest,a.manifestDigest);assert.notEqual(renewed.expiresAt,a.expiresAt);
 assert.equal((await f.service.commit(g.token,user,b)).id,a.targetRunId);assert.equal(f.data.runs.length,2);
});

test('exhausted guest request quota cannot block authenticated save; adoption has separate bounded window',async()=>{
 const f=fixture(),{g}=await boot(f),app=express();f.data.sessions[0].requests=f.settings.maxRequests;
 app.use(express.json());app.use(createGuestPlanningRouter({store:f.store,storage:{},settings:f.settings,allowedOrigins:['https://test.invalid'],broker:{accessMode:'authenticated',ready:async()=>true,workflowReady:async()=>true,guestPlanningReady:async()=>true},authenticate:(req,res,next)=>{if(req.get('x-test-account')!=='account')return res.status(401).end();req.user={id:'account'};next();}}));
 const api=request(app),auth='Bearer '+g.token,adoptionId=randomUUID();
 assert.equal((await api.post('/sessions').set('Authorization',auth).set('Origin','https://test.invalid').send({runId:g.runId,clientNonce:'0'.repeat(64)})).status,429);
 assert.equal((await api.post('/adoption/prepare').set('Authorization',auth).set('Origin','https://test.invalid').send({adoptionId})).status,401);
 const prepared=await api.post('/adoption/prepare').set('Authorization',auth).set('Origin','https://test.invalid').set('x-test-account','account').send({adoptionId});assert.equal(prepared.status,200);
 // Frozen source reads are still available to re-encrypt the saved journal.
 assert.equal((await api.get('/identity').set('Authorization',auth)).status,200);
 const body=await target(f,g,prepared.body),committed=await api.post('/adoption/commit').set('Authorization',auth).set('Origin','https://test.invalid').set('x-test-account','account').send(body);assert.equal(committed.status,200);assert.equal(committed.body.id,body.id);
 for(let n=0;n<26;n++)await f.service.authorize(g.token,{adoption:true});
 await assert.rejects(f.service.authorize(g.token,{adoption:true}),{code:'GUEST_RATE_LIMIT'});
});
test('owner-only account rollout never advertises or issues public guest sessions that cannot be adopted',async()=>{
 const f=fixture(),app=express();app.use(express.json());app.use(createGuestPlanningRouter({store:f.store,storage:{},settings:f.settings,allowedOrigins:['https://test.invalid'],broker:{accessMode:'owner',allowedTenantId:'owner-only',ready:async()=>true,workflowReady:async()=>true,guestPlanningReady:async()=>true}}));
 const api=request(app);assert.equal((await api.get('/capabilities')).body.enabled,false);assert.equal((await api.post('/session').set('Origin','https://test.invalid').send({})).status,503);assert.equal(f.data.sessions.length,0);
});

test('disabled account record storage cannot advertise or issue a guest session',async()=>{
 const f=fixture(),app=express();app.use(express.json());app.use(createGuestPlanningRouter({store:f.store,storage:{},settings:{...f.settings,recordsEnabled:false},allowedOrigins:['https://test.invalid'],broker:{accessMode:'authenticated',ready:async()=>true,workflowReady:async()=>true,guestPlanningReady:async()=>true}}));const api=request(app);
 assert.equal((await api.get('/capabilities')).body.enabled,false);assert.equal((await api.post('/session').set('Origin','https://test.invalid').send({})).status,503);assert.equal(f.data.sessions.length,0);
});
