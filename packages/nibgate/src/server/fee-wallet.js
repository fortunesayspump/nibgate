import { createPublicClient, http, getAddress, keccak256, encodePacked } from 'viem';
import { normalizePaymentRail } from '../core/payment.js';
import { normalizeServerResource as normalizeResource } from '../core/resource.js';
import { serverEnv } from './env.js';
import { createPaymentChallenge } from './challenge.js';
import { jsonResponse } from './response.js';
import { runCircleGatewayRequirement } from './gateway.js';

export const DEFAULT_TREASURY = '0x558e7BFaF2Cf1A494F44E50D92431Afc060C9D12';
export const DEFAULT_FEE_BPS = 100;
export const DEFAULT_MAX_FEE_BPS = 500;
export const ARC_TESTNET_CHAIN = 'eip155:5042002';

// Arc testnet constants for the direct (client-broadcast) rail. The buyer
// sends USDC straight from their wallet to the seller (the fee wallet for
// hosted content) and the hub verifies the transfer on-chain.
export const ARC_TESTNET_RPC = 'https://rpc.testnet.arc.io';
export const ARC_USDC = '0x3600000000000000000000000000000000000000';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

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
export function createTransferVerifier(options = {}) {
  const rpcUrl = options.rpcUrl || serverEnv('NIBGATE_PAYMENT_RPC_URL') || ARC_TESTNET_RPC;
  const usdc = getAddress(options.usdcAddress || serverEnv('NIBGATE_USDC_ADDRESS') || ARC_USDC);
  const client = createPublicClient({ transport: http(rpcUrl) });

  return async function verifyTransfer({ resource, txHash, payment, request }) {
    if (!txHash) return false;
    const payTo = String(
      payment?.recipient || resource?.recipient || resource?.payTo || options.recipient || options.sellerAddress || serverEnv('NIBGATE_SELLER_ADDRESS') || ''
    ).toLowerCase();
    if (!payTo) return false;
    const amountUsdc = Number(payment?.amount ?? resource?.price ?? options.price ?? 0);
    const amountWei = BigInt(Math.round(amountUsdc * 1e6));
    try {
      const receipt = await client.getTransactionReceipt({ hash: txHash });
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

// Deterministic CREATE2 address for a creator's fee wallet, mirroring the
// GatewayFeeWallet contract in revenue-model/poc/gateway. Deriving the address
// needs no deployment, so payTo resolution works before the factory exists.
// When the factory/template is unset, hosted surfaces fall back to the
// creator's own wallet (fee not yet enabled) and self-hosted surfaces always
// use the creator EOA.
export function feeWalletAddressFor(creator, options = {}) {
  if (!creator) return null;
  const factory = options.feeWalletFactory || serverEnv('NIBGATE_FEE_WALLET_FACTORY') || '';
  const templateHash = options.feeWalletTemplateHash || serverEnv('NIBGATE_FEE_WALLET_TEMPLATE_HASH') || '';
  if (!factory || !templateHash) return null;  const salt = keccak256(encodePacked(['address'], [getAddress(creator)]));
  const initCode = encodePacked(
    ['bytes', 'address', 'bytes32', 'bytes32'],
    ['0xff', getAddress(factory), salt, templateHash]
  );
  return getAddress(`0x${keccak256(initCode).slice(26)}`);
}

// The single seller-resolution seam. Every hosted surface (hub /hub/pay,
// subblogs, nibshare) resolves its seller through this so the fee wallet is
// the payTo for hosted content. Self-hosted creators resolve to their own
// wallet (no fee), and hosted content without a configured fee wallet still
// pays the creator.
export function resolvePayTo(recipient, options = {}) {
  const hosted = options.hosted !== false && (options.hosted === true || String(serverEnv('NIBGATE_HOSTED_PAY')).toLowerCase() === 'true');
  if (!hosted) return recipient;
  const feeWallet = feeWalletAddressFor(recipient, options);
  return feeWallet || recipient;
}

// Hosted-pay requirement for the hub's transfer (client-broadcast direct) rail.
// Serves the 402 challenge with the seller (fee wallet) as payTo when no tx is
// presented, or verifies the buyer's broadcast USDC transfer on-chain and
// returns the payment when it clears.
export async function runHostedTransferRequirement(request, resourceInput, options = {}) {
  const resource = normalizeResource(resourceInput);
  const recipient = resource.recipient || resource.payTo || options.recipient || options.sellerAddress || serverEnv('NIBGATE_SELLER_ADDRESS') || '';
  const seller = resolvePayTo(recipient, options);
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
  const seller = resolvePayTo(recipient, options);
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
