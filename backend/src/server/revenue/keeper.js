import { db } from '@nibgate/internal/db.js';
import {
  feeWalletAddressFor,
  sweepFeeWallet,
} from '@nibgate/sdk/server';

let feeKeeperStarted = false;

// ── Creator discovery ───────────────────────────────────────────────────────
// The keeper sweeps every creator that can earn revenue: nibshare owners
// (wallet-owned hosted content) and hub website owners. Self-hosted creators
// (own rail, no fee wallet) resolve to their own wallet and are naturally
// skipped by the fee sweep.

async function listCreators() {
  const creators = new Set();
  try {
    const shares = await db.nibShare.findMany({ select: { ownerWallet: true }, where: { price: { gt: 0 } } });
    for (const s of shares) creators.add(String(s.ownerWallet).trim().toLowerCase());
  } catch (error) {
    console.log('Revenue keeper: nibshare owner discovery failed:', error.message);
  }
  try {
    const users = await db.user.findMany({ select: { walletAddress: true, websites: { select: { id: true } } } });
    for (const u of users) {
      if (u.walletAddress && u.websites?.length) creators.add(String(u.walletAddress).trim().toLowerCase());
    }
  } catch (error) {
    console.log('Revenue keeper: hub owner discovery failed:', error.message);
  }
  return [...creators];
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
      const result = await sweepFeeWallet(feeWallet, { creator });
      results.push({ creator, feeWallet, ...result });
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
  return runFeeSweep();
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