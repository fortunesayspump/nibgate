import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const controls=vi.hoisted(()=>({search:null,write:null,trust:null,followUps:[]}));
vi.mock('./queue.js',()=>({enqueue:vi.fn(async()=>({})),queueMode:()=> 'test'}));
vi.mock('./llm/provider.js',()=>({isLlmConfigured:()=>false,chat:vi.fn()}));
vi.mock('./llm/generate.js',()=>({
  generatePlan:async()=>({sub_questions:['Synthetic costs'],source:'llm',usage:{costUsd:0.1}}),
  generateReport:async()=>{await controls.write?.();return {markdown:'# Synthetic report\n\nThe provided record lists USD 42 [1].',source:'llm',usage:{costUsd:0.2}}},
  generateReportLong:vi.fn(),generateRoundReview:async()=>({learnings:['The provided record lists USD 42.'],followUps:controls.followUps,source:'llm',usage:{costUsd:0.01}}),generateStageNote:async()=>'',
}));
vi.mock('./jev/decisions.js',()=>({
  runSourceBatch:async(_runId,docs)=>{
    const trust=controls.trust ? await controls.trust() : {probability:0.9};
    return trust ? {judged:docs.map(doc=>({doc,trust:trust.probability,grade:3})),costUsd:0} : null;
  },
  runChoice:async()=>({pick:'write',usage:{costUsd:0}}),
}));
vi.mock('./verify.js',()=>({verifyReport:async()=>({costUsd:0})}));
vi.mock('./tools/sandbox.js',()=>({sandboxConfigured:()=>false,destroySandbox:async()=>{},destroyAllSandboxes:async()=>{}}));
vi.mock('./tools/executor.js',()=>({runTool:vi.fn(async(_id,name)=>{
  if(name==='web_search'){await controls.search?.();return {ok:true,costUsd:0.1,output:{attempted:true,providers:[{name:'synthetic',ok:true}],results:[1,2,3].map(n=>({url:`https://primary.example/${n}`,title:`Primary record ${n}`,score:1,content:'Synthetic primary evidence: cost USD 42. '.repeat(25)}))}}}
  if(name==='http_request') return {ok:true,costUsd:0,output:{status:402,headers:{'payment-required':Buffer.from(JSON.stringify({accepts:[5042,5042002].map(id=>({network:`eip155:${id}`,asset:'0x3600000000000000000000000000000000000000',amount:'500000'}))})).toString('base64')},body:'{}'}};
  throw new Error('Unexpected external tool '+name);
})}));
import {db} from './db.js';
import {runPlan,runExecute} from './worker.js';
import {endRun} from './end-run.js';
import {budgetState} from './money.js';
import {runTool} from './tools/executor.js';
const id='worker-pipeline-fixture';
beforeEach(async()=>{
  controls.search=null;controls.write=null;controls.trust=null;controls.followUps=[];vi.clearAllMocks();
  await db.researchRun.create({data:{id,userId:'pipeline-owner',status:'running',brief:{topic:'Synthetic costs',depth:'quick',lengthWords:600},budgetCap:2,plan:{sub_questions:['Synthetic costs']}}});
  await db.budgetLedger.create({data:{runId:id,kind:'deposit',amount:2}});
});
afterEach(async()=>{await db.researchRun.delete({where:{id}});await db.queryMemory.deleteMany({where:{userId:'pipeline-owner'}})});
function barrier(){let enter,release;const entered=new Promise(r=>enter=r),held=new Promise(r=>release=r);return {entered,release,hold:async()=>{enter();await held}}}
it('plans without drawing research funds',async()=>{
  await db.researchRun.update({where:{id},data:{status:'planning'}});
  await runPlan(id);
  expect((await budgetState(id)).used).toBe(0);
  const planned=await db.researchRun.findUnique({where:{id}});
  expect(planned.status).toBe('planned');
  expect(planned.plan.source).toBe('llm');
});
it('builds a new free plan after configuration changes instead of replaying the old one',async()=>{
  await db.researchRun.update({where:{id},data:{status:'planning',metadata:{planningPending:true,planRevision:1}}});await runPlan(id);
  await db.researchRun.update({where:{id},data:{status:'planning',metadata:{planningPending:true,planRevision:2}}});await runPlan(id);
  expect(await db.researchStep.count({where:{runId:id,kind:'plan',status:'done'}})).toBe(2);
  expect((await budgetState(id)).used).toBe(0);
});
it('pauses during a stage, resumes its checkpoint and never charges the same search twice',async()=>{
  const gate=barrier();controls.search=gate.hold;
  const working=runExecute(id);await gate.entered;
  await db.researchRun.update({where:{id},data:{status:'paused',pauseReason:'user'}});
  gate.release();await working;
  expect((await budgetState(id)).used).toBe(0.1);
  expect((await db.researchRun.findUnique({where:{id}})).settledAt).toBeNull();
  controls.search=null;
  await db.researchRun.update({where:{id},data:{status:'running'}});await runExecute(id);
  expect(runTool.mock.calls.filter(c=>c[1]==='web_search')).toHaveLength(1);
  expect((await db.researchRun.findUnique({where:{id}})).status).toBe('complete');
  expect((await budgetState(id)).balance).toBe(0);
});
it('ends in flight, waits for cost accounting, and refunds the remainder exactly once',async()=>{
  const gate=barrier();controls.search=gate.hold;
  const working=runExecute(id);await gate.entered;
  expect((await endRun(id)).pending).toBe(true);
  expect((await budgetState(id)).refunded).toBe(0);
  gate.release();await working;
  const state=await budgetState(id);
  expect(state.used).toBe(0.1);expect(state.refunded).toBe(1.9);expect(state.balance).toBe(0);
  await runExecute(id);expect((await budgetState(id)).refunded).toBe(1.9);
});
it('allows only one driver to execute a stage across duplicate deliveries',async()=>{
  const gate=barrier();controls.search=gate.hold;
  const first=runExecute(id);await gate.entered;await runExecute(id);gate.release();await first;
  expect(runTool.mock.calls.filter(c=>c[1]==='web_search')).toHaveLength(1);
  expect(await db.researchReport.count({where:{runId:id}})).toBe(1);
});
it('completes source-only research without any external retrieval call',async()=>{
  await db.researchRun.update({where:{id},data:{brief:{topic:'Synthetic costs',depth:'quick',lengthWords:600,liveWeb:false}}});
  await db.researchStep.create({data:{runId:id,kind:'input',status:'done',output:{documents:[{url:'/private/synthetic',title:'Synthetic expense record',text:'Amount USD 42',provider:'user-upload',relevance:1}]}}});
  await runExecute(id);
  expect(runTool).not.toHaveBeenCalled();
  expect((await db.researchRun.findUnique({where:{id}})).status).toBe('complete');
  expect((await budgetState(id)).spend).toBe(0.21);
  expect((await db.researchSource.findMany({where:{runId:id}}))[0].url).toBe('/private/synthetic');
});
it('previews a user-named paid URL even when search already found three free sources',async()=>{
  const url='https://creator.example/api/writing/relevant-source';
  await db.researchRun.update({where:{id},data:{brief:{topic:`Compare sources and decide whether ${url} is worth buying`,depth:'quick',lengthWords:600}}});
  await runExecute(id);
  expect(runTool.mock.calls.some(c=>c[1]==='http_request' && c[2].url===url)).toBe(true);
  const data=await db.researchStep.findFirst({where:{runId:id,kind:'data',status:'done'}});
  expect(data.output.documents[0].text).toContain('Quoted price: 0.5 USDC');
  expect((await db.researchRun.findUnique({where:{id}})).status).toBe('complete');
});
it('resumes after a pause during writing without another report or writing charge',async()=>{
  controls.followUps=['A marginal angle JEV chose not to pursue'];
  const gate=barrier();controls.write=gate.hold;
  const working=runExecute(id);await gate.entered;
  await db.researchRun.update({where:{id},data:{status:'paused',pauseReason:'user'}});gate.release();await working;
  const before=await budgetState(id);expect(before.refunded).toBe(0);
  controls.write=null;await db.researchRun.update({where:{id},data:{status:'running'}});await runExecute(id);
  expect(await db.researchReport.count({where:{runId:id}})).toBe(1);
  expect((await budgetState(id)).spend).toBe(before.spend);
  expect((await db.researchRun.findUnique({where:{id}})).status).toBe('complete');
});
it('parks on unavailable trust judgement and retries the pending score stage on resume',async()=>{
  controls.trust=async()=>{await db.researchRun.update({where:{id},data:{status:'paused',pauseReason:'jev'}});return null};
  await runExecute(id);
  expect((await db.researchRun.findUnique({where:{id}})).status).toBe('paused');
  expect(await db.researchStep.count({where:{runId:id,kind:'score',status:'done'}})).toBe(0);
  controls.trust=null;await db.researchRun.update({where:{id},data:{status:'running'}});await runExecute(id);
  expect((await db.researchRun.findUnique({where:{id}})).status).toBe('complete');
});
it('records a generation failure, retains completed work and refunds the unused balance',async()=>{
  controls.write=async()=>{throw new Error('synthetic provider outage')};
  await expect(runExecute(id)).rejects.toThrow('synthetic provider outage');
  expect((await db.researchRun.findUnique({where:{id}})).status).toBe('failed');
  expect(await db.researchReport.count({where:{runId:id}})).toBe(0);
  const state=await budgetState(id);expect(state.balance).toBe(0);expect(state.refunded).toBeCloseTo(2-state.spend,8);
});
