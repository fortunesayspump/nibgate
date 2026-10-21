import {privateTenantAllowed} from './private-tenant-access.js';
import {Router} from 'express';
import {createHash} from 'node:crypto';
import {canonicalToolJson,validatePrivateExternalRequest} from '@nibgate/internal/private-tools.js';
import {isFinalizedPrivateToolCharge} from './private-external-receipt.js';
import {isConfidentialRun} from './guard.js';
import {admitPrivateRunSpend,privateBudgetMicroUsd} from './private-run-budget.js';
import {sealHpkeToolResult,recipientIdForPublicKey} from './source-hpke.js';

const uuid=/^[0-9a-f-]{36}$/i,hash=/^[0-9a-f]{64}$/;
const unavailable=()=>Error('PRIVATE_EXTERNAL_TOOL_UNAVAILABLE');
const digest=value=>createHash('sha256').update(canonicalToolJson(value)).digest('hex');
const options={timeout:60000,maxWait:10000};
/** The owner approves exact public arguments. This service receives no private
 * prompt, project key or uploaded document. Results are HPKE encrypted for the
 * browser before durable storage and later enter the guest as encrypted input. */
export function createPrivateExternalTools({db,execute}){
 const owned=async(tx,runId,user)=>{
  const run=await tx.researchRun.findUnique({where:{id:runId},select:{id:true,userId:true,status:true,metadata:true,budgetCap:true,deletedAt:true,settledAt:true}});
  if(!run||run.userId!==user?.id||run.deletedAt||!isConfidentialRun(run))throw unavailable();return run;
 };
 const lock=async(tx,runId)=>{await tx.$queryRaw`SELECT pg_advisory_xact_lock(648821,1)::text AS locked`;await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${runId}))::text AS locked`;};
 const reconcile=async(row,runId,user)=>{
  if(row.status!=='reserved'||!row.paymentEvidence||typeof execute.reconcile!=='function')return row;
  const proof=await execute.reconcile(row.paymentEvidence).catch(()=>null);
  if(!proof?.confirmed&&!proof?.failed)return row;
  return db.$transaction(async tx=>{
   await lock(tx,runId);const run=await owned(tx,runId,user);
   if(run.settledAt||run.metadata?.privateCancellation||run.metadata?.privateEscrow?.settlement)return row;
   const current=await tx.privateToolCall.findUnique({where:{id:row.id}});
   // A cancelled/frozen run must never gain a late charge.
   if(current.status!=='reserved')return current;
   if(proof.failed)return tx.privateToolCall.update({where:{id:row.id},data:{status:'failed',committedMicroUsd:0n,costBasis:'gateway-failed'}});
   if(!current.resultEnvelope&&!current.resultDigest){
    // A settled purchase with a lost response must not trap the project or
    // charge the owner for missing content. Deliver an encrypted failure and
    // retain the actual provider cost as platform-covered accounting evidence.
    const output={sources:[],contentUnavailable:true,operatorCovered:true,providerCostMicroUsd:Number(BigInt(current.paymentEvidence.amount)),notice:'The purchase settled but its content response was lost. The platform covers this failed delivery; your charge is $0. Do not automatically purchase again without owner direction.'};
    const plaintext=Buffer.from(canonicalToolJson(output));
    try{
     const envelope=await sealHpkeToolResult({recipientPublicKey:Buffer.from(current.recipientPublicKey,'base64'),context:{tenantId:user.id,runId,objectId:current.id,revision:1,purpose:'tool-result',recipientId:current.recipientId},plaintext});
     return tx.privateToolCall.update({where:{id:row.id},data:{status:'complete',costBasis:'gateway-confirmed',txHash:proof.txHash,committedMicroUsd:0n,resultDigest:digest(output),resultEnvelope:envelope,paymentEvidence:{...current.paymentEvidence,billingKind:'platform',providerCostMicroUsd:current.paymentEvidence.amount}}});
    }finally{plaintext.fill(0);}
   }
   if(!current.resultEnvelope||!current.resultDigest)return current;
   return tx.privateToolCall.update({where:{id:row.id},data:{status:'complete',costBasis:'gateway-confirmed',txHash:proof.txHash,committedMicroUsd:BigInt(current.paymentEvidence.amount)}});
  },options);
 };
 const readable=row=>({id:row.id,status:row.status,requestDigest:row.requestDigest,costMicroUsd:Number(row.committedMicroUsd),envelope:row.status==='complete'?row.resultEnvelope??null:null,settlementPending:row.status==='reserved'&&!!row.paymentEvidence});
 return {
  async register(runId,user,input){
   if(!input||Object.keys(input).sort().join(',')!=='id,manifestRevision,questionId,recipientPublicKey,request'||!uuid.test(input.id)||!hash.test(input.questionId)||!Number.isSafeInteger(input.manifestRevision)||input.manifestRevision<1)throw unavailable();
   const request=validatePrivateExternalRequest(input.request),bytes=Buffer.from(input.recipientPublicKey??'','base64');
   if(bytes.length!==65||bytes.toString('base64')!==input.recipientPublicKey)throw unavailable();
   const requestDigest=digest(request),recipientId=recipientIdForPublicKey(bytes);
   return db.$transaction(async tx=>{
    await lock(tx,runId);const run=await owned(tx,runId,user);
    const manifest=await tx.privateClientObject.findFirst({where:{runId,kind:'manifest',removed:false},select:{revision:true}});
    if(manifest?.revision!==input.manifestRevision)throw unavailable();
    const prior=await tx.privateToolCall.findUnique({where:{runId_questionId:{runId,questionId:input.questionId}}});
    if(prior){if(prior.requestDigest!==requestDigest||prior.recipientId!==recipientId)throw unavailable();return readable(prior);}
    if(run.status!=='awaiting'||run.settledAt||run.metadata?.privateCancellation||run.metadata?.privateEscrow?.settlement||await tx.privateActionReceipt.count({where:{runId,status:{in:['processing','uncertain']}}})||await tx.privateToolCall.count({where:{runId}})>=32)throw unavailable();
    const row=await tx.privateToolCall.create({data:{id:input.id,runId,questionId:input.questionId,manifestRevision:input.manifestRevision,tool:request.tool,request,requestDigest,recipientPublicKey:input.recipientPublicKey,recipientId,reservedMicroUsd:BigInt(request.maxMicroUsd)}});
    return readable(row);
   },options);
  },
  async get(runId,user,id){await owned(db,runId,user);const row=await db.privateToolCall.findFirst({where:{id,runId}});if(!row)throw unavailable();return readable(await reconcile(row,runId,user));},
  async run(runId,user,id){
   const row=await db.$transaction(async tx=>{
    await lock(tx,runId);const run=await owned(tx,runId,user),call=await tx.privateToolCall.findFirst({where:{id,runId}});
    if(!call)throw unavailable();
    const safeRetry=call.status==='failed'&&call.costBasis==='not-dispatched'&&call.committedMicroUsd===0n&&!call.paymentEvidence&&!call.resultEnvelope&&!call.resultDigest&&!call.txHash;
    if(call.status!=='approved'&&!safeRetry)return call;
    if(run.status!=='awaiting'||run.metadata?.privateCancellation||run.settledAt||run.metadata?.privateEscrow?.settlement)throw unavailable();
    const manifest=await tx.privateClientObject.findFirst({where:{runId,kind:'manifest',removed:false},select:{revision:true}});
    if(manifest?.revision!==call.manifestRevision||await tx.privateActionReceipt.count({where:{runId,status:{in:['processing','uncertain']}}}))throw unavailable();
    if(await tx.privateToolCall.count({where:{runId,status:'reserved'}}))throw unavailable();
    await admitPrivateRunSpend(tx,runId,call.reservedMicroUsd,privateBudgetMicroUsd(Number(run.budgetCap)),true,'customer',run);
    return {...await tx.privateToolCall.update({where:{id},data:{status:'reserved',costBasis:'reservation',committedMicroUsd:call.reservedMicroUsd}}),dispatch:true};
   },options);
   if(!row.dispatch)return readable(await reconcile(row,runId,user));
   let result;
   try{result=await execute(validatePrivateExternalRequest(row.request),{onPaymentPrepared:async evidence=>{
    await db.$transaction(async tx=>{
     await lock(tx,runId);const current=await tx.privateToolCall.findUnique({where:{id}});
     if(current.status!=='reserved')throw unavailable();
     await tx.privateToolCall.update({where:{id},data:{paymentEvidence:evidence}});
    },options);
   }});}
   catch(error){
    // No paid authorization/transaction was attempted only when the trusted
    // executor proves that fact. A timeout/unknown payment remains reserved.
    if(error?.privateNotDispatched===true)await db.privateToolCall.update({where:{id},data:{status:'failed',committedMicroUsd:0n,costBasis:'not-dispatched'}});
    throw unavailable();
   }
   if(!result||!Number.isSafeInteger(result.costMicroUsd)||result.costMicroUsd<0||BigInt(result.costMicroUsd)>row.reservedMicroUsd||!['no-charge','seller-receipt','chain-receipt','gateway-confirmed'].includes(result.costBasis))throw unavailable();
   const plain=Buffer.from(canonicalToolJson(result.output));if(plain.length>128000)throw unavailable();
   try{
    const resultDigest=digest(result.output);
    if(!result.pending&&!isFinalizedPrivateToolCharge({status:'complete',committedMicroUsd:result.costMicroUsd,costBasis:result.costBasis,resultDigest,txHash:result.txHash}))throw unavailable();
    const envelope=await sealHpkeToolResult({recipientPublicKey:Buffer.from(row.recipientPublicKey,'base64'),context:{tenantId:user.id,runId,objectId:id,revision:1,purpose:'tool-result',recipientId:row.recipientId},plaintext:plain});
    const completed=await db.$transaction(async tx=>{
     await lock(tx,runId);const run=await owned(tx,runId,user);
     if(run.settledAt||run.metadata?.privateCancellation||run.metadata?.privateEscrow?.settlement)throw unavailable();
     const current=await tx.privateToolCall.findUnique({where:{id}});
     if(current.status!=='reserved')throw unavailable();
     return tx.privateToolCall.update({where:{id},data:{status:result.pending?'reserved':'complete',costBasis:result.pending?'gateway-pending':result.costBasis,committedMicroUsd:result.pending?current.committedMicroUsd:BigInt(result.costMicroUsd),resultDigest,resultEnvelope:envelope,...(result.paymentEvidence?{paymentEvidence:result.paymentEvidence}:{}),...(/^0x[0-9a-f]{64}$/i.test(result.txHash??'')?{txHash:result.txHash}:{})}});
    },options);
    return readable(completed);
   }finally{plain.fill(0);}
  }
 };
}

export function createPrivateExternalToolsRouter({tools,authenticate,allowedTenantId,accessMode='owner'}){
 const router=Router();router.use((req,_res,next)=>/^\/runs\/[0-9a-f-]{36}\/tools(?:\/[0-9a-f-]{36}(?:\/execute)?)?$/.test(req.path)?next():next('router'));
 router.use(authenticate);router.use((req,res,next)=>{res.set('Cache-Control','private, no-store');if(!privateTenantAllowed(req.user?.id,{allowedTenantId,accessMode}))return res.status(404).json({code:'PRIVATE_RECORD_NOT_FOUND'});if(req.method!=='GET'&&(!req.is('application/json')||req.get('sec-fetch-site')==='cross-site'))return res.status(400).json({code:'PRIVATE_REQUEST_INVALID'});next()});
 for(const [method,path,op]of [['post','/runs/:runId/tools','register'],['get','/runs/:runId/tools/:id','get'],['post','/runs/:runId/tools/:id/execute','run']])router[method](path,async(req,res)=>{
  try{if(!uuid.test(req.params.runId)||req.params.id&&!uuid.test(req.params.id)||op==='run'&&Object.keys(req.body??{}).length)throw unavailable();return res.json(await tools[op](req.params.runId,req.user,op==='register'?req.body:req.params.id));}catch{return res.status(503).json({code:'PRIVATE_EXTERNAL_TOOL_UNAVAILABLE'})}
 });return router;
}
