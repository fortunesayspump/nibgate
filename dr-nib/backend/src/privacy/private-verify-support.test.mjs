import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createPrivateWorkerStore} from './private-worker-store.js';
import {createPrivateWorkerEventPort} from './private-worker-events.js';
import {createPrivateVerifyExtractionRunner} from './private-verify-extraction.js';
import {createPrivateVerifySupportStore} from './private-verify-support-store.js';
import {createPrivateVerifySupportRunner} from './private-verify-support.js';
import {privateSupportOutput,privateSupportSelectedIndices} from './private-verify-support-core.js';
import {createPrivateAiBudgetGate} from './private-ai-budget.js';

const CANARY='HARMLESS_SYNTHETIC_SUPPORT_CANARY';
const CLAIMS=[
  {text:'Blue widgets weigh four grams.',citations:[1]},
  {text:'Red widgets cost five coins.',citations:[1]},
  {text:'Green widgets bloom on Friday.',citations:[1]},
  {text:'Purple widgets orbit Jupiter.',citations:[2]},
];
const MODEL='synthetic/model-v1';
const PRICE={[MODEL]:{inputMicroUsdPerMillion:100000,outputMicroUsdPerMillion:100000}};
const matches=(row,where={})=>Object.entries(where).every(([key,value])=>row[key]===value);

function fixture({claims=CLAIMS}={}){
  const run={id:randomUUID(),userId:'synthetic-owner',metadata:{privacyMode:'confidential',schemaVersion:1},
    title:null,description:null,brief:{encrypted:true},plan:null,pendingQuestion:null,pendingGuidance:null,
    deletedAt:null,status:'running',versions:1,depth:'standard'};
  const rows={objects:[],steps:[],events:[]};
  const writes=[];
  const legacy={claims:0,sources:0};
  const key=randomBytes(32);
  let chain=Promise.resolve(),failClaimAt=0,claimWrites=0;
  const db={
    $queryRaw:async()=>[{locked:'1'}],
    $transaction:fn=>{
      const result=chain.then(async()=>{
        const before=structuredClone({...rows,run});
        try{return await fn(db)}catch(error){
          rows.objects=before.objects;rows.steps=before.steps;rows.events=before.events;
          Object.assign(run,before.run);throw error;
        }
      });
      chain=result.catch(()=>{});
      return result;
    },
    researchRun:{
      findUnique:async({where})=>where.id===run.id?run:null,
      update:async({data})=>{writes.push({model:'run',data});Object.assign(run,data);return run;},
    },
    researchClaim:{count:async()=>legacy.claims},
    researchSource:{count:async()=>legacy.sources},
    privateWorkerObject:{
      create:async({data})=>{
        if(data.kind==='claim'&&failClaimAt&&++claimWrites===failClaimAt){failClaimAt=0;throw Error(CANARY)}
        writes.push({model:'object',data});rows.objects.push(data);return data;
      },
      findUnique:async({where})=>rows.objects.find(row=>matches(row,where.runId_kind_objectId_revision))||null,
      findFirst:async({where})=>rows.objects.filter(row=>matches(row,where)).sort((a,b)=>b.revision-a.revision)[0]||null,
      findMany:async({where})=>rows.objects.filter(row=>matches(row,where)),
    },
    researchStep:{
      create:async({data})=>{writes.push({model:'step',data});rows.steps.push(data);return data;},
      findUnique:async({where})=>rows.steps.find(row=>row.id===where.id)||null,
      findFirst:async({where})=>rows.steps.find(row=>matches(row,where))||null,
      findMany:async({where})=>rows.steps.filter(row=>matches(row,where)),
      update:async({where,data})=>{
        writes.push({model:'step',data});const row=rows.steps.find(item=>item.id===where.id);
        Object.assign(row,data);return row;
      },
    },
    researchEvent:{
      create:async({data})=>{writes.push({model:'event',data});rows.events.push(data);return data;},
      findFirst:async()=>rows.events.at(-1)||null,
      findMany:async({where,take})=>rows.events.filter(row=>row.runId===where.runId&&row.seq>where.seq.gt).slice(0,take),
      findUnique:async({where})=>rows.events.find(row=>row.runId===where.runId_seq.runId&&row.seq===where.runId_seq.seq)||null,
    },
  };
  const keyProvider=async()=>key;
  const store=createPrivateWorkerStore({db,keyProvider,tenantId:run.userId});
  const events=createPrivateWorkerEventPort({db,keyProvider,tenantId:run.userId});
  const supportStore=createPrivateVerifySupportStore({db,keyProvider,tenantId:run.userId});
  const sourceId=randomUUID();
  const recipient=Buffer.concat([Buffer.from([4]),randomBytes(64)]).toString('base64');
  const state={brief:{topic:'Synthetic widget research',liveWeb:false,depth:'standard'},
    plan:{stageAttempt:1,sub_questions:['Synthetic widgets']},
    resultRecipientPublicKey:recipient,
    privateWrite:{mode:'source-only-short',baseStateRevision:2,planAttempt:1,sourceId,sourceRevision:1}};
  const source={provider:'user-upload',url:`user-upload://${sourceId}`,title:`${CANARY} uploaded source`,
    text:`${CANARY}. Blue widgets weigh four grams. Red widgets cost five coins. Green widgets bloom on Friday.`};
  const report={markdown:`# ${CANARY} report\n\nBlue widgets weigh four grams [1]. Red widgets cost five coins [1]. Green widgets bloom on Friday [1]. Purple widgets orbit Jupiter [2].`,
    citations:[{url:source.url,title:source.title},{url:'user-upload://unmatched',title:'Unmatched citation'}],
    inputDigest:'a'.repeat(64),verification:{status:'unverified'}};
  async function seed(){
    await store.putRunState(run,{expectedRevision:0,state:{...state,privateWrite:null}});
    await store.putRunState(run,{expectedRevision:1,state:{...state,privateWrite:null}});
    await store.putRunState(run,{expectedRevision:2,state});
    await store.putSource(run,{sourceId,source});
    await store.putReport(run,{version:1,report});
    const extraction=createPrivateVerifyExtractionRunner({store,events,model:MODEL,
      aiPort:{privateVerifiedTransport:'phala-aci-v1',infer:async()=>({choices:[{message:{content:JSON.stringify({claims})}}]})}});
    return extraction.run(run.id);
  }
  function assertSealed(){
    const persisted=JSON.stringify({rows,writes});
    assert.ok(!persisted.includes(CANARY));
    assert.ok(!persisted.includes('Blue widgets'));
    assert.ok(!persisted.includes('Red widgets'));
    assert.ok(!persisted.includes('Green widgets'));
    assert.ok(!persisted.includes('Purple widgets'));
  }
  return {run,rows,writes,legacy,db,store,supportStore,sourceId,seed,assertSealed,
    failClaimAt:n=>{failClaimAt=n;claimWrites=0;}};
}

function budget(f,{deny=false}={}){
  const ledger={reservations:new Map(),
    async reserve(args){
      if(deny){const error=new Error('PRIVATE_AI_MONTHLY_CAP');error.code='PRIVATE_AI_MONTHLY_CAP';throw error}
      if(this.reservations.has(args.runId))throw Error('duplicate reservation');
      this.reservations.set(args.runId,{...args,status:'reserved'});
    },
    async finalize(args){Object.assign(this.reservations.get(args.runId),args)},
  };
  const gate=createPrivateAiBudgetGate({ledger,ownerUserId:f.run.userId,
    monthlyAiCapMicroUsd:4000000,monthlyInfraCeilingMicroUsd:1000000,
    modelPriceCeilings:PRICE,clock:()=>new Date('2026-10-16T19:00:00Z')});
  return {gate,ledger};
}
function runner(f,{scores=[0.91,0.2,0.84],deny=false,mutate}={}){
  let calls=0;
  const {gate,ledger}=budget(f,{deny});
  const aiPort={privateVerifiedTransport:'phala-aci-v1',async infer({messages}){
    assert.equal(messages[0].role,'system');
    assert.ok(messages[1].content.includes('passage'));
    const index=calls++;
    if(mutate)await mutate(index);
    return {choices:[{message:{content:JSON.stringify({probability:scores[index]})}}]};
  }};
  return {job:createPrivateVerifySupportRunner({supportStore:f.supportStore,aiPort,budget:gate,model:MODEL}),
    calls:()=>calls,ledger};
}

test('judges only cited sampled passages, commits individually sealed claims, and replays without AI',async()=>{
  const f=fixture();await f.seed();
  const work=runner(f);
  const result=await work.job.run(f.run.id);
  assert.deepEqual(result,{claims:4,supported:2,unknown:2,replayed:false,verified:false,committed:true});
  assert.equal(work.calls(),3);
  assert.equal(work.ledger.reservations.get(f.run.id).maxCalls,3);
  const claims=await f.store.listClaims(f.run);
  assert.equal(claims.length,4);
  assert.deepEqual(claims.map(row=>row.value.status),['supported','unknown','supported','unknown']);
  assert.deepEqual(claims[3].value.passages,[]);
  assert.equal(f.rows.objects.filter(row=>row.kind==='claim').length,4);
  assert.equal(f.rows.steps.filter(row=>row.kind==='verify-support'&&row.status==='done').length,1);
  assert.deepEqual(await work.job.run(f.run.id),{...result,replayed:true});
  assert.equal(work.calls(),3);
  assert.equal(f.rows.objects.filter(row=>row.kind==='claim').length,4);
  f.assertSealed();
});

test('atomic claim failure rolls back all claims; completed checkpoint replays without inference',async()=>{
  const f=fixture();await f.seed();f.failClaimAt(2);
  const work=runner(f);
  await assert.rejects(work.job.run(f.run.id),{code:'PRIVATE_SUPPORT_UNAVAILABLE'});
  assert.equal(work.calls(),3);
  assert.equal(f.rows.objects.filter(row=>row.kind==='claim').length,0);
  assert.equal(f.rows.steps.find(row=>row.kind==='verify-support').status,'done');
  const result=await work.job.run(f.run.id);
  assert.equal(result.replayed,false);
  assert.equal(result.claims,4);
  assert.equal(work.calls(),3);
  assert.equal(f.rows.objects.filter(row=>row.kind==='claim').length,4);
  f.assertSealed();
});

test('owner, status, version and changed source reject stale support before any AI',async()=>{
  for(const change of ['owner','status','version','source']){
    const f=fixture();await f.seed();
    if(change==='owner')f.run.userId='different-owner';
    if(change==='status')f.run.status='complete';
    if(change==='version')f.run.versions=2;
    if(change==='source')await f.store.putSource(f.run,{sourceId:f.sourceId,revision:2,
      source:{provider:'user-upload',url:`user-upload://${f.sourceId}`,title:CANARY,text:'Changed source'}});
    const work=runner(f);
    await assert.rejects(work.job.run(f.run.id),{code:'PRIVATE_SUPPORT_UNAVAILABLE'});
    assert.equal(work.calls(),0,change);
    assert.equal(f.rows.objects.filter(row=>row.kind==='claim').length,0,change);
    f.assertSealed();
  }
});

test('a source change after the first paid call stops later dispatch and seals no verdict',async()=>{
  const f=fixture();await f.seed();
  const work=runner(f,{mutate:async index=>{
    if(index===0)await f.store.putSource(f.run,{sourceId:f.sourceId,revision:2,
      source:{provider:'user-upload',url:`user-upload://${f.sourceId}`,title:CANARY,text:'Changed source'}});
  }});
  await assert.rejects(work.job.run(f.run.id),{code:'PRIVATE_SUPPORT_UNAVAILABLE'});
  assert.equal(work.calls(),1);
  assert.equal(f.rows.steps.find(row=>row.kind==='verify-support').status,'failed');
  assert.equal(f.rows.objects.filter(row=>row.kind==='claim').length,0);
  f.assertSealed();
});

test('budget denial and malformed probability fail closed; neither can replay a paid stage',async()=>{
  for(const options of [{deny:true},{scores:[2]}]){
    const f=fixture();await f.seed();
    const work=runner(f,options);
    await assert.rejects(work.job.run(f.run.id),{code:'PRIVATE_SUPPORT_UNAVAILABLE'});
    assert.equal(work.calls(),options.deny?0:1);
    assert.equal(f.rows.steps.find(row=>row.kind==='verify-support').status,'failed');
    assert.equal(f.rows.objects.filter(row=>row.kind==='claim').length,0);
    await assert.rejects(work.job.run(f.run.id),{code:'PRIVATE_SUPPORT_UNAVAILABLE'});
    assert.equal(work.calls(),options.deny?0:1);
    f.assertSealed();
  }
});

test('a report claim without matching citation stays unknown without a budget reservation',async()=>{
  const f=fixture({claims:[CLAIMS[3]]});await f.seed();
  const work=runner(f);
  const result=await work.job.run(f.run.id);
  assert.deepEqual(result,{claims:1,supported:0,unknown:1,replayed:false,verified:false,committed:true});
  assert.equal(work.calls(),0);
  assert.equal(work.ledger.reservations.size,0);
  assert.deepEqual((await f.store.listClaims(f.run))[0].value.passages,[]);
  f.assertSealed();
});

test('ordinary plaintext claim or source rows block the sealed judging path',async()=>{
  for(const table of ['claims','sources']){
    const f=fixture();await f.seed();f.legacy[table]=1;
    const work=runner(f);
    await assert.rejects(work.job.run(f.run.id),{code:'PRIVATE_SUPPORT_UNAVAILABLE'});
    assert.equal(work.calls(),0);
    assert.equal(f.rows.steps.filter(row=>row.kind==='verify-support').length,0);
    assert.equal(f.rows.objects.filter(row=>row.kind==='claim').length,0);
    f.assertSealed();
  }
});

test('a partial preexisting claim set cannot be completed or passed off as replay',async()=>{
  const f=fixture();await f.seed();
  const work=runner(f);
  const first=await work.job.run(f.run.id);
  assert.equal(first.replayed,false);
  const committed=f.rows.objects.filter(row=>row.kind==='claim');
  f.rows.objects=f.rows.objects.filter(row=>row!==committed[0]);
  await assert.rejects(work.job.run(f.run.id),{code:'PRIVATE_SUPPORT_UNAVAILABLE'});
  assert.equal(work.calls(),3);
  f.assertSealed();
});

test('forged judged output or step pointer cannot commit supported claims',async()=>{
  const f=fixture();await f.seed();
  const run=await f.supportStore.loadRun(f.run.id);
  const claimed=await f.supportStore.begin(run);
  assert.equal(claimed.state,'claimed');
  const {snapshotDigest,source,report,extraction}=claimed.snapshot;
  const selected=privateSupportSelectedIndices(extraction,source,report);
  const probabilities=selected.map((index,i)=>({index,probability:[0.9,0.2,0.8][i]}));
  const valid=privateSupportOutput({snapshotDigest,source,report,extraction,probabilities});
  const forged=structuredClone(valid);forged.claims[1].status='supported';
  await assert.rejects(f.supportStore.finish(run,{lease:claimed.lease,output:forged}),{code:'PRIVATE_SUPPORT_UNAVAILABLE'});
  assert.equal(f.rows.objects.filter(row=>row.kind==='claim').length,0);
  await f.supportStore.finish(run,{lease:claimed.lease,output:valid});
  const step=f.rows.steps.find(row=>row.kind==='verify-support');
  step.output={...step.output,objectId:randomUUID()};
  await assert.rejects(f.supportStore.commitClaims(run),{code:'PRIVATE_SUPPORT_UNAVAILABLE'});
  assert.equal(f.rows.objects.filter(row=>row.kind==='claim').length,0);
  f.assertSealed();
});
