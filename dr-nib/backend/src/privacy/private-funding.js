import {requirePrivateFundingInputs} from './private-input-readiness.js';
import {Router} from 'express';
import {Prisma} from '@prisma/client';
import {isConfidentialRun} from './guard.js';
import {isFinalizedPrivateCharge} from './private-usage.js';
import {readPrivateFinancialReceipt} from './private-financial-receipt.js';
import {isFinalizedPrivateToolCharge} from './private-external-receipt.js';

const UUID=/^[0-9a-f-]{36}$/i,ADDRESS=/^0x[0-9a-f]{40}$/i;
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys;
const unavailable=()=>Error('PRIVATE_FUNDING_UNAVAILABLE');
const micros=value=>{const n=Number(value);if(!Number.isFinite(n)||n<0||n>1000)throw unavailable();return BigInt(Math.round(n*1000000));};
const usd=value=>new Prisma.Decimal(value.toString()).div(1000000);
// Remote PostgreSQL round trips and advisory-lock contention can exceed
// Prisma's five-second default. Chain calls remain outside transactions.
const transactionOptions={timeout:60000,maxWait:10000};

/** Separate public-money boundary: opaque run/job IDs, wallet and amounts only.
 * Chain reads establish funding; encrypted research is never an input. No
 * document worker imports this module or receives a keeper/spending key. */
export function createPrivateFunding({db,settings,prepare,readJob,completeAndSplit}){
 if(!db||!settings||!['core','splitter','evaluator','token','operator'].every(k=>ADDRESS.test(settings[k]??''))||
    typeof prepare!=='function'||typeof readJob!=='function'||typeof completeAndSplit!=='function')throw unavailable();
 const chainMatches=(job,run)=>job&&same(job.client,run.walletAddress)&&same(job.provider,settings.splitter)&&same(job.evaluator,settings.evaluator)&&same(job.token,settings.token);
 const owned=async(tx,id,user)=>{
  const run=await tx.researchRun.findUnique({where:{id},select:{id:true,userId:true,walletAddress:true,metadata:true,status:true,budgetCap:true,deletedAt:true,settledAt:true}});
  if(!run||!user?.id||run.userId!==user.id||run.deletedAt||!isConfidentialRun(run)||!ADDRESS.test(run.walletAddress??''))throw unavailable();
  return run;
 };
 const lock=async(tx,id)=>{await tx.$queryRaw`SELECT pg_advisory_xact_lock(648821,1)::text AS locked`;await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))::text AS locked`;};
 async function status(id,user){
  const run=await owned(db,id,user),local=run.metadata?.privateEscrow;
  if(!local)return {configured:true,privateRehearsal:false,job:null,cancelled:!!run.metadata?.privateCancellation};
  // Confirmed settlement is a durable historical receipt. A later RPC outage
  // must not hide its already confirmed charge/refund or reinterpret it as a
  // fresh funding authorization. Open/funded jobs still require chain reads.
  const frozen=local.settlement;
  const archived=run.settledAt&&local.splitConfirmed===true&&local.status==='Completed'&&frozen?.jobId===local.jobId&&same(frozen.client,run.walletAddress)&&same(local.core,settings.core)&&same(local.splitter,settings.splitter)&&/^\d{1,12}$/.test(frozen.held??'');
  const job=archived?{status:'Completed',budget:Number(frozen.held)/1000000,client:frozen.client,provider:local.splitter,evaluator:settings.evaluator,token:settings.token}:await readJob(local.jobId);
  if(!chainMatches(job,run))throw unavailable();
  if(job.status==='Funded')await db.$transaction(async tx=>{
   await lock(tx,id);const fresh=await owned(tx,id,user);
   if(fresh.settledAt||fresh.metadata?.privateEscrow?.jobId!==local.jobId)throw unavailable();
   const amount=micros(job.budget),cap=micros(fresh.budgetCap);
   if(amount<1n||amount>cap)throw unavailable();
   const txRef='private-escrow:'+local.jobId;
   const prior=await tx.budgetLedger.findFirst({where:{runId:id,kind:'deposit',txRef}});
   if(prior&&micros(prior.amount)!==amount)throw unavailable();
   if(!prior)await tx.budgetLedger.create({data:{runId:id,kind:'deposit',amount:usd(amount),txRef}});
  },transactionOptions);
  const financial=await readPrivateFinancialReceipt(db,id,user.id);
  return {configured:true,privateRehearsal:false,settledAt:run.settledAt,job:{jobId:local.jobId,core:settings.core,splitter:settings.splitter,status:job.status,receiptSource:archived?'confirmed-settlement':'chain-read',budget:job.budget,client:job.client,provider:job.provider,evaluator:job.evaluator,cancelled:!!run.metadata?.privateCancellation,waivedCalls:local.settlement?.waivedCalls??0,unconfirmedHeldMicroUsd:local.settlement?.unconfirmedHeldMicroUsd??'0',splitConfirmed:local.splitConfirmed===true,completeTx:local.completeTx??null,splitTx:local.splitTx??null},...financial};
 }
 const settlements=new Map();
 async function settle(id,user,cancel=false){
   // API retries and the automatic reconciler share one chain submission.
   const key=id+':'+user?.id;
   if(settlements.has(key)){await settlements.get(key);return settle(id,user,cancel);}
   const flight=settleOnce(id,user,cancel);settlements.set(key,flight);
   try{return await flight;}finally{if(settlements.get(key)===flight)settlements.delete(key);}
 }
 async function settleOnce(id,user,cancel=false){
   const outcome=await db.$transaction(async tx=>{
    await lock(tx,id);const run=await owned(tx,id,user);
    if(cancel&&!run.settledAt&&!run.metadata?.privateCancellation){
     run.metadata={...run.metadata,privateCancellation:{at:new Date().toISOString(),reason:'owner-ended',unconfirmedCosts:'platform-liability'}};
     await tx.researchRun.update({where:{id},select:{id:true},data:{metadata:run.metadata}});
    }
    const local=run.metadata.privateEscrow;
    const cancelled=!!run.metadata?.privateCancellation;
    if(!local){if(cancelled)return {cancelled:true,spent:0,refunded:0};throw unavailable();}
    if(!cancelled&&!['complete','ended','failed'].includes(run.status))throw unavailable();
    if(run.settledAt)return {alreadySettled:true,jobId:local.jobId};
    if(!cancelled&&(await tx.privateActionReceipt.count({where:{runId:id,status:{in:['processing','uncertain']}}})||
       await tx.privateAiBudgetReservation.count({where:{runId:id}})||
       await tx.privateInferenceCall.count({where:{runId:id,billingKind:'customer',status:'reserved'}})||
       await tx.privateToolCall.count({where:{runId:id,status:'reserved'}})))return {pending:true};
    if(local.settlement)return local.settlement;
    const allCalls=await tx.privateInferenceCall.findMany({where:{runId:id,billingKind:'customer'},select:{id:true,status:true,costBasis:true,usageEvidence:true,committedMicroUsd:true}});
    const allTools=await tx.privateToolCall.findMany({where:{runId:id,status:{not:'approved'}},select:{id:true,status:true,committedMicroUsd:true,costBasis:true,resultDigest:true,txHash:true}});
    const unconfirmed=[...allCalls.filter(c=>!isFinalizedPrivateCharge(c)),...allTools.filter(c=>!isFinalizedPrivateToolCharge(c))];
    if(!cancelled&&unconfirmed.length)throw unavailable();
    const calls=allCalls.filter(isFinalizedPrivateCharge);
    const tools=allTools.filter(isFinalizedPrivateToolCharge);
    const spent=[...calls,...tools].reduce((n,c)=>n+BigInt(c.committedMicroUsd),0n);
    const deposits=await tx.budgetLedger.aggregate({where:{runId:id,kind:'deposit'},_sum:{amount:true}});
    const held=micros(deposits._sum.amount??0);
    if(held===0n&&cancelled)return {pending:true,cancelled:true};
    if(spent>held)throw unavailable();
    // The ledger itself is the durable reconciliation queue. A lost reply
    // cannot double-draw a completed inference call on the next request.
    for(const call of calls){
     if(call.status==='not-dispatched')continue;
     const txRef='private-ai:'+call.id;
     if(await tx.budgetLedger.findFirst({where:{runId:id,kind:'spend',txRef}}))continue;
     const amount=usd(BigInt(call.committedMicroUsd));
     await tx.budgetLedger.create({data:{runId:id,kind:'spend',txRef,amount}});
    }
    for(const call of tools){
     if(call.status!=='complete'||call.committedMicroUsd===0n)continue;
     const txRef='private-tool:'+call.id;if(await tx.budgetLedger.findFirst({where:{runId:id,kind:'spend',txRef}}))continue;
     const amount=usd(BigInt(call.committedMicroUsd));
     await tx.budgetLedger.create({data:{runId:id,kind:'spend',txRef,amount}});
    }
    // Match the splitter's integer arithmetic once on the aggregate spend.
    // Rounding each tiny call independently can overstate its included share.
    const feeRef='private-fee:'+local.jobId;
    if(!await tx.budgetLedger.findFirst({where:{runId:id,kind:'fee',txRef:feeRef}}))await tx.budgetLedger.create({data:{runId:id,kind:'fee',txRef:feeRef,amount:usd(spent*100n/10000n)}});
    const manifest=await tx.privateClientObject.findFirst({where:{runId:id,kind:'manifest',removed:false},select:{digest:true}});
    if(!manifest||! /^[0-9a-f]{64}$/.test(manifest.digest))throw unavailable();
    const settlement={jobId:local.jobId,spent:spent.toString(),held:held.toString(),reportHash:'0x'+manifest.digest,client:run.walletAddress,waivedCalls:cancelled?unconfirmed.length:0,unconfirmedHeldMicroUsd:cancelled?unconfirmed.reduce((n,c)=>n+BigInt(c.committedMicroUsd),0n).toString():'0'};
    await tx.researchRun.update({where:{id},select:{id:true},data:{metadata:{...run.metadata,privateEscrow:{...local,settlement}}}});
    return settlement;
   },transactionOptions);
   if(outcome.pending||outcome.alreadySettled||outcome.cancelled)return outcome;
   // Only an opaque ciphertext commitment, not a plaintext report hash.
   const job=await readJob(outcome.jobId);
   const run=await owned(db,id,user);
   if(!chainMatches(job,run)||micros(job.budget)!==BigInt(outcome.held))throw unavailable();
   const chain=await completeAndSplit({jobId:outcome.jobId,reportHash:outcome.reportHash,spentUsd:Number(outcome.spent)/1000000,operator:settings.operator,client:outcome.client});
   if(chain?.splitConfirmed!==true)return {pending:true};
   await db.$transaction(async tx=>{
    await lock(tx,id);const fresh=await owned(tx,id,user);
    if(fresh.settledAt)return;
    const refund=BigInt(outcome.held)-BigInt(outcome.spent);
    if(refund>0n)await tx.budgetLedger.create({data:{runId:id,kind:'refund',amount:usd(refund),txRef:'private-escrow:'+outcome.jobId}});
    await tx.researchRun.update({where:{id},select:{id:true},data:{settledAt:new Date(),metadata:{...fresh.metadata,privateEscrow:{...fresh.metadata.privateEscrow,status:'Completed',splitConfirmed:true,completeTx:chain.completeTx??null,splitTx:chain.splitTx??null}}}});
   },transactionOptions);
   return {pending:false,spent:Number(outcome.spent)/1000000,refunded:Number(BigInt(outcome.held)-BigInt(outcome.spent))/1000000};
 }
 return {
  status,
  async prepare(id,user){
   const run=await owned(db,id,user);
   if(run.metadata?.privateCancellation||run.status!=='planned'||run.settledAt||run.metadata.privateEscrow||micros(run.budgetCap)<1n)throw unavailable();
   await requirePrivateFundingInputs(db,run);
   // The description is public on-chain. Never substitute a title or question.
   const result=await prepare({description:'Dr. Nib private run '+id});
   if(!exact(result,'core,description,evaluator,expiredAt,hook,splitter')||!same(result.core,settings.core)||!same(result.splitter,settings.splitter)||!same(result.evaluator,settings.evaluator)||result.hook!=='0x0000000000000000000000000000000000000000'||!Number.isSafeInteger(result.expiredAt)||result.expiredAt<=Date.now()/1000||result.description!=='Dr. Nib private run '+id)throw unavailable();
   return {runId:id,...result};
  },
  async register(id,user,jobId){
   if(typeof jobId!=='string'||!/^\d{1,78}$/.test(jobId))throw unavailable();
   const run=await owned(db,id,user),job=await readJob(jobId);
   if(job.status!=='Open'||!chainMatches(job,run))throw unavailable();
   await db.$transaction(async tx=>{
    await lock(tx,id);const fresh=await owned(tx,id,user);
    if(fresh.metadata?.privateCancellation||fresh.status!=='planned'||fresh.settledAt||fresh.metadata.privateEscrow)throw unavailable();
    if(await tx.privateActionReceipt.count({where:{runId:id,status:{in:['processing','uncertain']}}}))throw unavailable();
    await requirePrivateFundingInputs(tx,fresh);
    if(await tx.researchRun.findFirst({where:{metadata:{path:['privateEscrow','jobId'],equals:jobId}},select:{id:true}}))throw unavailable();
    await tx.researchRun.update({where:{id},select:{id:true},data:{metadata:{...fresh.metadata,privateEscrow:{jobId,core:settings.core,splitter:settings.splitter,status:'Open'}}}});
   },transactionOptions);
   return {jobId,core:settings.core,splitter:settings.splitter,status:'Open'};
  },
  settle,
  async cancel(id,user){await status(id,user).catch(()=>{});return settle(id,user,true);},
 };
}

export function createPrivateFundingRouter({funding,authenticate,allowedTenantId}){
 if(typeof allowedTenantId!=='string'||!allowedTenantId||typeof authenticate!=='function')throw unavailable();
 const router=Router();
 router.use((req,_res,next)=>/^\/runs\/[0-9a-f-]{36}\/escrow(?:\/(?:register|complete|cancel))?$/.test(req.path)?next():next('router'));
 router.use(authenticate);
 router.use((req,res,next)=>{res.set('Cache-Control','private, no-store');if(req.user?.id!==allowedTenantId)return res.status(404).json({code:'PRIVATE_RECORD_NOT_FOUND'});if(req.method!=='GET'&&(!req.is('application/json')||req.get('sec-fetch-site')==='cross-site'))return res.status(400).json({code:'PRIVATE_REQUEST_INVALID'});next()});
 for(const [method,path,operation]of [['get','/runs/:id/escrow','status'],['post','/runs/:id/escrow','prepare'],['post','/runs/:id/escrow/register','register'],['post','/runs/:id/escrow/complete','settle'],['post','/runs/:id/escrow/cancel','cancel']])router[method](path,async(req,res)=>{
  try{if(!UUID.test(req.params.id)||method==='post'&&!exact(req.body,operation==='register'?'jobId':''))return res.status(400).json({code:'PRIVATE_REQUEST_INVALID'});
   const value=await funding[operation](req.params.id,req.user,req.body?.jobId);return res.status(operation==='register'?201:200).json(value);
  }catch{return res.status(503).json({code:'PRIVATE_FUNDING_UNAVAILABLE'})}
 });
 return router;
}
