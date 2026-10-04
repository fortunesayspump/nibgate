// Onchain job lifecycle for research escrow (ERC-8183, stock core +
// NibgateRunSplitter). The backend never holds user money: it creates the
// job (anyone may), relays the keeper's submit/complete, and signs split
// attestations — funding always comes from the user's own wallet.
//
// All chain writes go through the keeper key (server-side operator key).
// Reads need no key. Every function takes an optional client factory so
// tests inject fakes and never touch a chain.
import { createPublicClient, createWalletClient, http, keccak256, encodeAbiParameters, hexToBytes, parseSignature } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CORE_ABI, SPLITTER_ABI } from './abi.js';
import { spendChain } from '../spend/chain.js';

export function escrowConfig(env = process.env, network = null) {
  const chain = spendChain(network);
  const deployments = {
    5042002: {
      core: env.ESCROW_CORE || '0x5135ae9be828be42b63f176848a7b720aedf4c58',
      splitter: env.ESCROW_SPLITTER || '0xe6a0a29047147c65d2409bcb2501f7a0bab53ede',
    },
    5042: {
      core: env.ESCROW_CORE || null,
      splitter: env.ESCROW_SPLITTER || null,
    },
  };
  const d = deployments[chain.chainId] || {};
  return {
    chain,
    core: d.core,
    splitter: d.splitter,
    keeperKey: env.ESCROW_KEEPER_KEY || env.NIBGATE_KEEPER_PRIVATE_KEY || '',
    treasury: env.ESCROW_TREASURY || '0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12',
    feeBps: Number(env.ESCROW_FEE_BPS || 100),
  };
}

export function isEscrowConfigured(env = process.env, network = null) {
  const c = escrowConfig(env, network);
  return Boolean(c.core && c.splitter && c.keeperKey);
}

function viemChain(chain) {
  return {
    id: chain.chainId,
    name: `arc-${chain.name}`,
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [chain.rpcUrl] } },
  };
}

function clients(cfg, make = null) {
  if (make?.public && make?.wallet) return { ...make, chain: cfg.chain };
  const vc = viemChain(cfg.chain);
  const transport = http(cfg.chain.rpcUrl);
  const account = privateKeyToAccount(cfg.keeperKey);
  return {
    chain: cfg.chain,
    account,
    public: createPublicClient({ chain: vc, transport }),
    wallet: createWalletClient({ chain: vc, transport, account }),
  };
}

/** Create the onchain job. Anyone may call; the client is the user's wallet. */
export async function createJob({ client, budget, description, expiredAt, hook }, opts = {}) {
  const cfg = escrowConfig(opts.env, opts.network);
  if (!cfg.core || !cfg.splitter) throw new Error('escrow is not deployed on this network');
  if (!cfg.keeperKey) throw new Error('escrow keeper key is not configured');
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(client || ''))) throw new Error('client wallet address is required');
  if (!(Number(budget) > 0)) throw new Error('budget must be > 0');
  const c = clients(cfg, opts.make);
  const amount = BigInt(Math.round(Number(budget) * 1e6));
  const hash = await c.wallet.writeContract({
    address: cfg.core, abi: CORE_ABI, functionName: 'createJob',
    args: [cfg.splitter, c.account.address, BigInt(expiredAt), String(description || '').slice(0, 280), hook || '0x0000000000000000000000000000000000000000'],
  });
  await c.public.waitForTransactionReceipt({ hash });
  const jobId = await c.public.readContract({ address: cfg.core, abi: CORE_ABI, functionName: 'jobCount' });
  // setBudget is client-or-provider; the splitter cannot sign, so the keeper
  // records intent here and the frontend has the user confirm it onchain.
  return { jobId: jobId.toString(), txHash: hash, core: cfg.core, splitter: cfg.splitter, budget: Number(budget), evaluator: c.account.address };
}

/** Read job state offchain-friendly. */
export async function jobStatus(jobId, opts = {}) {
  const cfg = escrowConfig(opts.env, opts.network);
  if (!cfg.core) throw new Error('escrow is not deployed on this network');
  const c = clients(cfg, opts.make);
  const job = await c.public.readContract({ address: cfg.core, abi: CORE_ABI, functionName: 'getJob', args: [BigInt(jobId)] });
  const names = ['Open', 'Funded', 'Submitted', 'Completed', 'Rejected', 'Expired'];
  return {
    jobId: String(jobId),
    status: names[Number(job.status)] || String(job.status),
    client: job.client, provider: job.provider, evaluator: job.evaluator,
    budget: Number(job.budget) / 1e6, token: job.token,
  };
}

/**
 * Relay the worker's deliverable + complete the job with the ledger-attested
 * spend. Keeper-only onchain; callable only when the run actually finished.
 */
export async function submitAndComplete({ jobId, reportHash, spentUsd, operator }, opts = {}) {
  const cfg = escrowConfig(opts.env, opts.network);
  if (!cfg.core || !cfg.splitter || !cfg.keeperKey) throw new Error('escrow is not configured');
  const c = clients(cfg, opts.make);
  const spent = BigInt(Math.round(Number(spentUsd) * 1e6));
  const deliverable = reportHash && reportHash !== '0x'
    ? reportHash
    : '0x' + '0'.repeat(64);
  // Idempotent: a retried settle skips the already-recorded submit instead
  // of reverting on it.
  const names = ['Open', 'Funded', 'Submitted', 'Completed', 'Rejected', 'Expired'];
  const cur = await c.public.readContract({ address: cfg.core, abi: CORE_ABI, functionName: 'getJob', args: [BigInt(jobId)] });
  const status = names[Number(cur.status)] || '';
  let hash;
  if (status === 'Funded') {
    hash = await c.wallet.writeContract({
      address: cfg.splitter, abi: SPLITTER_ABI, functionName: 'submitJob', args: [BigInt(jobId), deliverable, '0x'],
    });
    await c.public.waitForTransactionReceipt({ hash });
  } else if (status !== 'Submitted') {
    throw new Error(`cannot settle from ${status || 'unknown'} — run the job to Submitted first`);
  }
  hash = await c.wallet.writeContract({
    address: cfg.core, abi: CORE_ABI, functionName: 'complete', args: [BigInt(jobId), deliverable.slice(0, 66), '0x'],
  });
  await c.public.waitForTransactionReceipt({ hash });
  return { jobId: String(jobId), completeTx: hash, spent: Number(spent) / 1e6 };
}

/**
 * Sign a split attestation for anyone to execute. The signature binds
 * (chain, core, splitter, job, spent, operator, client, treasury, fee) —
 * permissionless execution, keeper-authorized math.
 */
export async function signSplit({ jobId, spentUsd, operator, client }, opts = {}) {
  const cfg = escrowConfig(opts.env, opts.network);
  if (!cfg.splitter || !cfg.keeperKey) throw new Error('escrow is not configured');
  const c = clients(cfg, opts.make);
  const inner = keccak256(encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'uint256' }],
    [BigInt(cfg.chain.chainId), cfg.core, cfg.splitter, BigInt(jobId), BigInt(Math.round(Number(spentUsd) * 1e6)), operator, client, cfg.treasury, BigInt(cfg.feeBps)],
  ));
  const hex = await c.account.signMessage({ message: { raw: hexToBytes(inner) } });
  const sig = parseSignature(hex);
  return {
    jobId: String(jobId),
    v: sig.v == null ? (sig.yParity === 0 ? 27 : 28) : Number(sig.v),
    r: sig.r, s: sig.s,
    spent: Number(spentUsd), operator, client, treasury: cfg.treasury, feeBps: cfg.feeBps,
  };
}
