import {randomUUID} from 'node:crypto';
import {assertPrivateWorkerRun} from './private-worker-store.js';
import {openPrivatePayload,sealPrivatePayload} from './sealed-payload.js';

// Deliberately no import of ordinary recordEvent/publish/replayEvents: their
// unrestricted payloads and narration are unsafe for confidential runs.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAGES=new Set(['plan','search','fetch','data','score','review','write','verify','tips']);
const FIXED_TYPES=new Set(['step.started','step.finished','step.failed']);
const SEALED_FORMAT='private-worker-event-v1';
function denied(){const error=new Error('PRIVATE_EVENT_UNAVAILABLE');error.code='PRIVATE_EVENT_UNAVAILABLE';return error;}
function validFixed(event){
  if(!event||typeof event!=='object'||Array.isArray(event)||!UUID.test(event.runId)||
     !FIXED_TYPES.has(event.type)||!STAGES.has(event.kind))throw denied();
  if(event.type==='step.failed'){
    if(Object.keys(event).sort().join(',')!=='code,kind,runId,type'||event.code!=='PRIVATE_STAGE_FAILED')throw denied();
  }else if(Object.keys(event).sort().join(',')!=='kind,runId,type')throw denied();
  return {type:event.type,kind:event.kind,...(event.type==='step.failed'?{code:'PRIVATE_STAGE_FAILED'}:{})};
}
function publicPayload(row){
  const payload=row?.payload;
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||typeof row?.seq!=='number')throw denied();
  if(FIXED_TYPES.has(row.type)){
    if(Object.keys(payload).sort().join(',')!==(row.type==='step.failed'?'code,kind,type':'kind,type'))throw denied();
    const value=validFixed({runId:row.runId,...payload});
    if(value.type!==row.type)throw denied();
    return {...value,seq:row.seq};
  }
  if(row.type!=='private.sealed'||Object.keys(payload).sort().join(',')!=='encrypted,format,objectId,revision,type'||
     payload.type!=='private.sealed'||payload.encrypted!==true||payload.format!==SEALED_FORMAT||
     !UUID.test(payload.objectId)||payload.revision!==row.seq+1)throw denied();
  return {...payload,seq:row.seq};
}

/** Durable fixed/opaque event writes for the measured guest. Only event kind,
 * stage kind, fixed failure code, sequence and ciphertext pointer are public.
 * Streaming these events to a browser still needs a separate audited route. */
export function createPrivateWorkerEventPort({db,keyProvider,tenantId}={}){
  if(typeof db?.$transaction!=='function'||typeof db?.researchRun?.findUnique!=='function'||
     typeof db?.researchEvent?.create!=='function'||typeof db?.privateWorkerObject?.create!=='function'||
     typeof keyProvider!=='function'||typeof tenantId!=='string'||!tenantId||tenantId.length>128)throw denied();
  async function owner(tx,run){
    const fresh=await tx.researchRun.findUnique({where:{id:run.id}});
    if(run.userId!==tenantId)throw denied();
    return assertPrivateWorkerRun(fresh,run.id,tenantId);
  }
  async function lock(runId,fn){
    return db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${runId}))::text AS locked`;
      return fn(tx);
    },{maxWait:10000,timeout:15000});
  }
  async function nextSeq(tx,runId){
    const last=await tx.researchEvent.findFirst({where:{runId},orderBy:{seq:'desc'},select:{seq:true}});
    return (last?.seq??-1)+1;
  }
  async function eventKey(run){
    const key=await keyProvider({tenantId:run.userId,runId:run.id,purpose:'event'});
    if(!Buffer.isBuffer(key)||key.length!==32)throw denied();
    return key;
  }
  return Object.freeze({
    async emitFixed(event){
      try{
        const payload=validFixed(event);
        return await lock(event.runId,async tx=>{
          const run=await tx.researchRun.findUnique({where:{id:event.runId}});
          assertPrivateWorkerRun(run,event.runId,tenantId);
          const seq=await nextSeq(tx,event.runId);
          await tx.researchEvent.create({data:{runId:event.runId,seq,type:payload.type,payload}});
          return {seq,...payload};
        });
      }catch{throw denied();}
    },
    async emitSealed({run,content}){
      try{
        if(!run||!UUID.test(run.id)||typeof run.userId!=='string'||!run.userId)throw denied();
        await owner(db,run);
        const json=JSON.stringify(content);
        if(typeof json!=='string')throw denied();
        const bytes=Buffer.from(json),key=await eventKey(run);
        return await lock(run.id,async tx=>{
          await owner(tx,run);
          const seq=await nextSeq(tx,run.id),revision=seq+1,objectId=randomUUID();
          const envelope=sealPrivatePayload({key,context:{tenantId:run.userId,runId:run.id,objectId,revision,purpose:'event'},plaintext:bytes});
          await tx.privateWorkerObject.create({data:{id:randomUUID(),runId:run.id,kind:'event',objectId,revision,envelope}});
          const payload={type:'private.sealed',encrypted:true,format:SEALED_FORMAT,objectId,revision};
          await tx.researchEvent.create({data:{runId:run.id,seq,type:'private.sealed',payload}});
          return {seq,objectId};
        });
      }catch{throw denied();}
    },
    async replayPublic(run,{afterSeq=-1,limit=100}={}){
      try{
        if(!Number.isSafeInteger(afterSeq)||afterSeq<-1||!Number.isSafeInteger(limit)||limit<1||limit>500)throw denied();
        await owner(db,run);
        const rows=await db.researchEvent.findMany({where:{runId:run.id,seq:{gt:afterSeq}},orderBy:{seq:'asc'},take:limit});
        return rows.map(row=>{if(row.runId!==run.id)throw denied();return publicPayload(row);});
      }catch{throw denied();}
    },
    async openSealed(run,row){
      try{
        await owner(db,run);
        if(row?.runId!==run.id||!Number.isSafeInteger(row.seq)||row.seq<0)throw denied();
        const stored=await db.researchEvent.findUnique({where:{runId_seq:{runId:run.id,seq:row.seq}}});
        if(!stored)throw denied();
        const pointer=publicPayload(stored);
        if(pointer.type!=='private.sealed')throw denied();
        const object=await db.privateWorkerObject.findUnique({where:{runId_kind_objectId_revision:{runId:run.id,kind:'event',objectId:pointer.objectId,revision:pointer.revision}}});
        if(!object||object.runId!==run.id||object.kind!=='event'||object.objectId!==pointer.objectId||object.revision!==pointer.revision)throw denied();
        const bytes=openPrivatePayload({key:await eventKey(run),expectedContext:{tenantId:run.userId,runId:run.id,objectId:pointer.objectId,revision:pointer.revision,purpose:'event'},envelope:object.envelope});
        return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      }catch{throw denied();}
    },
  });
}
