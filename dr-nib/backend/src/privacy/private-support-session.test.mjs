import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createPrivateSupportSession} from './private-support-session.js';
import {generateHpkeRecipient,openHpkeReport} from './source-hpke.js';

const CANARY='HARMLESS_SYNTHETIC_SUPPORT_SESSION_CANARY';
const MODEL='synthetic/approved-model';
const matches=(row,where={})=>Object.entries(where).every(([key,value])=>row[key]===value);
function fixture(){
  const run={id:randomUUID(),userId:'synthetic_tenant',metadata:{privacyMode:'confidential',schemaVersion:1},
    title:null,description:null,brief:{encrypted:true},plan:null,pendingQuestion:null,pendingGuidance:null,
    deletedAt:null,status:'draft',versions:1,depth:'standard'};
  const rows={objects:[],steps:[],events:[],reports:[]};
  let chain=Promise.resolve(),denyBudget=false,modelCalls=0,budgetCalls=0,reserved=false,settled=false,
    badSupport=false,failReportWrite=false;
  const db={
    $queryRaw:async()=>[{locked:'1'}],
    $transaction:fn=>{
      const result=chain.then(async()=>{
        const before=structuredClone({...rows,run});
        try{return await fn(db);}catch(error){
          Object.assign(rows,{objects:before.objects,steps:before.steps,events:before.events,reports:before.reports});
          Object.assign(run,before.run);throw error;
        }
      });
      chain=result.catch(()=>{});return result;
    },
    researchRun:{
      findUnique:async({where})=>where.id===run.id?run:null,
      update:async({where,data})=>{assert.equal(where.id,run.id);Object.assign(run,data);return run;},
      updateMany:async({where,data})=>{
        const {metadata,...scalar}=where;
        if(metadata?.path?.join('.')!=='privacyMode'||metadata.equals!=='confidential'||
           !matches(run,scalar))return {count:0};
        Object.assign(run,data);return {count:1};
      },
    },
    researchClaim:{count:async()=>0},researchSource:{count:async()=>0},
    privateWorkerObject:{
      create:async({data})=>{rows.objects.push(data);return data;},
      findUnique:async({where})=>rows.objects.find(row=>matches(row,where.runId_kind_objectId_revision))||null,
      findFirst:async({where})=>rows.objects.filter(row=>matches(row,where)).sort((a,b)=>b.revision-a.revision)[0]||null,
      findMany:async({where})=>rows.objects.filter(row=>matches(row,where)),
    },
    researchStep:{
      create:async({data})=>{const row={id:data.id||randomUUID(),...data};rows.steps.push(row);return row;},
      findUnique:async({where})=>rows.steps.find(row=>row.id===where.id)||null,
      findFirst:async({where})=>rows.steps.find(row=>matches(row,where))||null,
      findMany:async({where})=>rows.steps.filter(row=>matches(row,where)),
      update:async({where,data})=>{const row=rows.steps.find(item=>item.id===where.id);Object.assign(row,data);return row;},
    },
    researchEvent:{
      create:async({data})=>{rows.events.push(data);return data;},
      findFirst:async()=>rows.events.at(-1)||null,
      findMany:async({where,take})=>rows.events.filter(row=>row.runId===where.runId&&row.seq>where.seq.gt).slice(0,take),
      findUnique:async({where})=>rows.events.find(row=>row.runId===where.runId_seq.runId&&row.seq===where.runId_seq.seq)||null,
    },
    researchReport:{
      create:async({data})=>{
        assert.equal(settled,true);
        if(failReportWrite)throw Error('SYNTHETIC_REPORT_TRANSACTION_FAILURE');
        rows.reports.push(data);return data;
      },
      findFirst:async({where})=>rows.reports.find(row=>matches(row,where))||null,
    },
  };
  const key=randomBytes(32),keyProvider=async()=>key;
  const budget={run:async request=>{
    budgetCalls++;
    assert.equal(request.runId,run.id);assert.equal(request.tenantId,run.userId);
    assert.equal(request.model,MODEL);assert.equal(request.maxCalls,30);
    assert.equal(request.maxPromptBytesPerCall,150000);
    assert.equal(request.maxOutputTokensPerCall,1200);
    if(denyBudget)throw Error('SYNTHETIC_BUDGET_DENIED');
    reserved=true;let used=0;
    const result=await request.execute({infer:async({messages,dispatch})=>{
      assert.equal(reserved,true);assert.equal(settled,false);
      assert.ok(used++<30);assert.ok(JSON.stringify(messages).includes(CANARY));
      return (await dispatch({model:MODEL,messages,maxOutputTokens:1200})).value;
    }});
    settled=true;return result;
  }};
  const markdown=Array.from({length:180},(_,index)=>index===20?'Blue widgets weigh four grams.':
    `synthetic${index}`).join(' ')+` ${CANARY} [1].`;
  const plan={sub_questions:[`Check ${CANARY}`],uncertainties:[],estimate:{sources:1,rationale:'Use supplied source.'}};
  const aiPort={privateVerifiedTransport:'phala-aci-v1',infer:async()=>{
    modelCalls++;
    const content=modelCalls===1?JSON.stringify(plan):modelCalls===2?markdown:
      modelCalls===3?JSON.stringify({claims:[{text:'Blue widgets weigh four grams.',citations:[1]}]}):
      JSON.stringify({probability:badSupport?2:0.9});
    return {choices:[{message:{content}}]};
  }};
  const make=()=>createPrivateSupportSession({db,keyProvider,aiPort,budget,model:MODEL});
  async function input(){
    const browser=await generateHpkeRecipient();
    const sourceId=randomUUID();
    const state={brief:{topic:`Analyze ${CANARY}`,liveWeb:false,lengthWords:300},
      plan:null,pendingGuidance:null,resultRecipientPublicKey:Buffer.from(browser.publicKey).toString('base64')};
    const source={provider:'user-upload',url:`user-upload://${sourceId}`,title:`Synthetic ${CANARY}`,
      text:`Blue widgets weigh four grams. ${CANARY}.`};
    return {runId:run.id,tenantId:run.userId,state,sourceId,source,browser};
  }
  return {run,rows,make,input,setDenyBudget:value=>{denyBudget=value;},
    setBadSupport:value=>{badSupport=value;},setFailReportWrite:value=>{failReportWrite=value;},
    get modelCalls(){return modelCalls},get budgetCalls(){return budgetCalls},
    get reserved(){return reserved},get settled(){return settled}};
}

test('future session executes actual sealed plan, write, extraction, support and final completion in one reservation',async()=>{
  const f=fixture(),input=await f.input();
  const receipt=await f.make().run(input);
  assert.deepEqual(receipt,{id:f.run.id,version:1,encrypted:true});
  assert.equal(f.budgetCalls,1);assert.equal(f.modelCalls,4);assert.equal(f.settled,true);
  assert.equal(f.run.status,'complete');
  assert.deepEqual(f.rows.steps.map(step=>step.kind),['plan','write','verify','verify-support']);
  assert.equal(f.rows.objects.filter(row=>row.kind==='claim').length,1);
  assert.equal(f.rows.reports.length,1);
  assert.equal(JSON.stringify(f.rows).includes(CANARY),false);
  const envelope=JSON.parse(f.rows.reports[0].markdown).envelope;
  const plain=await openHpkeReport({recipientPrivateKey:input.browser.privateKey,
    expectedContext:envelope.context,envelope});
  const payload=JSON.parse(new TextDecoder().decode(plain));
  assert.ok(payload.markdown.includes(CANARY));
  assert.deepEqual(payload.verification,{scope:'protected-ai-sampled',verified:false,reason:'not-jev-certified'});
});

test('budget refusal and malformed predecoded recipient stop before any model call or plaintext persistence',async()=>{
  const denied=fixture(),input=await denied.input();denied.setDenyBudget(true);
  await assert.rejects(denied.make().run(input),{code:'PRIVATE_SUPPORT_SESSION_UNAVAILABLE'});
  assert.equal(denied.budgetCalls,1);assert.equal(denied.modelCalls,0);
  assert.equal(denied.rows.objects.length,0);assert.equal(denied.rows.reports.length,0);
  const malformed=fixture(),bad=await malformed.input();bad.state.resultRecipientPublicKey=Buffer.alloc(65).toString('base64');
  await assert.rejects(malformed.make().run(bad),{code:'PRIVATE_SUPPORT_SESSION_UNAVAILABLE'});
  assert.equal(malformed.budgetCalls,0);assert.equal(malformed.modelCalls,0);
});

test('malformed protected support score never releases an HPKE report',async()=>{
  const f=fixture(),input=await f.input();f.setBadSupport(true);
  await assert.rejects(f.make().run(input),{code:'PRIVATE_SUPPORT_SESSION_UNAVAILABLE'});
  assert.equal(f.modelCalls,4);assert.equal(f.rows.reports.length,0);
  assert.equal(f.run.status,'running');
  assert.equal(f.rows.steps.find(step=>step.kind==='verify-support').status,'failed');
  assert.equal(JSON.stringify(f.rows).includes(CANARY),false);
});

test('completion transaction failure after settlement leaves no report and never automatically repays inference',async()=>{
  const f=fixture(),input=await f.input();f.setFailReportWrite(true);
  await assert.rejects(f.make().run(input),{code:'PRIVATE_SUPPORT_SESSION_UNAVAILABLE'});
  assert.equal(f.budgetCalls,1);assert.equal(f.modelCalls,4);assert.equal(f.settled,true);
  assert.equal(f.rows.reports.length,0);assert.equal(f.run.status,'running');
  assert.equal(f.rows.objects.filter(row=>row.kind==='claim').length,1);
  // The draft-only admission will not open a second reservation over this
  // already-paid run. A separate audited completion recovery is required.
  f.setFailReportWrite(false);
  await assert.rejects(f.make().run(input),{code:'PRIVATE_SUPPORT_SESSION_UNAVAILABLE'});
  assert.equal(f.budgetCalls,1);assert.equal(f.modelCalls,4);
  assert.equal(f.rows.reports.length,0);
});
