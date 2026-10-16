import { createHash, randomUUID } from 'node:crypto';
import {validateHpkeSourceEnvelope} from './source-hpke.js';

const B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
function bytes(value, min, max) {
  if (typeof value !== 'string' || !B64.test(value)) throw new Error('invalid sealed source encoding');
  const out = Buffer.from(value, 'base64');
  if (out.length < min || out.length > max || out.toString('base64') !== value) throw new Error('invalid sealed source encoding');
  return out;
}
/**
 * An existing-worker intake port. The normal API wires a real verifier that
 * currently throws; tests inject a fixture verifier. Only sealed bytes cross
 * the API/storage boundary. The recipient verifier must bind a fresh attested
 * public key to an approved image/policy before this port can be enabled.
 */
export function createEncryptedSourceAdapter({ verifyRecipient, storage, repository }) {
  if (typeof verifyRecipient !== 'function' || !storage?.put || !storage?.remove || !repository?.create) throw new Error('encrypted source port incomplete');
  return {
    async attach(run, envelope, attestationEvidence, proofOfPossession, clientNonce) {
      // Only the recipient-decryptable HPKE v2 format may be accepted. The
      // earlier AES-only structure lacked any recipient key exchange.
      const c = validateHpkeSourceEnvelope(envelope, { tenantId: run.userId, runId: run.id });
      if (typeof attestationEvidence!=='string' || !attestationEvidence || attestationEvidence.length>131072 ||
          typeof proofOfPossession!=='string' || !proofOfPossession || proofOfPossession.length>8192)
        throw new Error('attestation evidence and key-possession proof required');
      bytes(clientNonce,32,32);
      const verdict=await verifyRecipient({expectedContext:c,evidence:attestationEvidence,proofOfPossession,clientNonce});
      if (!verdict || verdict.verified!==true || verdict.keyPossessionVerified!==true ||
          verdict.debugEnabled!==false || verdict.operatorAccess!==false ||
          verdict.tenantId!==c.tenantId || verdict.runId!==c.runId || verdict.objectId!==c.objectId ||
          verdict.recipientId!==c.recipientId || verdict.clientNonce!==clientNonce ||
          typeof verdict.imageDigest!=='string' || !/^[0-9a-f]{64}$/i.test(verdict.imageDigest) ||
          typeof verdict.policyDigest!=='string' || !/^[0-9a-f]{64}$/i.test(verdict.policyDigest))
        throw new Error('unapproved attestation verdict');
      const sealed = Buffer.from(JSON.stringify(envelope));
      // Unique storage key prevents a retried objectId from overwriting an
      // existing ciphertext before the DB uniqueness check rejects it.
      const key = `sealed/${run.id}/${c.objectId}/${randomUUID()}`;
      const sha256 = createHash('sha256').update(sealed).digest('hex');
      await storage.put(key, sealed);
      try {
        await repository.create(run, { id:c.objectId, key, sha256, bytes:sealed.length, recipientId:c.recipientId });
      } catch (error) {
        await storage.remove(key).catch(() => {});
        throw error;
      }
      return { id:c.objectId, encrypted:true, bytes:sealed.length, sha256 };
    },
  };
}
