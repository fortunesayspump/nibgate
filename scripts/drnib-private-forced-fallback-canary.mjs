// Opt-in live-provider canary. Run inside the exact reviewed guest image.
// Public fictional input only. The primary fault is injected before transport;
// it is not evidence of an actual Phala outage or remote-CVM execution.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const root='/app/dr-nib/backend',require=createRequire(root+'/package.json');
const {PrismaClient}=require('@prisma/client');
const cfg=JSON.parse(await readFile('/run/canary/credentials.json','utf8'));
const out='/canary-output/result.json';
await writeFile(out,'{}',{mode:0o600,flag:'wx'});
const {createPrivateWorkflow}=await import(root+'/src/privacy/private-workflow.js');
const {createPrivateWorkflowAi}=await import(root+'/src/privacy/private-workflow-ai.js');
const {createPrivateModelPool}=await import(root+'/src/privacy/private-model-pool.js');
const {createOpenRouterZdrPort,OPENROUTER_ZDR_MODEL}=await import(root+'/src/privacy/openrouter-zdr-port.js');
const {createHostedJevPort}=await import(root+'/src/privacy/hosted-jev-port.js');
const {PRIVATE_NOT_DISPATCHED}=await import(root+'/src/privacy/phala-ai-port.js');
const db=new PrismaClient({datasourceUrl:cfg.databaseUrl,log:[],transactionOptions:{timeout:60000,maxWait:10000}});
const broker=new PrismaClient({datasourceUrl:cfg.brokerDatabaseUrl,log:[],transactionOptions:{timeout:60000,maxWait:10000}});
const runId=randomUUID(),actionId=randomUUID();
let run,forcedPrimaryFailures=0,azureRequests=0,jevRequests=0,progress=[];
const deadline=Date.now()+8*60000;
const network=async(url,options)=>{
 assert.ok(Date.now()<deadline,'Canary deadline exceeded');
 const body=JSON.parse(options.body);
 assert.equal(body.provider.zdr,true);assert.equal(body.provider.data_collection,'deny');
 assert.equal(body.provider.allow_fallbacks,false);assert.equal(body.provider.require_parameters,true);
 if(url==='https://openrouter.ai/api/v1/chat/completions'){
  assert.deepEqual(body.provider.only,['Azure']);assert.equal(body.model,OPENROUTER_ZDR_MODEL);azureRequests++;
 }else{
  assert.equal(url,'https://openrouter.ai/api/alpha/decisions');
  assert.deepEqual(body.provider.only,['TypeSafe']);assert.equal(body.model,'typesafe/jev-1.13');jevRequests++;
 }
 assert.ok(azureRequests+jevRequests<=20,'Bounded live request count exceeded');
 return fetch(url,options);
};
try{
 assert.equal(new URL(cfg.databaseUrl).pathname,'/drnib_private_synthetic');
 assert.ok(Number.isSafeInteger(cfg.reviewExpiresAtMs)&&cfg.reviewExpiresAtMs>Date.now());
 for(const key of [cfg.researchKey,cfg.jevKey]){
  const response=await fetch('https://openrouter.ai/api/v1/key',{headers:{authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(15000)});
  assert.ok(response.ok);const metadata=await response.json();assert.equal(metadata.data.workspace_id,cfg.workspaceId);
 }
 await Promise.all([db.$connect(),broker.$connect()]);
 const prior=await db.privateInferenceCall.aggregate({_sum:{committedMicroUsd:true},where:{monthKey:new Date().toISOString().slice(0,7)}});
 const legacy=await db.privateAiBudgetReservation.aggregate({_sum:{committedMicroUsd:true},where:{monthKey:new Date().toISOString().slice(0,7)}});
 const before=Number(prior._sum.committedMicroUsd??0)+Number(legacy._sum.committedMicroUsd??0);
 assert.ok(before<=740000,'Insufficient current AI headroom');
 run=await broker.researchRun.create({data:{id:runId,userId:cfg.ownerId,title:'Public forced ZDR fallback canary',brief:{encrypted:true},status:'paused',metadata:{privacyMode:'confidential',publicDiagnostic:true,canary:'local-image-forced-predispatch-fallback'}}});
 await db.privateActionReceipt.create({data:{id:randomUUID(),runId,requestId:actionId,digest:'public-forced-fallback-v1',status:'processing'}});
 const fallbackInfer=createPrivateWorkflowAi({db,model:OPENROUTER_ZDR_MODEL,monthlyCapMicroUsd:770000,inputPricePerMillion:150000,outputPricePerMillion:600000,hostedZdr:true,
  aiPort:createOpenRouterZdrPort({apiKey:cfg.researchKey,reviewExpiresAtMs:cfg.reviewExpiresAtMs,fetchImpl:network})});
 const infer=createPrivateModelPool({db,monthlyCapMicroUsd:770000,fallbackInfer,createPort:()=>({privateVerifiedTransport:'phala-aci-v1',infer:async()=>{
  forcedPrimaryFailures++;
  const error=Object.assign(Error('Canary injected pre-dispatch session absence'),{code:'PHALA_PRIVATE_AI_UNAVAILABLE',failureStage:'session'});
  Object.defineProperty(error,PRIVATE_NOT_DISPATCHED,{value:true});throw error;
 }})});
 const judge=createHostedJevPort({db,apiKey:cfg.jevKey,monthlyCapMicroUsd:770000,fetchImpl:network,policy:{contextDisclosure:'openrouter-and-typesafe',decisionsZdrRoutingVerified:true,loggingReviewExpiresAtMs:cfg.reviewExpiresAtMs}});
 const source='Fictional four-week greenhouse irrigation pilot. Bench F used 126 L of water and harvested 1.80 kg. Bench M used 98 L of water and harvested 1.86 kg. Treatments were not randomized and bench position differed. Lighting was not measured, and one sensor drifted. No plant-level measurements or variance were recorded. These fictional observations do not establish causality, statistical significance, financial savings or commercial viability. A proposed follow-up would randomize replicated benches, measure lighting and calibrate sensors.';
 const bytes=Buffer.from(source),state={status:'planned',budgetCap:.025,brief:{topic:'Analyze the uploaded fictional irrigation pilot for a greenhouse manager. Compare 126 L minus 98 L and 1.86 kg minus 1.80 kg. Explain confounding and uncertainty and propose a randomized follow-up. Label the pilot fictional. Do not infer causation, significance, financial savings or commercial viability. Use only the uploaded source. No search, public calls, paid sources, tips or terminal.',depth:'quick',lengthWords:300,qualityPolicyVersion:2,liveWeb:false,searchEnabled:false,tipCreators:false},plan:{sub_questions:['Compare the fictional water and harvest measurements.','Explain limitations and a randomized follow-up.']},reports:[],events:[],decisions:[],steps:[]};
 const workflow=createPrivateWorkflow({infer,judge});
 const result=await workflow({state,action:'execute',run,actionId,sources:[{id:'public-fictional-basil',name:'fictional-basil.txt',bytes:bytes.length,contentBase64:bytes.toString('base64')}],onProgress:async snapshot=>{
  progress=snapshot.events;console.log(JSON.stringify({phase:progress.at(-1)?.phase,note:progress.at(-1)?.text}));
 }});
 await writeFile('/canary-output/completed-state.json',JSON.stringify(result.state,null,2),{mode:0o600,flag:'wx'});
 assert.equal(result.state.status,'complete');assert.equal(result.state.reports.length,1);
 const report=result.state.reports[0].markdown;
 assert.match(report,/fictional/i);assert.match(report,/28/);assert.match(report,/0\.06/);assert.match(report,/random/i);
 assert.ok(result.state.claims.length>0);assert.ok(result.state.claims.some(c=>c.status==='supported'));assert.ok(result.state.claims.every(c=>c.status!=='unsupported'));
 assert.ok(forcedPrimaryFailures>=1&&azureRequests>=1&&jevRequests>=1);
 const hostedNotes=progress.filter(e=>e.origin==='usage'&&e.source==='OpenRouter-ZDR');
 assert.ok(hostedNotes.length>=1);assert.ok(hostedNotes.every(e=>e.privacy==='hosted-provider-visible'&&/OpenRouter and Azure/.test(e.text)));
 const rows=await db.privateInferenceCall.findMany({where:{runId},select:{model:true,status:true,billingKind:true,costBasis:true,committedMicroUsd:true,usageEvidence:true}});
 assert.equal(rows.filter(r=>r.model===OPENROUTER_ZDR_MODEL).length,azureRequests);
 assert.ok(rows.every(r=>r.model===OPENROUTER_ZDR_MODEL?r.status==='accounted'&&r.costBasis==='provider-reported'&&r.usageEvidence.privacy==='hosted-provider-visible':r.model==='typesafe/jev-1.13'?r.status==='accounted':r.status==='not-dispatched'&&r.committedMicroUsd===0n));
 const cost=rows.reduce((n,r)=>n+Number(r.committedMicroUsd),0);
 await db.privateActionReceipt.update({where:{runId_requestId:{runId,requestId:actionId}},data:{status:'complete'}});
 const evidence={checkedAt:new Date().toISOString(),passed:true,scope:'exact deployed image executed locally; injected primary pre-dispatch fault; real Azure and JEV; real shared accounting; public fictional input only',runId,actionId,forcedPrimaryFailures,azureRequests,jevRequests,costMicroUsd:cost,beforeMicroUsd:before,afterMicroUsd:before+cost,claims:result.state.claims,report,hostedNotes,rows:rows.map(r=>({...r,committedMicroUsd:Number(r.committedMicroUsd)}))};
 await writeFile(out,JSON.stringify(evidence,null,2),{mode:0o600});
 console.log(JSON.stringify({passed:true,runId,forcedPrimaryFailures,azureRequests,jevRequests,costMicroUsd:cost,claims:result.state.claims.length,supportedClaims:result.state.claims.filter(c=>c.status==='supported').length}));
}catch(error){
 const evidence={checkedAt:new Date().toISOString(),passed:false,runId,forcedPrimaryFailures,azureRequests,jevRequests,error:error.code??error.message,progress};
 await writeFile(out,JSON.stringify(evidence,null,2),{mode:0o600});
 if(run)await db.privateActionReceipt.updateMany({where:{runId,requestId:actionId,status:'processing'},data:{status:'uncertain'}}).catch(()=>{});
 console.log(JSON.stringify({passed:false,error:evidence.error,forcedPrimaryFailures,azureRequests,jevRequests}));process.exitCode=1;
}finally{
 if(run)await broker.researchRun.update({where:{id:runId},data:{deletedAt:new Date()}}).catch(()=>{});
 await Promise.all([db.$disconnect(),broker.$disconnect()]);
}
