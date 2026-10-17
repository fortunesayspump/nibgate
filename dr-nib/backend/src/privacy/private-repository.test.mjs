import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {sealPrivatePayload,openPrivatePayload} from './sealed-payload.js';
import {createPrivateRepository} from './private-repository.js';

const run=()=>({id:randomUUID(),userId:'tenant_fixture',metadata:{privacyMode:'confidential'}});
const fixtureKey=randomBytes(32);
const canary='HARMLESS_SYNTHETIC_PRIVATE_CANARY';

test('sealed bytes decrypt only with correct key and fully bound context',()=>{
  const r=run(), c={tenantId:r.userId,runId:r.id,objectId:randomUUID(),revision:1,purpose:'step'};
  const envelope=sealPrivatePayload({key:fixtureKey,context:c,plaintext:Buffer.from(canary)});
  assert.equal(openPrivatePayload({key:fixtureKey,expectedContext:c,envelope}).toString(),canary);
  assert.ok(!JSON.stringify(envelope).includes(canary));
  for(const changed of [{...c,tenantId:'other'}, {...c,runId:randomUUID()}, {...c,objectId:randomUUID()}, {...c,revision:2}, {...c,purpose:'report'}])
    assert.throws(()=>openPrivatePayload({key:fixtureKey,expectedContext:changed,envelope}));
  assert.throws(()=>openPrivatePayload({key:randomBytes(32),expectedContext:c,envelope}));
  assert.throws(()=>openPrivatePayload({key:fixtureKey,expectedContext:c,envelope:{...envelope,tag:Buffer.alloc(16).toString('base64')}}));
});

test('existing step/report model writes contain ciphertext only and round-trip inside boundary',async()=>{
  const r=run(), writes=[];
  const db={researchStep:{create:async args=>{writes.push(args);return args.data}},researchReport:{create:async args=>{writes.push(args);return args.data}}};
  const repo=createPrivateRepository({db,keyProvider:async()=>fixtureKey});
  const step=await repo.saveStep(r,{kind:'score',attempt:1,output:{text:canary}});
  const report=await repo.saveReport(r,{version:1,markdown:canary,citations:[{quote:canary}]});
  assert.equal(writes.length,2);
  assert.ok(!JSON.stringify(writes).includes(canary));
  assert.deepEqual(await repo.readStep(r,step),{text:canary});
  assert.deepEqual(await repo.readReport(r,report),{markdown:canary,citations:[{quote:canary}]});
  await assert.rejects(repo.readStep({...r,id:randomUUID()},step));
  await assert.rejects(repo.readReport({...r,userId:'other'},report));
});

test('private repository rejects legacy and unavailable key before a write',async()=>{
  let writes=0;
  const db={researchStep:{create:async()=>{writes++}},researchReport:{create:async()=>{writes++}}};
  const repo=createPrivateRepository({db,keyProvider:async()=>null});
  await assert.rejects(repo.saveStep(run(),{kind:'score',attempt:1,output:{text:canary}}),{message:'PRIVATE_STEP_UNAVAILABLE'});
  await assert.rejects(repo.saveReport({...run(),metadata:{}},{version:1,markdown:canary,citations:[]}));
  assert.equal(writes,0);
});
test('private step kind cannot carry arbitrary plaintext metadata',async()=>{
  let writes=0;
  const repo=createPrivateRepository({db:{researchStep:{create:async()=>{writes++}},researchReport:{create:async()=>{writes++}}},keyProvider:async()=>fixtureKey});
  await assert.rejects(repo.saveStep(run(),{kind:'private_canary',attempt:1,output:{text:canary}}),/PRIVATE_STEP_UNAVAILABLE/);
  assert.equal(writes,0);
});
test('serialization and database exceptions cannot escape private text',async()=>{
  const repo=createPrivateRepository({db:{researchStep:{create:async()=>{throw new Error(canary)}},researchReport:{create:async()=>{throw new Error(canary)}}},keyProvider:async()=>fixtureKey});
  const toxic={toJSON(){throw new Error(canary)}};
  for(const work of [
    repo.saveStep(run(),{kind:'score',attempt:1,output:toxic}),
    repo.saveReport(run(),{version:1,markdown:canary,citations:[toxic]}),
    repo.saveStep(run(),{kind:'score',attempt:1,output:{normal:true}}),
    repo.saveReport(run(),{version:1,markdown:canary,citations:[]}),
  ]) await assert.rejects(work,e=>!e.message.includes(canary));
});
