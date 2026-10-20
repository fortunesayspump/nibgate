// Browser WebCrypto foundation only. No storage, wallet, network or UI wiring.
// Recovery material and unwrapped keys must never enter ordinary API payloads.
type Purpose = "vault-recovery" | "project-keys";
type Context = {
  tenantId: string;
  vaultId: string;
  runId: string | null;
  revision: 1;
  purpose: Purpose;
};
export type PrivateVaultEnvelope = {
  version: 1;
  algorithm: "AES-256-GCM";
  context: Context;
  iv: string;
  ciphertext: string;
};
export type PrivateVault = { tenantId: string; vaultId: string; key: CryptoKey };
export type PrivateProjectSecrets = { reportKeySeed: Uint8Array; workerStateKey: Uint8Array };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const enc = new TextEncoder();
function unavailable(): Error { return new Error("PRIVATE_VAULT_UNAVAILABLE"); }
function exact(value: unknown, keys: string): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === keys;
}
function owner(tenantId: string, vaultId: string): void {
  if (typeof tenantId !== "string" || !/^[A-Za-z0-9:_-]{1,128}$/.test(tenantId) ||
      typeof vaultId !== "string" || !UUID.test(vaultId)) throw unavailable();
}
function context(tenantId: string, vaultId: string, runId: string | null, purpose: Purpose): Context {
  owner(tenantId, vaultId);
  if (purpose === "vault-recovery" ? runId !== null : typeof runId !== "string" || !UUID.test(runId))
    throw unavailable();
  return { tenantId, vaultId, runId, revision: 1, purpose };
}
function aad(value: Context): Uint8Array {
  return enc.encode("drnib-private-vault-v1\0" + JSON.stringify(value));
}
function base64(value: Uint8Array): string { return btoa(String.fromCharCode(...value)); }
function decode(value: unknown, length: number): Uint8Array {
  if (typeof value !== "string" || value.length !== Math.ceil(length / 3) * 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    throw unavailable();
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  if (bytes.length !== length || base64(bytes) !== value) throw unavailable();
  return bytes;
}
async function importKey(bytes: Uint8Array): Promise<CryptoKey> {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) throw unavailable();
  return crypto.subtle.importKey("raw", bytes as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}
function vaultContext(vault: PrivateVault, runId: string): Context {
  if (!vault || vault.key?.algorithm?.name !== "AES-GCM" || vault.key.extractable !== false ||
      (vault.key.algorithm as AesKeyAlgorithm).length !== 256) throw unavailable();
  return context(vault.tenantId, vault.vaultId, runId, "project-keys");
}
async function seal(key: CryptoKey, expected: Context, plain: Uint8Array): Promise<PrivateVaultEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource,
    additionalData: aad(expected) as BufferSource, tagLength: 128 }, key, plain as BufferSource);
  return { version: 1, algorithm: "AES-256-GCM", context: expected, iv: base64(iv),
    ciphertext: base64(new Uint8Array(cipher)) };
}
async function open(key: CryptoKey, expected: Context, envelope: PrivateVaultEnvelope,
  plaintextLength: number): Promise<Uint8Array> {
  if (!exact(envelope, "algorithm,ciphertext,context,iv,version") || envelope.version !== 1 ||
      envelope.algorithm !== "AES-256-GCM" ||
      !exact(envelope.context, "purpose,revision,runId,tenantId,vaultId") ||
      Object.entries(expected).some(([k, v]) => envelope.context[k as keyof Context] !== v))
    throw unavailable();
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(envelope.iv, 12) as BufferSource,
    additionalData: aad(expected) as BufferSource, tagLength: 128 }, key,
  decode(envelope.ciphertext, plaintextLength + 16) as BufferSource);
  return new Uint8Array(plain);
}

/** Create random keys; wallet addresses/signatures are not entropy inputs.
 * The caller must establish durable local storage AND a recoverable enrollment
 * before using this vault for uploads. Nothing here saves or syncs it. */
export async function createPrivateVault(tenantId: string, existingVaultId?: string): Promise<{
  vault: PrivateVault; recoverySecret: Uint8Array; recoveryEnvelope: PrivateVaultEnvelope;
}> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const recoverySecret = crypto.getRandomValues(new Uint8Array(32));
  try {
    const vaultId = existingVaultId ?? crypto.randomUUID();
    const expected = context(tenantId, vaultId, null, "vault-recovery");
    const key = await importKey(raw);
    const recoveryEnvelope = await seal(await importKey(recoverySecret), expected, raw);
    return { vault: { tenantId, vaultId, key }, recoverySecret, recoveryEnvelope };
  } catch { recoverySecret.fill(0); throw unavailable(); }
  finally { raw.fill(0); }
}

/** On another device, the secret unlocks a downloaded ciphertext envelope.
 * Expected identity comes from the enrolled vault record, not the envelope. */
export async function recoverPrivateVault(recoverySecret: Uint8Array, envelope: PrivateVaultEnvelope,
  expected: { tenantId: string; vaultId: string }): Promise<PrivateVault> {
  let raw: Uint8Array | undefined;
  try {
    raw = await open(await importKey(recoverySecret),
      context(expected.tenantId, expected.vaultId, null, "vault-recovery"), envelope, 32);
    return { ...expected, key: await importKey(raw) };
  } catch { throw unavailable(); }
  finally { raw?.fill(0); }
}

/** These independent random seeds bridge to the existing HPKE report key
 * derivation and worker-state-key envelope once upload integration is wired. */
export async function createPrivateProjectKeys(vault: PrivateVault, runId: string): Promise<{
  secrets: PrivateProjectSecrets; envelope: PrivateVaultEnvelope;
}> {
  let raw: Uint8Array | undefined;
  try {
    const expected = vaultContext(vault, runId);
    raw = crypto.getRandomValues(new Uint8Array(64));
    const envelope = await seal(vault.key, expected, raw);
    return { secrets: { reportKeySeed: raw.slice(0, 32), workerStateKey: raw.slice(32) }, envelope };
  } catch { throw unavailable(); }
  finally { raw?.fill(0); }
}

export async function openPrivateProjectKeys(vault: PrivateVault, runId: string,
  envelope: PrivateVaultEnvelope): Promise<PrivateProjectSecrets> {
  let raw: Uint8Array | undefined;
  try {
    raw = await open(vault.key, vaultContext(vault, runId), envelope, 64);
    return { reportKeySeed: raw.slice(0, 32), workerStateKey: raw.slice(32) };
  } catch { throw unavailable(); }
  finally { raw?.fill(0); }
}

/** Compare immutable envelope fields, independent of JSON/JSONB key order. */
export function samePrivateVaultEnvelope(a: PrivateVaultEnvelope, b: PrivateVaultEnvelope): boolean {
  if (!exact(a, "algorithm,ciphertext,context,iv,version") ||
      !exact(b, "algorithm,ciphertext,context,iv,version") ||
      !exact(a.context, "purpose,revision,runId,tenantId,vaultId") ||
      !exact(b.context, "purpose,revision,runId,tenantId,vaultId")) return false;
  return a.version === b.version && a.algorithm === b.algorithm && a.iv === b.iv && a.ciphertext === b.ciphertext &&
    a.context.tenantId === b.context.tenantId && a.context.vaultId === b.context.vaultId &&
    a.context.runId === b.context.runId && a.context.revision === b.context.revision && a.context.purpose === b.context.purpose;
}

/** Replace only the wrapping key. Content/report seeds and vault identity stay
 * unchanged, so encrypted reports and active worker checkpoints remain valid. */
export async function rewrapPrivateProjectKeys(previous: PrivateVault, replacement: PrivateVault,
  runId: string, envelope: PrivateVaultEnvelope): Promise<PrivateVaultEnvelope> {
  if (previous.tenantId !== replacement.tenantId || previous.vaultId !== replacement.vaultId)
    throw unavailable();
  const secrets = await openPrivateProjectKeys(previous, runId, envelope);
  const raw = new Uint8Array(64);
  try {
    raw.set(secrets.reportKeySeed); raw.set(secrets.workerStateKey, 32);
    return await seal(replacement.key, vaultContext(replacement, runId), raw);
  } finally { raw.fill(0); secrets.reportKeySeed.fill(0); secrets.workerStateKey.fill(0); }
}

/** Reconcile generations after a crash or another device's replacement. */
export function privateVaultEnrollmentAction(local: {
  vaultId: string; revision: number; recoveryEnvelope: PrivateVaultEnvelope;
  pendingReplacement?: { vaultId: string; revision: number; recoveryEnvelope: PrivateVaultEnvelope };
}, remote: { vaultId: string; revision: number; recoveryEnvelope: PrivateVaultEnvelope } | null): 'current' | 'promote' | 'recover' {
  if (!remote || remote.vaultId !== local.vaultId || !Number.isSafeInteger(remote.revision) || remote.revision < local.revision)
    throw unavailable();
  const pending = local.pendingReplacement;
  if (pending && pending.vaultId === local.vaultId && pending.revision === local.revision + 1 &&
      remote.revision === pending.revision && samePrivateVaultEnvelope(remote.recoveryEnvelope, pending.recoveryEnvelope)) return 'promote';
  return samePrivateVaultEnvelope(local.recoveryEnvelope, remote.recoveryEnvelope) ? 'current' : 'recover';
}
