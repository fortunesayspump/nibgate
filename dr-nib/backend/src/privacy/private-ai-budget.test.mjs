import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateAiBudgetGate,estimatePrivateAiReservation,promptTokenCeiling} from './private-ai-budget.js';

const OWNER='owner';
const PRICE=Object.freeze({'pinned/model-v1':Object.freeze({inputMicroUsdPerMillion:1_000_000,outputMicroUsdPerMillion:2_000_000})});
const UUIDS=Array.from({length:20},(_,n)=>`00000000-0000-4000-8000-${String(n+1).padStart(12,'0')}`);

function fakeLedger(){
  const rows=new Map();
  let tail=Promise.resolve();
  async function locked(fn){const before=tail;let unlock;tail=new Promise(resolve=>{unlock=resolve});await before;try{return await fn()}finally{unlock()}}
  return {
    rows,
    reserve:args=>locked(async()=>{
      if(args.tenantId!==OWNER)throw Object.assign(new Error('PRIVATE_AI_OWNER_ONLY'),{code:'PRIVATE_AI_OWNER_ONLY'});
      if(rows.has(args.runId))throw Object.assign(new Error('PRIVATE_AI_ALREADY_RESERVED'),{code:'PRIVATE_AI_ALREADY_RESERVED'});
      const spent=[...rows.values()].filter(r=>r.month===args.month).reduce((n,r)=>n+r.amount,0n);
      if(spent+args.amount>args.monthlyAiCapMicroUsd)throw Object.assign(new Error('PRIVATE_AI_MONTHLY_CAP'),{code:'PRIVATE_AI_MONTHLY_CAP'});
      rows.set(args.runId,{...args,reservedMicroUsd:args.amount,status:'reserved'});
    }),
    finalize:args=>locked(async()=>{
      const row=rows.get(args.runId);if(!row||row.status!=='reserved')throw new Error('bad state');
      Object.assign(row,args);
    }),
  };
}
function gate(ledger,options={}){
  return createPrivateAiBudgetGate({ledger,ownerUserId:OWNER,monthlyAiCapMicroUsd:4_000_000,
    monthlyInfraCeilingMicroUsd:1_000_000,modelPriceCeilings:PRICE,
    clock:()=>new Date('2026-10-16T20:00:00.000Z'),...options});
}
function request(runId,execute,extra={}){return {runId,tenantId:OWNER,model:'pinned/model-v1',maxCalls:1,
  maxPromptBytesPerCall:1000,maxOutputTokensPerCall:100,execute,...extra}}
function oneCall({infer},signedUsage){return infer({messages:[{role:'user',content:'synthetic only'}],
  dispatch:async expected=>({value:'synthetic response',...(signedUsage?{signedUsage:signedUsage(expected)}:{})})})}

test('reserve worst case before dispatch and keep full charge without signed usage',async()=>{
  const ledger=fakeLedger();let observed;
  const result=await gate(ledger).run(request(UUIDS[0],async ctx=>{
    observed=ledger.rows.get(UUIDS[0]);
    return oneCall(ctx);
  }));
  assert.equal(result,'synthetic response');
  assert.equal(observed.status,'settled'); // same in-memory object was finalized
  assert.equal(observed.amount,observed.reservedMicroUsd);
  assert.equal(observed.verifiedCalls,0);
});

test('global concurrent admission never overspends',async()=>{
  const ledger=fakeLedger();const per=estimatePrivateAiReservation({maxCalls:1,maxPromptBytesPerCall:1000,maxOutputTokensPerCall:100,
    price:{inputMicroUsdPerMillion:1_000_000n,outputMicroUsdPerMillion:2_000_000n}});
  const g=gate(ledger,{monthlyAiCapMicroUsd:per*2n,monthlyInfraCeilingMicroUsd:5_000_000n-per*2n});
  const outcome=await Promise.allSettled([0,1,2,3].map(i=>g.run(request(UUIDS[i],ctx=>oneCall(ctx)))));
  assert.equal(outcome.filter(x=>x.status==='fulfilled').length,2);
  assert.equal(outcome.filter(x=>x.reason?.code==='PRIVATE_AI_MONTHLY_CAP').length,2);
  assert.equal([...ledger.rows.values()].reduce((n,r)=>n+r.amount,0n),per*2n);
});

test('unknown price fails before any reservation or dispatch',async()=>{
  const ledger=fakeLedger();let dispatched=false;
  await assert.rejects(gate(ledger).run(request(UUIDS[0],async()=>{dispatched=true},{model:'unpriced/model'})),
    {code:'PRIVATE_AI_PRICE_UNKNOWN'});
  assert.equal(dispatched,false);assert.equal(ledger.rows.size,0);
});

test('uncertain provider error is redacted and never refunded or retried',async()=>{
  const ledger=fakeLedger();const g=gate(ledger);
  await assert.rejects(g.run(request(UUIDS[0],ctx=>ctx.infer({messages:[{role:'user',content:'secret synthetic canary'}],
    dispatch:async()=>{throw new Error('provider echoed secret synthetic canary')}}))),e=>{
      assert.equal(e.code,'PRIVATE_AI_UNAVAILABLE');assert.ok(!e.message.includes('canary'));return true;
    });
  const row=ledger.rows.get(UUIDS[0]);assert.equal(row.status,'uncertain');assert.equal(row.amount,row.reservedMicroUsd);
  await assert.rejects(g.run(request(UUIDS[0],ctx=>oneCall(ctx))),{code:'PRIVATE_AI_ALREADY_RESERVED'});
});

test('signed, bound usage can discount, but result.usage is never trusted',async()=>{
  const ledger=fakeLedger();
  const g=gate(ledger,{verifySignedUsage:async(receipt,expected)=>({...receipt,verified:true,signed:true,
    model:expected.model,callId:expected.callId,requestDigest:expected.requestDigest})});
  await g.run(request(UUIDS[0],ctx=>oneCall(ctx,()=>({inputTokens:12,outputTokens:8}))));
  assert.equal(ledger.rows.get(UUIDS[0]).amount,28n);
  assert.equal(ledger.rows.get(UUIDS[0]).verifiedCalls,1);
  await g.run(request(UUIDS[1],ctx=>ctx.infer({messages:[{role:'user',content:'synthetic'}],
    dispatch:async()=>({value:{usage:{inputTokens:0,outputTokens:0}}})})));
  const second=ledger.rows.get(UUIDS[1]);assert.equal(second.amount,second.reservedMicroUsd);
});

test('mismatched signed usage fails closed with full reservation',async()=>{
  const ledger=fakeLedger();const g=gate(ledger,{verifySignedUsage:async()=>({verified:true,signed:true,
    model:'wrong/model',callId:'wrong',requestDigest:'wrong',inputTokens:0,outputTokens:0})});
  await assert.rejects(g.run(request(UUIDS[0],ctx=>oneCall(ctx,()=>({claimed:true})))),{code:'PRIVATE_AI_UNAVAILABLE'});
  const row=ledger.rows.get(UUIDS[0]);assert.equal(row.status,'uncertain');assert.equal(row.amount,row.reservedMicroUsd);
});

test('call count, prompt bytes and owner-only admission are bounded',async()=>{
  const ledger=fakeLedger();const g=gate(ledger);
  await assert.rejects(g.run(request(UUIDS[0],()=>{}, {tenantId:'someone-else'})),{code:'PRIVATE_AI_OWNER_ONLY'});
  assert.equal(ledger.rows.size,0);
  await assert.rejects(g.run(request(UUIDS[0],async ctx=>{
    await oneCall(ctx);await oneCall(ctx);
  })),{code:'PRIVATE_AI_UNAVAILABLE'});
  assert.equal(ledger.rows.get(UUIDS[0]).status,'uncertain');
  await assert.rejects(g.run(request(UUIDS[1],ctx=>ctx.infer({messages:[{role:'user',content:'x'.repeat(1001)}],
    dispatch:async()=>({value:'should not run'})}))),{code:'PRIVATE_AI_UNAVAILABLE'});
  assert.equal(promptTokenCeiling(1000),112592);
});

test('invalid cap partition is rejected before any dispatch',()=>{
  assert.throws(()=>gate(fakeLedger(),{monthlyAiCapMicroUsd:5_000_000,monthlyInfraCeilingMicroUsd:1}),
    {code:'PRIVATE_AI_BUDGET_CONFIG_INVALID'});
});

test('inference cannot be dispatched after execute returns',async()=>{
  const ledger=fakeLedger();let leakedInfer;
  await gate(ledger).run(request(UUIDS[0],async({infer})=>{leakedInfer=infer;return 'done'}));
  let dispatched=false;
  await assert.rejects(leakedInfer({messages:[{role:'user',content:'synthetic'}],
    dispatch:async()=>{dispatched=true;return {value:'unsafe'}}}),{code:'PRIVATE_AI_REQUEST_OUT_OF_BOUNDS'});
  assert.equal(dispatched,false);
});
