import * as HPKE from 'hpke';
import {createHash} from 'node:crypto';

const suite=new HPKE.CipherSuite(HPKE.KEM_DHKEM_P256_HKDF_SHA256,HPKE.KDF_HKDF_SHA256,HPKE.AEAD_AES_128_GCM);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID=/^[A-Za-z0-9:_-]{1,128}$/;
const KEY_ID=/^[0-9a-f]{64}$/;
// A 2 MiB source file is base64 inside the encrypted JSON envelope.
const MAX_SOURCE=4*1024*1024;
const INFO=purpose=>new TextEncoder().encode(`drnib-${purpose}-hpke-v2`);
const ALGORITHM='HPKE-P256-HKDF-SHA256-AES128GCM';
function contextBytes(c,purpose) {
  if(!c || typeof c!=='object' || Array.isArray(c) || Object.keys(c).sort().join(',')!=='objectId,purpose,recipientId,revision,runId,tenantId' ||
     typeof c.tenantId!=='string' || !ID.test(c.tenantId) || typeof c.runId!=='string' || !UUID.test(c.runId) ||
     typeof c.objectId!=='string' || !UUID.test(c.objectId) || c.revision!==1 || c.purpose!==purpose ||
     typeof c.recipientId!=='string' || !KEY_ID.test(c.recipientId)) throw new Error('INVALID_SOURCE_CONTEXT');
  return new TextEncoder().encode(JSON.stringify({tenantId:c.tenantId,runId:c.runId,objectId:c.objectId,revision:1,purpose,recipientId:c.recipientId}));
}
function b64(value,min,max) {
  if(typeof value!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('INVALID_SOURCE_ENVELOPE');
  const bytes=Buffer.from(value,'base64');
  if(bytes.length<min||bytes.length>max||bytes.toString('base64')!==value)throw new Error('INVALID_SOURCE_ENVELOPE');
  return bytes;
}
function validateEnvelope(envelope,{tenantId,runId,purpose}) {
  if(typeof tenantId!=='string'||!ID.test(tenantId)||typeof runId!=='string'||!UUID.test(runId))throw new Error('INVALID_SOURCE_OWNER');
  if(!envelope||typeof envelope!=='object'||Array.isArray(envelope)||Object.keys(envelope).sort().join(',')!=='algorithm,ciphertext,context,encapsulatedSecret,version'||
     envelope.version!==2||envelope.algorithm!==ALGORITHM)throw new Error('INVALID_SOURCE_ENVELOPE');
  contextBytes(envelope.context,purpose);
  if(envelope.context.tenantId!==tenantId||envelope.context.runId!==runId)throw new Error('SOURCE_OWNER_MISMATCH');
  b64(envelope.encapsulatedSecret,suite.KEM.Nenc,suite.KEM.Nenc);
  b64(envelope.ciphertext,suite.AEAD.Nt+1,MAX_SOURCE+suite.AEAD.Nt);
  return Object.freeze({...envelope.context});
}
export function validateHpkeSourceEnvelope(envelope,expected){return validateEnvelope(envelope,{...expected,purpose:'source'})}
export function validateHpkeReportEnvelope(envelope,expected){return validateEnvelope(envelope,{...expected,purpose:'report'})}
/** Caller MUST independently verify fresh attestation, code/policy and key
 * possession before giving this function the attested recipient public key. */
export async function sealHpkeSource({recipientPublicKey,context,plaintext}) {
  return sealEnvelope({recipientPublicKey,context,plaintext,purpose:'source'});
}
export async function sealHpkeReport({recipientPublicKey,context,plaintext}) {
  return sealEnvelope({recipientPublicKey,context,plaintext,purpose:'report'});
}
async function sealEnvelope({recipientPublicKey,context,plaintext,purpose}) {
  const aad=contextBytes(context,purpose);
  if(!(plaintext instanceof Uint8Array)||plaintext.length<1||plaintext.length>MAX_SOURCE)throw new Error('INVALID_SOURCE_PLAINTEXT');
  if(context.recipientId!==recipientIdForPublicKey(recipientPublicKey))throw new Error('SOURCE_RECIPIENT_KEY_MISMATCH');
  const publicKey=await suite.DeserializePublicKey(recipientPublicKey);
  const {encapsulatedSecret,ciphertext}=await suite.Seal(publicKey,plaintext,{aad,info:INFO(purpose)});
  return {version:2,algorithm:ALGORITHM,context:JSON.parse(new TextDecoder().decode(aad)),encapsulatedSecret:Buffer.from(encapsulatedSecret).toString('base64'),ciphertext:Buffer.from(ciphertext).toString('base64')};
}
/** Invoke only in measured VM with the ephemeral attested private key. */
export async function openHpkeSource({recipientPrivateKey,expectedContext,envelope}) {
  return openEnvelope({recipientPrivateKey,expectedContext,envelope,purpose:'source'});
}
export async function openHpkeReport({recipientPrivateKey,expectedContext,envelope}) {
  return openEnvelope({recipientPrivateKey,expectedContext,envelope,purpose:'report'});
}
async function openEnvelope({recipientPrivateKey,expectedContext,envelope,purpose}) {
  const aad=contextBytes(expectedContext,purpose);
  validateEnvelope(envelope,{tenantId:expectedContext.tenantId,runId:expectedContext.runId,purpose});
  if(!Buffer.from(contextBytes(envelope.context,purpose)).equals(Buffer.from(aad)))throw new Error('SOURCE_CONTEXT_MISMATCH');
  try{return await suite.Open(recipientPrivateKey,b64(envelope.encapsulatedSecret,suite.KEM.Nenc,suite.KEM.Nenc),b64(envelope.ciphertext,suite.AEAD.Nt+1,MAX_SOURCE+suite.AEAD.Nt),{aad,info:INFO(purpose)});}
  catch{throw new Error('SOURCE_INTEGRITY_FAILURE');}
}
export async function generateHpkeRecipient() {
  // Generate only inside the trusted client or measured guest; never expose
  // the private key through an API or persist it in operator-readable storage.
  const pair=await suite.GenerateKeyPair();
  const publicKey=await suite.SerializePublicKey(pair.publicKey);
  // Keep both halves in memory: hpke requires the public half for P-256
  // decapsulation when its generated private key is not extractable.
  return {publicKey,privateKey:pair,recipientId:recipientIdForPublicKey(publicKey)};
}
export const generateFixtureRecipient=generateHpkeRecipient;
export function recipientIdForPublicKey(publicKey) {
  if(!(publicKey instanceof Uint8Array)||publicKey.length!==suite.KEM.Npk)throw new Error('INVALID_SOURCE_RECIPIENT');
  return createHash('sha256').update(publicKey).digest('hex');
}
