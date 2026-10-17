import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPrivateExecuteJournal,privateExecuteDigest} from './private-execute-journal.js';
import {generateHpkeRecipient,sealHpkeSource,sealHpkeReport} from './source-hpke.js';

const RUN='11111111-1111-4111-8111-111111111111';
const TENANT='tenant-test';
const CANARY='HARMLESS_SYNTHETIC_PRIVATE_CANARY';
async function source(plaintext=CANARY){
 const guest=await generateHpkeRecipient();
 return sealHpkeSource({recipientPublicKey:guest.publicKey,context:{tenantId:TENANT,runId:RUN,objectId:randomUUID(),revision:1,purpose:'source',recipientId:guest.recipientId},plaintext:new TextEncoder().encode(plaintext)});
}
async function report(id=randomUUID()){
 const browser=await generateHpkeRecipient();
 const envelope=await sealHpkeReport({recipientPublicKey:browser.publicKey,context:{tenantId:TENANT,runId:RUN,objectId:id,revision:1,purpose:'report',recipientId:browser.recipientId},plaintext:new TextEncoder().encode(CANARY)});
 return {id,runId:RUN,version:1,markdown:JSON.stringify({encrypted:true,format:'hpke-report-v2',envelope}),citations:[]};
}
async function fullEnvelopes(){
 const guest=await generateHpkeRecipient();
 const seal=(plaintext)=>sealHpkeSource({recipientPublicKey:guest.publicKey,
  context:{tenantId:TENANT,runId:RUN,objectId:randomUUID(),revision:1,purpose:'source',recipientId:guest.recipientId},
  plaintext:Buffer.from(plaintext)});
 return {sourceEnvelope:await seal(`source ${CANARY}`),keyEnvelope:await seal('synthetic 32-byte state key only')};
}
function fixture(){
 const rows=[],reports=[];
 let clock=1_000_000,chain=Promise.resolve(),deletedAt=null,runStatus='draft';
 const tx={
  researchRun:{findUnique:async()=>({id:RUN,userId:TENANT,status:runStatus,deletedAt,metadata:{privacyMode:'confidential'}})},
  researchStep:{
   findFirst:async()=>rows[0]||null,
   create:async({data})=>{const row={id:randomUUID(),createdAt:new Date(clock),...data};rows.push(row);return row},
   update:async({where,data})=>{const row=rows.find(x=>x.id===where.id);Object.assign(row,data);return row},
  },
  researchReport:{findFirst:async({where})=>reports.find(r=>r.runId===where.runId&&r.version===where.version)||null},
 };
 const withRunLock=async(_id,fn)=>{const previous=chain;let release;chain=new Promise(r=>release=r);await previous;try{return await fn(tx)}finally{release()}};
 return {journal:createPrivateExecuteJournal({withRunLock,now:()=>clock}),rows,reports,setClock:v=>{clock=v},setDeleted:v=>{deletedAt=v},setStatus:v=>{runStatus=v},tx};
}

test('journal claims once before a model call; same ciphertext retry never starts twice',async()=>{
 const f=fixture(),sourceEnvelope=await source();
 const results=await Promise.all(Array.from({length:5},()=>f.journal.claim({tenantId:TENANT,runId:RUN,sourceEnvelope})));
 assert.equal(results.filter(x=>x.state==='start').length,1);
 assert.equal(results.filter(x=>x.state==='processing').length,4);
 assert.equal(f.rows.length,1);
 assert.equal(JSON.stringify(f.rows).includes(CANARY),false);
 assert.equal(f.rows[0].input.requestDigest,privateExecuteDigest(sourceEnvelope,{tenantId:TENANT,runId:RUN}));
});

test('different ciphertext for same run conflicts and never starts',async()=>{
 const f=fixture(),a=await source('one'),b=await source('two');
 assert.equal((await f.journal.claim({tenantId:TENANT,runId:RUN,sourceEnvelope:a})).state,'start');
 await assert.rejects(f.journal.claim({tenantId:TENANT,runId:RUN,sourceEnvelope:b}),e=>e.code==='PRIVATE_JOB_CONFLICT');
 assert.equal(f.rows.length,1);
});

test('full-worker journal binds both distinct HPKE envelopes to one paid claim',async()=>{
 const f=fixture(),{sourceEnvelope,keyEnvelope}=await fullEnvelopes();
 const args={tenantId:TENANT,runId:RUN,sourceEnvelope,keyEnvelope};
 assert.notEqual(privateExecuteDigest(sourceEnvelope,args),privateExecuteDigest(sourceEnvelope,{tenantId:TENANT,runId:RUN}));
 assert.equal((await f.journal.claim(args)).state,'start');
 assert.equal((await f.journal.claim(args)).state,'processing');
 const changed={...keyEnvelope,ciphertext:keyEnvelope.ciphertext.slice(0,-4)+'AAAA'};
 await assert.rejects(f.journal.claim({...args,keyEnvelope:changed}),e=>e.code==='PRIVATE_JOB_CONFLICT');
 await assert.rejects(f.journal.claim({...args,keyEnvelope:sourceEnvelope}),e=>e.code==='PRIVATE_JOB_INVALID');
 const other=(await fullEnvelopes()).keyEnvelope;
 await assert.rejects(f.journal.claim({...args,keyEnvelope:other}),e=>e.code==='PRIVATE_JOB_INVALID');
 assert.equal(f.rows.length,1);
 assert.equal(JSON.stringify(f.rows).includes(CANARY),false);
});

test('full-worker lost response reconciles only an atomically completed run and stable run report ID',async()=>{
 const f=fixture(),{sourceEnvelope,keyEnvelope}=await fullEnvelopes();
 const args={tenantId:TENANT,runId:RUN,sourceEnvelope,keyEnvelope};
 assert.equal((await f.journal.claim(args)).state,'start');
 const sealed=await report(RUN);f.reports.push(sealed);
 assert.deepEqual(await f.journal.status({tenantId:TENANT,runId:RUN}),{state:'processing'});
 await assert.rejects(f.journal.complete({...args,receipt:{id:RUN,version:1,encrypted:true}}),e=>e.code==='PRIVATE_JOB_UNAVAILABLE');
 f.setStatus('complete');
 assert.deepEqual(await f.journal.status({tenantId:TENANT,runId:RUN}),{state:'complete',reportId:RUN});
 assert.deepEqual(await f.journal.claim(args),{state:'complete',reportId:RUN});
 assert.equal(f.rows[0].status,'done');
});

test('lost response after report save reconciles the sealed report without another model call',async()=>{
 const f=fixture(),sourceEnvelope=await source();
 await f.journal.claim({tenantId:TENANT,runId:RUN,sourceEnvelope});
 const sealed=await report();f.reports.push(sealed);
 const status=await f.journal.status({tenantId:TENANT,runId:RUN});
 assert.deepEqual(status,{state:'complete',reportId:sealed.id});
 assert.deepEqual(await f.journal.claim({tenantId:TENANT,runId:RUN,sourceEnvelope}),status);
 assert.equal(f.rows.length,1);
 assert.equal(JSON.stringify(f.rows).includes(CANARY),false);
});

test('complete is idempotent only for same source request and sealed report',async()=>{
 const f=fixture(),sourceEnvelope=await source();
 await f.journal.claim({tenantId:TENANT,runId:RUN,sourceEnvelope});
 const sealed=await report();f.reports.push(sealed);
 const receipt={id:sealed.id,version:1,encrypted:true};
 assert.deepEqual(await f.journal.complete({tenantId:TENANT,runId:RUN,sourceEnvelope,receipt}),{state:'complete',reportId:sealed.id});
 assert.deepEqual(await f.journal.complete({tenantId:TENANT,runId:RUN,sourceEnvelope,receipt}),{state:'complete',reportId:sealed.id});
 await assert.rejects(f.journal.complete({tenantId:TENANT,runId:RUN,sourceEnvelope,receipt:{...receipt,id:randomUUID()}}),e=>e.code==='PRIVATE_JOB_CONFLICT');
});

test('missing report or expired lease is uncertain and cannot auto-restart inference',async()=>{
 const f=fixture(),sourceEnvelope=await source();
 assert.deepEqual(await f.journal.status({tenantId:TENANT,runId:RUN}),{state:'not_started'});
 await f.journal.claim({tenantId:TENANT,runId:RUN,sourceEnvelope});
 f.setClock(1_000_000+6*60*1000);
 assert.deepEqual(await f.journal.status({tenantId:TENANT,runId:RUN}),{state:'uncertain'});
 assert.deepEqual(await f.journal.claim({tenantId:TENANT,runId:RUN,sourceEnvelope}),{state:'uncertain'});
 assert.equal(f.rows.length,1);
});

test('cross-tenant, legacy classification and bad report cannot produce a receipt',async()=>{
 const f=fixture(),sourceEnvelope=await source();
 await assert.rejects(f.journal.claim({tenantId:'other',runId:RUN,sourceEnvelope}),e=>e.code==='PRIVATE_JOB_INVALID');
 await f.journal.claim({tenantId:TENANT,runId:RUN,sourceEnvelope});
 await assert.rejects(f.journal.status({tenantId:'other',runId:RUN}),e=>e.code==='PRIVATE_JOB_UNAVAILABLE');
 const sealed=await report();sealed.markdown=CANARY;f.reports.push(sealed);
 assert.deepEqual(await f.journal.status({tenantId:TENANT,runId:RUN}),{state:'processing'});
 assert.equal(JSON.stringify(f.rows).includes(CANARY),false);
 f.tx.researchRun.findUnique=async()=>({id:RUN,userId:TENANT,metadata:{privacyMode:'legacy'}});
 await assert.rejects(f.journal.status({tenantId:TENANT,runId:RUN}),e=>e.code==='PRIVATE_JOB_UNAVAILABLE');
});

test('a sealed report predating the journal claim is not misattributed to new ciphertext',async()=>{
 const f=fixture(),sourceEnvelope=await source();
 f.reports.push(await report());
 await assert.rejects(f.journal.claim({tenantId:TENANT,runId:RUN,sourceEnvelope}),e=>e.code==='PRIVATE_JOB_CONFLICT');
 assert.equal(f.rows.length,0);
});

test('malicious dynamic envelope field cannot leak a canary in an error',async()=>{
 const f=fixture(),sourceEnvelope=await source();
 Object.defineProperty(sourceEnvelope,'ciphertext',{get(){throw new Error(CANARY)}});
 await assert.rejects(f.journal.claim({tenantId:TENANT,runId:RUN,sourceEnvelope}),e=>e.message==='PRIVATE_JOB_INVALID'&&!e.message.includes(CANARY));
 assert.equal(f.rows.length,0);
});

test('deleted run cannot start or report a private paid job',async()=>{
 const f=fixture(),sourceEnvelope=await source();
 f.setDeleted(new Date());
 await assert.rejects(f.journal.claim({tenantId:TENANT,runId:RUN,sourceEnvelope}),e=>e.code==='PRIVATE_JOB_UNAVAILABLE');
 await assert.rejects(f.journal.status({tenantId:TENANT,runId:RUN}),e=>e.code==='PRIVATE_JOB_UNAVAILABLE');
 assert.equal(f.rows.length,0);
});

test('terminal or unknown run status cannot start an inference job',async()=>{
 for(const state of ['ended','complete','failed','unknown']){
  const f=fixture(),sourceEnvelope=await source();
  f.setStatus(state);
  await assert.rejects(f.journal.claim({tenantId:TENANT,runId:RUN,sourceEnvelope}),e=>e.code==='PRIVATE_JOB_UNAVAILABLE');
  assert.equal(f.rows.length,0);
 }
});
