import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createPrivateWorkerStore} from './private-worker-store.js';
import {createPrivateVerifySupportStore} from './private-verify-support-store.js';
import {createPrivateVerifiedCompletionStore} from './private-verified-completion.js';
import {privateSupportDigest,privateSupportOutput} from './private-verify-support-core.js';
import {generateHpkeRecipient,recipientIdForPublicKey,sealHpkeReport,openHpkeReport} from './source-hpke.js';
import {sealPrivatePayload} from './sealed-payload.js';

const CANARY='HARMLESS_SYNTHETIC_VERIFIED_COMPLETION_CANARY';
const matches=(row,where={})=>Object.entries(where).every(([key,value])=>row[key]===value);

function fixture(){
  const run={id:randomUUID(),userId:'synthetic-completion-owner',metadata:{privacyMode:'confidential',schemaVersion:1},
    title:null,description:null,brief:{encrypted:true},plan:null,pendingQuestion:null,pendingGuidance:null,
    deletedAt:null,status:'planning',versions:1,depth:'standard'};
  const rows={objects:[],steps:[],reports:[]},writes=[];
  const key=randomBytes(32),legacy={claims:0,sources:0};
  let failReport=false,failStatus=false,raceMode=null,chain=Promise.resolve();
  const db={
    $queryRaw:async()=>[{locked:'1'}],
    $transaction:fn=>{
      const current=chain.then(async()=>{
        const prior=structuredClone({rows,run});
        try{return await fn(db)}catch(error){
          rows.objects=prior.rows.objects;rows.steps=prior.rows.steps;rows.reports=prior.rows.reports;
          Object.assign(run,prior.run);throw error;
        }
      });
      chain=current.catch(()=>{});return current;
    },
    researchRun:{findUnique:async({where})=>where.id===run.id?run:null,
      update:async({data})=>{if(failStatus)throw Error('injected synthetic status failure');
        writes.push({model:'run',data});Object.assign(run,data);return run;},
      updateMany:async({where,data})=>{
        if(failStatus)throw Error('injected synthetic status failure');
        if(raceMode==='status')run.status='cancelled';
        if(raceMode==='deletedAt')run.deletedAt=new Date('2026-10-16T20:00:00Z');
        if(raceMode==='classification')run.metadata={privacyMode:'public',schemaVersion:1};
        if(where.id!==run.id||where.userId!==run.userId||where.status!==run.status||
           where.versions!==run.versions||where.deletedAt!==run.deletedAt||
           where.metadata?.path?.join('.')!=='privacyMode'||
           where.metadata.equals!==run.metadata.privacyMode)return {count:0};
        writes.push({model:'run',data});Object.assign(run,data);return {count:1};
      }},
    researchClaim:{count:async()=>legacy.claims},
    researchSource:{count:async()=>legacy.sources},
    privateWorkerObject:{
      create:async({data})=>{writes.push({model:'object',data});rows.objects.push(data);return data;},
      findUnique:async({where})=>rows.objects.find(row=>matches(row,where.runId_kind_objectId_revision))||null,
      findFirst:async({where})=>rows.objects.filter(row=>matches(row,where)).sort((a,b)=>b.revision-a.revision)[0]||null,
      findMany:async({where})=>rows.objects.filter(row=>matches(row,where)),
    },
    researchStep:{
      create:async({data})=>{writes.push({model:'step',data});rows.steps.push(data);return data;},
      findUnique:async({where})=>rows.steps.find(row=>row.id===where.id)||null,
      findFirst:async({where})=>rows.steps.find(row=>matches(row,where))||null,
      findMany:async({where})=>rows.steps.filter(row=>matches(row,where)),
      update:async({where,data})=>{writes.push({model:'step',data});const row=rows.steps.find(item=>item.id===where.id);
        Object.assign(row,data);return row;},
    },
    researchReport:{
      findFirst:async({where})=>rows.reports.find(row=>matches(row,where))||null,
      create:async({data})=>{if(failReport)throw Error('injected synthetic report failure');
        writes.push({model:'report',data});rows.reports.push(data);return data;},
    },
  };
  const keyProvider=async()=>key;
  const store=createPrivateWorkerStore({db,keyProvider,tenantId:run.userId});
  const support=createPrivateVerifySupportStore({db,keyProvider,tenantId:run.userId});
  const complete=createPrivateVerifiedCompletionStore({db,keyProvider,tenantId:run.userId});
  const sourceId=randomUUID(),source={provider:'user-upload',url:`user-upload://${sourceId}`,
    title:`${CANARY} evidence`,text:`${CANARY}. Copper widgets weigh five grams.`};
  const report={markdown:`# ${CANARY} report\n\nCopper widgets weigh five grams [1].`,
    citations:[{url:source.url,title:source.title}],inputDigest:'a'.repeat(64),verification:{status:'unverified'}};
  async function prepare(){
    const recipient=await generateHpkeRecipient();
    const initial={brief:{topic:'Synthetic copper widgets',liveWeb:false,depth:'standard',lengthWords:300},
      plan:null,pendingGuidance:null,resultRecipientPublicKey:Buffer.from(recipient.publicKey).toString('base64')};
    await store.putRunState(run,{expectedRevision:0,state:initial});
    await store.putSource(run,{sourceId,source});
    const plan=await store.beginStage({run,kind:'plan',attempt:1});
    const planOutput={sub_questions:['Synthetic copper widgets'],inputDigest:'b'.repeat(64)};
    await store.finishStage({run,kind:'plan',attempt:1,lease:plan.lease,output:planOutput});
    await store.commitPlan(run,{attempt:1,expectedRevision:1,nextState:{...initial,
      plan:{...planOutput,stageAttempt:1}}});
    await store.startSourceOnlyWrite(run);
    const write=await store.beginStage({run,kind:'write',attempt:1});
    await store.finishStage({run,kind:'write',attempt:1,lease:write.lease,output:report});
    await store.commitReport(run,{version:1,stateRevision:3,sourceVersions:[{objectId:sourceId,revision:1}],report});
    const state=(await store.getRunState(run)).state;
    const reportDigest=privateSupportDigest({revision:3,brief:state.brief,recipient:state.resultRecipientPublicKey,
      marker:state.privateWrite,markdown:report.markdown,citations:report.citations,inputDigest:report.inputDigest});
    const extraction={scope:'extraction-only',verified:false,reason:'support-judge-not-configured',
      reportDigest,extractedClaims:1,reportChunks:1,coveredChars:report.markdown.length,
      reportCoverageComplete:true,claims:[{text:'Copper widgets weigh five grams.',citations:[1],status:'unknown'}]};
    const verify=await store.beginStage({run,kind:'verify',attempt:1});
    await store.finishStage({run,kind:'verify',attempt:1,lease:verify.lease,output:extraction});
    const claimed=await support.begin(run);
    assert.equal(claimed.state,'claimed');
    const output=privateSupportOutput({snapshotDigest:claimed.snapshot.snapshotDigest,extraction,source,report,
      probabilities:[{index:0,probability:0.92}]});
    await support.finish(run,{lease:claimed.lease,output});
    await support.commitClaims(run);
    const context={tenantId:run.userId,runId:run.id,objectId:run.id,revision:1,purpose:'report',
      recipientId:recipientIdForPublicKey(recipient.publicKey)};
    const envelope=await sealHpkeReport({recipientPublicKey:recipient.publicKey,context,
      plaintext:Buffer.from(JSON.stringify({markdown:report.markdown,scope:'protected-ai-sampled',verified:false}))});
    return {recipient,envelope,output};
  }
  function assertNoPlaintext(){
    const persisted=JSON.stringify({rows,writes});
    assert.ok(!persisted.includes(CANARY));
    assert.ok(!persisted.includes('Copper widgets'));
    assert.equal(legacy.claims,0);assert.equal(legacy.sources,0);
  }
  return {run,rows,writes,db,key,keyProvider,legacy,sourceId,report,store,support,complete,prepare,assertNoPlaintext,
    setFailReport:value=>{failReport=value;},setFailStatus:value=>{failStatus=value;},
    setRaceMode:value=>{raceMode=value;}};
}

test('protected claim manifest gates one atomic HPKE report completion and exact replay',async()=>{
  const f=fixture(),{recipient,envelope}=await f.prepare();
  const receipt=await f.complete.complete(f.run,{reportId:f.run.id,envelope});
  assert.deepEqual(receipt,{id:f.run.id,version:1,encrypted:true,replayed:false});
  assert.equal(f.run.status,'complete');
  assert.equal(f.rows.reports.length,1);
  assert.deepEqual(f.rows.reports[0].citations,[]);
  const stored=JSON.parse(f.rows.reports[0].markdown);
  assert.deepEqual(stored,{encrypted:true,format:'hpke-report-v2',envelope});
  const opened=await openHpkeReport({recipientPrivateKey:recipient.privateKey,
    expectedContext:envelope.context,envelope:stored.envelope});
  assert.equal(JSON.parse(Buffer.from(opened).toString()).scope,'protected-ai-sampled');
  assert.deepEqual(await f.complete.complete(f.run,{reportId:f.run.id,envelope}),{...receipt,replayed:true});
  assert.equal(f.rows.reports.length,1);
  f.assertNoPlaintext();
});

test('two completion stores race to one report; loser receives an exact replay receipt',async()=>{
  const f=fixture(),{envelope}=await f.prepare();
  const second=createPrivateVerifiedCompletionStore({db:f.db,keyProvider:f.keyProvider,tenantId:f.run.userId});
  const [a,b]=await Promise.all([
    f.complete.complete(f.run,{reportId:f.run.id,envelope}),
    second.complete(f.run,{reportId:f.run.id,envelope}),
  ]);
  assert.deepEqual([a.replayed,b.replayed].sort(),[false,true]);
  assert.equal(f.rows.reports.length,1);
  f.assertNoPlaintext();
});

test('report insertion or run update failure rolls back both writes and a retry succeeds',async()=>{
  for(const stage of ['report','status']){
    const f=fixture(),{envelope}=await f.prepare();
    if(stage==='report')f.setFailReport(true);else f.setFailStatus(true);
    await assert.rejects(f.complete.complete(f.run,{reportId:f.run.id,envelope}));
    assert.equal(f.rows.reports.length,0,stage);
    assert.equal(f.run.status,'running',stage);
    f.setFailReport(false);f.setFailStatus(false);
    const result=await f.complete.complete(f.run,{reportId:f.run.id,envelope});
    assert.equal(result.replayed,false);
    assert.equal(f.rows.reports.length,1);
    f.assertNoPlaintext();
  }
});

test('final compare-and-swap rejects status, deletion, or classification races and rolls report back',async()=>{
  for(const mode of ['status','deletedAt','classification']){
    const f=fixture(),{envelope}=await f.prepare();
    f.setRaceMode(mode);
    await assert.rejects(f.complete.complete(f.run,{reportId:f.run.id,envelope}),
      {code:'PRIVATE_VERIFIED_COMPLETE_CONFLICT'});
    assert.equal(f.rows.reports.length,0,mode);
    assert.equal(f.run.status,'running',mode); // fixture transaction rolls back its injected mutation
    f.setRaceMode(null);
    f.assertNoPlaintext();
  }
});

test('missing or partial sealed stage lineage refuses completion without plaintext release',async()=>{
  for(const change of ['manifest','claim','judge-pointer','plan-pointer','forged-claim','forged-manifest']){
    const f=fixture(),{envelope}=await f.prepare();
    const judge=f.rows.steps.find(row=>row.kind==='verify-support');
    if(change==='manifest')f.rows.objects=f.rows.objects.filter(row=>!(row.kind==='step'&&row.objectId===judge.id&&row.revision===2));
    if(change==='claim')f.rows.objects=f.rows.objects.filter(row=>row.kind!=='claim');
    if(change==='judge-pointer')judge.output={encrypted:true,format:'private-worker-object-v1',objectId:randomUUID(),revision:1};
    if(change==='plan-pointer'){
      const plan=f.rows.steps.find(row=>row.kind==='plan');
      plan.output={encrypted:true,format:'private-worker-object-v1',objectId:randomUUID(),revision:1};
    }
    if(change==='forged-claim'){
      const claim=f.rows.objects.find(row=>row.kind==='claim');
      claim.envelope=sealPrivatePayload({key:f.key,context:{tenantId:f.run.userId,runId:f.run.id,
        objectId:claim.objectId,revision:1,purpose:'claim'},plaintext:Buffer.from(JSON.stringify({text:'Forged',status:'supported'}))});
    }
    if(change==='forged-manifest'){
      const manifest=f.rows.objects.find(row=>row.kind==='step'&&row.objectId===judge.id&&row.revision===2);
      manifest.envelope=sealPrivatePayload({key:f.key,context:{tenantId:f.run.userId,runId:f.run.id,
        objectId:judge.id,revision:2,purpose:'step'},plaintext:Buffer.from(JSON.stringify({scope:'support-claim-commit',
        snapshotDigest:'f'.repeat(64),claimIds:[]}))});
    }
    await assert.rejects(f.complete.complete(f.run,{reportId:f.run.id,envelope}));
    assert.equal(f.run.status,'running',change);assert.equal(f.rows.reports.length,0,change);
    f.assertNoPlaintext();
  }
});

test('owner, version, terminal status, source change, and wrong recipient reject completion',async()=>{
  for(const change of ['owner','version','terminal','source','recipient','ordinary-claim','ordinary-source']){
    const f=fixture(),{envelope}=await f.prepare();
    let submitted=envelope;
    if(change==='owner')f.run.userId='other-owner';
    if(change==='version')f.run.versions=2;
    if(change==='terminal')f.run.status='cancelled';
    if(change==='source')await f.store.putSource(f.run,{sourceId:f.sourceId,revision:2,
      source:{provider:'user-upload',url:`user-upload://${f.sourceId}`,title:'Changed',text:'Changed evidence'}});
    if(change==='recipient'){
      const other=await generateHpkeRecipient();
      submitted=await sealHpkeReport({recipientPublicKey:other.publicKey,
        context:{...envelope.context,recipientId:recipientIdForPublicKey(other.publicKey)},
        plaintext:Buffer.from('synthetic other recipient')});
    }
    if(change==='ordinary-claim')f.legacy.claims=1;
    if(change==='ordinary-source')f.legacy.sources=1;
    await assert.rejects(f.complete.complete(f.run,{reportId:f.run.id,envelope:submitted}));
    assert.equal(f.rows.reports.length,0,change);
    if(change==='ordinary-claim')f.legacy.claims=0;
    if(change==='ordinary-source')f.legacy.sources=0;
    f.assertNoPlaintext();
  }
});

test('inconsistent completed replay and unexpected step fail closed',async()=>{
  const f=fixture(),{recipient,envelope}=await f.prepare();
  f.rows.steps.push({id:randomUUID(),runId:f.run.id,kind:'search',status:'done',attempt:1000});
  await assert.rejects(f.complete.complete(f.run,{reportId:f.run.id,envelope}));
  f.rows.steps.pop();
  await f.complete.complete(f.run,{reportId:f.run.id,envelope});
  const different=await sealHpkeReport({recipientPublicKey:recipient.publicKey,
    context:envelope.context,plaintext:Buffer.from('synthetic alternate ciphertext for same recipient')});
  await assert.rejects(f.complete.complete(f.run,{reportId:f.run.id,envelope:different}));
  assert.equal(f.rows.reports.length,1);
  f.assertNoPlaintext();
});
