import { bytesToBase64, sealSource, uuidBytes,
  type PrivateContext, type PrivateEnvelope } from "./dr-nib-private-crypto";

// This key is a browser capability, never a broker parameter or persistent
// setting. A tab can reuse it only while its JS memory remains alive.
export function freshWorkerStateKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function encodeWorkerStateKey(sessionId: string, stateKey: Uint8Array): Uint8Array {
  uuidBytes(sessionId);
  if (!(stateKey instanceof Uint8Array) || stateKey.length !== 32)
    throw Error("Invalid private worker state key");
  return new TextEncoder().encode(JSON.stringify({ format: "drnib-worker-key-v1", sessionId,
    stateKeyBase64: bytesToBase64(stateKey) }));
}

export async function sealWorkerStateKey(publicKey: Uint8Array, context: PrivateContext,
  sessionId: string, stateKey: Uint8Array): Promise<PrivateEnvelope> {
  if (context.purpose !== "source") throw Error("Invalid private worker key context");
  const plain = encodeWorkerStateKey(sessionId, stateKey);
  try { return await sealSource(publicKey, context, plain); }
  finally { plain.fill(0); }
}
