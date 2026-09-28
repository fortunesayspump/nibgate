import { db } from '@nibgate/internal/db.js';
import { activeNetwork } from '@nibgate/internal/networks.js';
import {
  distributeFeeWallet,
  ensureFeeWalletDeployed,
  feeWalletAddressFor,
  feeWalletUsdcBalance,
  sweepFeeWallet,
} from '@nibgate/sdk/server';

let feeKeeperStarted = false;

// ── Creator discovery ───────────────────────────────────────────────────────
// The keeper sweeps every creator that can earn revenue through a fee wallet:
// nibshare owners, hub website owners, per-post recipients (subblog-only
// creators whose user row has no walletAddress), and every address actually
// observed receiving a verified payment. Self-hosted creators (own rail, no
// fee wallet) resolve to their own wallet and are naturally skipped.

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;

function addCreator(set, value) {
  const addr = String(value || '').trim().toLowerCase();
  if (ADDRESS_RE.test(addr)) set.add(addr);
}

async function listCreators() {
  const creators = new Set();
  // Always-sweep allowlist for stranded wallets that earn through a fee
  // wallet but own no sites and have no content/receipt rows carrying them
  // (e.g. after an ownership move). Keeps funds from sitting unswept.
  for (const raw of String(process.env.NIBGATE_FEE_KEEPER_EXTRA_CREATORS || '').split(',')) {
    addCreator(creators, raw);
  }
  try {
    const shares = await db.nibShare.findMany({ select: { ownerWallet: true }, where: { price: { gt: 0 } } });
    for (const s of shares) addCreator(creators, s.ownerWallet);
  } catch (error) {
    console.log('Revenue keeper: nibshare owner discovery failed:', error.message);
  }
  try {
    const users = await db.user.findMany({ select: { walletAddress: true, websites: { select: { id: true } } } });
    for (const u of users) {
      if (u.walletAddress && u.websites?.length) addCreator(creators, u.walletAddress);
    }
  } catch (error) {
    console.log('Revenue keeper: hub owner discovery failed:', error.message);
  }
  try {
    // Per-post recipients cover subblog-only creators: their posts carry
    // recipientWallet even when they never signed in with a wallet, so their
    // fee wallets must still be swept.
    const posts = await db.content.findMany({
      select: { recipientWallet: true },
      where: { price: { gt: 0 }, recipientWallet: { not: null } },
    });
    for (const p of posts) addCreator(creators, p.recipientWallet);
  } catch (error) {
    console.log('Revenue keeper: post-recipient discovery failed:', error.message);
  }
  try {
    // Observed payees: any wallet that actually received a verified payment.
    const receipts = await db.unlockReceipt.findMany({
      select: { recipientWallet: true },
      where: { status: 'verified', recipientWallet: { not: null } },
      distinct: ['recipientWallet'],
    });
    for (const r of receipts) addCreator(creators, r.recipientWallet);
  } catch (error) {
    console.log('Revenue keeper: payment-payee discovery failed:', error.message);
  }
  return [...creators];
}

// ── Second-generation fee-wallet recovery ───────────────────────────────────
// A past bug double-wrapped recipients (creator → fw1 → ghost fw2), sending
// buyer funds to a "ghost" wallet whose creator field points at fw1's ADDRESS
// rather than an EOA. Recovery is permissionless: anyone can deploy the fee
// wallet at the ghost's CREATE2 slot with creator=fw1, then distribute() —
// funds land on fw1, which the normal sweep then pays out to the real creator
// (+ treasury). The keeper does this automatically whenever a ghost holds more
// than a dust threshold (gas costs ~3 txs per recovery).

async function recoverGhostGeneration(feeWallet, options = {}) {
  try {
    const ghost = await feeWalletAddressFor(feeWallet);
    if (!ghost || ghost.toLowerCase() === String(feeWallet).toLowerCase()) return null;
    const minWei = BigInt(
      Math.ceil(Number(process.env.NIBGATE_FEE_KEEPER_MIN_GHOST_USDC || '0.05') * 1e6),
    );
    const balance = await feeWalletUsdcBalance(ghost, options);
    if (balance < minWei) return null;
    await ensureFeeWalletDeployed(ghost, { ...options, creator: feeWallet });
    await distributeFeeWallet(ghost, options);
    console.log(`Revenue keeper: recovered ghost fee wallet ${ghost} → ${feeWallet} (${Number(balance) / 1e6} USDC)`);
    return { ghost, amount: balance.toString() };
  } catch (error) {
    console.log(`Revenue keeper: ghost recovery for ${feeWallet} failed:`, error.message);
    return { error: error.message };
  }
}

// ── Sweep ───────────────────────────────────────────────────────────────────

async function runFeeSweep() {
  const creators = await listCreators();
  if (!creators.length) return { swept: 0, wallets: [] };

  const results = [];
  for (const creator of creators) {
    try {
      const feeWallet = await feeWalletAddressFor(creator);
      if (!feeWallet) continue; // no factory configured → no fee wallets exist yet
      const ghost = await recoverGhostGeneration(feeWallet);
      const result = await sweepFeeWallet(feeWallet, { creator });
      results.push({ creator, feeWallet, ...(ghost ? { ghostRecovery: ghost } : {}), ...result });
      if (result.gateway?.minted || result.distributed?.distributed) {
        console.log(`Revenue keeper: ${creator} → ${feeWallet} gateway=${result.gateway?.minted ? 'minted' : 'idle'} distribute=${result.distributed?.distributed ? 'paid' : 'idle'}`);
      }
      // Stagger per-wallet sweeps so a burst of fee wallets does not trip the
      // public RPC rate limit (each sweep does balanceOf + getCode + optional
      // writes). The default 400ms keeps a 100-creator sweep under ~40s.
      const staggerMs = Number.parseInt(process.env.NIBGATE_FEE_KEEPER_STAGGER_MS || '400', 10);
      if (staggerMs > 0) await new Promise((resolve) => setTimeout(resolve, staggerMs));
    } catch (error) {
      results.push({ creator, feeWallet: null, error: error.message });
      console.log(`Revenue keeper: sweep failed for ${creator}:`, error.message);
    }
  }
  return { swept: results.length, wallets: results };
}

export async function runRevenueSweep() {
  if (!process.env.NIBGATE_FEE_KEEPER) return { disabled: true };
  const fees = await runFeeSweep();
  const holding = await runHoldingBoxSweep().catch((error) => ({ error: error.message }));
  return { ...fees, holding };
}

// ── Holding-box sweep ───────────────────────────────────────────────────────
// Gateway holds credit a domain box's Circle Gateway ledger; the box's ERC-1271
// self-withdrawal materializes the credit onchain so a claim can release it.
// Circle batch settlement is deferred, so this runs periodically and is
// idempotent (a materialized box has no withdrawable ledger left).
async function runHoldingBoxSweep() {
  let holding;
  try {
    holding = await import('../../../../packages/nibgate/src/server/holding.js');
  } catch {
    return { skipped: 'holding sdk unavailable' };
  }
  const privateKey = process.env.NIBGATE_KEEPER_PRIVATE_KEY || '';
  const rpcUrl = process.env.ARC_RPC_URL || process.env.NIBGATE_PAYMENT_RPC_URL || '';
  if (!privateKey || !rpcUrl) return { skipped: 'no keeper keys' };

  const held = await db.tip.findMany({
    where: { status: 'held', paymentProvider: 'circle-gateway' },
    select: { domain: true, contentUrl: true },
  });
  const domains = new Set();
  for (const t of held) {
    let d = t.domain;
    if (!d && t.contentUrl) { try { d = new URL(t.contentUrl).hostname; } catch {} }
    if (d) domains.add(holding.canonicalDomainKey(d));
  }
  const results = [];
  for (const domain of domains) {
    try {
      const out = await holding.withdrawHoldingBoxGateway(domain, { privateKey, rpcUrl, network: activeNetwork().name });
      if (out?.minted && out.tx) {
        await db.tip.updateMany({
          where: { status: 'held', paymentProvider: 'circle-gateway', OR: [{ domain }, { contentUrl: { contains: domain } }] },
          data: { txHash: out.tx },
        });
      }
      if (out?.minted) console.log(`Revenue keeper: holding box ${domain} minted ${out.tx}`);
      results.push({ domain, ...out });
    } catch (error) {
      results.push({ domain, error: error.message });
    }
  }
  return { swept: results.length, results };
}

// ── Schedule ────────────────────────────────────────────────────────────────

export function startFeeKeeper() {
  if (feeKeeperStarted || !process.env.NIBGATE_FEE_KEEPER) return;
  feeKeeperStarted = true;

  const intervalMs = Number.parseInt(process.env.NIBGATE_FEE_KEEPER_INTERVAL_MS || '60000', 10);
  const initialDelayMs = Number.parseInt(process.env.NIBGATE_FEE_KEEPER_INITIAL_DELAY_MS || '15000', 10);

  setTimeout(() => {
    runRevenueSweep().catch((error) => console.log('Revenue keeper sweep failed:', error.message));
    setInterval(() => {
      runRevenueSweep().catch((error) => console.log('Revenue keeper sweep failed:', error.message));
    }, intervalMs).unref?.();
  }, initialDelayMs).unref?.();
}