import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createPrivatePlanRunner as underlyingRunner} from './private-plan-stage.js';
import {createPrivateWorkerStore} from './private-worker-store.js';
import {createPrivateWorkerEventPort} from './private-worker-events.js';
import {planMessages} from '../llm/prompts.js';
import {resolveLength} from '../length.js';

const CANARY='HARMLESS_SYNTHETIC_PRIVATE_CANARY';
const privateRunner=args=>underlyingRunner({...args,aiPort:{...args.aiPort,privateVerifiedTransport:'phala-aci-v1'}});
function fixture(){
  const run={id:randomUUID(),userId:'tenant_fixture',metadata:{privacyMode:'confidential',schemaVersion:1},
    title:null,description:null,brief:{encrypted:true},plan:null,pendingQuestion:null,pendingGuidance:null,
    deletedAt:null,status:'planning',versions:1,depth:'standard'};
  const rows={objects:[],steps:[],events:[]},writes=[],key=randomBytes(32);
  let chain=Promise.resolve(),failStatusOnce=false;
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
    researchRun:{
      findUnique:async({where})=>where.id===run.id?run:null,
      update:async({where,data})=>{if(failStatusOnce){failStatusOnce=false;throw new Error(CANARY);}assert.equal(where.id,run.id);writes.push({model:'run',data});Object.assign(run,data);return run;},
    },
    privateWorkerObject:{
      create:async({data})=>{writes.push({model:'object',data});rows.objects.push(data);return data;},
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
  const initial={brief:{topic:CANARY,liveWeb:false,length:'brief'},pendingGuidance:null,plan:null};
  return {run,rows,writes,db,store,events,initial,failStatus:()=>{failStatusOnce=true;}};
}
function completion(question=CANARY){return {choices:[{message:{content:JSON.stringify({sub_questions:[question],uncertainties:[],estimate:{sources:2,rationale:'Two supplied documents.'}})}}]};}
function sealedOnly(f){
  assert.ok(!JSON.stringify(f.writes).includes(CANARY));
  assert.ok(!JSON.stringify(f.rows).includes(CANARY));
  assert.equal(f.run.plan,null);
  assert.deepEqual(f.run.brief,{encrypted:true});
  assert.equal(f.run.title,null);
  assert.equal(f.run.description,null);
}

test('existing Dr. Nib plan prompt runs through injected AI and sealed state end to end',async()=>{
  const f=fixture();await f.store.putRunState(f.run,{expectedRevision:0,state:f.initial});
  let aiCalls=0;
  const aiPort={infer:async({model,messages})=>{
    aiCalls++;
    assert.equal(model,'approved-model');
    const target=resolveLength({length:'brief'});
    assert.deepEqual(messages,planMessages({brief:f.initial.brief,guidance:null,sections:target.sections,words:target.words}));
    return completion();
  }};
  const runner=privateRunner({store:f.store,events:f.events,aiPort,model:'approved-model'});
  const result=await runner.run(f.run.id);
  assert.equal(result.sub_questions[0],CANARY);
  assert.equal(f.run.status,'planned');
  assert.equal((await f.store.getRunState(f.run)).state.plan.sub_questions[0],CANARY);
  assert.deepEqual(f.rows.events.map(x=>x.type),['step.started','step.finished']);
  assert.equal(f.rows.steps[0].status,'done');
  assert.equal(f.rows.steps[0].output.format,'private-worker-object-v1');
  sealedOnly(f);
  const writes=f.writes.length;
  assert.equal((await runner.run(f.run.id)).sub_questions[0],CANARY);
  assert.equal(aiCalls,1);
  assert.equal(f.writes.length,writes);
});

test('crash after encrypted stage checkpoint replays without a second provider call',async()=>{
  const f=fixture();await f.store.putRunState(f.run,{expectedRevision:0,state:f.initial});
  let calls=0;
  const runner=privateRunner({store:f.store,events:f.events,aiPort:{infer:async()=>{calls++;return completion();}},model:'approved-model'});
  f.failStatus();
  await assert.rejects(runner.run(f.run.id),/PRIVATE_PLAN_UNAVAILABLE/);
  assert.equal(f.run.status,'planning');
  assert.equal(f.rows.steps[0].status,'done');
  await runner.run(f.run.id);
  assert.equal(f.run.status,'planned');
  assert.equal(calls,1);
  assert.deepEqual(f.rows.events.map(x=>x.type),['step.started','step.finished']);
  sealedOnly(f);
});

test('changed sealed brief after model call cannot receive a stale plan',async()=>{
  const f=fixture();await f.store.putRunState(f.run,{expectedRevision:0,state:f.initial});
  let calls=0;
  const runner=privateRunner({store:f.store,events:f.events,model:'approved-model',aiPort:{infer:async()=>{
    calls++;
    await f.store.putRunState(f.run,{expectedRevision:1,state:{...f.initial,brief:{...f.initial.brief,topic:'A changed private topic'}}});
    return completion();
  }}});
  await assert.rejects(runner.run(f.run.id),/PRIVATE_PLAN_UNAVAILABLE/);
  assert.equal(f.run.status,'planning');
  assert.equal((await f.store.getRunState(f.run)).state.plan,null);
  assert.equal(calls,1);
  sealedOnly(f);
});

test('deleted or terminal runs and provider exceptions fail closed without plaintext errors',async()=>{
  const f=fixture();await f.store.putRunState(f.run,{expectedRevision:0,state:f.initial});
  let calls=0;
  const runner=privateRunner({store:f.store,events:f.events,model:'approved-model',aiPort:{infer:async()=>{calls++;throw new Error(CANARY);}}});
  f.run.deletedAt=new Date();
  await assert.rejects(runner.run(f.run.id),/PRIVATE_PLAN_UNAVAILABLE/);
  f.run.deletedAt=null;f.run.status='ended';
  await assert.rejects(runner.run(f.run.id),/PRIVATE_PLAN_UNAVAILABLE/);
  assert.equal(calls,0);
  f.run.status='planning';
  await assert.rejects(runner.run(f.run.id),error=>error.message==='PRIVATE_PLAN_UNAVAILABLE');
  assert.equal(calls,1);
  assert.equal(f.rows.steps[0].status,'failed');
  assert.deepEqual(f.rows.steps[0].output,{code:'PRIVATE_STAGE_FAILED'});
  assert.equal(f.rows.events.at(-1).payload.code,'PRIVATE_STAGE_FAILED');
  sealedOnly(f);
});

test('run version changes during inference or after checkpoint cannot commit stale plan',async()=>{
  const during=fixture();await during.store.putRunState(during.run,{expectedRevision:0,state:during.initial});
  const first=privateRunner({store:during.store,events:during.events,model:'approved-model',aiPort:{infer:async()=>{
    during.run.versions=2;
    return completion();
  }}});
  await assert.rejects(first.run(during.run.id),/PRIVATE_PLAN_UNAVAILABLE/);
  assert.equal(during.run.status,'planning');
  assert.equal((await during.store.getRunState(during.run)).state.plan,null);
  assert.equal(during.rows.steps[0].status,'failed');
  sealedOnly(during);

  const after=fixture();await after.store.putRunState(after.run,{expectedRevision:0,state:after.initial});
  const events={emitFixed:async event=>{
    const result=await after.events.emitFixed(event);
    if(event.type==='step.finished')after.run.versions=2;
    return result;
  }};
  const second=privateRunner({store:after.store,events,model:'approved-model',aiPort:{infer:async()=>completion()}});
  await assert.rejects(second.run(after.run.id),/PRIVATE_PLAN_UNAVAILABLE/);
  assert.equal(after.rows.steps[0].status,'done');
  assert.equal((await after.store.getRunState(after.run)).state.plan,null);
  assert.equal(after.run.status,'planning');
  sealedOnly(after);
});

test('an unbranded model port is rejected before any model call',()=>{
  const f=fixture();
  assert.throws(()=>underlyingRunner({store:f.store,events:f.events,model:'approved-model',
    aiPort:{infer:async()=>{throw new Error(CANARY);}}}),/PRIVATE_PLAN_UNAVAILABLE/);
  assert.equal(f.writes.length,0);
});
