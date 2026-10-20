// Route-level wake integration with harmless synthetic metadata only.
// No Phala API, provider inference, secrets, or customer documents.
import express from 'express';
import request from 'supertest';
import {afterEach,beforeEach,expect,it} from 'vitest';
import * as auth from '../src/auth.js';
import {createPrivateRunsRouter} from '../src/privacy/private-runs.js';
import {createPrivateBrokerRouter} from '../src/privacy/private-broker.js';

const RUN='d6c59025-38e6-4565-8ed2-f499e45a43ec';
const USER='synthetic-owner';

beforeEach(()=>auth.__setAuthMiddleware((req,_res,next)=>{req.user={id:USER,walletAddress:null};next()}));
afterEach(()=>auth.__setAuthMiddleware(auth.requireUser));

it('owner and quota checks happen before a billable wake for opaque run creation',async()=>{
  let wakes=0,creates=0,limited=false;
  const app=express();app.use(express.json());
  app.use('/v1/private',createPrivateRunsRouter({authenticate:(req,res,next)=>auth.middleware(req,res,next),enabled:()=>true,allowedTenantId:USER,
    ready:async()=>{wakes++;return true},createLimit:async()=>({ok:!limited}),
    store:{researchRun:{create:async()=>{creates++;return {id:RUN,userId:USER}}}}}));
  let result=await request(app).post('/v1/private/runs').send({question:'SYNTHETIC_PRIVATE_CANARY'});
  expect(result.status).toBe(400);expect(wakes).toBe(0);
  auth.__setAuthMiddleware((req,_res,next)=>{req.user={id:'synthetic-outsider'};next()});
  result=await request(app).post('/v1/private/runs').send({});
  expect(result.status).toBe(404);expect(wakes).toBe(0);
  auth.__setAuthMiddleware((req,_res,next)=>{req.user={id:USER,walletAddress:null};next()});
  limited=true;
  result=await request(app).post('/v1/private/runs').send({});
  expect(result.status).toBe(429);expect(wakes).toBe(0);
  limited=false;
  result=await request(app).post('/v1/private/runs').send({});
  expect(result.status).toBe(201);expect(result.body).toEqual({id:RUN,tenantId:USER,status:'draft'});
  expect(wakes).toBe(1);expect(creates).toBe(1);
});

it('authenticated legacy status reads never acquire a compute wake lease',async()=>{
  const events=[];const app=express();app.use(express.json());
  const run={id:RUN,userId:USER,deletedAt:null,metadata:{privacyMode:'confidential'}};
  const wake={run:async(id,fn)=>{events.push('lease');expect(id).toMatch(new RegExp(`^${RUN}:[0-9a-f-]{36}$`));
    const abort=new AbortController();return fn(id,abort.signal)}};
  app.use('/v1/private',createPrivateBrokerRouter({authenticate:(req,res,next)=>auth.middleware(req,res,next),guestBaseURL:'https://guest.example',
    store:{researchRun:{findUnique:async()=>run}},allowedTenantId:USER,
    signCapability:async()=>{events.push('sign');return 'synthetic-capability'},
    ready:async()=>{events.push('ready');return true},wakeController:wake,
    fetchImpl:async(_url,options)=>{events.push('fetch');expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(options.redirect).toBe('error');
      expect(options.headers.authorization).toBe('Bearer synthetic-capability');
      return new Response(JSON.stringify({state:'not_started'}),{status:200,headers:{'content-type':'application/json'}})}}));
  const result=await request(app).get(`/v1/private/runs/${RUN}/job`);
  expect(result.status).toBe(200);expect(result.body).toEqual({state:'not_started'});
  expect(events).toEqual(['ready','sign','fetch']);
});

it('broker refuses redirected guest responses instead of following ciphertext to another origin',async()=>{
  const app=express();app.use(express.json());
  const run={id:RUN,userId:USER,deletedAt:null,metadata:{privacyMode:'confidential'}};
  let redirected=false;
  app.use('/v1/private',createPrivateBrokerRouter({authenticate:(req,res,next)=>auth.middleware(req,res,next),guestBaseURL:'https://guest.example',
    store:{researchRun:{findUnique:async()=>run}},allowedTenantId:USER,
    signCapability:async()=> 'synthetic-capability',ready:async()=>true,
    fetchImpl:async(_url,options)=>{expect(options.redirect).toBe('error');redirected=true;
      return new Response('',{status:307,headers:{location:'https://other.example/collect'}})}}));
  const result=await request(app).get(`/v1/private/runs/${RUN}/job`);
  expect(redirected).toBe(true);expect(result.status).toBe(503);
});
it('explicit wake requires an owned run, empty body and enabled workflow; GET is no-wake',async()=>{
 let starts=0,statusReads=0,enabled=true;const app=express();app.use(express.json());
 app.use('/v1/private',createPrivateBrokerRouter({authenticate:(req,res,next)=>auth.middleware(req,res,next),allowedTenantId:USER,
 store:{researchRun:{findUnique:async()=>({id:RUN,userId:USER,metadata:{privacyMode:'confidential'}})}},workflowReady:async()=>enabled,
 wakeController:{status:async()=>{statusReads++;return {phase:'stopped',enabled:true}},requestWake:async id=>{expect(id).toBe(RUN);starts++;return {phase:'starting',enabled:true}}}}));
 let r=await request(app).get(`/v1/private/runs/${RUN}/wake`);expect(r.status).toBe(200);expect(statusReads).toBe(1);expect(starts).toBe(0);
 r=await request(app).post(`/v1/private/runs/${RUN}/wake`).send({question:'must never enter lifecycle'});expect(r.status).toBe(400);expect(starts).toBe(0);
 enabled=false;r=await request(app).post(`/v1/private/runs/${RUN}/wake`).send({});expect(r.status).toBe(503);expect(starts).toBe(0);
 enabled=true;r=await request(app).post(`/v1/private/runs/${RUN}/wake`).send({});expect(r.status).toBe(202);expect(starts).toBe(1);
 auth.__setAuthMiddleware((req,_res,next)=>{req.user={id:'outsider'};next()});r=await request(app).post(`/v1/private/runs/${RUN}/wake`).send({});expect(r.status).toBe(404);expect(starts).toBe(1);
});
