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
      splitter: env.ESCROW_SPLITTER || '0xFE5894a5A2fC4d7f6E0E70394209467D5A7bf1ef',
    },
    5042: {
      core: env.ESCROW_CORE || null,
      splitter: env.ESCROW_SPLITTER || null,
    },
  };
  const d = deployments[chain.chainId] || {};
  const keeperKey = env.ESCROW_KEEPER_KEY || env.NIBGATE_KEEPER_PRIVATE_KEY || '';
  let evaluator = null;
  try { evaluator = privateKeyToAccount(keeperKey).address; } catch {}
  return {
    chain,
    core: d.core,
    splitter: d.splitter,
    keeperKey,
    evaluator,
    token: chain.usdc,
    treasury: env.ESCROW_TREASURY || '0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12',
    feeBps: Number(env.ESCROW_FEE_BPS || 100),
  };
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const sameAddress = (left, right) => typeof left === 'string' && typeof right === 'string'
  && left.toLowerCase() === right.toLowerCase();

/** Fail closed unless an onchain job is exactly the job this deployment
 * prepared for this run. Registration happens while the job is Open, when its
 * client can still change the provider, so approval and settlement repeat the
 * check against fresh chain state. */
export function assertEscrowJobBinding(job, { client, env = process.env, network = null } = {}) {
  const cfg = escrowConfig(env, network);
  if (!job || !sameAddress(job.client, client)) throw new Error('escrow job client does not match this run wallet');
  if (!sameAddress(job.provider, cfg.splitter)) throw new Error('escrow job provider does not match this deployment');
  if (!sameAddress(job.evaluator, cfg.evaluator)) throw new Error('escrow job evaluator does not match this deployment');
  if (!sameAddress(job.token, cfg.token)) throw new Error('escrow job token does not match this network');
  if (!sameAddress(job.hook, ZERO_ADDRESS)) throw new Error('escrow job hook must be disabled');
  return cfg;
}

export function isEscrowConfigured(env = process.env, network = null) {
  const c = escrowConfig(env, network);
  return Boolean(c.core && c.splitter && c.keeperKey && c.evaluator && c.token);
}

function viemChain(chain) {
  return {
    id: chain.chainId,
    name: `arc-${chain.name}`,
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [chain.rpcUrl] } },
  };
}

async function confirmedReceipt(client, hash) {
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('Escrow transaction reverted; settlement remains pending.');
  return receipt;
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

/** Parameters for the USER's wallet to create the job itself.
 *
 * The stock core sets `client = msg.sender`, so a keeper-relayed createJob
 * makes an unfundable job (only the client can setBudget/fund — seen live:
 * every relayed job was keeper-cliented and user funds reverted). The user
 * signs createJob, becoming client; the keeper never creates for others.
 * Returns everything the wallet needs to send the exact call, plus what
 * register needs to verify afterwards.
 */
export function createParams({ description, expiryHours = 72 } = {}, opts = {}) {
  const cfg = escrowConfig(opts.env, opts.network);
  if (!cfg.core || !cfg.splitter) throw new Error('escrow is not deployed on this network');
  if (!cfg.keeperKey) throw new Error('escrow keeper key is not configured');
  const hours = Math.min(Math.max(Number(expiryHours) || 72, 1), 720);
  const account = privateKeyToAccount(cfg.keeperKey);
  return {
    core: cfg.core,
    splitter: cfg.splitter,
    evaluator: account.address,
    expiredAt: Math.floor(Date.now() / 1000) + hours * 3600,
    description: String(description || '').slice(0, 280),
    hook: '0x0000000000000000000000000000000000000000',
  };
}

// A user must not deposit into a job whose keeper cannot finish settlement.
export async function assertEscrowOperational(opts = {}) {
  const cfg = escrowConfig(opts.env, opts.network);
  if (!cfg.core || !cfg.splitter || !cfg.keeperKey) throw new Error('Escrow is not configured.');
  const c = clients(cfg, opts.make);
  const [chainId, balance, coreCode, splitterCode] = await Promise.all([
    c.public.getChainId(), c.public.getBalance({ address: c.account.address }),
    c.public.getBytecode({ address: cfg.core }), c.public.getBytecode({ address: cfg.splitter }),
  ]);
  if (chainId !== cfg.chain.chainId || !coreCode || coreCode === '0x' || !splitterCode || splitterCode === '0x') {
    throw new Error('Escrow contracts are unavailable on the configured network.');
  }
  // Operational reserve, in Arc's 18-decimal native USDC: at least $0.02.
  if (balance < 20_000_000_000_000_000n) throw new Error('Settlement keeper needs gas funds.');
}

/**
 * Create the onchain job with the SERVER key. The signer becomes the client,
 * so this is only correct when the signer IS the intended funder (keeper
 * scripts, tests) — never as a relay for a user's run. For user runs the
 * wallet calls createJob itself (see createParams + POST /:id/escrow/register).
 */
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
  await confirmedReceipt(c.public, hash);
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
    budget: Number(job.budget) / 1e6, token: job.token, hook: job.hook,
    expiredAt: Number(job.expiredAt),
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
  if (status === 'Completed') return { jobId: String(jobId), completeTx: null, alreadyCompleted: true, spent: Number(spent) / 1e6 };
  let hash;
  if (status === 'Funded') {
    hash = await c.wallet.writeContract({
      address: cfg.splitter, abi: SPLITTER_ABI, functionName: 'submitJob', args: [BigInt(jobId), deliverable, '0x'],
    });
    await confirmedReceipt(c.public, hash);
  } else if (status !== 'Submitted') {
    throw new Error(`cannot settle from ${status || 'unknown'} — run the job to Submitted first`);
  }
  hash = await c.wallet.writeContract({
    address: cfg.core, abi: CORE_ABI, functionName: 'complete', args: [BigInt(jobId), deliverable.slice(0, 66), '0x'],
  });
  await confirmedReceipt(c.public, hash);
  return { jobId: String(jobId), completeTx: hash, spent: Number(spent) / 1e6 };
}

/**
 * Execute the split onchain through the keeper wallet (split() is
 * permissionless — anyone may call it once the keeper has signed; the keeper
 * relaying it itself means settle actually moves the money instead of merely
 * attesting it). Idempotent: skips jobs already split. Returns { splitTx }.
 */
export async function relaySplit({ jobId, spentUsd, operator, client }, opts = {}) {
  const cfg = escrowConfig(opts.env, opts.network);
  if (!cfg.splitter || !cfg.keeperKey) throw new Error('escrow is not configured');
  const c = clients(cfg, opts.make);
  const done = await c.public.readContract({
    address: cfg.splitter, abi: SPLITTER_ABI, functionName: 'splitDone', args: [BigInt(jobId)],
  });
  if (done) return { splitTx: null, alreadySplit: true };
  const sig = await signSplit({ jobId, spentUsd, operator, client }, opts);
  const hash = await c.wallet.writeContract({
    address: cfg.splitter, abi: SPLITTER_ABI, functionName: 'split',
    args: [BigInt(jobId), BigInt(Math.round(Number(spentUsd) * 1e6)), operator, sig.v, sig.r, sig.s],
  });
  await confirmedReceipt(c.public, hash);
  return { splitTx: hash, alreadySplit: false };
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
