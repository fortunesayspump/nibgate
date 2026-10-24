import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import {afterAll, beforeAll, beforeEach, expect, it, vi} from 'vitest';

vi.mock('../src/queue.js',()=>({
  queueMode:()=> 'test',initQueue:async()=>{},enqueue:async()=>({id:'test-job'}),startWorkers:()=>{},
}));

const state=vi.hoisted(()=>({
  job:{status:'Open',client:'0x1111111111111111111111111111111111111111',provider:'0x2222222222222222222222222222222222222222',evaluator:'0x3333333333333333333333333333333333333333',token:'0x3600000000000000000000000000000000000000',hook:'0x0000000000000000000000000000000000000000',budget:1},
}));
const expected={core:'0x4444444444444444444444444444444444444444',splitter:'0x2222222222222222222222222222222222222222',evaluator:'0x3333333333333333333333333333333333333333',token:'0x3600000000000000000000000000000000000000'};
vi.mock('../src/escrow/jobs.js',()=>({
  isEscrowConfigured:()=>true,
  jobStatus:async()=>({...state.job}),
  assertEscrowOperational:async()=>{},
  createParams:()=>({...expected,description:'test',expiredAt:2_000_000_000,hook:'0x0000000000000000000000000000000000000000'}),
  escrowConfig:()=>expected,
  assertEscrowJobBinding:(job,{client})=>{
    const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
    if(!same(job.client,client)||!same(job.provider,expected.splitter)||!same(job.evaluator,expected.evaluator)||!same(job.token,expected.token)||!same(job.hook,'0x0000000000000000000000000000000000000000'))throw Error('binding mismatch');
    return expected;
  },
}));

const {runs}=await import('../src/routes/runs.js');
const auth=await import('../src/auth.js');
const {db}=await import('../src/db.js');
const {toDb}=await import('../src/units.js');
const user={id:'escrow-binding-user',walletAddress:state.job.client};
const realAuth=auth.middleware;
const app=express();app.use(express.json());app.use(cookieParser());app.use('/v1/runs',runs);
const api=()=>request(app);

async function makeRun(){return db.researchRun.create({data:{userId:user.id,walletAddress:user.walletAddress,title:'Bound escrow',brief:{topic:'test'},plan:{source:'model',estimate:0.1,sub_questions:['test']},metadata:{},status:'planned',budgetCap:toDb(1)}})}

beforeAll(()=>auth.__setAuthMiddleware((req,_res,next)=>{req.user=user;next()}));
afterAll(()=>auth.__setAuthMiddleware(realAuth));
beforeEach(async()=>{await db.researchRun.deleteMany({where:{userId:user.id}});state.job={...state.job,status:'Open',provider:expected.splitter};});

it('claims one onchain job for only one research run',async()=>{
  const first=await makeRun(),second=await makeRun();
  expect((await api().post(`/v1/runs/${first.id}/escrow/register`).send({jobId:'7'})).status).toBe(201);
  const duplicate=await api().post(`/v1/runs/${second.id}/escrow/register`).send({jobId:'7'});
  expect(duplicate.status).toBe(409);
  expect(duplicate.body.error).toMatch(/already registered/);
});

it('rechecks mutable Open-job binding before approving research',async()=>{
  const run=await makeRun();
  expect((await api().post(`/v1/runs/${run.id}/escrow/register`).send({jobId:'8'})).status).toBe(201);
  state.job={...state.job,status:'Funded',provider:'0x9999999999999999999999999999999999999999'};
  const approval=await api().post(`/v1/runs/${run.id}/approve`).send({});
  expect(approval.status).toBe(409);
  expect(approval.body.error).toMatch(/no longer matches/);
  expect(await db.budgetLedger.count({where:{runId:run.id}})).toBe(0);
});
