import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createBrokerAttestationPreflight} from './phala-broker-attestation.js';
import {phalaSessionReportData} from './phala-verifier.js';
import {generateHpkeRecipient,openHpkeSource} from './source-hpke.js';

const tenantId='synthetic_owner',runId=randomUUID(),sessionId=randomUUID();
const policy={expectedAppId:'44'.repeat(20),expectedInstanceId:null,expectedComposeHash:'11'.repeat(32),
  expectedOsHash:'22'.repeat(32),expectedKeyProvider:{name:'kms',id:'33'.repeat(32)},
  reviewedReleaseControls:{sshDisabled:true,debugDisabled:true,plaintextLogsDisabled:true,imagesDigestPinned:true,productionOsImage:true}};
function verdict(nonce,key,change={}){
  return {is_valid:true,details:{quote_verified:true,event_log_verified:true,os_image_hash_verified:true,
    acpi_tables_verified:true,os_image_is_dev:false,tee_variant:'dstack-tdx',tcb_status:'UpToDate',advisory_ids:[],
    report_data:Buffer.concat([phalaSessionReportData({clientNonce:nonce,sessionId,recipientPublicKey:key}),Buffer.alloc(32)]).toString('hex'),
    key_provider:{name:'kms',id:policy.expectedKeyProvider.id},app_info:{app_id:policy.expectedAppId,
      instance_id:'55'.repeat(20),compose_hash:policy.expectedComposeHash,os_image_hash:policy.expectedOsHash},...change}};
}
async function fixture({wrongProof=false,badVerdict=false,badGuestNonce=false}={}){
  const pair=await generateHpkeRecipient(),calls=[];let nonce;
  const fetchImpl=async(url,options)=>{
    const body=JSON.parse(options.body),path=new URL(url).pathname;
    calls.push({path,body,auth:options.headers.authorization});
    if(path==='/v1/private/sessions'){
      nonce=Buffer.from(body.clientNonce,'hex');
      const value={sessionId,clientNonce:badGuestNonce?'00'.repeat(32):body.clientNonce,
        recipientId:pair.recipientId,recipientPublicKey:Buffer.from(pair.publicKey).toString('base64'),evidence:{attestation:'aabb'}};
      return {status:201,text:async()=>JSON.stringify(value)};
    }
    if(path===`/v1/private/sessions/${sessionId}/prove`){
      const plain=await openHpkeSource({recipientPrivateKey:pair.privateKey,
        expectedContext:body.challengeEnvelope.context,envelope:body.challengeEnvelope});
      const digest=createHash('sha256').update('drnib-proof-v1\0').update(Buffer.from(sessionId.replaceAll('-',''),'hex')).update(plain).digest('hex');
      const value={verified:true,sessionId,clientNonce:nonce.toString('hex'),recipientId:pair.recipientId,
        challengeDigest:wrongProof?'00'.repeat(32):digest};
      return {status:200,text:async()=>JSON.stringify(value)};
    }
    throw Error('unexpected request');
  };
  const verifyEvidence=async()=>{
    const v=verdict(nonce,pair.publicKey);
    if(badVerdict)v.details.tcb_status='OutOfDate';
    return v;
  };
  const signCapability=async({scope,runId:id,tenantId:tenant})=>{
    assert.equal(id,runId);assert.equal(tenant,tenantId);return `synthetic-token-${scope}`;
  };
  const preflight=createBrokerAttestationPreflight({guestBaseURL:'https://guest.example/',tenantId,
    signCapability,verifyEvidence,policy,fetchImpl});
  return {preflight,calls};
}

test('fresh run-bound preflight verifies synthetic quote policy and real HPKE possession',async()=>{
  const {preflight,calls}=await fixture();
  assert.equal(await preflight({jobId:`${runId}:${randomUUID()}`}),true);
  assert.deepEqual(calls.map(x=>x.path),['/v1/private/sessions',`/v1/private/sessions/${sessionId}/prove`]);
  assert.ok(calls[0].auth.startsWith('Bearer synthetic-token-sessions:open'));
  assert.ok(calls[1].auth.startsWith('Bearer synthetic-token-sessions:prove'));
  assert.ok(!JSON.stringify(calls).includes('HARMLESS_SYNTHETIC_PRIVATE_CANARY'));
});
test('rejects wrong identity, guest nonce, stale TCB and false proof with no plaintext response',async()=>{
  for(const variant of [{wrongProof:true},{badVerdict:true},{badGuestNonce:true}]){
    const {preflight}=await fixture(variant);
    assert.equal(await preflight({jobId:`${runId}:${randomUUID()}`}),false);
  }
  const {preflight}=await fixture();
  assert.equal(await preflight({jobId:randomUUID()}),false);
  assert.equal(await preflight({jobId:`${randomUUID()}:${randomUUID()}`}),false);
});
