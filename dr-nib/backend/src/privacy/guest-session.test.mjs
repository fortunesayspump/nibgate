import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {createGuestSessionManager} from './guest-session.js';
import {createPrivateDemoRunner,createCiphertextReportSink} from './private-demo.js';
import {generateHpkeRecipient,sealHpkeSource} from './source-hpke.js';
const canary='HARMLESS_SYNTHETIC_PRIVATE_CANARY';
const run={id:randomUUID(),userId:'tenant_fixture',status:'draft',metadata:{privacyMode:'confidential'}};
function manager(now=Date.now){
  const writes=[],calls=[],quotes=[];
  const runner=createPrivateDemoRunner({aiPort:{infer:async input=>{calls.push(input);return {choices:[{message:{content:`## Synthetic result\n\n${canary} [1].`}}]}}},reportSink:createCiphertextReportSink({researchReport:{create:async args=>{writes.push(args);return args.data}}})});
  const guest=createGuestSessionManager({getRun:async()=>run,runner,model:'fixture/model',now,quoteProvider:async request=>{quotes.push(request);return {attestation:'aabb',reportData:'0'.repeat(64)}}});
  return {guest,writes,calls,quotes};
}
test('guest session quote request, encrypted possession challenge and one-use execution',async()=>{
  const f=manager(),nonce=randomBytes(32),browser=await generateHpkeRecipient();
  const session=await f.guest.open({tenantId:run.userId,runId:run.id,clientNonce:nonce});
  assert.equal(f.quotes.length,1);
  assert.equal(f.quotes[0].sessionId,session.sessionId);
  assert.ok(f.quotes[0].sessionPublicKey.equals(Buffer.from(session.recipientPublicKey,'base64')));
  const sourceContext={tenantId:run.userId,runId:run.id,objectId:randomUUID(),revision:1,purpose:'source',recipientId:session.recipientId};
  const recipientPublicKey=Buffer.from(session.recipientPublicKey,'base64');
  const challenge=randomBytes(32);
  const challengeEnvelope=await sealHpkeSource({recipientPublicKey,context:{...sourceContext,objectId:randomUUID()},plaintext:challenge});
  const proof=await f.guest.prove({sessionId:session.sessionId,challengeEnvelope,tenantId:run.userId,runId:run.id});
  const digest=createHash('sha256').update('drnib-proof-v1\0').update(Buffer.from(session.sessionId.replaceAll('-',''),'hex')).update(challenge).digest('hex');
  assert.deepEqual({verified:proof.verified,recipientId:proof.recipientId,clientNonce:proof.clientNonce,sessionId:proof.sessionId,challengeDigest:proof.challengeDigest},{verified:true,recipientId:session.recipientId,clientNonce:nonce.toString('hex'),sessionId:session.sessionId,challengeDigest:digest});
  await assert.rejects(f.guest.prove({sessionId:session.sessionId,challengeEnvelope,tenantId:run.userId,runId:run.id}),{code:'PRIVATE_SESSION_UNAVAILABLE'});
  const sourceEnvelope=await sealHpkeSource({recipientPublicKey,context:sourceContext,plaintext:Buffer.from(JSON.stringify({question:'What does the note say?',title:'Synthetic note',sourceText:canary,browserPublicKey:Buffer.from(browser.publicKey).toString('base64')}))});
  const out=await f.guest.execute({sessionId:session.sessionId,sourceEnvelope,tenantId:run.userId,runId:run.id});
  assert.equal(out.encrypted,true);
  assert.equal(f.calls.length,1);assert.equal(f.writes.length,1);
  assert.ok(!JSON.stringify(f.writes).includes(canary));
  await assert.rejects(f.guest.execute({sessionId:session.sessionId,sourceEnvelope,tenantId:run.userId,runId:run.id}),{code:'PRIVATE_SESSION_UNAVAILABLE'});
});
test('guest session refuses absent proof, wrong owner and stale session before AI',async()=>{
  let clock=1000;
  const f=manager(()=>clock),nonce=randomBytes(32),browser=await generateHpkeRecipient();
  await assert.rejects(f.guest.open({tenantId:'other',runId:run.id,clientNonce:nonce}),{code:'PRIVATE_SESSION_UNAVAILABLE'});
  const session=await f.guest.open({tenantId:run.userId,runId:run.id,clientNonce:nonce});
  const context={tenantId:run.userId,runId:run.id,objectId:randomUUID(),revision:1,purpose:'source',recipientId:session.recipientId};
  const sourceEnvelope=await sealHpkeSource({recipientPublicKey:Buffer.from(session.recipientPublicKey,'base64'),context,plaintext:Buffer.from(JSON.stringify({question:'What does the note say?',title:'Synthetic note',sourceText:canary,browserPublicKey:Buffer.from(browser.publicKey).toString('base64')}))});
  await assert.rejects(f.guest.execute({sessionId:session.sessionId,sourceEnvelope,tenantId:run.userId,runId:run.id}),{code:'PRIVATE_SESSION_UNAVAILABLE'});
  assert.equal(f.calls.length,0);
  clock+=120001;
  await assert.rejects(f.guest.prove({sessionId:session.sessionId,challengeEnvelope:sourceEnvelope,tenantId:run.userId,runId:run.id}),{code:'PRIVATE_SESSION_UNAVAILABLE'});
  assert.equal(f.writes.length,0);
});
test('expired abandoned sessions release capacity and simultaneous proof has one winner',async()=>{
  let clock=1000;
  const f=manager(()=>clock),nonce=randomBytes(32);
  const first=await f.guest.open({tenantId:run.userId,runId:run.id,clientNonce:nonce});
  const key=Buffer.from(first.recipientPublicKey,'base64');
  const challengeEnvelope=await sealHpkeSource({recipientPublicKey:key,context:{tenantId:run.userId,runId:run.id,objectId:randomUUID(),revision:1,purpose:'source',recipientId:first.recipientId},plaintext:randomBytes(32)});
  const both=await Promise.allSettled([f.guest.prove({sessionId:first.sessionId,challengeEnvelope,tenantId:run.userId,runId:run.id}),f.guest.prove({sessionId:first.sessionId,challengeEnvelope,tenantId:run.userId,runId:run.id})]);
  assert.equal(both.filter(x=>x.status==='fulfilled').length,1);
  for(let i=1;i<64;i++)await f.guest.open({tenantId:run.userId,runId:run.id,clientNonce:randomBytes(32)});
  await assert.rejects(f.guest.open({tenantId:run.userId,runId:run.id,clientNonce:randomBytes(32)}),{code:'PRIVATE_SESSION_UNAVAILABLE'});
  clock+=120001;
  const after=await f.guest.open({tenantId:run.userId,runId:run.id,clientNonce:randomBytes(32)});
  assert.ok(after.sessionId);
});
test('pending concurrent opens reserve capacity before asynchronous run lookup',async()=>{
  let release;
  const gate=new Promise(resolve=>{release=resolve});
  const guest=createGuestSessionManager({getRun:async()=>{await gate;return run},runner:{execute:async()=>({})},model:'fixture/model',quoteProvider:async()=>({attestation:'aabb'})});
  const attempts=Array.from({length:65},()=>guest.open({tenantId:run.userId,runId:run.id,clientNonce:randomBytes(32)}));
  release();
  const results=await Promise.allSettled(attempts);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,64);
  assert.equal(results.filter(x=>x.status==='rejected').length,1);
});
test('authenticated tenant and run must match session on prove and execute',async()=>{
  const f=manager(),session=await f.guest.open({tenantId:run.userId,runId:run.id,clientNonce:randomBytes(32)});
  const challengeEnvelope=await sealHpkeSource({recipientPublicKey:Buffer.from(session.recipientPublicKey,'base64'),context:{tenantId:run.userId,runId:run.id,objectId:randomUUID(),revision:1,purpose:'source',recipientId:session.recipientId},plaintext:randomBytes(32)});
  for(const identity of [{tenantId:'other_tenant',runId:run.id},{tenantId:run.userId,runId:randomUUID()}]){
    await assert.rejects(f.guest.prove({sessionId:session.sessionId,challengeEnvelope,...identity}),{code:'PRIVATE_SESSION_UNAVAILABLE'});
    await assert.rejects(f.guest.execute({sessionId:session.sessionId,sourceEnvelope:challengeEnvelope,...identity}),{code:'PRIVATE_SESSION_UNAVAILABLE'});
  }
  assert.equal(f.calls.length,0);
  assert.equal(f.writes.length,0);
});

test('journaled session claims before model and completes once',async()=>{
  const order=[],receipt={id:randomUUID(),version:1,encrypted:true};
  const journal={claim:async()=>{order.push('claim');return {state:'start'}},complete:async()=>{order.push('complete');return {state:'complete',reportId:receipt.id}}};
  const guest=createGuestSessionManager({getRun:async()=>run,runner:{execute:async()=>{order.push('model');return receipt}},
    model:'fixture/model',executionJournal:journal,quoteProvider:async()=>({attestation:'aabb'})});
  const session=await guest.open({tenantId:run.userId,runId:run.id,clientNonce:randomBytes(32)});
  const key=Buffer.from(session.recipientPublicKey,'base64');
  const context={tenantId:run.userId,runId:run.id,objectId:randomUUID(),revision:1,purpose:'source',recipientId:session.recipientId};
  const challenge=await sealHpkeSource({recipientPublicKey:key,context,plaintext:randomBytes(32)});
  await guest.prove({sessionId:session.sessionId,challengeEnvelope:challenge,tenantId:run.userId,runId:run.id});
  const sourceEnvelope=await sealHpkeSource({recipientPublicKey:key,context:{...context,objectId:randomUUID()},plaintext:Buffer.from(canary)});
  assert.deepEqual(await guest.execute({sessionId:session.sessionId,sourceEnvelope,tenantId:run.userId,runId:run.id}),receipt);
  assert.deepEqual(order,['claim','model','complete']);
});

test('journaled duplicate/uncertain decision never enters the model',async()=>{
  let models=0;
  const guest=createGuestSessionManager({getRun:async()=>run,runner:{execute:async()=>{models++;return {}}},
    model:'fixture/model',executionJournal:{claim:async()=>({state:'uncertain'}),complete:async()=>{throw Error('should not complete')}},quoteProvider:async()=>({attestation:'aabb'})});
  const session=await guest.open({tenantId:run.userId,runId:run.id,clientNonce:randomBytes(32)});
  const key=Buffer.from(session.recipientPublicKey,'base64');
  const context={tenantId:run.userId,runId:run.id,objectId:randomUUID(),revision:1,purpose:'source',recipientId:session.recipientId};
  await guest.prove({sessionId:session.sessionId,challengeEnvelope:await sealHpkeSource({recipientPublicKey:key,context,plaintext:randomBytes(32)}),tenantId:run.userId,runId:run.id});
  const out=await guest.execute({sessionId:session.sessionId,sourceEnvelope:await sealHpkeSource({recipientPublicKey:key,context:{...context,objectId:randomUUID()},plaintext:Buffer.from(canary)}),tenantId:run.userId,runId:run.id});
  assert.deepEqual(out,{state:'uncertain',runId:run.id});
  assert.equal(models,0);
});

test('full execute claims both ciphertext envelopes before entering protected runner',async()=>{
  const order=[],receipt={id:run.id,version:1,encrypted:true};
  const journal={claim:async args=>{order.push('claim');assert.ok(args.sourceEnvelope);assert.ok(args.keyEnvelope);return {state:'start'}},
    complete:async args=>{order.push('complete');assert.equal(args.receipt.id,run.id);assert.ok(args.keyEnvelope);return {state:'complete',reportId:run.id}}};
  const guest=createGuestSessionManager({getRun:async()=>run,runner:{execute:async()=>{throw Error('ordinary runner must not run')},
    executeFull:async args=>{order.push('full');assert.equal(args.sessionId,session.sessionId);assert.equal(args.keyEnvelope.context.recipientId,session.recipientId);return receipt}},
    model:'fixture/model',executionJournal:journal,quoteProvider:async()=>({attestation:'aabb'})});
  const session=await guest.open({tenantId:run.userId,runId:run.id,clientNonce:randomBytes(32)});
  const publicKey=Buffer.from(session.recipientPublicKey,'base64');
  const context={tenantId:run.userId,runId:run.id,objectId:randomUUID(),revision:1,purpose:'source',recipientId:session.recipientId};
  await guest.prove({sessionId:session.sessionId,challengeEnvelope:await sealHpkeSource({recipientPublicKey:publicKey,context,plaintext:randomBytes(32)}),tenantId:run.userId,runId:run.id});
  const sourceEnvelope=await sealHpkeSource({recipientPublicKey:publicKey,context:{...context,objectId:randomUUID()},plaintext:Buffer.from(canary)});
  const keyEnvelope=await sealHpkeSource({recipientPublicKey:publicKey,context:{...context,objectId:randomUUID()},plaintext:Buffer.from('synthetic key envelope')});
  assert.deepEqual(await guest.executeFull({sessionId:session.sessionId,sourceEnvelope,keyEnvelope,tenantId:run.userId,runId:run.id}),receipt);
  assert.deepEqual(order,['claim','full','complete']);
  await assert.rejects(guest.executeFull({sessionId:session.sessionId,sourceEnvelope,keyEnvelope,tenantId:run.userId,runId:run.id}),{code:'PRIVATE_SESSION_UNAVAILABLE'});
});

test('attestation-only session for completed private run can prove key but cannot rerun paid work',async()=>{
  const completed={...run,status:'complete'};
  const guest=createGuestSessionManager({getRun:async()=>completed,runner:{execute:async()=>assert.fail('must not rerun')},
    model:'fixture/model',quoteProvider:async()=>({attestation:'aabb'})});
  const opened=await guest.open({tenantId:completed.userId,runId:completed.id,clientNonce:randomBytes(32)});
  const context={tenantId:completed.userId,runId:completed.id,objectId:randomUUID(),revision:1,
    purpose:'source',recipientId:opened.recipientId};
  const envelope=await sealHpkeSource({recipientPublicKey:Buffer.from(opened.recipientPublicKey,'base64'),
    context,plaintext:randomBytes(32)});
  assert.equal((await guest.prove({sessionId:opened.sessionId,challengeEnvelope:envelope,
    tenantId:completed.userId,runId:completed.id})).verified,true);
  await assert.rejects(guest.execute({sessionId:opened.sessionId,sourceEnvelope:envelope,
    tenantId:completed.userId,runId:completed.id}),{code:'PRIVATE_SESSION_UNAVAILABLE'});
});
