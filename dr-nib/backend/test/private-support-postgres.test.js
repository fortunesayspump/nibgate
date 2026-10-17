// Real-Postgres contract test. Vitest global setup permits only the disposable
// drnib_test schema. The test body uses synthetic text, keys and AI output;
// it never calls an inference provider or any outside service.
import {randomBytes,randomUUID} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {db} from '../src/db.js';
import {createPrivateWorkerStore} from '../src/privacy/private-worker-store.js';
import {createPrivateWorkerEventPort} from '../src/privacy/private-worker-events.js';
import {createPrivateVerifyExtractionRunner} from '../src/privacy/private-verify-extraction.js';
import {createPrivateVerifySupportStore} from '../src/privacy/private-verify-support-store.js';
import {privateSupportOutput,privateSupportSelectedIndices} from '../src/privacy/private-verify-support-core.js';

const CANARY='SYNTHETIC_SUPPORT_PG_CANARY_cbd5f2';
const CLAIMS=[
  {text:'Blue widgets weigh four grams.',citations:[1]},
  {text:'Red widgets cost five coins.',citations:[1]},
  {text:'Green widgets bloom on Friday.',citations:[1]},
];

function keyProvider(tenantId,key){
  return async args=>{
    expect(args.tenantId).toBe(tenantId);
    expect(args.runId).toMatch(/^[0-9a-f-]{36}$/);
    return key;
  };
}

async function withRunningRun(body){
  const id=randomUUID(),tenantId=`support-pg-test-${id}`,key=randomBytes(32);
  await db.researchRun.create({data:{id,userId:tenantId,title:null,description:null,
    brief:{encrypted:true},metadata:{privacyMode:'confidential',schemaVersion:1},
    plan:null,pendingQuestion:null,pendingGuidance:null,status:'running',versions:1}});
  try{
    const keys=keyProvider(tenantId,key);
    const worker=createPrivateWorkerStore({db,keyProvider:keys,tenantId});
    const events=createPrivateWorkerEventPort({db,keyProvider:keys,tenantId});
    const run=await worker.loadRun(id);
    const sourceId=randomUUID();
    const recipient=Buffer.concat([Buffer.from([4]),randomBytes(64)]).toString('base64');
    const state={brief:{topic:'Research synthetic widgets',liveWeb:false,depth:'standard'},
      plan:{stageAttempt:1,sub_questions:['widget properties']},
      resultRecipientPublicKey:recipient,
      privateWrite:{mode:'source-only-short',baseStateRevision:2,planAttempt:1,sourceId,sourceRevision:1}};
    const source={provider:'user-upload',url:`user-upload://${sourceId}`,title:`${CANARY} source`,
      text:`${CANARY}. Blue widgets weigh four grams. Red widgets cost five coins. Green widgets bloom on Friday.`};
    const report={markdown:`# ${CANARY} report\n\nBlue widgets weigh four grams [1]. Red widgets cost five coins [1]. Green widgets bloom on Friday [1].`,
      citations:[{url:source.url,title:source.title}],inputDigest:'a'.repeat(64),verification:{status:'unverified'}};
    await worker.putRunState(run,{expectedRevision:0,state:{...state,privateWrite:null}});
    await worker.putRunState(run,{expectedRevision:1,state:{...state,privateWrite:null}});
    await worker.putRunState(run,{expectedRevision:2,state});
    await worker.putSource(run,{sourceId,source});
    await worker.putReport(run,{version:1,report});
    const extraction=createPrivateVerifyExtractionRunner({store:worker,events,model:'synthetic/model-v1',
      aiPort:{privateVerifiedTransport:'phala-aci-v1',infer:async()=>({choices:[{message:{content:JSON.stringify({claims:CLAIMS})}}]})}});
    const extracted=await extraction.run(id);
    expect(extracted.claims).toHaveLength(CLAIMS.length);
    return await body({id,tenantId,key,keys,run,worker,sourceId});
  }finally{
    await db.researchRun.delete({where:{id}});
  }
}

function supportStore(tenantId,keys,client=db){
  return createPrivateVerifySupportStore({db:client,keyProvider:keys,tenantId});
}

// Preserve Prisma's actual transaction and advisory lock, but throw on the
// second claim INSERT. If any first claim survives, rollback was not atomic.
function failSecondClaimInsert(){
  let claims=0;
  return {
    researchRun:db.researchRun,researchStep:db.researchStep,
    researchClaim:db.researchClaim,researchSource:db.researchSource,
    privateWorkerObject:db.privateWorkerObject,
    $transaction:(fn,options)=>db.$transaction(tx=>fn({
      $queryRaw:(...args)=>tx.$queryRaw(...args),
      researchRun:tx.researchRun,researchStep:tx.researchStep,
      researchClaim:tx.researchClaim,researchSource:tx.researchSource,
      privateWorkerObject:{
        findUnique:(...args)=>tx.privateWorkerObject.findUnique(...args),
        findFirst:(...args)=>tx.privateWorkerObject.findFirst(...args),
        findMany:(...args)=>tx.privateWorkerObject.findMany(...args),
        create:(...args)=>{
          if(args[0]?.data?.kind==='claim'&&++claims===2)throw Error('synthetic second-claim insert fault');
          return tx.privateWorkerObject.create(...args);
        },
      },
    }),options),
  };
}

async function persisted(id){
  const [run,objects,steps,events,reports,claims,sources,decisions]=await Promise.all([
    db.researchRun.findUnique({where:{id}}),
    db.privateWorkerObject.findMany({where:{runId:id}}),
    db.researchStep.findMany({where:{runId:id}}),
    db.researchEvent.findMany({where:{runId:id}}),
    db.researchReport.findMany({where:{runId:id}}),
    db.researchClaim.findMany({where:{runId:id}}),
    db.researchSource.findMany({where:{runId:id}}),
    db.researchDecision.findMany({where:{runId:id}}),
  ]);
  return {run,objects,steps,events,reports,claims,sources,decisions};
}

describe('private support claim commit Postgres invariants',()=>{
  it('rolls back the second claim fault, then serializes two committers into one sealed set',async()=>{
    await withRunningRun(async({id,tenantId,keys,run,worker})=>{
      const first=supportStore(tenantId,keys);
      const claimed=await first.begin(run);
      expect(claimed.state).toBe('claimed');
      const {snapshotDigest,source,report,extraction}=claimed.snapshot;
      const indices=privateSupportSelectedIndices(extraction,source,report);
      expect(indices).toEqual([0,1,2]);
      const probabilities=indices.map((index,i)=>({index,probability:[0.92,0.2,0.85][i]}));
      const output=privateSupportOutput({snapshotDigest,source,report,extraction,probabilities});
      expect(output.supported).toBe(2);
      expect(output.verified).toBe(false);
      await first.finish(run,{lease:claimed.lease,output});

      const failing=supportStore(tenantId,keys,failSecondClaimInsert());
      await expect(failing.commitClaims(run)).rejects.toMatchObject({code:'PRIVATE_SUPPORT_UNAVAILABLE'});
      const afterFault=await persisted(id);
      expect(afterFault.objects.filter(row=>row.kind==='claim')).toHaveLength(0);
      expect(afterFault.objects.filter(row=>row.kind==='step'&&row.objectId===claimed.lease&&row.revision===2)).toHaveLength(0);
      expect(afterFault.steps.find(row=>row.kind==='verify-support')?.status).toBe('done');

      const second=supportStore(tenantId,keys);
      const results=await Promise.all([first.commitClaims(run),second.commitClaims(run)]);
      expect(results.filter(result=>result.replayed===false)).toHaveLength(1);
      expect(results.filter(result=>result.replayed===true)).toHaveLength(1);
      expect(results.map(result=>({claims:result.claims,supported:result.supported,unknown:result.unknown,
        verified:result.verified,committed:result.committed}))).toEqual([
        {claims:3,supported:2,unknown:1,verified:false,committed:true},
        {claims:3,supported:2,unknown:1,verified:false,committed:true},
      ]);
      const rows=await persisted(id);
      expect(rows.objects.filter(row=>row.kind==='claim')).toHaveLength(3);
      expect(new Set(rows.objects.filter(row=>row.kind==='claim').map(row=>row.objectId)).size).toBe(3);
      expect(rows.objects.filter(row=>row.kind==='step'&&row.objectId===claimed.lease&&row.revision===2)).toHaveLength(1);
      expect(rows.claims).toHaveLength(0);
      expect(rows.sources).toHaveLength(0);
      expect(rows.decisions).toHaveLength(0);
      expect(rows.reports).toHaveLength(0); // browser HPKE release is a separate future flow
      expect(rows.run.brief).toEqual({encrypted:true});
      expect(rows.run.title).toBeNull();
      expect(rows.run.description).toBeNull();
      for(const step of rows.steps){
        expect(step.input).toBeNull();
        expect(step.output).toMatchObject({encrypted:true,format:'private-worker-object-v1'});
      }
      const serialized=JSON.stringify(rows);
      expect(serialized).not.toContain(CANARY);
      for(const claim of CLAIMS)expect(serialized).not.toContain(claim.text);
      const opened=await worker.listClaims(run);
      expect(opened.map(row=>row.value.status).sort()).toEqual(['supported','supported','unknown']);
    });
  });
});
