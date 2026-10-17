import {hkdfSync} from 'node:crypto';
import {openHpkeSource,recipientIdForPublicKey,validateHpkeSourceEnvelope} from './source-hpke.js';
import {isConfidentialRun} from './guard.js';

// A browser-held job key reaches only the fresh, attested guest session. The
// caller must already have authenticated the run and completed attestation and
// proof of possession. Nothing here verifies hardware evidence by itself.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PURPOSES=new Set(['state','worker-source','claim','decision','step','report','event']);
const FORMAT='drnib-worker-key-v1';
function fail(){const e=new Error('PRIVATE_WORKER_KEY_UNAVAILABLE');e.code='PRIVATE_WORKER_KEY_UNAVAILABLE';return e;}
function canonicalKey(value){
  if(typeof value!=='string'||!/^(?:[A-Za-z0-9+/]{4}){10}[A-Za-z0-9+/]{3}=$/.test(value))throw fail();
  const key=Buffer.from(value,'base64');
  if(key.length!==32||key.toString('base64')!==value)throw fail();
  return key;
}

/** Restrict the unwrapped key to a single awaited guest job. No Railway key,
 * file fallback or dstack deterministic app key can substitute for this input.
 * A restart loses the key; resumption requires a new verified session and the
 * client to HPKE re-deliver the same retained key. */
export async function withAttestedWorkerKey({run,sessionId,guestPrivateKey,guestPublicKey,keyEnvelope},fn){
  let key,opened;
  try{
    if(typeof fn!=='function'||!isConfidentialRun(run)||run.deletedAt!=null||
       !['draft','planning','planned','running'].includes(run.status)||
       typeof run.userId!=='string'||!run.userId||
       typeof run.id!=='string'||!UUID.test(run.id)||!UUID.test(sessionId)||
       !(guestPublicKey instanceof Uint8Array))throw fail();
    const context=validateHpkeSourceEnvelope(keyEnvelope,{tenantId:run.userId,runId:run.id});
    if(context.recipientId!==recipientIdForPublicKey(guestPublicKey))throw fail();
    opened=await openHpkeSource({recipientPrivateKey:guestPrivateKey,expectedContext:context,envelope:keyEnvelope});
    let payload;
    try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(opened));}catch{throw fail();}
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||
       Object.keys(payload).sort().join(',')!=='format,sessionId,stateKeyBase64'||
       payload.format!==FORMAT||payload.sessionId!==sessionId)throw fail();
    key=canonicalKey(payload.stateKeyBase64);
    let active=true;
    const provider=async({tenantId,runId,purpose})=>{
      if(!active||tenantId!==run.userId||runId!==run.id||!PURPOSES.has(purpose))throw fail();
      const salt=Buffer.from(`drnib-private-worker-v1\0${tenantId}\0${runId}`);
      return Buffer.from(hkdfSync('sha256',key,salt,Buffer.from(`object-purpose\0${purpose}`),32));
    };
    try{return await fn(Object.freeze({keyProvider:provider}));}
    finally{active=false;}
  }catch{throw fail();}
  finally{
    // Best-effort cleanup only: JS strings and already returned subkeys cannot
    // be guaranteed erased. The measured job must not log or retain either.
    if(opened instanceof Uint8Array)opened.fill(0);
    if(key)key.fill(0);
  }
}
