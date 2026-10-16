import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPrivateAiBudgetGate} from './private-ai-budget.js';
import {createPrivateSupportFlowContract,PRIVATE_SUPPORT_FLOW_CALLS} from './private-support-flow-contract.js';
import {privateReportVerificationChunks} from './private-verify-extraction.js';

const CANARY='HARMLESS_SYNTHETIC_FUTURE_VERIFY_CANARY';
function fixture(){
  const runId=randomUUID(),tenantId='synthetic_tenant';
  const run={id:runId,userId:tenantId,status:'draft',versions:1,metadata:{privacyMode:'confidential',schemaVersion:1},
    title:null,description:null,brief:{encrypted:true},plan:null,pendingQuestion:null,pendingGuidance:null,deletedAt:null};
  const order=[];let calls=0;
  const aiPort={privateVerifiedTransport:'phala-aci-v1',infer:async({messages})=>{
    assert.ok(messages[0].content.includes(CANARY));calls++;return {synthetic:true};
  }};
  const budget={run:async request=>{
    assert.equal(request.runId,runId);assert.equal(request.tenantId,tenantId);
    assert.equal(request.maxCalls,30);assert.equal(request.maxPromptBytesPerCall,150000);
    assert.equal(request.maxOutputTokensPerCall,1200);
    order.push('reserve');let paid=0;
    const result=await request.execute({infer:async({messages,dispatch})=>{
      assert.ok(paid<request.maxCalls);paid++;
      return (await dispatch({model:'approved-model',messages,maxOutputTokens:1200})).value;
    }});
    order.push('settle');return result;
  }};
  const invoke=port=>port.infer({model:'approved-model',messages:[{role:'user',content:CANARY}]});
  const stages={
    plan:async({aiPort:port})=>{order.push('plan');await invoke(port);},
    write:async({aiPort:port})=>{order.push('write');await invoke(port);await invoke(port);},
    extract:async({aiPort:port})=>{order.push('extract');await invoke(port);await invoke(port);
      return {scope:'extraction-only',verified:false,reportCoverageComplete:true};},
    judge:async({runId:stageRunId,tenantId:stageTenantId,aiPort:port,budget:childBudget})=>{
      order.push('judge');
      await childBudget.run({runId:stageRunId,tenantId:stageTenantId,model:'approved-model',
        maxCalls:3,maxPromptBytesPerCall:8000,maxOutputTokensPerCall:1200,
        execute:async({infer})=>{
          for(let index=0;index<3;index++)await infer({messages:[{role:'user',content:CANARY}],
            dispatch:async bounded=>({value:await port.infer({model:bounded.model,messages:bounded.messages})})});
        },
      });
      return {committed:true,verified:false,claims:3,supported:1,unknown:2};
    },
  };
  const complete=async({judgment})=>{
    assert.equal(judgment.committed,true);order.push('complete');return {id:runId,version:1,encrypted:true};
  };
  const create=(overrides={})=>createPrivateSupportFlowContract({loadRun:async()=>run,budget,aiPort,
    model:'approved-model',stages,complete,...overrides});
  return {runId,tenantId,run,order,aiPort,budget,stages,complete,create,invoke,get calls(){return calls;}};
}

test('future support flow reserves all 30 worst-case calls before any inference and completes only after claim commit and settlement',async()=>{
  const f=fixture();
  assert.deepEqual(PRIVATE_SUPPORT_FLOW_CALLS,{plan:1,write:2,extract:24,judge:3,total:30});
  const receipt=await f.create().run({runId:f.runId,tenantId:f.tenantId});
  assert.deepEqual(receipt,{id:f.runId,version:1,encrypted:true});
  assert.deepEqual(f.order,['reserve','plan','write','extract','judge','settle','complete']);
  assert.equal(f.calls,8);
});

test('paragraph-heavy admitted reports can consume more than ten extraction chunks without under-reservation',async()=>{
  const f=fixture();
  const markdown=('a'.repeat(6000)+'\n\n').repeat(16).slice(0,96000);
  assert.ok(markdown.length<100000);
  const chunks=privateReportVerificationChunks(markdown);
  assert.equal(chunks.complete,true);
  assert.ok(chunks.chunks.length>10&&chunks.chunks.length<=24);
  const stages={...f.stages,extract:async({aiPort})=>{
    f.order.push('extract');
    for(const chunk of chunks.chunks)await aiPort.infer({model:'approved-model',
      messages:[{role:'user',content:`${CANARY} ${chunk.slice(0,100)}`}]});
    return {scope:'extraction-only',verified:false,reportCoverageComplete:true};
  }};
  await f.create({stages}).run({runId:f.runId,tenantId:f.tenantId});
  assert.equal(f.calls,1+2+chunks.chunks.length+3);
  assert.equal(f.order.at(-1),'complete');
});

test('missing claim commit, stage overrun or budget failure never releases a report',async()=>{
  const missing=fixture();
  await assert.rejects(missing.create({stages:{...missing.stages,judge:async()=>({committed:false,verified:false,
    claims:1,supported:0,unknown:1})}}).run({runId:missing.runId,tenantId:missing.tenantId}),
    /PRIVATE_SUPPORT_FLOW_UNAVAILABLE/);
  assert.ok(!missing.order.includes('complete'));
  const overflow=fixture();
  await assert.rejects(overflow.create({stages:{...overflow.stages,plan:async({aiPort})=>{
    await overflow.invoke(aiPort);await overflow.invoke(aiPort);
  }}}).run({runId:overflow.runId,tenantId:overflow.tenantId}),/PRIVATE_SUPPORT_FLOW_UNAVAILABLE/);
  assert.equal(overflow.calls,1);assert.ok(!overflow.order.includes('complete'));
  const refused=fixture();
  await assert.rejects(refused.create({budget:{run:async()=>{throw Error(CANARY);}}})
    .run({runId:refused.runId,tenantId:refused.tenantId}),error=>{
      assert.equal(error.message,'PRIVATE_SUPPORT_FLOW_UNAVAILABLE');return true;
    });
  assert.equal(refused.calls,0);assert.ok(!refused.order.includes('complete'));
});

test('current three-call budget gate refuses future expanded envelope before stage or provider work',async()=>{
  const f=fixture();let reservations=0;
  const ledger={reserve:async()=>{reservations++;},finalize:async()=>{}};
  const gate=createPrivateAiBudgetGate({ledger,ownerUserId:f.tenantId,monthlyAiCapMicroUsd:4_000_000,
    monthlyInfraCeilingMicroUsd:1_000_000,
    modelPriceCeilings:{'approved-model':{inputMicroUsdPerMillion:1000,outputMicroUsdPerMillion:2000}}});
  await assert.rejects(f.create({budget:gate}).run({runId:f.runId,tenantId:f.tenantId}),
    /PRIVATE_SUPPORT_FLOW_UNAVAILABLE/);
  assert.equal(reservations,0);assert.equal(f.calls,0);assert.ok(!f.order.includes('complete'));
});

test('terminal run and unbranded provider cannot reserve a future support flow',async()=>{
  const f=fixture();f.run.status='complete';
  await assert.rejects(f.create().run({runId:f.runId,tenantId:f.tenantId}),/PRIVATE_SUPPORT_FLOW_UNAVAILABLE/);
  assert.deepEqual(f.order,[]);
  assert.throws(()=>f.create({aiPort:{infer:async()=>null}}),/PRIVATE_SUPPORT_FLOW_UNAVAILABLE/);
});
