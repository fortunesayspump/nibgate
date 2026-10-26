import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import {createPrivateRecordsRouter} from './private-record-routes.js';
function fixture({enabled=true,authenticate=(req,_res,next)=>{req.user={id:'owner'};next()}}={}){
 const app=express();app.use(express.json());app.use('/v1/private',createPrivateRecordsRouter({enabled:()=>enabled,allowedTenantId:'owner',authenticate,store:{}}));app.post('/v1/private/sessions',(_req,res)=>res.json({existingBroker:true}));return request(app);
}
test('disabled record enrollment leaves the established private broker reachable',async()=>{
 const api=fixture({enabled:false});assert.equal((await api.get('/v1/private/vault')).status,503);
 const reply=await api.post('/v1/private/sessions').send({});assert.equal(reply.status,200);assert.deepEqual(reply.body,{existingBroker:true});
});
test('vault routes reject outsiders and cross-site or form mutations before touching storage',async()=>{
 const outsider=fixture({authenticate:(req,_res,next)=>{req.user={id:'outsider'};next()}});assert.equal((await outsider.get('/v1/private/vault')).status,404);
 const api=fixture();assert.equal((await api.put('/v1/private/vault').set('Sec-Fetch-Site','cross-site').send({})).status,403);
 assert.equal((await api.post('/v1/private/projects').type('form').send('topic=synthetic')).status,415);
 assert.equal((await api.get('/v1/private/identity')).headers['cache-control'],'private, no-store');
});
test('record routes have no permissive default authentication',async()=>{
 const app=express();app.use(createPrivateRecordsRouter({enabled:()=>true,allowedTenantId:'owner'}));assert.equal((await request(app).get('/vault')).status,503);
});

test('anonymous capability checks expose flags without opening vault data',async()=>{
 const app=express();app.use(createPrivateRecordsRouter({enabled:()=>true,allowedTenantId:'owner'}));
 const reply=await request(app).get('/capabilities');assert.equal(reply.status,200);assert.equal(reply.body.records,true);assert.equal(reply.body.payments,false);assert.equal((await request(app).get('/vault')).status,503);
});
test('public retrieval requires explicit enrollment and web capability together',async()=>{
 for(const enabled of [false,true])for(const workflow of [false,true])for(const web of [false,true]){
  const app=express();app.use(createPrivateRecordsRouter({enabled:()=>enabled,workflowEnabled:()=>workflow,publicRetrievalEnabled:()=>web,allowedTenantId:'owner'}));
  const reply=await request(app).get('/capabilities');
  assert.equal(reply.body.publicRetrieval,enabled&&workflow&&web);assert.equal(reply.body.actions,enabled&&workflow);assert.equal(reply.body.payments,false);
 }
});
test('pausing paid processing leaves authenticated ciphertext enrollment and identity available',async()=>{
 const app=express();app.use(createPrivateRecordsRouter({enabled:()=>true,workflowEnabled:()=>false,publicRetrievalEnabled:()=>true,allowedTenantId:'owner',authenticate:(req,_res,next)=>{req.user={id:'owner'};next()}}));
 const api=request(app),flags=(await api.get('/capabilities')).body;
 assert.equal(flags.records,true);assert.equal(flags.actions,false);assert.equal(flags.publicRetrieval,false);
 assert.equal((await api.get('/identity')).status,200);
});
test('ending a run retains completed encrypted export receipts while fencing unfinished work',async()=>{
 const runId='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222';
 for(const status of ['complete','processing','uncertain',null]){
  const envelope={ciphertext:'opaque-export'},app=express();
  app.use(createPrivateRecordsRouter({enabled:()=>true,allowedTenantId:'owner',authenticate:(req,_res,next)=>{req.user={id:'owner'};next()},store:{
   researchRun:{findUnique:async()=>({id:runId,userId:'owner',deletedAt:null,metadata:{privacyMode:'confidential',privateCancellation:{at:'synthetic'}}})},
   privateActionReceipt:{findUnique:async()=>status?{requestId,status,reply:envelope}:null}
  }}));
  const response=await request(app).get(`/runs/${runId}/actions/${requestId}`);
  assert.equal(response.status,200);
  assert.equal(response.body.state,status==='complete'?'complete':'cancelled');
  if(status==='complete')assert.deepEqual(response.body.envelope,envelope);else assert.equal(response.body.envelope,undefined);
 }
});

test('recovery transaction outages preserve an unknown-outcome response instead of claiming a stale generation',async()=>{
 const vaultId='11111111-1111-4111-8111-111111111111';
 const recoveryEnvelope={version:1,algorithm:'AES-256-GCM',iv:Buffer.alloc(12).toString('base64'),ciphertext:Buffer.alloc(48).toString('base64'),context:{tenantId:'owner',vaultId,runId:null,revision:1,purpose:'vault-recovery'}};
 for(const code of ['P2028','P2034','PRIVATE_RECOVERY_REPLACEMENT_CONFLICT']){
  const app=express();app.use(express.json());
  app.use(createPrivateRecordsRouter({enabled:()=>true,allowedTenantId:'owner',authenticate:(req,_res,next)=>{req.user={id:'owner'};next()},
   store:{$transaction:async(_work,options)=>{assert.equal(options.timeout,20000);throw Object.assign(Error('synthetic failure'),{code});}}}));
  const response=await request(app).post('/vault/replace-recovery').send({vaultId,expectedRevision:1,recoveryEnvelope,projects:[]});
  assert.equal(response.status,code==='PRIVATE_RECOVERY_REPLACEMENT_CONFLICT'?409:503);
  assert.equal(JSON.stringify(response.body).includes('synthetic'),false);
 }
});

test('password and independent code wrappers enroll together without exposing plaintext',async()=>{
 const vaultId='11111111-1111-4111-8111-111111111111';
 const sealed=purpose=>({version:1,algorithm:'AES-256-GCM',iv:Buffer.alloc(12).toString('base64'),ciphertext:Buffer.alloc(48).toString('base64'),context:{tenantId:'owner',vaultId,runId:null,revision:1,purpose}});
 const recoveryEnvelope={version:2,code:sealed('vault-recovery'),password:{...sealed('vault-password'),kdf:{name:'PBKDF2-HMAC-SHA-256',iterations:600000,salt:Buffer.alloc(16).toString('base64')}}};
 const writes=[],app=express();app.use(express.json());
 app.use(createPrivateRecordsRouter({enabled:()=>true,requirePasswordForNewVault:()=>true,allowedTenantId:'owner',authenticate:(req,_res,next)=>{req.user={id:'owner'};next()},store:{privateVaultRecord:{create:async({data})=>writes.push(data)}}}));
 const api=request(app),body={vaultId,expectedRevision:0,recoveryEnvelope,passkey:null};
 assert.equal((await api.put('/vault').send({...body,recoveryEnvelope:recoveryEnvelope.code})).status,400);
 assert.equal((await api.put('/vault').send(body)).status,201);
 assert.equal(writes.length,1);assert.deepEqual(writes[0].recoveryEnvelope,recoveryEnvelope);
 for(const changed of [
  {...recoveryEnvelope,password:{...recoveryEnvelope.password,kdf:{...recoveryEnvelope.password.kdf,iterations:1}}},
  {...recoveryEnvelope,password:{...recoveryEnvelope.password,context:{...recoveryEnvelope.password.context,purpose:'vault-recovery'}}},
  {...recoveryEnvelope,password:{...recoveryEnvelope.password,plaintext:'secret'}}])
  assert.equal((await api.put('/vault').send({...body,recoveryEnvelope:changed})).status,400);
 assert.equal(writes.length,1);
});

test('passkey recovery wrapper updates only with the current vault generation and unchanged recovery envelope',async()=>{
 const vaultId='11111111-1111-4111-8111-111111111111';
 const sealed=purpose=>({version:1,algorithm:'AES-256-GCM',iv:Buffer.alloc(12).toString('base64'),ciphertext:Buffer.alloc(48).toString('base64'),context:{tenantId:'owner',vaultId,runId:null,revision:1,purpose}});
 const recoveryEnvelope={version:2,code:sealed('vault-recovery'),password:{...sealed('vault-password'),kdf:{name:'PBKDF2-HMAC-SHA-256',iterations:600000,salt:Buffer.alloc(16).toString('base64')}}};
 const passkey={credentialId:Buffer.alloc(32,1).toString('base64'),salt:Buffer.alloc(32,2).toString('base64'),envelope:{iv:Buffer.alloc(12,3).toString('base64'),ciphertext:Buffer.alloc(48,4).toString('base64')}};
 const writes=[],store={privateVaultRecord:{findUnique:async()=>({recoveryEnvelope}),updateMany:async({where,data})=>{writes.push({where,data});return {count:1}}}};
 const app=express();app.use(express.json());app.use(createPrivateRecordsRouter({enabled:()=>true,allowedTenantId:'owner',authenticate:(req,_res,next)=>{req.user={id:'owner'};next()},store}));
 const api=request(app),body={vaultId,expectedRevision:1,recoveryEnvelope,passkey};
 assert.equal((await api.put('/vault').send(body)).status,200);
 assert.equal(writes.length,1);assert.deepEqual(writes[0].data.recoveryEnvelope,recoveryEnvelope);
 assert.equal((await api.put('/vault').send({...body,passkey:{...passkey,envelope:{...passkey.envelope,plaintext:'bad'}}})).status,400);
 assert.equal((await api.put('/vault').send({...body,recoveryEnvelope:{...recoveryEnvelope,password:{...recoveryEnvelope.password,iv:Buffer.alloc(12,9).toString('base64')}}})).status,409);
 assert.equal(writes.length,1);
});

test('encrypted project creation has time for its atomic writes and retains generation fencing',async()=>{
 const id='11111111-1111-4111-8111-111111111111',manifestId='22222222-2222-4222-8222-222222222222',vaultId='33333333-3333-4333-8333-333333333333';
 const envelope=(purpose,bytes,objectId)=>({version:1,algorithm:'AES-256-GCM',iv:Buffer.alloc(12).toString('base64'),ciphertext:Buffer.alloc(bytes).toString('base64'),context:{tenantId:'owner',vaultId,runId:id,revision:1,purpose,...(objectId?{objectId}:{})}});
 for(const revision of [1,2]){
  const writes=[],store={privateVaultRecord:{findUnique:async()=>({vaultId,revision})},$queryRaw:async()=>[],researchRun:{count:async()=>0,create:async({data})=>writes.push(data.id)},privateClientObject:{create:async({data})=>writes.push(data.kind)}};
  store.$transaction=async(work,options)=>{assert.equal(options.timeout,20000);assert.equal(options.maxWait,5000);return work(store)};
  const app=express();app.use(express.json());app.use(createPrivateRecordsRouter({store,enabled:()=>true,allowedTenantId:'owner',authenticate:(req,_res,next)=>{req.user={id:'owner'};next()}}));
  const reply=await request(app).post('/projects').send({id,manifestId,vaultId,expectedVaultRevision:1,projectKeysEnvelope:envelope('project-keys',80),manifestEnvelope:envelope('manifest',17,manifestId)});
  assert.equal(reply.status,revision===1?201:409);assert.deepEqual(writes,revision===1?[id,'project-keys','manifest']:[]);
 }
});
