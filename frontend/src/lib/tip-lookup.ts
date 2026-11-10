export type HeldTip = {
  id: string;
  title?: string | null;
  contentUrl: string;
  domain?: string | null;
  imageUrl?: string | null;
  amount: number;
  currency?: string | null;
  createdAt: string;
  payerWallet?: string | null;
  paymentProvider?: string | null;
  network?: string | null;
  paymentId?: string | null;
  txHash?: string | null;
};

export type HeldTipsResult = {
  domain: string;
  tips: HeldTip[];
  count: number;
  total: number;
};

export function normalizeTipDomain(input: string): string {
  try {
    const trimmed = input.trim();
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const domain = url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw new Error();
    return domain;
  } catch { throw new Error("Enter a valid domain or page URL."); }
}

export async function fetchHeldTips(apiBase: string, domain: string): Promise<HeldTipsResult> {
  const query = new URLSearchParams({ domain, limit: "100" });
  const response = await fetch(`${apiBase}/hub/tips/held?${query.toString()}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    throw new Error(response.status === 429
      ? "Too many lookups. Please wait a moment and try again."
      : response.status === 400
        ? "Enter a valid domain or page URL."
        : "Pending tips are temporarily unavailable. Please try again.");
  }
  const tips: HeldTip[] = Array.isArray(data.tips) ? data.tips : [];
  return {
    domain: data.domain || domain,
    tips,
    count: Number.isFinite(data.count) ? data.count : tips.length,
    total: Number.isFinite(data.total) ? data.total : tips.reduce((sum, tip) => sum + (Number(tip.amount) || 0), 0),
  };
}
