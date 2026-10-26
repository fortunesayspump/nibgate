// Browser WebCrypto foundation only. No storage, wallet, network or UI wiring.
// Recovery material and unwrapped keys must never enter ordinary API payloads.
type Purpose = "vault-recovery" | "vault-password" | "project-keys";
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
export type PrivatePasswordEnvelope = PrivateVaultEnvelope & {
  kdf: { name: "PBKDF2-HMAC-SHA-256"; iterations: 600000; salt: string };
};
export type PrivateRecoveryEnvelope = PrivateVaultEnvelope | {
  version: 2;
  code: PrivateVaultEnvelope;
  password: PrivatePasswordEnvelope;
};
export type PrivatePasskeyRecord = {
  credentialId: string;
  salt: string;
  envelope: { iv: string; ciphertext: string };
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
  if (purpose !== "project-keys" ? runId !== null : typeof runId !== "string" || !UUID.test(runId))
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
function decodeRange(value: unknown, min: number, max: number): Uint8Array {
  if (typeof value !== "string" || value.length > Math.ceil(max / 3) * 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw unavailable();
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  if (bytes.length < min || bytes.length > max || base64(bytes) !== value) throw unavailable();
  return bytes;
}
async function importKey(bytes: Uint8Array): Promise<CryptoKey> {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) throw unavailable();
  return crypto.subtle.importKey("raw", bytes as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function passwordKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  if (typeof password !== "string" || password.normalize("NFC").length < 15 ||
      password.length > 256 || salt.length !== 16) throw unavailable();
  const material = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFC")),
    "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256",
    salt: salt as BufferSource, iterations: 600000 }, material,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function passkeyKey(output: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  if (!(output instanceof Uint8Array) || output.length !== 32 || salt.length !== 32) throw unavailable();
  const material = await crypto.subtle.importKey("raw", output as BufferSource, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: salt as BufferSource,
    info: enc.encode("drnib-private-passkey-v1") }, material,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
function passkeyContext(tenantId: string, vaultId: string): Uint8Array {
  owner(tenantId, vaultId);
  return enc.encode(`drnib-private-passkey-v1\0${tenantId}\0${vaultId}`);
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
export async function createPrivateVault(tenantId: string, existingVaultId?: string, password?: string): Promise<{
  vault: PrivateVault; recoverySecret: Uint8Array; recoveryEnvelope: PrivateRecoveryEnvelope;
}> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const recoverySecret = crypto.getRandomValues(new Uint8Array(32));
  try {
    const vaultId = existingVaultId ?? crypto.randomUUID();
    const expected = context(tenantId, vaultId, null, "vault-recovery");
    const key = await importKey(raw);
    const codeEnvelope = await seal(await importKey(recoverySecret), expected, raw);
    let recoveryEnvelope: PrivateRecoveryEnvelope = codeEnvelope;
    if (password !== undefined) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const wrapped = await seal(await passwordKey(password, salt),
        context(tenantId, vaultId, null, "vault-password"), raw);
      recoveryEnvelope = { version: 2, code: codeEnvelope, password: {
        ...wrapped, kdf: { name: "PBKDF2-HMAC-SHA-256", iterations: 600000, salt: base64(salt) }
      } };
    }
    return { vault: { tenantId, vaultId, key }, recoverySecret, recoveryEnvelope };
  } catch { recoverySecret.fill(0); throw unavailable(); }
  finally { raw.fill(0); }
}

/** On another device, the secret unlocks a downloaded ciphertext envelope.
 * Expected identity comes from the enrolled vault record, not the envelope. */
export async function recoverPrivateVault(recoverySecret: Uint8Array, envelope: PrivateRecoveryEnvelope,
  expected: { tenantId: string; vaultId: string }): Promise<PrivateVault> {
  let raw: Uint8Array | undefined;
  try {
    const codeEnvelope = envelope.version === 2 ? envelope.code : envelope;
    raw = await open(await importKey(recoverySecret),
      context(expected.tenantId, expected.vaultId, null, "vault-recovery"), codeEnvelope, 32);
    return { ...expected, key: await importKey(raw) };
  } catch { throw unavailable(); }
  finally { raw?.fill(0); }
}
export async function recoverPrivateVaultWithPassword(password: string, envelope: PrivateRecoveryEnvelope,
  expected: { tenantId: string; vaultId: string }): Promise<PrivateVault> {
  let raw: Uint8Array | undefined;
  try {
    if (envelope.version !== 2 || !exact(envelope, "code,password,version") ||
        !exact(envelope.password, "algorithm,ciphertext,context,iv,kdf,version") ||
        !exact(envelope.password.kdf, "iterations,name,salt") ||
        envelope.password.kdf.name !== "PBKDF2-HMAC-SHA-256" ||
        envelope.password.kdf.iterations !== 600000) throw unavailable();
    const salt = decode(envelope.password.kdf.salt, 16);
    const sealed: PrivateVaultEnvelope = { version: envelope.password.version,
      algorithm: envelope.password.algorithm, context: envelope.password.context,
      iv: envelope.password.iv, ciphertext: envelope.password.ciphertext };
    raw = await open(await passwordKey(password, salt),
      context(expected.tenantId, expected.vaultId, null, "vault-password"), sealed, 32);
    return { ...expected, key: await importKey(raw) };
  } catch { throw unavailable(); }
  finally { raw?.fill(0); }
}

/** A passkey PRF output wraps the existing random vault key. The authenticator
 * and browser provide the PRF; only ciphertext and the credential ID are saved. */
export async function createPrivatePasskeyRecord(password: string, envelope: PrivateRecoveryEnvelope,
  expected: { tenantId: string; vaultId: string }, credentialId: Uint8Array, salt: Uint8Array,
  output: Uint8Array): Promise<PrivatePasskeyRecord> {
  let raw: Uint8Array | undefined;
  try {
    if (envelope.version !== 2 || !(credentialId instanceof Uint8Array) ||
        credentialId.length < 16 || credentialId.length > 2048 || salt.length !== 32) throw unavailable();
    // Reuse the authenticated password wrapper; a local CryptoKey cannot be exported.
    const record = envelope.password;
    if (!exact(record, "algorithm,ciphertext,context,iv,kdf,version") ||
        !exact(record.kdf, "iterations,name,salt") ||
        record.kdf.name !== "PBKDF2-HMAC-SHA-256" || record.kdf.iterations !== 600000) throw unavailable();
    const sealed: PrivateVaultEnvelope = { version: record.version, algorithm: record.algorithm,
      context: record.context, iv: record.iv, ciphertext: record.ciphertext };
    raw = await open(await passwordKey(password, decode(record.kdf.salt, 16)),
      context(expected.tenantId, expected.vaultId, null, "vault-password"), sealed, 32);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource,
      additionalData: passkeyContext(expected.tenantId, expected.vaultId) as BufferSource,
      tagLength: 128 }, await passkeyKey(output, salt), raw as BufferSource);
    return { credentialId: base64(credentialId), salt: base64(salt),
      envelope: { iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) } };
  } catch { throw unavailable(); }
  finally { raw?.fill(0); }
}

export async function recoverPrivateVaultWithPasskey(output: Uint8Array, record: PrivatePasskeyRecord,
  expected: { tenantId: string; vaultId: string }): Promise<PrivateVault> {
  let raw: Uint8Array | undefined;
  try {
    if (!exact(record, "credentialId,envelope,salt") ||
        !exact(record.envelope, "ciphertext,iv")) throw unavailable();
    const salt = decode(record.salt, 32);
    decodeRange(record.credentialId, 16, 2048);
    raw = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM",
      iv: decode(record.envelope.iv, 12) as BufferSource,
      additionalData: passkeyContext(expected.tenantId, expected.vaultId) as BufferSource,
      tagLength: 128 }, await passkeyKey(output, salt),
      decode(record.envelope.ciphertext, 48) as BufferSource));
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
export function samePrivateVaultEnvelope(a: PrivateRecoveryEnvelope, b: PrivateRecoveryEnvelope): boolean {
  if (a.version === 2 || b.version === 2) {
    if (a.version !== 2 || b.version !== 2 || !exact(a, "code,password,version") || !exact(b, "code,password,version") ||
        a.code?.version !== 1 || b.code?.version !== 1) return false;
    if (!exact(a.password, "algorithm,ciphertext,context,iv,kdf,version") ||
      !exact(b.password, "algorithm,ciphertext,context,iv,kdf,version")) return false;
    const {kdf: aKdf, ...aSealed} = a.password;
    const {kdf: bKdf, ...bSealed} = b.password;
    return samePrivateVaultEnvelope(a.code, b.code) && samePrivateVaultEnvelope(aSealed, bSealed) &&
      exact(aKdf, "iterations,name,salt") && exact(bKdf, "iterations,name,salt") &&
      aKdf.name === bKdf.name && aKdf.iterations === bKdf.iterations && aKdf.salt === bKdf.salt;
  }
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
  vaultId: string; revision: number; recoveryEnvelope: PrivateRecoveryEnvelope;
  pendingReplacement?: { vaultId: string; revision: number; recoveryEnvelope: PrivateRecoveryEnvelope };
}, remote: { vaultId: string; revision: number; recoveryEnvelope: PrivateRecoveryEnvelope } | null): 'current' | 'promote' | 'recover' {
  if (!remote || remote.vaultId !== local.vaultId || !Number.isSafeInteger(remote.revision) || remote.revision < local.revision)
    throw unavailable();
  const pending = local.pendingReplacement;
  if (pending && pending.vaultId === local.vaultId && pending.revision === local.revision + 1 &&
      remote.revision === pending.revision && samePrivateVaultEnvelope(remote.recoveryEnvelope, pending.recoveryEnvelope)) return 'promote';
  return samePrivateVaultEnvelope(local.recoveryEnvelope, remote.recoveryEnvelope) ? 'current' : 'recover';
}
