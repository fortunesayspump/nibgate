import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ID = /^[A-Za-z0-9:_-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PURPOSES = new Set(['source', 'worker-source', 'step', 'report', 'decision', 'event', 'state', 'claim']);
const MAX_PLAINTEXT = 4 * 1024 * 1024;

function contextBytes(context) {
  const source = context?.purpose === 'source';
  if (!context || typeof context !== 'object' || Array.isArray(context) ||
      Object.keys(context).sort().join(',') !== (source ? 'objectId,purpose,recipientId,revision,runId,tenantId' : 'objectId,purpose,revision,runId,tenantId') ||
      typeof context.tenantId !== 'string' || !ID.test(context.tenantId) ||
      typeof context.runId !== 'string' || !UUID.test(context.runId) ||
      typeof context.objectId !== 'string' || !UUID.test(context.objectId) ||
      !Number.isSafeInteger(context.revision) || context.revision < 1 ||
      (source && (typeof context.recipientId !== 'string' || !ID.test(context.recipientId))) ||
      !PURPOSES.has(context.purpose)) throw new Error('INVALID_PRIVATE_CONTEXT');
  return Buffer.from(JSON.stringify({tenantId:context.tenantId,runId:context.runId,objectId:context.objectId,revision:context.revision,purpose:context.purpose,...(source?{recipientId:context.recipientId}:{})}));
}
function requireKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('PRIVATE_KEY_UNAVAILABLE');
}
function base64(value, length) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    throw new Error('INVALID_PRIVATE_ENVELOPE');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value || (length && bytes.length !== length) || bytes.length > MAX_PLAINTEXT + 16)
    throw new Error('INVALID_PRIVATE_ENVELOPE');
  return bytes;
}

/** AES-256-GCM with context as authenticated associated data. Key release and
 *  attestation are separate prerequisites; this routine proves neither. */
export function sealPrivatePayload({key, context, plaintext}) {
  requireKey(key);
  const aad = contextBytes(context);
  if (!Buffer.isBuffer(plaintext) || plaintext.length > MAX_PLAINTEXT) throw new Error('INVALID_PRIVATE_PAYLOAD');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {version:1,algorithm:'A256GCM',context:JSON.parse(aad.toString('utf8')),nonce:nonce.toString('base64'),ciphertext:ciphertext.toString('base64'),tag:cipher.getAuthTag().toString('base64')};
}

/** Rejects tampering and wrong tenant/run/object/revision before returning data. */
export function openPrivatePayload({key, expectedContext, envelope}) {
  requireKey(key);
  const aad = contextBytes(expectedContext);
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
      Object.keys(envelope).sort().join(',') !== 'algorithm,ciphertext,context,nonce,tag,version' ||
      envelope.version !== 1 || envelope.algorithm !== 'A256GCM' ||
      !Buffer.from(contextBytes(envelope.context)).equals(aad)) throw new Error('INVALID_PRIVATE_ENVELOPE');
  const nonce = base64(envelope.nonce, 12);
  const ciphertext = base64(envelope.ciphertext);
  const tag = base64(envelope.tag, 16);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch { throw new Error('PRIVATE_INTEGRITY_FAILURE'); }
}
