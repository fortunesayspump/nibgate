import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {createPrivatePlanSessionJob,createPrivateSourceOnlySessionJob} from './private-plan-session.js';
import {generateHpkeRecipient,sealHpkeSource,openHpkeReport} from './source-hpke.js';
import {createGuestSessionManager} from './guest-session.js';
import {createPrivateExecuteJournal} from './private-execute-journal.js';

const CANARY='HARMLESS_SYNTHETIC_PRIVATE_CANARY';
function fixture(){
  const run={id:randomUUID(),userId:'synthetic_tenant',metadata:{privacyMode:'confidential',schemaVersion:1},
    title:null,description:null,brief:{encrypted:true},plan:null,pendingQuestion:null,pendingGuidance:null,
    deletedAt:null,status:'draft',versions:1,depth:'standard'};
  const rows={objects:[],steps:[],events:[],reports:[]},writes=[];
  let chain=Promise.resolve();
  const matches=(row,where)=>Object.entries(where||{}).every(([k,v])=>row[k]===v);
  const db={
    $queryRaw:async()=>[{locked:'1'}],
    $transaction:fn=>{
      const result=chain.then(async()=>{
        const snapshot=structuredClone({...rows,run});
        try{return await fn(db);}catch(error){Object.assign(rows,snapshot);Object.assign(run,snapshot.run);throw error;}
      });
      chain=result.catch(()=>{});return result;
    },
    researchRun:{findUnique:async({where})=>where.id===run.id?run:null,
      update:async({where,data})=>{assert.equal(where.id,run.id);writes.push({model:'run',data});Object.assign(run,data);return run;}},
    privateWorkerObject:{
      create:async({data})=>{writes.push({model:'object',data});rows.objects.push(data);return data;},
      findUnique:async({where})=>rows.objects.find(x=>matches(x,where.runId_kind_objectId_revision))||null,
      findFirst:async({where})=>rows.objects.filter(x=>matches(x,where)).sort((a,b)=>b.revision-a.revision)[0]||null,
      findMany:async({where})=>rows.objects.filter(x=>matches(x,where)).sort((a,b)=>a.objectId.localeCompare(b.objectId)||b.revision-a.revision),
    },
    researchStep:{
      create:async({data})=>{const row={id:data.id||randomUUID(),...data};writes.push({model:'step',data:row});rows.steps.push(row);return row;},
      findUnique:async({where})=>rows.steps.find(x=>x.id===where.id)||null,
      findFirst:async({where})=>rows.steps.find(x=>matches(x,where))||null,
      findMany:async({where})=>rows.steps.filter(x=>matches(x,where)),
      count:async({where})=>rows.steps.filter(x=>matches(x,where)).length,
      update:async({where,data})=>{writes.push({model:'step',data});const row=rows.steps.find(x=>x.id===where.id);Object.assign(row,data);return row;},
    },
    researchEvent:{
      create:async({data})=>{writes.push({model:'event',data});rows.events.push(data);return data;},
      findFirst:async()=>rows.events.at(-1)||null,
      findMany:async({where,take})=>rows.events.filter(x=>x.runId===where.runId&&x.seq>where.seq.gt).slice(0,take),
      findUnique:async({where})=>rows.events.find(x=>x.runId===where.runId_seq.runId&&x.seq===where.runId_seq.seq)||null,
    },
    researchReport:{
      create:async({data})=>{writes.push({model:'report',data});rows.reports.push(data);return data;},
      findFirst:async({where})=>rows.reports.find(x=>x.runId===where.runId&&x.version===where.version)||null,
    },
  };
  return {run,rows,writes,db};
}
async function input(f,{key=randomBytes(32),sessionId=randomUUID(),sourceId=randomUUID(),file=false,badBrowserKey=false}={}){
  const guest=await generateHpkeRecipient();
  const base={tenantId:f.run.userId,runId:f.run.id,revision:1,purpose:'source',recipientId:guest.recipientId};
  const browser=await generateHpkeRecipient();
  const browserPublicKey=badBrowserKey?Buffer.from([4,...Array(64).fill(0)]).toString('base64'):Buffer.from(browser.publicKey).toString('base64');
  const sourcePayload=file?{browserPublicKey,
    fileBase64:Buffer.from(`Synthetic content: ${CANARY}`).toString('base64'),fileName:'statement.txt',
    question:`Analyze ${CANARY}`,title:'Statement'}:
    {browserPublicKey,question:`Analyze ${CANARY}`,
      sourceText:`Late section ${CANARY}`,title:'Statement'};
  const sourceEnvelope=await sealHpkeSource({recipientPublicKey:guest.publicKey,
    context:{...base,objectId:sourceId},plaintext:Buffer.from(JSON.stringify(sourcePayload))});
  const keyEnvelope=await sealHpkeSource({recipientPublicKey:guest.publicKey,
    context:{...base,objectId:randomUUID()},plaintext:Buffer.from(JSON.stringify({format:'drnib-worker-key-v1',sessionId,stateKeyBase64:key.toString('base64')}))});
  return {run:f.run,sessionId,sourceEnvelope,keyEnvelope,guestPrivateKey:guest.privateKey,guestPublicKey:guest.publicKey,key,sourceId,browser};
}
function completion(){return {choices:[{message:{content:JSON.stringify({sub_questions:[`Check ${CANARY}`],uncertainties:[],estimate:{sources:1,rationale:'Use supplied file.'}})}}]};}

test('HPKE-delivered state key calls actual sealed plan stage with no plaintext DB writes or response',async()=>{
  const f=fixture(),i=await input(f);let calls=0;
  const job=createPrivatePlanSessionJob({db:f.db,model:'approved-model',aiPort:{privateVerifiedTransport:'phala-aci-v1',infer:async({messages})=>{
    calls++;assert.ok(JSON.stringify(messages).includes(CANARY));return completion();}}});
  const result=await job.run(i);
  assert.deepEqual(result,{state:'planned',runId:f.run.id});
  assert.equal(f.run.status,'planned');assert.equal(calls,1);
  assert.deepEqual(f.rows.objects.map(x=>x.kind),['state','source','step','state']);
  assert.equal(f.rows.steps[0].status,'done');
  assert.equal(JSON.stringify(f.writes).includes(CANARY),false);
  assert.equal(JSON.stringify(f.rows).includes(CANARY),false);
  assert.deepEqual(await job.run(i),result);
  assert.equal(calls,1);
});

test('file parsing stays in guest, and bad key/session or truncated parse prevents model call',async()=>{
  const f=fixture(),i=await input(f,{file:true});let parses=0,calls=0;
  const make=truncated=>createPrivatePlanSessionJob({db:f.db,model:'approved-model',
    parseDocument:async(name,bytes)=>{parses++;assert.equal(name,'statement.txt');assert.ok(bytes.toString().includes(CANARY));return {text:bytes.toString(),truncated};},
    aiPort:{privateVerifiedTransport:'phala-aci-v1',infer:async()=>{calls++;return completion();}}});
  await assert.rejects(make(true).run(i),/PRIVATE_PLAN_SESSION_UNAVAILABLE/);
  assert.equal(calls,0);assert.equal(f.rows.objects.length,0);
  await assert.rejects(make(false).run({...i,sessionId:randomUUID()}),/PRIVATE_PLAN_SESSION_UNAVAILABLE/);
  assert.equal(calls,0);assert.equal(f.rows.objects.length,0);
  assert.deepEqual(await make(false).run(i),{state:'planned',runId:f.run.id});
  assert.equal(calls,1);assert.equal(parses,3);
});

test('off-curve browser report key is rejected before any paid planning call',async()=>{
  const f=fixture(),i=await input(f,{badBrowserKey:true});let calls=0;
  const job=createPrivatePlanSessionJob({db:f.db,model:'approved-model',aiPort:{privateVerifiedTransport:'phala-aci-v1',infer:async()=>{calls++;return completion();}}});
  await assert.rejects(job.run(i),/PRIVATE_PLAN_SESSION_UNAVAILABLE/);
  assert.equal(calls,0);assert.equal(f.rows.objects.length,0);
});

test('actual plan and short writer atomically complete with an HPKE report and no plaintext DB',async()=>{
  const f=fixture(),i=await input(f);let calls=0;
  const markdown=Array.from({length:180},(_,n)=>n===90?CANARY:`verified${n}`).join(' ');
  const job=createPrivateSourceOnlySessionJob({db:f.db,model:'approved-model',
    aiPort:{privateVerifiedTransport:'phala-aci-v1',infer:async()=>{calls++;return calls===1?completion():{choices:[{message:{content:markdown}}]};}}});
  const receipt=await job.run(i);
  assert.deepEqual(receipt,{id:f.run.id,version:1,encrypted:true});
  assert.equal(calls,2);assert.equal(f.run.status,'complete');
  assert.deepEqual(f.rows.steps.map(x=>x.kind),['plan','write']);
  assert.equal(f.rows.objects.filter(x=>x.kind==='report').length,1);
  assert.equal(f.rows.reports.length,1);
  assert.equal(JSON.stringify(f.writes).includes(CANARY),false);
  assert.equal(JSON.stringify(f.rows).includes(CANARY),false);
  assert.equal(JSON.stringify(f.rows.reports).includes(CANARY),false);
  const envelope=JSON.parse(f.rows.reports[0].markdown).envelope;
  const plain=await openHpkeReport({recipientPrivateKey:i.browser.privateKey,
    expectedContext:envelope.context,envelope});
  assert.equal(JSON.parse(new TextDecoder().decode(plain)).markdown.includes(CANARY),true);
});

test('guest journals both envelopes, then lost response after atomic report commit recovers without re-inference',async()=>{
  const f=fixture(),browser=await generateHpkeRecipient(),stateKey=randomBytes(32),nonce=randomBytes(32);
  let calls=0;
  const markdown=Array.from({length:180},(_,n)=>n===120?CANARY:`fact${n}`).join(' ');
  const fullJob=createPrivateSourceOnlySessionJob({db:f.db,model:'approved-model',
    aiPort:{privateVerifiedTransport:'phala-aci-v1',infer:async()=>++calls===1?completion():{choices:[{message:{content:markdown}}]}}});
  const durable=createPrivateExecuteJournal({withRunLock:(_id,fn)=>f.db.$transaction(fn)});
  const journal={claim:args=>durable.claim(args),status:args=>durable.status(args),
    complete:async()=>{throw new Error('SYNTHETIC_LOST_RESPONSE_AFTER_REPORT_COMMIT')}};
  const sessions=createGuestSessionManager({getRun:async()=>f.run,
    runner:{execute:async()=>{throw Error('ordinary path must not run')},executeFull:job=>fullJob.run(job)},
    executionJournal:journal,model:'approved-model',quoteProvider:async()=>({attestation:'aabb'})});
  const opened=await sessions.open({tenantId:f.run.userId,runId:f.run.id,clientNonce:nonce});
  const publicKey=Buffer.from(opened.recipientPublicKey,'base64');
  const context={tenantId:f.run.userId,runId:f.run.id,revision:1,purpose:'source',recipientId:opened.recipientId};
  const challenge=randomBytes(32);
  const challengeEnvelope=await sealHpkeSource({recipientPublicKey:publicKey,context:{...context,objectId:randomUUID()},plaintext:challenge});
  const proof=await sessions.prove({sessionId:opened.sessionId,challengeEnvelope,tenantId:f.run.userId,runId:f.run.id});
  const expected=createHash('sha256').update('drnib-proof-v1\0').update(Buffer.from(opened.sessionId.replaceAll('-',''),'hex')).update(challenge).digest('hex');
  assert.equal(proof.challengeDigest,expected);
  const sourceEnvelope=await sealHpkeSource({recipientPublicKey:publicKey,context:{...context,objectId:randomUUID()},
    plaintext:Buffer.from(JSON.stringify({browserPublicKey:Buffer.from(browser.publicKey).toString('base64'),
      question:`Analyze ${CANARY}`,sourceText:`Synthetic statement with late passage ${CANARY}`,title:'Statement'}))});
  const keyEnvelope=await sealHpkeSource({recipientPublicKey:publicKey,context:{...context,objectId:randomUUID()},
    plaintext:Buffer.from(JSON.stringify({format:'drnib-worker-key-v1',sessionId:opened.sessionId,stateKeyBase64:stateKey.toString('base64')}))});
  await assert.rejects(sessions.executeFull({sessionId:opened.sessionId,sourceEnvelope,keyEnvelope,
    tenantId:f.run.userId,runId:f.run.id}),e=>e.code==='PRIVATE_SESSION_UNAVAILABLE'&&!e.message.includes('SYNTHETIC_LOST'));
  assert.equal(calls,2);assert.equal(f.run.status,'complete');
  assert.deepEqual(await durable.status({tenantId:f.run.userId,runId:f.run.id}),{state:'complete',reportId:f.run.id});
  const external=f.rows.reports[0];
  const envelope=JSON.parse(external.markdown).envelope;
  const plain=await openHpkeReport({recipientPrivateKey:browser.privateKey,expectedContext:envelope.context,envelope});
  assert.ok(JSON.parse(new TextDecoder().decode(plain)).markdown.includes(CANARY));
  assert.ok(!JSON.stringify(f.writes).includes(CANARY));
  assert.ok(!JSON.stringify(f.rows).includes(CANARY));
  await assert.rejects(sessions.executeFull({sessionId:opened.sessionId,sourceEnvelope,keyEnvelope,tenantId:f.run.userId,runId:f.run.id}),
    {code:'PRIVATE_SESSION_UNAVAILABLE'});
  assert.equal(calls,2);
});

test('private provider exception cannot reach ordinary console, DB writes or response text',async()=>{
  const f=fixture(),i=await input(f),logged=[];
  const prior={log:console.log,error:console.error,warn:console.warn};
  for(const level of Object.keys(prior))console[level]=(...args)=>logged.push([level,...args]);
  try{
    const job=createPrivateSourceOnlySessionJob({db:f.db,model:'approved-model',
      aiPort:{privateVerifiedTransport:'phala-aci-v1',infer:async()=>{throw new Error(CANARY)}}});
    await assert.rejects(job.run(i),e=>e.message==='PRIVATE_PLAN_SESSION_UNAVAILABLE'&&!e.message.includes(CANARY));
  }finally{Object.assign(console,prior)}
  assert.equal(logged.length,0);
  assert.equal(JSON.stringify(f.writes).includes(CANARY),false);
});
