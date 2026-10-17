import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {isConfidentialRun} from './guard.js';
import {openPrivatePayload,sealPrivatePayload} from './sealed-payload.js';
import {resolveLength} from '../length.js';
import {recipientIdForPublicKey,validateHpkeReportEnvelope} from './source-hpke.js';

// This module is loaded by the measured guest only. No conventional worker,
// eventlog, model, JEV, memory, agent lessons, file or payment imports.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAGES=new Set(['plan','search','fetch','data','score','review','write','verify','tips']);
const OBJECTS=new Set(['state','source','claim','decision','report','step']);
const POINTER='private-worker-object-v1';
const ERROR='PRIVATE_STORE_UNAVAILABLE';
const LEASE_MS=5*60*1000;
const purpose=kind=>kind==='source'?'worker-source':kind;

function fail(code=ERROR){const error=new Error(code);error.code=code;return error;}
function fixedRun(run,runId,tenantId){
  const metadata=run?.metadata;
  if(!isConfidentialRun(run)||!UUID.test(run?.id)||run.id!==runId||
     typeof run.userId!=='string'||!run.userId||run.userId!==tenantId||
     !metadata||Object.keys(metadata).sort().join(',')!=='privacyMode,schemaVersion'||metadata.schemaVersion!==1||
     run.deletedAt!=null||
     run.title!=null||run.description!=null||run.plan!=null||run.pendingQuestion!=null||run.pendingGuidance!=null||
     !run.brief||Object.keys(run.brief).join(',')!=='encrypted'||run.brief.encrypted!==true)
    throw fail('PRIVATE_RUN_UNAVAILABLE');
  return {id:run.id,userId:run.userId,metadata:{privacyMode:'confidential',schemaVersion:1},
    status:run.status,versions:run.versions,depth:run.depth};
}
export {fixedRun as assertPrivateWorkerRun};
function ids(run){
  if(!run||!UUID.test(run.id)||typeof run.userId!=='string'||!run.userId)throw fail('PRIVATE_RUN_UNAVAILABLE');
  return {runId:run.id,tenantId:run.userId};
}
function requireRevision(n){if(!Number.isSafeInteger(n)||n<1)throw fail();return n;}
function requireObjectId(id){if(typeof id!=='string'||!UUID.test(id))throw fail();return id;}
function requireKind(kind){if(!OBJECTS.has(kind))throw fail();return kind;}
function requireStage(kind){if(!STAGES.has(kind))throw fail('PRIVATE_STAGE_UNAVAILABLE');return kind;}
function stageVersion(kind,attempt){return ['plan','write','tips','verify'].includes(kind)?attempt:Math.floor(attempt/1000);}
function pointer(row){
  const out=row?.output;
  if(!out||typeof out!=='object'||Array.isArray(out)||
     Object.keys(out).sort().join(',')!=='encrypted,format,objectId,revision'||
     out.encrypted!==true||out.format!==POINTER||out.objectId!==row.id||out.revision!==row.attempt)
    throw fail('PRIVATE_STAGE_UNAVAILABLE');
  return out;
}
function safeJson(value){
  const json=JSON.stringify(value);
  if(typeof json!=='string')throw fail();
  return Buffer.from(json);
}
function parsed(bytes){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}

/** Prisma-backed sealed object and stage adapter. This is deliberately separate
 * from the bounded source-only runner until all stage/tool/event call sites are
 * migrated. keyProvider must be measured-guest-only. An active-job in-memory
 * client-held key is acceptable; after restart the browser must rewrap the
 * same key to a fresh attested session or the run remains unreadable. */
export function createPrivateWorkerStore({db,keyProvider,tenantId,now=Date.now}={}){
  if(typeof db?.$transaction!=='function'||typeof db?.researchRun?.findUnique!=='function'||
     typeof db?.privateWorkerObject?.create!=='function'||typeof db?.researchStep?.create!=='function'||
     typeof keyProvider!=='function'||typeof now!=='function'||typeof tenantId!=='string'||!tenantId||tenantId.length>128)throw fail();

  async function owner(tx,run){
    const {runId}=ids(run);
    if(run.userId!==tenantId)throw fail('PRIVATE_RUN_UNAVAILABLE');
    const fresh=await tx.researchRun.findUnique({where:{id:runId}});
    return fixedRun(fresh,runId,tenantId);
  }
  async function lock(runId,fn){
    return db.$transaction(async tx=>{
      // Same transaction-scoped Postgres lock as the existing worker. It makes
      // claim, CAS state revision and completion atomic across CVM processes.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${runId}))::text AS locked`;
      return fn(tx);
    },{maxWait:10000,timeout:15000});
  }
  async function key(run,kind){
    const material=await keyProvider({...ids(run),purpose:purpose(kind)});
    if(!Buffer.isBuffer(material)||material.length!==32)throw fail('PRIVATE_KEY_UNAVAILABLE');
    return material;
  }
  async function seal(run,kind,objectId,revision,content){
    requireKind(kind);requireObjectId(objectId);requireRevision(revision);
    return sealPrivatePayload({key:await key(run,kind),context:{...ids(run),objectId,revision,purpose:purpose(kind)},plaintext:safeJson(content)});
  }
  async function open(run,row,kind,objectId,revision){
    if(!row||row.runId!==run.id||row.kind!==kind||row.objectId!==objectId||row.revision!==revision)
      throw fail();
    return parsed(openPrivatePayload({key:await key(run,kind),expectedContext:{...ids(run),objectId,revision,purpose:purpose(kind)},envelope:row.envelope}));
  }
  function lookup(tx,runId,kind,objectId,revision){
    return tx.privateWorkerObject.findUnique({where:{runId_kind_objectId_revision:{runId,kind,objectId,revision}}});
  }
  async function put(run,kind,objectId,revision,content){
    try{
      await owner(db,run);
      const envelope=await seal(run,kind,objectId,revision,content);
      return await lock(run.id,async tx=>{
        await owner(tx,run);
        const existing=await lookup(tx,run.id,kind,objectId,revision);
        if(existing)throw fail('PRIVATE_OBJECT_CONFLICT');
        await tx.privateWorkerObject.create({data:{id:randomUUID(),runId:run.id,kind,objectId,revision,envelope}});
        return {objectId,revision};
      });
    }catch(error){if(error?.code==='PRIVATE_OBJECT_CONFLICT')throw error;throw fail();}
  }
  async function get(run,kind,objectId,revision){
    try{
      requireKind(kind);requireObjectId(objectId);requireRevision(revision);
      await owner(db,run);
      const row=await lookup(db,run.id,kind,objectId,revision);
      return row ? await open(run,row,kind,objectId,revision) : null;
    }catch{throw fail();}
  }
  async function list(run,kind,{latest=false}={}){
    try{
      requireKind(kind);await owner(db,run);
      const rows=await db.privateWorkerObject.findMany({where:{runId:run.id,kind},orderBy:[{objectId:'asc'},{revision:'desc'}]});
      const seen=new Set(),out=[];
      for(const row of rows){
        if(latest&&seen.has(row.objectId))continue;
        seen.add(row.objectId);
        out.push({objectId:row.objectId,revision:row.revision,value:await open(run,row,kind,row.objectId,row.revision)});
      }
      return out;
    }catch{throw fail();}
  }
  return Object.freeze({
    async loadRun(runId){
      try{
        requireObjectId(runId);
        const row=await db.researchRun.findUnique({where:{id:runId}});
        return fixedRun(row,runId,tenantId);
      }catch{throw fail('PRIVATE_RUN_UNAVAILABLE');}
    },
    async initializeRunStateAndPlanning(run,{state,sources}={}){
      try{
        if(!state||typeof state!=='object'||Array.isArray(state)||!state.brief||
           typeof state.brief.topic!=='string'||state.brief.topic.trim().length<3||state.brief.topic.length>1000||
           state.brief.liveWeb!==false||state.plan!=null||state.pendingGuidance!=null||
           !Array.isArray(sources)||sources.length!==1)throw fail();
        const [{sourceId,source}]=sources;
        requireObjectId(sourceId);
        if(!source||typeof source!=='object'||Array.isArray(source)||source.provider!=='user-upload'||
           typeof source.url!=='string'||!source.url||typeof source.title!=='string'||!source.title||
           typeof source.text!=='string'||!source.text.trim()||source.text.length>100000)throw fail();
        // Preflight classification before invoking the measured key provider;
        // all persisted changes are then one owner-rechecked transaction.
        await owner(db,run);
        const canonicalState=JSON.parse(safeJson(state));
        const canonicalSource=JSON.parse(safeJson(source));
        const stateEnvelope=await seal(run,'state',run.id,1,canonicalState);
        const sourceEnvelope=await seal(run,'source',sourceId,1,canonicalSource);
        return await lock(run.id,async tx=>{
          const current=await owner(tx,run);
          const existingState=await lookup(tx,run.id,'state',run.id,1);
          const existingSource=await lookup(tx,run.id,'source',sourceId,1);
          if(current.status==='draft'){
            if(existingState||existingSource)throw fail('PRIVATE_STATE_CONFLICT');
            await tx.privateWorkerObject.create({data:{id:randomUUID(),runId:run.id,kind:'state',objectId:run.id,revision:1,envelope:stateEnvelope}});
            await tx.privateWorkerObject.create({data:{id:randomUUID(),runId:run.id,kind:'source',objectId:sourceId,revision:1,envelope:sourceEnvelope}});
            await tx.researchRun.update({where:{id:run.id},data:{status:'planning'}});
            return {revision:1,status:'planning',replayed:false};
          }
          // An identical retry after a lost response is safe, even if later
          // stages advanced. A different brief/source never takes over a run.
          if(!existingState||!existingSource||
             !isDeepStrictEqual(await open(run,existingState,'state',run.id,1),canonicalState)||
             !isDeepStrictEqual(await open(run,existingSource,'source',sourceId,1),canonicalSource))
            throw fail('PRIVATE_STATE_CONFLICT');
          return {revision:1,status:current.status,replayed:true};
        });
      }catch(error){if(error?.code==='PRIVATE_STATE_CONFLICT')throw error;throw fail();}
    },
    async putRunState(run,{expectedRevision,state}){
      try{
        if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||!state||typeof state!=='object'||Array.isArray(state))throw fail();
        await owner(db,run);
        const revision=expectedRevision+1,objectId=run.id,kind='state';
        const envelope=await seal(run,kind,objectId,revision,state);
        return await lock(run.id,async tx=>{
          await owner(tx,run);
          const previous=await tx.privateWorkerObject.findFirst({where:{runId:run.id,kind,objectId},orderBy:{revision:'desc'}});
          if((previous?.revision||0)!==expectedRevision)throw fail('PRIVATE_STATE_CONFLICT');
          await tx.privateWorkerObject.create({data:{id:randomUUID(),runId:run.id,kind,objectId,revision,envelope}});
          return {revision};
        });
      }catch(error){if(error?.code==='PRIVATE_STATE_CONFLICT')throw error;throw fail();}
    },
    async getRunState(run){
      try{
        await owner(db,run);
        const row=await db.privateWorkerObject.findFirst({where:{runId:run.id,kind:'state',objectId:run.id},orderBy:{revision:'desc'}});
        return row?{revision:row.revision,state:await open(run,row,'state',run.id,row.revision)}:null;
      }catch{throw fail();}
    },
    async commitPlan(run,{attempt,expectedRevision,nextState}){
      try{
        requireRevision(attempt);requireRevision(expectedRevision);
        if(!nextState||typeof nextState!=='object'||Array.isArray(nextState)||!nextState.plan||
           nextState.plan.stageAttempt!==attempt)throw fail();
        await owner(db,run);
        const revision=expectedRevision+1,objectId=run.id,kind='state';
        const envelope=await seal(run,kind,objectId,revision,nextState);
        return await lock(run.id,async tx=>{
          const current=await owner(tx,run);
          if(current.status!=='planning'||current.versions!==attempt)throw fail('PRIVATE_STATE_CONFLICT');
          const prior=await tx.privateWorkerObject.findFirst({where:{runId:run.id,kind,objectId},orderBy:{revision:'desc'}});
          if(prior?.revision!==expectedRevision)throw fail('PRIVATE_STATE_CONFLICT');
          const steps=await tx.researchStep.findMany({where:{runId:run.id,kind:'plan',attempt,status:'done'}});
          if(steps.length!==1)throw fail('PRIVATE_STATE_CONFLICT');
          const [step]=steps;
          pointer(step);
          const sealedStep=await lookup(tx,run.id,'step',step.id,attempt);
          const output=await open(run,sealedStep,'step',step.id,attempt);
          const {stageAttempt,...plan}=nextState.plan;
          if(!isDeepStrictEqual(output,plan))throw fail('PRIVATE_STATE_CONFLICT');
          await tx.privateWorkerObject.create({data:{id:randomUUID(),runId:run.id,kind,objectId,revision,envelope}});
          await tx.researchRun.update({where:{id:run.id},data:{status:'planned'}});
          return {revision,status:'planned'};
        });
      }catch(error){if(error?.code==='PRIVATE_STATE_CONFLICT')throw error;throw fail();}
    },
    async startSourceOnlyWrite(run){
      try{
        await owner(db,run);
        return await lock(run.id,async tx=>{
          const current=await owner(tx,run);
          if(!Number.isSafeInteger(current.versions)||current.versions<1||
             current.versions!==run.versions||!['planned','running'].includes(current.status))
            throw fail('PRIVATE_WRITE_CONFLICT');
          const stateRow=await tx.privateWorkerObject.findFirst({where:{runId:run.id,kind:'state',objectId:run.id},orderBy:{revision:'desc'}});
          if(!stateRow)throw fail('PRIVATE_WRITE_CONFLICT');
          const state=await open(run,stateRow,'state',run.id,stateRow.revision);
          const brief=state?.brief;
          const originalRow=await lookup(tx,run.id,'state',run.id,1);
          if(!originalRow)throw fail('PRIVATE_WRITE_CONFLICT');
          const original=await open(run,originalRow,'state',run.id,1);
          const recipient=state?.resultRecipientPublicKey;
          if(typeof recipient!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(recipient)||
             Buffer.from(recipient,'base64').length!==65||Buffer.from(recipient,'base64')[0]!==4||
             Buffer.from(recipient,'base64').toString('base64')!==recipient||
             recipient!==original?.resultRecipientPublicKey)throw fail('PRIVATE_WRITE_CONFLICT');
          if(!brief||typeof brief.topic!=='string'||brief.topic.trim().length<3||brief.liveWeb!==false||
             resolveLength({length:brief.length,lengthWords:brief.lengthWords}).words>1200||
             state?.plan?.stageAttempt!==current.versions||state.pendingGuidance!=null)
            throw fail('PRIVATE_WRITE_CONFLICT');
          const sourceRows=await tx.privateWorkerObject.findMany({where:{runId:run.id,kind:'source'},orderBy:[{objectId:'asc'},{revision:'desc'}]});
          const latest=new Map();
          for(const row of sourceRows)if(!latest.has(row.objectId))latest.set(row.objectId,row);
          if(latest.size!==1)throw fail('PRIVATE_WRITE_CONFLICT');
          const sourceRow=[...latest.values()][0];
          const source=await open(run,sourceRow,'source',sourceRow.objectId,sourceRow.revision);
          if(source?.provider!=='user-upload'||typeof source.text!=='string'||!source.text.trim()||
             typeof source.url!=='string'||!source.url||typeof source.title!=='string'||!source.title)
            throw fail('PRIVATE_WRITE_CONFLICT');
          if(current.status==='running'){
            const marker=state.privateWrite;
            if(!marker||Object.keys(marker).sort().join(',')!=='baseStateRevision,mode,planAttempt,sourceId,sourceRevision'||
               marker.mode!=='source-only-short'||marker.planAttempt!==current.versions||
               marker.baseStateRevision!==2||marker.sourceRevision!==1||
               marker.sourceId!==sourceRow.objectId||marker.sourceRevision!==sourceRow.revision||
               stateRow.revision!==marker.baseStateRevision+1)throw fail('PRIVATE_WRITE_CONFLICT');
            return {status:'running',revision:stateRow.revision,replayed:true};
          }
          // The current source-only path initializes one source at revision 1
          // and commits one plan state at revision 2. Any intervening edit
          // needs a new, audited workflow rather than an implicit write.
          if(stateRow.revision!==2||sourceRows.length!==1||sourceRow.revision!==1)
            throw fail('PRIVATE_WRITE_CONFLICT');
          if(state.privateWrite!=null)throw fail('PRIVATE_WRITE_CONFLICT');
          const steps=await tx.researchStep.findMany({where:{runId:run.id}});
          const journal=steps.filter(step=>step.kind==='private-execute');
          if(journal.length>1||journal.some(step=>step.status!=='active')||
             !steps.length||steps.some(step=>step.kind!=='private-execute'&&
               (step.kind!=='plan'||step.status!=='done')))throw fail('PRIVATE_WRITE_CONFLICT');
          const currentSteps=steps.filter(step=>step.kind==='plan'&&step.attempt===current.versions);
          if(currentSteps.length!==1)throw fail('PRIVATE_WRITE_CONFLICT');
          const [planStep]=currentSteps;
          pointer(planStep);
          const sealedStep=await lookup(tx,run.id,'step',planStep.id,current.versions);
          const planOutput=await open(run,sealedStep,'step',planStep.id,current.versions);
          const {stageAttempt,...plan}=state.plan;
          if(!isDeepStrictEqual(planOutput,plan))throw fail('PRIVATE_WRITE_CONFLICT');
          const revision=stateRow.revision+1;
          const privateWrite={mode:'source-only-short',planAttempt:current.versions,
            baseStateRevision:stateRow.revision,sourceId:sourceRow.objectId,sourceRevision:sourceRow.revision};
          const envelope=await seal(run,'state',run.id,revision,{...state,privateWrite});
          await tx.privateWorkerObject.create({data:{id:randomUUID(),runId:run.id,kind:'state',objectId:run.id,revision,envelope}});
          await tx.researchRun.update({where:{id:run.id},data:{status:'running'}});
          return {status:'running',revision,replayed:false};
        });
      }catch(error){if(error?.code==='PRIVATE_WRITE_CONFLICT')throw error;throw fail();}
    },
    putSource(run,{sourceId=randomUUID(),revision=1,source}){return put(run,'source',sourceId,revision,source);},
    getSource(run,sourceId,revision=1){return get(run,'source',sourceId,revision);},
    listSources(run){return list(run,'source',{latest:true});},
    putClaim(run,{claimId=randomUUID(),revision=1,claim}){return put(run,'claim',claimId,revision,claim);},
    getClaim(run,claimId,revision=1){return get(run,'claim',claimId,revision);},
    listClaims(run){return list(run,'claim',{latest:true});},
    appendDecision(run,{seq,decision}){return put(run,'decision',run.id,seq,decision);},
    async listDecisions(run){return (await list(run,'decision')).sort((a,b)=>a.revision-b.revision);},
    putReport(run,{version,report}){return put(run,'report',run.id,version,report);},
    getReport(run,version){return get(run,'report',run.id,version);},
    async commitReport(run,{version,stateRevision,sourceVersions,report}={}){
      try{
        requireRevision(version);requireRevision(stateRevision);
        if(!Array.isArray(sourceVersions)||sourceVersions.length<1||sourceVersions.length>40||
           sourceVersions.some(s=>!s||!UUID.test(s.objectId)||!Number.isSafeInteger(s.revision)||s.revision<1)||
           new Set(sourceVersions.map(s=>s.objectId)).size!==sourceVersions.length)throw fail();
        const expectedSources=[...sourceVersions].sort((a,b)=>a.objectId.localeCompare(b.objectId));
        await owner(db,run);
        const canonicalReport=JSON.parse(safeJson(report));
        const envelope=await seal(run,'report',run.id,version,canonicalReport);
        return await lock(run.id,async tx=>{
          const current=await owner(tx,run);
          if(current.status!=='running'||current.versions!==version)throw fail('PRIVATE_REPORT_CONFLICT');
          const state=await tx.privateWorkerObject.findFirst({where:{runId:run.id,kind:'state',objectId:run.id},orderBy:{revision:'desc'}});
          if(state?.revision!==stateRevision)throw fail('PRIVATE_REPORT_CONFLICT');
          const sourceRows=await tx.privateWorkerObject.findMany({where:{runId:run.id,kind:'source'},select:{objectId:true,revision:true}});
          const latest=new Map();
          for(const row of sourceRows)latest.set(row.objectId,Math.max(latest.get(row.objectId)||0,row.revision));
          const actualSources=[...latest].map(([objectId,revision])=>({objectId,revision}))
            .sort((a,b)=>a.objectId.localeCompare(b.objectId));
          if(!isDeepStrictEqual(actualSources,expectedSources))throw fail('PRIVATE_REPORT_CONFLICT');
          const steps=await tx.researchStep.findMany({where:{runId:run.id,kind:'write',attempt:version,status:'done'}});
          if(steps.length!==1)throw fail('PRIVATE_REPORT_CONFLICT');
          const [step]=steps;
          pointer(step);
          const sealedStep=await lookup(tx,run.id,'step',step.id,version);
          if(!isDeepStrictEqual(await open(run,sealedStep,'step',step.id,version),canonicalReport))throw fail('PRIVATE_REPORT_CONFLICT');
          const existing=await lookup(tx,run.id,'report',run.id,version);
          if(existing){
            if(!isDeepStrictEqual(await open(run,existing,'report',run.id,version),canonicalReport))throw fail('PRIVATE_REPORT_CONFLICT');
            return {version,replayed:true};
          }
          await tx.privateWorkerObject.create({data:{id:randomUUID(),runId:run.id,kind:'report',objectId:run.id,revision:version,envelope}});
          return {version,replayed:false};
        });
      }catch(error){if(error?.code==='PRIVATE_REPORT_CONFLICT')throw error;throw fail();}
    },
    async completeSourceOnlyRun(run,{reportId,envelope}={}){
      try{
        if(reportId!==run?.id||!UUID.test(reportId)||
           typeof db.researchReport?.findFirst!=='function'||typeof db.researchReport?.create!=='function')throw fail();
        await owner(db,run);
        const context=validateHpkeReportEnvelope(envelope,{tenantId:run.userId,runId:run.id});
        if(context.objectId!==reportId||context.revision!==1)throw fail('PRIVATE_COMPLETE_CONFLICT');
        return await lock(run.id,async tx=>{
          const current=await owner(tx,run);
          if(current.versions!==1||current.versions!==run.versions||!['running','complete'].includes(current.status))
            throw fail('PRIVATE_COMPLETE_CONFLICT');
          const originalRow=await lookup(tx,run.id,'state',run.id,1);
          const stateRow=await tx.privateWorkerObject.findFirst({where:{runId:run.id,kind:'state',objectId:run.id},orderBy:{revision:'desc'}});
          if(!originalRow||stateRow?.revision!==3)throw fail('PRIVATE_COMPLETE_CONFLICT');
          const original=await open(run,originalRow,'state',run.id,1);
          const state=await open(run,stateRow,'state',run.id,3);
          const marker=state?.privateWrite;
          if(typeof original?.resultRecipientPublicKey!=='string'||
             state?.resultRecipientPublicKey!==original.resultRecipientPublicKey||
             !marker||Object.keys(marker).sort().join(',')!=='baseStateRevision,mode,planAttempt,sourceId,sourceRevision'||
             marker.mode!=='source-only-short'||marker.baseStateRevision!==2||marker.planAttempt!==1||marker.sourceRevision!==1||
             state?.plan?.stageAttempt!==1||state?.brief?.liveWeb!==false)throw fail('PRIVATE_COMPLETE_CONFLICT');
          const recipient=Buffer.from(original.resultRecipientPublicKey,'base64');
          if(recipient.length!==65||recipient[0]!==4||recipient.toString('base64')!==original.resultRecipientPublicKey||
             context.recipientId!==recipientIdForPublicKey(recipient))throw fail('PRIVATE_COMPLETE_CONFLICT');
          const sources=await tx.privateWorkerObject.findMany({where:{runId:run.id,kind:'source'}});
          if(sources.length!==1||sources[0].objectId!==marker.sourceId||sources[0].revision!==1)
            throw fail('PRIVATE_COMPLETE_CONFLICT');
          const source=await open(run,sources[0],'source',marker.sourceId,1);
          if(source?.provider!=='user-upload'||typeof source.text!=='string'||!source.text.trim())
            throw fail('PRIVATE_COMPLETE_CONFLICT');
          const sealedReport=await lookup(tx,run.id,'report',run.id,1);
          const report=await open(run,sealedReport,'report',run.id,1);
          if(typeof report?.markdown!=='string'||!report.markdown.trim()||
             typeof report.inputDigest!=='string'||!/^[0-9a-f]{64}$/.test(report.inputDigest))
            throw fail('PRIVATE_COMPLETE_CONFLICT');
          const steps=await tx.researchStep.findMany({where:{runId:run.id}});
          const writes=steps.filter(step=>step.kind==='write'&&step.attempt===1&&step.status==='done');
          if(writes.length!==1||steps.some(step=>!((step.kind==='plan'||step.kind==='write')&&step.status==='done')&&
             !(step.kind==='private-execute'&&['active','done'].includes(step.status))))throw fail('PRIVATE_COMPLETE_CONFLICT');
          pointer(writes[0]);
          const sealedStep=await lookup(tx,run.id,'step',writes[0].id,1);
          if(!isDeepStrictEqual(await open(run,sealedStep,'step',writes[0].id,1),report))throw fail('PRIVATE_COMPLETE_CONFLICT');
          const existing=await tx.researchReport.findFirst({where:{runId:run.id,version:1}});
          if(current.status==='complete'){
            if(!existing||existing.id!==reportId||!Array.isArray(existing.citations)||existing.citations.length!==0)
              throw fail('PRIVATE_COMPLETE_CONFLICT');
            const stored=JSON.parse(existing.markdown);
            if(!stored||Object.keys(stored).sort().join(',')!=='encrypted,envelope,format'||stored.encrypted!==true||
               stored.format!=='hpke-report-v2'||!isDeepStrictEqual(stored.envelope,envelope))throw fail('PRIVATE_COMPLETE_CONFLICT');
            return {id:reportId,version:1,encrypted:true,replayed:true};
          }
          if(existing)throw fail('PRIVATE_COMPLETE_CONFLICT');
          await tx.researchReport.create({data:{id:reportId,runId:run.id,version:1,
            markdown:JSON.stringify({encrypted:true,format:'hpke-report-v2',envelope}),citations:[]}});
          await tx.researchRun.update({where:{id:run.id},data:{status:'complete',pauseReason:null}});
          return {id:reportId,version:1,encrypted:true,replayed:false};
        });
      }catch(error){if(error?.code==='PRIVATE_COMPLETE_CONFLICT')throw error;throw fail();}
    },
    async beginStage({run,kind,attempt}){
      try{
        requireStage(kind);requireRevision(attempt);
        const claim=await lock(run.id,async tx=>{
          const current=await owner(tx,run);
          if(current.status!==(kind==='plan'?'planning':'running')||current.versions!==stageVersion(kind,attempt))return {state:'uncertain'};
          const row=await tx.researchStep.findFirst({where:{runId:run.id,kind,attempt},orderBy:{createdAt:'asc'}});
          if(row){
            if(row.status==='done')return {state:'done',row};
            // A model/tool may have run before a crash. Even an expired lease
            // must park uncertain, not silently replay paid or external work.
            return {state:'uncertain'};
          }
          // A new attempt number is not permission to replay a prior call.
          // Different rounds can proceed only after all earlier work of this
          // kind is durably done; failed/expired/pending work needs a separate
          // audited recovery decision before any new provider charge.
          const prior=await tx.researchStep.findMany({where:{runId:run.id,kind},select:{status:true}});
          if(prior.some(step=>step.status!=='done'))return {state:'uncertain'};
          // The full-job journal is intentionally active across all measured
          // stages. Only another active *stage* blocks this stage claim.
          const active=await tx.researchStep.findMany({where:{runId:run.id,status:'active'}});
          if(active.some(step=>step.kind!=='private-execute'))return {state:'uncertain'};
          const lease=randomUUID();
          await tx.researchStep.create({data:{id:lease,runId:run.id,kind,status:'active',attempt,
            input:null,output:null,workerId:lease,startedAt:new Date(now()),heartbeatAt:new Date(now()),leaseUntil:new Date(now()+LEASE_MS)}});
          return {state:'claimed',lease};
        });
        if(claim.state!=='done')return claim;
        const row=claim.row;pointer(row);
        const output=await get(run,'step',row.id,attempt);
        if(output===null)throw fail();
        return {state:'done',output};
      }catch{throw fail('PRIVATE_STAGE_UNAVAILABLE');}
    },
    async finishStage({run,kind,attempt,lease,output}){
      try{
        requireStage(kind);requireRevision(attempt);requireObjectId(lease);
        await owner(db,run);
        const envelope=await seal(run,'step',lease,attempt,output);
        await lock(run.id,async tx=>{
          const current=await owner(tx,run);
          // A cancellation or terminal transition after inference must not
          // durably checkpoint output into a run that no longer admits work.
          if(current.versions!==stageVersion(kind,attempt)||
             current.status!==(kind==='plan'?'planning':'running'))throw fail();
          const row=await tx.researchStep.findUnique({where:{id:lease}});
          if(!row||row.runId!==run.id||row.kind!==kind||row.attempt!==attempt||row.status!=='active'||row.workerId!==lease)
            throw fail();
          await tx.privateWorkerObject.create({data:{id:randomUUID(),runId:run.id,kind:'step',objectId:lease,revision:attempt,envelope}});
          await tx.researchStep.update({where:{id:lease},data:{status:'done',output:{encrypted:true,format:POINTER,objectId:lease,revision:attempt},
            endedAt:new Date(now()),workerId:null,leaseUntil:null,heartbeatAt:null}});
        });
      }catch{throw fail('PRIVATE_STAGE_UNAVAILABLE');}
    },
    async failStage({run,runId,kind,attempt,lease,code}){
      try{
        requireStage(kind);requireRevision(attempt);requireObjectId(runId);requireObjectId(lease);
        if(ids(run).runId!==runId)throw fail();
        if(code!=='PRIVATE_STAGE_FAILED')throw fail();
        return await lock(runId,async tx=>{
          await owner(tx,run);
          const step=await tx.researchStep.findUnique({where:{id:lease}});
          if(!step||step.runId!==runId||step.kind!==kind||step.attempt!==attempt||step.workerId!==lease||step.status!=='active')return false;
          await tx.researchStep.update({where:{id:lease},data:{status:'failed',output:{code:'PRIVATE_STAGE_FAILED'},endedAt:new Date(now()),workerId:null,leaseUntil:null,heartbeatAt:null}});
          return true;
        });
      }catch{throw fail('PRIVATE_STAGE_UNAVAILABLE');}
    },
  });
}
