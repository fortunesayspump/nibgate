import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {assertPrivateWorkerRun} from './private-worker-store.js';
import {openPrivatePayload} from './sealed-payload.js';
import {recipientIdForPublicKey,validateHpkeReportEnvelope} from './source-hpke.js';
import {assertPrivateSupportOutput,privateSupportSnapshot} from './private-verify-support-core.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POINTER='private-worker-object-v1';
function denied(code='PRIVATE_VERIFIED_COMPLETE_UNAVAILABLE'){
  const error=new Error(code);error.code=code;return error;
}
function claimId(runId,snapshotDigest,index){
  const bytes=createHash('sha256').update(`drnib-private-support-claim-v1\0${runId}\0${snapshotDigest}\0${index}`).digest().subarray(0,16);
  bytes[6]=(bytes[6]&15)|128;bytes[8]=(bytes[8]&63)|128;
  const value=bytes.toString('hex');
  return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;
}
function pointer(step){
  const p=step?.output;
  if(!p||typeof p!=='object'||Array.isArray(p)||
     Object.keys(p).sort().join(',')!=='encrypted,format,objectId,revision'||
     p.encrypted!==true||p.format!==POINTER||p.objectId!==step.id||p.revision!==step.attempt)
    throw denied('PRIVATE_VERIFIED_COMPLETE_CONFLICT');
}
function parse(bytes){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}

/** Future-only finalization seam for the protected single-source workflow.
 * A sampled model support score is not a JEV certification or full report
 * verification. This is intentionally not wired to the current guest route.
 * The caller must HPKE-seal the report inside the measured boundary. */
export function createPrivateVerifiedCompletionStore({db,keyProvider,tenantId}={}){
  if(typeof db?.$transaction!=='function'||typeof db?.researchRun?.findUnique!=='function'||
     typeof db?.researchRun?.updateMany!=='function'||typeof db?.researchReport?.findFirst!=='function'||
     typeof db?.researchReport?.create!=='function'||typeof db?.privateWorkerObject?.findUnique!=='function'||
     typeof db?.researchClaim?.count!=='function'||typeof db?.researchSource?.count!=='function'||
     typeof keyProvider!=='function'||typeof tenantId!=='string'||!tenantId||tenantId.length>128)
    throw denied();
  async function owner(tx,run){
    if(!run||!UUID.test(run.id)||run.userId!==tenantId)throw denied();
    return assertPrivateWorkerRun(await tx.researchRun.findUnique({where:{id:run.id}}),run.id,tenantId);
  }
  async function open(run,row,kind,objectId,revision){
    if(!row||row.runId!==run.id||row.kind!==kind||row.objectId!==objectId||row.revision!==revision)
      throw denied('PRIVATE_VERIFIED_COMPLETE_CONFLICT');
    const purpose=kind==='source'?'worker-source':kind;
    const key=await keyProvider({tenantId:run.userId,runId:run.id,purpose});
    if(!Buffer.isBuffer(key)||key.length!==32)throw denied();
    return parse(openPrivatePayload({key,expectedContext:{tenantId:run.userId,runId:run.id,
      objectId,revision,purpose},envelope:row.envelope}));
  }
  const lookup=(tx,runId,kind,objectId,revision)=>tx.privateWorkerObject.findUnique({
    where:{runId_kind_objectId_revision:{runId,kind,objectId,revision}}});
  async function locked(run,action){
    return db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${run.id}))::text AS locked`;
      return action(tx);
    },{maxWait:10000,timeout:15000});
  }
  return Object.freeze({
    async complete(run,{reportId,envelope}={}){
      try{
        if(!run||reportId!==run.id||!UUID.test(reportId))throw denied();
        // Classification/owner precheck before even parsing the untrusted
        // ciphertext wrapper or requesting the measured state key.
        await owner(db,run);
        const context=validateHpkeReportEnvelope(envelope,{tenantId:run.userId,runId:run.id});
        if(context.objectId!==reportId||context.revision!==1)throw denied('PRIVATE_VERIFIED_COMPLETE_CONFLICT');
        return await locked(run,async tx=>{
          const current=await owner(tx,run);
          if(current.versions!==1||current.versions!==run.versions||
             !['running','complete'].includes(current.status))throw denied('PRIVATE_VERIFIED_COMPLETE_CONFLICT');
          if(await tx.researchClaim.count({where:{runId:run.id}})||
             await tx.researchSource.count({where:{runId:run.id}}))throw denied('PRIVATE_VERIFIED_COMPLETE_CONFLICT');
          const stateRows=await tx.privateWorkerObject.findMany({where:{runId:run.id,kind:'state'}});
          const originalRow=stateRows.find(row=>row.objectId===run.id&&row.revision===1);
          const stateRow=stateRows.find(row=>row.objectId===run.id&&row.revision===3);
          if(!originalRow||!stateRow||stateRows.length!==3||stateRows.some(row=>row.objectId!==run.id||
             ![1,2,3].includes(row.revision)))throw denied('PRIVATE_VERIFIED_COMPLETE_CONFLICT');
          const [original,state]=await Promise.all([open(run,originalRow,'state',run.id,1),
            open(run,stateRow,'state',run.id,3)]);
          if(typeof original?.resultRecipientPublicKey!=='string'||
             state?.resultRecipientPublicKey!==original.resultRecipientPublicKey)
            throw denied('PRIVATE_VERIFIED_COMPLETE_CONFLICT');
          const recipient=Buffer.from(original.resultRecipientPublicKey,'base64');
          if(recipient.length!==65||recipient[0]!==4||
             recipient.toString('base64')!==original.resultRecipientPublicKey||
             context.recipientId!==recipientIdForPublicKey(recipient))
            throw denied('PRIVATE_VERIFIED_COMPLETE_CONFLICT');
          const sourceRows=await tx.privateWorkerObject.findMany({where:{runId:run.id,kind:'source'}});
          if(sourceRows.length!==1||sourceRows[0].revision!==1||
             sourceRows[0].objectId!==state?.privateWrite?.sourceId)
            throw denied('PRIVATE_VERIFIED_COMPLETE_CONFLICT');
          const sourceRow=sourceRows[0];
          const source=await open(run,sourceRow,'source',sourceRow.objectId,1);
          const reportRows=await tx.privateWorkerObject.findMany({where:{runId:run.id,kind:'report'}});
          if(reportRows.length!==1||reportRows[0].objectId!==run.id||reportRows[0].revision!==1)
            throw denied('PRIVATE_VERIFIED_COMPLETE_CONFLICT');
          const report=await open(run,reportRows[0],'report',run.id,1);
          const steps=await tx.researchStep.findMany({where:{runId:run.id}});
          const kind=name=>steps.filter(step=>step.kind===name);
          const plan=kind('plan'),write=kind('write'),verify=kind('verify'),support=kind('verify-support');
          if([plan,write,verify,support].some(rows=>rows.length!==1||rows[0].attempt!==1||rows[0].status!=='done')||
             steps.some(step=>!['plan','write','verify','verify-support','private-execute'].includes(step.kind)||
               (step.kind==='private-execute'?!['active','done'].includes(step.status):step.status!=='done')))
            throw denied('PRIVATE_VERIFIED_COMPLETE_CONFLICT');
          pointer(plan[0]);pointer(write[0]);pointer(verify[0]);pointer(support[0]);
          const sealedPlan=await lookup(tx,run.id,'step',plan[0].id,1);
          const planOutput=await open(run,sealedPlan,'step',plan[0].id,1);
          if(!planOutput||typeof planOutput!=='object'||Array.isArray(planOutput)||
             !isDeepStrictEqual({...planOutput,stageAttempt:1},state?.plan))
            throw denied('PRIVATE_VERIFIED_COMPLETE_CONFLICT');
          const sealedWrite=await lookup(tx,run.id,'step',write[0].id,1);
          if(!isDeepStrictEqual(await open(run,sealedWrite,'step',write[0].id,1),report))
            throw denied('PRIVATE_VERIFIED_COMPLETE_CONFLICT');
          const extraction=await open(run,await lookup(tx,run.id,'step',verify[0].id,1),'step',verify[0].id,1);
          const snapshotDigest=privateSupportSnapshot({run:{...current,status:'running'},stateRow,state,
            sourceRow,source,report,extraction});
          const output=await open(run,await lookup(tx,run.id,'step',support[0].id,1),'step',support[0].id,1);
          assertPrivateSupportOutput(output,{snapshotDigest,extraction,source,report});
          const ids=output.claims.map((_,index)=>claimId(run.id,snapshotDigest,index));
          const manifest={scope:'support-claim-commit',snapshotDigest,claimIds:ids};
          const sealedManifest=await lookup(tx,run.id,'step',support[0].id,2);
          if(!isDeepStrictEqual(await open(run,sealedManifest,'step',support[0].id,2),manifest))
            throw denied('PRIVATE_VERIFIED_COMPLETE_CONFLICT');
          const claims=await tx.privateWorkerObject.findMany({where:{runId:run.id,kind:'claim'}});
          if(claims.length!==ids.length)throw denied('PRIVATE_VERIFIED_COMPLETE_CONFLICT');
          for(let index=0;index<ids.length;index++){
            const row=claims.find(item=>item.objectId===ids[index]&&item.revision===1);
            if(!row||!isDeepStrictEqual(await open(run,row,'claim',ids[index],1),output.claims[index]))
              throw denied('PRIVATE_VERIFIED_COMPLETE_CONFLICT');
          }
          const existing=await tx.researchReport.findFirst({where:{runId:run.id,version:1}});
          if(current.status==='complete'){
            if(!existing||existing.id!==reportId||!Array.isArray(existing.citations)||existing.citations.length!==0)
              throw denied('PRIVATE_VERIFIED_COMPLETE_CONFLICT');
            const stored=JSON.parse(existing.markdown);
            if(!stored||Object.keys(stored).sort().join(',')!=='encrypted,envelope,format'||
               stored.encrypted!==true||stored.format!=='hpke-report-v2'||
               !isDeepStrictEqual(stored.envelope,envelope))throw denied('PRIVATE_VERIFIED_COMPLETE_CONFLICT');
            return {id:reportId,version:1,encrypted:true,replayed:true};
          }
          if(existing)throw denied('PRIVATE_VERIFIED_COMPLETE_CONFLICT');
          await tx.researchReport.create({data:{id:reportId,runId:run.id,version:1,
            markdown:JSON.stringify({encrypted:true,format:'hpke-report-v2',envelope}),citations:[]}});
          // A non-cooperating cancellation/deletion writer need not acquire
          // this advisory lock. Compare-and-swap avoids overwriting its state.
          const changed=await tx.researchRun.updateMany({where:{id:run.id,userId:tenantId,
            status:'running',versions:1,deletedAt:null,
            metadata:{path:['privacyMode'],equals:'confidential'}},data:{status:'complete',pauseReason:null}});
          if(changed?.count!==1)throw denied('PRIVATE_VERIFIED_COMPLETE_CONFLICT');
          return {id:reportId,version:1,encrypted:true,replayed:false};
        });
      }catch(error){if(error?.code==='PRIVATE_VERIFIED_COMPLETE_CONFLICT')throw error;throw denied();}
    },
  });
}
