import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import {privateAccessMode,privateTenantAllowed} from './private-tenant-access.js';
import {privateRunCreateAdmission} from './private-run-admission.js';
import {createPrivateRecordsRouter} from './private-record-routes.js';
import {createPostgresPrivateAiBudgetLedger} from './private-ai-budget.js';

// The injected router store never opens a DB connection. Its module's default
// client still validates configuration; use an unreachable loopback fixture.
process.env.HUB_DATABASE_URL='postgresql://fixture:unused@127.0.0.1:1/fixture';
process.env.DRNIB_DATABASE_URL='postgresql://fixture:unused@127.0.0.1:1/fixture?schema=drnib_test';
const {createPrivateBrokerRouter}=await import('./private-broker.js');

const id='11111111-1111-4111-8111-111111111111';
const auth=userId=>(req,_res,next)=>{if(userId)req.user={id:userId};next()};
test('public admission is explicit and rejects invalid identities and modes',()=>{
  assert.equal(privateAccessMode({}),'owner');
  assert.throws(()=>privateAccessMode({DRNIB_PRIVATE_ACCESS_MODE:'anything'}));
  assert.equal(privateTenantAllowed('alice',{allowedTenantId:'operator'}),false);
  assert.equal(privateTenantAllowed('alice',{accessMode:'authenticated'}),true);
  for(const tenantId of [undefined,'','*','alice/bob',{},'a'.repeat(129)])
    assert.equal(privateTenantAllowed(tenantId,{accessMode:'authenticated'}),false);
});
test('each authenticated user passes their own creation quota before readiness',async()=>{
  const calls=[];
  const result=await privateRunCreateAdmission({user:{id:'alice'},body:{},accessMode:'authenticated',
    createLimit:async tenantId=>{calls.push(tenantId);return{ok:false}},ready:async()=>{throw Error('must not wake')}});
  assert.equal(result.status,429);assert.deepEqual(calls,['alice']);
});
test('public broker lists only the signed-in tenant and denies another tenant run before forwarding',async()=>{
  const app=express();let queried;
  app.use(createPrivateBrokerRouter({accessMode:'authenticated',authenticate:auth('alice'),store:{researchRun:{
    findMany:async({where})=>{queried=where.userId;return[{id,createdAt:'2026-10-21',status:'draft',userId:'alice'},{id,createdAt:'2026-10-21',status:'draft',userId:'bob'}]},
    findUnique:async()=>({id,userId:'bob',deletedAt:null,metadata:{privacyMode:'confidential'}})
  }},fetchImpl:async()=>{throw Error('cross-tenant forwarding')}}));
  const list=await request(app).get('/runs');assert.equal(list.status,200);assert.equal(queried,'alice');
  assert.equal(list.body.runs.length,1);assert.equal(list.body.runs[0].tenantId,'alice');
  assert.equal((await request(app).get(`/runs/${id}/job`)).status,404);
});
test('public encrypted vault reads remain bound to the authenticated user',async()=>{
  const seen=[],app=express();app.use(createPrivateRecordsRouter({accessMode:'authenticated',enabled:()=>true,authenticate:auth('alice'),
    store:{privateVaultRecord:{findUnique:async({where})=>{seen.push(where.userId);return null}}}}));
  assert.equal((await request(app).get('/identity')).status,200);
  assert.equal((await request(app).get('/vault')).status,404);assert.deepEqual(seen,['alice']);
  const anonymous=express();anonymous.use(createPrivateRecordsRouter({accessMode:'authenticated',enabled:()=>true,authenticate:auth(null),store:{}}));
  assert.equal((await request(anonymous).get('/identity')).status,404);
});
test('public budget reservations still verify database run ownership before global accounting',async()=>{
  let aggregates=0;
  const tx={$queryRaw:async()=>[],researchRun:{findUnique:async()=>({userId:'bob',deletedAt:null,metadata:{privacyMode:'confidential'}})},
    privateAiBudgetReservation:{aggregate:async()=>{aggregates++;return{_sum:{committedMicroUsd:0n}}}}};
  const ledger=createPostgresPrivateAiBudgetLedger({$transaction:async fn=>fn(tx)});
  await assert.rejects(ledger.reserve({runId:id,tenantId:'alice',ownerUserId:'operator',accessMode:'authenticated'}),{code:'PRIVATE_AI_OWNER_ONLY'});
  assert.equal(aggregates,0);
});
