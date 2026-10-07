// Ledger ↔ chain reconciliation: with real money moving, "the ledger says
// so" is not enough — every claimed onchain spend must resolve to a mined
// Transfer event, and every agent-wallet outflow must resolve to a ledger row.
// Runs on demand (MCP audit tool); Railway cron later.
import { createPublicClient, http, parseAbiItem } from 'viem';
import { NETWORKS } from '@nibgate/internal/networks.js';
import { db } from '../db.js';
import { budgetState } from '../money.js';
import { spendChain } from './chain.js';
import { agentAddress } from './wallet.js';

const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

/**
 * Reconcile one run's onchain spends against its ledger.
 * @returns {{ok, spendLedger, onchain: Array, unmatchedLedger: Array, unmatchedChain: Array}}
 */
export async function reconcileRun(runId, { publicClient } = {}) {
  const chain = spendChain();
  const pub = publicClient || createPublicClient({
    chain: { id: chain.chainId, name: `arc-${chain.name}`, nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 }, rpcUrls: { default: { http: [chain.rpcUrl] } } },
    transport: http(chain.rpcUrl),
  });
  const me = agentAddress().toLowerCase();
  // All value-moving senders: the hot EOA plus the spender mandate when
  // configured (contract-originated transfers come FROM the mandate, and a
  // reconciler watching only the EOA would miss every mandated tip).
  const { spenderAddress } = await import('./wallet.js');
  const senders = [me, ...(spenderAddress() ? [spenderAddress().toLowerCase()] : [])];
  const logs = [];
  for (const from of senders) {
    logs.push(...await pub.getLogs({ address: chain.usdc, event: TRANSFER, args: { from }, fromBlock: 0n, toBlock: 'latest' }));
  }
  const onchain = logs.map((l) => ({ tx: String(l.transactionHash).toLowerCase(), to: String(l.args?.to).toLowerCase(), amount: Number(l.args?.value ?? 0n) / 1e6 }));

  // Ledger spend rows that claim an onchain hash (txRef), across all runs —
  // the wallet is shared, so matching is global, then filtered to this run.
  const rows = await db.budgetLedger.findMany({ where: { kind: 'spend' }, select: { runId: true, amount: true, txRef: true } });
  const withTx = rows.filter((r) => r.txRef);
  const byTx = new Map(withTx.map((r) => [String(r.txRef).toLowerCase(), r]));
  const mine = withTx.filter((r) => r.runId === runId);

  const unmatchedLedger = mine.filter((r) => !onchain.some((o) => o.tx === String(r.txRef).toLowerCase()));
  const claimed = new Set(withTx.map((r) => String(r.txRef).toLowerCase()));
  // Outflows into Circle's GatewayWallet are deposits, not spends: still the
  // agent's money, reported separately so they never read as missing.
  const gateway = String(NETWORKS[chain.name]?.gatewayWallet || '').toLowerCase();
  const strangers = onchain.filter((o) => !claimed.has(o.tx));
  const state = await budgetState(runId);
  return {
    ok: unmatchedLedger.length === 0 && strangers.filter((o) => o.to !== gateway).length === 0,
    spendLedger: Number(state.spend),
    onchain: onchain.filter((o) => mine.some((r) => String(r.txRef).toLowerCase() === o.tx)),
    unmatchedLedger: unmatchedLedger.map((r) => ({ txRef: r.txRef, amount: Number(r.amount) })),
    gatewayDeposits: strangers.filter((o) => o.to === gateway),
    unmatchedChain: strangers.filter((o) => o.to !== gateway).map((o) => ({ tx: o.tx, to: o.to, amount: o.amount })),
  };
}
