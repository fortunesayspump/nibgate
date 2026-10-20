import {createHash} from 'node:crypto';

// This module constructs a CANDIDATE audit artifact. The command-line caller
// must first verify the exact quote with production QVL and provide the exact
// full dstack-verifier verdict. No test seam is exposed by the CLI.
export const REVIEWED_VERIFIER_IMAGE =
  'sha256:9f2c07a94efd3d8a1a89268e5faa35e91e3cb345b9c4ab859c86d35142f4f788';
const HEX = /^(?:[0-9a-f]{2})+$/i;
const H20 = /^[0-9a-f]{40}$/i;
const H32 = /^[0-9a-f]{64}$/i;
const H48 = /^[0-9a-f]{96}$/i;
const H8 = /^[0-9a-f]{16}$/i;
const H64 = /^[0-9a-f]{128}$/i;
const MAX_LIFE_MS = 24 * 60 * 60 * 1000;
const MEASUREMENT_FIELDS = ['mrTd','mrConfigId','mrOwner','mrOwnerConfig',
  'rtMr0','rtMr1','rtMr2','rtMr3','tdAttributes','xfam'];

function reject(message) { throw new Error(message); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value, fields) {
  return object(value) && Object.keys(value).sort().join(',') === fields.slice().sort().join(',');
}
function sameHex(a,b) { return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase(); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function signedBytes(report, key, length) {
  const value = report?.[key];
  if (!(value instanceof Uint8Array) || value.length !== length) reject(`QVL signed ${key} is invalid`);
  return Buffer.from(value).toString('hex');
}

/** Independent review inputs: never copy these from the guest or verifier. */
export function validateApprovedBootPolicy(policy, nowMs) {
  if (!Number.isSafeInteger(nowMs) || nowMs <= 0) reject('Invalid reviewer clock');
  const fields = ['appId','instanceId','composeHash','osHash','kmsId',
    'expectedReportData','expiresAtMs','reviewedReleaseControls','verifierImageDigest'];
  if (!exactKeys(policy, fields) || !H20.test(policy.appId) || !H20.test(policy.instanceId) ||
      !H32.test(policy.composeHash) || !H32.test(policy.osHash) ||
      typeof policy.kmsId !== 'string' || !HEX.test(policy.kmsId) ||
      !H64.test(policy.expectedReportData) ||
      !/^0{64}$/i.test(policy.expectedReportData.slice(64)) ||
      !Number.isSafeInteger(policy.expiresAtMs) || policy.expiresAtMs <= nowMs ||
      policy.expiresAtMs - nowMs > MAX_LIFE_MS ||
      policy.verifierImageDigest !== REVIEWED_VERIFIER_IMAGE)
    reject('Incomplete or unapproved fixed-boot review policy');
  const controls = policy.reviewedReleaseControls;
  const requiredControls = ['productionOsImage','sshDisabled','debugDisabled',
    'plaintextLogsDisabled','imagesDigestPinned'];
  if (!exactKeys(controls, requiredControls) || requiredControls.some(k => controls[k] !== true))
    reject('Production release controls require independent approval');
  return policy;
}

/** Quote result MUST be the result of official production QVL over the exact
 * quote extracted from the exact V1 evidence given to full dstack-verifier. */
export function buildReviewedBootCandidate({attestationBytes, verdictBytes, policy, qvlResult, nowMs}) {
  validateApprovedBootPolicy(policy, nowMs);
  if (!(attestationBytes instanceof Uint8Array) || !attestationBytes.length ||
      !(verdictBytes instanceof Uint8Array) || !verdictBytes.length)
    reject('The exact attestation and saved verdict bytes are required');
  let verdict;
  try { verdict = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(verdictBytes)); }
  catch { reject('Saved full-verifier verdict is invalid JSON'); }
  const d = verdict?.details, app = d?.app_info;
  if (verdict?.is_valid !== true || verdict.reason !== null ||
      d?.quote_verified !== true || d?.event_log_verified !== true ||
      d?.os_image_hash_verified !== true || d?.acpi_tables_verified !== true ||
      d?.tee_variant !== 'dstack-tdx' || d?.tcb_status !== 'UpToDate' ||
      !Array.isArray(d?.advisory_ids) || d.advisory_ids.length !== 0 ||
      (d.os_image_is_dev !== false && d.os_image_is_dev !== null) ||
      d?.key_provider?.name !== 'kms' || !sameHex(d.key_provider.id, policy.kmsId) ||
      !sameHex(app?.app_id, policy.appId) || !sameHex(app?.instance_id, policy.instanceId) ||
      !sameHex(app?.compose_hash, policy.composeHash) ||
      !sameHex(app?.os_image_hash, policy.osHash) ||
      !sameHex(d?.report_data, policy.expectedReportData))
    reject('Full-verifier verdict does not approve the fixed boot');
  if (qvlResult?.status !== 'UpToDate' || !Array.isArray(qvlResult.advisory_ids) ||
      qvlResult.advisory_ids.length || !['td10','td15'].includes(qvlResult?.report?.type))
    reject('QVL quote TCB or variant is not approved');
  const report = qvlResult.report.type === 'td10' ? qvlResult.report.asTd10?.() :
    qvlResult.report.asTd15?.()?.base;
  if (!object(report)) reject('QVL verified TD report is unavailable');
  const measurements = {};
  for (const key of MEASUREMENT_FIELDS) {
    const value = signedBytes(report, key, key === 'tdAttributes' || key === 'xfam' ? 8 : 48);
    if (!(key === 'tdAttributes' || key === 'xfam' ? H8 : H48).test(value))
      reject('QVL measurement length is invalid');
    measurements[key] = value;
  }
  // dstack-verifier 0.6.1 does not return individual TDX MRs in app_info.
  // Its verified OS/event/ACPI flags are checks against this same attestation;
  // QVL supplies the hardware-signed MRs for the reviewed fixed-boot pin.
  if (!sameHex(signedBytes(report,'reportData',64), policy.expectedReportData))
    reject('QVL quote is not bound to the reviewer challenge');

  const lower = value => value.toLowerCase();
  const manifest = {
    format:'drnib-phala-reviewed-boot-v1', issuedAtMs:nowMs,
    expiresAtMs:policy.expiresAtMs,
    appId:lower(policy.appId), instanceId:lower(policy.instanceId),
    composeHash:lower(policy.composeHash), osHash:lower(policy.osHash), kmsId:lower(policy.kmsId),
    reviewedReleaseControls:{...policy.reviewedReleaseControls}, measurements,
    audit:{verifierImageDigest:REVIEWED_VERIFIER_IMAGE,
      verifiedEvidenceSha256:sha256(attestationBytes), verdictSha256:sha256(verdictBytes)},
  };
  const payload = Buffer.from(JSON.stringify(manifest),'utf8');
  return {status:'candidate-requires-independent-review', manifest,
    payloadBase64:payload.toString('base64'), reviewedSha256Hex:sha256(payload)};
}
