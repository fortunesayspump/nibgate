import test from 'node:test';
import assert from 'node:assert/strict';
import {createFullWorkerPrivateContext} from './full-worker-context.js';

const ID='11111111-1111-4111-8111-111111111111';
const CANARY='HARMLESS_SYNTHETIC_PRIVATE_CANARY';
function ports(overrides={}) {
 const writes=[];
 const store={
  loadRun:async()=>({id:ID,userId:'tenant-test',metadata:{privacyMode:'confidential'}}),
  beginStage:async()=>({state:'claimed',lease:'opaque-lease'}),
  finishStage:async v=>{writes.push({...v,sink:'sealed-output'});},
  failStage:async v=>{writes.push({...v,sink:'fixed-failure'});},
  ...overrides.store,
 };
 const events={emitFixed:async v=>{writes.push({...v,sink:'event'});},...overrides.events};
 const ctx=createFullWorkerPrivateContext({store,events,ai:{generate:async()=>{},verify:async()=>{}},judge:{sourceBatch:async()=>{},choice:async()=>{}},tools:{run:async()=>{}},billing:{meter:async()=>{}}});
 return {ctx,writes};
}

test('stage delegates output only to measured store and sends fixed public events',async()=>{
 const {ctx,writes}=ports();
 const output={privateText:CANARY};
 assert.equal(await ctx.stage(ID,'plan',1,async()=>output),output);
 assert.equal(writes.filter(w=>w.sink==='sealed-output').length,1);
 assert.deepEqual(writes.filter(w=>w.sink==='event').map(({type,kind,runId})=>({type,kind,runId})),[
  {type:'step.started',kind:'plan',runId:ID},{type:'step.finished',kind:'plan',runId:ID},
 ]);
 assert.equal(JSON.stringify(writes.filter(w=>w.sink==='event')).includes(CANARY),false);
});

test('failures use fixed code, never raw provider exception',async()=>{
 const {ctx,writes}=ports();
 await assert.rejects(ctx.stage(ID,'score',2,async()=>{throw new Error(CANARY);}),e=>e.message==='PRIVATE_STAGE_FAILED');
 assert.equal(JSON.stringify(writes).includes(CANARY),false);
 assert.equal(writes.find(w=>w.sink==='fixed-failure').code,'PRIVATE_STAGE_FAILED');
});

test('unknown or missing privacy classification cannot begin a stage',async()=>{
 for(const metadata of [{privacyMode:'legacy'},{privacyMode:'unknown'},null]) {
  let begun=false;
  const {ctx}=ports({store:{loadRun:async()=>({id:ID,userId:'tenant-test',metadata}),beginStage:async()=>{begun=true;}}});
  await assert.rejects(ctx.stage(ID,'write',1,async()=>{}),e=>e.message==='PRIVATE_STAGE_FAILED');
  assert.equal(begun,false);
 }
});

test('replay returns sealed prior output without calling work or billing',async()=>{
 let worked=false;
 const {ctx,writes}=ports({store:{beginStage:async()=>({state:'done',output:{marker:CANARY}})}});
 assert.deepEqual(await ctx.stage(ID,'fetch',4,async()=>{worked=true;}),{marker:CANARY});
 assert.equal(worked,false);
 assert.equal(writes.length,0);
});

test('failure to publish after sealing never rewrites a completed stage as failed',async()=>{
 const {ctx,writes}=ports({events:{emitFixed:async ({type})=>{if(type==='step.finished')throw new Error(CANARY);}}});
 await assert.rejects(ctx.stage(ID,'write',1,async()=>({answer:CANARY})),e=>e.message==='PRIVATE_STAGE_FAILED');
 assert.equal(writes.filter(w=>w.sink==='sealed-output').length,1);
 assert.equal(writes.filter(w=>w.sink==='fixed-failure').length,0);
});
