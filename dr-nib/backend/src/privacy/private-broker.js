import {Router} from 'express';
import {db} from '../db.js';
import {isConfidentialRun} from './guard.js';
import {validateHpkeReportEnvelope,validateHpkeSourceEnvelope} from './source-hpke.js';
import {withPrivateBrokerWake} from './private-broker-wake.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_RESPONSE=5*1024*1024;
function fail(res,status=503){return res.status(status).json({code:'PRIVATE_BROKER_UNAVAILABLE'})}
function exact(value,keys){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys}
// Receipt-bound usage the measured guest reports on a finished execute. The
// broker meters from this; it is never forwarded to the client.
function validJobUsage(usage){
  if(!usage||typeof usage!=='object'||Array.isArray(usage)||
     Object.keys(usage).sort().join(',')!=='calls,costMicroUsd,receipts')return false;
  if(!Number.isSafeInteger(usage.calls)||usage.calls<1||usage.calls>4)return false;
  if(!Number.isSafeInteger(usage.costMicroUsd)||usage.costMicroUsd<0)return false;
  if(!Array.isArray(usage.receipts)||usage.receipts.length!==usage.calls)return false;
  return usage.receipts.every(r=>r&&typeof r==='object'&&!Array.isArray(r)&&
    Object.keys(r).sort().join(',')==='costMicroUsd,inputTokens,model,outputTokens,receiptId,responseDigest'&&
    (r.receiptId===null||(typeof r.receiptId==='string'&&r.receiptId.length<=160))&&
    typeof r.responseDigest==='string'&&/^[0-9a-f]{64}$/.test(r.responseDigest)&&
    typeof r.model==='string'&&Number.isSafeInteger(r.inputTokens)&&r.inputTokens>=0&&
    Number.isSafeInteger(r.outputTokens)&&r.outputTokens>=0&&
    Number.isSafeInteger(r.costMicroUsd)&&r.costMicroUsd>=0);
}
const unavailable=(_req,res)=>res.status(503).json({code:'PRIVATE_BROKER_UNAVAILABLE'});
const sameOwner=(user,run)=>Boolean(user)&&Boolean(run)&&user.id===run.userId;

/** Ordinary same-origin authentication and ciphertext forwarding. It neither
 * parses private files nor sees document keys. `ready` must include fresh guest
 * readiness; default is deliberately closed. The signing key is provisioned
 * separately after authorization and is never sent to the guest. */
export function createPrivateBrokerRouter({store=db,guestBaseURL,signCapability,ready=async()=>false,fullReady=async()=>false,allowedTenantId,fullAllowedTenantId,wakeController,fetchImpl=fetch,authenticate=unavailable,isOwner=sameOwner,money=null}={}){
  const router=Router();
  router.use((req,res,next)=>authenticate(req,res,next));
  const guest=typeof guestBaseURL==='string'?new URL(guestBaseURL):null;
  if(guest&&(guest.protocol!=='https:'||guest.username||guest.password||guest.search||guest.hash))throw new Error('PRIVATE_BROKER_CONFIG_INVALID');
  async function owned(req,runId){
    if(!UUID.test(runId||''))return null;
    const run=await store.researchRun.findUnique({where:{id:runId}});
    return run&&run.deletedAt==null&&run.userId===allowedTenantId&&isOwner(req.user,run)&&isConfidentialRun(run)?run:null;
  }
  async function forward(req,res,{run,scope,path,body,reportId}){
    let executeUsage=null;
    try{
      if(!guest||typeof signCapability!=='function'||await ready()!==true||
         scope==='sessions:full-execute'&&await fullReady()!==true)return fail(res);
      const reply=await withPrivateBrokerWake(wakeController,async wakeSignal=>{
        if(wakeSignal?.aborted)return {status:503};
        const token=await signCapability({tenantId:run.userId,runId:run.id,scope});
        const endpoint=new URL(path,guest);
        if(endpoint.origin!==guest.origin)return {status:503};
        const timeout=AbortSignal.timeout(['sessions:execute','sessions:full-execute'].includes(scope)?180_000:60_000);
        const signal=wakeSignal?AbortSignal.any([wakeSignal,timeout]):timeout;
        const upstream=await fetchImpl(endpoint,{method:req.method,redirect:'error',headers:{authorization:`Bearer ${token}`,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}) ,signal});
        if(upstream.redirected===true||upstream.url&&new URL(upstream.url).origin!==guest.origin)return {status:503};
        if(!upstream.ok)return {status:upstream.status===404?404:upstream.status===409?409:503};
        const raw=await upstream.text();
        if(raw.length>MAX_RESPONSE)return {status:503};
        let value=JSON.parse(raw);
        let usage=null;
        if(scope==='sessions:open'){
          if(!exact(value,'clientNonce,evidence,recipientId,recipientPublicKey,sessionId')&&
             !exact(value,'clientNonce,evidence,rawQuote,recipientId,recipientPublicKey,sessionId'))return {status:503};
          if(!UUID.test(value.sessionId)||! /^[0-9a-f]{64}$/.test(value.clientNonce)||
             value.clientNonce!==body.clientNonce||! /^[0-9a-f]{64}$/.test(value.recipientId))return {status:503};
        }else if(scope==='sessions:prove'){
          if(!exact(value,'challengeDigest,clientNonce,recipientId,sessionId,verified')||value.verified!==true||
             value.sessionId!==req.params.id)return {status:503};
        }else if(scope==='sessions:execute'||scope==='sessions:full-execute'){
          if(upstream.status===202){
            if(!exact(value,'runId,state')||value.runId!==run.id||!['processing','uncertain'].includes(value.state))return {status:503};
          }else{
            if(!['encrypted,id,version','encrypted,id,usage,version'].includes(Object.keys(value).sort().join(','))||
               value.encrypted!==true||value.version!==1||!UUID.test(value.id))return {status:503};
            if(value.usage!==undefined){
              if(!validJobUsage(value.usage))return {status:503};
              usage=value.usage;
              executeUsage=usage;
              const {usage:_omit,...rest}=value;
              value=rest;
            }
          }
        }else if(scope==='jobs:read'){
          if(value?.state==='complete'){
            if(!exact(value,'reportId,state')||!UUID.test(value.reportId))return {status:503};
          }else if(!exact(value,'state')||!['not_started','processing','uncertain'].includes(value.state))return {status:503};
        }else if(scope==='reports:read'){
          validateHpkeReportEnvelope(value,{tenantId:run.userId,runId:run.id});
          if(value.context.objectId!==reportId)return {status:503};
        }
        if(wakeSignal?.aborted)return {status:503};
        return {status:scope==='sessions:open'?201:upstream.status===202?202:200,value};
      },run.id);
      // Meter the finished confidential job. Best-effort: the work is already
      // done and delivered, so a failed/skipped draw must not fail the client.
      // txRef = report object id makes a retried execute idempotent.
      if(reply?.status===200&&executeUsage&&money&&money.enabled===true){
        try{
          await money.draw({runId:run.id,tenantId:run.userId,
            amountUsd:(executeUsage.costMicroUsd/1_000_000).toFixed(6),txRef:reply.value?.id??null});
        }catch{/* metering is best-effort; never fail a delivered report */}
      }
      return reply?.value===undefined?fail(res,reply?.status):res.status(reply.status).json(reply.value);
    }catch{return fail(res)}
  }
  router.post('/sessions',async(req,res)=>{
    try{
      if(!exact(req.body,'clientNonce,runId')||typeof req.body.clientNonce!=='string'||! /^[0-9a-f]{64}$/.test(req.body.clientNonce))return fail(res,400);
      const run=await owned(req,req.body.runId);if(!run)return fail(res,404);
      return forward(req,res,{run,scope:'sessions:open',path:'/v1/private/sessions',body:req.body});
    }catch{return fail(res)}
  });
  for(const [action,scope,key] of [['prove','sessions:prove','challengeEnvelope'],['execute','sessions:execute','sourceEnvelope']]){
    router.post(`/sessions/:id/${action}`,async(req,res)=>{
      try{
        if(!UUID.test(req.params.id)||!exact(req.body,`${key},runId`))return fail(res,400);
        const run=await owned(req,req.body.runId);if(!run)return fail(res,404);
        validateHpkeSourceEnvelope(req.body[key],{tenantId:run.userId,runId:run.id});
        return forward(req,res,{run,scope,path:`/v1/private/sessions/${req.params.id}/${action}`,body:{[key]:req.body[key]}});
      }catch{return fail(res)}
    });
  }
  router.post('/sessions/:id/full-execute',async(req,res)=>{
    try{
      if(!UUID.test(req.params.id)||!exact(req.body,'keyEnvelope,runId,sourceEnvelope'))return fail(res,400);
      const run=await owned(req,req.body.runId);if(!run)return fail(res,404);
      if(run.userId!==fullAllowedTenantId)return fail(res,404);
      const source=validateHpkeSourceEnvelope(req.body.sourceEnvelope,{tenantId:run.userId,runId:run.id});
      const key=validateHpkeSourceEnvelope(req.body.keyEnvelope,{tenantId:run.userId,runId:run.id});
      if(source.recipientId!==key.recipientId||source.objectId===key.objectId)return fail(res,400);
      return forward(req,res,{run,scope:'sessions:full-execute',path:`/v1/private/sessions/${req.params.id}/full-execute`,
        body:{sourceEnvelope:req.body.sourceEnvelope,keyEnvelope:req.body.keyEnvelope}});
    }catch{return fail(res)}
  });
  router.get('/reports/:id',async(req,res)=>{
    try{
      if(!UUID.test(req.params.id)||typeof req.query.runId!=='string')return fail(res,400);
      const run=await owned(req,req.query.runId);if(!run)return fail(res,404);
      return forward(req,res,{run,scope:'reports:read',path:`/v1/private/reports/${req.params.id}?runId=${encodeURIComponent(run.id)}`,reportId:req.params.id});
    }catch{return fail(res)}
  });
  router.get('/runs',async(req,res)=>{
    try{
      const user=req.user;
      if(!user||typeof user.id!=='string'||typeof allowedTenantId!=='string')return fail(res,404);
      const runs=await store.researchRun.findMany({
        where:{userId:allowedTenantId,deletedAt:null,metadata:{path:['privacyMode'],equals:'confidential'}},
        select:{id:true,createdAt:true,status:true,userId:true},orderBy:{createdAt:'desc'},take:50});
      if(!Array.isArray(runs))return fail(res);
      const listed=runs.filter(run=>run&&UUID.test(run.id||"")&&run.createdAt!=null&&typeof run.status==='string'&&run.userId===allowedTenantId)
        .map(run=>({id:run.id,createdAt:run.createdAt,status:run.status,tenantId:run.userId}));
      return res.json({runs:listed});
    }catch{return fail(res)}
  });
  router.get('/runs/:runId/job',async(req,res)=>{
    try{
      const run=await owned(req,req.params.runId);if(!run)return fail(res,404);
      return forward(req,res,{run,scope:'jobs:read',path:`/v1/private/runs/${run.id}/job`});
    }catch{return fail(res)}
  });
  return router;
}
