import { createHash, timingSafeEqual, X509Certificate } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { checkServerIdentity } from 'node:tls';

// The verifier, release policy, nonce store and proof-of-possession exchange
// must live on the relying-party side. A guest-provided verdict is untrusted.
const SHA256_HEX = /^[0-9a-f]{64}$/i;
const ID_HEX = /^[0-9a-f]{40}$/i;
const HEX = /^(?:[0-9a-f]{2})+$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;
const MAX_VERDICT_BYTES = 1024 * 1024;

export class PhalaAttestationError extends Error {
  constructor(code) { super(code); this.name = 'PhalaAttestationError'; this.code = code; }
}
function reject(code) { throw new PhalaAttestationError(code); }
function hex32(value, code) {
  if (typeof value !== 'string' || !SHA256_HEX.test(value)) reject(code);
  return value.toLowerCase();
}
function hex20(value, code) {
  if (typeof value !== 'string' || !ID_HEX.test(value)) reject(code);
  return value.toLowerCase();
}
function equalHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !HEX.test(a) || !HEX.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
function keyBytes(value) {
  if (!(value instanceof Uint8Array) || value.length !== 65 || value[0] !== 4) reject('INVALID_RECIPIENT_KEY');
  return Buffer.from(value);
}
function nonceBytes(value) {
  if (!(value instanceof Uint8Array) || value.length !== 32) reject('INVALID_CLIENT_NONCE');
  return Buffer.from(value);
}
function uuidBytes(value) {
  if (typeof value !== 'string' || !UUID.test(value)) reject('INVALID_SESSION_ID');
  return Buffer.from(value.replaceAll('-', ''), 'hex');
}

/** The 32-byte digest is passed to dstack GetQuote/Attest, which zero-pads it
 * to the 64-byte hardware report_data. Domain and field lengths are fixed. */
export function phalaSessionReportData({ clientNonce, sessionId, recipientPublicKey }) {
  return createHash('sha256')
    .update('drnib-phala-session-v2\0')
    .update(nonceBytes(clientNonce))
    .update(uuidBytes(sessionId))
    .update(keyBytes(recipientPublicKey))
    .digest();
}

/** Transport only. This does not verify a quote; the pinned, independently
 * operated dstack-verifier service does full platform verification. The SPKI
 * pin is a release-policy input, never learned from the guest or DNS. */
export function createPinnedDstackVerifier({ url, spkiSha256, timeoutMs = 10_000 }) {
  let endpoint;
  try { endpoint = new URL(url); } catch { reject('INVALID_VERIFIER_URL'); }
  if (endpoint.protocol !== 'https:' || !endpoint.hostname || endpoint.pathname !== '/verify' ||
      endpoint.search || endpoint.hash || endpoint.username || endpoint.password) reject('INVALID_VERIFIER_URL');
  const pin = hex32(spkiSha256, 'INVALID_VERIFIER_PIN');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60_000) reject('INVALID_VERIFIER_TIMEOUT');
  return Object.freeze({
    async verifyEvidence(payload) {
      const body = JSON.stringify(payload);
      if (Buffer.byteLength(body) > MAX_EVIDENCE_BYTES) reject('EVIDENCE_TOO_LARGE');
      return new Promise((resolve, rejectPromise) => {
        let timer;
        const fail = error => { clearTimeout(timer); rejectPromise(error); };
        const succeed = value => { clearTimeout(timer); resolve(value); };
        const req = httpsRequest(endpoint, {
          method: 'POST',
          agent: false, // never reuse a socket whose TLS handshake skipped this SPKI pin
          headers: { 'content-type': 'application/json', 'accept': 'application/json', 'content-length': Buffer.byteLength(body) },
          rejectUnauthorized: true,
          minVersion: 'TLSv1.2',
          checkServerIdentity(host, cert) {
            const hostnameError = checkServerIdentity(host, cert);
            if (hostnameError) return hostnameError;
            try {
              const der = new X509Certificate(cert.raw).publicKey.export({ type: 'spki', format: 'der' });
              if (!equalHex(createHash('sha256').update(der).digest('hex'), pin)) return new Error('VERIFIER_SPKI_MISMATCH');
            } catch { return new Error('VERIFIER_SPKI_MISMATCH'); }
          },
        }, response => {
          if (response.statusCode !== 200) { response.resume(); fail(new PhalaAttestationError('VERIFIER_HTTP_FAILURE')); return; }
          if (!/^application\/json(?:\s*;|$)/i.test(response.headers['content-type'] ?? '')) {
            response.resume(); fail(new PhalaAttestationError('INVALID_VERIFIER_RESPONSE')); return;
          }
          let bytes = 0;
          const chunks = [];
          response.on('data', chunk => {
            bytes += chunk.length;
            if (bytes > MAX_VERDICT_BYTES) { req.destroy(new PhalaAttestationError('VERIFIER_RESPONSE_TOO_LARGE')); return; }
            chunks.push(chunk);
          });
          response.on('error', fail);
          response.on('end', () => {
            try { succeed(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
            catch { fail(new PhalaAttestationError('INVALID_VERIFIER_RESPONSE')); }
          });
        });
        timer = setTimeout(() => req.destroy(new PhalaAttestationError('VERIFIER_TIMEOUT')), timeoutMs);
        req.on('error', fail);
        req.end(body);
      });
    },
  });
}

function verifierPayload(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) reject('INVALID_ATTESTATION_EVIDENCE');
  if (Object.keys(evidence).sort().join(',') === 'attestation') {
    if (typeof evidence.attestation !== 'string' || evidence.attestation.length > MAX_EVIDENCE_BYTES ||
        !HEX.test(evidence.attestation)) reject('INVALID_ATTESTATION_EVIDENCE');
    return { attestation: evidence.attestation };
  }
  if (Object.keys(evidence).sort().join(',') !== 'eventLog,quote,vmConfig' ||
      typeof evidence.quote !== 'string' || !HEX.test(evidence.quote) ||
      typeof evidence.eventLog !== 'string' || !evidence.eventLog ||
      typeof evidence.vmConfig !== 'string' || !evidence.vmConfig) reject('INVALID_ATTESTATION_EVIDENCE');
  if (Buffer.byteLength(evidence.quote) + Buffer.byteLength(evidence.eventLog) +
      Buffer.byteLength(evidence.vmConfig) > MAX_EVIDENCE_BYTES) reject('EVIDENCE_TOO_LARGE');
  return { quote: evidence.quote, event_log: evidence.eventLog, vm_config: evidence.vmConfig };
}

/**
 * Authorize a recipient only after full quote verification, release-policy
 * appraisal, live key possession, and atomic one-time nonce consumption.
 * verifyEvidence must be the trusted full verifier, not a guest API response.
 * verifyKeyPossession must perform an actual HPKE challenge-response against
 * this public key and return its bound result. consumeNonce must check an
 * issued, unexpired nonce and atomically mark it spent.
 */
export async function verifyPhalaRecipient({
  evidence, clientNonce, sessionId, recipientPublicKey,
  expectedAppId, expectedInstanceId, expectedComposeHash, expectedOsHash, expectedKeyProvider,
  reviewedReleaseControls, verifyEvidence, verifyKeyPossession, consumeNonce,
}) {
  const nonce = nonceBytes(clientNonce);
  const key = keyBytes(recipientPublicKey);
  uuidBytes(sessionId);
  const composeHash = hex32(expectedComposeHash, 'MISSING_APPROVED_COMPOSE_HASH');
  const osHash = hex32(expectedOsHash, 'MISSING_APPROVED_OS_HASH');
  const appId = hex20(expectedAppId, 'MISSING_APPROVED_APP_ID');
  const instanceId = expectedInstanceId == null ? null : hex20(expectedInstanceId, 'INVALID_APPROVED_INSTANCE_ID');
  if (!expectedKeyProvider || expectedKeyProvider.name !== 'kms' ||
      typeof expectedKeyProvider.id !== 'string' || !HEX.test(expectedKeyProvider.id)) reject('MISSING_APPROVED_KEY_PROVIDER');
  // These are assertions about the independently reviewed, hash-pinned release,
  // not claims that can be established from a TDX quote by itself.
  if (!reviewedReleaseControls || reviewedReleaseControls.sshDisabled !== true ||
      reviewedReleaseControls.debugDisabled !== true ||
      reviewedReleaseControls.plaintextLogsDisabled !== true ||
      reviewedReleaseControls.imagesDigestPinned !== true ||
      reviewedReleaseControls.productionOsImage !== true) reject('RELEASE_CONTROLS_NOT_APPROVED');
  if (typeof verifyEvidence !== 'function' || typeof verifyKeyPossession !== 'function' ||
      typeof consumeNonce !== 'function') reject('ATTESTATION_DEPENDENCY_MISSING');

  const payload = verifierPayload(evidence);
  if (Buffer.byteLength(JSON.stringify(payload)) > MAX_EVIDENCE_BYTES) reject('EVIDENCE_TOO_LARGE');
  let verdict;
  try { verdict = await verifyEvidence(payload); }
  catch { reject('VERIFIER_UNAVAILABLE'); }
  const details = verdict?.details;
  const app = details?.app_info;
  if (verdict?.is_valid !== true || !details || details.quote_verified !== true ||
      details.event_log_verified !== true || details.os_image_hash_verified !== true ||
      details.acpi_tables_verified !== true ||
      (details.os_image_is_dev !== false && details.os_image_is_dev !== null) ||
      details.tee_variant !== 'dstack-tdx' || details.tcb_status !== 'UpToDate' ||
      !Array.isArray(details.advisory_ids) || details.advisory_ids.length !== 0 ||
      !app || !equalHex(app.app_id, appId) ||
      (instanceId !== null && !equalHex(app.instance_id, instanceId)) ||
      !equalHex(app.compose_hash, composeHash) || !equalHex(app.os_image_hash, osHash) ||
      details.key_provider?.name !== expectedKeyProvider.name ||
      !equalHex(details.key_provider?.id, expectedKeyProvider.id)) reject('ATTESTATION_POLICY_REJECTED');
  const expectedReport = Buffer.concat([
    phalaSessionReportData({ clientNonce: nonce, sessionId, recipientPublicKey: key }), Buffer.alloc(32),
  ]).toString('hex');
  if (!equalHex(details.report_data, expectedReport)) reject('ATTESTATION_SESSION_MISMATCH');

  const recipientId = createHash('sha256').update(key).digest('hex');
  let possession;
  try { possession = await verifyKeyPossession({ sessionId, clientNonce: nonce, recipientPublicKey: key, recipientId }); }
  catch { reject('KEY_POSSESSION_FAILED'); }
  if (possession?.verified !== true || possession.sessionId !== sessionId ||
      !equalHex(possession.clientNonce, nonce.toString('hex')) ||
      !equalHex(possession.recipientId, recipientId)) reject('KEY_POSSESSION_FAILED');
  let consumed;
  try { consumed = await consumeNonce({ sessionId, clientNonce: nonce, recipientId }); }
  catch { reject('CLIENT_NONCE_NOT_FRESH'); }
  if (consumed !== true) reject('CLIENT_NONCE_NOT_FRESH');
  return Object.freeze({ verified: true, recipientId, sessionId, appId, instanceId, composeHash, osHash });
}
