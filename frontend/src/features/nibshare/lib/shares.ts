import type { ShareSummary } from "../types";

export function shortAddress(address?: string | null): string {
  if (!address) return "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatUsd(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function timeLeft(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const d = Math.floor(ms / 864e5);
  const h = Math.floor((ms % 864e5) / 36e5);
  const m = Math.floor((ms % 36e5) / 6e4);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

export function isEnded(share: Pick<ShareSummary, "status" | "expiresAt">): boolean {
  if (share.status === "revoked" || share.status === "expired") return true;
  if (share.status === "active" && share.expiresAt && new Date(share.expiresAt).getTime() <= Date.now()) return true;
  return false;
}

export function endLabel(share: Pick<ShareSummary, "status">): string {
  if (share.status === "revoked") return "revoked";
  return "expired";
}
