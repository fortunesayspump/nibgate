// Testnet + mainnet API surface (network chosen in popup settings).
// Content scripts must NOT import this (it uses chrome.storage via network.ts
// in worker/popup contexts only) — they message the background worker.
import { activeNetwork } from './network';

export const CHAIN_ID = 5042002;
export const CHAIN_CAIP2 = 'eip155:5042002';

export type TipResolution =
  | { state: 'resolved'; wallet: string; confidence: number; source: string }
  | { state: 'held'; reason: string }
  | { state: 'unknown' };

export async function resolveContent(
  url: string,
  opts: { pageWallet?: string; hasSdk?: boolean } = {},
): Promise<{
  domain: string;
  title: string;
  author: string;
  hasSdk: boolean;
  resolution: TipResolution;
}> {
  const { hubApi } = await activeNetwork();
  let domain = '';
  try {
    domain = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    domain = '';
  }
  // 1. Hub index (verified records + known content).
  try {
    const res = await fetch(`${hubApi}/hub/resolve?url=${encodeURIComponent(url)}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.wallet) {
        return {
          domain,
          title: '',
          author: '',
          hasSdk: opts.hasSdk ?? false,
          resolution: {
            state: 'resolved',
            wallet: data.wallet,
            confidence: Number(data.confidence ?? 0.9),
            source: data.source || 'hub-index',
          },
        };
      }
    }
  } catch {
    // Offline hub: fall through to page signals, then unknown.
  }
  // 2. Declared page wallet (explicit recipient signal, routing only).
  const pageWallet = (opts.pageWallet || '').trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(pageWallet)) {
    return {
      domain,
      title: '',
      author: '',
      hasSdk: opts.hasSdk ?? false,
      resolution: { state: 'resolved', wallet: pageWallet, confidence: 0.6, source: 'page-signal' },
    };
  }
  // 3. Unknown → hold flow (never blocked, never guessed).
  return { domain, title: '', author: '', hasSdk: opts.hasSdk ?? false, resolution: { state: 'unknown' } };
}

export async function challengeTip(input: {
  contentUrl: string;
  title?: string;
  amount: string;
  recipient?: string;
  paymentRail?: string;
}): Promise<{
  payTo: string;
  payee?: string;
  box?: string;
  paymentRail?: string;
  amount: string;
  network: string;
  accepts?: Array<{ payTo?: string; recipient?: string; amount?: string; extra?: Record<string, unknown>; network?: string }>;
}> {
  const { hubApi } = await activeNetwork();
  const res = await fetch(`${hubApi}/hub/tips/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`tip challenge failed: ${res.status}`);
  return res.json();
}

export async function submitTipProof(input: {
  paymentSignature: string;
  txHash?: string;
  contentUrl: string;
}): Promise<{ ok: boolean; receipt?: unknown }> {
  const { hubApi } = await activeNetwork();
  const res = await fetch(`${hubApi}/hub/tips/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`tip verify failed: ${res.status}`);
  return res.json();
}

// Creator badge: waiting (held) tips for a domain. Powers the "you have $X
// waiting" nudge when a creator browses their own site.
export async function heldTipsForDomain(domain: string): Promise<{ count: number; total: number }> {
  const { hubApi } = await activeNetwork();
  try {
    const res = await fetch(`${hubApi}/hub/tips/held?domain=${encodeURIComponent(domain)}&limit=100`);
    if (!res.ok) return { count: 0, total: 0 };
    const data = await res.json();
    const tips = Array.isArray(data?.tips) ? data.tips : [];
    return { count: tips.length, total: tips.reduce((s: number, t: { amount?: number }) => s + (Number(t.amount) || 0), 0) };
  } catch {
    return { count: 0, total: 0 };
  }
}

// Social proof: settled tip count + total for a domain, from the ledger.
export async function tipStatsForDomain(domain: string): Promise<{ count: number; total: number }> {
  const { hubApi } = await activeNetwork();
  try {
    const res = await fetch(`${hubApi}/hub/ledger?type=tips&limit=100&domain=${encodeURIComponent(domain)}`);
    if (!res.ok) return { count: 0, total: 0 };
    const data = await res.json();
    const activities = Array.isArray(data?.activities) ? data.activities : [];
    return { count: activities.length, total: activities.reduce((s: number, a: { amount?: number }) => s + (Number(a.amount) || 0), 0) };
  } catch {
    return { count: 0, total: 0 };
  }
}
