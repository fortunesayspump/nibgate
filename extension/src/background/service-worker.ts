// Background service worker: owns API calls + payment flow.
// Keys never touch content scripts. Testnet only.
import { challengeTip, submitTipProof, resolveContent, heldTipsForDomain, tipStatsForDomain, CHAIN_ID } from '../lib/api-client';
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

const WATCH_KEY = 'nibgateWatchAddress';
// Tabs that announced a live content script, keyed tabId -> url. Tabs that
// finish loading without announcing missed the injection window (extension
// still registering) and get one programmatic re-inject. The DOM dedupe in
// renderCard makes repeats harmless.
const announcedTabs = new Map<number, string>();

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

type TipStart = {
  type: 'TIP_START';
  amount: string;
  content: { url: string; canonicalUrl: string; title: string; author: string };
  pageWallet?: string;
  hasSdk?: boolean;
};

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
        let address = String(msg.address || '');
        if (!address) {
          const stored = await chrome.storage.local.get([WATCH_KEY]);
          address = String(stored[WATCH_KEY] || '');
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
  if (msg?.type === 'SET_WATCH') {
    (async () => {
      await chrome.storage.local.set({ [WATCH_KEY]: String(msg.address || '') });
      respond({ ok: true });
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
  // Confirmed tip: resolve + challenge were already presented for review in
  // the page (consequence design — nothing signs blind). Requires unlocked.
  if (msg?.type === 'TIP_CONFIRM') {
    (async () => {
      try {
        const { contentUrl, title, amount, recipient, rail, held, domain } = msg;
        const { activeNetwork } = await import('../lib/network.js');
        const net = await activeNetwork();
        const out = await tipConfirmFlow({ contentUrl, title, amount, recipient, rail, held, domain }, net);
        respond({ ok: true, ...out });
      } catch (e) {
        respond({ ok: false, error: String((e as Error)?.message || e) });
      }
    })();
    return true;
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
  if (msg?.type !== 'TIP_START') return false;
  (async () => {
    try {
      const amount = msg.amount === 'custom' ? await promptAmount() : msg.amount;
      if (!amount) return respond({ ok: false, error: 'cancelled' });
      const target = msg.content.canonicalUrl || msg.content.url;
      const rail = await activeRail(msg.rail);
      await ensureUnlocked();
      const resolution = await resolveContent(target, { pageWallet: msg.pageWallet, hasSdk: msg.hasSdk });
      if (resolution.resolution.state !== 'resolved') {
        // Unknown creator: fund a no-key holding box; the owner claims later.
        let domain = resolution.domain;
        if (!domain) { try { domain = new URL(target).hostname; } catch {} }
        const { hubApi } = await activeNetwork();
        const res = await fetch(`${hubApi}/hub/tips/hold`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ contentUrl: target, title: msg.content.title, amount: String(amount), domain, paymentRail: rail }),
        });
        if (!res.ok) throw new Error(`tip hold failed: ${res.status}`);
        const chal = await res.json();
        const box = String(chal?.box || chal?.accepts?.[0]?.payTo || '');
        return respond({
          ok: true,
          held: true,
          needsUnlock: !isUnlocked(),
          challenge: chal,
          review: {
            amount: String(amount),
            recipient: '',
            payee: box,
            title: msg.content.title,
            contentUrl: target,
            domain: domain || '',
            rail,
          },
        });
      }
      const challenge = await challengeTip({
        contentUrl: target,
        title: msg.content.title,
        amount: String(amount),
        recipient: resolution.resolution.wallet,
        paymentRail: rail,
      });
      const payTo = String(challenge?.payee || challenge?.payTo || challenge?.accepts?.[0]?.payTo || '');
      if (!payTo) throw new Error('Challenge has no payee.');
      return respond({
        ok: true,
        pending: true,
        needsUnlock: !isUnlocked(),
        challenge,
        review: {
          amount: String(amount),
          recipient: resolution.resolution.wallet,
          payee: payTo,
          title: msg.content.title,
          contentUrl: target,
          rail,
        },
      });
    } catch (e) {
      respond({ ok: false, error: String((e as Error)?.message || e) });
    }
  })();
  return true; // async respond
});

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
    if (!chalRes.ok) throw new Error(`tip hold challenge failed: ${chalRes.status}`);
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
    if (!verifyRes.ok) throw new Error(`tip hold failed: ${verifyRes.status} (tx ${proof.txHash || ''})`);
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
  if (!challengeRes.ok) throw new Error(`tip challenge failed: ${challengeRes.status}`);
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
  if (!verifyRes.ok) throw new Error(`tip verify failed: ${verifyRes.status} (tx ${proof.txHash || ''} still settled onchain)`);
  const verified = await verifyRes.json();
  await recordReceipt({ ...(verified?.receipt || {}), txHash: proof.txHash, amount, title: input.title });
  return { receipt: verified?.receipt || { txHash: proof.txHash }, txHash: proof.txHash, paymentSignature: proof.paymentSignature };
}

async function promptAmount(): Promise<string | null> {
  // TODO(hack): custom amount UI (popup input or inline field).
  return null;
}

// Persist tip history for the popup.
export async function recordReceipt(receipt: unknown) {
  const { history = [] } = await chrome.storage.local.get('history');
  await chrome.storage.local.set({ history: [receipt, ...(history as unknown[])].slice(0, 100) });
}
