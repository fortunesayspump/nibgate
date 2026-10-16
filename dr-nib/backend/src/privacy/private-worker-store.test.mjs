import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createPrivateWorkerStore} from './private-worker-store.js';
import {openPrivatePayload,sealPrivatePayload} from './sealed-payload.js';
import {generateHpkeRecipient,sealHpkeReport,openHpkeReport,recipientIdForPublicKey} from './source-hpke.js';

const CANARY='HARMLESS_SYNTHETIC_PRIVATE_CANARY';
function fixture(){
  const run={id:randomUUID(),userId:'tenant_fixture',metadata:{privacyMode:'confidential',schemaVersion:1},
    title:null,description:null,brief:{encrypted:true},plan:null,pendingQuestion:null,pendingGuidance:null,
    status:'running',versions:1,depth:'standard'};
  const rows={objects:[],steps:[],reports:[]},writes=[];
  let throwWrite=false,throwStatus=false;
  const matches=(row,where)=>Object.entries(where||{}).every(([k,v])=>row[k]===v);
  const db={
    $queryRaw:async()=>[{locked:'1'}],
    $transaction:async fn=>{
      const before=structuredClone(rows);
      const oldRun=structuredClone(run);
      try{return await fn(db);}catch(error){rows.objects=before.objects;rows.steps=before.steps;rows.reports=before.reports;Object.assign(run,oldRun);throw error;}
    },
    researchRun:{findUnique:async({where})=>where.id===run.id?run:null,
      update:async({data})=>{if(throwStatus)throw new Error(CANARY);writes.push({model:'run',data});Object.assign(run,data);return run;}},
    privateWorkerObject:{
      create:async({data})=>{if(throwWrite)throw new Error(CANARY);writes.push({model:'object',data});rows.objects.push(data);return data;},
      findUnique:async({where})=>{const k=where.runId_kind_objectId_revision;return rows.objects.find(x=>matches(x,k))||null;},
      findFirst:async({where})=>rows.objects.filter(x=>matches(x,where)).sort((a,b)=>b.revision-a.revision)[0]||null,
      findMany:async({where})=>rows.objects.filter(x=>matches(x,where)).sort((a,b)=>a.objectId.localeCompare(b.objectId)||b.revision-a.revision),
    },
    researchStep:{
      create:async({data})=>{if(throwWrite)throw new Error(CANARY);writes.push({model:'step',data});rows.steps.push(data);return data;},
      findUnique:async({where})=>rows.steps.find(x=>x.id===where.id)||null,
      findFirst:async({where})=>rows.steps.find(x=>matches(x,where))||null,
      findMany:async({where})=>rows.steps.filter(x=>matches(x,where)),
      count:async({where})=>rows.steps.filter(x=>matches(x,where)).length,
      update:async({where,data})=>{if(throwWrite)throw new Error(CANARY);writes.push({model:'step',data});const row=rows.steps.find(x=>x.id===where.id);Object.assign(row,data);return row;},
    },
    researchReport:{
      create:async({data})=>{if(throwWrite)throw new Error(CANARY);writes.push({model:'report',data});rows.reports.push(data);return data;},
      findFirst:async({where})=>rows.reports.find(x=>matches(x,where))||null,
    },
  };
  const key=randomBytes(32);
  const make=(keyProvider=async()=>key)=>createPrivateWorkerStore({db,keyProvider,tenantId:run.userId});
  return {run,db,rows,writes,key,make,setThrowWrite:value=>{throwWrite=value;},setThrowStatus:value=>{throwStatus=value;}};
}

async function preparedCompletion(){
  const f=fixture(),store=f.make();f.run.status='planning';
  const browser=await generateHpkeRecipient(),recipient=Buffer.from(browser.publicKey).toString('base64');
  const sourceId=randomUUID();
  const initial={brief:{topic:CANARY,liveWeb:false,lengthWords:300},plan:null,pendingGuidance:null,
    resultRecipientPublicKey:recipient};
  await store.putRunState(f.run,{expectedRevision:0,state:initial});
  await store.putSource(f.run,{sourceId,source:{provider:'user-upload',url:`user-upload://${sourceId}`,title:CANARY,text:CANARY}});
  const plan=await store.beginStage({run:f.run,kind:'plan',attempt:1});
  const planOutput={sub_questions:[CANARY],inputDigest:'synthetic'};
  await store.finishStage({run:f.run,kind:'plan',attempt:1,lease:plan.lease,output:planOutput});
  await store.commitPlan(f.run,{attempt:1,expectedRevision:1,nextState:{...initial,plan:{...planOutput,stageAttempt:1}}});
  await store.startSourceOnlyWrite(f.run);
  const report={markdown:`# Synthetic report\n\n${CANARY} [1].`,inputDigest:'a'.repeat(64),
    citations:[],source:'llm',model:'synthetic',verification:{status:'unverified'}};
  const write=await store.beginStage({run:f.run,kind:'write',attempt:1});
  await store.finishStage({run:f.run,kind:'write',attempt:1,lease:write.lease,output:report});
  await store.commitReport(f.run,{version:1,stateRevision:3,sourceVersions:[{objectId:sourceId,revision:1}],report});
  const context={tenantId:f.run.userId,runId:f.run.id,objectId:f.run.id,revision:1,purpose:'report',
    recipientId:recipientIdForPublicKey(browser.publicKey)};
  const envelope=await sealHpkeReport({recipientPublicKey:browser.publicKey,context,
    plaintext:Buffer.from(JSON.stringify({markdown:report.markdown}))});
  return {f,store,browser,report,envelope};
}

test('actual worker run, source, claim, decision and report shapes stay sealed in Prisma writes',async()=>{
  const f=fixture(),store=f.make(),run=await store.loadRun(f.run.id);
  assert.deepEqual(await store.putRunState(run,{expectedRevision:0,state:{brief:{topic:CANARY,liveWeb:false},plan:{sub_questions:[CANARY]},pendingGuidance:{text:CANARY},pendingQuestion:{text:CANARY}}}),{revision:1});
  assert.equal((await store.getRunState(run)).state.brief.topic,CANARY);
  const sourceId=randomUUID(),claimId=randomUUID();
  await store.putSource(run,{sourceId,source:{url:`https://example.test/${CANARY}`,title:CANARY,domain:CANARY,text:CANARY,trust:0.8}});
  await store.putClaim(run,{claimId,claim:{text:CANARY,status:'unknown',passages:[{excerpt:CANARY}]}});
  await store.appendDecision(run,{seq:1,decision:{kind:'round-review',step:'round-0',prompt:CANARY,question:{text:CANARY},output:{learnings:[CANARY]}}});
  await store.putReport(run,{version:1,report:{markdown:CANARY,citations:[{title:CANARY}]}});
  assert.equal((await store.listSources(run))[0].value.title,CANARY);
  assert.equal((await store.listClaims(run))[0].value.text,CANARY);
  assert.equal((await store.listDecisions(run))[0].value.prompt,CANARY);
  assert.equal((await store.getReport(run,1)).markdown,CANARY);
  assert.ok(!JSON.stringify(f.writes).includes(CANARY));
  assert.ok(!JSON.stringify(f.rows).includes(CANARY));
  assert.equal(f.rows.objects.length,5);
  assert.equal(f.rows.steps.length,0);
});

test('stage checkpoint is sealed, idempotent and an uncertain prior attempt never replays',async()=>{
  const f=fixture(),store=f.make(),run=await store.loadRun(f.run.id);
  const claimed=await store.beginStage({run,kind:'search',attempt:1000});
  assert.equal(claimed.state,'claimed');
  assert.equal((await store.beginStage({run,kind:'search',attempt:1000})).state,'uncertain');
  await store.finishStage({run,kind:'search',attempt:1000,lease:claimed.lease,output:{queries:[CANARY],results:[{url:CANARY}]}});
  assert.deepEqual(await store.beginStage({run,kind:'search',attempt:1000}),{state:'done',output:{queries:[CANARY],results:[{url:CANARY}]}});
  assert.ok(!JSON.stringify(f.writes).includes(CANARY));
  assert.ok(!JSON.stringify(f.rows).includes(CANARY));
  const second=await store.beginStage({run,kind:'fetch',attempt:1000});
  assert.equal(second.state,'claimed');
  assert.equal(await store.failStage({run,runId:run.id,kind:'fetch',attempt:1000,lease:second.lease,code:'PRIVATE_STAGE_FAILED'}),true);
  assert.equal((await store.beginStage({run,kind:'fetch',attempt:1000})).state,'uncertain');
  assert.equal((await store.beginStage({run,kind:'fetch',attempt:1001})).state,'uncertain');
  assert.equal(await store.failStage({run,runId:run.id,kind:'fetch',attempt:1000,lease:second.lease,code:'PRIVATE_STAGE_FAILED'}),false);
});

test('active parent execute journal permits one stage but another active step blocks it',async()=>{
  const f=fixture(),store=f.make();f.run.status='planning';
  f.rows.steps.push({id:randomUUID(),runId:f.run.id,kind:'private-execute',status:'active',attempt:1});
  const first=await store.beginStage({run:f.run,kind:'plan',attempt:1});
  assert.equal(first.state,'claimed');
  const second=await store.beginStage({run:f.run,kind:'plan',attempt:1});
  assert.equal(second.state,'uncertain');
  await store.finishStage({run:f.run,kind:'plan',attempt:1,lease:first.lease,output:{plan:CANARY}});
  f.run.status='running';
  f.rows.steps.push({id:randomUUID(),runId:f.run.id,kind:'unexpected',status:'active',attempt:1});
  assert.equal((await store.beginStage({run:f.run,kind:'fetch',attempt:1000})).state,'uncertain');
  assert.ok(!JSON.stringify(f.writes).includes(CANARY));
});

test('wrong tenant, changed classification, wrong key, tamper and revision fail closed',async()=>{
  const f=fixture(),store=f.make(),run=await store.loadRun(f.run.id);
  const id=randomUUID();await store.putSource(run,{sourceId:id,source:{title:CANARY}});
  let keyCalls=0;
  const watched=f.make(async()=>{keyCalls++;return f.key;});
  await assert.rejects(watched.putClaim({...run,userId:'other'},{claim:{text:CANARY}}),/PRIVATE_STORE_UNAVAILABLE/);
  assert.equal(keyCalls,0);
  await assert.rejects(store.getSource({...run,userId:'other'},id),/PRIVATE_STORE_UNAVAILABLE/);
  assert.equal(await store.getSource(run,id,2),null);
  const wrong=f.make(async()=>randomBytes(32));
  await assert.rejects(wrong.getSource(run,id),/PRIVATE_STORE_UNAVAILABLE/);
  f.rows.objects[0].envelope.tag=Buffer.alloc(16).toString('base64');
  await assert.rejects(store.getSource(run,id),/PRIVATE_STORE_UNAVAILABLE/);
  f.run.metadata={privacyMode:'legacy',schemaVersion:1};
  await assert.rejects(store.putClaim(run,{claim:{text:CANARY}}),/PRIVATE_STORE_UNAVAILABLE/);
});

test('state compare-and-set and duplicate artifacts refuse ambiguous replay',async()=>{
  const f=fixture(),store=f.make(),run=await store.loadRun(f.run.id);
  await store.putRunState(run,{expectedRevision:0,state:{brief:{topic:CANARY}}});
  await assert.rejects(store.putRunState(run,{expectedRevision:0,state:{brief:{topic:CANARY}}}),/PRIVATE_STATE_CONFLICT/);
  await store.putRunState(run,{expectedRevision:1,state:{brief:{topic:CANARY+'2'}}});
  assert.equal((await store.getRunState(run)).revision,2);
  const id=randomUUID();await store.putClaim(run,{claimId:id,claim:{text:CANARY}});
  await assert.rejects(store.putClaim(run,{claimId:id,claim:{text:CANARY}}),/PRIVATE_OBJECT_CONFLICT/);
  assert.ok(!JSON.stringify(f.writes).includes(CANARY));
});

test('atomic draft initialization seals state and source, then fixed planning status; identical replay only',async()=>{
  const f=fixture(),store=f.make();f.run.status='draft';
  const sourceId=randomUUID(),state={brief:{topic:CANARY,liveWeb:false},plan:null,pendingGuidance:null};
  const source={provider:'user-upload',url:`private-source://${sourceId}`,title:CANARY,text:CANARY};
  const input={state,sources:[{sourceId,source}]};
  assert.deepEqual(await store.initializeRunStateAndPlanning(f.run,input),{revision:1,status:'planning',replayed:false});
  assert.equal(f.run.status,'planning');
  assert.equal((await store.getRunState(f.run)).state.brief.topic,CANARY);
  assert.equal((await store.getSource(f.run,sourceId)).text,CANARY);
  const writes=f.writes.length;
  assert.deepEqual(await store.initializeRunStateAndPlanning(f.run,input),{revision:1,status:'planning',replayed:true});
  assert.equal(f.writes.length,writes);
  await assert.rejects(store.initializeRunStateAndPlanning(f.run,{...input,sources:[{sourceId,source:{...source,text:'changed'}}]}),/PRIVATE_STATE_CONFLICT/);
  await assert.rejects(store.initializeRunStateAndPlanning(f.run,{state,sources:[]}),/PRIVATE_STORE_UNAVAILABLE/);
  assert.ok(!JSON.stringify(f.writes).includes(CANARY));
});

test('initialization transaction failure cannot leave planning without its sealed source',async()=>{
  const f=fixture(),store=f.make();f.run.status='draft';f.setThrowStatus(true);
  const sourceId=randomUUID();
  await assert.rejects(store.initializeRunStateAndPlanning(f.run,{state:{brief:{topic:CANARY,liveWeb:false},plan:null,pendingGuidance:null},
    sources:[{sourceId,source:{provider:'user-upload',url:`private-source://${sourceId}`,title:CANARY,text:CANARY}}]}),/PRIVATE_STORE_UNAVAILABLE/);
  assert.equal(f.run.status,'draft');
  assert.equal(f.rows.objects.length,0);
  assert.ok(!JSON.stringify(f.writes).includes(CANARY));
});

test('planned source-only run starts writing atomically and replays only the same sealed snapshot',async()=>{
  const f=fixture(),store=f.make();f.run.status='planning';
  const sourceId=randomUUID();
  const recipient=Buffer.concat([Buffer.from([4]),randomBytes(64)]).toString('base64');
  const state={brief:{topic:CANARY,liveWeb:false,length:'brief'},plan:null,pendingGuidance:null,
    resultRecipientPublicKey:recipient};
  await store.putRunState(f.run,{expectedRevision:0,state});
  await store.putSource(f.run,{sourceId,source:{provider:'user-upload',url:`private-source://${sourceId}`,
    title:CANARY,text:CANARY}});
  const claimed=await store.beginStage({run:f.run,kind:'plan',attempt:1});
  const output={sub_questions:[CANARY],inputDigest:'synthetic'};
  await store.finishStage({run:f.run,kind:'plan',attempt:1,lease:claimed.lease,output});
  await store.commitPlan(f.run,{attempt:1,expectedRevision:1,nextState:{...state,plan:{...output,stageAttempt:1}}});
  assert.equal(f.run.status,'planned');
  assert.deepEqual(await store.startSourceOnlyWrite(f.run),{status:'running',revision:3,replayed:false});
  assert.equal(f.run.status,'running');
  assert.deepEqual((await store.getRunState(f.run)).state.privateWrite,
    {mode:'source-only-short',planAttempt:1,baseStateRevision:2,sourceId,sourceRevision:1});
  const writes=f.writes.length;
  assert.deepEqual(await store.startSourceOnlyWrite(f.run),{status:'running',revision:3,replayed:true});
  assert.equal(f.writes.length,writes);
  await store.putSource(f.run,{sourceId,revision:2,source:{provider:'user-upload',url:`private-source://${sourceId}`,
    title:CANARY,text:'Changed source'}});
  await assert.rejects(store.startSourceOnlyWrite(f.run),/PRIVATE_WRITE_CONFLICT/);
  assert.ok(!JSON.stringify(f.writes).includes(CANARY));
});

test('source-only transition rejects a changed recipient and rolls back on status failure',async()=>{
  async function planned(){
    const f=fixture(),store=f.make();f.run.status='planning';
    const sourceId=randomUUID(),recipient=Buffer.concat([Buffer.from([4]),randomBytes(64)]).toString('base64');
    const state={brief:{topic:CANARY,liveWeb:false,length:'brief'},plan:null,pendingGuidance:null,resultRecipientPublicKey:recipient};
    await store.putRunState(f.run,{expectedRevision:0,state});
    await store.putSource(f.run,{sourceId,source:{provider:'user-upload',url:`private-source://${sourceId}`,title:CANARY,text:CANARY}});
    const claim=await store.beginStage({run:f.run,kind:'plan',attempt:1});
    await store.finishStage({run:f.run,kind:'plan',attempt:1,lease:claim.lease,output:{sub_questions:[CANARY]}});
    await store.commitPlan(f.run,{attempt:1,expectedRevision:1,nextState:{...state,plan:{sub_questions:[CANARY],stageAttempt:1}}});
    return {f,store,state,sourceId};
  }
  const changed=await planned();
  await changed.store.putRunState(changed.f.run,{expectedRevision:2,state:{...changed.state,
    plan:{sub_questions:[CANARY],stageAttempt:1},resultRecipientPublicKey:Buffer.concat([Buffer.from([4]),randomBytes(64)]).toString('base64')}});
  await assert.rejects(changed.store.startSourceOnlyWrite(changed.f.run),/PRIVATE_WRITE_CONFLICT/);
  const revised=await planned();
  await revised.store.putSource(revised.f.run,{sourceId:revised.sourceId,revision:2,
    source:{provider:'user-upload',url:`private-source://${revised.sourceId}`,title:CANARY,text:'Revision two'}});
  await assert.rejects(revised.store.startSourceOnlyWrite(revised.f.run),/PRIVATE_WRITE_CONFLICT/);
  const failed=await planned();failed.f.setThrowStatus(true);
  await assert.rejects(failed.store.startSourceOnlyWrite(failed.f.run),/PRIVATE_STORE_UNAVAILABLE/);
  assert.equal(failed.f.run.status,'planned');
  assert.equal((await failed.store.getRunState(failed.f.run)).revision,2);
  assert.ok(!JSON.stringify(failed.f.rows).includes(CANARY));
});

test('sealed source-only report and browser ciphertext complete atomically with stable receipt',async()=>{
  const {f,store,browser,report,envelope}=await preparedCompletion();
  const receipt=await store.completeSourceOnlyRun(f.run,{reportId:f.run.id,envelope});
  assert.deepEqual(receipt,{id:f.run.id,version:1,encrypted:true,replayed:false});
  assert.equal(f.run.status,'complete');
  assert.equal(f.rows.reports.length,1);
  const stored=JSON.parse(f.rows.reports[0].markdown);
  const opened=await openHpkeReport({recipientPrivateKey:browser.privateKey,
    expectedContext:envelope.context,envelope:stored.envelope});
  assert.equal(JSON.parse(new TextDecoder().decode(opened)).markdown,report.markdown);
  const writes=f.writes.length;
  assert.deepEqual(await store.completeSourceOnlyRun(f.run,{reportId:f.run.id,envelope}),
    {id:f.run.id,version:1,encrypted:true,replayed:true});
  assert.equal(f.writes.length,writes);
  assert.ok(!JSON.stringify(f.writes).includes(CANARY));
});

test('lost response, status failure, wrong recipient and changed ciphertext cannot falsely complete',async()=>{
  const {f,store,browser,report,envelope}=await preparedCompletion();
  f.setThrowStatus(true);
  await assert.rejects(store.completeSourceOnlyRun(f.run,{reportId:f.run.id,envelope}),/PRIVATE_STORE_UNAVAILABLE/);
  assert.equal(f.run.status,'running');assert.equal(f.rows.reports.length,0);
  f.setThrowStatus(false);
  const other=await generateHpkeRecipient();
  const wrong=await sealHpkeReport({recipientPublicKey:other.publicKey,
    context:{...envelope.context,recipientId:recipientIdForPublicKey(other.publicKey)},
    plaintext:Buffer.from(JSON.stringify({markdown:report.markdown}))});
  await assert.rejects(store.completeSourceOnlyRun(f.run,{reportId:f.run.id,envelope:wrong}),/PRIVATE_COMPLETE_CONFLICT/);
  assert.equal(f.run.status,'running');assert.equal(f.rows.reports.length,0);
  await store.completeSourceOnlyRun(f.run,{reportId:f.run.id,envelope});
  const changed=await sealHpkeReport({recipientPublicKey:browser.publicKey,context:envelope.context,
    plaintext:Buffer.from(JSON.stringify({markdown:report.markdown}))});
  await assert.rejects(store.completeSourceOnlyRun(f.run,{reportId:f.run.id,envelope:changed}),/PRIVATE_COMPLETE_CONFLICT/);
  assert.equal(f.rows.reports.length,1);
  assert.ok(!JSON.stringify(f.rows).includes(CANARY));
});

test('new stage claims reject deleted and terminal runs before any provider work',async()=>{
  const f=fixture(),store=f.make(),run=await store.loadRun(f.run.id);
  f.run.status='ended';
  assert.equal((await store.beginStage({run,kind:'write',attempt:1})).state,'uncertain');
  assert.equal(f.rows.steps.length,0);
  f.run.status='running';f.run.deletedAt=new Date();
  await assert.rejects(store.beginStage({run,kind:'write',attempt:1}),/PRIVATE_STAGE_UNAVAILABLE/);
  assert.equal(f.rows.steps.length,0);
});

test('a terminal transition after a model call cannot checkpoint stage output',async()=>{
  const f=fixture(),store=f.make();f.run.status='planning';
  const run=await store.loadRun(f.run.id);
  const claimed=await store.beginStage({run,kind:'plan',attempt:1});
  assert.equal(claimed.state,'claimed');
  f.run.status='ended';
  await assert.rejects(store.finishStage({run,kind:'plan',attempt:1,lease:claimed.lease,
    output:{sub_questions:[CANARY]}}),/PRIVATE_STAGE_UNAVAILABLE/);
  assert.equal(f.rows.steps[0].status,'active');
  assert.equal(f.rows.objects.length,0);
  assert.ok(!JSON.stringify(f.writes).includes(CANARY));
});

test('database, key-provider and serialization exceptions never expose content',async()=>{
  const f=fixture(),run=f.run;
  const badKey=f.make(async()=>{throw new Error(CANARY)});
  const toxic={toJSON(){throw new Error(CANARY)}};
  for(const work of [badKey.putSource(run,{source:{text:CANARY}}),f.make().putReport(run,{version:1,report:toxic})])
    await assert.rejects(work,error=>!error.message.includes(CANARY));
  f.setThrowWrite(true);
  await assert.rejects(f.make().putClaim(run,{claim:{text:CANARY}}),error=>!error.message.includes(CANARY));
  f.run.status='planning';
  const claim=await f.make().beginStage({run,kind:'plan',attempt:1}).catch(error=>{assert.ok(!error.message.includes(CANARY));return null;});
  assert.equal(claim,null);
});

test('new state, claim and worker-source purposes bind tenant, object and revision',()=>{
  const key=randomBytes(32),runId=randomUUID(),objectId=randomUUID();
  for(const purpose of ['state','claim','worker-source']){
    const context={tenantId:'tenant_fixture',runId,objectId,revision:3,purpose};
    const envelope=sealPrivatePayload({key,context,plaintext:Buffer.from(CANARY)});
    assert.equal(openPrivatePayload({key,expectedContext:context,envelope}).toString(),CANARY);
    assert.throws(()=>openPrivatePayload({key,expectedContext:{...context,revision:4},envelope}));
    assert.throws(()=>openPrivatePayload({key,expectedContext:{...context,tenantId:'another'},envelope}));
    assert.throws(()=>openPrivatePayload({key,expectedContext:{...context,objectId:randomUUID()},envelope}));
  }
});
