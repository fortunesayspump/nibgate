"use client";

import { getCollateral, PHALA_PCCS_URL, QuoteVerifier } from "@phala/dcap-qvl";
import { decode as decodeMessagePack } from "@msgpack/msgpack";
import { base64ToBytes, bytesToHex, equalHex, expectedReportData, hexToBytes, sha256 } from "./dr-nib-private-crypto";

// This is the bounded, per-boot alternative to an online full dstack verifier.
// A release reviewer must FIRST run the official full dstack verifier on real
// evidence, review its OS/compose/KMS claims, and pin the exact measurements
// for that instance in an independently pinned client build. QVL then verifies
// a fresh quote locally on every session.
// The guest cannot nominate its own manifest, signing key, or measurements.
const H20 = /^[0-9a-f]{40}$/i;
const H32 = /^[0-9a-f]{64}$/i;
const H48 = /^[0-9a-f]{96}$/i;
const HB = /^(?:[0-9a-f]{2})+$/i;
const H8 = /^[0-9a-f]{16}$/i;
const MAX_QUOTE_HEX = 512 * 1024;
const MAX_ATTESTATION_HEX = 8 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 16 * 1024;
const MAX_MANIFEST_LIFETIME_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

type BootMeasurements = {
  mrTd: string; mrConfigId: string; mrOwner: string; mrOwnerConfig: string;
  rtMr0: string; rtMr1: string; rtMr2: string; rtMr3: string;
  tdAttributes: string; xfam: string;
};
export type ReviewedBootManifest = {
  format: "drnib-phala-reviewed-boot-v1";
  issuedAtMs: number; expiresAtMs: number;
  appId: string; instanceId: string; composeHash: string; osHash: string; kmsId: string;
  reviewedReleaseControls: {
    productionOsImage: true; sshDisabled: true; debugDisabled: true;
    plaintextLogsDisabled: true; imagesDigestPinned: true;
  };
  measurements: BootMeasurements;
  audit: { verifierImageDigest: string; verifiedEvidenceSha256: string; verdictSha256: string };
};
export type SignedBootManifest = { payloadBase64: string; signatureBase64: string };
export type DstackTdxEvidence = { attestation: string } | { quote: string; eventLog: string; vmConfig: string };
export type BootAuthorization =
  | { kind: "bundled"; payloadBase64: string; reviewedSha256Hex: string }
  | { kind: "signed"; signedManifest: SignedBootManifest; signerPublicKeyHex: string };

function keysExactly(value: unknown, keys: string): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === keys.split(",").sort().join(",");
}
function assertManifest(value: unknown): asserts value is ReviewedBootManifest {
  if (!keysExactly(value, "format,issuedAtMs,expiresAtMs,appId,instanceId,composeHash,osHash,kmsId,reviewedReleaseControls,measurements,audit") ||
      value.format !== "drnib-phala-reviewed-boot-v1" ||
      typeof value.issuedAtMs !== "number" || !Number.isSafeInteger(value.issuedAtMs) ||
      typeof value.expiresAtMs !== "number" || !Number.isSafeInteger(value.expiresAtMs) ||
      (value.expiresAtMs as number) <= (value.issuedAtMs as number) ||
      (value.expiresAtMs as number) - (value.issuedAtMs as number) > MAX_MANIFEST_LIFETIME_MS ||
      typeof value.appId !== "string" || !H20.test(value.appId) ||
      typeof value.instanceId !== "string" || !H20.test(value.instanceId) ||
      typeof value.composeHash !== "string" || !H32.test(value.composeHash) ||
      typeof value.osHash !== "string" || !H32.test(value.osHash) ||
      typeof value.kmsId !== "string" || !HB.test(value.kmsId)) throw Error("Invalid reviewed boot manifest");
  const c = value.reviewedReleaseControls;
  if (!keysExactly(c, "productionOsImage,sshDisabled,debugDisabled,plaintextLogsDisabled,imagesDigestPinned") ||
      Object.values(c).some(v => v !== true)) throw Error("Unapproved private release controls");
  const m = value.measurements;
  if (!keysExactly(m, "mrTd,mrConfigId,mrOwner,mrOwnerConfig,rtMr0,rtMr1,rtMr2,rtMr3,tdAttributes,xfam"))
    throw Error("Missing reviewed boot measurements");
  for (const key of ["mrTd", "mrConfigId", "mrOwner", "mrOwnerConfig", "rtMr0", "rtMr1", "rtMr2", "rtMr3"])
    if (typeof m[key] !== "string" || !H48.test(m[key])) throw Error("Invalid reviewed boot measurement");
  if (typeof m.tdAttributes !== "string" || !H8.test(m.tdAttributes) ||
      typeof m.xfam !== "string" || !H8.test(m.xfam))
    throw Error("Invalid reviewed TDX attributes");
  const audit = value.audit;
  if (!keysExactly(audit, "verifierImageDigest,verifiedEvidenceSha256,verdictSha256") ||
      typeof audit.verifierImageDigest !== "string" || !/^sha256:[0-9a-f]{64}$/i.test(audit.verifierImageDigest) ||
      typeof audit.verifiedEvidenceSha256 !== "string" || !H32.test(audit.verifiedEvidenceSha256) ||
      typeof audit.verdictSha256 !== "string" || !H32.test(audit.verdictSha256))
    throw Error("Missing full-verifier audit record");
}

/** Verify the release reviewer's Ed25519 signature on EXACT JSON bytes.
 * signerPublicKeyHex must be pinned outside guest/Nibgate-controlled data. */
function parseReviewedManifest(payload: Uint8Array): ReviewedBootManifest {
  let decoded: unknown;
  try { decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload)); }
  catch { throw Error("Invalid reviewed boot manifest JSON"); }
  assertManifest(decoded);
  const now = Date.now();
  if (decoded.issuedAtMs > now + CLOCK_SKEW_MS || decoded.expiresAtMs <= now)
    throw Error("Reviewed boot manifest is outside its validity window");
  return decoded;
}

/** Preferred local-demo path: both exact manifest bytes and its independently
 * reviewed SHA-256 digest are embedded in a locally pinned client release. */
export async function verifyBundledBootManifest(payloadBase64: string, reviewedSha256Hex: string): Promise<ReviewedBootManifest> {
  if (!H32.test(reviewedSha256Hex)) throw Error("Reviewed boot manifest hash is not configured");
  const payload = base64ToBytes(payloadBase64, undefined, MAX_MANIFEST_BYTES);
  if (!equalHex(await sha256(payload), reviewedSha256Hex)) throw Error("Reviewed boot manifest hash mismatch");
  return parseReviewedManifest(payload);
}

export async function verifySignedBootManifest(envelope: SignedBootManifest, signerPublicKeyHex: string): Promise<ReviewedBootManifest> {
  if (!keysExactly(envelope, "payloadBase64,signatureBase64") || !H32.test(signerPublicKeyHex))
    throw Error("Reviewed boot manifest is not configured");
  const payload = base64ToBytes(envelope.payloadBase64, undefined, MAX_MANIFEST_BYTES);
  const signature = base64ToBytes(envelope.signatureBase64, 64, 64);
  let accepted = false;
  try {
    const key = await crypto.subtle.importKey("raw", hexToBytes(signerPublicKeyHex, 32) as BufferSource,
      "Ed25519", false, ["verify"]);
    accepted = await crypto.subtle.verify("Ed25519", key, signature as BufferSource, payload as BufferSource);
  } catch { throw Error("Reviewed boot manifest signature unavailable"); }
  if (!accepted) throw Error("Reviewed boot manifest signature rejected");
  return parseReviewedManifest(payload);
}

export async function verifyApprovedBootManifest(authorization: BootAuthorization): Promise<ReviewedBootManifest> {
  if (authorization?.kind === "bundled")
    return verifyBundledBootManifest(authorization.payloadBase64, authorization.reviewedSha256Hex);
  if (authorization?.kind === "signed")
    return verifySignedBootManifest(authorization.signedManifest, authorization.signerPublicKeyHex);
  throw Error("Reviewed boot manifest is not configured");
}

function msgpackBytes(value: unknown, maxLength: number): Uint8Array {
  if (value instanceof Uint8Array && value.length >= 1 && value.length <= maxLength) return value;
  // Rust serde's plain Vec<u8> may be encoded as a MessagePack integer array.
  if (Array.isArray(value) && value.length >= 1 && value.length <= maxLength &&
      value.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) return Uint8Array.from(value);
  throw Error("Invalid dstack TDX attestation bytes");
}

/** Extract the EXACT TDX quote contained in the evidence being appraised.
 * dstack V1 Attest is a MessagePack map, not an opaque concatenation or JSON.
 * We deliberately reject legacy SCALE and non-Phala TDX platforms here. */
export function extractDstackTdxQuote(evidence: DstackTdxEvidence):
  { quote: Uint8Array; stackReportData: Uint8Array } {
  // The fixed-boot review must bind exactly the same quote to the full offline
  // dstack-verifier result. Legacy GetQuote triplets are not accepted here.
  if (!keysExactly(evidence, "attestation") || !("attestation" in evidence) || typeof evidence.attestation !== "string" ||
      evidence.attestation.length < 2 || evidence.attestation.length > MAX_ATTESTATION_HEX ||
      !HB.test(evidence.attestation)) throw Error("Missing dstack TDX attestation");
  let unpacked: unknown;
  try { unpacked = decodeMessagePack(hexToBytes(evidence.attestation)); }
  catch { throw Error("Invalid dstack MessagePack attestation"); }
  if (!keysExactly(unpacked, "version,platform,stack") || unpacked.version !== 1 ||
      !keysExactly(unpacked.platform, "kind,data") || unpacked.platform.kind !== "tdx" ||
      !keysExactly(unpacked.platform.data, "quote,event_log") ||
      !keysExactly(unpacked.stack, "kind,data") || unpacked.stack.kind !== "dstack" ||
      !keysExactly(unpacked.stack.data, "report_data,runtime_events,config"))
    throw Error("Unsupported dstack TDX attestation version or platform");
  const quote = msgpackBytes(unpacked.platform.data.quote, MAX_QUOTE_HEX / 2);
  const stackReportData = msgpackBytes(unpacked.stack.data.report_data, 64);
  if (stackReportData.length !== 64) throw Error("Invalid dstack stack report data");
  return { quote, stackReportData };
}

type QvlVerifiedReport = {
  status: unknown; advisory_ids: unknown;
  report: { type: unknown; asTd10?: () => unknown; asTd15?: () => unknown };
};

/** Policy-only helper for clearly synthetic unit tests. Production MUST call
 * verifyQvlGuest, which first performs Intel DCAP cryptographic verification. */
export function checkReviewedQuoteClaims(result: QvlVerifiedReport, manifest: ReviewedBootManifest, reportDataHex: string): void {
  if (result?.status !== "UpToDate" || !Array.isArray(result.advisory_ids) || result.advisory_ids.length !== 0 ||
      !result.report || (result.report.type !== "td10" && result.report.type !== "td15"))
    throw Error("TDX quote TCB or variant is not approved");
  const td = result.report.type === "td10" ? result.report.asTd10?.() :
    (result.report.asTd15?.() as {base?: unknown} | null)?.base;
  if (!td || typeof td !== "object") throw Error("TDX quote has no verified TD report");
  const report = td as Record<string, unknown>;
  const m = manifest.measurements;
  for (const key of ["mrTd", "mrConfigId", "mrOwner", "mrOwnerConfig", "rtMr0", "rtMr1", "rtMr2", "rtMr3", "tdAttributes", "xfam"] as const) {
    const claim = report[key];
    if (!(claim instanceof Uint8Array) || !equalHex(bytesToHex(claim), m[key]))
      throw Error(`TDX quote differs from the reviewed boot measurements (${key}; reviewed release ${manifest.composeHash.slice(0,12)}). Reload the app after an approved worker update.`);
  }
  if (!(report.reportData instanceof Uint8Array) ||
      !equalHex(bytesToHex(report.reportData), reportDataHex))
    throw Error("TDX quote is not bound to this session and recipient key");
}

/** Browser-local, official Intel DCAP quote verification with a manually
 * approved per-instance boot pin. This path still requires the caller's live
 * HPKE proof of possession before any source is encrypted. */
export async function verifyQvlGuest({ evidence, clientNonce, sessionId, recipientPublicKey, bootAuthorization }:
  { evidence: DstackTdxEvidence; clientNonce: Uint8Array; sessionId: string; recipientPublicKey: Uint8Array;
    bootAuthorization: BootAuthorization }): Promise<ReviewedBootManifest> {
  if (!(clientNonce instanceof Uint8Array) || clientNonce.length !== 32 ||
      !(recipientPublicKey instanceof Uint8Array) || recipientPublicKey.length !== 65 || recipientPublicKey[0] !== 4)
    throw Error("Invalid fresh TDX quote request");
  const manifest = await verifyApprovedBootManifest(bootAuthorization);
  const expectedReport = await expectedReportData(clientNonce, sessionId, recipientPublicKey);
  const {quote: quoteBytes, stackReportData} = extractDstackTdxQuote(evidence);
  if (!equalHex(bytesToHex(stackReportData), expectedReport))
    throw Error("dstack stack evidence is not bound to this session");
  // The PCCS supplies untrusted collateral. QVL checks its Intel signatures,
  // certificate chain, revocations and expiry with the current browser clock.
  // If PCCS CORS/network fails, this rejects; no proxy or quote-only fallback.
  let verified;
  try {
    const collateral = await getCollateral(PHALA_PCCS_URL, quoteBytes);
    verified = QuoteVerifier.newProd().allowDebug(false).allowServiceTd(false)
      .verify(quoteBytes, collateral, Math.floor(Date.now() / 1000));
  } catch { throw Error("Intel TDX quote could not be verified locally"); }
  checkReviewedQuoteClaims(verified, manifest, expectedReport);
  return manifest;
}
