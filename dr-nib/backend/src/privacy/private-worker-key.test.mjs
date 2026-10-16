import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {generateHpkeRecipient,sealHpkeSource} from './source-hpke.js';
import {withAttestedWorkerKey} from './private-worker-key.js';
import {sealPrivatePayload,openPrivatePayload} from './sealed-payload.js';

const tenantId='synthetic_tenant';
function run(){return {id:randomUUID(),userId:tenantId,metadata:{privacyMode:'confidential',schemaVersion:1},deletedAt:null,status:'draft'};}
async function wrapped(r,sessionId,key=randomBytes(32)){
  const guest=await generateHpkeRecipient();
  const context={tenantId,runId:r.id,objectId:randomUUID(),revision:1,purpose:'source',recipientId:guest.recipientId};
  const payload={format:'drnib-worker-key-v1',sessionId,stateKeyBase64:key.toString('base64')};
  const keyEnvelope=await sealHpkeSource({recipientPublicKey:guest.publicKey,context,plaintext:Buffer.from(JSON.stringify(payload))});
  return {guest,keyEnvelope,key};
}
function args(r,sessionId,w){return {run:r,sessionId,guestPrivateKey:w.guest.privateKey,guestPublicKey:w.guest.publicKey,keyEnvelope:w.keyEnvelope};}

test('client-held HPKE key becomes a purpose-separated guest-only provider for one job',async()=>{
  const r=run(),sessionId=randomUUID(),w=await wrapped(r,sessionId);
  let escaped;
  const state=await withAttestedWorkerKey(args(r,sessionId,w),async({keyProvider})=>{
    escaped=keyProvider;
    const base={tenantId,runId:r.id};
    const a=await keyProvider({...base,purpose:'state'});
    assert.equal(a.length,32);
    assert.deepEqual(await keyProvider({...base,purpose:'state'}),a);
    assert.notDeepEqual(await keyProvider({...base,purpose:'claim'}),a);
    assert.rejects(keyProvider({...base,runId:randomUUID(),purpose:'state'}),/PRIVATE_WORKER_KEY_UNAVAILABLE/);
    assert.rejects(keyProvider({...base,purpose:'unknown'}),/PRIVATE_WORKER_KEY_UNAVAILABLE/);
    return a.toString('hex');
  });
  assert.equal(state.length,64);
  assert.rejects(escaped({tenantId,runId:r.id,purpose:'state'}),/PRIVATE_WORKER_KEY_UNAVAILABLE/);
  assert.equal(JSON.stringify(w.keyEnvelope).includes(w.key.toString('base64')),false);
});

test('same browser-held key can be rewrapped to a fresh verified guest session',async()=>{
  const r=run(),key=randomBytes(32),sessionA=randomUUID(),sessionB=randomUUID();
  const a=await wrapped(r,sessionA,key),b=await wrapped(r,sessionB,key);
  const get=async(session,w)=>withAttestedWorkerKey(args(r,session,w),async({keyProvider})=>
    (await keyProvider({tenantId,runId:r.id,purpose:'state'})).toString('hex'));
  assert.equal(await get(sessionA,a),await get(sessionB,b));
  const context={tenantId,runId:r.id,objectId:r.id,revision:1,purpose:'state'};
  const envelope=await withAttestedWorkerKey(args(r,sessionA,a),async({keyProvider})=>
    sealPrivatePayload({key:await keyProvider({tenantId,runId:r.id,purpose:'state'}),context,plaintext:Buffer.from('{"brief":"HARMLESS_SYNTHETIC_PRIVATE_CANARY"}')}));
  assert.equal(JSON.stringify(envelope).includes('HARMLESS_SYNTHETIC_PRIVATE_CANARY'),false);
  const opened=await withAttestedWorkerKey(args(r,sessionB,b),async({keyProvider})=>
    openPrivatePayload({key:await keyProvider({tenantId,runId:r.id,purpose:'state'}),expectedContext:context,envelope}));
  assert.equal(JSON.parse(opened.toString()).brief,'HARMLESS_SYNTHETIC_PRIVATE_CANARY');
});

test('wrong session, owner, recipient, corrupt ciphertext and deleted run fail closed',async()=>{
  const r=run(),sessionId=randomUUID(),w=await wrapped(r,sessionId);
  const invoke=(overrides={})=>withAttestedWorkerKey({...args(r,sessionId,w),...overrides},async()=>true);
  await assert.rejects(invoke({sessionId:randomUUID()}),/PRIVATE_WORKER_KEY_UNAVAILABLE/);
  await assert.rejects(invoke({run:{...r,id:randomUUID()}}),/PRIVATE_WORKER_KEY_UNAVAILABLE/);
  await assert.rejects(invoke({run:{...r,userId:'another_tenant'}}),/PRIVATE_WORKER_KEY_UNAVAILABLE/);
  await assert.rejects(invoke({run:{...r,deletedAt:new Date()}}),/PRIVATE_WORKER_KEY_UNAVAILABLE/);
  await assert.rejects(invoke({run:{...r,status:'complete'}}),/PRIVATE_WORKER_KEY_UNAVAILABLE/);
  await assert.rejects(invoke({guestPublicKey:(await generateHpkeRecipient()).publicKey}),/PRIVATE_WORKER_KEY_UNAVAILABLE/);
  const bad={...w.keyEnvelope,ciphertext:w.keyEnvelope.ciphertext.slice(0,-4)+'AAAA'};
  await assert.rejects(invoke({keyEnvelope:bad}),/PRIVATE_WORKER_KEY_UNAVAILABLE/);
});

test('callback and bad key errors never return private exception text',async()=>{
  const r=run(),sessionId=randomUUID(),w=await wrapped(r,sessionId);
  await assert.rejects(withAttestedWorkerKey(args(r,sessionId,w),async()=>{throw Error('HARMLESS_SYNTHETIC_PRIVATE_CANARY')}),e=>{
    assert.equal(e.message,'PRIVATE_WORKER_KEY_UNAVAILABLE');return true;
  });
  const malformed=await wrapped(r,sessionId,randomBytes(31));
  await assert.rejects(withAttestedWorkerKey(args(r,sessionId,malformed),async()=>true),/PRIVATE_WORKER_KEY_UNAVAILABLE/);
});
