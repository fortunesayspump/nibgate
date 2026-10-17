import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createPrivateVerifyExtractionRunner,privateReportVerificationChunks,privateSampleClaimsAcrossChunks} from './private-verify-extraction.js';
import {createPrivateWorkerStore} from './private-worker-store.js';
import {createPrivateWorkerEventPort} from './private-worker-events.js';

const CANARY='HARMLESS_SYNTHETIC_VERIFY_CANARY';
const LATE='HARMLESS_SYNTHETIC_VERIFY_LATE_CANARY';
function fixture(){
  const run={id:randomUUID(),userId:'synthetic_tenant',metadata:{privacyMode:'confidential',schemaVersion:1},
    title:null,description:null,brief:{encrypted:true},plan:null,pendingQuestion:null,pendingGuidance:null,
    deletedAt:null,status:'running',versions:1,depth:'standard'};
  const rows={objects:[],steps:[],events:[]},writes=[],key=randomBytes(32);
  let chain=Promise.resolve();
  const matches=(row,where)=>Object.entries(where||{}).every(([k,v])=>row[k]===v);
  const db={
    $queryRaw:async()=>[{locked:'1'}],
    $transaction:fn=>{
      const result=chain.then(async()=>{const old=structuredClone({...rows,run});
        try{return await fn(db);}catch(error){Object.assign(rows,{objects:old.objects,steps:old.steps,events:old.events});Object.assign(run,old.run);throw error;}});
      chain=result.catch(()=>{});return result;
    },
    researchRun:{findUnique:async({where})=>where.id===run.id?run:null,
      update:async({data})=>{writes.push({model:'run',data});Object.assign(run,data);return run;}},
    privateWorkerObject:{
      create:async({data})=>{writes.push({model:'object',data});rows.objects.push(data);return data;},
      findUnique:async({where})=>rows.objects.find(x=>matches(x,where.runId_kind_objectId_revision))||null,
      findFirst:async({where})=>rows.objects.filter(x=>matches(x,where)).sort((a,b)=>b.revision-a.revision)[0]||null,
      findMany:async({where})=>rows.objects.filter(x=>matches(x,where)).sort((a,b)=>a.objectId.localeCompare(b.objectId)||b.revision-a.revision),
    },
    researchStep:{
      create:async({data})=>{writes.push({model:'step',data});rows.steps.push(data);return data;},
      findUnique:async({where})=>rows.steps.find(x=>x.id===where.id)||null,
      findFirst:async({where})=>rows.steps.find(x=>matches(x,where))||null,
      findMany:async({where})=>rows.steps.filter(x=>matches(x,where)),
      count:async({where})=>rows.steps.filter(x=>matches(x,where)).length,
      update:async({where,data})=>{writes.push({model:'step',data});const row=rows.steps.find(x=>x.id===where.id);Object.assign(row,data);return row;},
    },
    researchEvent:{
      create:async({data})=>{writes.push({model:'event',data});rows.events.push(data);return data;},
      findFirst:async()=>rows.events.at(-1)||null,
      findMany:async({where,take})=>rows.events.filter(x=>x.runId===where.runId&&x.seq>where.seq.gt).slice(0,take),
      findUnique:async({where})=>rows.events.find(x=>x.runId===where.runId_seq.runId&&x.seq===where.runId_seq.seq)||null,
    },
  };
  const keyProvider=async()=>key;
  const store=createPrivateWorkerStore({db,keyProvider,tenantId:run.userId});
  const events=createPrivateWorkerEventPort({db,keyProvider,tenantId:run.userId});
  const sourceId=randomUUID();
  const recipient=Buffer.concat([Buffer.from([4]),randomBytes(64)]).toString('base64');
  const state={brief:{topic:'Verify the synthetic report',liveWeb:false,depth:'standard'},
    resultRecipientPublicKey:recipient,
    privateWrite:{mode:'source-only-short',baseStateRevision:2,planAttempt:1,sourceId,sourceRevision:1}};
  const markdown=`# Synthetic report\n\n${'first [1]. '.repeat(900)}\n\n${'middle [1]. '.repeat(900)}\n\n${LATE} ${CANARY} [1].`;
  const report={markdown,citations:[{url:`user-upload://${sourceId}`,title:'Synthetic source'}],
    inputDigest:'a'.repeat(64),verification:{status:'unverified'}};
  const setup=async()=>{
    await store.putRunState(run,{expectedRevision:0,state:{...state,privateWrite:null}});
    await store.putRunState(run,{expectedRevision:1,state:{...state,privateWrite:null}});
    await store.putRunState(run,{expectedRevision:2,state});
    await store.putSource(run,{sourceId,source:{provider:'user-upload',url:`user-upload://${sourceId}`,
      title:'Synthetic source',text:CANARY}});
    await store.putReport(run,{version:1,report});
  };
  return {run,rows,writes,store,events,report,sourceId,setup};
}
function runner(f,infer){return createPrivateVerifyExtractionRunner({store:f.store,events:f.events,model:'approved-model',
  aiPort:{privateVerifiedTransport:'phala-aci-v1',infer}});}
function sealed(f){assert.ok(!JSON.stringify(f.rows).includes(CANARY));assert.ok(!JSON.stringify(f.writes).includes(CANARY));
  assert.ok(!JSON.stringify(f.rows).includes(LATE));assert.ok(!JSON.stringify(f.writes).includes(LATE));}

test('actual verification chunk and sample logic covers late report content without certifying support',async()=>{
  const f=fixture();await f.setup();let calls=0,sawLate=false;
  const verify=runner(f,async({messages})=>{
    calls++;if(messages[1].content.includes(LATE))sawLate=true;
    assert.match(messages[0].content,/Extract verifiable factual claims/);
    return {choices:[{message:{content:JSON.stringify({claims:[{text:`Synthetic claim ${calls} ${CANARY}`,citations:[1]}]})}}]};
  });
  const result=await verify.run(f.run.id);
  assert.ok(calls>=2);assert.equal(sawLate,true);
  assert.equal(result.verified,false);assert.equal(result.reason,'support-judge-not-configured');
  assert.equal(result.reportCoverageComplete,true);assert.equal(result.claims.length,calls);
  assert.ok(result.claims.every(c=>c.status==='unknown'));
  assert.equal(f.rows.steps[0].status,'done');
  assert.equal(f.rows.steps[0].output.format,'private-worker-object-v1');
  assert.deepEqual(f.rows.events.map(e=>e.type),['step.started','step.finished']);
  sealed(f);
  assert.deepEqual(await verify.run(f.run.id),result);
  assert.equal(calls,result.reportChunks);
});

test('changed sealed state after inference cannot receive stale candidate claims',async()=>{
  const f=fixture();await f.setup();
  const verify=runner(f,async()=>{
    const before=await f.store.getRunState(f.run);
    await f.store.putRunState(f.run,{expectedRevision:before.revision,
      state:{...before.state,brief:{...before.state.brief,topic:'Changed synthetic brief'}}});
    return {choices:[{message:{content:JSON.stringify({claims:[{text:CANARY,citations:[1]}]})}}]};
  });
  await assert.rejects(verify.run(f.run.id),/PRIVATE_VERIFY_UNAVAILABLE/);
  assert.equal(f.rows.steps[0].status,'failed');
  sealed(f);
});

test('changed source after inference cannot receive stale candidate claims',async()=>{
  const f=fixture();await f.setup();
  const verify=runner(f,async()=>{
    await f.store.putSource(f.run,{sourceId:f.sourceId,revision:2,
      source:{provider:'user-upload',url:`user-upload://${f.sourceId}`,title:'Synthetic source',text:'Changed'}});
    return {choices:[{message:{content:JSON.stringify({claims:[{text:CANARY,citations:[1]}]})}}]};
  });
  await assert.rejects(verify.run(f.run.id),/PRIVATE_VERIFY_UNAVAILABLE/);
  assert.equal(f.rows.steps[0].status,'failed');sealed(f);
});

test('malformed claims and provider canary exceptions produce fixed errors and no plaintext claims',async()=>{
  const malformed=fixture();await malformed.setup();
  await assert.rejects(runner(malformed,async()=>({choices:[{message:{content:JSON.stringify({claims:[{text:CANARY,citations:[2]}]})}}]})).run(malformed.run.id),/PRIVATE_VERIFY_UNAVAILABLE/);
  assert.equal(malformed.rows.steps[0].status,'failed');sealed(malformed);
  const failed=fixture();await failed.setup();
  await assert.rejects(runner(failed,async()=>{throw new Error(CANARY);}).run(failed.run.id),/PRIVATE_VERIFY_UNAVAILABLE/);
  assert.equal(failed.rows.steps[0].status,'failed');sealed(failed);
});

test('unbranded AI and terminal runs cannot begin private verification',async()=>{
  const f=fixture();await f.setup();
  assert.throws(()=>createPrivateVerifyExtractionRunner({store:f.store,events:f.events,model:'approved-model',
    aiPort:{infer:async()=>null}}),/PRIVATE_VERIFY_UNAVAILABLE/);
  f.run.status='complete';let calls=0;
  await assert.rejects(runner(f,async()=>{calls++;return null;}).run(f.run.id),/PRIVATE_VERIFY_UNAVAILABLE/);
  assert.equal(calls,0);sealed(f);
});

test('sampling spreads candidate claims across chunks and never invents support',()=>{
  const chunks=privateReportVerificationChunks('A'.repeat(11000)+'\n\n'+LATE);
  assert.equal(chunks.complete,true);assert.ok(chunks.chunks.at(-1).includes(LATE));
  assert.deepEqual(privateSampleClaimsAcrossChunks([[{text:'first'}],[{text:'middle'}],[{text:'last'}]],2),
    [{text:'first'},{text:'last'}]);
});
