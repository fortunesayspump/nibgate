// Real-Postgres contract test. Vitest global setup permits only the disposable
// drnib_test schema. All contents and keys are synthetic; no paid calls occur.
import {randomBytes,randomUUID} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {db} from '../src/db.js';
import {createPrivateWorkerStore} from '../src/privacy/private-worker-store.js';
import {createPrivateWorkerEventPort} from '../src/privacy/private-worker-events.js';
import {createPrivateVerifyExtractionRunner} from '../src/privacy/private-verify-extraction.js';
import {createPrivateVerifySupportStore} from '../src/privacy/private-verify-support-store.js';
import {privateSupportOutput,privateSupportSelectedIndices} from '../src/privacy/private-verify-support-core.js';
import {createPrivateVerifiedCompletionStore} from '../src/privacy/private-verified-completion.js';
import {generateHpkeRecipient,recipientIdForPublicKey,sealHpkeReport} from '../src/privacy/source-hpke.js';

const CANARY='SYNTHETIC_VERIFIED_COMPLETION_PG_CANARY_9214da';
const CLAIM='Synthetic copper widgets weigh five grams.';
const MODEL='synthetic/local-fixture-v1';

async function persisted(id){
  const [run,objects,steps,reports,sources,claims,decisions,events]=await Promise.all([
    db.researchRun.findUnique({where:{id}}),
    db.privateWorkerObject.findMany({where:{runId:id}}),
    db.researchStep.findMany({where:{runId:id}}),
    db.researchReport.findMany({where:{runId:id}}),
    db.researchSource.findMany({where:{runId:id}}),
    db.researchClaim.findMany({where:{runId:id}}),
    db.researchDecision.findMany({where:{runId:id}}),
    db.researchEvent.findMany({where:{runId:id}}),
  ]);
  return {run,objects,steps,reports,sources,claims,decisions,events};
}

async function withPreparedRun(body){
  const id=randomUUID(),tenantId=`verified-completion-pg-${id}`,key=randomBytes(32);
  await db.researchRun.create({data:{id,userId:tenantId,title:null,description:null,
    brief:{encrypted:true},metadata:{privacyMode:'confidential',schemaVersion:1},
    plan:null,pendingQuestion:null,pendingGuidance:null,status:'planning',versions:1}});
  try{
    const keyProvider=async args=>{expect(args.tenantId).toBe(tenantId);expect(args.runId).toBe(id);return key;};
    const worker=createPrivateWorkerStore({db,keyProvider,tenantId});
    const events=createPrivateWorkerEventPort({db,keyProvider,tenantId});
    const support=createPrivateVerifySupportStore({db,keyProvider,tenantId});
    const run=await worker.loadRun(id),recipient=await generateHpkeRecipient();
    const sourceId=randomUUID();
    const initial={brief:{topic:'Synthetic copper widget research',liveWeb:false,
      depth:'standard',lengthWords:300},plan:null,pendingGuidance:null,
      resultRecipientPublicKey:Buffer.from(recipient.publicKey).toString('base64')};
    const source={provider:'user-upload',url:`user-upload://${sourceId}`,
      title:`${CANARY} source`,text:`${CANARY}. ${CLAIM}`};
    const report={markdown:`# ${CANARY} report\n\n${CLAIM} [1].`,
      citations:[{url:source.url,title:source.title}],inputDigest:'a'.repeat(64),
      verification:{status:'unverified'}};
    await worker.putRunState(run,{expectedRevision:0,state:initial});
    await worker.putSource(run,{sourceId,source});
    const plan=await worker.beginStage({run,kind:'plan',attempt:1});
    expect(plan.state).toBe('claimed');
    const planOutput={sub_questions:['Synthetic widget weight'],inputDigest:'b'.repeat(64)};
    await worker.finishStage({run,kind:'plan',attempt:1,lease:plan.lease,output:planOutput});
    await worker.commitPlan(run,{attempt:1,expectedRevision:1,nextState:{...initial,
      plan:{...planOutput,stageAttempt:1}}});
    await worker.startSourceOnlyWrite(run);
    const write=await worker.beginStage({run,kind:'write',attempt:1});
    expect(write.state).toBe('claimed');
    await worker.finishStage({run,kind:'write',attempt:1,lease:write.lease,output:report});
    await worker.commitReport(run,{version:1,stateRevision:3,
      sourceVersions:[{objectId:sourceId,revision:1}],report});
    const extraction=createPrivateVerifyExtractionRunner({store:worker,events,model:MODEL,
      aiPort:{privateVerifiedTransport:'phala-aci-v1',infer:async()=>({choices:[{message:{
        content:JSON.stringify({claims:[{text:CLAIM,citations:[1]}]})}}]})}});
    const extracted=await extraction.run(id);
    expect(extracted.claims).toHaveLength(1);
    const claim=await support.begin(run);
    expect(claim.state).toBe('claimed');
    const {snapshotDigest}=claim.snapshot;
    const indices=privateSupportSelectedIndices(extracted,source,report);
    expect(indices).toEqual([0]);
    const output=privateSupportOutput({snapshotDigest,extraction:extracted,source,report,
      probabilities:[{index:0,probability:0.93}]});
    await support.finish(run,{lease:claim.lease,output});
    expect(await support.commitClaims(run)).toMatchObject({committed:true,claims:1,verified:false});
    const context={tenantId,runId:id,objectId:id,revision:1,purpose:'report',
      recipientId:recipientIdForPublicKey(recipient.publicKey)};
    const envelope=await sealHpkeReport({recipientPublicKey:recipient.publicKey,context,
      plaintext:Buffer.from(JSON.stringify({markdown:report.markdown,
        scope:'protected-ai-sampled',verified:false}))});
    return await body({id,tenantId,keyProvider,run,recipient,envelope,claim,output});
  }finally{
    await db.researchRun.delete({where:{id}});
  }
}

function completion(tenantId,keyProvider,client=db){
  return createPrivateVerifiedCompletionStore({db:client,keyProvider,tenantId});
}

// Preserve the genuine Prisma interactive transaction and advisory lock. Throw
// at a selected final write to verify that the prior report INSERT rolls back.
function failFinalWrite(stage){
  return {
    researchRun:db.researchRun,researchReport:db.researchReport,
    researchStep:db.researchStep,privateWorkerObject:db.privateWorkerObject,
    researchClaim:db.researchClaim,researchSource:db.researchSource,
    $transaction:(fn,options)=>db.$transaction(tx=>fn({
      $queryRaw:(...args)=>tx.$queryRaw(...args),
      researchRun:{findUnique:(...args)=>tx.researchRun.findUnique(...args),
        updateMany:(...args)=>{
          if(stage==='status'&&args[0]?.data?.status==='complete')throw Error('synthetic status update fault');
          if(stage==='stale-cas')return {count:0};
          return tx.researchRun.updateMany(...args);
        }},
      researchReport:{findFirst:(...args)=>tx.researchReport.findFirst(...args),
        create:(...args)=>{
          if(stage==='report')throw Error('synthetic report insert fault');
          return tx.researchReport.create(...args);
        }},
      researchStep:tx.researchStep,privateWorkerObject:tx.privateWorkerObject,
      researchClaim:tx.researchClaim,researchSource:tx.researchSource,
    }),options),
  };
}

function expectSealed(rows){
  const serialized=JSON.stringify(rows);
  expect(serialized).not.toContain(CANARY);
  expect(serialized).not.toContain(CLAIM);
  expect(rows.claims).toHaveLength(0);
  expect(rows.sources).toHaveLength(0);
  expect(rows.decisions).toHaveLength(0);
  expect(rows.run.brief).toEqual({encrypted:true});
  expect(rows.run.title).toBeNull();
  expect(rows.run.description).toBeNull();
  for(const step of rows.steps){
    expect(step.input).toBeNull();
    expect(step.output).toMatchObject({encrypted:true,format:'private-worker-object-v1'});
  }
}

describe('future protected verified completion Postgres invariants',()=>{
  it.each(['report','status','stale-cas'])('rolls back a synthetic %s write failure, then completes exactly once',async stage=>{
    await withPreparedRun(async({id,tenantId,keyProvider,run,envelope})=>{
      const broken=completion(tenantId,keyProvider,failFinalWrite(stage));
      await expect(broken.complete(run,{reportId:id,envelope}))
        .rejects.toMatchObject({code:stage==='stale-cas'?'PRIVATE_VERIFIED_COMPLETE_CONFLICT':'PRIVATE_VERIFIED_COMPLETE_UNAVAILABLE'});
      const rolledBack=await persisted(id);
      expect(rolledBack.reports).toHaveLength(0);
      expect(rolledBack.run.status).toBe('running');
      expectSealed(rolledBack);
      const real=completion(tenantId,keyProvider);
      expect(await real.complete(run,{reportId:id,envelope}))
        .toEqual({id,version:1,encrypted:true,replayed:false});
      expect(await real.complete(run,{reportId:id,envelope}))
        .toEqual({id,version:1,encrypted:true,replayed:true});
      const rows=await persisted(id);
      expect(rows.run.status).toBe('complete');
      expect(rows.reports).toHaveLength(1);
      expect(rows.reports[0].citations).toEqual([]);
      expect(JSON.parse(rows.reports[0].markdown)).toEqual({encrypted:true,format:'hpke-report-v2',envelope});
      expect(rows.objects.filter(row=>row.kind==='claim')).toHaveLength(1);
      expectSealed(rows);
    });
  });

  it('serializes two independent completers to one ciphertext report and refuses a different ciphertext replay',async()=>{
    await withPreparedRun(async({id,tenantId,keyProvider,run,recipient,envelope})=>{
      const stores=[completion(tenantId,keyProvider),completion(tenantId,keyProvider)];
      const results=await Promise.all(stores.map(store=>store.complete(run,{reportId:id,envelope})));
      expect(results.filter(result=>!result.replayed)).toHaveLength(1);
      expect(results.filter(result=>result.replayed)).toHaveLength(1);
      const alternate=await sealHpkeReport({recipientPublicKey:recipient.publicKey,context:envelope.context,
        plaintext:Buffer.from('synthetic alternate report ciphertext')});
      await expect(stores[0].complete(run,{reportId:id,envelope:alternate}))
        .rejects.toMatchObject({code:'PRIVATE_VERIFIED_COMPLETE_CONFLICT'});
      const rows=await persisted(id);
      expect(rows.reports).toHaveLength(1);
      expect(JSON.parse(rows.reports[0].markdown).envelope).toEqual(envelope);
      expectSealed(rows);
    });
  });
});
