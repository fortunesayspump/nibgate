import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createPrivateWriteRunner as underlyingRunner} from './private-write-stage.js';
import {createPrivateWorkerStore} from './private-worker-store.js';
import {createPrivateWorkerEventPort} from './private-worker-events.js';

const CANARY='HARMLESS_SYNTHETIC_PRIVATE_CANARY';
const privateRunner=args=>underlyingRunner({...args,aiPort:{...args.aiPort,privateVerifiedTransport:'phala-aci-v1'}});
const LATE='HARMLESS_SYNTHETIC_LATE_PAGE_CANARY';
function fixture(){
  const run={id:randomUUID(),userId:'tenant_fixture',metadata:{privacyMode:'confidential',schemaVersion:1},
    title:null,description:null,brief:{encrypted:true},plan:null,pendingQuestion:null,pendingGuidance:null,
    deletedAt:null,status:'running',versions:1,depth:'standard'};
  const rows={objects:[],steps:[],events:[]},writes=[],key=randomBytes(32);
  let chain=Promise.resolve(),failReportOnce=false;
  const matches=(row,where)=>Object.entries(where||{}).every(([k,v])=>row[k]===v);
  const db={
    $queryRaw:async()=>[{locked:'1'}],
    $transaction:fn=>{
      const result=chain.then(async()=>{
        const snapshot=structuredClone({...rows,run});
        try{return await fn(db);}catch(error){Object.assign(rows,snapshot);Object.assign(run,snapshot.run);throw error;}
      });
      chain=result.catch(()=>{});
      return result;
    },
    researchRun:{findUnique:async({where})=>where.id===run.id?run:null,update:async({data})=>{writes.push({model:'run',data});Object.assign(run,data);return run;}},
    privateWorkerObject:{
      create:async({data})=>{if(data.kind==='report'&&failReportOnce){failReportOnce=false;throw new Error(CANARY);}writes.push({model:'object',data});rows.objects.push(data);return data;},
      findUnique:async({where})=>{const q=where.runId_kind_objectId_revision;return rows.objects.find(x=>matches(x,q))||null;},
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
      findUnique:async({where})=>{const q=where.runId_seq;return rows.events.find(x=>x.runId===q.runId&&x.seq===q.seq)||null;},
    },
  };
  const keyProvider=async()=>key;
  const store=createPrivateWorkerStore({db,keyProvider,tenantId:run.userId});
  const events=createPrivateWorkerEventPort({db,keyProvider,tenantId:run.userId});
  const sourceId=randomUUID();
  const recipient=Buffer.concat([Buffer.from([4]),randomBytes(64)]).toString('base64');
  const initial={brief:{topic:'Analyze the supplied note',liveWeb:false,length:'brief'},
    plan:{sub_questions:['What does it establish?'],stageAttempt:1},pendingGuidance:null,
    resultRecipientPublicKey:recipient,
    privateWrite:{mode:'source-only-short',planAttempt:1,baseStateRevision:0,sourceId,sourceRevision:1}};
  const source={provider:'user-upload',url:`private-source://${sourceId}`,title:'Synthetic note',
    domain:'uploaded document',text:`${'A'.repeat(8000)} ${LATE} ${CANARY}`,relevance:1,trust:1};
  const setup=async()=>{await store.putRunState(run,{expectedRevision:0,state:initial});await store.putSource(run,{sourceId,source});};
  return {run,rows,writes,store,events,sourceId,source,setup,failReport:()=>{failReportOnce=true;}};
}
function output(){return {choices:[{message:{content:`# Synthetic report\n\n${Array(935).fill('synthetic').join(' ')} ${CANARY} [1].\n\n## Conclusion\n\nSynthetic fixture only.`}}]};}
function sealed(f){
  assert.ok(!JSON.stringify(f.writes).includes(CANARY));
  assert.ok(!JSON.stringify(f.writes).includes(LATE));
  assert.ok(!JSON.stringify(f.rows).includes(CANARY));
  assert.ok(!JSON.stringify(f.rows).includes(LATE));
  assert.equal(f.run.plan,null);
  assert.deepEqual(f.run.brief,{encrypted:true});
}

test('source-only brief writer uses existing prompt, covers late source and seals report',async()=>{
  const f=fixture();await f.setup();
  let calls=0;
  const aiPort={infer:async({model,messages})=>{
    calls++;assert.equal(model,'approved-model');
    assert.ok(messages[1].content.includes(LATE));
    assert.ok(messages[1].content.includes('Evidence collected for this run'));
    return output();
  }};
  const runner=privateRunner({store:f.store,events:f.events,aiPort,model:'approved-model'});
  const report=await runner.run(f.run.id);
  assert.ok(report.markdown.includes(CANARY));
  assert.match(report.markdown,/## References/);
  assert.equal(report.verification.status,'unverified');
  assert.equal((await f.store.getReport(f.run,1)).markdown,report.markdown);
  assert.equal(f.rows.steps[0].status,'done');
  assert.equal(f.rows.steps[0].output.format,'private-worker-object-v1');
  assert.deepEqual(f.rows.events.map(x=>x.type),['step.started','step.finished']);
  sealed(f);
  assert.equal((await runner.run(f.run.id)).markdown,report.markdown);
  assert.equal(calls,1);
});

test('report persistence failure replays sealed write checkpoint without second AI call',async()=>{
  const f=fixture();await f.setup();f.failReport();
  let calls=0;
  const runner=privateRunner({store:f.store,events:f.events,aiPort:{infer:async()=>{calls++;return output();}},model:'approved-model'});
  await assert.rejects(runner.run(f.run.id),/PRIVATE_WRITE_UNAVAILABLE/);
  assert.equal(f.rows.steps[0].status,'done');
  assert.equal((await f.store.getReport(f.run,1)),null);
  await runner.run(f.run.id);
  assert.equal(calls,1);
  sealed(f);
});

test('source changes after model call fail closed instead of attaching stale report',async()=>{
  const f=fixture();await f.setup();
  const runner=privateRunner({store:f.store,events:f.events,model:'approved-model',aiPort:{infer:async()=>{
    await f.store.putSource(f.run,{sourceId:f.sourceId,revision:2,source:{...f.source,text:'Changed document'}});
    return output();
  }}});
  await assert.rejects(runner.run(f.run.id),/PRIVATE_WRITE_UNAVAILABLE/);
  assert.equal(await f.store.getReport(f.run,1),null);
  sealed(f);
});

test('recipient changes after model call cannot attach the prior report checkpoint',async()=>{
  const f=fixture();await f.setup();
  const runner=privateRunner({store:f.store,events:f.events,model:'approved-model',aiPort:{infer:async()=>{
    const before=await f.store.getRunState(f.run);
    await f.store.putRunState(f.run,{expectedRevision:before.revision,
      state:{...before.state,resultRecipientPublicKey:Buffer.concat([Buffer.from([4]),randomBytes(64)]).toString('base64'),
        privateWrite:{...before.state.privateWrite,baseStateRevision:1}}});
    return output();
  }}});
  await assert.rejects(runner.run(f.run.id),/PRIVATE_WRITE_UNAVAILABLE/);
  assert.equal(await f.store.getReport(f.run,1),null);
  sealed(f);
});

test('a source revision racing final report commit cannot attach stale output',async()=>{
  const f=fixture();await f.setup();
  const store={...f.store,commitReport:async(run,args)=>{
    // The runner's read-side freshness check already passed. Simulate a
    // concurrent source update immediately before the transactional commit.
    await f.store.putSource(run,{sourceId:f.sourceId,revision:2,
      source:{...f.source,text:'Concurrent synthetic replacement'}});
    return f.store.commitReport(run,args);
  }};
  const runner=privateRunner({store,events:f.events,model:'approved-model',aiPort:{infer:async()=>output()}});
  await assert.rejects(runner.run(f.run.id),/PRIVATE_WRITE_UNAVAILABLE/);
  assert.equal(await f.store.getReport(f.run,1),null);
  sealed(f);
});

test('a run-version change racing final report commit cannot attach stale output',async()=>{
  const f=fixture();await f.setup();
  const store={...f.store,commitReport:async(run,args)=>{
    f.run.versions=2;
    return f.store.commitReport(run,args);
  }};
  const runner=privateRunner({store,events:f.events,model:'approved-model',aiPort:{infer:async()=>output()}});
  await assert.rejects(runner.run(f.run.id),/PRIVATE_WRITE_UNAVAILABLE/);
  assert.equal(await f.store.getReport(f.run,1),null);
  sealed(f);
});

test('unsupported length, unapproved source and malformed model response never save a report',async()=>{
  const f=fixture();await f.setup();
  let calls=0;
  const runner=privateRunner({store:f.store,events:f.events,model:'approved-model',aiPort:{infer:async()=>{calls++;return {choices:[{message:{content:'too short'}}]};}}});
  await assert.rejects(runner.run(f.run.id),/PRIVATE_WRITE_UNAVAILABLE/);
  assert.equal(await f.store.getReport(f.run,1),null);
  assert.equal(calls,2); // one bounded deepening attempt, then fail closed
  const other=fixture();await other.setup();
  await other.store.putSource(other.run,{sourceId:other.sourceId,revision:2,source:{...other.source,provider:'web'}});
  await assert.rejects(privateRunner({store:other.store,events:other.events,model:'approved-model',aiPort:{infer:async()=>{throw new Error('unexpected model call')}}}).run(other.run.id),/PRIVATE_WRITE_UNAVAILABLE/);
  assert.equal(other.rows.steps.length,0);
  sealed(f);sealed(other);
});

test('an unbranded model port is rejected before any source or model use',()=>{
  const f=fixture();
  assert.throws(()=>underlyingRunner({store:f.store,events:f.events,model:'approved-model',
    aiPort:{infer:async()=>{throw new Error(CANARY);}}}),/PRIVATE_WRITE_UNAVAILABLE/);
  assert.equal(f.writes.length,0);
});
