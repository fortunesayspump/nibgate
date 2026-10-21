// Entirely synthetic local integration: genuine PostgreSQL, AES/HPKE,
// capability JWTs, broker/guest HTTP and production export renderers. The
// explicit quote/model fixtures do not constitute hardware or quality evidence.
import {randomBytes,randomUUID,createHash,createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import express from 'express';
import request from 'supertest';
import {generateKeyPair} from 'jose';
import {beforeAll,expect,it} from 'vitest';
import {db} from '../src/db.js';
import {createPrivateRecordsRouter} from '../src/privacy/private-record-routes.js';
import {createPrivateBrokerRouter} from '../src/privacy/private-broker.js';
import {createPrivateGuestHttpServer} from '../src/privacy/private-guest-http.js';
import {createGuestSessionManager} from '../src/privacy/guest-session.js';
import {createPrivateActionRunner} from '../src/privacy/private-action-runner.js';
import {createPrivateActionStore} from '../src/privacy/private-action-store.js';
import {privateCheckpointGrant} from '../../tools/private-checkpoint-grant.mjs';
import {canonicalCiphertext} from '../src/privacy/ciphertext-digest.js';
import {createHostedJevPort} from '../src/privacy/hosted-jev-port.js';
import {createPrivateWorkflow} from '../src/privacy/private-workflow.js';
import {createPrivateWorkflowAi} from '../src/privacy/private-workflow-ai.js';
import {createPhalaAiPort} from '../src/privacy/phala-ai-port.js';
import {createPrivateCapabilitySigner,createGuestCapabilityAuthenticator,createInMemoryJtiConsumer} from '../src/privacy/private-capability.js';
import {sealHpkeSource,recipientIdForPublicKey,generateHpkeRecipient,openHpkeToolResult} from '../src/privacy/source-hpke.js';
import {createPrivateExternalTools,createPrivateExternalToolsRouter} from '../src/privacy/private-external-tools.js';
import {sealClientObject,openClientObject} from '../src/privacy/client-object-crypto.js';
import {PRIVATE_USAGE,PRIVATE_NOT_DISPATCHED,PRIVATE_REFUSAL_EVIDENCE,PRIVATE_FAILURE_EVIDENCE} from '../src/privacy/phala-ai-port.js';
const require=createRequire(new URL('../../../frontend/package.json',import.meta.url)),ts=require('typescript');
const {outputText}=ts.transpileModule(readFileSync(new URL('../../../frontend/src/lib/dr-nib-private-vault.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});
const {createPrivateVault,createPrivateProjectKeys,recoverPrivateVault,openPrivateProjectKeys,rewrapPrivateProjectKeys}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
// Exercise the checked-in migration itself, including constraints Prisma db
// push does not express. This suite only ever runs in the disposable test DB.
beforeAll(async()=>{
 const url=new URL(process.env.DRNIB_DATABASE_URL);
 if(url.hostname!=='127.0.0.1'||url.searchParams.get('schema')!=='drnib_test')throw Error('Local migration fixture required');
 await db.$executeRawUnsafe('DROP VIEW IF EXISTS "PrivateToolBillingMetadata"');
 for(const name of ['PrivateToolCall','PrivateInferenceCall','PrivateActionReceipt','PrivateClientObject','PrivateVaultRecord'])await db.$executeRawUnsafe('DROP TABLE "'+name+'"');
 const sql=readFileSync(new URL('../prisma/migrations/0009_private_client_vault/migration.sql',import.meta.url),'utf8');
 for(const statement of sql.split(/;\s*\n/).map(s=>s.trim()).filter(Boolean))await db.$executeRawUnsafe(statement.replace(/;$/,''));
 const billing=readFileSync(new URL('../prisma/migrations/0010_private_inference_billing/migration.sql',import.meta.url),'utf8').replace(/^--.*$/gm,'');
 for(const statement of billing.split(';').map(s=>s.trim()).filter(Boolean))await db.$executeRawUnsafe(statement);
 const actual=readFileSync(new URL('../prisma/migrations/0011_private_actual_usage/migration.sql',import.meta.url),'utf8').replace(/^--.*$/gm,'');
 for(const statement of actual.split(';').map(s=>s.trim()).filter(Boolean))await db.$executeRawUnsafe(statement);
 const checkpoint=readFileSync(new URL('../prisma/migrations/0012_private_checkpoints/migration.sql',import.meta.url),'utf8').replace(/^--.*$/gm,'');
 for(const statement of checkpoint.split(';').map(s=>s.trim()).filter(Boolean))await db.$executeRawUnsafe(statement);
 const tools=readFileSync(new URL('../prisma/migrations/0013_private_tools/migration.sql',import.meta.url),'utf8').replace(/^--.*$/gm,'');
 for(const statement of tools.split(';').map(s=>s.trim()).filter(Boolean))await db.$executeRawUnsafe(statement);
 const settlement=readFileSync(new URL('../prisma/migrations/0014_private_tool_settlement/migration.sql',import.meta.url),'utf8').replace(/^--.*$/gm,'');
 for(const statement of settlement.split(';').map(s=>s.trim()).filter(Boolean))await db.$executeRawUnsafe(statement);
 const billingView=readFileSync(new URL('../prisma/migrations/0015_private_tool_billing_metadata/migration.sql',import.meta.url),'utf8');
 await db.$executeRawUnsafe(billingView);
});
const CANARY='SYNTHETIC_LOCAL_PRIVATE_WORKFLOW_CANARY';
const json=v=>({choices:[{message:{content:JSON.stringify(v)},finish_reason:'stop'}]});
it('hosted JEV bypasses the Hub, reserves before native dispatch and blocks retries after unknown outcomes',async()=>{
 await fixture(async f=>{
  const actionId=randomUUID();
  await db.privateActionReceipt.create({data:{id:randomUUID(),runId:f.runId,requestId:actionId,digest:'synthetic-jev',status:'processing'}});
  let calls=0;
  const port=createHostedJevPort({db,apiKey:'synthetic-never-real',monthlyCapMicroUsd:1000000,policy:{contextDisclosure:'openrouter-and-typesafe',decisionsZdrRoutingVerified:true},fetchImpl:async(url,options)=>{
   calls++;expect(url).toBe('https://openrouter.ai/api/alpha/decisions');expect(options.redirect).toBe('error');
   const body=JSON.parse(options.body);expect(body.provider).toEqual({only:['TypeSafe'],allow_fallbacks:false,require_parameters:true,data_collection:'deny',zdr:true});expect(body.model).toBe('typesafe/jev-1.13');
   expect(body.trace).toBeUndefined();expect(body.user).toBeUndefined();expect(body.session_id).toBeUndefined();
   const reserved=await db.privateInferenceCall.findFirst({where:{runId:f.runId,actionId,status:'reserved'}});expect(reserved.committedMicroUsd).toBeGreaterThan(0n);expect(JSON.stringify(reserved,(_,v)=>typeof v==='bigint'?String(v):v)).not.toContain(CANARY);
   if(calls===2)throw Error(CANARY+' uncertain response');
   return Response.json({id:'synthetic-response',model:'typesafe/jev-1.13-20260917',provider:'TypeSafe',answers:{decision:{type:'choice',choice:'write',probabilities:{write:0.9,continue:0.1},confidence:0.9}},usage:{input_tokens:1000,output_tokens:20,cost:0.000001}});
  }});
  const input={run:{id:f.runId,userId:f.tenantId},actionId,request:{state:CANARY,questions:{decision:{type:'choice',instructions:'Choose the next bounded action.',criteria:{write:'Write with limitations.',continue:'Collect more evidence.'}}}}};
  const result=await port(input);expect(result.privacy).toBe('hosted-provider-visible');expect(result.answers.decision.choice).toBe('write');expect(result.costMicroUsd).toBe(1);
  expect((await db.privateInferenceCall.findFirst({where:{runId:f.runId,actionId}})).status).toBe('accounted');
  await expect(port(input)).rejects.toThrow('HOSTED_JEV_UNAVAILABLE');
  await expect(port(input)).rejects.toThrow('HOSTED_JEV_UNAVAILABLE');expect(calls).toBe(2);
  expect(await db.privateInferenceCall.count({where:{runId:f.runId,actionId,status:'reserved'}})).toBe(1);
 });
});
it('the actual restricted guest state grant permits new encrypted checkpoints while update-only access does not',async()=>{
 await fixture(async f=>{
  const role='private_checkpoint_'+randomUUID().replaceAll('-','');
  await db.$executeRawUnsafe(`CREATE ROLE ${role} NOLOGIN`);
  try{
  await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA drnib_test TO ${role}`);
  await db.$executeRawUnsafe(`GRANT SELECT, UPDATE ON "PrivateClientObject" TO ${role}`);
  const objectId=randomUUID(),envelope=sealClientObject(f.stateKey,f.context(objectId,'checkpoint'),Buffer.from(JSON.stringify({synthetic:CANARY})));
  const insert=()=>db.$transaction(async tx=>{await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);return tx.privateClientObject.create({data:{id:randomUUID(),runId:f.runId,vaultId:f.vault.vaultId,objectId,kind:'checkpoint',revision:1,envelope,digest:createHash('sha256').update(canonicalCiphertext(envelope)).digest('hex')}})});
  await expect(insert()).rejects.toThrow();
  await db.$executeRawUnsafe(privateCheckpointGrant({schema:'drnib_test',role}));
  const row=await insert();expect(row.kind).toBe('checkpoint');expect(JSON.stringify(row)).not.toContain(CANARY);
  await expect(db.$transaction(async tx=>{await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);return tx.privateToolCall.findFirst({select:{request:true}})})).rejects.toThrow();
  }finally{await db.$executeRawUnsafe(`DROP OWNED BY ${role}`);await db.$executeRawUnsafe(`DROP ROLE ${role}`);}
 });
});
it('intake journals completed model and JEV results before finalization and recovers without repurchasing either',async()=>{
 await fixture(async f=>{
  const failed=await f.action('intake');expect(failed.response.status).toBe(503);
  const row=await db.privateClientObject.findFirst({where:{runId:f.runId,kind:'checkpoint'}});expect(row).not.toBeNull();
  const journal=JSON.parse(openClientObject(f.stateKey,f.context(row.objectId,'checkpoint',row.revision),row.envelope).toString());
  expect(journal.entries.map(e=>[e.kind,e.state])).toEqual([['infer','complete'],['judge','complete']]);
  const calls=f.getCalls(),judges=f.generationRequests.filter(r=>r.stage==='judge').length;
  await db.privateActionReceipt.updateMany({where:{runId:f.runId,requestId:failed.requestId},data:{leaseUntil:new Date(Date.now()-1000)}});
  const recovered=await f.action('recover',{},failed.requestId);expect(recovered.response.status).toBe(200);expect(recovered.value.questions.length).toBeGreaterThan(0);
  expect(f.getCalls()).toBe(calls);expect(f.generationRequests.filter(r=>r.stage==='judge')).toHaveLength(judges);
 },{withJudge:true,failAfterWorkflowOnce:true});
});
it('planning recovery restores cached inference and the source-bound funding readiness metadata',async()=>{
 await fixture(async f=>{
  await f.action('intake');await f.action('finish-intake');
  const sourceId=randomUUID(),payload={name:'synthetic.txt',bytes:CANARY.length,contentBase64:Buffer.from(CANARY).toString('base64')};
  expect((await f.api.put(`/v1/private/runs/${f.runId}/objects/${sourceId}`).send({vaultId:f.vault.vaultId,kind:'source',expectedRevision:0,envelope:sealClientObject(f.stateKey,f.context(sourceId,'source'),Buffer.from(JSON.stringify(payload)))})).status).toBe(201);
  const failed=await f.action('configure',{depth:'quick',budgetCap:0.25,lengthWords:300,formats:['pdf'],liveWeb:false});expect(failed.response.status).toBe(503);
  const calls=f.getCalls();await db.privateActionReceipt.updateMany({where:{runId:f.runId,requestId:failed.requestId},data:{leaseUntil:new Date(Date.now()-1000)}});
  const recovered=await f.action('recover',{},failed.requestId);expect(recovered.response.status).toBe(200);expect(recovered.value.status).toBe('planned');expect(f.getCalls()).toBe(calls);
  const run=await db.researchRun.findUnique({where:{id:f.runId}});expect(run.metadata.privateFundingInputs).toMatchObject({version:1,sourceCount:1,webApproved:false});
 },{failAfterWorkflowOnce:'configure'});
});
it('final manifest commit survives a proxy round trip exceeding Prisma default transaction timeout',async()=>{
 await fixture(async f=>{
  const delayed=new Proxy(db,{get(target,key){if(key==='$transaction')return (fn,options)=>target.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT pg_sleep(5.1)::text');return fn(tx);},options);return Reflect.get(target,key);}});
  const store=createPrivateActionStore({db:delayed,storage:{},stateKey:f.stateKey,tenantId:f.tenantId,runId:f.runId,vaultId:f.vault.vaultId}),before=await store.load();
  await store.commit(before,{...before.value,description:'Synthetic delayed final save'},{status:'draft'});
  expect((await store.load()).value.description).toBe('Synthetic delayed final save');
 });
});
it('progress is encrypted, owner scoped, survives receipt reads and cannot overwrite a finalized action',async()=>{
 await fixture(async f=>{
  const store=createPrivateActionStore({db,storage:{},stateKey:f.stateKey,tenantId:f.tenantId,runId:f.runId,vaultId:f.vault.vaultId});
  const before=await store.load(),requestId=randomUUID();
  const claim=await store.claim({requestId,digest:'synthetic-progress',manifestId:before.row.id,manifestRevision:before.row.revision});
  const snapshot={events:[{type:'thinking',at:new Date().toISOString(),phase:'write',text:CANARY+' '.repeat(140*1024)}]};
  expect(Buffer.byteLength(JSON.stringify(snapshot))).toBeGreaterThan(128*1024);
  await expect(store.progress(claim.id,{events:[{text:'x'.repeat(512*1024)}]})).rejects.toThrow('PRIVATE_WORKFLOW_UNAVAILABLE');
  await Promise.all([store.progress(claim.id,snapshot),store.progress(claim.id,snapshot)]);
  const active=await f.api.get(`/v1/private/runs/${f.runId}/actions`);
  expect(active.body.state).toBe('processing');expect(active.body.progress.context.revision).toBe(2);
  expect(JSON.stringify(active.body)).not.toContain(CANARY);
  expect(JSON.parse(openClientObject(f.stateKey,f.context(requestId,'action-progress',2),active.body.progress).toString())).toEqual(snapshot);
  expect(()=>openClientObject(f.stateKey,f.context(requestId,'event',2),active.body.progress)).toThrow('PRIVATE_OBJECT_UNAVAILABLE');
  const receipt=await f.api.get(`/v1/private/runs/${f.runId}/actions/${requestId}`);
  expect(receipt.body.progress).toEqual(active.body.progress);expect(receipt.body.envelope).toBeUndefined();
  f.setCaller('outsider');expect((await f.api.get(`/v1/private/runs/${f.runId}/actions`)).status).toBe(404);f.setCaller(f.tenantId);
  const reply=sealClientObject(f.stateKey,f.context(requestId,'event'),Buffer.from('{}'));
  await store.commit(before,before.value,{receiptId:claim.id,reply});
  await expect(store.progress(claim.id,snapshot)).rejects.toThrow('PRIVATE_WORKFLOW_UNAVAILABLE');
  expect((await f.api.get(`/v1/private/runs/${f.runId}/actions`)).body).toEqual({state:'idle'});
  const final=await f.api.get(`/v1/private/runs/${f.runId}/actions/${requestId}`);expect(final.body.envelope).toEqual(reply);expect(final.body.progress).toBeUndefined();
 });
});
async function fixture(body,{modelFailure=false,withJudge=false,publicRetrieval,verificationOutput,failAfterWorkflowOnce=false}={}){
 const tenantId=`local-${randomUUID()}`,runId=randomUUID(),manifestId=randomUUID();
 const {vault,recoverySecret,recoveryEnvelope}=await createPrivateVault(tenantId),project=await createPrivateProjectKeys(vault,runId),stateKey=project.secrets.workerStateKey;
 const objects=new Map(),storage={put:async(k,v)=>objects.set(k,Buffer.from(v)),get:async k=>Buffer.from(objects.get(k)),remove:async k=>objects.delete(k)};
 let caller=tenantId,calls=0,proposals=0,failStage=null,stageHook=async()=>{},firstProposal={tool:'compute',input:{operation:'subtract',values:[126,98]},why:'Check the observed difference.'};const generationRequests=[];
 const authenticate=(req,_res,next)=>{req.user={id:caller};next()};
 const app=express();app.use(express.json({limit:'5mb'}));app.use('/v1/private',createPrivateRecordsRouter({store:db,storage,authenticate,enabled:()=>true,allowedTenantId:tenantId}));
 const keys=await generateKeyPair('EdDSA');
 const infer=async(input)=>{
  generationRequests.push(input);const {messages}=input;
  await stageHook(input);
  calls++;if(modelFailure==='known')throw Error('PRIVATE_PLAN_INVALID');
  if(input.stage===failStage)throw Error('PRIVATE_PLAN_INVALID');
  if(modelFailure==='unknown-fixed'){await db.privateInferenceCall.create({data:{id:randomUUID(),runId,actionId:input.actionId,monthKey:new Date().toISOString().slice(0,7),model:'fixture/model',status:'reserved',reservedMicroUsd:10n,committedMicroUsd:10n}});throw Error('PRIVATE_PLAN_INVALID');}
  if(modelFailure)throw Error(CANARY+' provider exception');
  if(input.stage==='review')return json({learnings:['The synthetic observations support only descriptive comparisons.'],followUps:[]});
  const instruction=messages[0].content;
  if(input.stage==='agent')return json(proposals++===0?firstProposal:{tool:'write_report',input:{},why:'Write from the supplied observations.'});
  if(instruction.includes('interviewing')||instruction.includes('question')){
   // Planning also mentions questions; use its exact system discriminator.
   if(instruction.includes('planning, not researching'))return json({sub_questions:['What is observed?','What remains unknown?'],uncertainties:[],estimate:{sources:1,rationale:'synthetic'}});
   if(instruction.includes('questions')||instruction.includes('interviewing'))return json({questions:[{key:'goal',type:'pick_one',prompt:'Which outcome matters?',options:[{id:'a',label:'Understand'},{id:'b',label:'Compare'}],allowOther:true}]});
  }
  if(instruction.includes('planning, not researching'))return json({sub_questions:['What is observed?','What remains unknown?'],uncertainties:[],estimate:{sources:1,rationale:'synthetic'}});
  if(instruction.includes('Verify the report'))return json(verificationOutput?verificationOutput(input):{claims:[{text:CANARY,verdict:'supported',sourceIds:[1],quote:CANARY}]});
  return {choices:[{message:{content:`## Synthetic analysis\n\n${CANARY} ${'Synthetic evidence supports the observation [1]. '.repeat(34)}`},finish_reason:'stop'}]};
 };
 const judge=withJudge?async({request,budgetMicroUsd})=>{generationRequests.push({stage:'judge',budgetMicroUsd});return {model:'typesafe/jev-1.13-20260917',privacy:'hosted-provider-visible',costMicroUsd:1,answers:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>[id,q.type==='noul'?{type:'noul',noul:0.9}:{type:'choice',choice:id.startsWith('question_')?'ask':id==='gate'?'execute':'3',probabilities:{}}]))}}:undefined;
 const workflow=createPrivateWorkflow({infer,judge,publicRetrieval,estimate:()=>0.01});
 const runner={execute:async()=>{throw Error('legacy fixture unavailable')},action:createPrivateActionRunner({db,storage,workflow:async input=>{const result=await workflow(input);if(failAfterWorkflowOnce===true||failAfterWorkflowOnce===input.action){failAfterWorkflowOnce=false;throw Error('synthetic lost finalization');}return result;}})};
 const sessions=createGuestSessionManager({getRun:id=>db.researchRun.findUnique({where:{id}}),runner,model:'fixture/model',quoteProvider:async()=>({attestation:'aa'})});
 const guest=createPrivateGuestHttpServer({sessions,authenticate:createGuestCapabilityAuthenticator({publicKey:keys.publicKey,consumeJti:createInMemoryJtiConsumer()}),getReport:async()=>null,privateReady:true,workflowReady:true});
 await new Promise(resolve=>guest.listen(0,'127.0.0.1',resolve));
 const guestBase=`http://127.0.0.1:${guest.address().port}`;
 const wire=[];
 app.use('/v1/private',createPrivateBrokerRouter({store:db,authenticate,allowedTenantId:tenantId,guestBaseURL:'https://guest.fixture',signCapability:createPrivateCapabilitySigner({privateKey:keys.privateKey}),ready:async()=>true,workflowReady:async()=>true,
  fetchImpl:async(url,options)=>{if(options.body)wire.push(options.body);const response=await fetch(guestBase+new URL(url).pathname,options);return new Response(await response.arrayBuffer(),{status:response.status,headers:response.headers})}}));
 const api=request(app),context=(id,purpose,revision=1)=>({tenantId,vaultId:vault.vaultId,runId,objectId:id,revision,purpose});
 const initial={id:runId,title:CANARY,brief:{topic:CANARY,liveWeb:false},status:'intake',questions:[],intake:[],plan:null,version:1};
 try{
  expect((await api.put('/v1/private/vault').send({vaultId:vault.vaultId,expectedRevision:0,recoveryEnvelope,passkey:null})).status).toBe(201);
  const bootstrap=await api.post('/v1/private/projects').send({id:runId,vaultId:vault.vaultId,expectedVaultRevision:1,manifestId,manifestEnvelope:sealClientObject(stateKey,context(manifestId,'manifest'),Buffer.from(JSON.stringify(initial))),projectKeysEnvelope:project.envelope});
  expect(bootstrap.status).toBe(201);
  const action=async(name,args={},requestId=randomUUID())=>{
   const nonce=randomBytes(32),opened=await api.post('/v1/private/sessions').send({runId,clientNonce:nonce.toString('hex')});expect(opened.status).toBe(201);
   const session=opened.body,pub=Buffer.from(session.recipientPublicKey,'base64'),challenge=randomBytes(32);
   const hpkeContext=id=>({tenantId,runId,objectId:id,revision:1,purpose:'source',recipientId:recipientIdForPublicKey(pub)});
   const proof=await api.post(`/v1/private/sessions/${session.sessionId}/prove`).send({runId,challengeEnvelope:await sealHpkeSource({recipientPublicKey:pub,context:hpkeContext(randomUUID()),plaintext:challenge})});expect(proof.status).toBe(200);
   expect(proof.body.challengeDigest).toBe(createHash('sha256').update('drnib-proof-v1\0').update(Buffer.from(session.sessionId.replaceAll('-',''),'hex')).update(challenge).digest('hex'));
   const envelope=await sealHpkeSource({recipientPublicKey:pub,context:hpkeContext(requestId),plaintext:Buffer.from(JSON.stringify({action:name,args,requestId,sessionId:session.sessionId,vaultId:vault.vaultId,stateKeyBase64:Buffer.from(stateKey).toString('base64')}))});
   const response=await api.post(`/v1/private/sessions/${session.sessionId}/action`).send({runId,sourceEnvelope:envelope});
   const value=response.body.state==='complete'?JSON.parse(openClientObject(stateKey,context(requestId,'event'),response.body.envelope).toString()):null;
   return {response,value,requestId};
  };
  await body({api,tenantId,runId,manifestId,vault,project,recoverySecret,recoveryEnvelope,stateKey,objects,wire,context,action,generationRequests,attachTools:tools=>app.use('/v1/private',createPrivateExternalToolsRouter({tools,authenticate,allowedTenantId:tenantId})),getCalls:()=>calls,setCaller:v=>{caller=v},setFailStage:v=>{failStage=v},setStageHook:v=>{stageHook=v},setFirstProposal:v=>{firstProposal=v}});
 }finally{
  await new Promise(resolve=>guest.close(resolve));
  await db.privateInferenceCall.deleteMany({where:{runId}});await db.privateActionReceipt.deleteMany({where:{runId}});await db.researchRun.deleteMany({where:{id:runId}});await db.privateVaultRecord.deleteMany({where:{userId:tenantId}});
 }
}
it('encrypted pause during an active call resumes saved work without repeating model dispatch',async()=>{
 await fixture(async f=>{
  await f.action('intake');await f.action('answers',{answers:[{seq:0,answer:{optionIds:['a']}}]});
  const sourceId=randomUUID(),payload={name:'observations.txt',bytes:CANARY.length,contentBase64:Buffer.from(CANARY).toString('base64')};
  expect((await f.api.put(`/v1/private/runs/${f.runId}/objects/${sourceId}`).send({vaultId:f.vault.vaultId,kind:'source',expectedRevision:0,envelope:sealClientObject(f.stateKey,f.context(sourceId,'source'),Buffer.from(JSON.stringify(payload)))})).status).toBe(201);
  await f.action('configure',{depth:'quick',budgetCap:1,lengthWords:300,formats:['md'],liveWeb:false});
  let started,release;const waiting=new Promise(r=>{started=r}),blocked=new Promise(r=>{release=r});let first=true;
  f.setStageHook(async input=>{if(input.stage==='agent'&&first){first=false;started();await blocked;}});
  const requestId=randomUUID(),running=f.action('execute',{},requestId);await Promise.race([waiting,running.then(out=>{throw Error('Research ended before pause boundary: '+JSON.stringify(out.response.body));})]);
  const objectId=randomUUID(),control={format:'drnib-control-v1',targetRequestId:requestId,command:'pause'};
  const body={vaultId:f.vault.vaultId,kind:'intent',expectedRevision:0,envelope:sealClientObject(f.stateKey,f.context(objectId,'intent'),Buffer.from(JSON.stringify(control)))};
  try{expect((await f.api.put(`/v1/private/runs/${f.runId}/objects/${objectId}`).send(body)).status).toBe(201);}finally{release();}
  const paused=await running;expect(paused.value?.status).toBe('paused');expect(paused.value.privateCheckpoint.rootRequestId).toBe(requestId);
  expect(paused.value.activeWork).toMatchObject({format:'drnib-active-work-v1',running:false});expect(paused.value.activeWork.durationMs).toBeGreaterThan(0);
  expect((await f.api.put(`/v1/private/runs/${f.runId}/objects/${objectId}`).send({...body,expectedRevision:1})).status).toBe(400);
  const before=f.generationRequests.filter(r=>r.stage==='agent').length;
  const completed=await f.action('resume');expect(completed.value?.status).toBe('complete');
  expect(f.generationRequests.filter(r=>r.stage==='agent').length-before).toBe(1);
  expect(completed.value.reports).toHaveLength(1);expect(completed.value.privateCheckpoint).toBeUndefined();
  expect(completed.value.activeWork.running).toBe(false);expect(completed.value.activeWork.durationMs).toBeGreaterThan(paused.value.activeWork.durationMs);
  const saved=await db.privateClientObject.findFirst({where:{runId:f.runId,kind:'checkpoint',objectId:requestId}});expect(JSON.stringify(saved.envelope)).not.toContain(CANARY);
  expect(JSON.stringify(saved.envelope)).not.toContain('durationMs');const journal=JSON.parse(openClientObject(f.stateKey,f.context(saved.objectId,'checkpoint',saved.revision),saved.envelope).toString());expect(journal.activeWork.durationMs).toBe(completed.value.activeWork.durationMs);expect(journal.activeWork.running).toBe(false);
 },{withJudge:true});
});
it('JEV-approved private questions park research until an owner answer and restore the saved proposal once',async()=>{
 await fixture(async f=>{
  await f.action('intake');await f.action('answers',{answers:[{seq:0,answer:{optionIds:['a']}}]});
  const sourceId=randomUUID(),payload={name:'observations.txt',bytes:CANARY.length,contentBase64:Buffer.from(CANARY).toString('base64')};
  await f.api.put(`/v1/private/runs/${f.runId}/objects/${sourceId}`).send({vaultId:f.vault.vaultId,kind:'source',expectedRevision:0,envelope:sealClientObject(f.stateKey,f.context(sourceId,'source'),Buffer.from(JSON.stringify(payload)))});
  await f.action('configure',{depth:'quick',budgetCap:1,lengthWords:300,formats:['md'],liveWeb:false});
  f.setFirstProposal({tool:'ask_user',input:{prompt:'Which scope should the report use?',why:'The scope changes the conclusion.',options:[{id:'fictional',label:'The fictional pilot only'}]},why:'Resolve an essential scope decision.'});
  const parked=await f.action('execute');expect(parked.value?.status).toBe('awaiting');
  expect(parked.value.activeWork.running).toBe(false);expect(parked.value.activeWork.durationMs).toBeGreaterThan(0);
  expect((await db.researchRun.findUnique({where:{id:f.runId}})).status).toBe('awaiting');
  const before=f.getCalls();expect((await f.action('answer',{questionId:'stale',optionId:'fictional'})).response.status).toBe(503);expect(f.getCalls()).toBe(before);
  const answer=await f.action('answer',{questionId:parked.value.pendingQuestion.id,optionId:'fictional'});
  expect(answer.value?.status).toBe('complete');expect(answer.value.pendingQuestion).toBeUndefined();
  expect(answer.value.activeWork.running).toBe(false);expect(answer.value.activeWork.durationMs).toBeGreaterThan(parked.value.activeWork.durationMs);
  expect(f.generationRequests.filter(r=>r.stage==='agent')).toHaveLength(2);
  expect(f.generationRequests.some(r=>r.stage==='agent'&&JSON.stringify(r.messages).includes('The fictional pilot only'))).toBe(true);
  const calls=f.getCalls();expect((await f.action('answer',{questionId:parked.value.pendingQuestion.id,optionId:'fictional'},answer.requestId)).value).toEqual(answer.value);expect(f.getCalls()).toBe(calls);
 },{withJudge:true});
});
it('known research failure after an owner answer is terminal and releases the settlement barrier',async()=>{
 await fixture(async f=>{
  await f.action('intake');await f.action('answers',{answers:[{seq:0,answer:{optionIds:['a']}}]});
  const sourceId=randomUUID(),payload={name:'observations.txt',bytes:CANARY.length,contentBase64:Buffer.from(CANARY).toString('base64')};
  await f.api.put(`/v1/private/runs/${f.runId}/objects/${sourceId}`).send({vaultId:f.vault.vaultId,kind:'source',expectedRevision:0,envelope:sealClientObject(f.stateKey,f.context(sourceId,'source'),Buffer.from(JSON.stringify(payload)))});
  await f.action('configure',{depth:'quick',budgetCap:1,lengthWords:300,formats:['md'],liveWeb:false});
  f.setFirstProposal({tool:'ask_user',input:{prompt:'Which scope should the report use?',why:'The scope changes the conclusion.',options:[{id:'fictional',label:'The fictional pilot only'}]},why:'Resolve an essential scope decision.'});
  const parked=await f.action('execute');expect(parked.value?.status).toBe('awaiting');
  expect(parked.value.activeWork.running).toBe(false);expect(parked.value.activeWork.durationMs).toBeGreaterThan(0);
  f.setFailStage('write');
  const answer=await f.action('answer',{questionId:parked.value.pendingQuestion.id,optionId:'fictional'});expect(answer.response.status).toBe(503);
  expect((await db.researchRun.findUnique({where:{id:f.runId}})).status).toBe('failed');
  expect((await db.privateActionReceipt.findFirst({where:{runId:f.runId,requestId:answer.requestId}})).status).toBe('failed');
 },{withJudge:true});
});
it('owner-approved paid tools use encrypted delivery, authoritative costs and one escrow debit/refund',async()=>{
 await fixture(async f=>{
  await f.action('intake');await f.action('answers',{answers:[{seq:0,answer:{optionIds:['a']}}]});
  const sourceId=randomUUID(),payload={name:'observations.txt',bytes:CANARY.length,contentBase64:Buffer.from(CANARY).toString('base64')};
  await f.api.put(`/v1/private/runs/${f.runId}/objects/${sourceId}`).send({vaultId:f.vault.vaultId,kind:'source',expectedRevision:0,envelope:sealClientObject(f.stateKey,f.context(sourceId,'source'),Buffer.from(JSON.stringify(payload)))});
  await f.action('configure',{depth:'quick',budgetCap:0.25,lengthWords:300,formats:['md'],liveWeb:true,publicResearch:{approved:true,brief:'Public synthetic research'}});
  const saved=await db.researchRun.findUnique({where:{id:f.runId}}),wallet='0x'+'1'.repeat(40),settings={core:'0x'+'2'.repeat(40),splitter:'0x'+'3'.repeat(40),evaluator:'0x'+'4'.repeat(40),token:'0x'+'5'.repeat(40),operator:'0x'+'6'.repeat(40)};
  await db.researchRun.update({where:{id:f.runId},data:{walletAddress:wallet,metadata:{...saved.metadata,privateEscrow:{jobId:'91'}}}});
  await db.budgetLedger.create({data:{runId:f.runId,kind:'deposit',amount:0.25,txRef:'synthetic-funded'}});
  f.setFirstProposal({tool:'pay_x402',input:{url:'https://public.example.com/api/nibgate/access?path=%2Fevidence',maxMicroUsd:100},why:'Read an approved public dataset.'});
  const parked=await f.action('execute');expect(parked.value?.status).toBe('awaiting');
  expect(parked.value.activeWork.running).toBe(false);expect(parked.value.activeWork.durationMs).toBeGreaterThan(0);
  const q=parked.value.pendingQuestion,recipient=await generateHpkeRecipient();let dispatches=0;
  const paidSource={url:'https://public.example.com/evidence',title:'Original creator evidence',text:'Public synthetic dataset for an explicitly approved example.',creatorAssessment:{source:'extension-page-model',eligible:true,kind:'content',author:'Synthetic creator'}};
  const output={sources:[paidSource]};
  const tools=createPrivateExternalTools({db,execute:async request=>{expect(request).toEqual(q.externalRequest);dispatches++;return {output,costMicroUsd:7,costBasis:'seller-receipt',txHash:'0x'+'7'.repeat(64)}}});f.attachTools(tools);
  const manifest=await db.privateClientObject.findFirst({where:{runId:f.runId,kind:'manifest'}});
  const input={id:randomUUID(),manifestRevision:manifest.revision,questionId:q.id,request:q.externalRequest,recipientPublicKey:Buffer.from(recipient.publicKey).toString('base64')};
  f.setCaller('outsider');expect((await f.api.post(`/v1/private/runs/${f.runId}/tools`).send(input)).status).toBe(404);f.setCaller(f.tenantId);
  const registered=await f.api.post(`/v1/private/runs/${f.runId}/tools`).send(input);expect(registered.status).toBe(200);
  const id=registered.body.id,path=`/v1/private/runs/${f.runId}/tools/${id}/execute`;
  const [a,b]=await Promise.all([f.api.post(path).send({}),f.api.post(path).send({})]);expect(dispatches).toBe(1);
  const delivered=a.body.status==='complete'?a.body:b.body.status==='complete'?b.body:await tools.get(f.runId,{id:f.tenantId},id);
  expect(delivered.status).toBe('complete');expect(JSON.stringify(delivered)).not.toContain(paidSource.text);
  const bytes=await openHpkeToolResult({recipientPrivateKey:recipient.privateKey,envelope:delivered.envelope,expectedContext:{tenantId:f.tenantId,runId:f.runId,objectId:id,revision:1,purpose:'tool-result',recipientId:recipient.recipientId}});
  const decoded=JSON.parse(new TextDecoder().decode(bytes));expect(decoded).toEqual(output);bytes.fill(0);
  const args={questionId:q.id,optionId:'approve',toolCallId:id,toolResult:decoded};
  expect((await f.action('answer',{...args,toolResult:{...decoded,text:'tampered'}})).response.status).toBe(503);
  const finished=await f.action('answer',args);expect(finished.value?.status).toBe('complete');expect(dispatches).toBe(1);
  const state=await createPrivateActionStore({db,storage:{},stateKey:f.stateKey,tenantId:f.tenantId,runId:f.runId,vaultId:f.vault.vaultId}).load();
  expect(state.value.sources.find(s=>s.url===paidSource.url)?.creatorAssessment).toEqual(paidSource.creatorAssessment);
  expect(state.value.sources.some(s=>s.url===q.externalRequest.url)).toBe(false);
  expect((await f.api.post(path).send({})).body.status).toBe('complete');expect(dispatches).toBe(1);
  const {createPrivateFunding}=await import('../src/privacy/private-funding.js');
  const funding=createPrivateFunding({db,settings,prepare:async()=>{},readJob:async()=>({client:wallet,provider:settings.splitter,evaluator:settings.evaluator,token:settings.token,budget:0.25,status:'Completed'}),completeAndSplit:async()=>({splitConfirmed:true,splitTx:'0x'+'8'.repeat(64)})});
  expect(await funding.settle(f.runId,{id:f.tenantId})).toEqual({pending:false,spent:0.000007,refunded:0.249993});
  const receipt=(await funding.status(f.runId,{id:f.tenantId})).expenseReceipt;expect(receipt.lines.some(l=>l.category==='tool'&&l.chargedUsd==='0.000007')).toBe(true);expect(receipt.totals.balanceUsd).toBe('0.000000');
  expect(JSON.stringify(await db.privateToolCall.findMany({where:{runId:f.runId}}),(_,v)=>typeof v==='bigint'?String(v):v)).not.toContain(CANARY);
 },{withJudge:true,publicRetrieval:async()=>[]});
});
it('unknown paid-tool outcomes never replay, block research and become platform liability on owner end',async()=>{
 await fixture(async f=>{
  const saved=await db.researchRun.findUnique({where:{id:f.runId}}),wallet='0x'+'1'.repeat(40),settings={core:'0x'+'2'.repeat(40),splitter:'0x'+'3'.repeat(40),evaluator:'0x'+'4'.repeat(40),token:'0x'+'5'.repeat(40),operator:'0x'+'6'.repeat(40)};
  await db.researchRun.update({where:{id:f.runId},data:{status:'awaiting',budgetCap:0.25,walletAddress:wallet,metadata:{...saved.metadata,privateEscrow:{jobId:'92'}}}});
  await db.budgetLedger.create({data:{runId:f.runId,kind:'deposit',amount:0.25}});
  const recipient=await generateHpkeRecipient(),manifest=await db.privateClientObject.findFirst({where:{runId:f.runId,kind:'manifest'}});let dispatches=0;
  const tools=createPrivateExternalTools({db,execute:async()=>{dispatches++;throw Error('synthetic unknown after dispatch')}});
  const call=await tools.register(f.runId,{id:f.tenantId},{id:randomUUID(),manifestRevision:manifest.revision,questionId:'a'.repeat(64),request:{tool:'pay_x402',url:'https://public.example.com/data',maxMicroUsd:100},recipientPublicKey:Buffer.from(recipient.publicKey).toString('base64')});
  await expect(tools.run(f.runId,{id:f.tenantId},call.id)).rejects.toThrow('PRIVATE_EXTERNAL_TOOL_UNAVAILABLE');
  expect((await tools.run(f.runId,{id:f.tenantId},call.id)).status).toBe('reserved');expect(dispatches).toBe(1);
  const {admitPrivateRunSpend}=await import('../src/privacy/private-run-budget.js');
  await expect(db.$transaction(tx=>admitPrivateRunSpend(tx,f.runId,249901n,250000,true,'customer'))).rejects.toThrow('PRIVATE_RUN_BUDGET_EXHAUSTED');
  const {createPrivateFunding}=await import('../src/privacy/private-funding.js');
  const funding=createPrivateFunding({db,settings,prepare:async()=>{},readJob:async()=>({client:wallet,provider:settings.splitter,evaluator:settings.evaluator,token:settings.token,budget:0.25,status:'Completed'}),completeAndSplit:async()=>({splitConfirmed:true,splitTx:'0x'+'8'.repeat(64)})});
  expect(await funding.cancel(f.runId,{id:f.tenantId})).toMatchObject({pending:false,spent:0,refunded:0.25});
  const closed=await db.researchRun.findUnique({where:{id:f.runId}});expect(closed.metadata.privateEscrow.settlement).toMatchObject({waivedCalls:1,unconfirmedHeldMicroUsd:'100'});
  expect((await db.privateToolCall.findUnique({where:{id:call.id}})).committedMicroUsd).toBe(100n);
  expect((await tools.run(f.runId,{id:f.tenantId},call.id)).status).toBe('reserved');expect(dispatches).toBe(1);
 });
});
it('aggregate included-fee rounding matches the splitter across tiny individual tool charges',async()=>{
 await fixture(async f=>{
  const saved=await db.researchRun.findUnique({where:{id:f.runId}}),wallet='0x'+'1'.repeat(40),settings={core:'0x'+'2'.repeat(40),splitter:'0x'+'3'.repeat(40),evaluator:'0x'+'4'.repeat(40),token:'0x'+'5'.repeat(40),operator:'0x'+'6'.repeat(40)};
  await db.researchRun.update({where:{id:f.runId},data:{status:'complete',walletAddress:wallet,metadata:{...saved.metadata,privateEscrow:{jobId:'93',core:settings.core,splitter:settings.splitter}}}});
  await db.budgetLedger.create({data:{runId:f.runId,kind:'deposit',amount:0.25}});
  for(const questionId of ['a','b'])await db.privateToolCall.create({data:{id:randomUUID(),runId:f.runId,questionId:questionId.repeat(64),tool:'pay_x402',manifestRevision:1,request:{},requestDigest:'a'.repeat(64),recipientPublicKey:'synthetic',recipientId:'synthetic',status:'complete',reservedMicroUsd:60n,committedMicroUsd:60n,costBasis:'seller-receipt',resultDigest:'a'.repeat(64),txHash:'0x'+'7'.repeat(64)}});
  const {createPrivateFunding}=await import('../src/privacy/private-funding.js');
  const funding=createPrivateFunding({db,settings,prepare:async()=>{},readJob:async()=>({client:wallet,provider:settings.splitter,evaluator:settings.evaluator,token:settings.token,budget:0.25,status:'Completed'}),completeAndSplit:async()=>({splitConfirmed:true,splitTx:'0x'+'8'.repeat(64)})});
  expect(await funding.settle(f.runId,{id:f.tenantId})).toMatchObject({spent:0.00012,refunded:0.24988});
  const fees=await db.budgetLedger.findMany({where:{runId:f.runId,kind:'fee'}});expect(fees).toHaveLength(1);expect(Number(fees[0].amount)).toBe(0.000001);
  const offline=createPrivateFunding({db,settings,prepare:async()=>{},readJob:async()=>expect.fail('confirmed receipt must not require a new RPC read'),completeAndSplit:async()=>expect.fail('must not settle again')});const archived=await offline.status(f.runId,{id:f.tenantId});expect(archived.job.receiptSource).toBe('confirmed-settlement');expect(archived.ledger).toMatchObject({spend:0.00012,refunded:0.24988});
 });
});
it('expired worker leases recover only complete journals and fence the old worker',async()=>{
 await fixture(async f=>{
  let now=Date.now();const make=()=>createPrivateActionStore({db,storage:{},stateKey:f.stateKey,tenantId:f.tenantId,runId:f.runId,vaultId:f.vault.vaultId,now:()=>now});
  const first=make(),before=await first.load(),requestId=randomUUID();
  const journal={format:'drnib-checkpoint-v1',rootRequestId:requestId,current:{requestId,manifestRevision:before.row.revision,manifestDigest:before.row.digest},entries:[],consumed:[]};
  const input={requestId,digest:'fixture-crash',manifestId:before.row.id,manifestRevision:before.row.revision,checkpoint:journal};
  const claim=await first.claim(input),second=make();
  now+=50000;await first.heartbeat();
  expect((await db.privateActionReceipt.findUnique({where:{id:claim.id}})).leaseUntil.getTime()).toBe(now+90000);
  expect((await second.claim({...input,recover:true,checkpointRoot:requestId})).existing).toBe(true);
  now+=90001;
  const recovered=await second.claim({...input,recover:true,checkpointRoot:requestId});expect(recovered.recovered).toBe(true);
  await expect(first.fence()).rejects.toThrow('PRIVATE_CHECKPOINT_FENCED');
  await expect(first.saveCheckpoint(requestId,journal)).rejects.toThrow('PRIVATE_CHECKPOINT_FENCED');
  await expect(first.heartbeat()).rejects.toThrow('PRIVATE_CHECKPOINT_FENCED');
  const inFlight={...journal,entries:[{kind:'infer',digest:'fixture',state:'started'}]};await second.saveCheckpoint(requestId,inFlight);now+=90001;
  const third=make(),blocked=await third.claim({...input,recover:true,checkpointRoot:requestId});expect(blocked.status).toBe('uncertain');expect(blocked.recovered).toBeUndefined();
  expect((await db.privateActionReceipt.findUnique({where:{id:claim.id}})).leaseOwner).toBe(recovered.leaseOwner);
 });
});
it('a fresh verified guest session recovers an expired pre-dispatch action and replays only its final receipt',async()=>{
 await fixture(async f=>{
  await f.action('intake');await f.action('answers',{answers:[{seq:0,answer:{optionIds:['a']}}]});
  const sourceId=randomUUID(),payload={name:'observations.txt',bytes:CANARY.length,contentBase64:Buffer.from(CANARY).toString('base64')};
  await f.api.put(`/v1/private/runs/${f.runId}/objects/${sourceId}`).send({vaultId:f.vault.vaultId,kind:'source',expectedRevision:0,envelope:sealClientObject(f.stateKey,f.context(sourceId,'source'),Buffer.from(JSON.stringify(payload)))});
  await f.action('configure',{depth:'quick',budgetCap:1,lengthWords:300,formats:['md'],liveWeb:false});
  const original=createPrivateActionStore({db,storage:{},stateKey:f.stateKey,tenantId:f.tenantId,runId:f.runId,vaultId:f.vault.vaultId}),before=await original.load(),requestId=randomUUID();
  const descriptor={requestId,action:'execute',args:{},manifestRevision:before.row.revision,manifestDigest:before.row.digest};
  const checkpoint={format:'drnib-checkpoint-v1',rootRequestId:requestId,initialAction:'execute',initialArgs:{},initialState:before.value,current:descriptor,entries:[],consumed:[]};
  const digest=createHmac('sha256',f.stateKey).update(canonicalCiphertext({action:'execute',args:{},vaultId:f.vault.vaultId})).digest('hex');
  const claim=await original.claim({requestId,digest,manifestId:before.row.id,manifestRevision:before.row.revision,checkpoint});
  // Simulated process death before the first operation. No network inference
  // or uncertain reservation exists; only the durable expired lease remains.
  await db.privateActionReceipt.update({where:{id:claim.id},data:{leaseUntil:new Date(Date.now()-1000)}});
  expect((await f.api.get(`/v1/private/runs/${f.runId}/actions`)).body.recoveryAvailable).toBe(true);
  const out=await f.action('recover',{},requestId);expect(out.value?.status).toBe('complete');
  const calls=f.getCalls();expect((await f.action('recover',{},requestId)).value).toEqual(out.value);expect(f.getCalls()).toBe(calls);
  await expect(original.fence()).rejects.toThrow();
 },{withJudge:true});
});
it('local encrypted upload → protected intake/plan/report → discussion → seven exports → recovery, with no plaintext in API storage',async()=>{
 await fixture(async f=>{
  let out=await f.action('intake');expect(out.response.status).toBe(200);expect(out.value.questions).toHaveLength(1);
  out=await f.action('answers',{answers:[{seq:0,answer:{optionIds:['a']}}]});expect(out.value.status).toBe('intake-done');
  const sourceId=randomUUID(),payload={name:CANARY+'.txt',bytes:Buffer.byteLength(CANARY),contentBase64:Buffer.from(CANARY).toString('base64')};
  const upload=await f.api.put(`/v1/private/runs/${f.runId}/objects/${sourceId}`).send({vaultId:f.vault.vaultId,kind:'source',expectedRevision:0,envelope:sealClientObject(f.stateKey,f.context(sourceId,'source'),Buffer.from(JSON.stringify(payload)))});expect(upload.status).toBe(201);
  out=await f.action('configure',{depth:'quick',budgetCap:1,lengthWords:300,formats:['md'],liveWeb:false});expect(out.value.status).toBe('planned');
  out=await f.action('execute');expect(out.response.status).toBe(200);expect(out.value.status).toBe('complete');expect(out.value.reports[0].markdown).toContain(CANARY);
  const before=f.getCalls();const receipt=await f.action('execute',{},out.requestId);expect(receipt.value).toEqual(out.value);expect(f.getCalls()).toBe(before);
  out=await f.action('discuss',{question:CANARY+' question'});expect(out.value.answer).toContain(CANARY);
  const persisted=await db.researchRun.findUnique({where:{id:f.runId}}),splitTx='0x'+'a'.repeat(64);
  await db.researchRun.update({where:{id:f.runId},data:{metadata:{...persisted.metadata,privateEscrow:{jobId:'777',status:'Completed',splitConfirmed:true,splitTx}}}});
  for(const [kind,amount] of [['deposit',0.2],['spend',0.03],['fee',0.0003],['refund',0.17]])await db.budgetLedger.create({data:{runId:f.runId,kind,amount}});
  for(const format of ['md','json','bibtex','pdf','word','excel','powerpoint']){out=await f.action('export',{format});expect(out.response.status,format).toBe(200);expect(out.value.content.length,format).toBeGreaterThan(20)}
  out=await f.action('export',{format:'json'});const packet=JSON.parse(out.value.content);
  expect(packet.ledger).toMatchObject({deposited:0.2,spend:0.03,fee:0.0003,refunded:0.17,balance:0});expect(packet.escrow).toMatchObject({jobId:'777',splitTx,splitConfirmed:true});
  await db.researchRun.update({where:{id:f.runId},data:{metadata:{...persisted.metadata,privateCancellation:{at:new Date().toISOString()},privateEscrow:{jobId:'777',status:'Completed',splitConfirmed:true,splitTx}}}});
  await db.privateActionReceipt.create({data:{id:randomUUID(),runId:f.runId,requestId:randomUUID(),digest:'synthetic-cancelled-work',status:'uncertain'}});
  const callsBeforeExport=f.getCalls();out=await f.action('export',{format:'md'});expect(out.response.status).toBe(200);expect(out.value.content).toContain('Deposited: $0.20');expect(out.value.content).toContain('Refunded: $0.170000');expect(f.getCalls()).toBe(callsBeforeExport);
  expect((await f.api.get(`/v1/private/runs/${f.runId}/actions/${out.requestId}`)).body.state).toBe('complete');
  expect((await f.api.get('/v1/private/projects')).body.runs.find(r=>r.id===f.runId)).toMatchObject({status:'ended',cancelled:true});
  const rows=await Promise.all([db.researchRun.findUnique({where:{id:f.runId}}),db.privateClientObject.findMany({where:{runId:f.runId}}),db.privateActionReceipt.findMany({where:{runId:f.runId}})]);
  expect(JSON.stringify(rows)).not.toContain(CANARY);expect(JSON.stringify([...f.objects.values()].map(b=>b.toString()))).not.toContain(CANARY);expect(f.wire.join('')).not.toContain(CANARY);expect(f.wire.join('')).not.toContain(Buffer.from(f.stateKey).toString('base64'));
  const remote=(await f.api.get('/v1/private/vault')).body,other=await recoverPrivateVault(f.recoverySecret,remote.recoveryEnvelope,{tenantId:f.tenantId,vaultId:f.vault.vaultId});
  const keyRow=(await f.api.get(`/v1/private/runs/${f.runId}/objects/${f.runId}`)).body,restored=await openPrivateProjectKeys(other,f.runId,keyRow.envelope);
  const saved=(await f.api.get(`/v1/private/runs/${f.runId}/objects/${f.manifestId}`)).body;
  const state=JSON.parse(openClientObject(restored.workerStateKey,f.context(f.manifestId,'manifest',saved.revision),saved.envelope).toString());expect(state.reports).toHaveLength(1);expect(state.metadata.discuss).toHaveLength(2);
  f.setCaller('outsider');expect((await f.api.get(`/v1/private/runs/${f.runId}/objects`)).status).toBe(404);expect((await f.api.get('/v1/private/vault')).status).toBe(404);
 });
});
it('concurrent manifest updates use CAS, enrollment cannot overwrite, and source edits lock behind unresolved actions',async()=>{
 await fixture(async f=>{
  const duplicate=await f.api.put('/v1/private/vault').send({vaultId:f.vault.vaultId,expectedRevision:0,recoveryEnvelope:f.recoveryEnvelope,passkey:null});expect(duplicate.status).toBe(409);
  const stored=(await f.api.get(`/v1/private/runs/${f.runId}/objects/${f.manifestId}`)).body;
  const content={vaultId:f.vault.vaultId,kind:'manifest',expectedRevision:stored.revision,envelope:sealClientObject(f.stateKey,f.context(f.manifestId,'manifest',stored.revision+1),Buffer.from(JSON.stringify({status:'intake',brief:{topic:CANARY}})))};
  const responses=await Promise.all([f.api.put(`/v1/private/runs/${f.runId}/objects/${f.manifestId}`).send(content),f.api.put(`/v1/private/runs/${f.runId}/objects/${f.manifestId}`).send(content)]);expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
  await db.privateActionReceipt.create({data:{runId:f.runId,requestId:randomUUID(),digest:'synthetic',status:'uncertain'}});
  expect((await f.api.put(`/v1/private/runs/${f.runId}/objects/${f.manifestId}`).send({...content,expectedRevision:2,envelope:sealClientObject(f.stateKey,f.context(f.manifestId,'manifest',3),Buffer.from('{}'))})).status).toBe(409);
  expect((await f.api.delete(`/v1/private/projects/${f.runId}`)).status).toBe(409);
 });
});
it('provider failure yields a fixed error and durable uncertain state, with no repeat inference',async()=>{
 await fixture(async f=>{
  const out=await f.action('intake');expect(out.response.status).toBe(503);expect(JSON.stringify(out.response.body)).not.toContain(CANARY);
  const status=await f.api.get(`/v1/private/runs/${f.runId}/actions/${out.requestId}`);expect(status.body.state).toBe('uncertain');
  expect(JSON.stringify(status.body)).not.toContain(CANARY);
  expect(openClientObject(f.stateKey,f.context(out.requestId,'event',1),status.body.envelope).toString()).toBe(JSON.stringify({error:'PRIVATE_ACTION_UNAVAILABLE'}));
  const retry=await f.action('intake',{},out.requestId);expect(retry.response.status).toBe(202);expect(f.getCalls()).toBe(1);
 },{modelFailure:true});
});
it('proven pre-dispatch failure records zero spend while post-dispatch loss stays reserved',async()=>{
 await fixture(async f=>{
  const run=await db.researchRun.findUnique({where:{id:f.runId}});
  const settings={db,model:'fixture/model',monthlyCapMicroUsd:1000000,inputPricePerMillion:100000,outputPricePerMillion:100000,maxOutputTokens:4096};
  const preflight=createPhalaAiPort({approvedModels:['fixture/model'],maxOutputTokens:4096,connectVerified:async()=>{throw Error('synthetic unavailable attestation')}});
  const first=randomUUID();await expect(createPrivateWorkflowAi({...settings,aiPort:preflight})({run,actionId:first,messages:[{role:'user',content:'synthetic'}]})).rejects.toThrow('Private AI unavailable');
  const zero=await db.privateInferenceCall.findFirst({where:{runId:f.runId,actionId:first}});expect(zero.status).toBe('not-dispatched');expect(zero.committedMicroUsd).toBe(0n);expect(zero.reservedMicroUsd).toBeGreaterThan(0n);
  const postflight=createPhalaAiPort({approvedModels:['fixture/model'],maxOutputTokens:4096,connectVerified:async()=>({verified:true,productionOs:true,expectedComposeHash:true,sessionFor:async()=> 'a'.repeat(64),requestSerialized:async()=>{throw Error('synthetic lost response')},verifyReceipt:async()=>expect.fail('no response')})});
  const second=randomUUID();await expect(createPrivateWorkflowAi({...settings,aiPort:postflight})({run,actionId:second,messages:[{role:'user',content:'synthetic'}]})).rejects.toThrow('Private AI unavailable');
  const unknown=await db.privateInferenceCall.findFirst({where:{runId:f.runId,actionId:second}});expect(unknown.status).toBe('reserved');expect(unknown.committedMicroUsd).toBeGreaterThan(0n);
 });
});
it('actual provider pricing replaces the ceiling, while unpriced responses retain a hold',async()=>{
 await fixture(async f=>{
  const run=await db.researchRun.findUnique({where:{id:f.runId}});let cost=1;
  const aiPort={privateVerifiedTransport:'phala-aci-v1',infer:async()=>{const result=json({ok:true});Object.defineProperty(result,PRIVATE_USAGE,{value:{model:'fixture/model',inputTokens:100,outputTokens:10,costMicroUsd:cost,requestDigest:'a'.repeat(64),responseDigest:'b'.repeat(64)}});return result}};
  const infer=createPrivateWorkflowAi({db,aiPort,model:'fixture/model',monthlyCapMicroUsd:1000000,inputPricePerMillion:100000,outputPricePerMillion:100000});
  const actionId=randomUUID();await infer({run,actionId,messages:[{role:'user',content:'synthetic'}]});
  const row=await db.privateInferenceCall.findFirst({where:{runId:f.runId,actionId}});expect(row.committedMicroUsd).toBe(1n);expect(row.costBasis).toBe('receipt-reported');expect(row.usageEvidence.inputTokens).toBe(100);expect(row.usageEvidence.outputTokens).toBe(10);expect(row.usageEvidence.costMicroUsd).toBe(1);expect(row.reservedMicroUsd).toBeGreaterThan(11n);
  cost=null;const unknown=randomUUID();await expect(infer({run,actionId:unknown,messages:[{role:'user',content:'synthetic'}]})).rejects.toThrow('PRIVATE_WORKFLOW_USAGE_UNPRICED');
  const held=await db.privateInferenceCall.findFirst({where:{runId:f.runId,actionId:unknown}});expect(held.status).toBe('reserved');expect(held.committedMicroUsd).toBe(held.reservedMicroUsd);expect(held.usageEvidence).toBeNull();
 });
});
it('durable AI reservations cap concurrent admission and retain unknown spend',async()=>{
 await fixture(async f=>{
  const run=await db.researchRun.findUnique({where:{id:f.runId}});let dispatched=0;
  const aiPort={privateVerifiedTransport:'phala-aci-v1',infer:async()=>{dispatched++;throw Error('synthetic transport loss')}};
  const infer=createPrivateWorkflowAi({db,aiPort,model:'fixture/model',monthlyCapMicroUsd:12000,inputPricePerMillion:100000,outputPricePerMillion:100000,maxOutputTokens:4096});
  const actionId=randomUUID();await Promise.allSettled([infer({run,actionId,messages:[{role:'user',content:'synthetic'}]}),infer({run,actionId,messages:[{role:'user',content:'synthetic'}]})]);
  expect(dispatched).toBe(1);const rows=await db.privateInferenceCall.findMany({where:{runId:f.runId}});expect(rows).toHaveLength(1);expect(rows[0].status).toBe('reserved');expect(rows[0].committedMicroUsd).toBeGreaterThan(0n);
 });
});

it('migration enforces positive revisions and exactly one ciphertext location',async()=>{
 await fixture(async f=>{
  for(const data of [{revision:0,envelope:{}},{revision:1},{revision:1,envelope:{},objectKey:'synthetic'}]){
   await expect(db.privateClientObject.create({data:{runId:f.runId,vaultId:f.vault.vaultId,objectId:randomUUID(),kind:'source',digest:'synthetic',...data}})).rejects.toThrow();
  }
 });
});

it('actual guest orchestration carries native intake/tool judgments, calculations and the run cap to protected generation',async()=>{
 await fixture(async f=>{
  let out=await f.action('intake');expect(out.response.status).toBe(200);expect(out.value.decisions.some(d=>d.step==='intake-gate')).toBe(true);
  await f.action('answers',{answers:[{seq:0,answer:{optionIds:['a']}}]});
  const id=randomUUID(),payload={name:'synthetic.txt',bytes:Buffer.byteLength(CANARY),contentBase64:Buffer.from(CANARY).toString('base64')};
  expect((await f.api.put(`/v1/private/runs/${f.runId}/objects/${id}`).send({vaultId:f.vault.vaultId,kind:'source',expectedRevision:0,envelope:sealClientObject(f.stateKey,f.context(id,'source'),Buffer.from(JSON.stringify(payload)))})).status).toBe(201);
  out=await f.action('configure',{depth:'quick',budgetCap:0.25,lengthWords:300,formats:['md']});expect(out.response.status).toBe(200);
  out=await f.action('execute');expect(out.response.status).toBe(200);expect(out.value.status).toBe('complete');
  expect(out.value.events.find(e=>e.type==='tool.call'&&e.tool==='compute').result.result).toBe(28);
  expect(out.value.events.some(e=>e.origin==='model-summary')).toBe(true);
  expect(out.value.events.some(e=>e.origin==='tool')).toBe(true);
  expect(out.value.events.some(e=>e.origin==='verification')).toBe(true);
  expect(out.value.decisions.find(d=>d.step==='agent-tool').context.proposal.tool).toBe('compute');
  const writing=f.generationRequests.filter(r=>r.stage==='write');expect(writing.some(r=>JSON.stringify(r.messages).includes('Worker calculations'))).toBe(true);
  expect(writing.every(r=>r.messages.some(m=>m.role==='system'&&m.content.includes('operational updates belong in activity chat')))).toBe(true);
  expect(out.value.events.some(e=>e.origin==='model-summary'&&e.phase==='review'&&e.text.includes('descriptive comparisons'))).toBe(true);
  for(const call of f.generationRequests.filter(r=>['plan','agent','write','verify'].includes(r.stage)))expect(call.budgetMicroUsd).toBe(250000);
  expect(f.generationRequests.some(r=>r.stage==='judge'&&r.budgetMicroUsd===250000)).toBe(true);
 },{withJudge:true});
});
it('known research failure commits encrypted finality and permits an idempotent unused-deposit refund',async()=>{
 await fixture(async f=>{
  await f.action('intake');await f.action('answers',{answers:[{seq:0,answer:{optionIds:['a']}}]});
  const id=randomUUID(),payload={name:'synthetic.txt',bytes:Buffer.byteLength(CANARY),contentBase64:Buffer.from(CANARY).toString('base64')};
  await f.api.put(`/v1/private/runs/${f.runId}/objects/${id}`).send({vaultId:f.vault.vaultId,kind:'source',expectedRevision:0,envelope:sealClientObject(f.stateKey,f.context(id,'source'),Buffer.from(JSON.stringify(payload)))});
  await f.action('configure',{depth:'quick',budgetCap:0.25,lengthWords:300,formats:['md']});
  f.setFailStage('verify');const out=await f.action('execute');expect(out.response.status).toBe(503);
  const store=createPrivateActionStore({db,storage:{},stateKey:f.stateKey,tenantId:f.tenantId,runId:f.runId,vaultId:f.vault.vaultId});
  const saved=await store.load();expect(saved.run.status).toBe('failed');expect(saved.value.status).toBe('failed');expect(saved.value.reports).toEqual([]);
  expect(saved.value.events.some(e=>e.type==='failed'&&e.code==='PRIVATE_PLAN_INVALID')).toBe(true);
  expect(JSON.stringify(await db.researchRun.findUnique({where:{id:f.runId}}))).not.toContain(CANARY);
  const count=f.getCalls();expect((await f.action('execute',{},out.requestId)).response.body.state).toBe('failed');expect(f.getCalls()).toBe(count);
  const {createPrivateFunding}=await import('../src/privacy/private-funding.js');
  const wallet='0x'+'1'.repeat(40),settings={core:'0x'+'2'.repeat(40),splitter:'0x'+'3'.repeat(40),evaluator:'0x'+'4'.repeat(40),token:'0x'+'5'.repeat(40),operator:'0x'+'6'.repeat(40)};
  await db.researchRun.update({where:{id:f.runId},data:{walletAddress:wallet,metadata:{...saved.run.metadata,privateEscrow:{jobId:'9'}}}});
  await db.budgetLedger.create({data:{runId:f.runId,kind:'deposit',amount:0.25}});
  let splits=0;const funding=createPrivateFunding({db,settings,prepare:async()=>{},readJob:async()=>({client:wallet,provider:settings.splitter,evaluator:settings.evaluator,token:settings.token,budget:0.25,status:'Funded'}),completeAndSplit:async()=>{splits++;return {splitConfirmed:true}}});
  expect(await funding.settle(f.runId,{id:f.tenantId})).toEqual({pending:false,spent:0,refunded:0.25});
  expect((await funding.settle(f.runId,{id:f.tenantId})).alreadySettled).toBe(true);expect(splits).toBe(1);
  expect(await db.budgetLedger.count({where:{runId:f.runId,kind:'refund'}})).toBe(1);
 },{withJudge:true});
});
it('a failed revision retains earlier reports and commits failure only once',async()=>{
 await fixture(async f=>{
  const store=createPrivateActionStore({db,storage:{},stateKey:f.stateKey,tenantId:f.tenantId,runId:f.runId,vaultId:f.vault.vaultId}),initial=await store.load();
  const oldReport={version:1,markdown:CANARY,citations:[]};
  await store.commit(initial,{...initial.value,status:'complete',reports:[oldReport]},{status:'complete'});
  const before=await store.load(),requestId=randomUUID(),claim=await store.claim({requestId,digest:'synthetic-revision',manifestId:before.row.id,manifestRevision:before.row.revision});
  await store.progress(claim.id,{events:[{type:'thinking',text:'Partial new work '+CANARY}],decisions:[]});
  await store.uncertain(claim.id,{error:'PRIVATE_UNSUPPORTED_REPORT'},{terminalResearchFailure:true});
  const failed=await store.load();expect(failed.value.reports).toEqual([oldReport]);expect(failed.value.events.some(e=>e.text?.includes('Partial new work'))).toBe(true);
  await store.uncertain(claim.id,{error:'PRIVATE_UNSUPPORTED_REPORT'},{terminalResearchFailure:true});
  expect((await store.load()).row.revision).toBe(failed.row.revision);
 });
});
it('terminal failure recovery cannot finalize or refund an unresolved model attempt',async()=>{
 await fixture(async f=>{
  const store=createPrivateActionStore({db,storage:{},stateKey:f.stateKey,tenantId:f.tenantId,runId:f.runId,vaultId:f.vault.vaultId}),before=await store.load(),requestId=randomUUID();
  const claim=await store.claim({requestId,digest:'synthetic-uncertain',manifestId:before.row.id,manifestRevision:before.row.revision});
  await db.privateInferenceCall.create({data:{id:randomUUID(),runId:f.runId,actionId:requestId,model:'fixture',status:'reserved',monthKey:new Date().toISOString().slice(0,7),reservedMicroUsd:10n,committedMicroUsd:10n}});
  await store.uncertain(claim.id,{error:'PRIVATE_PLAN_INVALID'},{terminalResearchFailure:true});
  expect((await store.load()).run.status).toBe('draft');
  expect((await db.privateActionReceipt.findUnique({where:{id:claim.id}})).status).toBe('uncertain');
  expect(await db.budgetLedger.count({where:{runId:f.runId,kind:'refund'}})).toBe(0);
  expect(await db.privateInferenceCall.count({where:{runId:f.runId,status:'reserved'}})).toBe(1);
 });
});
it('a persisted 429 cooldown survives a fresh worker wrapper without releasing the original hold',async()=>{
 await fixture(async f=>{
  const run=await db.researchRun.findUnique({where:{id:f.runId}}),holdId=randomUUID(),actionId=randomUUID();
  await db.privateInferenceCall.create({data:{id:holdId,runId:f.runId,actionId:'previous-plan',model:'fixture/model',status:'reserved',monthKey:new Date().toISOString().slice(0,7),reservedMicroUsd:27593n,committedMicroUsd:27593n,usageEvidence:{format:'drnib-aci-failure-evidence-v1',failure:{httpStatus:429,retryNotBefore:new Date(Date.now()+120000).toISOString()}}}});
  const infer=createPrivateWorkflowAi({db,aiPort:{privateVerifiedTransport:'phala-aci-v1',infer:()=>expect.fail('No cooldown dispatch')},model:'fixture/model',monthlyCapMicroUsd:770000,inputPricePerMillion:200,outputPricePerMillion:1000});
  try{await infer({run,actionId,messages:[{role:'user',content:CANARY}]});expect.fail('Must pause');}catch(error){expect(error.message).toBe('PRIVATE_WORKFLOW_RATE_LIMITED');expect(error[PRIVATE_NOT_DISPATCHED]).toBe(true);}
  const hold=await db.privateInferenceCall.findUnique({where:{id:holdId}});expect(hold.status).toBe('reserved');expect(hold.committedMicroUsd).toBe(27593n);
  expect(await db.privateInferenceCall.count({where:{runId:f.runId,actionId}})).toBe(0);
 });
});
it('both private inference paths deny per-project overspend before provider dispatch',async()=>{
 await fixture(async f=>{
  const run=await db.researchRun.findUnique({where:{id:f.runId}}),actionId=randomUUID();
  await db.privateActionReceipt.create({data:{id:randomUUID(),runId:f.runId,requestId:actionId,digest:'synthetic-budget',status:'processing'}});
  await db.privateInferenceCall.create({data:{id:randomUUID(),runId:f.runId,actionId:'prior-action',monthKey:new Date().toISOString().slice(0,7),model:'fixture',status:'reserved',reservedMicroUsd:999n,committedMicroUsd:999n}});
  const infer=createPrivateWorkflowAi({db,aiPort:{privateVerifiedTransport:'phala-aci-v1',infer:async()=>expect.fail('must not dispatch')},model:'fixture/model',monthlyCapMicroUsd:1000000,inputPricePerMillion:100000,outputPricePerMillion:100000});
  await expect(infer({run,actionId,messages:[{role:'user',content:'synthetic'}],budgetMicroUsd:1000,maxTokens:64})).rejects.toThrow('PRIVATE_RUN_BUDGET_EXHAUSTED');
  const jev=createHostedJevPort({db,apiKey:'synthetic',monthlyCapMicroUsd:1000000,policy:{contextDisclosure:'openrouter-and-typesafe',decisionsZdrRoutingVerified:true},fetchImpl:async()=>expect.fail('must not dispatch')});
  await expect(jev({run,actionId,budgetMicroUsd:1000,request:{state:'synthetic',questions:{test:{type:'noul',instructions:'Synthetic check'}}}})).rejects.toThrow('PRIVATE_RUN_BUDGET_EXHAUSTED');
  expect(await db.privateInferenceCall.count({where:{runId:f.runId}})).toBe(1);
 });
});

it('known failure finality is encrypted, releases the active-action barrier and never replays the same request',async()=>{
 await fixture(async f=>{
  const out=await f.action('intake');expect(out.response.status).toBe(503);
  const receipt=await f.api.get(`/v1/private/runs/${f.runId}/actions/${out.requestId}`);expect(receipt.body.state).toBe('failed');
  const failure=JSON.parse(openClientObject(f.stateKey,f.context(out.requestId,'event'),receipt.body.envelope).toString());expect(failure).toEqual({error:'PRIVATE_PLAN_INVALID',outcome:'failed'});
  expect((await f.api.get(`/v1/private/runs/${f.runId}/actions`)).body.state).toBe('idle');
  const retry=await f.action('intake',{},out.requestId);expect(retry.response.status).toBe(202);expect(retry.response.body.state).toBe('failed');expect(f.getCalls()).toBe(1);
  const explicit=await f.action('intake');expect(explicit.response.status).toBe(503);expect(f.getCalls()).toBe(2);
 },{modelFailure:'known'});
});
it('a known failure code cannot release an uncertain reservation or claim cryptographic finality',async()=>{
 await fixture(async f=>{
  const out=await f.action('intake');expect(out.response.status).toBe(503);
  const receipt=await f.api.get(`/v1/private/runs/${f.runId}/actions/${out.requestId}`);expect(receipt.body.state).toBe('uncertain');
  const failure=JSON.parse(openClientObject(f.stateKey,f.context(out.requestId,'event'),receipt.body.envelope).toString());expect(failure).toEqual({error:'PRIVATE_PLAN_INVALID'});expect(failure.outcome).toBeUndefined();
  expect((await f.api.get(`/v1/private/runs/${f.runId}/actions`)).body.state).toBe('uncertain');
  expect(await db.privateInferenceCall.count({where:{runId:f.runId,status:'reserved'}})).toBe(1);
  const retry=await f.action('intake',{},out.requestId);expect(retry.response.status).toBe(202);expect(f.getCalls()).toBe(1);
 },{modelFailure:'unknown-fixed'});
});

// Synthetic measured-plan commitment for isolated financial tests. The full
// encrypted workflow test above obtains this through a real configure action.
async function fundingInputFixture(f){
 const {privateSourceSetDigest}=await import('../src/privacy/private-input-readiness.js');
 const sourceId=randomUUID(),payload={name:'synthetic.txt',bytes:CANARY.length,contentBase64:Buffer.from(CANARY).toString('base64')};
 expect((await f.api.put(`/v1/private/runs/${f.runId}/objects/${sourceId}`).send({vaultId:f.vault.vaultId,kind:'source',expectedRevision:0,envelope:sealClientObject(f.stateKey,f.context(sourceId,'source'),Buffer.from(JSON.stringify(payload)))})).status).toBe(201);
 const run=await db.researchRun.findUnique({where:{id:f.runId}}),manifest=await db.privateClientObject.findFirst({where:{runId:f.runId,kind:'manifest'}}),sources=await db.privateClientObject.findMany({where:{runId:f.runId,kind:'source'},select:{id:true,digest:true}});
 await db.researchRun.update({where:{id:f.runId},data:{metadata:{...run.metadata,privateFundingInputs:{version:1,manifestDigest:manifest.digest,sourceCount:sources.length,sourceSetDigest:privateSourceSetDigest(sources),webApproved:false}}}});
}
it('private funding validates chain ownership, admits funded work, freezes settlement and reconciles retries without plaintext or double draws',async()=>{
 await fixture(async f=>{
  const {createPrivateFunding}=await import('../src/privacy/private-funding.js');
  const wallet='0x'+'1'.repeat(40),settings={core:'0x'+'2'.repeat(40),splitter:'0x'+'3'.repeat(40),evaluator:'0x'+'4'.repeat(40),token:'0x'+'5'.repeat(40),operator:'0x'+'6'.repeat(40)};
  await db.researchRun.update({where:{id:f.runId},data:{walletAddress:wallet,status:'planned',budgetCap:0.25}});
  const user={id:f.tenantId},wire=[];let splitCalls=0;
  const job={jobId:'7',status:'Open',client:wallet,provider:settings.splitter,evaluator:settings.evaluator,token:settings.token,budget:0};
  const fundingRole='private_funding_'+randomUUID().replaceAll('-',''),guestRole='private_guest_'+randomUUID().replaceAll('-','');
  await db.$executeRawUnsafe(`CREATE ROLE ${guestRole} NOLOGIN`);
  await db.$executeRawUnsafe(`CREATE ROLE ${fundingRole} LOGIN PASSWORD 'synthetic-local-only' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
  const grants=readFileSync(new URL('../prisma/private-funding-grants.sql',import.meta.url),'utf8').replace(/^--.*$/gm,'').replaceAll('drnib_private_synthetic','drnib_fixture').replaceAll('drnib_private_funding_testnet',fundingRole).replaceAll('drnib_private_guest_testnet',guestRole).replaceAll('drnib.','drnib_test.').replace('SCHEMA drnib ','SCHEMA drnib_test ');
  for(const sql of grants.split(';').map(x=>x.trim()).filter(Boolean))await db.$executeRawUnsafe(sql);
  const scopedUrl=new URL(process.env.DRNIB_DATABASE_URL);scopedUrl.username=fundingRole;scopedUrl.password='synthetic-local-only';
  const {PrismaClient}=await import('@prisma/client'),scoped=new PrismaClient({datasourceUrl:scopedUrl.href});
  try{
  await expect(scoped.privateClientObject.findFirst({select:{envelope:true}})).rejects.toThrow();
  await expect(scoped.privateVaultRecord.findFirst()).rejects.toThrow();
  const funding=createPrivateFunding({db:scoped,settings,prepare:async input=>{wire.push(input);return {core:settings.core,splitter:settings.splitter,evaluator:settings.evaluator,description:input.description,hook:'0x'+'0'.repeat(40),expiredAt:Math.floor(Date.now()/1000)+3600}},readJob:async()=>({...job}),completeAndSplit:async input=>{wire.push(input);splitCalls++;return {splitConfirmed:splitCalls>1,completeTx:'0x'+'7'.repeat(64),splitTx:splitCalls>1?'0x'+'8'.repeat(64):null}}});
  await expect(funding.prepare(f.runId,user)).rejects.toThrow('PRIVATE_FUNDING_INPUTS_REQUIRED');
  await fundingInputFixture(f);
  const params=await funding.prepare(f.runId,user);expect(params.description).toBe('Dr. Nib private run '+f.runId);expect(JSON.stringify(params)).not.toContain(CANARY);
  for(const key of ['client','provider','evaluator','token']){const previous=job[key];job[key]='0x'+'9'.repeat(40);await expect(funding.register(f.runId,user,'7')).rejects.toThrow();job[key]=previous;}
  await funding.register(f.runId,user,'7');await expect(funding.register(f.runId,user,'7')).rejects.toThrow();
  const run=await db.researchRun.findUnique({where:{id:f.runId}}),actionId=randomUUID();let dispatched=0;
  const infer=createPrivateWorkflowAi({db,fundingRequired:true,aiPort:{privateVerifiedTransport:'phala-aci-v1',infer:async()=>{dispatched++;const result=json({ok:true});Object.defineProperty(result,PRIVATE_USAGE,{value:{model:'fixture/model',inputTokens:5,outputTokens:2,costMicroUsd:1,requestDigest:'a'.repeat(64),responseDigest:'b'.repeat(64)}});return result}},model:'fixture/model',monthlyCapMicroUsd:1000000,inputPricePerMillion:100000,outputPricePerMillion:100000});
  const request={run,actionId,stage:'write',messages:[{role:'user',content:'synthetic'}],budgetMicroUsd:250000,maxTokens:64};
  await expect(infer(request)).rejects.toThrow('PRIVATE_RUN_FUNDING_REQUIRED');expect(dispatched).toBe(0);
  job.status='Funded';job.budget=0.2;await funding.status(f.runId,user);await funding.status(f.runId,user);
  expect(await db.budgetLedger.count({where:{runId:f.runId,kind:'deposit'}})).toBe(1);
  await infer(request);expect(dispatched).toBe(1);
  await db.researchRun.update({where:{id:f.runId},data:{status:'complete'}});
  const uncertain=randomUUID();await db.privateInferenceCall.create({data:{id:uncertain,runId:f.runId,actionId:'unknown',model:'fixture',billingKind:'customer',status:'reserved',reservedMicroUsd:10n,committedMicroUsd:10n,monthKey:new Date().toISOString().slice(0,7)}});
  expect(await funding.settle(f.runId,user)).toEqual({pending:true});expect(splitCalls).toBe(0);
  await db.privateInferenceCall.delete({where:{id:uncertain}}); // disposable fixture only
  const legacy=randomUUID();await db.privateInferenceCall.create({data:{id:legacy,runId:f.runId,actionId:'old-ceiling',model:'fixture',billingKind:'customer',status:'verified',reservedMicroUsd:10n,committedMicroUsd:10n,monthKey:new Date().toISOString().slice(0,7)}});
  await expect(funding.settle(f.runId,user)).rejects.toThrow();expect(splitCalls).toBe(0);expect(await db.budgetLedger.count({where:{runId:f.runId,kind:'spend'}})).toBe(0);
  await db.privateInferenceCall.delete({where:{id:legacy}}); // disposable fixture only; real historical records are preserved
  await db.privateInferenceCall.create({data:{id:randomUUID(),runId:f.runId,actionId:'preflight-only',model:'fixture',billingKind:'customer',status:'not-dispatched',costBasis:'not-dispatched',reservedMicroUsd:10n,committedMicroUsd:0n,monthKey:new Date().toISOString().slice(0,7)}});
  expect(await funding.settle(f.runId,user)).toEqual({pending:true});expect(splitCalls).toBe(1);
  await expect(infer({...request,actionId:randomUUID()})).rejects.toThrow('PRIVATE_RUN_BUDGET_CLOSED');expect(dispatched).toBe(1);
  const [settled,concurrent]=await Promise.all([funding.settle(f.runId,user),funding.settle(f.runId,user)]);expect(settled).toEqual({pending:false,spent:0.000001,refunded:0.199999});expect(concurrent.alreadySettled).toBe(true);
  await infer({...request,stage:'discuss',actionId:randomUUID()});expect(dispatched).toBe(2);
  expect(await db.privateInferenceCall.count({where:{runId:f.runId,billingKind:'platform'}})).toBe(1);
  expect((await funding.settle(f.runId,user)).alreadySettled).toBe(true);expect(splitCalls).toBe(2);
  expect(await db.budgetLedger.count({where:{runId:f.runId,kind:'spend'}})).toBe(1);
  expect(await db.budgetLedger.count({where:{runId:f.runId,kind:'refund'}})).toBe(1);
  job.status='Completed';const receipt=(await funding.status(f.runId,user)).expenseReceipt;
  expect(receipt.totals).toMatchObject({depositedUsd:'0.200000',chargedUsd:'0.000001',refundedUsd:'0.199999',balanceUsd:'0.000000'});
  expect(receipt.lines.filter(l=>l.status==='charged')).toHaveLength(1);expect(receipt.lines.some(l=>l.status==='sponsored')).toBe(true);
  expect(receipt.infrastructure.chargedUsd).toBe('0.000000');expect(JSON.stringify(receipt)).not.toContain(CANARY);
  expect(JSON.stringify(wire)).not.toContain(CANARY);expect(wire.find(r=>r.reportHash).reportHash).toMatch(/^0x[0-9a-f]{64}$/);
  }finally{await scoped.$disconnect();await db.$executeRawUnsafe(`DROP OWNED BY ${fundingRole}`);await db.$executeRawUnsafe(`DROP ROLE ${fundingRole}`);await db.$executeRawUnsafe(`DROP OWNED BY ${guestRole}`);await db.$executeRawUnsafe(`DROP ROLE ${guestRole}`);}
 });
});
it('ending an uncertain funded run waives unknown customer costs, fences late work and retries its refund',async()=>{
 await fixture(async f=>{
  const {createPrivateFunding}=await import('../src/privacy/private-funding.js');
  const wallet='0x'+'1'.repeat(40),settings={core:'0x'+'2'.repeat(40),splitter:'0x'+'3'.repeat(40),evaluator:'0x'+'4'.repeat(40),token:'0x'+'5'.repeat(40),operator:'0x'+'6'.repeat(40)};
  await db.researchRun.update({where:{id:f.runId},data:{walletAddress:wallet,status:'planned',budgetCap:0.25}});
  const user={id:f.tenantId},job={jobId:'19',status:'Open',client:wallet,provider:settings.splitter,evaluator:settings.evaluator,token:settings.token,budget:0};let splits=0;
  const funding=createPrivateFunding({db,settings,prepare:async()=>{},readJob:async()=>({...job}),completeAndSplit:async input=>{expect(input.spentUsd).toBe(0.000004);splits++;return {splitConfirmed:splits>1,completeTx:'0x'+'a'.repeat(64),splitTx:splits>1?'0x'+'b'.repeat(64):null}}});
  await fundingInputFixture(f);await funding.register(f.runId,user,'19');job.status='Funded';job.budget=0.2;await funding.status(f.runId,user);
  const store=createPrivateActionStore({db,storage:{},stateKey:f.stateKey,tenantId:f.tenantId,runId:f.runId,vaultId:f.vault.vaultId}),before=await store.load();
  const claim=await store.claim({requestId:randomUUID(),digest:'synthetic-active',manifestId:before.row.id,manifestRevision:before.row.revision});
  const priced={id:randomUUID(),runId:f.runId,actionId:claim.requestId,model:'fixture',billingKind:'customer',monthKey:new Date().toISOString().slice(0,7),reservedMicroUsd:10n,committedMicroUsd:4n,status:'accounted',costBasis:'provider-reported',usageEvidence:{format:'drnib-private-usage-v1',inputTokens:100,outputTokens:10,costMicroUsd:4,providerRequestId:'synthetic-priced'}};
  await db.privateInferenceCall.create({data:priced});const unknown=randomUUID();await db.privateInferenceCall.create({data:{id:unknown,runId:f.runId,actionId:claim.requestId,model:'fixture',billingKind:'customer',monthKey:priced.monthKey,reservedMicroUsd:10n,committedMicroUsd:10n,status:'reserved',costBasis:'reservation'}});
  await expect(funding.cancel(f.runId,{id:'outsider'})).rejects.toThrow();
  expect(await funding.cancel(f.runId,user)).toEqual({pending:true});
  expect((await db.privateInferenceCall.findUnique({where:{id:unknown}})).committedMicroUsd).toBe(10n);
  const frozen=await db.researchRun.findUnique({where:{id:f.runId}});expect(frozen.metadata.privateEscrow.settlement.waivedCalls).toBe(1);expect(frozen.metadata.privateEscrow.settlement.spent).toBe('4');
  expect((await f.api.get(`/v1/private/runs/${f.runId}/actions/${claim.requestId}`)).body.state).toBe('cancelled');
  await expect(store.progress(claim.id,{events:[]})).rejects.toThrow('PRIVATE_RUN_BUDGET_CLOSED');
  await expect(store.commit(before,before.value,{receiptId:claim.id})).rejects.toThrow('PRIVATE_RUN_BUDGET_CLOSED');
  await expect(store.claim({requestId:randomUUID(),digest:'no-replay',manifestId:before.row.id,manifestRevision:before.row.revision})).rejects.toThrow('PRIVATE_RUN_BUDGET_CLOSED');
  const infer=createPrivateWorkflowAi({db,fundingRequired:true,aiPort:{privateVerifiedTransport:'phala-aci-v1',infer:()=>expect.fail('cancelled work cannot dispatch')},model:'fixture/model',monthlyCapMicroUsd:1000000,inputPricePerMillion:100000,outputPricePerMillion:100000});
  for(const stage of ['write','intake'])await expect(infer({run:frozen,actionId:randomUUID(),stage,messages:[{role:'user',content:'synthetic'}]})).rejects.toThrow('PRIVATE_RUN_BUDGET_CLOSED');
  // A late provider receipt may settle our admission ledger, never increase
  // the frozen customer charge or revive the cancelled action.
  await db.privateInferenceCall.update({where:{id:unknown},data:{status:'accounted',costBasis:'provider-reported',committedMicroUsd:8n,usageEvidence:{...priced.usageEvidence,costMicroUsd:8,providerRequestId:'synthetic-late'}}});
  expect(await funding.settle(f.runId,user)).toEqual({pending:false,spent:0.000004,refunded:0.199996});
  expect((await funding.cancel(f.runId,user)).alreadySettled).toBe(true);expect(splits).toBe(2);
  expect(await db.budgetLedger.count({where:{runId:f.runId,kind:'spend'}})).toBe(1);expect(await db.budgetLedger.count({where:{runId:f.runId,kind:'refund'}})).toBe(1);
 });
});

it('only proven not-dispatched tool failures can retry the same owner approval once concurrently',async()=>{
 await fixture(async f=>{
  const saved=await db.researchRun.findUnique({where:{id:f.runId}});
  await db.researchRun.update({where:{id:f.runId},data:{status:'awaiting',budgetCap:0.25,metadata:{...saved.metadata,privateEscrow:{jobId:'99'}}}});
  await db.budgetLedger.create({data:{runId:f.runId,kind:'deposit',amount:0.25}});
  const recipient=await generateHpkeRecipient(),manifest=await db.privateClientObject.findFirst({where:{runId:f.runId,kind:'manifest'}});let attempts=0;
  const execute=async()=>{attempts++;if(attempts===1){const e=Error('Synthetic pre-dispatch failure');e.privateNotDispatched=true;throw e;}return {output:{text:'Actual fixture result'},costMicroUsd:7,costBasis:'chain-receipt',txHash:'0x'+'4'.repeat(64)}};
  const tools=createPrivateExternalTools({db,execute}),user={id:f.tenantId};
  const call=await tools.register(f.runId,user,{id:randomUUID(),manifestRevision:manifest.revision,questionId:'f'.repeat(64),request:{tool:'pay_x402',url:'https://public.example.com/data',maxMicroUsd:100},recipientPublicKey:Buffer.from(recipient.publicKey).toString('base64')});
  await expect(tools.run(f.runId,user,call.id)).rejects.toThrow();
  expect(await tools.get(f.runId,user,call.id)).toMatchObject({status:'failed',costMicroUsd:0});
  await Promise.all([tools.run(f.runId,user,call.id),tools.run(f.runId,user,call.id)]);
  expect(attempts).toBe(2);expect(await tools.get(f.runId,user,call.id)).toMatchObject({status:'complete',costMicroUsd:7});
  await tools.run(f.runId,user,call.id);expect(attempts).toBe(2);
 });
});

it('confirmed purchase with lost content response becomes an encrypted platform-covered failure without replay',async()=>{
 await fixture(async f=>{
  const saved=await db.researchRun.findUnique({where:{id:f.runId}});
  await db.researchRun.update({where:{id:f.runId},data:{status:'awaiting',budgetCap:0.25,metadata:{...saved.metadata,privateEscrow:{jobId:'99'}}}});
  await db.budgetLedger.create({data:{runId:f.runId,kind:'deposit',amount:0.25}});
  const recipient=await generateHpkeRecipient(),manifest=await db.privateClientObject.findFirst({where:{runId:f.runId,kind:'manifest'}});let dispatches=0;
  const evidence={network:'eip155:5042002',token:'USDC',from:'0x'+'1'.repeat(40),to:'0x'+'2'.repeat(40),amount:'200000',nonce:'0x'+'3'.repeat(64)};
  const execute=async(_request,{onPaymentPrepared})=>{dispatches++;await onPaymentPrepared(evidence);throw Error('Synthetic lost HTTP response after purchase')};
  execute.reconcile=async()=>({confirmed:true,txHash:'0x'+'4'.repeat(64)});
  const tools=createPrivateExternalTools({db,execute}),user={id:f.tenantId};
  const call=await tools.register(f.runId,user,{id:randomUUID(),manifestRevision:manifest.revision,questionId:'e'.repeat(64),request:{tool:'unlock_content',url:'https://public.example.com/data',maxMicroUsd:200000},recipientPublicKey:Buffer.from(recipient.publicKey).toString('base64')});
  await expect(tools.run(f.runId,user,call.id)).rejects.toThrow();
  const result=await tools.get(f.runId,user,call.id);expect(result).toMatchObject({status:'complete',costMicroUsd:0});expect(dispatches).toBe(1);
  const bytes=await openHpkeToolResult({recipientPrivateKey:recipient.privateKey,envelope:result.envelope,expectedContext:{tenantId:f.tenantId,runId:f.runId,objectId:call.id,revision:1,purpose:'tool-result',recipientId:recipient.recipientId}});
  expect(JSON.parse(new TextDecoder().decode(bytes))).toMatchObject({sources:[],contentUnavailable:true,operatorCovered:true,providerCostMicroUsd:200000});bytes.fill(0);
  const moneyRow=await db.privateToolCall.findUnique({where:{id:call.id}});
  await db.privateToolCall.update({where:{id:call.id},data:{paymentEvidence:{...moneyRow.paymentEvidence,privatePayerProof:CANARY}}});
  const billingRows=await db.$queryRaw`SELECT "billingEvidence" FROM "PrivateToolBillingMetadata" WHERE "runId"=${f.runId}`;
  expect(Object.keys(billingRows[0].billingEvidence).sort()).toEqual(['amount','billingKind','providerCostMicroUsd']);expect(JSON.stringify(billingRows)).not.toContain(CANARY);
  const {readPrivateFinancialReceipt}=await import('../src/privacy/private-financial-receipt.js');const receipt=await readPrivateFinancialReceipt(db,f.runId,f.tenantId);expect(receipt.expenseReceipt.lines[0]).toMatchObject({status:'sponsored',chargedUsd:'0.000000',usageUsd:'0.200000'});
  await tools.run(f.runId,user,call.id);expect(dispatches).toBe(1);
 });
});

it('batched payments survive service restart and finalize once without another purchase',async()=>{
 await fixture(async f=>{
  const saved=await db.researchRun.findUnique({where:{id:f.runId}});
  await db.researchRun.update({where:{id:f.runId},data:{status:'awaiting',budgetCap:0.25,metadata:{...saved.metadata,privateEscrow:{jobId:'99'}}}});
  await db.budgetLedger.create({data:{runId:f.runId,kind:'deposit',amount:0.25}});
  const recipient=await generateHpkeRecipient(),manifest=await db.privateClientObject.findFirst({where:{runId:f.runId,kind:'manifest'}});let dispatches=0,confirmed=false;
  const evidence={network:'eip155:5042002',token:'USDC',from:'0x'+'1'.repeat(40),to:'0x'+'2'.repeat(40),amount:'7',nonce:'0x'+'3'.repeat(64)};
  const execute=async(_request,{onPaymentPrepared})=>{dispatches++;await onPaymentPrepared(evidence);expect((await db.privateToolCall.findFirst({where:{runId:f.runId}})).paymentEvidence).toEqual(evidence);return {output:{text:'public paid evidence'},costMicroUsd:7,costBasis:'gateway-confirmed',pending:true,paymentEvidence:{...evidence,transferId:randomUUID()}}};
  execute.reconcile=async()=>({confirmed,txHash:confirmed?'0x'+'4'.repeat(64):null});
  const tools=createPrivateExternalTools({db,execute}),user={id:f.tenantId};
  const call=await tools.register(f.runId,user,{id:randomUUID(),manifestRevision:manifest.revision,questionId:'c'.repeat(64),request:{tool:'pay_x402',url:'https://public.example.com/data',maxMicroUsd:100},recipientPublicKey:Buffer.from(recipient.publicKey).toString('base64')});
  const pending=await tools.run(f.runId,user,call.id);expect(pending).toMatchObject({status:'reserved',settlementPending:true,envelope:null});
  const restarted=createPrivateExternalTools({db,execute});expect((await restarted.run(f.runId,user,call.id)).status).toBe('reserved');expect(dispatches).toBe(1);
  confirmed=true;const result=await restarted.get(f.runId,user,call.id);expect(result.status).toBe('complete');expect(result.costMicroUsd).toBe(7);expect(result.envelope).toBeTruthy();expect(dispatches).toBe(1);
  expect((await restarted.run(f.runId,user,call.id)).costMicroUsd).toBe(7);expect(dispatches).toBe(1);
 });
});
it('failed gateway settlement releases its hold and cancelled runs never gain a late charge',async()=>{
 for(const cancelled of [false,true])await fixture(async f=>{
  const saved=await db.researchRun.findUnique({where:{id:f.runId}});
  await db.researchRun.update({where:{id:f.runId},data:{status:'awaiting',metadata:{...saved.metadata,...(cancelled?{privateCancellation:{requestedAt:new Date().toISOString()}}:{})}}});
  const row=await db.privateToolCall.create({data:{id:randomUUID(),runId:f.runId,questionId:'d'.repeat(64),tool:'pay_x402',request:{},requestDigest:'e'.repeat(64),manifestRevision:1,recipientPublicKey:'synthetic',recipientId:'synthetic',status:'reserved',reservedMicroUsd:100n,committedMicroUsd:100n,paymentEvidence:{amount:'7'},resultDigest:'f'.repeat(64),resultEnvelope:{synthetic:'encrypted fixture'}}});
  const execute=async()=>{throw Error('must not dispatch')};execute.reconcile=async()=>cancelled?{confirmed:true,txHash:'0x'+'4'.repeat(64)}:{failed:true};
  const tools=createPrivateExternalTools({db,execute}),result=await tools.get(f.runId,{id:f.tenantId},row.id);
  expect(result.status).toBe(cancelled?'reserved':'failed');expect(result.costMicroUsd).toBe(cancelled?100:0);
 });
});
it('creator tip budgets include paid calls and unresolved tool reservations before choosing amounts',async()=>{
 await fixture(async f=>{
  const saved=await db.researchRun.findUnique({where:{id:f.runId}});
  await db.researchRun.update({where:{id:f.runId},data:{metadata:{...saved.metadata,privateEscrow:{jobId:'101'}}}});
  await db.budgetLedger.create({data:{runId:f.runId,kind:'deposit',amount:.25}});
  await db.privateToolCall.create({data:{id:randomUUID(),runId:f.runId,questionId:'a'.repeat(64),tool:'pay_x402',request:{},requestDigest:'b'.repeat(64),manifestRevision:1,recipientPublicKey:'synthetic',recipientId:'synthetic',status:'reserved',reservedMicroUsd:200000n,committedMicroUsd:200000n}});
  const {readPrivateTipBudget}=await import('../src/privacy/private-run-budget.js'),{creatorTipAllocation}=await import('../src/privacy/private-creator-tips.js');
  const budget=await readPrivateTipBudget(db,f.runId,f.tenantId);expect(budget).toEqual({fundedMicroUsd:250000,committedMicroUsd:200000,tippedMicroUsd:0});
  expect(creatorTipAllocation({capUsd:.25,estimateUsd:.03,...budget,count:2})).toMatchObject({tipPoolMicroUsd:20000,perCreatorMicroUsd:10000,researchReserveMicroUsd:30000});
  await db.privateToolCall.updateMany({where:{runId:f.runId},data:{status:'failed',committedMicroUsd:0n}});
  await db.privateToolCall.create({data:{id:randomUUID(),runId:f.runId,questionId:'c'.repeat(64),tool:'tip_creator',request:{},requestDigest:'d'.repeat(64),manifestRevision:1,recipientPublicKey:'synthetic',recipientId:'synthetic',status:'reserved',reservedMicroUsd:40000n,committedMicroUsd:40000n}});
  const later=await readPrivateTipBudget(db,f.runId,f.tenantId);expect(later.tippedMicroUsd).toBe(40000);expect(creatorTipAllocation({capUsd:.25,estimateUsd:.03,...later,count:2}).tipPoolMicroUsd).toBe(10000);
  await expect(readPrivateTipBudget(db,f.runId,'other-owner')).rejects.toThrow('PRIVATE_RUN_BUDGET_CLOSED');
 });
});

it('setup-approved public discovery uses the shared normal tool process without sending private uploads or repeating work',async()=>{
 await fixture(async f=>{
  await f.action('intake');await f.action('answers',{answers:[{seq:0,answer:{optionIds:['a']}}]});
  const sourceId=randomUUID(),payload={name:'private-observations.txt',bytes:CANARY.length,contentBase64:Buffer.from(CANARY).toString('base64')};
  await f.api.put(`/v1/private/runs/${f.runId}/objects/${sourceId}`).send({vaultId:f.vault.vaultId,kind:'source',expectedRevision:0,envelope:sealClientObject(f.stateKey,f.context(sourceId,'source'),Buffer.from(JSON.stringify(payload)))});
  const query='Public creator tutorial';await f.action('configure',{depth:'quick',budgetCap:.25,lengthWords:300,formats:['md'],liveWeb:true,tipCreators:true,publicResearch:{approved:true,brief:query}});
  await db.budgetLedger.create({data:{runId:f.runId,kind:'deposit',amount:.25,txRef:'synthetic-funded'}});
  f.setFirstProposal({tool:'public_research',input:{},why:'Use the query already approved during setup.'});
  const parked=await f.action('execute');expect(parked.value.status).toBe('awaiting');const q=parked.value.pendingQuestion;
  expect(q.externalRequest).toEqual({tool:'web_search',query,preferCreators:true,maxMicroUsd:0});expect(JSON.stringify(q)).not.toContain(CANARY);
  let dispatches=0;const output={sources:[{id:randomUUID(),url:'https://creator.example.com/tutorial',title:'Public creator article',text:'A public tutorial provides context and transparent limitations.',provider:'public-web',evidenceKind:'page-text',trust:null,creatorAssessment:{source:'extension-page-model',eligible:true,kind:'content',author:'Public creator'}}]};
  const tools=createPrivateExternalTools({db,execute:async request=>{expect(request).toEqual(q.externalRequest);expect(JSON.stringify(request)).not.toContain(CANARY);dispatches++;return {output,costMicroUsd:0,costBasis:'no-charge'}}});f.attachTools(tools);
  const recipient=await generateHpkeRecipient(),manifest=await db.privateClientObject.findFirst({where:{runId:f.runId,kind:'manifest'}});
  const registration=await f.api.post(`/v1/private/runs/${f.runId}/tools`).send({id:randomUUID(),manifestRevision:manifest.revision,questionId:q.id,request:q.externalRequest,recipientPublicKey:Buffer.from(recipient.publicKey).toString('base64')});expect(registration.status).toBe(200);
  const toolPath=`/v1/private/runs/${f.runId}/tools/${registration.body.id}/execute`;
  expect((await f.api.post(toolPath).send({})).status).toBe(503);expect(dispatches).toBe(0);
  const saved=await db.researchRun.findUnique({where:{id:f.runId}});await db.researchRun.update({where:{id:f.runId},data:{metadata:{...saved.metadata,privateEscrow:{jobId:'92'}}}});
  const delivered=await f.api.post(toolPath).send({});expect(delivered.body.status).toBe('complete');
  const plaintext=await openHpkeToolResult({recipientPrivateKey:recipient.privateKey,envelope:delivered.body.envelope,expectedContext:{tenantId:f.tenantId,runId:f.runId,objectId:registration.body.id,revision:1,purpose:'tool-result',recipientId:recipient.recipientId}}),decoded=JSON.parse(new TextDecoder().decode(plaintext));plaintext.fill(0);
  const args={questionId:q.id,optionId:'approve',toolCallId:registration.body.id,toolResult:decoded};
  const finished=await f.action('answer',args);expect(finished.value?.status).toBe('complete');expect(finished.value.sources.some(s=>s.creatorAssessment?.author==='Public creator')).toBe(true);expect(dispatches).toBe(1);
  const calls=f.getCalls();expect((await f.action('answer',args,finished.requestId)).value).toEqual(finished.value);expect(f.getCalls()).toBe(calls);expect(dispatches).toBe(1);
 },{withJudge:true});
});

it('a correctable local proposal continues the same encrypted action without closing or failing its budget',async()=>{
 await fixture(async f=>{
  await f.action('intake');await f.action('answers',{answers:[{seq:0,answer:{optionIds:['a']}}]});
  const sourceId=randomUUID(),payload={name:'observations.txt',bytes:CANARY.length,contentBase64:Buffer.from(CANARY).toString('base64')};
  expect((await f.api.put(`/v1/private/runs/${f.runId}/objects/${sourceId}`).send({vaultId:f.vault.vaultId,kind:'source',expectedRevision:0,envelope:sealClientObject(f.stateKey,f.context(sourceId,'source'),Buffer.from(JSON.stringify(payload)))})).status).toBe(201);
  await f.action('configure',{depth:'quick',budgetCap:1,lengthWords:300,formats:['md'],liveWeb:false});
  f.setFirstProposal({tool:'compute',input:{operation:'subtract',values:[126]},why:'Check the difference.'});
  const completed=await f.action('execute');expect(completed.value?.status).toBe('complete');
  expect(completed.value.events.some(e=>e.phase==='recovery')).toBe(true);expect(completed.value.reports).toHaveLength(1);
  const receipt=await db.privateActionReceipt.findUnique({where:{runId_requestId:{runId:f.runId,requestId:completed.requestId}}});expect(receipt.status).toBe('complete');
  expect(await db.privateActionReceipt.count({where:{runId:f.runId,status:{in:['failed','uncertain']}}})).toBe(0);
  expect(completed.value.events.filter(e=>e.type==='tool.call'&&e.tool==='compute')).toHaveLength(0);
 },{withJudge:true});
});

it('uncertain actions recover only after expired leases, complete journals and zero unresolved model or payment reservations',async()=>{
 await fixture(async f=>{
  let now=Date.now();const make=()=>createPrivateActionStore({db,storage:{},stateKey:f.stateKey,tenantId:f.tenantId,runId:f.runId,vaultId:f.vault.vaultId,now:()=>now}),original=make();
  const before=await original.load(),requestId=randomUUID(),journal={format:'drnib-checkpoint-v1',rootRequestId:requestId,current:{requestId,manifestRevision:before.row.revision,manifestDigest:before.row.digest},entries:[],consumed:[]};
  const input={requestId,digest:'safe-uncertain-recovery',manifestId:before.row.id,manifestRevision:before.row.revision,checkpoint:journal},claim=await original.claim(input);
  await original.uncertain(claim.id,{error:'PRIVATE_ACTION_UNAVAILABLE'},{terminalResearchFailure:true});expect((await db.researchRun.findUnique({where:{id:f.runId}})).status).not.toBe('failed');
  const takeover=make();expect((await takeover.claim({...input,recover:true,checkpointRoot:requestId})).recovered).toBeUndefined();now+=90001;
  const modelId=randomUUID();await db.privateInferenceCall.create({data:{id:modelId,runId:f.runId,actionId:requestId,monthKey:new Date().toISOString().slice(0,7),model:'synthetic',status:'reserved',reservedMicroUsd:1n,committedMicroUsd:1n}});
  expect((await takeover.claim({...input,recover:true,checkpointRoot:requestId})).recovered).toBeUndefined();await db.privateInferenceCall.update({where:{id:modelId},data:{status:'verified'}});
  const toolId=randomUUID();await db.privateToolCall.create({data:{id:toolId,runId:f.runId,questionId:'safe-recovery',tool:'pay_x402',request:{},requestDigest:'synthetic',manifestRevision:before.row.revision,recipientPublicKey:'synthetic',recipientId:'synthetic',status:'reserved',reservedMicroUsd:1n}});
  expect((await takeover.claim({...input,recover:true,checkpointRoot:requestId})).recovered).toBeUndefined();await db.privateToolCall.update({where:{id:toolId},data:{status:'complete'}});
  const resumed=await takeover.claim({...input,recover:true,checkpointRoot:requestId});expect(resumed.recovered).toBe(true);expect(resumed.status).toBe('processing');expect(resumed.reply.context.purpose).toBe('action-progress');
  await expect(original.fence()).rejects.toThrow('PRIVATE_CHECKPOINT_FENCED');expect(await db.privateActionReceipt.count({where:{runId:f.runId}})).toBe(1);
 });
});

it('an unfinished journal returns only an encrypted fixed operation category and cannot dispatch another model',async()=>{
 await fixture(async f=>{
  const original=createPrivateActionStore({db,storage:{},stateKey:f.stateKey,tenantId:f.tenantId,runId:f.runId,vaultId:f.vault.vaultId}),before=await original.load(),requestId=randomUUID();
  const descriptor={requestId,action:'execute',args:{},manifestRevision:before.row.revision,manifestDigest:before.row.digest},checkpoint={format:'drnib-checkpoint-v1',rootRequestId:requestId,initialAction:'execute',initialArgs:{},initialState:before.value,current:descriptor,entries:[{kind:'terminal',digest:'synthetic',state:'started'}],consumed:[]};
  const digest=createHmac('sha256',f.stateKey).update(canonicalCiphertext({action:'execute',args:{},vaultId:f.vault.vaultId})).digest('hex'),claim=await original.claim({requestId,digest,manifestId:before.row.id,manifestRevision:before.row.revision,checkpoint});
  await original.uncertain(claim.id,{error:'PRIVATE_ACTION_UNAVAILABLE'});await db.privateActionReceipt.update({where:{id:claim.id},data:{leaseUntil:new Date(Date.now()-1000)}});
  const calls=f.getCalls(),out=await f.action('recover',{},requestId);expect(out.response.body.state).toBe('uncertain');expect(f.getCalls()).toBe(calls);
  const diagnostic=JSON.parse(openClientObject(f.stateKey,f.context(requestId,'event'),out.response.body.envelope).toString());expect(diagnostic).toEqual({error:'PRIVATE_CHECKPOINT_UNCERTAIN',operation:'terminal'});expect(JSON.stringify(out.response.body)).not.toContain('terminal');expect(JSON.stringify(out.response.body)).not.toContain(CANARY);
 });
});

it('exhausted quote correction keeps the original checkpoint and escrow open without duplicate calls',async()=>{
 let checks=0;
 await fixture(async f=>{
  await f.action('intake');await f.action('answers',{answers:[{seq:0,answer:{optionIds:['a']}}]});
  const sourceId=randomUUID(),payload={name:'synthetic.txt',bytes:CANARY.length,contentBase64:Buffer.from(CANARY).toString('base64')};
  await f.api.put(`/v1/private/runs/${f.runId}/objects/${sourceId}`).send({vaultId:f.vault.vaultId,kind:'source',expectedRevision:0,envelope:sealClientObject(f.stateKey,f.context(sourceId,'source'),Buffer.from(JSON.stringify(payload)))});
  await f.action('configure',{depth:'quick',budgetCap:0.25,lengthWords:300,formats:['md']});
  const out=await f.action('execute');expect(checks).toBe(3);expect(out.response.status).toBe(503);
  const store=createPrivateActionStore({db,storage:{},stateKey:f.stateKey,tenantId:f.tenantId,runId:f.runId,vaultId:f.vault.vaultId}),saved=await store.load();
  expect(saved.run.status).toBe('planned');expect(saved.value.status).toBe('planned');expect(saved.value.reports??[]).toEqual([]);
  const receipt=await db.privateActionReceipt.findUnique({where:{runId_requestId:{runId:f.runId,requestId:out.requestId}}});
  expect(receipt.status).toBe('uncertain');expect(JSON.stringify(receipt)).not.toContain(CANARY);
  const diagnostic=JSON.parse(openClientObject(f.stateKey,f.context(out.requestId,'event'),receipt.reply).toString());expect(diagnostic.error).toBe('PRIVATE_REPORT_REPAIR_REQUIRED');expect(Object.keys(diagnostic).sort()).toEqual(['activeWork','error']);expect(diagnostic.activeWork.running).toBe(false);expect(diagnostic.activeWork.durationMs).toBeGreaterThan(0);
  const beforeCalls=f.getCalls();await db.privateActionReceipt.update({where:{id:receipt.id},data:{leaseUntil:new Date(0)}});
  const recovered=await f.action('recover',{requestId:out.requestId},out.requestId);expect(recovered.response.status).toBe(503);expect((await db.privateActionReceipt.findUnique({where:{id:receipt.id}})).status).toBe('uncertain');expect(f.getCalls()).toBe(beforeCalls);expect(checks).toBe(3);
  const wallet='0x'+'1'.repeat(40),settings={core:'0x'+'2'.repeat(40),splitter:'0x'+'3'.repeat(40),evaluator:'0x'+'4'.repeat(40),token:'0x'+'5'.repeat(40),operator:'0x'+'6'.repeat(40)};
  await db.researchRun.update({where:{id:f.runId},data:{walletAddress:wallet,metadata:{...saved.run.metadata,privateEscrow:{jobId:'9'}}}});await db.budgetLedger.create({data:{runId:f.runId,kind:'deposit',amount:0.25}});
  const {createPrivateFunding}=await import('../src/privacy/private-funding.js');const funding=createPrivateFunding({db,settings,prepare:async()=>expect.fail('No preparation'),readJob:async()=>expect.fail('No chain call'),completeAndSplit:async()=>expect.fail('An output repair cannot settle the open escrow')});
  await expect(funding.settle(f.runId,{id:f.tenantId})).rejects.toThrow('PRIVATE_FUNDING_UNAVAILABLE');
  expect(await db.budgetLedger.count({where:{runId:f.runId,kind:'refund'}})).toBe(0);
 },{withJudge:true,verificationOutput:()=>{checks++;return {claims:[{text:'Synthetic observation',verdict:'supported',sourceIds:[1],quote:'fabricated quotation'}]}}});
});

it('two malformed quote checks recover with bound literal passages and deliver the report',async()=>{
 let checks=0;
 await fixture(async f=>{
  await f.action('intake');await f.action('answers',{answers:[{seq:0,answer:{optionIds:['a']}}]});
  const sourceId=randomUUID(),payload={name:'synthetic.txt',bytes:CANARY.length,contentBase64:Buffer.from(CANARY).toString('base64')};
  await f.api.put(`/v1/private/runs/${f.runId}/objects/${sourceId}`).send({vaultId:f.vault.vaultId,kind:'source',expectedRevision:0,envelope:sealClientObject(f.stateKey,f.context(sourceId,'source'),Buffer.from(JSON.stringify(payload)))});
  await f.action('configure',{depth:'quick',budgetCap:0.25,lengthWords:300,formats:['md']});
  const out=await f.action('execute');expect(out.response.status).toBe(200);expect(out.value.status).toBe('complete');expect(checks).toBe(3);expect(out.value.reports).toHaveLength(1);
  expect(out.value.claims[0].quote).toBe(CANARY);expect(out.value.claims[0].sourceIds).toEqual([1]);
  expect(out.value.events.some(e=>e.phase==='recovery'&&e.text.includes('numbered source passages'))).toBe(true);
 },{withJudge:true,verificationOutput:input=>{checks++;return input.messages[0].content.includes('numbered source passages')?{claims:[{text:CANARY,verdict:'supported',passageId:'p0'}]}:{claims:[{text:CANARY,verdict:'supported',sourceIds:[1],quote:'incorrectly copied evidence'}]}}});
});

it('recovery replacement atomically rewraps trash, rejects partial/stale mutations and preserves encrypted content',async()=>{
 await fixture(async f=>{
  const extraRuns=[];
  for(let i=0;i<16;i++){
   const id=randomUUID(),manifestId=randomUUID(),project=await createPrivateProjectKeys(f.vault,id);
   const manifestEnvelope=sealClientObject(project.secrets.workerStateKey,{tenantId:f.tenantId,vaultId:f.vault.vaultId,runId:id,objectId:manifestId,purpose:'manifest',revision:1},Buffer.from('{}'));
   expect((await f.api.post('/v1/private/projects').send({id,vaultId:f.vault.vaultId,expectedVaultRevision:1,manifestId,manifestEnvelope,projectKeysEnvelope:project.envelope})).status).toBe(201);
   extraRuns.push(id);
  }
  try {
  const path='/v1/private/vault',original=(await f.api.get(path)).body;
  const manifestBefore=await db.privateClientObject.findUnique({where:{runId_objectId:{runId:f.runId,objectId:f.manifestId}}});
  expect((await f.api.delete(`/v1/private/projects/${f.runId}`)).status).toBe(200);
  const snapshot=(await f.api.get(path+'/recovery-snapshot')).body;
  expect(snapshot.projects).toHaveLength(17);expect(snapshot.projects.some(p=>p.runId===f.runId)).toBe(true);
  const created=await createPrivateVault(f.tenantId,f.vault.vaultId);
  const projects=await Promise.all(snapshot.projects.map(async p=>({runId:p.runId,expectedDigest:p.expectedDigest,
   envelope:await rewrapPrivateProjectKeys(f.vault,created.vault,p.runId,p.envelope)})));
  const body={vaultId:f.vault.vaultId,expectedRevision:original.revision,recoveryEnvelope:created.recoveryEnvelope,projects};
  // The old update endpoint cannot silently invalidate project wrappers.
  expect((await f.api.put(path).send({vaultId:f.vault.vaultId,expectedRevision:1,recoveryEnvelope:created.recoveryEnvelope,passkey:null})).status).toBe(409);
  for(const bad of [{...body,projects:[]},{...body,projects:[{...projects[0],expectedDigest:'0'.repeat(64)}]}, {...body,projects:[projects[0],projects[0]]}])
   expect((await f.api.post(path+'/replace-recovery').send(bad)).status).toBeGreaterThanOrEqual(400);
  expect((await f.api.get(path)).body).toEqual(original);
  f.setCaller('outsider');expect((await f.api.get(path+'/recovery-snapshot')).status).toBe(404);
  expect((await f.api.post(path+'/replace-recovery').send(body)).status).toBe(404);f.setCaller(f.tenantId);
  expect((await f.api.post(path+'/replace-recovery').send(body)).status).toBe(200);
  expect((await f.api.post(path+'/replace-recovery').send(body)).status).toBe(409);
  const remote=(await f.api.get(path)).body;expect(remote.revision).toBe(2);expect(remote.passkey).toBeNull();
  await expect(recoverPrivateVault(f.recoverySecret,remote.recoveryEnvelope,{tenantId:f.tenantId,vaultId:f.vault.vaultId})).rejects.toThrow();
  const recovered=await recoverPrivateVault(created.recoverySecret,remote.recoveryEnvelope,{tenantId:f.tenantId,vaultId:f.vault.vaultId});
  expect((await f.api.post(`/v1/private/projects/${f.runId}/restore`).send({})).status).toBe(200);
  const wrapper=(await f.api.get(`/v1/private/runs/${f.runId}/objects/${f.runId}`)).body;
  expect(await openPrivateProjectKeys(recovered,f.runId,wrapper.envelope)).toEqual(f.project.secrets);
  const manifestAfter=await db.privateClientObject.findUnique({where:{runId_objectId:{runId:f.runId,objectId:f.manifestId}}});
  expect(manifestAfter).toEqual(manifestBefore);
  // A tab that encrypted a project before replacement cannot create a stranded
  // old-generation wrapper after the server's atomic change.
  const id=randomUUID(),manifestId=randomUUID(),project=await createPrivateProjectKeys(f.vault,id);
  const stale={id,vaultId:f.vault.vaultId,expectedVaultRevision:1,manifestId,projectKeysEnvelope:project.envelope,
   manifestEnvelope:sealClientObject(project.secrets.workerStateKey,{tenantId:f.tenantId,vaultId:f.vault.vaultId,runId:id,objectId:manifestId,purpose:'manifest',revision:1},Buffer.from('{}'))};
  expect((await f.api.post('/v1/private/projects').send(stale)).status).toBe(409);
  expect(await db.researchRun.findUnique({where:{id}})).toBeNull();
  } finally { await db.researchRun.deleteMany({where:{userId:f.tenantId,id:{in:extraRuns}}}); }
 });
});

it('missing delivered evidence retains the checkpoint and funded escrow rather than failing and refunding',async()=>{
 await fixture(async f=>{
  const store=createPrivateActionStore({db,storage:{},stateKey:f.stateKey,tenantId:f.tenantId,runId:f.runId,vaultId:f.vault.vaultId});
  const before=await store.load(),requestId=randomUUID();
  const checkpoint={format:'drnib-checkpoint-v1',rootRequestId:requestId,current:{requestId,manifestRevision:before.row.revision,manifestDigest:before.row.digest},entries:[],consumed:[]};
  const claim=await store.claim({requestId,digest:'missing-evidence-recovery',manifestId:before.row.id,manifestRevision:before.row.revision,checkpoint});
  await store.uncertain(claim.id,{error:'PRIVATE_EVIDENCE_REPAIR_REQUIRED'},{terminalResearchFailure:true});
  const receipt=await db.privateActionReceipt.findUnique({where:{id:claim.id}});
  expect(receipt.status).toBe('uncertain');expect((await store.load()).run.status).toBe(before.run.status);
  expect(JSON.parse(openClientObject(f.stateKey,f.context(requestId,'event'),receipt.reply).toString())).toEqual({error:'PRIVATE_EVIDENCE_REPAIR_REQUIRED'});
  expect(await db.privateClientObject.count({where:{runId:f.runId,kind:'checkpoint'}})).toBe(1);
  await db.researchRun.update({where:{id:f.runId},data:{walletAddress:'0x'+'1'.repeat(40),metadata:{...before.run.metadata,privateEscrow:{jobId:'9'}}}});
  await db.budgetLedger.create({data:{runId:f.runId,kind:'deposit',amount:0.25}});
  const {createPrivateFunding}=await import('../src/privacy/private-funding.js');
  const funding=createPrivateFunding({db,settings:{core:'0x'+'2'.repeat(40),splitter:'0x'+'3'.repeat(40),evaluator:'0x'+'4'.repeat(40),token:'0x'+'5'.repeat(40),operator:'0x'+'6'.repeat(40)},prepare:async()=>expect.fail('No preparation'),readJob:async()=>expect.fail('No chain call'),completeAndSplit:async()=>expect.fail('Missing evidence must not close escrow')});
  await expect(funding.settle(f.runId,{id:f.tenantId})).rejects.toThrow('PRIVATE_FUNDING_UNAVAILABLE');
  expect(await db.budgetLedger.count({where:{runId:f.runId,kind:'refund'}})).toBe(0);
 });
});

it.each(['PRIVATE_STORAGE_TRANSACTION_TIMEOUT','PHALA_PRIVATE_AI_SESSION_EXPIRED','PHALA_PRIVATE_AI_RATE_LIMITED','HOSTED_JEV_UNAVAILABLE','PRIVATE_WEB_UNAVAILABLE'])('recoverable service failure %s retains saved work and prevents settlement even with zero inference reservations',async code=>{
 await fixture(async f=>{
  const store=createPrivateActionStore({db,storage:{},stateKey:f.stateKey,tenantId:f.tenantId,runId:f.runId,vaultId:f.vault.vaultId});
  const before=await store.load(),requestId=randomUUID();
  const checkpoint={format:'drnib-checkpoint-v1',rootRequestId:requestId,current:{requestId,manifestRevision:before.row.revision,manifestDigest:before.row.digest},entries:[],consumed:[]};
  const claim=await store.claim({requestId,digest:'recoverable-service-failure',manifestId:before.row.id,manifestRevision:before.row.revision,checkpoint});
  await store.uncertain(claim.id,{error:code},{terminalResearchFailure:true});
  const receipt=await db.privateActionReceipt.findUnique({where:{id:claim.id}});
  expect(receipt.status).toBe('uncertain');expect((await store.load()).run.status).toBe(before.run.status);
  expect(JSON.parse(openClientObject(f.stateKey,f.context(requestId,'event'),receipt.reply).toString())).toEqual({error:code});
  expect(await db.privateClientObject.count({where:{runId:f.runId,kind:'checkpoint'}})).toBe(1);
  await db.researchRun.update({where:{id:f.runId},data:{walletAddress:'0x'+'1'.repeat(40),metadata:{...before.run.metadata,privateEscrow:{jobId:'9'}}}});
  await db.budgetLedger.create({data:{runId:f.runId,kind:'deposit',amount:0.25}});
  const {createPrivateFunding}=await import('../src/privacy/private-funding.js');
  const funding=createPrivateFunding({db,settings:{core:'0x'+'2'.repeat(40),splitter:'0x'+'3'.repeat(40),evaluator:'0x'+'4'.repeat(40),token:'0x'+'5'.repeat(40),operator:'0x'+'6'.repeat(40)},prepare:async()=>expect.fail('No preparation'),readJob:async()=>expect.fail('No chain call'),completeAndSplit:async()=>expect.fail('A recoverable outage must not close escrow')});
  await expect(funding.settle(f.runId,{id:f.tenantId})).rejects.toThrow('PRIVATE_FUNDING_UNAVAILABLE');
  expect(await db.budgetLedger.count({where:{runId:f.runId,kind:'refund'}})).toBe(0);
 });
});

it.each(['safe','active-lease','wrong-failure','model-reserved','model-verified-zero','model-not-dispatched','not-first','wrong-kind'])('initial inference admission reconciliation: %s',async scenario=>{
 await fixture(async f=>{
  let now=Date.now();const make=()=>createPrivateActionStore({db,storage:{},stateKey:f.stateKey,tenantId:f.tenantId,runId:f.runId,vaultId:f.vault.vaultId,now:()=>now}),original=make();
  const before=await original.load(),requestId=randomUUID(),entry={kind:scenario==='wrong-kind'?'judge':'infer',digest:'synthetic',state:'started'};
  const journal={format:'drnib-checkpoint-v1',rootRequestId:requestId,current:{requestId,manifestRevision:before.row.revision,manifestDigest:before.row.digest},entries:scenario==='not-first'?[{kind:'parse',state:'complete',digest:'old',result:{}},entry]:[entry],consumed:[]};
  const input={requestId,digest:'initial-admission',manifestId:before.row.id,manifestRevision:before.row.revision,checkpoint:journal};
  const claim=await original.claim(input);await original.uncertain(claim.id,{error:scenario==='wrong-failure'?'PRIVATE_ACTION_UNAVAILABLE':'PRIVATE_STORAGE_TRANSACTION_TIMEOUT'});
  if(scenario!=='active-lease')now+=90001;
  if(scenario.startsWith('model-'))await db.privateInferenceCall.create({data:{id:randomUUID(),runId:f.runId,actionId:requestId,model:'fixture',monthKey:new Date().toISOString().slice(0,7),status:scenario==='model-reserved'?'reserved':scenario==='model-verified-zero'?'verified':'not-dispatched',reservedMicroUsd:1n,committedMicroUsd:0n}});
  const takeover=make(),resumed=await takeover.claim({...input,recover:true,checkpointRoot:requestId});
  if(scenario==='safe'){
   expect(resumed.recovered).toBe(true);expect(resumed.checkpoint.entries).toEqual([]);expect(resumed.checkpoint.reconciliations[0].kind).toBe('initial-inference-not-dispatched');
   expect((await takeover.checkpoint(requestId)).reconciliations).toEqual(resumed.checkpoint.reconciliations);
   await expect(original.fence()).rejects.toThrow('PRIVATE_CHECKPOINT_FENCED');
  }else{
   expect(resumed.recovered).toBeUndefined();expect((await takeover.checkpoint(requestId)).entries).toEqual(journal.entries);
  }
  expect(await db.privateActionReceipt.count({where:{runId:f.runId}})).toBe(1);
  expect(await db.budgetLedger.count({where:{runId:f.runId}})).toBe(0);
 });
});

it.each([200000n,244000n])('inference allowance fits remaining funded budget after %s tool commitment',async toolCost=>{
 await fixture(async f=>{
  const before=await db.researchRun.findUnique({where:{id:f.runId}}),actionId=randomUUID();
  await db.researchRun.update({where:{id:f.runId},data:{budgetCap:.25,metadata:{...before.metadata,privateEscrow:{jobId:'9'}}}});
  await db.budgetLedger.create({data:{runId:f.runId,kind:'deposit',amount:.25}});
  await db.privateToolCall.create({data:{id:randomUUID(),runId:f.runId,questionId:'paid',tool:'pay_x402',request:{},requestDigest:'fixture',manifestRevision:1,recipientPublicKey:'fixture',recipientId:'fixture',status:'complete',reservedMicroUsd:toolCost,committedMicroUsd:toolCost}});
  await db.privateInferenceCall.create({data:{id:randomUUID(),runId:f.runId,actionId:'prior',model:'fixture',billingKind:'customer',status:'verified',monthKey:new Date().toISOString().slice(0,7),reservedMicroUsd:4000n,committedMicroUsd:4000n}});
  let dispatched=0,limit;const infer=createPrivateWorkflowAi({db,model:'fixture',fundingRequired:true,monthlyCapMicroUsd:1000000,inputPricePerMillion:200000,outputPricePerMillion:2500000,aiPort:{privateVerifiedTransport:'phala-aci-v1',infer:async input=>{dispatched++;limit=input.maxTokens;const result={choices:[{message:{content:'A bounded report'},finish_reason:'stop'}]};Object.defineProperty(result,PRIVATE_USAGE,{value:{model:'fixture',inputTokens:50,outputTokens:100,costMicroUsd:260}});return result;}}});
  const work=infer({run:before,actionId,stage:'write',messages:[{role:'user',content:'Write 300 words.'}],maxTokens:12192,budgetMicroUsd:250000});
  if(toolCost===200000n){await work;expect(dispatched).toBe(1);expect(limit).toBeGreaterThanOrEqual(1024);expect(limit).toBeLessThan(12192);const row=await db.privateInferenceCall.findFirst({where:{runId:f.runId,actionId}});expect(row.reservedMicroUsd).toBeLessThanOrEqual(46000n);expect(row.committedMicroUsd).toBe(260n);}else{await expect(work).rejects.toThrow('PRIVATE_RUN_BUDGET_EXHAUSTED');expect(dispatched).toBe(0);expect(await db.privateInferenceCall.count({where:{runId:f.runId,actionId}})).toBe(0);}
 });
});

it.each([40000n,20000n])('monthly admission fits only output headroom with %s micro-USD left',async remaining=>{
 await fixture(async f=>{
  const run=await db.researchRun.findUnique({where:{id:f.runId}}),actionId=randomUUID(),monthKey=new Date().toISOString().slice(0,7);
  await db.privateInferenceCall.create({data:{id:randomUUID(),runId:f.runId,actionId:'older-uncertain',model:'fixture',status:'reserved',monthKey,reservedMicroUsd:10000n,committedMicroUsd:10000n}});
  const a=await db.privateInferenceCall.aggregate({where:{monthKey},_sum:{committedMicroUsd:true}}),b=await db.privateAiBudgetReservation.aggregate({where:{monthKey},_sum:{committedMicroUsd:true}});
  const monthlyCapMicroUsd=Number(BigInt(a._sum.committedMicroUsd??0)+BigInt(b._sum.committedMicroUsd??0)+remaining);
  let dispatched=0,limit;const infer=createPrivateWorkflowAi({db,model:'fixture',monthlyCapMicroUsd,inputPricePerMillion:200000,outputPricePerMillion:2500000,aiPort:{privateVerifiedTransport:'phala-aci-v1',infer:async input=>{dispatched++;limit=input.maxTokens;const result=json({report:'Bounded'});Object.defineProperty(result,PRIVATE_USAGE,{value:{model:'fixture',inputTokens:50,outputTokens:100,costMicroUsd:260}});return result;}}});
  const work=infer({run,actionId,stage:'write',messages:[{role:'user',content:'Write a short report.'}],maxTokens:12192});
  if(remaining===40000n){await work;expect(dispatched).toBe(1);expect(limit).toBeGreaterThanOrEqual(1024);expect(limit).toBeLessThan(12192);const row=await db.privateInferenceCall.findFirst({where:{runId:f.runId,actionId}});expect(row.reservedMicroUsd).toBeLessThanOrEqual(remaining);expect(row.committedMicroUsd).toBe(260n);}
  else{await expect(work).rejects.toThrow('PRIVATE_WORKFLOW_CAP');expect(dispatched).toBe(0);expect(await db.privateInferenceCall.count({where:{runId:f.runId,actionId}})).toBe(0);}
 });
});

it.each(['safe','live-lease','changed-request','inference-present','not-export'])('read-only export retry is scoped to the same expired request: %s',async scenario=>{
 await fixture(async f=>{
  const config={db,storage:{},stateKey:f.stateKey,tenantId:f.tenantId,runId:f.runId,vaultId:f.vault.vaultId,allowCancelledExport:true,now:()=>2000000000000};
  const original=createPrivateActionStore(config),initial=await original.load(),rev=initial.row.revision+1;
  const envelope=sealClientObject(f.stateKey,f.context(f.manifestId,'manifest',rev),Buffer.from(JSON.stringify({...initial.value,status:'complete'})));
  await db.privateClientObject.update({where:{id:initial.row.id},data:{revision:rev,envelope,digest:createHash('sha256').update(canonicalCiphertext(envelope)).digest('hex')}});
  await db.researchRun.update({where:{id:f.runId},data:{status:'complete'}});
  const before=await original.load(),requestId=randomUUID(),claimArgs={requestId,digest:'synthetic-keyed-export',manifestId:before.row.id,manifestRevision:before.row.revision};
  const first=await original.claim(claimArgs);
  await db.privateActionReceipt.update({where:{id:first.id},data:{status:'uncertain',leaseUntil:new Date(config.now()+(scenario==='live-lease'?60000:-1))}});
  if(scenario==='inference-present')await db.privateInferenceCall.create({data:{id:randomUUID(),runId:f.runId,actionId:requestId,model:'fixture',status:'not-dispatched',monthKey:'fixture',reservedMicroUsd:0n,committedMicroUsd:0n}});
  const next=createPrivateActionStore({...config,allowCancelledExport:scenario!=='not-export'});
  if(scenario==='changed-request')await expect(next.claim({...claimArgs,digest:'different-action-or-format'})).rejects.toThrow();
  else{
   const result=await next.claim(claimArgs);
   if(scenario==='safe'){
    expect(result.status).toBe('processing');expect(result.existing).toBeUndefined();await expect(original.fence()).rejects.toThrow('PRIVATE_CHECKPOINT_FENCED');
    await next.uncertain(result.id,{error:'PRIVATE_ACTION_UNAVAILABLE'});
    expect((await db.privateActionReceipt.findUnique({where:{id:first.id}})).status).toBe('failed');
   }else expect(result.existing).toBe(true);
  }
  expect((await original.load()).value.status).toBe('complete');expect((await original.load()).run.status).toBe('complete');
  expect(await db.privateActionReceipt.count({where:{runId:f.runId}})).toBe(1);expect(await db.budgetLedger.count({where:{runId:f.runId}})).toBe(0);
 });
});

// Real Postgres admission is released only by the verified transport marker.
it.each(['proven-refusal','unknown-failure'])('persist safe gateway failure evidence without inventing usage: %s',async scenario=>{
 await fixture(async f=>{
  const run=await db.researchRun.findUnique({where:{id:f.runId}}),actionId=randomUUID();
  const failure={format:'drnib-aci-failure-v1',httpStatus:scenario==='proven-refusal'?412:503,requestDigest:'a'.repeat(64),model:'fixture',receiptId:'synthetic-refusal'};
  const aiPort={privateVerifiedTransport:'phala-aci-v1',infer:async()=>{const e=Error('Private AI unavailable');Object.defineProperty(e,PRIVATE_FAILURE_EVIDENCE,{value:failure});if(scenario==='proven-refusal'){Object.defineProperty(e,PRIVATE_NOT_DISPATCHED,{value:true});Object.defineProperty(e,PRIVATE_REFUSAL_EVIDENCE,{value:[{receiptId:'synthetic-refusal',requestDigest:'a'.repeat(64)}]});}throw e;}};
  const infer=createPrivateWorkflowAi({db,aiPort,model:'fixture',monthlyCapMicroUsd:1000000,inputPricePerMillion:200000,outputPricePerMillion:2500000});
  await expect(infer({run,actionId,messages:[{role:'user',content:'synthetic'}]})).rejects.toThrow('Private AI unavailable');
  const row=await db.privateInferenceCall.findFirst({where:{runId:f.runId,actionId}});expect(row.usageEvidence.failure).toEqual(failure);
  if(scenario==='proven-refusal'){expect(row.status).toBe('not-dispatched');expect(row.committedMicroUsd).toBe(0n);expect(row.usageEvidence.refusalProofs).toHaveLength(1);}
  else{expect(row.status).toBe('reserved');expect(row.committedMicroUsd).toBe(row.reservedMicroUsd);}
 });
});

it('disclosed fallback recovers a definite 429 while retaining its entire operator allowance',async()=>{
 await fixture(async f=>{
  let now=Date.now();const make=()=>createPrivateActionStore({db,storage:{},stateKey:f.stateKey,tenantId:f.tenantId,runId:f.runId,vaultId:f.vault.vaultId,now:()=>now,allowHostedResearchFallback:true});
  const original=make(),before=await original.load(),requestId=randomUUID();
  const journal={format:'drnib-checkpoint-v1',rootRequestId:requestId,current:{requestId,manifestRevision:before.row.revision,manifestDigest:before.row.digest},entries:[{kind:'infer',state:'complete',digest:'saved',result:{value:'cached'}},{kind:'infer',state:'started',digest:'retry'}],consumed:[]};
  const input={requestId,digest:'429-fixture',manifestId:before.row.id,manifestRevision:before.row.revision,checkpoint:journal};
  const claim=await original.claim(input);
  const callId=randomUUID();await db.privateInferenceCall.create({data:{id:callId,runId:f.runId,actionId:requestId,model:'fixture/model',monthKey:new Date().toISOString().slice(0,7),status:'reserved',billingKind:'customer',costBasis:'reservation',committedMicroUsd:29168n,reservedMicroUsd:29168n,usageEvidence:{failure:{httpStatus:429,model:'fixture/model',receiptId:'rcpt-fixture',requestDigest:'a'.repeat(64)}}}});
  await original.uncertain(claim.id,{error:'PHALA_PRIVATE_AI_RATE_LIMITED'});now+=90001;
  const recovered=await make().claim({...input,recover:true,checkpointRoot:requestId});expect(recovered.recovered).toBe(true);expect(recovered.checkpoint.entries).toHaveLength(1);
  const call=await db.privateInferenceCall.findUnique({where:{id:callId}});expect(call).toMatchObject({status:'rejected-held',billingKind:'platform',committedMicroUsd:29168n,reservedMicroUsd:29168n});
  expect(recovered.checkpoint.reconciliations[0]).toMatchObject({kind:'operator-covered-429',callId,retainedMicroUsd:'29168'});
 });
});

it.each(['safe','live-lease','flag-off','unfinished-tool','reserved-tool','ambiguous-calls','retry-limit'])('interrupted model-only recovery retains operator exposure and fences old execution: %s',async scenario=>{
 await fixture(async f=>{
  let now=Date.now();const make=()=>createPrivateActionStore({db,storage:{},stateKey:f.stateKey,tenantId:f.tenantId,runId:f.runId,vaultId:f.vault.vaultId,now:()=>now,allowHostedResearchFallback:scenario!=='flag-off'});
  const original=make(),before=await original.load(),requestId=randomUUID();
  const journal={format:'drnib-checkpoint-v1',rootRequestId:requestId,current:{requestId,manifestRevision:before.row.revision,manifestDigest:before.row.digest},entries:[{kind:'terminal',state:'complete',digest:'saved',result:{value:'saved exit 0'}},{kind:scenario==='unfinished-tool'?'terminal':'infer',state:'started',digest:'lost'}],consumed:[],...(scenario==='retry-limit'?{reconciliations:[{kind:'operator-covered-interrupted-inference'},{kind:'operator-covered-interrupted-inference'}]}:{})};
  const input={requestId,digest:'interrupted-fixture',manifestId:before.row.id,manifestRevision:before.row.revision,checkpoint:journal};await original.claim(input);
  const callId=randomUUID(),call={runId:f.runId,actionId:requestId,model:'fixture/model',monthKey:new Date().toISOString().slice(0,7),status:'reserved',billingKind:'customer',costBasis:'reservation',committedMicroUsd:29168n,reservedMicroUsd:29168n};await db.privateInferenceCall.create({data:{id:callId,...call}});
  if(scenario==='ambiguous-calls')await db.privateInferenceCall.create({data:{id:randomUUID(),...call}});
  if(scenario==='reserved-tool')await db.privateToolCall.create({data:{id:randomUUID(),runId:f.runId,questionId:randomUUID(),tool:'creator_tip',request:{},requestDigest:'a'.repeat(64),manifestRevision:before.row.revision,recipientPublicKey:'fixture',recipientId:'fixture',status:'reserved',reservedMicroUsd:1000n}});
  if(scenario!=='live-lease')now+=90001;
  const recovered=await make().claim({...input,recover:true,checkpointRoot:requestId});
  const stored=await db.privateInferenceCall.findUnique({where:{id:callId}});
  if(scenario==='safe'){
   expect(recovered.recovered).toBe(true);expect(recovered.checkpoint.entries).toEqual([journal.entries[0]]);expect(recovered.checkpoint.reconciliations[0]).toMatchObject({kind:'operator-covered-interrupted-inference',callId,retainedMicroUsd:'29168'});
   expect(stored).toMatchObject({status:'uncertain-held',billingKind:'platform',costBasis:'operator-reservation',committedMicroUsd:29168n,reservedMicroUsd:29168n});await expect(original.fence()).rejects.toThrow();
   const blocked=createPrivateWorkflowAi({db,aiPort:{privateVerifiedTransport:'phala-aci-v1',infer:async()=>expect.fail('Unknown operator exposure must still count against the cap')},model:'fixture/model',monthlyCapMicroUsd:1000,inputPricePerMillion:1,outputPricePerMillion:1});
   await expect(blocked({run:{id:f.runId,userId:f.tenantId},actionId:randomUUID(),messages:[{role:'user',content:'synthetic'}]})).rejects.toThrow('PRIVATE_WORKFLOW_CAP');
   // A late verified completion may reconcile cost; it cannot become a customer debit.
   await db.privateInferenceCall.update({where:{id:callId},data:{status:'verified',committedMicroUsd:3n}});expect((await db.privateInferenceCall.findUnique({where:{id:callId}})).billingKind).toBe('platform');
  }else{expect(recovered.recovered).toBeUndefined();expect(stored.status).toBe('reserved');expect((await make().checkpoint(requestId)).entries).toEqual(journal.entries);}
 });
});
