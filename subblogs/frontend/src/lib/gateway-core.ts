export const ARC_TESTNET_RPC = "https://arc-testnet.drpc.org";
export const GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
export const GATEWAY_MINTER = "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B";
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
export const GATEWAY_API = "https://gateway-api-testnet.circle.com/v1";
export const ARC_DOMAIN = 26;

export const SEL_DEPOSIT = "0x47e7ef24";
export const SEL_APPROVE = "0x095ea7b3";
export const SEL_AVAIL_BALANCE = "0x3ccb64ae";
export const SEL_GATEWAY_MINT = "0x9fb01cc5";

export function addr32(addr: string): string {
  return "000000000000000000000000" + addr.slice(2);
}

export function pad32(hex: string): string {
  return hex.slice(2).padStart(64, "0");
}

export function uint256(v: bigint): string {
  return v.toString(16).padStart(64, "0");
}

export function parse6(amount: string): bigint {
  const [w = "0", f = ""] = amount.split(".");
  return BigInt(w + f.padEnd(6, "0").slice(0, 6));
}

export function shortAddr(addr: string) {
  return addr.slice(0, 6) + "\u2026" + addr.slice(-4);
}

export function rand32(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return "0x" + Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
}

export async function rpc(method: string, params: unknown[]) {
  const r = await fetch(ARC_TESTNET_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.result;
}

export async function getGatewayBalance(address: string): Promise<string> {
  try {
    const d = SEL_AVAIL_BALANCE + addr32(USDC_ADDRESS) + addr32(address);
    const hex = await rpc("eth_call", [{ to: GATEWAY_WALLET, data: d }, "latest"]);
    return (Number(BigInt(hex)) / 1_000_000).toFixed(2) + " USDC";
  } catch { return "\u2014"; }
}

export async function getWalletBalance(address: string): Promise<string> {
  try {
    const hex = await rpc("eth_getBalance", [address, "latest"]);
    return (Number(BigInt(hex)) / 1e18).toFixed(4);
  } catch { return "\u2014"; }
}

export function hex32(v: number | bigint): string {
  return BigInt(v).toString(16).padStart(64, "0");
}

export function encodeGatewayMint(attestation: string, signature: string): string {
  const aBytes = attestation.startsWith("0x") ? attestation.slice(2) : attestation;
  const sBytes = signature.startsWith("0x") ? signature.slice(2) : signature;
  const aLen = aBytes.length / 2;
  const sLen = sBytes.length / 2;
  const aPadded = aBytes.padEnd(Math.ceil(aBytes.length / 64) * 64, "0");
  const sPadded = sBytes.padEnd(Math.ceil(sBytes.length / 64) * 64, "0");
  const offS = 96 + aPadded.length / 2;
  return SEL_GATEWAY_MINT
    + hex32(64)
    + hex32(offS)
    + hex32(aLen) + aPadded
    + hex32(sLen) + sPadded;
}
