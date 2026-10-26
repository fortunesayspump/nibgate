import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import {createLegacyArchiveRouter} from './legacy-archive.js';

const own='a9b10c53-0ad8-46dd-8bdc-da508d12c130';
const other='ed50d436-51ac-4e33-9085-dea5a8cccf11';
const confidential='dfb673d8-b848-40b8-8575-17e6a5d10645';
const runs=[
  {id:own,userId:'owner',title:'Old report',brief:{topic:'historical topic'},status:'complete',metadata:{privacyMode:'legacy'},createdAt:new Date(),updatedAt:new Date()},
  {id:other,userId:'other',title:'Other report',brief:{topic:'secret'},status:'complete',metadata:{privacyMode:'legacy'},createdAt:new Date(),updatedAt:new Date()},
  {id:confidential,userId:'owner',title:'Private',brief:{encrypted:true},status:'complete',metadata:{privacyMode:'confidential'},createdAt:new Date(),updatedAt:new Date()},
];
function fixture({enabled=true,authorized=true}={}){
  const calls=[];
  const store={
    researchRun:{
      findMany:async q=>{calls.push(['list',q]);return runs.filter(r=>r.userId===q.where.userId)},
      findFirst:async q=>{calls.push(['read',q]);return runs.find(r=>r.id===q.where.id&&r.userId===q.where.userId)??null},
    },
    researchReport:{
      findMany:async q=>{calls.push(['versions',q]);return [{version:2,createdAt:new Date()}]},
      findFirst:async q=>{calls.push(['report',q]);return {version:q.where.version??2,markdown:'# Historical report',citations:[],createdAt:new Date()}},
    },
    budgetLedger:{findMany:async q=>{calls.push(['ledger',q]);return [{kind:'refund',amount:2.5,txRef:'0xreceipt',createdAt:new Date()}]}},
  };
  const app=express();
  app.use('/v1/legacy-archive',createLegacyArchiveRouter({store,enabled:()=>enabled,
    authenticate:(req,res,next)=>{if(!authorized)return res.status(401).json({code:'unauthenticated'});req.user={id:'owner'};next()}}));
  return {app,calls};
}

test('disabled and signed-out archives cannot read the database',async()=>{
  for(const options of [{enabled:false},{authorized:false}]){
    const {app,calls}=fixture(options);
    const result=await request(app).get('/v1/legacy-archive/runs');
    assert.equal(result.status,options.enabled===false?404:401);
    assert.equal(calls.length,0);
  }
});

test('owner lists only ordinary runs; private metadata and other owners are excluded',async()=>{
  const {app,calls}=fixture();
  const result=await request(app).get('/v1/legacy-archive/runs');
  assert.equal(result.status,200);
  assert.equal(result.headers['cache-control'],'private, no-store');
  assert.deepEqual(result.body.runs.map(r=>r.id),[own]);
  assert.equal(result.body.runs[0].topic,'historical topic');
  assert.equal(result.body.runs[0].metadata,undefined);
  assert.equal(calls.length,1);
});

test('owner can read historical report and ledger, never another or confidential run',async()=>{
  const {app,calls}=fixture();
  const detail=await request(app).get(`/v1/legacy-archive/runs/${own}`);
  assert.equal(detail.status,200);
  assert.equal(detail.body.run.title,'Old report');
  assert.equal(detail.body.ledger[0].kind,'refund');
  const report=await request(app).get(`/v1/legacy-archive/runs/${own}/report?version=2`);
  assert.equal(report.status,200);
  assert.equal(report.body.report.markdown,'# Historical report');
  for(const id of [other,confidential]){
    assert.equal((await request(app).get(`/v1/legacy-archive/runs/${id}`)).status,404);
    assert.equal((await request(app).get(`/v1/legacy-archive/runs/${id}/report`)).status,404);
  }
  assert.equal(calls.filter(([kind])=>kind==='report').length,1);
});

test('archive rejects writes and invalid report version without database access',async()=>{
  const {app,calls}=fixture();
  assert.equal((await request(app).post('/v1/legacy-archive/runs')).status,405);
  assert.equal((await request(app).get(`/v1/legacy-archive/runs/${own}/report?version=bad`)).status,400);
  assert.equal(calls.length,0);
});
