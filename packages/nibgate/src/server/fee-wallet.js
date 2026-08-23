import { createPublicClient, createWalletClient, http, getAddress, encodeAbiParameters, fallback, recoverMessageAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { randomBytes } from 'node:crypto';
import { normalizePaymentRail } from '../core/payment.js';
import { normalizeServerResource as normalizeResource } from '../core/resource.js';
import { serverEnv } from './env.js';
import { createPaymentChallenge } from './challenge.js';
import { jsonResponse } from './response.js';
import { runCircleGatewayRequirement } from './gateway.js';

export const DEFAULT_TREASURY = '0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12';
export const DEFAULT_FEE_BPS = 100;
export const DEFAULT_MAX_FEE_BPS = 500;
export const ARC_TESTNET_CHAIN = 'eip155:5042002';

// Arc testnet constants for the direct (client-broadcast) rail. The buyer
// sends USDC straight from their wallet to the seller (the fee wallet for
// hosted content) and the hub verifies the transfer on-chain.
export const ARC_TESTNET_RPC = 'https://rpc.testnet.arc.io';

// Fallback endpoints for the same chain (5042002). Circle's primary endpoint
// rate-limits eth_sendRawTransaction aggressively during keeper sweeps, so the
// write path failsover across public mirrors instead of stranding revenue.
export const ARC_TESTNET_RPC_FALLBACKS = [
  'https://arc-testnet.drpc.org',
  'https://rpc.drpc.testnet.arc.io',
  'https://rpc.quicknode.testnet.arc.io',
];
export const ARC_USDC = '0x3600000000000000000000000000000000000000';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Arc testnet Circle Gateway addresses (same domain as the POC on 2026-08-09).
// Overridable per network via options / env so one contract works per chain.
export const ARC_GATEWAY_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
export const ARC_GATEWAY_MINTER = '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B';
export const ARC_DOMAIN = 26;
export const GATEWAY_API_TESTNET = 'https://gateway-api-testnet.circle.com/v1';
export const ARC_MIN_GATEWAY_FEE = 3_500n; // observed testnet floor: 0.0035 USDC

// GatewayFeeWalletFactory ABI surface the SDK needs: predictedWallet is the
// single source of truth for a creator's fee wallet address (CREATE2), so the
// SDK never duplicates the factory's hash math. deployIfNeeded materializes the
// wallet on-chain before the keeper withdraws a credited Gateway balance (Circle
// TEE eth_call to a code-less address fails ERC-1271 verification).
export const FEE_WALLET_FACTORY_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'creator', type: 'address' }],
    name: 'predictedWallet',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'creator', type: 'address' }],
    name: 'deployIfNeeded',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  const key = String(name).toLowerCase();
  for (const k of Object.keys(headers)) {
    if (String(k).toLowerCase() === key) return String(headers[k]);
  }
  return '';
}

// On-chain verifier for the direct rail. Reads the transaction receipt for the
// given txHash and confirms a USDC Transfer to the seller for at least the
// resource price. Uses the SDK default RPC / USDC unless overridden.
// Reorg-safety defaults per chain class. Direct-rail settlement credits
// content off a receipt, so the receipt must be deep enough that a reorg can't
// unmine it after unlock. Override with options.receiptConfirmations or env
// NIBGATE_TX_CONFIRMATIONS.
const CONFIRMATIONS_BY_CHAIN = {
  1: 12, // Ethereum mainnet — exchange-grade depth for value settlement
  8453: 4, // Base (OP-stack L2; pre-"safe" reorgs are shallow but real)
  84532: 2, // Base Sepolia
  5042002: 1, // Arc testnet — instant-finality testnet
  31337: 1, // anvil/local
};
export const DEFAULT_CONFIRMATION_DEPTH = 3;

const chainIdCache = new Map();
async function chainConfirmations(client, rpcKey) {
  const envConf = serverEnv('NIBGATE_TX_CONFIRMATIONS');
  if (envConf) return Math.max(1, Number(envConf) || DEFAULT_CONFIRMATION_DEPTH);
  try {
    if (!chainIdCache.has(rpcKey)) {
      chainIdCache.set(rpcKey, await client.getChainId());
    }
    return CONFIRMATIONS_BY_CHAIN[chainIdCache.get(rpcKey)] ?? DEFAULT_CONFIRMATION_DEPTH;
  } catch {
    return DEFAULT_CONFIRMATION_DEPTH;
  }
}

export function createTransferVerifier(options = {}) {
  const rpcUrl = options.rpcUrl || serverEnv('NIBGATE_PAYMENT_RPC_URL') || ARC_TESTNET_RPC;
  const usdc = getAddress(options.usdcAddress || serverEnv('NIBGATE_USDC_ADDRESS') || ARC_USDC);
  const client = sharedPublicClient(rpcUrl);

  return async function verifyTransfer({ resource, txHash, payment, request }) {
    if (!txHash) return false;
    const payTo = String(
      payment?.recipient || resource?.recipient || resource?.payTo || options.recipient || options.sellerAddress || serverEnv('NIBGATE_SELLER_ADDRESS') || ''
    ).toLowerCase();
    if (!payTo) return false;
    const amountUsdc = Number(payment?.amount ?? resource?.price ?? options.price ?? 0);
    const amountWei = BigInt(Math.round(amountUsdc * 1e6));
    try {
      // The buyer sends the txHash as soon as the broadcast resolves, which can
      // be before the block is mined. Wait for the receipt so a fresh payment
      // verifies instead of failing a one-shot lookup.
      const confirmations =
        options.receiptConfirmations ?? (await chainConfirmations(client, rpcUrl));
      // Scale the wait with the depth actually required (mainnet 12-conf ≈ 3 min).
      const waitMs =
        Number(options.receiptWaitMs ?? Math.max(30000, confirmations * 15000));
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        timeout: waitMs,
        pollingInterval: 1000,
        confirmations,
      });
      if (!receipt || receipt.status !== 'success') return false;
      let matched = false;
      for (const log of receipt.logs || []) {
        if (getAddress(log.address).toLowerCase() !== usdc.toLowerCase()) continue;
        if (!log.topics?.[0] || log.topics[0].toLowerCase() !== TRANSFER_TOPIC) continue;
        const to = `0x${log.topics[2]?.slice(26)}`.toLowerCase();
        if (to !== payTo) continue;
        const value = BigInt(log.data || '0x0');
        if (value >= amountWei) {
          matched = true;
          // Surface what actually landed so surfaces can flag overpays
          // (buyer sent more than price — e.g. a double-pay) on the receipt.
          if (payment && value > amountWei) {
            payment.amountReceived = Number(value) / 1e6;
            payment.overpay = Number(value - amountWei) / 1e6;
          }
          break;
        }
      }
      if (!matched) return false;
      if (payment && receipt.from) payment.payer = getAddress(receipt.from).toLowerCase();
      return true;
    } catch {
      return false;
    }
  };
}

// Fee policy shared by every Nibgate-hosted pay surface. The numbers feed the
// per-creator fee-wallet contract (feeBps mutable within maxFeeBps by
// feeSetter). Resolved once from options + env so every surface sees the same
// policy.
export function feePolicy(options = {}) {
  const envFeeBps = serverEnv('NIBGATE_FEE_BPS');
  const envMaxFeeBps = serverEnv('NIBGATE_MAX_FEE_BPS');
  return {
    feeBps: Number(options.feeBps ?? (envFeeBps ? Number(envFeeBps) : DEFAULT_FEE_BPS)),
    maxFeeBps: Number(options.maxFeeBps ?? (envMaxFeeBps ? Number(envMaxFeeBps) : DEFAULT_MAX_FEE_BPS)),
    treasury: options.treasury || serverEnv('NIBGATE_TREASURY') || DEFAULT_TREASURY,
    feeSetter: options.feeSetter || serverEnv('NIBGATE_FEE_SETTER') || '',
    chain: options.network || options.chain || serverEnv('NIBGATE_PAYMENT_NETWORK') || ARC_TESTNET_CHAIN,
  };
}

// Deterministic CREATE2 address for a creator's fee wallet. The GatewayFeeWallet
// factory (contracts/GatewayFeeWalletFactory.sol) is the single source of truth:
// its predictedWallet(creator) view is the exact CREATE2 address, so this
// resolves by reading the factory on-chain (cached per creator) instead of
// duplicating the wallet's init-code hash math in JS. When the factory is
// unset, hosted surfaces fall back to the creator's own wallet (fee not yet
// enabled) and self-hosted surfaces always use the creator EOA.
export async function feeWalletAddressFor(creator, options = {}) {
  if (!creator) return null;
  const factory = options.feeWalletFactory || serverEnv('NIBGATE_FEE_WALLET_FACTORY') || '';
  if (!factory) return null;
  const read = options.predictedWallet || createPredictedWalletReader(factory, options);
  try {
    const address = await read(getAddress(creator));
    return address ? getAddress(address) : null;
  } catch {
    return null;
  }
}

// Default predictedWallet reader: an eth_call to the factory view with a small
// per-process cache, so repeated payTo resolutions for the same creator hit the
// RPC once.
export function createPredictedWalletReader(factory, options = {}) {
  const rpcUrl = options.rpcUrl || serverEnv('NIBGATE_PAYMENT_RPC_URL') || ARC_TESTNET_RPC;
  const client = sharedPublicClient(rpcUrl);
  const cache = new Map();
  return async function predictedWallet(creator) {
    const key = `${factory}:${creator.toLowerCase()}`;
    if (cache.has(key)) return cache.get(key);
    const address = await client.readContract({
      address: getAddress(factory),
      abi: FEE_WALLET_FACTORY_ABI,
      functionName: 'predictedWallet',
      args: [getAddress(creator)],
    });
    const resolved = getAddress(address);
    cache.set(key, resolved);
    return resolved;
  };
}

// The single seller-resolution seam. Every hosted surface (hub /hub/pay,
// subblogs, nibshare) resolves its seller through this so the fee wallet is
// the payTo for hosted content. Self-hosted creators resolve to their own
// wallet (no fee), and hosted content without a configured fee wallet still
// pays the creator.
export async function resolvePayTo(recipient, options = {}) {
  const hosted = options.hosted !== false && (options.hosted === true || String(serverEnv('NIBGATE_HOSTED_PAY')).toLowerCase() === 'true');
  if (!hosted) return recipient;
  const feeWallet = await feeWalletAddressFor(recipient, options);
  return feeWallet || recipient;
}

// Protocol fee for one payment: feeBps share of the amount (in the resource's
// currency unit, so a $1 price yields a 0.01 protocol fee at 100 bps). Returns
// 0 when the fee is not active for this surface: self-hosted creators (no fee
// wallet) or hosted surfaces with no configured factory pay the creator in
// full. Mirrors the on-chain split: distribute() sends feeBps to the treasury.
export function protocolFeeFor(amount, options = {}) {
  const hosted = options.hosted !== false && (options.hosted === true || String(serverEnv('NIBGATE_HOSTED_PAY')).toLowerCase() === 'true');
  const factory = options.feeWalletFactory || serverEnv('NIBGATE_FEE_WALLET_FACTORY') || '';
  const value = Number(amount || 0);
  if (!hosted || !factory || value <= 0) return 0;
  const policy = feePolicy(options);
  return Math.round((value * policy.feeBps) / 10_000 * 1_000_000) / 1_000_000;
}

// ── Direct-rail payment-identity rules ──────────────────────────────────────
// A broadcast USDC transfer is PUBLIC chain data: without an extra binding, any
// observer could replay someone else's txHash to read paid content, and one
// txHash would unlock every same-seller resource. The buyer therefore signs an
// ownership proof binding the txHash to THIS resource; the verifier requires it
// and the hub additionally claims each txHash for a single content id.
export function transferOwnershipMessage(txHash, resource) {
  return `Nibgate transfer ownership\ntx:${String(txHash || '').toLowerCase()}\nresource:${resource?.path || resource?.url || ''}`;
}

const TX_OWNER_HEADER = 'x-nibgate-tx-owner';

export async function requireTransferOwnership({ headers, txHash, payer, resource, optional }) {
  if (optional) return { ok: true };
  // Accept both fetch Headers and lowercased Express-style plain objects.
  const proofHeader = typeof headers?.get === 'function'
    ? (headers.get(TX_OWNER_HEADER) || '')
    : String(headers?.[TX_OWNER_HEADER] || headers?.[TX_OWNER_HEADER.toLowerCase()] || '');
  const proof = Array.isArray(proofHeader) ? (proofHeader[0] || '') : proofHeader;
  if (!proof) return { ok: false, error: 'transfer-ownership-proof-required', hint: `Sign ${JSON.stringify(transferOwnershipMessage(txHash, resource))} with the paying wallet and send it as ${TX_OWNER_HEADER}.` };
  try {
    const signer = await recoverMessageAddress({ message: transferOwnershipMessage(txHash, resource), signature: proof });
    if (signer.toLowerCase() !== String(payer || '').toLowerCase()) {
      return { ok: false, error: 'transfer-owner-mismatch' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'transfer-owner-invalid' };
  }
}

// Single-use txHash claim against an optional shared registry. Self-hosted
// surfaces are isolated: the ownership proof binds payer+resource, but two
// independent sites of the same creator would each accept the same txHash.
// Point NIBGATE_CLAIM_REGISTRY_URL (or options.claimRegistryUrl) at a hub (or
// any service implementing POST {txHash, contentId}) to make claims global:
//   200            → claimed by this content id (idempotent on retry)
//   402/409 + body → already claimed by a different content id → reject
// Integrators wanting custom semantics can pass options.claimTx(txHash, contentId).
export async function claimTransferTx({ txHash, contentId, registryUrl, fetchImpl }) {
  const doFetch = fetchImpl || globalThis.fetch;
  if (!registryUrl || typeof doFetch !== 'function') {
    throw new Error('claim-registry-unreachable: no registry URL or fetch available');
  }
  const res = await doFetch(registryUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ txHash: String(txHash).toLowerCase(), contentId: String(contentId) }),
  }).catch((error) => {
    throw new Error(`claim-registry-unreachable: ${error?.message || error}`);
  });
  if (res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: true, firstClaim: body?.firstClaim !== false };
  }
  return {
    ok: false,
    error: 'txhash-claimed-elsewhere',
    status: res.status,
  };
}

export async function runTransferClaim({ txHash, resource, options = {}, fetchImpl }) {
  if (typeof options.claimTx === 'function') {
    return options.claimTx(txHash, resource.id ?? resource.path ?? '');
  }
  const registryUrl = options.claimRegistryUrl || serverEnv('NIBGATE_CLAIM_REGISTRY_URL');
  if (!registryUrl) return { ok: true, skipped: true }; // no registry configured
  return claimTransferTx({ txHash, contentId: resource.id ?? resource.path ?? '', registryUrl, fetchImpl });
}

// Hosted-pay requirement for the hub's transfer (client-broadcast direct) rail.
// Serves the 402 challenge with the seller (fee wallet) as payTo when no tx is
// presented, or verifies the buyer's broadcast USDC transfer on-chain and
// returns the payment when it clears.
export async function runHostedTransferRequirement(request, resourceInput, options = {}) {
  const resource = normalizeResource(resourceInput);
  // runHostedPayRequirement resolves the seller (creator -> fee wallet) and
  // pins BOTH fields to it before delegating here. Re-running resolvePayTo on
  // an already-resolved fee wallet would compute the "fee wallet of the fee
  // wallet" — a deterministic but undeployed address that can never receive.
  // Treat matching recipient/payTo as the pinned signal and skip resolution.
  const pinned = resource.payTo && resource.payTo === resource.recipient;
  const recipient = pinned ? resource.payTo : (resource.recipient || resource.payTo || options.recipient || options.sellerAddress || serverEnv('NIBGATE_SELLER_ADDRESS') || '');
  const seller = pinned ? resource.payTo : await resolvePayTo(recipient, options);
  const txHash = headerValue(request.headers, 'x-nibgate-transfer-tx') || headerValue(request.headers, 'x-transfer-tx') || headerValue(request.headers, 'payment-signature') || '';

  if (!txHash) {
    return {
      handled: true,
      response: jsonResponse(createPaymentChallenge({ ...resource, recipient: seller, payTo: seller }, { ...options, paymentRail: 'transfer' }), { status: 402 }),
    };
  }

  const verifyTransfer = options.verifyTransfer || createTransferVerifier(options);
  const transferPayment = {
    paymentProvider: 'direct-transfer',
    paymentId: txHash,
    txHash,
    amount: Number(resource.price || 0),
    revenue: Number(resource.price || 0),
    currency: resource.currency || 'USDC',
    recipient: seller,
    network: options.network || serverEnv('NIBGATE_PAYMENT_NETWORK') || ARC_TESTNET_CHAIN,
  };
  const verified = await verifyTransfer({ resource: { ...resource, recipient: seller, payTo: seller }, txHash, payment: transferPayment, request });
  if (!verified) {
    return {
      handled: true,
      response: jsonResponse({ ok: false, error: 'Transfer verification failed' }, { status: 402 }),
    };
  }
  const ownership = await requireTransferOwnership({
    headers: request.headers,
    txHash,
    payer: transferPayment.payer,
    resource,
    optional: options.txOwnerProofOptional === true || serverEnv('NIBGATE_TX_OWNER_PROOF_OPTIONAL') === 'true',
  });
  if (!ownership.ok) {
    return {
      handled: true,
      response: jsonResponse({ ok: false, error: 'Transfer ownership check failed', reason: ownership.error, hint: ownership.hint }, { status: 402 }),
    };
  }
  const claim = await runTransferClaim({ txHash, resource, options });
  if (!claim.ok) {
    return {
      handled: true,
      response: jsonResponse({ ok: false, error: 'Payment already used for different content', reason: claim.error }, { status: 402 }),
    };
  }
  return { handled: false, payment: { ...transferPayment, verified: true } };
}

// Hosted-pay requirement for the hub: resolves the seller through resolvePayTo
// so the challenge credits the creator's fee wallet, then serves the requested
// rail. Gateway is the Circle batching rail; transfer is the direct
// client-broadcast USDC rail. Buyers keep the same flow; only the seller
// address and settlement path change.
export async function runHostedPayRequirement(request, resourceInput, options = {}) {
  const resource = normalizeResource(resourceInput);
  const recipient = resource.recipient || resource.payTo || options.recipient || options.sellerAddress || serverEnv('NIBGATE_SELLER_ADDRESS') || '';
  const seller = await resolvePayTo(recipient, options);
  const rail = normalizePaymentRail(resource.paymentRail || options.paymentRail || options.paymentMode || 'gateway');

  if (rail === 'transfer') {
    return runHostedTransferRequirement(request, { ...resource, recipient: seller, payTo: seller }, { ...options, sellerAddress: seller, recipient: seller });
  }

  return runCircleGatewayRequirement(request, {
    ...resource,
    recipient: seller,
    payTo: seller,
  }, {
    ...options,
    sellerAddress: seller,
    recipient: seller,
  });
}

// ── Keeper leg: turn a credited fee wallet into on-chain USDC + distribute ──

const b32 = (a) => '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0');

const TransferSpecFields = [
  { name: 'version', type: 'uint32' },
  { name: 'sourceDomain', type: 'uint32' },
  { name: 'destinationDomain', type: 'uint32' },
  { name: 'sourceContract', type: 'bytes32' },
  { name: 'destinationContract', type: 'bytes32' },
  { name: 'sourceToken', type: 'bytes32' },
  { name: 'destinationToken', type: 'bytes32' },
  { name: 'sourceDepositor', type: 'bytes32' },
  { name: 'destinationRecipient', type: 'bytes32' },
  { name: 'sourceSigner', type: 'bytes32' },
  { name: 'destinationCaller', type: 'bytes32' },
  { name: 'value', type: 'uint256' },
  { name: 'salt', type: 'bytes32' },
  { name: 'hookData', type: 'bytes' },
];

const ERC20_ABI = [{ inputs: [{ name: 'a', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], type: 'function' }];
const MINTER_ABI = [{ inputs: [{ name: 'attestation', type: 'bytes' }, { name: 'signature', type: 'bytes' }], name: 'gatewayMint', outputs: [], stateMutability: 'nonpayable', type: 'function' }];
const WALLET_ABI = [{ inputs: [], name: 'distribute', outputs: [{ name: 'creatorAmount', type: 'uint256' }, { name: 'treasuryAmount', type: 'uint256' }], stateMutability: 'nonpayable', type: 'function' }];

function toMicroUnits(s) {
  if (s == null) return 0n;
  const str = String(s);
  if (!str.includes('.')) return BigInt(str);
  const [whole, frac] = str.split('.');
  return BigInt(whole || '0') * 1_000000n + BigInt((frac + '000000').slice(0, 6));
}

// Self burn intent: withdraws the wallet's credited Gateway ledger balance
// straight to itself (destinationRecipient == sourceSigner == this), so USDC
// mints on-chain into the wallet and distribute() splits it.
export function buildSelfBurnIntent({ wallet, value, domain, gatewayWallet, gatewayMinter, usdc, maxFee }) {
  const spec = {
    version: 1,
    sourceDomain: domain,
    destinationDomain: domain,
    sourceContract: b32(gatewayWallet),
    destinationContract: b32(gatewayMinter),
    sourceToken: b32(usdc),
    destinationToken: b32(usdc),
    sourceDepositor: b32(wallet),
    destinationRecipient: b32(wallet),
    sourceSigner: b32(wallet),
    destinationCaller: b32('0x0000000000000000000000000000000000000000'),
    value,
    salt: '0x' + randomBytes(32).toString('hex'),
    hookData: '0x',
  };
  return { maxBlockHeight: (1n << 256n) - 1n, maxFee: maxFee, spec };
}

// Submit the self burn intent to Gateway's /v1/transfer with contractSigner:true
// (ERC-1271). Returns the attestation + operator signature for gatewayMint.
export async function submitGatewayWithdrawal(intent, { gatewayApi = GATEWAY_API_TESTNET } = {}) {
  const signature = encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint256' }, { type: 'tuple', components: TransferSpecFields }],
    [intent.maxBlockHeight, intent.maxFee, intent.spec],
  );
  const res = await fetch(`${gatewayApi}/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ burnIntent: intent, signature, contractSigner: true }], (k, v) => (typeof v === 'bigint' ? v.toString() : v)),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`gateway transfer attestation: ${JSON.stringify(data)}`);
  return { attestation: data.attestation, operatorSig: data.signature, transferId: data.transferId };
}

// Fetch a wallet's Gateway ledger balance (available + pending).
export async function gatewayBalanceFor(wallet, { domain, gatewayApi = GATEWAY_API_TESTNET } = {}) {
  const res = await fetch(`${gatewayApi}/balances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'USDC', sources: [{ depositor: wallet, domain }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`gateway balance: ${JSON.stringify(data)}`);
  const b = data.balances?.[0];
  return { available: toMicroUnits(b?.balance), pending: toMicroUnits(b?.pendingBatch), raw: b };
}

// On-chain USDC balance of a fee wallet (direct-rail receipts land here).
export async function feeWalletUsdcBalance(wallet, options = {}) {
  const rpcUrl = options.rpcUrl || serverEnv('NIBGATE_PAYMENT_RPC_URL') || ARC_TESTNET_RPC;
  const usdc = options.usdcAddress || serverEnv('NIBGATE_USDC_ADDRESS') || ARC_USDC;
  const client = options.publicClient || sharedPublicClient(rpcUrl);
  return client.readContract({ address: getAddress(usdc), abi: ERC20_ABI, functionName: 'balanceOf', args: [getAddress(wallet)] });
}

// Drive a fee wallet's Gateway-credited balance onto the chain: submit the self
// burn intent (contractSigner:true) and gatewayMint it. Idempotent — skips if
// USDC is already minted on-chain.
export async function withdrawGatewayBalanceFor(wallet, options = {}) {
  const walletKey = options.keeperKey || serverEnv('NIBGATE_KEEPER_PRIVATE_KEY') || '';
  if (!walletKey) throw new Error('withdrawGatewayBalanceFor requires keeperKey (NIBGATE_KEEPER_PRIVATE_KEY)');
  const account = privateKeyToAccount(walletKey);
  const rpcUrl = options.rpcUrl || serverEnv('NIBGATE_PAYMENT_RPC_URL') || ARC_TESTNET_RPC;
  const usdc = options.usdcAddress || serverEnv('NIBGATE_USDC_ADDRESS') || ARC_USDC;
  const domain = options.domain || serverEnv('NIBGATE_GATEWAY_DOMAIN') || ARC_DOMAIN;
  const gatewayWallet = options.gatewayWallet || serverEnv('NIBGATE_GATEWAY_WALLET') || ARC_GATEWAY_WALLET;
  const gatewayMinter = options.gatewayMinter || serverEnv('NIBGATE_GATEWAY_MINTER') || ARC_GATEWAY_MINTER;
  const gatewayApi = options.gatewayApi || serverEnv('NIBGATE_GATEWAY_API') || GATEWAY_API_TESTNET;
  const minFee = BigInt(options.gatewayFeeFloor ?? 4_000); // buffer above the 0.0035 testnet floor

  const publicClient = options.publicClient || sharedPublicClient(rpcUrl);
  const walletClient = options.walletClient || createWalletClient({ transport: rpcTransport(rpcUrl) });

  // A Gateway-credited ledger is not enough: Circle's TEE validates the
  // ERC-1271 signature by eth_call-ing isValidSignature on the wallet, which
  // returns empty bytes for a code-less address. Ensure the wallet contract is
  // deployed first (permissionless, deterministic CREATE2).
  await ensureFeeWalletDeployed(wallet, { ...options, rpcUrl, account });

  // The gateway rail idempotency signal is the ledger balance itself: a
  // successful withdrawal debits the ledger, so the next sweep reads a lower
  // available and skips below-threshold. Do NOT use the on-chain balance as a
  // proxy — a direct-rail receipt (or any on-chain USDC) would then suppress
  // the gateway withdrawal entirely and strand the credited ledger.
  const ledger = await gatewayBalanceFor(wallet, { domain, gatewayApi });
  const value = ledger.available - minFee;
  if (value <= 0n) return { skipped: true, reason: 'below-threshold', available: ledger.available };

  const intent = buildSelfBurnIntent({ wallet, value, domain, gatewayWallet, gatewayMinter, usdc, maxFee: minFee });
  const { attestation, operatorSig } = await submitGatewayWithdrawal(intent, { gatewayApi });
  const tx = await withRpcRetry(
    () => walletClient.writeContract({
      abi: MINTER_ABI, address: getAddress(gatewayMinter), functionName: 'gatewayMint', account,
      args: [attestation, operatorSig],
    }),
    { label: 'gatewayMint' },
  );
  const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
  if (receipt.status !== 'success') {
    throw new Error(`gatewayMint reverted (tx ${tx}): status=${receipt.status}`);
  }
  return { minted: true, tx, value, transferId: null };
}

// Call distribute() on a fee wallet (splits its on-chain USDC: feeBps →
// treasury, rest → creator). Permissionless; anyone can run it.
export async function distributeFeeWallet(wallet, options = {}) {
  const walletKey = options.keeperKey || serverEnv('NIBGATE_KEEPER_PRIVATE_KEY') || '';
  if (!walletKey) throw new Error('distributeFeeWallet requires keeperKey (NIBGATE_KEEPER_PRIVATE_KEY)');
  const account = privateKeyToAccount(walletKey);
  const rpcUrl = options.rpcUrl || serverEnv('NIBGATE_PAYMENT_RPC_URL') || ARC_TESTNET_RPC;
  const publicClient = options.publicClient || sharedPublicClient(rpcUrl);
  const walletClient = options.walletClient || createWalletClient({ transport: rpcTransport(rpcUrl) });
  const balance = await feeWalletUsdcBalance(wallet, { ...options, rpcUrl });
  if (balance <= 0n) return { skipped: true, reason: 'no-balance' };
  const tx = await withRpcRetry(
    () => walletClient.writeContract({
      abi: WALLET_ABI, address: getAddress(wallet), functionName: 'distribute', account,
    }),
    { label: 'distribute' },
  );
  const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
  if (receipt.status !== 'success') {
    throw new Error(`distribute reverted (tx ${tx}): status=${receipt.status}`);
  }
  return { distributed: true, tx, amount: balance };
}

// Transient RPC errors (rate limits, 429s, connection resets) are expected on
// public testnet RPCs. Retry the write with exponential backoff so a rate-limit
// window doesn't permanently strand a wallet's revenue on the next keeper cycle.
// Non-transient errors (reverts, invalid args) surface immediately.
function isTransientRpcError(error) {
  const msg = String(error?.shortMessage || error?.message || error || '').toLowerCase();
  return (
    msg.includes('rate limit') ||
    msg.includes('request exceeds defined limit') ||
    msg.includes('too many requests') ||
    msg.includes('429') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('fetch failed')
  );
}

// Build a viem transport that fails over across Arc mirrors when the primary
// endpoint rate-limits eth_sendRawTransaction during a keeper sweep. Mirrors
// are the same chain (5042002), so any of them can sign + broadcast safely.
// The transport is cached per primary URL: creating one per call would open a
// fresh TLS connection per request (no socket pooling), which under a degraded
// network piles up thousands of half-open connects and exhausts FDs. rank is
// disabled — probing every mirror per client is exactly the storm we avoid.
const transportCache = new Map();
function rpcTransport(rpcUrl = '') {
  const primary = rpcUrl || serverEnv('NIBGATE_PAYMENT_RPC_URL') || ARC_TESTNET_RPC;
  const cacheKey = `transport:${primary}`;
  if (!transportCache.has(cacheKey)) {
    const mirrors = ARC_TESTNET_RPC_FALLBACKS.filter((u) => u !== primary);
    const urls = [primary, ...mirrors];
    transportCache.set(
      cacheKey,
      fallback(urls.map((u) => http(u, { retryCount: 1, timeout: 15_000 })), { rank: false }),
    );
  }
  return transportCache.get(cacheKey);
}

const publicClientCache = new Map();
function sharedPublicClient(rpcUrl = '') {
  const cacheKey = `public:${rpcUrl || 'default'}`;
  if (!publicClientCache.has(cacheKey)) {
    publicClientCache.set(cacheKey, createPublicClient({ transport: rpcTransport(rpcUrl) }));
  }
  return publicClientCache.get(cacheKey);
}

async function withRpcRetry(fn, { label = 'rpc', attempts = 4, baseDelayMs = 1_500 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientRpcError(error)) throw error;
      const delay = baseDelayMs * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error(`${label} failed after ${attempts} retries: ${lastError?.message}`);
}

// Ensure a fee wallet contract exists on-chain. The SDK resolves payTo via the
// factory's predictedWallet VIEW (no deploy), so a buyer can credit a wallet's
// Gateway ledger before any contract exists. The keeper must materialize it
// (CREATE2 via deployIfNeeded, permissionless) before ERC-1271 withdrawal.
// Returns 'deployed' when code was created, 'exists' when already present.
export async function ensureFeeWalletDeployed(wallet, options = {}) {
  const rpcUrl = options.rpcUrl || serverEnv('NIBGATE_PAYMENT_RPC_URL') || ARC_TESTNET_RPC;
  const publicClient = options.publicClient || sharedPublicClient(rpcUrl);
  const onchain = await publicClient.getCode({ address: getAddress(wallet) });
  if (onchain && onchain.length > 0) return { status: 'exists', wallet: getAddress(wallet) };

  const factory = options.feeWalletFactory || serverEnv('NIBGATE_FEE_WALLET_FACTORY') || '';
  if (!factory) throw new Error('ensureFeeWalletDeployed requires feeWalletFactory (NIBGATE_FEE_WALLET_FACTORY)');
  const creator = options.creator || '';
  if (!creator) throw new Error('ensureFeeWalletDeployed requires creator to deploy the wallet');

  const walletKey = options.keeperKey || serverEnv('NIBGATE_KEEPER_PRIVATE_KEY') || '';
  if (!walletKey) throw new Error('ensureFeeWalletDeployed requires keeperKey (NIBGATE_KEEPER_PRIVATE_KEY)');
  const account = options.account || privateKeyToAccount(walletKey);
  const walletClient = options.walletClient || createWalletClient({ transport: rpcTransport(rpcUrl) });
  const tx = await withRpcRetry(
    () => walletClient.writeContract({
      abi: FEE_WALLET_FACTORY_ABI, address: getAddress(factory), functionName: 'deployIfNeeded', account,
      args: [getAddress(creator)],
    }),
    { label: 'deployIfNeeded' },
  );
  const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
  if (receipt.status !== 'success') {
    throw new Error(`deployIfNeeded reverted (tx ${tx}): status=${receipt.status}`);
  }
  return { status: 'deployed', wallet: getAddress(wallet), tx };
}

// In-process serialization: two concurrent sweeps of the SAME wallet would both
// read the ledger available, both obtain a valid attestation, and both mint —
// double-crediting the wallet. A per-process in-flight set makes the second
// caller wait for the first. (Cross-process, the keeper's interval + the
// gateway ledger debiting on attestation are the remaining guardrails.)
const inFlightSweeps = new Map();

// Full keeper sweep for one fee wallet: withdraw any Gateway-credited balance
// onto the chain (gateway rail), then distribute the wallet's on-chain USDC
// (both rails). Returns a per-wallet result summary. Pass creator so the wallet
// is deployed if it does not exist yet (see ensureFeeWalletDeployed).
export async function sweepFeeWallet(wallet, options = {}) {
  const key = String(wallet).toLowerCase();
  const prior = inFlightSweeps.get(key);
  if (prior) {
    try { await prior; return { wallet, gateway: { skipped: true, reason: 'already-in-flight' }, distributed: { skipped: true, reason: 'already-in-flight' } }; }
    catch { /* prior failed; fall through to sweep again */ }
  }
  let run;
  const promise = (run = (async () => {
    const gateway = await withdrawGatewayBalanceFor(wallet, options).catch((e) => ({ skipped: true, reason: `gateway:${e.message}` }));
    const distributed = await distributeFeeWallet(wallet, options).catch((e) => ({ skipped: true, reason: `distribute:${e.message}` }));
    return { wallet, gateway, distributed };
  })());
  inFlightSweeps.set(key, promise);
  try {
    return await promise;
  } finally {
    if (inFlightSweeps.get(key) === promise) inFlightSweeps.delete(key);
  }
}
