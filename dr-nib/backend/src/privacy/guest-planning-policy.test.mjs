import test from 'node:test';
import assert from 'node:assert/strict';
import {guestPlanningPolicy,assertGuestPlanningAction,admitGuestPlanningAction,guestPlanAttestation,nextGuestPlanAttestation,assertAdoptedGuestPlan,guestPlanningCapabilityAllowed,requireAdoptedGuestFunding} from './guest-planning-policy.js';
import {availablePrivateRunSpend} from './private-run-budget.js';
import {createPrivateWorkflow} from './private-workflow.js';
const id='11111111-1111-4111-8111-111111111111';
const run=()=>({id:'22222222-2222-4222-8222-222222222222',userId:'guest:'+id,metadata:{privacyMode:'confidential',guestPlanning:{sessionId:id,expiresAt:new Date(Date.now()+3600000).toISOString(),maxActions:16,maxReplans:3,maxCostMicroUsd:100000,planTtlMs:1800000,frozen:false,adopted:false}}});
const state=()=>({id:run().id,status:'intake',brief:{topic:'Synthetic public irrigation question'}});
test('only trusted finite guest policy admits anonymous principal, never plaintext-state marker',()=>{
 assert.equal(guestPlanningPolicy({userId:'account',metadata:{}}),null);
 assert.throws(()=>guestPlanningPolicy({userId:'guest:'+id,metadata:{}}),/POLICY_INVALID/);
 for(const patch of [{maxCostMicroUsd:Infinity},{maxCostMicroUsd:1000001},{maxActions:999},{maxReplans:999},{sessionId:'other'}]){const r=run();Object.assign(r.metadata.guestPlanning,patch);assert.throws(()=>guestPlanningPolicy(r));}
 for(const patch of [{frozen:true},{adopted:true},{expiresAt:'2020-01-01T00:00:00Z'}]){const r=run();Object.assign(r.metadata.guestPlanning,patch);assert.throws(()=>guestPlanningPolicy(r),/SESSION_CLOSED/);}
});
test('guest action allowlist denies execution tools files recovery and forged edit plans',()=>{
 for(const action of ['execute','resume','revise','discuss','export','recover','answer','guidance','pause','end','validate-plan'])assert.throws(()=>assertGuestPlanningAction(run(),action,state()),/ACTION_DENIED/);
 assert.throws(()=>assertGuestPlanningAction(run(),'intake',state(),{},[{content:'secret'}]),/FILES_OR_TOOLS/);
 assert.throws(()=>assertGuestPlanningAction(run(),'intake',{...state(),sources:[{}]}),/FILES_OR_TOOLS/);
 assert.throws(()=>assertGuestPlanningAction(run(),'intake',state(),{tool:'url'}),/ACTION_DENIED/);
 assert.throws(()=>assertGuestPlanningAction(run(),'edit-plan',{...state(),status:'planned',plan:{source:'llm'}},{sub_questions:['fake']}),/PLAN_CHANGED/);
 assert.throws(()=>assertGuestPlanningAction(run(),'configure',state(),{tipCreators:true}),/INPUT_LIMIT/);
 assert.ok(assertGuestPlanningAction(run(),'intake',state()));
});
test('action and replan accounting reserves bounded attempts, not only successes',()=>{
 const r=run();for(let i=0;i<3;i++)r.metadata.guestPlanning=admitGuestPlanningAction(r,'configure');
 assert.equal(r.metadata.guestPlanning.actionCount,3);assert.equal(r.metadata.guestPlanning.replanCount,3);
 assert.throws(()=>admitGuestPlanningAction(r,'edit-plan'),/REPLAN_LIMIT/);
 r.metadata.guestPlanning.actionCount=16;assert.throws(()=>admitGuestPlanningAction(r,'answers'),/ACTION_LIMIT/);
});
test('platform-funded and undefined guest budgets still retain every cost reservation',async()=>{
 const r=run();const tx={privateInferenceCall:{aggregate:async q=>{assert.deepEqual(q.where,{runId:r.id});return {_sum:{committedMicroUsd:99999n}};}}};
 assert.equal(await availablePrivateRunSpend(tx,r.id,undefined,true,'platform',r),1n);
 assert.equal(await availablePrivateRunSpend(tx,r.id,1000000000,false,'owner-test',r),1n);
 r.metadata.guestPlanning.frozen=true;await assert.rejects(availablePrivateRunSpend(tx,r.id,undefined,true,'platform',r),/SESSION_CLOSED/);
});
test('same verified worker accepts anonymous capabilities only for session/prove/action routes',()=>{
 const r=run(),identity={tenantId:r.userId,runId:r.id};
 const check=path=>guestPlanningCapabilityAllowed({identity,run:r,method:'POST',path,enabled:true});
 assert.equal(check('/v1/private/sessions'),true);assert.equal(check('/v1/private/sessions/'+id+'/action'),true);
 for(const path of ['/v1/private/sessions/'+id+'/execute','/v1/private/sessions/'+id+'/full-execute','/v1/private/tools/check','/v1/private/reports/'+id])assert.equal(check(path),false);
 assert.equal(guestPlanningCapabilityAllowed({identity,run:r,method:'POST',path:'/v1/private/sessions',enabled:false}),false);
 r.metadata.guestPlanning.frozen=true;assert.equal(check('/v1/private/sessions'),false);
});
test('text-only guest plan uses genuine configured inference; missing/invalid model output never becomes plan',async()=>{
 let calls=0;const workflow=createPrivateWorkflow({infer:async request=>{calls++;assert.equal(request.stage,'plan');return {choices:[{message:{content:JSON.stringify({sub_questions:['Study scope','Evidence limitations','Research approach'],uncertainties:[],why:'Synthetic test-only model response'})},finish_reason:'stop'}]};},estimate:()=>({estimate:0.2,minimumFunding:0.25,kind:'bound'})});
 const out=await workflow({run:run(),state:{...state(),status:'intake-done'},action:'configure',args:{budgetCap:1,length:'brief',liveWeb:false}});
 assert.equal(calls,1);assert.equal(out.state.plan.source,'llm');assert.equal(out.state.status,'planned');
 const unavailable=createPrivateWorkflow({infer:async()=>{throw Error('synthetic unavailable');},estimate:()=>0.2});
 await assert.rejects(unavailable({run:run(),state:{...state(),status:'intake-done'},action:'configure',args:{budgetCap:1,length:'brief',liveWeb:false}}));
});
test('adoption requires matching genuine plan/input digests; expiry and quote change cannot silently pass',async()=>{
 const s={...state(),status:'planned',budgetCap:1,brief:{...state().brief,length:'brief',depth:'standard',liveWeb:true,searchEnabled:false},plan:{source:'llm',sub_questions:['A','B','C'],estimate:0.2,minimumFunding:0.25}};
 const target={id:'target',userId:'account',metadata:{guestAdoption:{validationRequired:true},guestPlan:guestPlanAttestation(s,1800000)}};
 assert.ok(assertAdoptedGuestPlan(target,s));assert.throws(()=>assertAdoptedGuestPlan(target,{...s,brief:{...s.brief,topic:'tampered'}}),/PLAN_CHANGED/);
 const workflow=createPrivateWorkflow({infer:()=>assert.fail('validation must never infer'),estimate:()=>({estimate:0.2,minimumFunding:0.25})});
 assert.equal((await workflow({run:target,state:s,action:'validate-plan'})).state.planValidation.status,'current');
 await assert.rejects(createPrivateWorkflow({infer:()=>assert.fail(),estimate:()=>0.4})({run:target,state:s,action:'validate-plan'}),/QUOTE_CHANGED/);
 target.metadata.guestPlan.expiresAt='2020-01-01T00:00:00Z';assert.throws(()=>assertAdoptedGuestPlan(target,s),/PLAN_EXPIRED/);
});
test('funding denies guests and adopted-but-unvalidated, stale or changed ciphertext',()=>{
 assert.throws(()=>requireAdoptedGuestFunding(run()),/FUNDING_DENIED/);
 const target={userId:'account',metadata:{guestAdoption:{validationRequired:true}}};assert.throws(()=>requireAdoptedGuestFunding(target),/VALIDATION_REQUIRED/);
 target.metadata={guestAdoption:{validationRequired:false},guestPlan:{version:1,expiresAt:new Date(Date.now()+10000).toISOString(),manifestDigest:'verified'},privateFundingInputs:{manifestDigest:'verified'}};
 assert.doesNotThrow(()=>requireAdoptedGuestFunding(target));target.metadata.privateFundingInputs.manifestDigest='changed';assert.throws(()=>requireAdoptedGuestFunding(target),/VALIDATION_REQUIRED/);
});

test('atomic action-store claim counts once, rejects second in-flight and fences adoption freeze',async()=>{
 const {createPrivateActionStore}=await import('./private-action-store.js');
 const r=run(),receipts=[];
 const tx={$queryRaw:async()=>[],researchRun:{findUnique:async()=>r,update:async({data})=>{Object.assign(r,data);return r;}},privateClientObject:{findUnique:async()=>({id:'manifest-row',runId:r.id,revision:1,removed:false})},privateToolCall:{count:async()=>0},privateActionReceipt:{
  findUnique:async({where})=>receipts.find(x=>x.requestId===where.runId_requestId?.requestId)??null,
  count:async()=>receipts.length,findFirst:async()=>receipts.find(x=>['processing','uncertain'].includes(x.status))??null,
  create:async({data})=>{receipts.push(data);return data;},
 }};
 let tail=Promise.resolve();const db={...tx,$transaction:fn=>{const next=tail.then(()=>fn(tx));tail=next.catch(()=>{});return next;}};
 const store=createPrivateActionStore({db,stateKey:Buffer.alloc(32,7),tenantId:r.userId,runId:r.id,vaultId:id});
 const input={requestId:'request-one',digest:'same',manifestId:'manifest-row',manifestRevision:1,action:'configure'};
 const first=await store.claim(input);assert.equal(first.status,'processing');assert.equal(r.metadata.guestPlanning.actionCount,1);
 const duplicate=await store.claim(input);assert.equal(duplicate.existing,true);assert.equal(r.metadata.guestPlanning.actionCount,1);
 await assert.rejects(store.claim({...input,requestId:'request-two'}));assert.equal(r.metadata.guestPlanning.actionCount,1);
 r.metadata.guestPlanning.frozen=true;await assert.rejects(store.fence(),/SESSION_CLOSED/);
});
test('inference reserves guest-sponsored cost and caps output before dispatch, never trusts client budget',async()=>{
 const {createPrivateWorkflowAi}=await import('./private-workflow-ai.js');
 const r=run();let reservation,dispatch=0;
 const tx={$queryRaw:async()=>[],researchRun:{findUnique:async()=>r},privateInferenceCall:{findFirst:async()=>null,count:async()=>0,aggregate:async()=>({_sum:{committedMicroUsd:0n}}),create:async({data})=>{reservation=data;}},privateAiBudgetReservation:{aggregate:async()=>({_sum:{committedMicroUsd:0n}})}};
 const ai=createPrivateWorkflowAi({db:{$transaction:fn=>fn(tx)},model:'fixture/model',monthlyCapMicroUsd:1000000,inputPricePerMillion:10000,outputPricePerMillion:10000,fundingRequired:true,aiPort:{privateVerifiedTransport:'phala-aci-v1',infer:async req=>{dispatch++;assert.equal(reservation.billingKind,'platform');assert.ok(req.maxTokens<=4096);throw Error('synthetic stop');}}});
 await assert.rejects(ai({run:r,actionId:'fixture',stage:'plan',messages:[{role:'user',content:'synthetic'}],budgetMicroUsd:999999999}),/synthetic stop/);assert.equal(dispatch,1);
 r.metadata.guestPlanning.maxCostMicroUsd=1;
 await assert.rejects(ai({run:r,actionId:'fixture2',stage:'plan',messages:[{role:'user',content:'synthetic'}]}),/BUDGET_EXHAUSTED/);assert.equal(dispatch,1);
 await assert.rejects(ai({run:r,actionId:'fixture3',stage:'write',messages:[{role:'user',content:'synthetic'}]}),/GUEST_INPUT_LIMIT/);assert.equal(dispatch,1);
});
test('adopted edit-plan cannot attest an unvalidated, tampered, expired or repriced client manifest',async()=>{
 const s={...state(),status:'planned',budgetCap:1,brief:{...state().brief,length:'brief',depth:'standard',liveWeb:true,searchEnabled:false},plan:{source:'llm',sub_questions:['A','B','C'],estimate:0.2,minimumFunding:0.25}};
 const target={id:'target',userId:'account',metadata:{guestAdoption:{validationRequired:true},guestPlan:guestPlanAttestation(s,1800000)}};
 const workflow=createPrivateWorkflow({infer:()=>assert.fail('edit cannot infer'),estimate:()=>({estimate:0.2,minimumFunding:0.25})});
 const request={run:target,state:s,action:'edit-plan',args:{sub_questions:['Reviewed A','B','C']}};
 await assert.rejects(workflow(request),/VALIDATION_REQUIRED/);
 target.metadata.guestAdoption.validationRequired=false;
 assert.equal((await workflow(request)).state.plan.sub_questions[0],'Reviewed A');
 await assert.rejects(workflow({...request,state:{...s,brief:{...s.brief,topic:'Tampered client topic'}}}),/PLAN_CHANGED/);
 await assert.rejects(workflow({...request,state:{...s,plan:{...s.plan,minimumFunding:0.01}}}),/PLAN_CHANGED/);
 target.metadata.guestPlan.expiresAt='2020-01-01T00:00:00Z';await assert.rejects(workflow(request),/PLAN_EXPIRED/);
 target.metadata.guestPlan=guestPlanAttestation(s,1800000);
 await assert.rejects(createPrivateWorkflow({infer:()=>assert.fail(),estimate:()=>0.4})(request),/QUOTE_CHANGED/);
});
test('fixed guest validation failures remain actionable without persisting arbitrary provider text',async()=>{
 const {privateActionFailure}=await import('./private-action-failure.js');
 for(const code of ['PRIVATE_GUEST_PLAN_EXPIRED','PRIVATE_GUEST_PLAN_CHANGED','PRIVATE_GUEST_PLAN_QUOTE_CHANGED','PRIVATE_GUEST_PLAN_VALIDATION_REQUIRED','PRIVATE_GUEST_ACTION_LIMIT','PRIVATE_FUNDING_INPUTS_REQUIRED'])assert.deepEqual(privateActionFailure(Error(code)),{error:code});
 assert.deepEqual(privateActionFailure(Error('synthetic private prompt/provider response')),{error:'PRIVATE_ACTION_UNAVAILABLE'});
});

test('revalidation and bounded edits preserve original generation expiry; only real configure renews it',()=>{
 const now=Date.now(),s={status:'planned',brief:{topic:'Synthetic'},budgetCap:1,plan:{source:'llm',sub_questions:['A']}};
 let proof=guestPlanAttestation(s,10000,now);const original={issuedAt:proof.issuedAt,expiresAt:proof.expiresAt};
 for(const [action,offset] of [['validate-plan',9000],['edit-plan',9990],['validate-plan',9999]]){
  proof=nextGuestPlanAttestation(s,action,proof,1800000,now+offset);
  assert.deepEqual({issuedAt:proof.issuedAt,expiresAt:proof.expiresAt},original);
 }
 assert.throws(()=>nextGuestPlanAttestation(s,'validate-plan',proof,1800000,now+10000),/PLAN_EXPIRED/);
 const generated=nextGuestPlanAttestation(s,'configure',proof,1800000,now+10001);
 assert.equal(Date.parse(generated.expiresAt),now+10001+1800000);
});

test('changed reviewed model/pricing policy requires explicit replan even if estimate happens to match',async()=>{
 const s={...state(),status:'planned',budgetCap:1,brief:{...state().brief,length:'brief',depth:'standard',liveWeb:true,searchEnabled:false},plan:{source:'llm',modelPolicy:'old-reviewed-policy',sub_questions:['A','B','C'],estimate:0.2,minimumFunding:0.25}};
 const target={id:'target',userId:'account',metadata:{guestAdoption:{validationRequired:false},guestPlan:guestPlanAttestation(s,1800000)}};
 const workflow=createPrivateWorkflow({infer:()=>assert.fail('policy change must not trigger automatic inference'),policyRevision:'new-reviewed-policy',estimate:()=>({estimate:0.2,minimumFunding:0.25})});
 await assert.rejects(workflow({run:target,state:s,action:'validate-plan'}),/POLICY_CHANGED/);
 await assert.rejects(workflow({run:target,state:s,action:'edit-plan',args:{sub_questions:['A','B','C']}}),/POLICY_CHANGED/);
});
