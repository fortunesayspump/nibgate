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

// Payer refund for unclaimed held tips. The wallet signs a control message and
// the hub relays the on-chain refund (full amount, no fee, payer-only).
export async function refundHeldTip(input: {
  domain: string;
  payer: string;
  message: string;
  signature: string;
  amount?: number;
}): Promise<{ success?: boolean; amount?: number; refundTx?: string; error?: string }> {
  const { hubApi } = await activeNetwork();
  const res = await fetch(`${hubApi}/hub/tips/refund`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) throw new Error(data?.error || `refund failed: ${res.status}`);
  return data;
}

// JEV recipient inference: ask the hub's JEV decisions model (the real
// `~typesafe/jev-latest`, server-side key) to CHOOSE among DOM candidate
// wallets when local resolution fails. Returns null on any failure so callers
// fall through to the hold flow. Never throws. Rules first, model only here.
export async function inferRecipient(input: {
  contentUrl: string; title?: string; author?: string; siteName?: string;
  candidates: Array<{ address: string; context?: string }>;
}): Promise<{ wallet: string; confidence: number } | null> {
  try {
    const wallets = (input.candidates || [])
      .filter((c) => /^0x[a-fA-F0-9]{40}$/.test(c?.address || ''))
      .slice(0, 12);
    if (wallets.length < 2) return null;
    const { hubApi } = await activeNetwork();
    const state = [
      `Page URL: ${input.contentUrl}`,
      input.title ? `Title: ${input.title}` : '',
      input.author ? `Author byline text: ${input.author}` : '',
      input.siteName ? `Site: ${input.siteName}` : '',
      'Wallet addresses found on the page, with where they appeared:',
      ...wallets.map((w) => `- ${w.address}: ${w.context || 'no context'}`),
    ].filter(Boolean).join('\n').slice(0, 4000);
    const res = await fetch(`${hubApi}/hub/jev/decide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        state,
        instructions: 'Choose the wallet that belongs to the creator/author of this page and should receive a tip.',
        questionId: 'recipient',
        candidates: wallets.map((w) => ({ id: w.address, context: (w.context || `${w.address} found on page`).slice(0, 2000) })),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const wallet = String(data?.choice || '');
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) return null;
    const confidence = Number(data?.confidence ?? 0);
    // Same bar as declared page signals: below this we hold, never guess.
    if (!(confidence >= 0.6)) return null;
    return { wallet, confidence };
  } catch {
    return null;
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
