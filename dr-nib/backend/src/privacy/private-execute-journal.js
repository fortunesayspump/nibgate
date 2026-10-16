import {createHash} from 'node:crypto';
import {isConfidentialRun} from './guard.js';
import {validateHpkeSourceEnvelope,validateHpkeReportEnvelope} from './source-hpke.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KIND='private-execute';
const FORMAT='private-execute-v1';
const FULL_FORMAT='private-execute-full-v1';
const RECEIPT='private-execute-receipt-v1';
const LEASE_MS=5*60*1000;
function denied(code='PRIVATE_JOB_UNAVAILABLE'){const e=new Error(code);e.code=code;return e}
function owner(run,tenantId,runId){
  if(!isConfidentialRun(run)||!UUID.test(runId)||run.id!==runId||
    typeof tenantId!=='string'||!tenantId||run.userId!==tenantId||run.deletedAt!=null)throw denied();
}
function receiptId(receipt){
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||
    Object.keys(receipt).sort().join(',')!=='encrypted,id,version'||
    receipt.encrypted!==true||receipt.version!==1||typeof receipt.id!=='string'||!UUID.test(receipt.id))throw denied();
  return receipt.id;
}
function entry(row){
  const input=row?.input;
  if(!row||row.kind!==KIND||row.attempt!==1||!input||
    Object.keys(input).sort().join(',')!=='encrypted,format,requestDigest'||
    input.encrypted!==true||![FORMAT,FULL_FORMAT].includes(input.format)||
    typeof input.requestDigest!=='string'||!/^[0-9a-f]{64}$/.test(input.requestDigest))throw denied();
  return input.requestDigest;
}
function done(row){
  const out=row?.output;
  if(row?.status!=='done'||!out||Object.keys(out).sort().join(',')!=='encrypted,format,reportId'||
    out.encrypted!==true||out.format!==RECEIPT||typeof out.reportId!=='string'||!UUID.test(out.reportId))throw denied();
  return {state:'complete',reportId:out.reportId};
}
function liveState(row,now){
  if(row.status==='done')return done(row);
  if(row.status!=='active')return {state:'uncertain'};
  return {state:row.leaseUntil instanceof Date && row.leaseUntil.getTime()>now ? 'processing':'uncertain'};
}

/** Digest only the validated, exact encrypted request fields in fixed order.
 * This is an idempotency fingerprint, not a signature or plaintext proof. */
export function privateExecuteDigest(sourceEnvelope,{tenantId,runId,keyEnvelope}={}){
  try{
    const c=validateHpkeSourceEnvelope(sourceEnvelope,{tenantId,runId});
    const normalized={version:2,algorithm:sourceEnvelope.algorithm,
      context:{tenantId:c.tenantId,runId:c.runId,objectId:c.objectId,revision:c.revision,purpose:c.purpose,recipientId:c.recipientId},
      encapsulatedSecret:sourceEnvelope.encapsulatedSecret,ciphertext:sourceEnvelope.ciphertext};
    if(keyEnvelope===undefined)
      return createHash('sha256').update('drnib-private-execute-v1\0').update(JSON.stringify(normalized)).digest('hex');
    const k=validateHpkeSourceEnvelope(keyEnvelope,{tenantId,runId});
    if(k.recipientId!==c.recipientId||k.objectId===c.objectId)throw denied();
    const keyNormalized={version:2,algorithm:keyEnvelope.algorithm,
      context:{tenantId:k.tenantId,runId:k.runId,objectId:k.objectId,revision:k.revision,purpose:k.purpose,recipientId:k.recipientId},
      encapsulatedSecret:keyEnvelope.encapsulatedSecret,ciphertext:keyEnvelope.ciphertext};
    return createHash('sha256').update('drnib-private-execute-full-v1\0')
      .update(JSON.stringify({source:normalized,key:keyNormalized})).digest('hex');
  }catch{throw denied('PRIVATE_JOB_INVALID')}
}

/** Atomic run-scoped journal for a future async guest execute endpoint. It
 * never retries an uncertain model call, preventing duplicate inference charges.
 * `withRunLock` must use the existing Postgres advisory transaction lock. */
export function createPrivateExecuteJournal({withRunLock,now=Date.now}){
  if(typeof withRunLock!=='function'||typeof now!=='function')throw denied();
  const lock=(runId,fn)=>withRunLock(runId,fn);
  async function getRun(tx,tenantId,runId){
    const run=await tx.researchRun.findUnique({where:{id:runId}});
    owner(run,tenantId,runId);
    return run;
  }
  const getStep=(tx,runId)=>tx.researchStep.findFirst({where:{runId,kind:KIND},orderBy:{createdAt:'asc'}});
  async function recoveredReport(tx,tenantId,runId){
    const row=await tx.researchReport.findFirst({where:{runId,version:1}});
    if(!row)return null;
    try{
      const stored=JSON.parse(row.markdown);
      if(!stored||Object.keys(stored).sort().join(',')!=='encrypted,envelope,format'||
        stored.encrypted!==true||stored.format!=='hpke-report-v2')throw denied();
      validateHpkeReportEnvelope(stored.envelope,{tenantId,runId});
      if(stored.envelope.context.objectId!==row.id)return null;
      return row.id;
    }catch{return null}
  }
  async function reconcile(tx,row,tenantId,runId,run){
    if(row.status==='done'){
      if(row.input.format===FULL_FORMAT&&run.status!=='complete')throw denied();
      return done(row);
    }
    if(row.status!=='active')return {state:'uncertain'};
    const reportId=row.input.format!==FULL_FORMAT||run.status==='complete'
      ? await recoveredReport(tx,tenantId,runId):null;
    if(reportId){
      await tx.researchStep.update({where:{id:row.id},data:{status:'done',output:{encrypted:true,format:RECEIPT,reportId},endedAt:new Date(now())}});
      return {state:'complete',reportId};
    }
    return liveState(row,now());
  }
  return Object.freeze({
    async claim({tenantId,runId,sourceEnvelope,keyEnvelope}){
      const requestDigest=privateExecuteDigest(sourceEnvelope,{tenantId,runId,keyEnvelope});
      try{return await lock(runId,async tx=>{
        const run=await getRun(tx,tenantId,runId);
        const row=await getStep(tx,runId);
        if(row){
          if(entry(row)!==requestDigest)throw denied('PRIVATE_JOB_CONFLICT');
          if((row.input.format===FULL_FORMAT)!==(keyEnvelope!==undefined))throw denied('PRIVATE_JOB_CONFLICT');
          return reconcile(tx,row,tenantId,runId,run);
        }
        if(run.status!=='draft')throw denied();
        // A report predating the claim cannot be attributed to this request.
        if(await tx.researchReport.findFirst({where:{runId,version:1}}))throw denied('PRIVATE_JOB_CONFLICT');
        const created=await tx.researchStep.create({data:{runId,kind:KIND,status:'active',attempt:1,
          input:{encrypted:true,format:keyEnvelope===undefined?FORMAT:FULL_FORMAT,requestDigest},output:null,
          startedAt:new Date(now()),leaseUntil:new Date(now()+LEASE_MS)}});
        return {state:'start',jobId:created.id};
      });}catch(e){if(e?.code==='PRIVATE_JOB_CONFLICT')throw e;throw denied()}
    },
    async complete({tenantId,runId,sourceEnvelope,keyEnvelope,receipt}){
      const requestDigest=privateExecuteDigest(sourceEnvelope,{tenantId,runId,keyEnvelope});
      const reportId=receiptId(receipt);
      try{return await lock(runId,async tx=>{
        const run=await getRun(tx,tenantId,runId);
        const row=await getStep(tx,runId);
        if(!row||entry(row)!==requestDigest)throw denied('PRIVATE_JOB_CONFLICT');
        if((row.input.format===FULL_FORMAT)!==(keyEnvelope!==undefined))throw denied('PRIVATE_JOB_CONFLICT');
        if(keyEnvelope!==undefined&&(run.status!=='complete'||reportId!==runId))throw denied();
        if(row.status==='done'){
          const existing=done(row);
          if(existing.reportId!==reportId)throw denied('PRIVATE_JOB_CONFLICT');
          return existing;
        }
        if(row.status!=='active'||await recoveredReport(tx,tenantId,runId)!==reportId)throw denied();
        await tx.researchStep.update({where:{id:row.id},data:{status:'done',output:{encrypted:true,format:RECEIPT,reportId},endedAt:new Date(now())}});
        return {state:'complete',reportId};
      });}catch(e){if(e?.code==='PRIVATE_JOB_CONFLICT')throw e;throw denied()}
    },
    async status({tenantId,runId}){
      try{return await lock(runId,async tx=>{
        const run=await getRun(tx,tenantId,runId);
        const row=await getStep(tx,runId);
        if(!row)return {state:'not_started'};
        entry(row);
        return reconcile(tx,row,tenantId,runId,run);
      });}catch{throw denied()}
    },
  });
}
