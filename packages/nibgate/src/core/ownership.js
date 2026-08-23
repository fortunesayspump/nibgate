// Deterministic EIP-191 message binding a wallet to a resource for
// ownership proofs. The SAME builder must be used by the client that signs
// and the server that recovers the signer — any divergence fails closed.
export function ownershipMessage(resource, address) {
  return `Nibgate ownership confirmation\nresource:${resource?.path || resource?.url || resource?.id || ''}\nwallet:${String(address || '').toLowerCase()}`;
}
