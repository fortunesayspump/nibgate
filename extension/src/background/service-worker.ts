// Background service worker: owns API calls + payment flow.
// Keys never touch content scripts. Testnet only.
import { challengeTip, submitTipProof, resolveContent, heldTipsForDomain, tipStatsForDomain, refundHeldTip, inferRecipient, decideSettleOrHold, classifyPage, CHAIN_ID, type TipResolution } from '../lib/api-client';
import { activeNetwork } from '../lib/network';
import { fetchBalances } from '../lib/balances';
import {
  hasVault,
  isUnlocked,
  unlockedAccountAddress,
  createVault,
  importVault,
  unlockVault,
  lockVault,
  sendUsdcTransfer,
  sessionSigner,
  revealMnemonic,
  ensureUnlocked,
} from '../lib/embedded-wallet';
import { payGateway } from '../lib/gateway-pay';
// Tabs that announced a live content script, keyed tabId -> url. Tabs that
// finish loading without announcing missed the injection window (extension
// still registering) and get one programmatic re-inject. The DOM dedupe in
// renderCard makes repeats harmless.
const announcedTabs = new Map<number, string>();

// Open tips waiting on the extension window. The page holds only a trigger
// button; amount, review, and approval all live in tip.html. Closing the
// window cancels (the card polls TIP_RESULT and reports it).
type PendingTip = {
  id: string;
  content: { url: string; canonicalUrl: string; title: string; author: string; siteName?: string };
  pageWallet?: string;
  candidateWallets?: Array<{ address: string; context?: string }>;
  hasSdk?: boolean;
  domain: string;
  resolution: TipResolution;
  rail: 'transfer' | 'gateway';
  amount?: string;
  windowId?: number;
};
const pendingTips = new Map<string, PendingTip>();
const tipResults = new Map<string, unknown>();

function forgetTip(id: string, result?: unknown) {
  pendingTips.delete(id);
  if (result !== undefined) {
    tipResults.set(id, result);
    setTimeout(() => tipResults.delete(id), 5 * 60_000);
  } else {
    tipResults.delete(id);
  }
}

chrome.windows?.onRemoved?.addListener((windowId) => {
  for (const [id, p] of pendingTips) {
    if (p.windowId === windowId) forgetTip(id, { ok: false, error: 'Cancelled.' });
  }
});

// Content scripts open a keepalive port for the duration of a tip so the
// worker (and the unlocked session key) survives the multi-step flow.
chrome.runtime.onConnect?.addListener((port) => {
  if (port.name !== 'nibgate-keepalive') return;
  port.onDisconnect.addListener(() => {});
});

chrome.tabs?.onUpdated?.addListener((tabId, info, tab) => {
  if (info.status !== 'complete' || !tab.url?.startsWith('http')) return;
  setTimeout(async () => {
    try {
      if (announcedTabs.get(tabId) === tab.url) return;
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    } catch {}
  }, 3000);
});
chrome.tabs?.onRemoved?.addListener((tabId) => {
  announcedTabs.delete(tabId);
});

type Assess = {
  type: 'ASSESS';
  content: { url: string; canonicalUrl: string; title: string; author: string };
  pageWallet?: string;
  hasSdk?: boolean;
};

chrome.runtime.onMessage.addListener((msg: any, sender, respond) => {
  if (msg?.type === 'CONTENT_READY') {
    if (sender?.tab?.id != null) announcedTabs.set(sender.tab.id, String(msg.url || ''));
    respond({ ok: true });
    return false;
  }
  if (msg?.type === 'BALANCES') {
    (async () => {
      try {
        // Rehydrate first: a cold worker has empty memory even though the
        // session persists in storage.session. Without this the popup shows
        // "No wallet" with blank balances until something else unlocks.
        await ensureUnlocked().catch(() => false);
        // Explicit address wins; otherwise the live session account. No
        // stored watch-address: it was write-only dead state, now removed.
        let address = String(msg.address || '');
        if (!address) {
          try {
            const { unlockedAccountAddress } = await import('../lib/embedded-wallet.js');
            address = unlockedAccountAddress();
          } catch {}
        }
        if (!address) return respond({ ok: true, balances: { wallet: null, gateway: null }, address: '' });
        const balances = await fetchBalances(address);
        respond({ ok: true, balances, address });
      } catch (e) {
        respond({ ok: false, error: String((e as Error)?.message || e) });
      }
    })();
    return true;
  }
  if (msg?.type === 'VAULT_STATUS') {
    (async () => {
      respond({ ok: true, hasVault: await hasVault(), unlocked: await ensureUnlocked(), address: unlockedAccountAddress() });
    })();
    return true;
  }
  if (msg?.type === 'VAULT_CREATE') {
    (async () => {
      try {
        const out = await createVault(String(msg.password || ''));
        respond({ ok: true, ...out });
      } catch (e) {
        respond({ ok: false, error: String((e as Error)?.message || e) });
      }
    })();
    return true;
  }
  if (msg?.type === 'VAULT_IMPORT') {
    (async () => {
      try {
        const out = await importVault(String(msg.mnemonic || ''), String(msg.password || ''));
        respond({ ok: true, ...out });
      } catch (e) {
        respond({ ok: false, error: String((e as Error)?.message || e) });
      }
    })();
    return true;
  }
  if (msg?.type === 'VAULT_UNLOCK') {
    (async () => {
      try {
        const out = await unlockVault(String(msg.password || ''));
        respond({ ok: true, ...out });
      } catch (e) {
        respond({ ok: false, error: String((e as Error)?.message || e) });
      }
    })();
    return true;
  }
  if (msg?.type === 'VAULT_LOCK') {
    (async () => {
      await lockVault();
      respond({ ok: true });
    })();
    return true;
  }
  // Locked-wallet UX: open the unlock popup so the user can act immediately.
  if (msg?.type === 'OPEN_UNLOCK') {
    try {
      chrome.windows.create({ url: chrome.runtime.getURL('popup.html'), type: 'popup', width: 380, height: 620 });
      respond({ ok: true });
    } catch (e) {
      respond({ ok: false, error: String((e as Error)?.message || e) });
    }
    return true;
  }
  if (msg?.type === 'VAULT_REVEAL') {
    (async () => {
      try {
        const mnemonic = await revealMnemonic(String(msg.password || ''));
        respond({ ok: true, mnemonic });
      } catch (e) {
        respond({ ok: false, error: String((e as Error)?.message || e) });
      }
    })();
    return true;
  }
  // Send USDC out of the embedded wallet (wallet-style Send).
  if (msg?.type === 'SEND_USDC') {
    (async () => {
      try {
        const to = String(msg.to || '');
        const amountUsdc = Number(msg.amountUsdc);
        const { activeNetwork } = await import('../lib/network.js');
        const net = await activeNetwork();
        const { txHash } = await sendUsdcTransfer({ to, amountUsdc, rpcUrl: net.rpcUrl, chainId: net.chainId });
        const receipt = { type: 'send', amount: amountUsdc, recipientWallet: to, txHash, timestamp: new Date().toISOString(), title: 'Send' };
        await recordReceipt(receipt);
        respond({ ok: true, txHash });
      } catch (e) {
        respond({ ok: false, error: String((e as Error)?.message || e) });
      }
    })();
    return true;
  }
  // Gateway funding: wallet ↔ Gateway ledger via the Circle SDK.
  // Deposit = approve + deposit (never a plain transfer — those lose funds).
  // Withdraw = instant same-chain transfer flow (attestation + mint).
  if (msg?.type === 'GATEWAY_DEPOSIT' || msg?.type === 'GATEWAY_WITHDRAW') {
    (async () => {
      try {
        const amountUsdc = Number(msg.amountUsdc);
        if (!(amountUsdc > 0)) throw new Error('Enter an amount above zero.');
        const { depositToGateway, withdrawFromGateway } = await import('../lib/gateway-funds.js');
        const out = msg.type === 'GATEWAY_DEPOSIT'
          ? await depositToGateway(amountUsdc)
          : await withdrawFromGateway(amountUsdc);
        const txHash = (out as { depositTxHash?: string }).depositTxHash || (out as { txHash?: string }).txHash || '';
        const receipt = {
          type: msg.type === 'GATEWAY_DEPOSIT' ? 'gateway-deposit' : 'gateway-withdraw',
          amount: amountUsdc,
          txHash,
          timestamp: new Date().toISOString(),
          title: msg.type === 'GATEWAY_DEPOSIT' ? 'Gateway deposit' : 'Gateway withdraw',
        };
        await recordReceipt(receipt);
        respond({ ok: true, ...out, txHash, receipt });
      } catch (e) {
        respond({ ok: false, error: String((e as Error)?.message || e) });
      }
    })();
    return true;
  }
  // Pre-confirm gas estimate for popup Send review. Fail-open by design.
  if (msg?.type === 'ESTIMATE_SEND_FEE') {
    (async () => {
      try {
        const to = String(msg.to || '');
        const amountUsdc = Number(msg.amountUsdc);
        if (!/^0x[a-fA-F0-9]{40}$/.test(to) || !(amountUsdc > 0)) return respond({ ok: true, feeUsdc: '' });
        const { activeNetwork } = await import('../lib/network.js');
        const net = await activeNetwork();
        const { estimateTransferFee } = await import('../lib/embedded-wallet.js');
        const est = await estimateTransferFee({ to, amountUsdc, rpcUrl: net.rpcUrl, chainId: net.chainId });
        respond({ ok: true, feeUsdc: est?.feeUsdc || '' });
      } catch {
        respond({ ok: true, feeUsdc: '' });
      }
    })();
    return true;
  }
  // Tip window protocol (tip.html): the page holds only a trigger button.
  // TIP_OPEN resolves the creator (no amount yet) and opens the window.
  // The window drives TIP_CHALLENGE (amount → review) then TIP_EXECUTE
  // (user pressed Approve — the click IS the approval). The card polls
  // TIP_RESULT for the receipt. Closing the window cancels.
  if (msg?.type === 'TIP_OPEN') {
    (async () => {
      try {
        const content = msg.content;
        const target = content.canonicalUrl || content.url;
        const rail = await activeRail(msg.rail);
        const resolution = await resolveTip(target, {
          pageWallet: msg.pageWallet,
          hasSdk: msg.hasSdk,
          candidateWallets: Array.isArray(msg.candidateWallets) ? msg.candidateWallets : [],
          title: content.title,
          author: content.author,
          siteName: content.siteName,
        });
        const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
        pendingTips.set(id, {
          id,
          content: {
            url: content.url, canonicalUrl: content.canonicalUrl, title: content.title,
            author: content.author, siteName: content.siteName,
          },
          pageWallet: msg.pageWallet,
          candidateWallets: Array.isArray(msg.candidateWallets) ? msg.candidateWallets : [],
          hasSdk: msg.hasSdk,
          domain: resolution.domain,
          resolution: resolution.resolution,
          rail,
        });
        try {
          const w = await chrome.windows.create({ url: chrome.runtime.getURL(`tip.html?id=${encodeURIComponent(id)}`), type: 'popup', width: 380, height: 600 });
          const p = pendingTips.get(id);
          if (p && w?.id != null) p.windowId = w.id;
        } catch {
          pendingTips.delete(id);
          return respond({ ok: false, error: 'Could not open tip window.' });
        }
        respond({ ok: true, id });
      } catch (e) {
        respond({ ok: false, error: String((e as Error)?.message || e) });
      }
    })();
    return true;
  }
  if (msg?.type === 'TIP_GET') {
    const p = pendingTips.get(String(msg.id || ''));
    if (!p) return respond({ ok: false, error: 'Unknown or expired tip.' });
    (async () => {
      const net = await activeNetwork();
      const r = p.resolution;
      respond({
        ok: true,
        tip: {
          title: p.content.title,
          siteName: p.content.siteName || '',
          domain: p.domain,
          held: r.state !== 'resolved',
          recipient: r.state === 'resolved' ? r.wallet : '',
          source: r.state === 'resolved' ? r.source : '',
          rail: p.rail,
        },
        network: { label: net.label, chainId: net.chainId, explorer: net.explorer },
      });
    })();
    return true;
  }
  if (msg?.type === 'TIP_CHALLENGE') {
    (async () => {
      try {
        const p = pendingTips.get(String(msg.id || ''));
        if (!p) return respond({ ok: false, error: 'Unknown or expired tip.' });
        const amount = String(Number(msg.amount) || '');
        if (!(Number(amount) > 0)) return respond({ ok: false, error: 'Enter an amount above zero.' });
        await ensureUnlocked();
        if (!isUnlocked()) return respond({ ok: true, needsUnlock: true });
        const { activeNetwork } = await import('../lib/network.js');
        const net = await activeNetwork();
        const target = p.content.canonicalUrl || p.content.url;
        const r = p.resolution;
        p.amount = amount;
        if (r.state !== 'resolved') {
          const res = await fetch(`${net.hubApi}/hub/tips/hold`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ contentUrl: target, title: p.content.title, amount, domain: p.domain, paymentRail: p.rail }),
          });
          if (!res.ok) throw await notOk(res, 'tip hold challenge');
          const chal = await res.json();
          const box = String(chal?.box || chal?.accepts?.[0]?.payTo || '');
          let gasFeeUsdc = '';
          if (p.rail === 'transfer' && box) {
            try {
              const { estimateTransferFee } = await import('../lib/embedded-wallet.js');
              const est = await estimateTransferFee({ to: box, amountUsdc: Number(amount), rpcUrl: net.rpcUrl, chainId: net.chainId });
              if (est) gasFeeUsdc = est.feeUsdc;
            } catch {}
          }
          return respond({
            ok: true,
            held: true,
            review: { amount, recipient: '', payee: box, title: p.content.title, contentUrl: target, domain: p.domain, rail: p.rail, ...(gasFeeUsdc ? { gasFeeUsdc } : {}) },
          });
        }
        const challenge = await challengeTip({
          contentUrl: target,
          title: p.content.title,
          amount,
          recipient: r.wallet,
          paymentRail: p.rail,
        });
        const payTo = String(challenge?.payee || challenge?.payTo || challenge?.accepts?.[0]?.payTo || '');
        if (!payTo) throw new Error('Challenge has no payee.');
        // Pre-confirm gas estimate (transfer rail only — gateway pays via
        // signature, no user tx). Fail-open: no row rather than a guess.
        let gasFeeUsdc = '';
        if (p.rail === 'transfer') {
          try {
            const { estimateTransferFee } = await import('../lib/embedded-wallet.js');
            const est = await estimateTransferFee({ to: payTo, amountUsdc: Number(amount), rpcUrl: net.rpcUrl, chainId: net.chainId });
            if (est) gasFeeUsdc = est.feeUsdc;
          } catch {}
        }
        return respond({
          ok: true,
          review: {
            amount, recipient: r.wallet, payee: payTo,
            title: p.content.title, contentUrl: target, rail: p.rail, source: r.source || '',
            ...(gasFeeUsdc ? { gasFeeUsdc } : {}),
          },
        });
      } catch (e) {
        respond({ ok: false, error: String((e as Error)?.message || e) });
      }
    })();
    return true;
  }
  if (msg?.type === 'TIP_EXECUTE') {
    (async () => {
      try {
        const p = pendingTips.get(String(msg.id || ''));
        if (!p || !p.amount) return respond({ ok: false, error: 'Unknown or expired tip.' });
        const { activeNetwork } = await import('../lib/network.js');
        const net = await activeNetwork();
        const r = p.resolution;
        const target = p.content.canonicalUrl || p.content.url;
        const out = await tipConfirmFlow({
          contentUrl: target,
          title: p.content.title,
          amount: p.amount,
          recipient: r.state === 'resolved' ? r.wallet : '',
          rail: p.rail,
          held: r.state !== 'resolved',
          domain: p.domain,
        }, net);
        const result = { ok: true, ...out };
        forgetTip(p.id, result);
        respond(result as Record<string, unknown>);
      } catch (e) {
        const result = { ok: false, error: String((e as Error)?.message || e) };
        try { forgetTip(String(msg.id || ''), result); } catch {}
        respond(result);
      }
    })();
    return true;
  }
  if (msg?.type === 'TIP_CANCEL') {
    forgetTip(String(msg.id || ''), { ok: false, error: 'Cancelled.' });
    respond({ ok: true });
    return false;
  }
  if (msg?.type === 'TIP_RESULT') {
    const done = tipResults.get(String(msg.id || ''));
    if (done) return respond({ ok: true, done: true, ...(done as Record<string, unknown>) });
    if (pendingTips.has(String(msg.id || ''))) return respond({ ok: true, done: false });
    respond({ done: true, ok: false, error: 'Cancelled.' });
    return false;
  }
  if (msg?.type === 'ASSESS') {
    (async () => {
      try {
        const resolution = await resolveContent(msg.content.canonicalUrl || msg.content.url, {
          pageWallet: (msg as Assess).pageWallet,
          hasSdk: (msg as Assess).hasSdk,
        });
        respond({ ok: true, resolution: resolution.resolution, hasSdk: resolution.hasSdk, domain: resolution.domain });
      } catch (e) {
        respond({ ok: false, error: String((e as Error)?.message || e) });
      }
    })();
    return true;
  }
  // Low-confidence page classification: the deterministic page model handles
  // clear cases; the content script asks here only when its own judgment is
  // inconclusive. A confident probability lets it render; otherwise it stays
  // silent (we never tip on a coin flip).
  if (msg?.type === 'JEV_CLASSIFY') {
    (async () => {
      try {
        const out = await classifyPage({ state: String(msg.state || '') });
        respond(out ? { ok: true, probability: out.probability } : { ok: false, error: 'no-judgment' });
      } catch (e) {
        respond({ ok: false, error: String((e as Error)?.message || e) });
      }
    })();
    return true;
  }
  if (msg?.type === 'TIP_REFUND') {
    (async () => {
      try {
        await ensureUnlocked();
        if (!isUnlocked()) return respond({ ok: false, needsUnlock: true });
        const signer = sessionSigner();
        if (!signer) throw new Error('Wallet locked.');
        const domain = String(msg.domain || '');
        if (!domain) throw new Error('Missing domain.');
        const message = `Nibgate tip refund\nDomain: ${domain}\nWallet: ${signer.address.toLowerCase()}\nIssued: ${new Date().toISOString()}`;
        const signature = await signer.signMessage(message);
        const out = await refundHeldTip({ domain, payer: signer.address, message, signature, amount: msg.amount });
        respond({ ok: true, ...out });
      } catch (e) {
        respond({ ok: false, error: String((e as Error)?.message || e) });
      }
    })();
    return true;
  }
  if (msg?.type === 'TIP_START' || msg?.type === 'TIP_CONFIRM') {
    return respond({ ok: false, error: 'Outdated extension page — reload the extension and try again.' });
  }
  return false;
});

// Shared creator resolution for TIP_OPEN: hub index → page wallet → JEV
// candidate inference → settle-vs-hold gate for unverified page wallets.
// Anything but a confident resolution holds for the verified owner.
async function resolveTip(
  target: string,
  opts: {
    pageWallet?: string; hasSdk?: boolean;
    candidateWallets?: Array<{ address: string; context?: string }>;
    title?: string; author?: string; siteName?: string;
  },
): Promise<{ domain: string; resolution: TipResolution }> {
  let resolution = await resolveContent(target, { pageWallet: opts.pageWallet, hasSdk: opts.hasSdk });
  if (resolution.resolution.state !== 'resolved' && Array.isArray(opts.candidateWallets) && opts.candidateWallets.length) {
    const inferred = await inferRecipient({
      contentUrl: target,
      title: opts.title,
      author: opts.author,
      siteName: opts.siteName,
      candidates: opts.candidateWallets,
    });
    if (inferred) {
      resolution = {
        ...resolution,
        resolution: { state: 'resolved', wallet: inferred.wallet, confidence: inferred.confidence, source: 'jev-model' },
      };
    }
  }
  if (resolution.resolution.state === 'resolved' && resolution.resolution.source === 'page-signal') {
    const verdict = await decideSettleOrHold({
      contentUrl: target,
      title: opts.title,
      author: opts.author,
      siteName: opts.siteName,
      wallet: resolution.resolution.wallet,
      walletContext: 'declared page wallet, not hub-verified',
    });
    if (!verdict.settle) {
      resolution = {
        ...resolution,
        resolution: { state: 'held', reason: 'unverified recipient held for verified owner' },
      };
    }
  }
  return resolution;
}

// Preferred rail: explicit message > stored setting > direct transfer.
async function activeRail(requested?: string): Promise<'transfer' | 'gateway'> {
  const value = String(requested || '').toLowerCase();
  if (value === 'gateway' || value === 'transfer') return value;
  try {
    const stored = await chrome.storage.local.get(['nibgateRail']);
    return stored.nibgateRail === 'gateway' ? 'gateway' : 'transfer';
  } catch {
    return 'transfer';
  }
}

// Pay a challenge with the chosen rail, returning the proof the hub verifies.
async function payChallenge(
  challenge: any,
  rail: 'transfer' | 'gateway',
  net: { rpcUrl: string; chainId: number },
): Promise<{ txHash?: string; paymentSignature?: string; paymentRail: string }> {
  if (rail === 'gateway') {
    const signer = sessionSigner();
    if (!signer) throw new Error('Wallet is locked — unlock to pay with Gateway.');
    const { paymentSignature } = await payGateway({ challenge, signer });
    return { paymentSignature, paymentRail: 'gateway' };
  }
  const accepts = Array.isArray(challenge?.accepts) ? challenge.accepts : [];
  const payTo = String(challenge?.payee || challenge?.payTo || accepts[0]?.payTo || accepts[0]?.recipient || '');
  if (!payTo) throw new Error('Challenge has no payee.');
  const { txHash } = await sendUsdcTransfer({ to: payTo, amountUsdc: Number(challenge?.amount || accepts[0]?.amount), rpcUrl: net.rpcUrl, chainId: net.chainId });
  return { txHash, paymentRail: 'transfer' };
}

// Confirmed execution. Two shapes:
//   resolved → challenge/verify to the creator's payee
//   held     → fund the domain holding box, record a held tip for later claim
async function tipConfirmFlow(
  input: { contentUrl: string; title?: string; amount: string; recipient?: string; rail?: string; held?: boolean; domain?: string },
  net: { hubApi: string; rpcUrl: string; chainId: number },
): Promise<{ receipt: unknown; txHash?: string; paymentSignature?: string; held?: boolean; heldCount?: number; heldTotal?: number }> {
  const amount = String(input.amount || '');
  if (!(Number(amount) > 0)) throw new Error('Tip amount must be above zero.');
  const rail = await activeRail(input.rail);
  await ensureUnlocked();
  const walletAddress = unlockedAccountAddress();

  if (input.held) {
    const domain = String(input.domain || '').trim() || (() => { try { return new URL(input.contentUrl).hostname; } catch { return ''; } })();
    if (!domain) throw new Error('Missing domain for held tip.');
    const chalRes = await fetch(`${net.hubApi}/hub/tips/hold`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contentUrl: input.contentUrl, title: input.title, amount, domain, paymentRail: rail, walletAddress }),
    });
    if (!chalRes.ok) throw await notOk(chalRes, 'tip hold challenge');
    const challenge = await chalRes.json();
    const proof = await payChallenge(challenge, rail, net);
    const verifyRes = await fetch(`${net.hubApi}/hub/tips/hold`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(proof.paymentSignature ? { 'payment-signature': proof.paymentSignature } : {}),
      },
      body: JSON.stringify({
        contentUrl: input.contentUrl, title: input.title, amount, domain, walletAddress,
        paymentRail: rail, txHash: proof.txHash,
      }),
    });
    if (!verifyRes.ok) throw await notOk(verifyRes, 'tip hold verify');
    const held = await verifyRes.json();
    await recordReceipt({ ...(held?.tip || {}), amount, title: input.title });
    const stats = await heldTipsForDomain(domain).catch(() => ({ count: 0, total: 0 }));
    return { receipt: held?.tip || {}, held: true, txHash: proof.txHash, heldCount: stats.count, heldTotal: stats.total };
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(input.recipient || '')) throw new Error('No recipient to tip.');
  const challengeRes = await fetch(`${net.hubApi}/hub/tips/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contentUrl: input.contentUrl, title: input.title, amount, recipient: input.recipient, paymentRail: rail }),
  });
  if (!challengeRes.ok) throw await notOk(challengeRes, 'tip challenge');
  const challenge = await challengeRes.json();
  const proof = await payChallenge(challenge, rail, net);
  const verifyRes = await fetch(`${net.hubApi}/hub/tips/verify`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(proof.paymentSignature ? { 'payment-signature': proof.paymentSignature } : {}),
    },
    body: JSON.stringify({
      contentUrl: input.contentUrl, title: input.title, amount, recipient: input.recipient,
      paymentRail: rail, txHash: proof.txHash, walletAddress, paymentSignature: proof.paymentSignature,
    }),
  });
  if (!verifyRes.ok) throw await notOk(verifyRes, 'tip verify');
  const verified = await verifyRes.json();
  await recordReceipt({ ...(verified?.receipt || {}), txHash: proof.txHash, amount, title: input.title });
  return { receipt: verified?.receipt || { txHash: proof.txHash }, txHash: proof.txHash, paymentSignature: proof.paymentSignature };
}

async function notOk(res: Response, label: string): Promise<Error> {
  // Always surface the hub's error body — a bare status is undebuggable.
  const body = await res.text().catch(() => '');
  const detail = body.slice(0, 300);
  return new Error(`${label} failed: ${res.status}${detail ? ` — ${detail}` : ''}`);
}

// Persist tip history for the popup.
export async function recordReceipt(receipt: unknown) {
  const { history = [] } = await chrome.storage.local.get('history');
  await chrome.storage.local.set({ history: [receipt, ...(history as unknown[])].slice(0, 100) });
}
