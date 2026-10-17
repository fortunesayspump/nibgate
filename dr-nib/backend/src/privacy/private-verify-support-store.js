import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {assertPrivateWorkerRun} from './private-worker-store.js';
import {openPrivatePayload,sealPrivatePayload} from './sealed-payload.js';
import {assertPrivateSupportOutput,privateSupportSnapshot} from './private-verify-support-core.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STEP='verify-support';
const POINTER='private-worker-object-v1';
const LEASE_MS=5*60*1000;
function fail(code='PRIVATE_SUPPORT_UNAVAILABLE'){
  const error=new Error(code);error.code=code;return error;
}
function claimId(runId,snapshotDigest,index){
  const bytes=createHash('sha256').update(`drnib-private-support-claim-v1\0${runId}\0${snapshotDigest}\0${index}`).digest().subarray(0,16);
  bytes[6]=(bytes[6]&15)|128;bytes[8]=(bytes[8]&63)|128;
  const value=bytes.toString('hex');
  return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;
}
function pointer(row){
  const value=row?.output;
  if(!value||typeof value!=='object'||Array.isArray(value)||
     Object.keys(value).sort().join(',')!=='encrypted,format,objectId,revision'||
     value.encrypted!==true||value.format!==POINTER||value.objectId!==row.id||value.revision!==row.attempt)throw fail();
}
function bytes(value){
  const json=JSON.stringify(value);
  if(typeof json!=='string')throw fail();
  return Buffer.from(json);
}
function parse(value){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(value));}

/** A later, unpublished measured-guest companion. It deliberately does not
 * use ResearchClaim.text/passages, ordinary eventlog, provider or JEV. A
 * completed support checkpoint and every individual sealed claim plus commit
 * manifest are bound to one advisory transaction. */
export function createPrivateVerifySupportStore({db,keyProvider,tenantId,now=Date.now}={}){
  if(typeof db?.$transaction!=='function'||typeof db?.researchRun?.findUnique!=='function'||
     typeof db?.researchStep?.create!=='function'||typeof db?.privateWorkerObject?.create!=='function'||
     typeof db?.researchClaim?.count!=='function'||typeof db?.researchSource?.count!=='function'||
     typeof keyProvider!=='function'||typeof tenantId!=='string'||!tenantId||tenantId.length>128||
     typeof now!=='function')throw fail();
  async function owner(tx,run){
    if(!run||!UUID.test(run.id)||run.userId!==tenantId)throw fail();
    const fresh=await tx.researchRun.findUnique({where:{id:run.id}});
    return assertPrivateWorkerRun(fresh,run.id,tenantId);
  }
  async function lock(runId,action){
    return db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${runId}))::text AS locked`;
      return action(tx);
    },{maxWait:10000,timeout:15000});
  }
  async function key(run,purpose){
    const material=await keyProvider({tenantId:run.userId,runId:run.id,purpose});
    if(!Buffer.isBuffer(material)||material.length!==32)throw fail();
    return material;
  }
  async function open(run,row,kind,objectId,revision){
    if(!row||row.runId!==run.id||row.kind!==kind||row.objectId!==objectId||row.revision!==revision)throw fail();
    return parse(openPrivatePayload({key:await key(run,kind==='source'?'worker-source':kind),
      expectedContext:{tenantId:run.userId,runId:run.id,objectId,revision,
        purpose:kind==='source'?'worker-source':kind},envelope:row.envelope}));
  }
  async function seal(run,kind,objectId,revision,value){
    if(!UUID.test(objectId)||!Number.isSafeInteger(revision)||revision<1)throw fail();
    return sealPrivatePayload({key:await key(run,kind),
      context:{tenantId:run.userId,runId:run.id,objectId,revision,purpose:kind},plaintext:bytes(value)});
  }
  const lookup=(tx,runId,kind,objectId,revision)=>
    tx.privateWorkerObject.findUnique({where:{runId_kind_objectId_revision:{runId,kind,objectId,revision}}});
  async function snapshot(tx,run){
    const current=await owner(tx,run);
    if(current.status!=='running'||current.versions!==1||current.versions!==run.versions)throw fail('PRIVATE_SUPPORT_CONFLICT');
    if(await tx.researchClaim.count({where:{runId:run.id}})||
       await tx.researchSource.count({where:{runId:run.id}}))throw fail('PRIVATE_SUPPORT_CONFLICT');
    const stateRow=await tx.privateWorkerObject.findFirst({where:{runId:run.id,kind:'state',objectId:run.id},orderBy:{revision:'desc'}});
    const originalRow=await lookup(tx,run.id,'state',run.id,1);
    const sourceRows=await tx.privateWorkerObject.findMany({where:{runId:run.id,kind:'source'}});
    const reportRow=await lookup(tx,run.id,'report',run.id,1);
    const extractionSteps=await tx.researchStep.findMany({where:{runId:run.id,kind:'verify'}});
    if(!stateRow||!originalRow||sourceRows.length!==1||sourceRows[0].revision!==1||
       !reportRow||extractionSteps.length!==1||extractionSteps[0].status!=='done'||
       extractionSteps[0].attempt!==1)throw fail('PRIVATE_SUPPORT_CONFLICT');
    const [sourceRow]=sourceRows,[extractionStep]=extractionSteps;
    pointer(extractionStep);
    const extractionRow=await lookup(tx,run.id,'step',extractionStep.id,1);
    const [state,original,source,report,extraction]=await Promise.all([
      open(run,stateRow,'state',run.id,stateRow.revision),open(run,originalRow,'state',run.id,1),
      open(run,sourceRow,'source',sourceRow.objectId,1),open(run,reportRow,'report',run.id,1),
      open(run,extractionRow,'step',extractionStep.id,1),
    ]);
    if(typeof original?.resultRecipientPublicKey!=='string'||
       state?.resultRecipientPublicKey!==original.resultRecipientPublicKey)throw fail('PRIVATE_SUPPORT_CONFLICT');
    const snapshotDigest=privateSupportSnapshot({run:current,stateRow,state,sourceRow,source,report,extraction});
    return {snapshotDigest,source,report,extraction};
  }
  async function doneOutput(tx,run,row,current){
    pointer(row);
    const sealed=await lookup(tx,run.id,'step',row.id,1);
    const output=await open(run,sealed,'step',row.id,1);
    assertPrivateSupportOutput(output,{snapshotDigest:current.snapshotDigest,
      extraction:current.extraction,source:current.source,report:current.report});
    return output;
  }
  return Object.freeze({
    async loadRun(runId){
      try{
        if(!UUID.test(runId))throw fail();
        const row=await db.researchRun.findUnique({where:{id:runId}});
        return assertPrivateWorkerRun(row,runId,tenantId);
      }catch{throw fail();}
    },
    async begin(run){
      try{return await lock(run.id,async tx=>{
        const current=await snapshot(tx,run);
        const rows=await tx.researchStep.findMany({where:{runId:run.id,kind:STEP}});
        if(rows.length>1)throw fail('PRIVATE_SUPPORT_CONFLICT');
        if(rows.length){
          if(rows[0].status!=='done')return {state:'uncertain'};
          return {state:'done',output:await doneOutput(tx,run,rows[0],current)};
        }
        const active=await tx.researchStep.findMany({where:{runId:run.id,status:'active'}});
        if(active.some(row=>row.kind!=='private-execute'))return {state:'uncertain'};
        const lease=randomUUID();
        await tx.researchStep.create({data:{id:lease,runId:run.id,kind:STEP,status:'active',attempt:1,
          input:null,output:null,workerId:lease,startedAt:new Date(now()),heartbeatAt:new Date(now()),
          leaseUntil:new Date(now()+LEASE_MS)}});
        return {state:'claimed',lease,snapshot:current};
      });}catch(error){if(error?.code==='PRIVATE_SUPPORT_CONFLICT')throw error;throw fail();}
    },
    async assertFresh(run,expectedDigest){
      try{
        if(typeof expectedDigest!=='string'||!/^[0-9a-f]{64}$/.test(expectedDigest))throw fail();
        const current=await snapshot(db,run);
        if(current.snapshotDigest!==expectedDigest)throw fail('PRIVATE_SUPPORT_CONFLICT');
        return true;
      }catch(error){if(error?.code==='PRIVATE_SUPPORT_CONFLICT')throw error;throw fail();}
    },
    async finish(run,{lease,output}){
      try{
        if(!UUID.test(lease))throw fail();
        const before=await snapshot(db,run);
        assertPrivateSupportOutput(output,{snapshotDigest:before.snapshotDigest,
          extraction:before.extraction,source:before.source,report:before.report});
        const envelope=await seal(run,'step',lease,1,output);
        return await lock(run.id,async tx=>{
          const current=await snapshot(tx,run);
          if(current.snapshotDigest!==before.snapshotDigest)throw fail('PRIVATE_SUPPORT_CONFLICT');
          const row=await tx.researchStep.findUnique({where:{id:lease}});
          if(!row||row.runId!==run.id||row.kind!==STEP||row.attempt!==1||
             row.status!=='active'||row.workerId!==lease)throw fail('PRIVATE_SUPPORT_CONFLICT');
          await tx.privateWorkerObject.create({data:{id:randomUUID(),runId:run.id,kind:'step',
            objectId:lease,revision:1,envelope}});
          await tx.researchStep.update({where:{id:lease},data:{status:'done',
            output:{encrypted:true,format:POINTER,objectId:lease,revision:1},
            endedAt:new Date(now()),workerId:null,leaseUntil:null,heartbeatAt:null}});
          return {checkpointed:true};
        });
      }catch(error){if(error?.code==='PRIVATE_SUPPORT_CONFLICT')throw error;throw fail();}
    },
    async fail(run,{lease}){
      try{
        if(!UUID.test(lease))throw fail();
        return await lock(run.id,async tx=>{
          await owner(tx,run);
          const row=await tx.researchStep.findUnique({where:{id:lease}});
          if(!row||row.runId!==run.id||row.kind!==STEP||row.status!=='active'||row.workerId!==lease)return false;
          await tx.researchStep.update({where:{id:lease},data:{status:'failed',
            output:{code:'PRIVATE_SUPPORT_FAILED'},workerId:null,leaseUntil:null,heartbeatAt:null,
            endedAt:new Date(now())}});
          return true;
        });
      }catch{throw fail();}
    },
    async commitClaims(run){
      try{
        // Cheap classification check before any measured key release; repeat
        // owner and all content bindings inside the atomic advisory lock.
        await owner(db,run);
        return await lock(run.id,async tx=>{
          const current=await snapshot(tx,run);
          const rows=await tx.researchStep.findMany({where:{runId:run.id,kind:STEP}});
          if(rows.length!==1||rows[0].status!=='done'||rows[0].attempt!==1)throw fail('PRIVATE_SUPPORT_CONFLICT');
          const row=rows[0],output=await doneOutput(tx,run,row,current);
          const ids=output.claims.map((_,index)=>claimId(run.id,current.snapshotDigest,index));
          const manifest={scope:'support-claim-commit',snapshotDigest:current.snapshotDigest,claimIds:ids};
          const marker=await lookup(tx,run.id,'step',row.id,2);
          const existing=await tx.privateWorkerObject.findMany({where:{runId:run.id,kind:'claim'}});
          if(marker){
            if(!isDeepStrictEqual(await open(run,marker,'step',row.id,2),manifest)||existing.length!==ids.length)
              throw fail('PRIVATE_SUPPORT_CONFLICT');
            for(let index=0;index<ids.length;index++){
              const claim=existing.find(item=>item.objectId===ids[index]&&item.revision===1);
              if(!claim||!isDeepStrictEqual(await open(run,claim,'claim',ids[index],1),output.claims[index]))
                throw fail('PRIVATE_SUPPORT_CONFLICT');
            }
            return {committed:true,claims:ids.length,supported:output.supported,unknown:output.unknown,
              replayed:true,verified:false};
          }
          if(existing.length)throw fail('PRIVATE_SUPPORT_CONFLICT');
          for(let index=0;index<ids.length;index++){
            const envelope=await seal(run,'claim',ids[index],1,output.claims[index]);
            await tx.privateWorkerObject.create({data:{id:randomUUID(),runId:run.id,kind:'claim',
              objectId:ids[index],revision:1,envelope}});
          }
          const envelope=await seal(run,'step',row.id,2,manifest);
          await tx.privateWorkerObject.create({data:{id:randomUUID(),runId:run.id,kind:'step',
            objectId:row.id,revision:2,envelope}});
          return {committed:true,claims:ids.length,supported:output.supported,unknown:output.unknown,
            replayed:false,verified:false};
        });
      }catch(error){if(error?.code==='PRIVATE_SUPPORT_CONFLICT')throw error;throw fail();}
    },
  });
}
