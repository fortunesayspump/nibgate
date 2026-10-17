import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {verifyPhalaRecipient} from './phala-verifier.js';
import {recipientIdForPublicKey,sealHpkeSource} from './source-hpke.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX32=/^[0-9a-f]{64}$/;
const MAX_REPLY=5*1024*1024;
function exact(value,keys){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys}
function equalHex(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&HEX32.test(a)&&HEX32.test(b)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'))}
function safeError(){return new Error('PHALA_BROKER_ATTESTATION_UNAVAILABLE')}
function b64key(value){
  if(typeof value!=='string'||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw safeError();
  const key=Buffer.from(value,'base64');
  if(key.length!==65||key[0]!==4||key.toString('base64')!==value)throw safeError();
  return key;
}
function evidenceValid(value){
  if(exact(value,'attestation'))return typeof value.attestation==='string'&&/^(?:[0-9a-f]{2})+$/i.test(value.attestation);
  return exact(value,'eventLog,quote,vmConfig')&&typeof value.quote==='string'&&typeof value.eventLog==='string'&&typeof value.vmConfig==='string';
}

/** A broker-side availability and release-policy gate, never a substitute for
 * the browser's independently pinned quote verification. Only public quote,
 * fresh nonce and an HPKE challenge cross this ordinary service. */
export function createBrokerAttestationPreflight({guestBaseURL,tenantId,signCapability,verifyEvidence,policy,
  fetchImpl=fetch,now=Date.now}={}){
  let guest;
  try{guest=new URL(guestBaseURL)}catch{throw safeError()}
  if(guest.protocol!=='https:'||guest.username||guest.password||guest.search||guest.hash||
     typeof tenantId!=='string'||! /^[A-Za-z0-9:_-]{1,128}$/.test(tenantId)||
     typeof signCapability!=='function'||typeof verifyEvidence!=='function'||!policy||
     typeof fetchImpl!=='function'||typeof now!=='function')throw safeError();
  const issued=new Map();
  async function request(path,scope,runId,body){
    const token=await signCapability({tenantId,runId,scope});
    const endpoint=new URL(path,guest);
    if(endpoint.origin!==guest.origin)throw safeError();
    const response=await fetchImpl(endpoint,{method:'POST',redirect:'error',cache:'no-store',
      headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(15_000)});
    if(response.redirected===true||response.url&&new URL(response.url).origin!==guest.origin)throw safeError();
    if(response.status!==200&&response.status!==201)throw safeError();
    const raw=await response.text();
    if(Buffer.byteLength(raw)>MAX_REPLY)throw safeError();
    try{return JSON.parse(raw)}catch{throw safeError()}
  }
  return async function verifyAttestation({jobId}={}){
    try{
      if(typeof jobId!=='string')return false;
      const [runId,requestId,...extra]=jobId.split(':');
      if(extra.length||!UUID.test(runId)||!UUID.test(requestId))return false;
      // Generated and consumed on the relying-party side; a guest-supplied
      // nonce or a repeated verdict cannot reopen an old session.
      const nonce=randomBytes(32),nonceHex=nonce.toString('hex');
      const nonceKey=`${runId}:${nonceHex}`;
      for(const [key,expiry] of issued)if(expiry<=now())issued.delete(key);
      if(issued.size>=1024)return false;
      issued.set(nonceKey,now()+60_000);
      try{
        const opened=await request('/v1/private/sessions','sessions:open',runId,{runId,clientNonce:nonceHex});
        if(!(exact(opened,'clientNonce,evidence,recipientId,recipientPublicKey,sessionId')||
             exact(opened,'clientNonce,evidence,rawQuote,recipientId,recipientPublicKey,sessionId'))||
           !UUID.test(opened.sessionId)||opened.clientNonce!==nonceHex||!evidenceValid(opened.evidence))return false;
        const key=b64key(opened.recipientPublicKey);
        if(opened.recipientId!==recipientIdForPublicKey(key))return false;
        const possession=async({sessionId,clientNonce,recipientPublicKey,recipientId})=>{
          const challenge=randomBytes(32);
          const challengeEnvelope=await sealHpkeSource({recipientPublicKey,
            context:{tenantId,runId,objectId:randomUUID(),revision:1,purpose:'source',recipientId},plaintext:challenge});
          const proof=await request(`/v1/private/sessions/${sessionId}/prove`,'sessions:prove',runId,{challengeEnvelope});
          const expected=createHash('sha256').update('drnib-proof-v1\0')
            .update(Buffer.from(sessionId.replaceAll('-',''),'hex')).update(challenge).digest('hex');
          if(!exact(proof,'challengeDigest,clientNonce,recipientId,sessionId,verified')||
             proof.verified!==true||proof.sessionId!==sessionId||proof.clientNonce!==nonceHex||
             proof.recipientId!==recipientId||!equalHex(proof.challengeDigest,expected))throw safeError();
          return {verified:true,recipientId,sessionId,clientNonce:clientNonce.toString('hex')};
        };
        const verdict=await verifyPhalaRecipient({evidence:opened.evidence,clientNonce:nonce,sessionId:opened.sessionId,
          recipientPublicKey:key,expectedAppId:policy.expectedAppId,
          expectedInstanceId:policy.expectedInstanceId,expectedComposeHash:policy.expectedComposeHash,
          expectedOsHash:policy.expectedOsHash,expectedKeyProvider:policy.expectedKeyProvider,
          reviewedReleaseControls:policy.reviewedReleaseControls,verifyEvidence,verifyKeyPossession:possession,
          consumeNonce:async({clientNonce})=>{
            if(!Buffer.from(clientNonce).equals(nonce)||issued.get(nonceKey)<=now())return false;
            return issued.delete(nonceKey);
          }});
        return verdict?.verified===true;
      }finally{issued.delete(nonceKey)}
    }catch{return false}
  };
}
