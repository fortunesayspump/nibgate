"use client";

import { deriveResultKey, hexToBytes } from "./dr-nib-private-crypto";

// Cross-device recovery derives both secrets from a single EIP-712 signature
// over the run id, so any device with the same wallet can rebuild the exact
// report key and worker-state key. Nothing derived here is ever sent to a
// server; the operator only ever holds ciphertext.

const DOMAIN = { name: "Nibgate Private Research", version: "1" } as const;
const TYPES = {
  PrivateRunKeys: [
    { name: "runId", type: "string" },
    { name: "purpose", type: "string" },
  ],
} as const;
const PURPOSE = "drnib-private-v1";

export function privateRunKeyTypedData(runId: string) {
  return { domain: DOMAIN, types: TYPES, primaryType: "PrivateRunKeys", message: { runId, purpose: PURPOSE } } as const;
}

async function expand(info: string, material: Uint8Array, bits: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", material as BufferSource, "HKDF", false, ["deriveBits"]);
  const params: HkdfParams = { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode(info) };
  return new Uint8Array(await crypto.subtle.deriveBits(params, key, bits));
}

export async function derivePrivateKeys(signature: string) {
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature))
    throw new Error("The wallet did not return a usable recovery signature.");
  const material = hexToBytes(signature.slice(2), 65);
  const resultKey = await deriveResultKey(await expand("drnib-report-key-v1", material, 256));
  const stateKey = await expand("drnib-worker-state-key-v1", material, 256);
  return { resultKey, stateKey };
}
