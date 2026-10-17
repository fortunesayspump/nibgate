import { equalHex, expectedReportData } from "./dr-nib-private-crypto";

// Do not obtain any policy field or verifier URL from the Phala guest or the
// ordinary Dr. Nib API. The release must pin these in an independently
// inspectable client build. Until all values are reviewed, admission is off.
const release = {
  verifierUrl: process.env.NEXT_PUBLIC_DRNIB_PRIVATE_VERIFIER_URL,
  appId: process.env.NEXT_PUBLIC_DRNIB_PRIVATE_APP_ID,
  instanceId: process.env.NEXT_PUBLIC_DRNIB_PRIVATE_INSTANCE_ID,
  composeHash: process.env.NEXT_PUBLIC_DRNIB_PRIVATE_COMPOSE_HASH,
  osHash: process.env.NEXT_PUBLIC_DRNIB_PRIVATE_OS_HASH,
  kmsId: process.env.NEXT_PUBLIC_DRNIB_PRIVATE_KMS_ID,
  controls: process.env.NEXT_PUBLIC_DRNIB_PRIVATE_RELEASE_CONTROLS,
};
const hex20 = /^[0-9a-f]{40}$/i;
const hex32 = /^[0-9a-f]{64}$/i;
const hexBytes = /^(?:[0-9a-f]{2})+$/i;
const MAX_EVIDENCE = 4 * 1024 * 1024;

export type GuestSession = {
  sessionId: string; recipientId: string; recipientPublicKey: string;
  clientNonce: string; rawQuote?: string;
  evidence: { attestation: string } | { quote: string; eventLog: string; vmConfig: string };
};
export type PrivatePolicy = {
  verifierUrl: string; appId: string; instanceId?: string;
  composeHash: string; osHash: string; kmsId: string;
};

async function readLimitedJson(response: Response, maxBytes: number): Promise<Record<string, unknown>> {
  if (!response.body) throw Error("Invalid verifier response");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > maxBytes) throw Error("Verifier response is too large");
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined)); }
  catch { throw Error("Invalid verifier response"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid verifier response");
  return value as Record<string, unknown>;
}

export function configuredPrivatePolicy(): PrivatePolicy | null {
  try {
    const url = new URL(release.verifierUrl || "");
    if (url.protocol !== "https:" || url.pathname !== "/verify" || url.search || url.hash || url.username || url.password ||
        url.hostname === "nibgate.xyz" || url.hostname.endsWith(".nibgate.xyz") ||
        !release.appId || !hex20.test(release.appId) ||
        (release.instanceId && !hex20.test(release.instanceId)) ||
        !release.composeHash || !hex32.test(release.composeHash) ||
        !release.osHash || !hex32.test(release.osHash) ||
        !release.kmsId || !hexBytes.test(release.kmsId)) return null;
    // These must be assertions about the exact hash-pinned release, checked
    // by an independent reviewer. The quote cannot establish them alone.
    const controls: unknown = JSON.parse(release.controls || "null");
    if (!controls || typeof controls !== "object" || Array.isArray(controls)) return null;
    const c = controls as Record<string, unknown>;
    if (c.sshDisabled !== true || c.debugDisabled !== true || c.plaintextLogsDisabled !== true ||
        c.imagesDigestPinned !== true || c.productionOsImage !== true) return null;
    return { verifierUrl: url.toString(), appId: release.appId.toLowerCase(),
      instanceId: release.instanceId?.toLowerCase(), composeHash: release.composeHash.toLowerCase(),
      osHash: release.osHash.toLowerCase(), kmsId: release.kmsId.toLowerCase() };
  } catch { return null; }
}

function evidencePayload(evidence: GuestSession["evidence"]): object {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) throw Error("Invalid guest evidence");
  if (Object.keys(evidence).sort().join(",") === "attestation") {
    const attestation = (evidence as {attestation: unknown}).attestation;
    if (typeof attestation !== "string" || !hexBytes.test(attestation)) throw Error("Invalid guest evidence");
    return { attestation };
  }
  if (Object.keys(evidence).sort().join(",") !== "eventLog,quote,vmConfig") throw Error("Invalid guest evidence");
  const triplet = evidence as {quote: unknown; eventLog: unknown; vmConfig: unknown};
  if (typeof triplet.quote !== "string" || !hexBytes.test(triplet.quote) ||
      typeof triplet.eventLog !== "string" || !triplet.eventLog ||
      typeof triplet.vmConfig !== "string" || !triplet.vmConfig) throw Error("Invalid guest evidence");
  return { quote: triplet.quote, event_log: triplet.eventLog, vm_config: triplet.vmConfig };
}

export async function verifyGuestEvidence({ session, nonce, publicKey, policy }:
  {session: GuestSession; nonce: Uint8Array; publicKey: Uint8Array; policy: PrivatePolicy}): Promise<void> {
  const body = JSON.stringify(evidencePayload(session.evidence));
  if (new TextEncoder().encode(body).length > MAX_EVIDENCE) throw Error("Guest evidence is too large");
  let response: Response;
  try {
    // Direct independent verifier call. A Nibgate proxy or guest-reported
    // verdict would make the operator the verifier. CORS failure is fatal.
    response = await fetch(policy.verifierUrl, {
      method: "POST", mode: "cors", credentials: "omit", cache: "no-store", redirect: "error",
      referrerPolicy: "no-referrer", headers: { "content-type": "application/json", "accept": "application/json" },
      body, signal: AbortSignal.timeout(10_000),
    });
  } catch { throw Error("Independent attestation verifier is unavailable"); }
  if (!response.ok || !(response.headers.get("content-type") || "").toLowerCase().startsWith("application/json"))
    throw Error("Independent attestation verifier rejected this session");
  if (Number(response.headers.get("content-length")) > 1024 * 1024) throw Error("Verifier response is too large");
  const verdict = await readLimitedJson(response, 1024 * 1024);
  const d = verdict.details as Record<string, unknown> | undefined;
  const app = d?.app_info as Record<string, unknown> | undefined;
  const kms = d?.key_provider as Record<string, unknown> | undefined;
  if (verdict.is_valid !== true || !d || d.quote_verified !== true || d.event_log_verified !== true ||
      d.os_image_hash_verified !== true || d.acpi_tables_verified !== true ||
      (d.os_image_is_dev !== false && d.os_image_is_dev !== null) ||
      d.tee_variant !== "dstack-tdx" || d.tcb_status !== "UpToDate" ||
      !Array.isArray(d.advisory_ids) || d.advisory_ids.length !== 0 || !app || !kms ||
      !equalHex(app.app_id as string, policy.appId) ||
      (policy.instanceId && !equalHex(app.instance_id as string, policy.instanceId)) ||
      !equalHex(app.compose_hash as string, policy.composeHash) ||
      !equalHex(app.os_image_hash as string, policy.osHash) ||
      kms.name !== "kms" || !equalHex(kms.id as string, policy.kmsId) ||
      !equalHex(d.report_data as string, await expectedReportData(nonce, session.sessionId, publicKey)))
    throw Error("Attestation does not match the approved private release");
}
