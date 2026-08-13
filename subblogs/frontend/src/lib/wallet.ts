export function shortAddress(address: string): string {
  if (!address) return "";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return value.toLocaleString("en-US", { minimumFractionDigits: value % 1 === 0 ? 0 : 2, maximumFractionDigits: 6 });
}

export const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;