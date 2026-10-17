import * as HPKE from "hpke";

// This module is client-only. No private input or result key goes to Dr. Nib's
// ordinary API. The browser bundle and release policy must be pinned outside
// operator-controlled mutable delivery for an operator-blind claim.
const suite = new HPKE.CipherSuite(
  HPKE.KEM_DHKEM_P256_HKDF_SHA256,
  HPKE.KDF_HKDF_SHA256,
  HPKE.AEAD_AES_128_GCM,
);
const enc = new TextEncoder();
const hexPattern = /^[0-9a-f]+$/i;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PrivateContext = {
  tenantId: string; runId: string; objectId: string; revision: 1;
  purpose: "source" | "report"; recipientId: string;
};
export type PrivateEnvelope = {
  version: 2; algorithm: "HPKE-P256-HKDF-SHA256-AES128GCM";
  context: PrivateContext; encapsulatedSecret: string; ciphertext: string;
};

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
export function hexToBytes(hex: string, expectedLength?: number): Uint8Array {
  if (typeof hex !== "string" || hex.length % 2 || !hexPattern.test(hex) ||
      (expectedLength !== undefined && hex.length !== expectedLength * 2)) throw new Error("Invalid hexadecimal value");
  return Uint8Array.from(hex.match(/../g)!, pair => parseInt(pair, 16));
}
export function bytesToBase64(bytes: Uint8Array): string {
  let output = "";
  for (let i = 0; i < bytes.length; i += 8192) output += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(output);
}
export function base64ToBytes(value: string, expectedLength?: number, maxLength = 4 * 1024 * 1024 + 16): Uint8Array {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("Invalid base64 value");
  const raw = atob(value);
  if (raw.length > maxLength || (expectedLength !== undefined && raw.length !== expectedLength)) throw new Error("Invalid base64 length");
  const bytes = Uint8Array.from(raw, character => character.charCodeAt(0));
  if (bytesToBase64(bytes) !== value) throw new Error("Noncanonical base64 value");
  return bytes;
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)));
}
export function freshNonce(): Uint8Array { return crypto.getRandomValues(new Uint8Array(32)); }
export function freshId(): string { return crypto.randomUUID(); }
export function uuidBytes(value: string): Uint8Array {
  if (!uuidPattern.test(value)) throw new Error("Invalid session ID");
  return hexToBytes(value.replaceAll("-", ""), 16);
}
export async function recipientId(publicKey: Uint8Array): Promise<string> {
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error("Invalid P-256 public key");
  return sha256(publicKey);
}
export function contextBytes(context: PrivateContext, purpose: "source" | "report"): Uint8Array {
  if (!context || Object.keys(context).sort().join(",") !== "objectId,purpose,recipientId,revision,runId,tenantId" ||
      !/^[A-Za-z0-9:_-]{1,128}$/.test(context.tenantId) || !uuidPattern.test(context.runId) ||
      !uuidPattern.test(context.objectId) || context.revision !== 1 || context.purpose !== purpose ||
      !/^[0-9a-f]{64}$/i.test(context.recipientId)) throw new Error("Invalid private context");
  return enc.encode(JSON.stringify({ tenantId: context.tenantId, runId: context.runId,
    objectId: context.objectId, revision: 1, purpose, recipientId: context.recipientId }));
}
export async function generateResultKey() {
  const pair = await suite.GenerateKeyPair();
  const publicKey = await suite.SerializePublicKey(pair.publicKey);
  // Keep the public half with the in-memory private credential: hpke needs
  // both halves for P-256 decapsulation when the private key is not extractable.
  return { publicKey, privateKey: pair, recipientId: await recipientId(publicKey) };
}
export async function sealSource(publicKeyBytes: Uint8Array, context: PrivateContext, plain: Uint8Array): Promise<PrivateEnvelope> {
  const aad = contextBytes(context, "source");
  if (plain.length < 1 || plain.length > 4 * 1024 * 1024 || context.recipientId !== await recipientId(publicKeyBytes)) throw new Error("Invalid private source");
  const key = await suite.DeserializePublicKey(publicKeyBytes);
  const sealed = await suite.Seal(key, plain, { aad, info: enc.encode("drnib-source-hpke-v2") });
  return { version: 2, algorithm: "HPKE-P256-HKDF-SHA256-AES128GCM",
    context: JSON.parse(new TextDecoder().decode(aad)) as PrivateContext,
    encapsulatedSecret: bytesToBase64(sealed.encapsulatedSecret), ciphertext: bytesToBase64(sealed.ciphertext) };
}
export async function openReport(privateKey: Awaited<ReturnType<typeof generateResultKey>>["privateKey"],
  envelope: PrivateEnvelope, expected: { tenantId: string; runId: string; objectId: string; recipientId: string }): Promise<string> {
  if (!envelope || Object.keys(envelope).sort().join(",") !== "algorithm,ciphertext,context,encapsulatedSecret,version" ||
      envelope.version !== 2 || envelope.algorithm !== "HPKE-P256-HKDF-SHA256-AES128GCM") throw new Error("Invalid encrypted report");
  const context = envelope.context;
  const aad = contextBytes(context, "report");
  if (context.tenantId !== expected.tenantId || context.runId !== expected.runId ||
      context.objectId !== expected.objectId || context.recipientId !== expected.recipientId) throw new Error("Report identity mismatch");
  const secret = base64ToBytes(envelope.encapsulatedSecret, suite.KEM.Nenc);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  if (ciphertext.length < suite.AEAD.Nt + 1) throw new Error("Invalid encrypted report");
  const plain = await suite.Open(privateKey, secret, ciphertext, { aad, info: enc.encode("drnib-report-hpke-v2") });
  const decoded: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain));
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded) ||
      Object.keys(decoded).join(",") !== "markdown" || typeof (decoded as {markdown: unknown}).markdown !== "string") throw new Error("Invalid report content");
  return (decoded as {markdown: string}).markdown;
}
export function equalHex(a: string, b: string): boolean {
  // Comparison here is against public identifiers, not secret MACs.
  return typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
}
export async function proofDigest(sessionId: string, challenge: Uint8Array): Promise<string> {
  const data = new Uint8Array(enc.encode("drnib-proof-v1\0").length + 16 + challenge.length);
  data.set(enc.encode("drnib-proof-v1\0"), 0);
  data.set(uuidBytes(sessionId), enc.encode("drnib-proof-v1\0").length);
  data.set(challenge, enc.encode("drnib-proof-v1\0").length + 16);
  return sha256(data);
}
export async function expectedReportData(nonce: Uint8Array, sessionId: string, publicKey: Uint8Array): Promise<string> {
  const prefix = enc.encode("drnib-phala-session-v2\0");
  const bytes = new Uint8Array(prefix.length + 32 + 16 + 65);
  bytes.set(prefix, 0); bytes.set(nonce, prefix.length); bytes.set(uuidBytes(sessionId), prefix.length + 32);
  bytes.set(publicKey, prefix.length + 48);
  return `${await sha256(bytes)}${"0".repeat(64)}`;
}
