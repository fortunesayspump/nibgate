import { configuredPrivatePolicy, verifyGuestEvidence, type GuestSession,
  type PrivatePolicy } from "./dr-nib-private-verifier";
import { bytesToBase64 } from "./dr-nib-private-crypto";

type OnlineMode = { mode: "online-verifier"; policy: PrivatePolicy };
type ReviewedBootMode = { mode: "reviewed-boot"; payloadBase64: string; reviewedSha256Hex: string };
export type PrivateVerificationMode = OnlineMode | ReviewedBootMode;

// An exact-measurement manifest is useful only for the measured boot reviewed
// by an independent reviewer. It must be renewed after restart/release
// rotation. Both exact manifest bytes and their independently checked digest
// are embedded in the locally pinned client build, never taken from the guest.
const boot = {
  manifestJson: process.env.NEXT_PUBLIC_DRNIB_PRIVATE_BOOT_MANIFEST_JSON,
  reviewedSha256Hex: process.env.NEXT_PUBLIC_DRNIB_PRIVATE_BOOT_MANIFEST_SHA256,
};

export function configuredPrivateVerification(): PrivateVerificationMode | null {
  // Choosing online verification is deliberate. A broken/unreachable online
  // verifier cannot silently fall back to a different trust route.
  if (process.env.NEXT_PUBLIC_DRNIB_PRIVATE_VERIFIER_URL) {
    const policy = configuredPrivatePolicy();
    return policy ? { mode: "online-verifier", policy } : null;
  }
  if (!boot.manifestJson && !boot.reviewedSha256Hex) return null;
  if (!boot.manifestJson || !boot.reviewedSha256Hex ||
      !/^[0-9a-f]{64}$/i.test(boot.reviewedSha256Hex) ||
      new TextEncoder().encode(boot.manifestJson).length > 16 * 1024) return null;
  return { mode: "reviewed-boot", payloadBase64: bytesToBase64(new TextEncoder().encode(boot.manifestJson)),
    reviewedSha256Hex: boot.reviewedSha256Hex };
}

export async function verifyPrivateSession({ mode, session, nonce, publicKey }:
  { mode: PrivateVerificationMode; session: GuestSession; nonce: Uint8Array; publicKey: Uint8Array }): Promise<void> {
  if (mode.mode === "online-verifier") {
    await verifyGuestEvidence({ session, nonce, publicKey, policy: mode.policy });
    return;
  }
  // This lazy import avoids loading WASM and Intel collateral when the fixed
  // configured full-verifier route is selected.
  const { verifyQvlGuest } = await import("./dr-nib-private-qvl");
  await verifyQvlGuest({ evidence: session.evidence, clientNonce: nonce,
    sessionId: session.sessionId, recipientPublicKey: publicKey,
    bootAuthorization: { kind: "bundled", payloadBase64: mode.payloadBase64,
      reviewedSha256Hex: mode.reviewedSha256Hex } });
}
