import { recoverMessageAddress } from 'viem';
import { ownershipMessage } from '../core/ownership.js';

// Header carrying the personal_sign signature produced over
// ownershipMessage(resource, address) by the claimed wallet.
export const OWNERSHIP_SIGNATURE_HEADER = 'x-nibgate-ownership-signature';

// Verify that `signature` is a valid EIP-191 personal_sign over the
// deterministic ownership message, made by exactly `address`. This is the
// possession proof that lets a returning owner identify themselves without a
// SIWE session (new device / signed out / SIWE not configured).
export async function verifyOwnershipSignature({ signature, address, resource }) {
  if (!signature) return { ok: false, error: 'ownership-signature-required' };
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(String(address))) return { ok: false, error: 'ownership-address-invalid' };
  try {
    const signer = await recoverMessageAddress({ message: ownershipMessage(resource, address), signature });
    if (signer.toLowerCase() !== String(address).toLowerCase()) {
      return { ok: false, error: 'ownership-signer-mismatch' };
    }
    return { ok: true, address: signer.toLowerCase() };
  } catch {
    return { ok: false, error: 'ownership-signature-invalid' };
  }
}
