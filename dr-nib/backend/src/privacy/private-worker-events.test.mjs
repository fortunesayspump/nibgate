import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createPrivateWorkerEventPort} from './private-worker-events.js';

const CANARY='HARMLESS_SYNTHETIC_PRIVATE_CANARY';
function fixture(){
  const run={id:randomUUID(),userId:'tenant_fixture',metadata:{privacyMode:'confidential',schemaVersion:1},
    title:null,description:null,brief:{encrypted:true},plan:null,pendingQuestion:null,pendingGuidance:null,status:'running'};
  const key=randomBytes(32),events=[],objects=[],writes=[];
  let chain=Promise.resolve(),throwWrite=false;
  const db={
    $queryRaw:async()=>[{locked:'1'}],
    $transaction:fn=>{
      const result=chain.then(async()=>{
        const e=events.length,o=objects.length;
        try{return await fn(db);}catch(error){events.length=e;objects.length=o;throw error;}
      });
      chain=result.catch(()=>{});
      return result;
    },
    researchRun:{findUnique:async({where})=>where.id===run.id?run:null},
    researchEvent:{
      create:async({data})=>{if(throwWrite)throw new Error(CANARY);writes.push({model:'event',data});const row={...data};events.push(row);return row;},
      findFirst:async()=>events.at(-1)||null,
      findUnique:async({where})=>{const q=where.runId_seq;return events.find(x=>x.runId===q.runId&&x.seq===q.seq)||null;},
      findMany:async({where,take})=>events.filter(x=>x.runId===where.runId&&x.seq>where.seq.gt).slice(0,take),
    },
    privateWorkerObject:{
      create:async({data})=>{if(throwWrite)throw new Error(CANARY);writes.push({model:'object',data});objects.push(data);return data;},
      findUnique:async({where})=>{const q=where.runId_kind_objectId_revision;return objects.find(x=>x.runId===q.runId&&x.kind===q.kind&&x.objectId===q.objectId&&x.revision===q.revision)||null;},
    },
  };
  const make=(tenantId=run.userId,keyProvider=async()=>key)=>createPrivateWorkerEventPort({db,tenantId,keyProvider});
  return {run,key,db,events,objects,writes,make,setThrowWrite:v=>{throwWrite=v;}};
}

test('fixed event writes have strict metadata and ordered replay',async()=>{
  const f=fixture(),port=f.make();
  const outputs=await Promise.all([
    port.emitFixed({runId:f.run.id,type:'step.started',kind:'plan'}),
    port.emitFixed({runId:f.run.id,type:'step.finished',kind:'plan'}),
  ]);
  assert.deepEqual(outputs.map(x=>x.seq),[0,1]);
  assert.deepEqual(await port.replayPublic(f.run,{afterSeq:0}),[{type:'step.finished',kind:'plan',seq:1}]);
  assert.ok(!JSON.stringify(f.writes).includes(CANARY));
});

test('private event is sealed with context and exposes only an opaque pointer',async()=>{
  const f=fixture(),port=f.make();
  await port.emitFixed({runId:f.run.id,type:'step.started',kind:'score'});
  const pointer=await port.emitSealed({run:f.run,content:{type:'round.reviewed',learnings:[CANARY],providerException:CANARY}});
  assert.deepEqual(pointer,{seq:1,objectId:f.events[1].payload.objectId});
  assert.equal(f.events[1].type,'private.sealed');
  assert.equal((await port.openSealed(f.run,f.events[1])).learnings[0],CANARY);
  assert.equal((await port.replayPublic(f.run))[1].type,'private.sealed');
  await assert.rejects(port.openSealed(f.run,{...f.events[1],runId:randomUUID()}),/PRIVATE_EVENT_UNAVAILABLE/);
  assert.ok(!JSON.stringify(f.writes).includes(CANARY));
  assert.ok(!JSON.stringify(f.events).includes(CANARY));
  assert.ok(!JSON.stringify(f.objects).includes(CANARY));
  f.objects[0].envelope.tag=Buffer.alloc(16).toString('base64');
  await assert.rejects(port.openSealed(f.run,f.events[1]),/PRIVATE_EVENT_UNAVAILABLE/);
  const wrong=f.make(f.run.userId,async()=>randomBytes(32));
  await assert.rejects(wrong.openSealed(f.run,f.events[1]),/PRIVATE_EVENT_UNAVAILABLE/);
});

test('malicious type, code, arbitrary content, row payload or owner is rejected',async()=>{
  const f=fixture(),port=f.make();
  for(const invalid of [
    {runId:f.run.id,type:CANARY,kind:'plan'},
    {runId:f.run.id,type:'step.started',kind:'plan',text:CANARY},
    {runId:f.run.id,type:'step.failed',kind:'plan',code:CANARY},
    {runId:f.run.id,type:'step.failed',kind:'plan'},
    {runId:f.run.id,type:'step.finished',kind:CANARY},
  ])await assert.rejects(port.emitFixed(invalid),/PRIVATE_EVENT_UNAVAILABLE/);
  assert.equal(f.writes.length,0);
  await assert.rejects(f.make('wrong-tenant').emitFixed({runId:f.run.id,type:'step.started',kind:'plan'}),/PRIVATE_EVENT_UNAVAILABLE/);
  await port.emitFixed({runId:f.run.id,type:'step.started',kind:'plan'});
  f.events[0].payload.text=CANARY;
  await assert.rejects(port.replayPublic(f.run),/PRIVATE_EVENT_UNAVAILABLE/);
});

test('key-provider, JSON and database exceptions are sanitized',async()=>{
  const f=fixture();
  const toxic={toJSON(){throw new Error(CANARY)}};
  await assert.rejects(f.make().emitSealed({run:f.run,content:toxic}),error=>!error.message.includes(CANARY));
  await assert.rejects(f.make(f.run.userId,async()=>{throw new Error(CANARY)}).emitSealed({run:f.run,content:{text:CANARY}}),error=>!error.message.includes(CANARY));
  f.setThrowWrite(true);
  await assert.rejects(f.make().emitFixed({runId:f.run.id,type:'step.started',kind:'plan'}),error=>!error.message.includes(CANARY));
  await assert.rejects(f.make().emitSealed({run:f.run,content:{text:CANARY}}),error=>!error.message.includes(CANARY));
});
