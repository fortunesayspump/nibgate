// Active Arc network for this subblog frontend build.
// NEXT_PUBLIC_NIBGATE_NETWORK=mainnet|testnet, default testnet (a missing var
// must never point a build at mainnet money).
export function activeNetworkName(): "mainnet" | "testnet" {
  return (process.env.NEXT_PUBLIC_NIBGATE_NETWORK || "testnet").toLowerCase() === "mainnet"
    ? "mainnet"
    : "testnet";
}

export function activePaymentNetwork(): string {
  return activeNetworkName() === "mainnet" ? "eip155:5042" : "eip155:5042002";
}

export function activeChainId(): number {
  return activeNetworkName() === "mainnet" ? 5042 : 5042002;
}

// Hub API base for cross-stack calls (reputation indexing). The subblog API
// itself is same-origin via rewrites; the hub lives on a separate host.
export function hubApiBase(): string {
  const raw = (process.env.NEXT_PUBLIC_HUB_API_URL || "").replace(/\/+$/, "");
  if (raw) return raw;
  return activeNetworkName() === "mainnet" ? "https://api.nibgate.xyz" : "https://testnet-api.nibgate.xyz";
}
