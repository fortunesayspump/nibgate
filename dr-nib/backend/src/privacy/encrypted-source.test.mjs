import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createEncryptedSourceAdapter } from './encrypted-source.js';
import { verifyRecipientForPrivateSource } from './attestation.js';
import {generateFixtureRecipient,sealHpkeSource} from './source-hpke.js';

const run={id:'fb9b08ec-a94b-4ab1-b552-099cf5c8362d',userId:'owner_fixture'};
const objectId='0f4f6110-844b-477d-9dd0-9ba2ecb3c46b';
const canary='HARMLESS_SYNTHETIC_PRIVATE_CANARY';
const nonce=randomBytes(32).toString('base64');
const recipient=await generateFixtureRecipient();
const fixtureEnvelope=await sealHpkeSource({recipientPublicKey:recipient.publicKey,context:{tenantId:run.userId,runId:run.id,objectId,revision:1,purpose:'source',recipientId:recipient.recipientId},plaintext:Buffer.from(canary)});
function envelope(){return structuredClone(fixtureEnvelope)}
const fixtureVerdict=async({expectedContext,clientNonce})=>({verified:true,keyPossessionVerified:true,debugEnabled:false,operatorAccess:false,tenantId:expectedContext.tenantId,runId:expectedContext.runId,objectId:expectedContext.objectId,recipientId:expectedContext.recipientId,clientNonce,imageDigest:'a'.repeat(64),policyDigest:'b'.repeat(64)});
function fixturePort(verifyRecipient=fixtureVerdict) {
  const writes=[], rows=[], deletes=[];
  const port=createEncryptedSourceAdapter({verifyRecipient,storage:{put:async(key,body)=>writes.push([key,body]),remove:async(key)=>deletes.push(key)},repository:{create:async(_run,item)=>rows.push(item)}});
  return {port,writes,rows,deletes};
}

test('existing-worker encrypted intake stores only sealed bytes and metadata',async()=>{
  const f=fixturePort();
  const result=await f.port.attach(run,envelope(),'fixture-evidence','fixture-key-proof',nonce);
  assert.equal(result.encrypted,true);
  assert.equal(f.writes.length,1);assert.equal(f.rows.length,1);
  assert.equal(f.writes[0][1].includes(canary),false);
  assert.equal(JSON.stringify(f.rows).includes(canary),false);
  assert.match(f.rows[0].key,new RegExp(`^sealed/${run.id}/${objectId}/[0-9a-f-]+$`));
});
test('real verifier fails closed before R2 or DB writes',async()=>{
  const f=fixturePort(verifyRecipientForPrivateSource);
  await assert.rejects(f.port.attach(run,envelope(),'fixture-evidence','fixture-key-proof',nonce),{code:'CONFIDENTIAL_BOUNDARY_UNAVAILABLE'});
  assert.equal(f.writes.length,0);assert.equal(f.rows.length,0);
});
test('unknown fields, wrong tenant, recipient and malformed base64 are rejected before storage',async()=>{
  for (const change of [
    e=>{e.plaintext=canary},
    e=>{e.context.tenantId='another_owner'},
    e=>{e.context.recipientId='?'},
    e=>{e.encapsulatedSecret='!!!!'},
    e=>{e.context.purpose='report'},
  ]) {
    const f=fixturePort();const e=envelope();change(e);
    await assert.rejects(f.port.attach(run,e,'fixture-evidence','fixture-key-proof',nonce));
    assert.equal(f.writes.length,0);assert.equal(f.rows.length,0);
  }
});
test('repository failure removes the object',async()=>{
  const deletes=[];
  const port=createEncryptedSourceAdapter({verifyRecipient:fixtureVerdict,storage:{put:async()=>{},remove:async(k)=>deletes.push(k)},repository:{create:async()=>{throw new Error('db down')}}});
  await assert.rejects(port.attach(run,envelope(),'fixture-evidence','fixture-key-proof',nonce),/db down/);
  assert.equal(deletes.length,1);
  assert.match(deletes[0],new RegExp(`^sealed/${run.id}/${objectId}/[0-9a-f-]+$`));
});
test('negative, malformed or misbound verdict cannot reach storage',async()=>{
  for (const verify of [async()=>false,async()=>({verified:false}),async(req)=>({...await fixtureVerdict(req),recipientId:'different'}),async(req)=>({...await fixtureVerdict(req),keyPossessionVerified:false})]) {
    const f=fixturePort(verify);
    await assert.rejects(f.port.attach(run,envelope(),'fixture-evidence','fixture-key-proof',nonce),/unapproved attestation verdict/);
    assert.equal(f.writes.length,0);assert.equal(f.rows.length,0);
  }
});
test('missing key-possession proof or client nonce never invokes verifier',async()=>{
  let verified=false;
  const f=fixturePort(async()=>{verified=true;return true});
  await assert.rejects(f.port.attach(run,envelope(),'fixture-evidence','',nonce),/key-possession proof/);
  await assert.rejects(f.port.attach(run,envelope(),'fixture-evidence','proof','wrong'),/encoding/);
  assert.equal(verified,false);assert.equal(f.writes.length,0);
});
test('nullable run owner cannot be accepted as an envelope tenant',async()=>{
  const f=fixturePort();const e=envelope();e.context.tenantId=null;
  await assert.rejects(f.port.attach({...run,userId:null},e,'fixture-evidence','proof',nonce),/INVALID_SOURCE_OWNER/);
  assert.equal(f.writes.length,0);
});
