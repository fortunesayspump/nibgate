import { normalizePaymentRail } from '../core/payment.js';
import { serverEnv } from './env.js';
import { createTransferVerifier, resolvePayTo, protocolFeeFor, feePolicy } from './fee-wallet.js';
import { runCircleGatewayRequirement, gatewayBatchingExtra } from './gateway.js';

// Nib Tip: tipping any content, no lock required. Same x402 envelope as
// unlocks so every client (extension, agents, Dr. Nib) parses one shape.
// A tip receipt is an unlock receipt with `type: 'tip'` and no access grant.
//
// Revenue parity with unlocks: hosted tips settle into the creator's fee
// wallet (1% default policy, split on distribute), self-hosted tips pay the
// creator directly. No tip-specific rails, no separate fee machinery.

export function createTipChallenge(input = {}, options = {}) {
  const contentUrl = String(input.contentUrl || input.url || '');
  if (!contentUrl) throw new Error('createTipChallenge requires contentUrl.');
  const amount = String(input.amount || options.amount || '');
  if (!(Number(amount) > 0)) throw new Error('createTipChallenge requires amount > 0.');
  const recipient = String(
    input.recipient || options.recipient || serverEnv('NIBGATE_TIP_RECIPIENT') || ''
  );
  const network = options.network || serverEnv('NIBGATE_PAYMENT_NETWORK') || 'eip155:5042002';
  const paymentRail = normalizePaymentRail(options.paymentRail || options.paymentMode || 'gateway');
  const title = String(input.title || 'Tipped content');
  const batchingExtra = paymentRail === 'gateway' ? gatewayBatchingExtra(network) : undefined;
  // Circle Gateway authorizations sign an integer value; encode the gateway
  // acceptance in USDC base units (6dp). Direct transfer + display stay decimal.
  const gatewayAmount = (() => {
    try { return BigInt(Math.round(Number(amount) * 1e6)).toString(); } catch { return String(amount); }
  })();
  return {
    x402Version: 2,
    status: 402,
    scheme: 'exact',
    paymentMode: paymentRail === 'gateway' ? (options.paymentMode || serverEnv('NIBGATE_PAYMENT_MODE') || 'unconfigured') : 'transfer',
    paymentRail,
    resource: {
      url: contentUrl,
      description: `Tip for ${title}`,
      mimeType: 'application/octet-stream',
    },
    accepts: [
      {
        scheme: 'exact',
        asset: input.currency || 'USDC',
        network,
        amount: paymentRail === 'gateway' ? gatewayAmount : amount,
        recipient,
        description: `Tip for ${title}`,
        resource: contentUrl,
        mimeType: 'application/octet-stream',
        payTo: recipient,
        maxTimeoutSeconds: options.maxTimeoutSeconds || 300,
        rail: paymentRail,
        ...(batchingExtra ? { extra: batchingExtra } : {}),
        transfer: paymentRail === 'transfer' ? {
          token: input.currency || 'USDC',
          chainId: options.chainId || network,
          recipient,
          amount,
          verifier: 'creator-server',
        } : undefined,
      },
    ],
    nibgate: {
      tip: true,
      contentUrl,
      title,
      amount,
      currency: input.currency || 'USDC',
      network,
      paymentRail,
      // Expiry/hold policy travels with the challenge so payers consent upfront.
      holdPolicy: options.holdPolicy || 'unresolved tips are held per-domain until claimed; never expire; refundable to the payer while unclaimed',
    },
  };
}

export function tipReceipt({ contentUrl, title, amount, currency = 'USDC', network, payerWallet, recipient, txHash, paymentId, protocolFee, payee, feeBps }) {
  return {
    type: 'tip',
    contentUrl, title, amount: Number(amount), currency, network,
    payerWallet: payerWallet || null,
    recipientWallet: recipient || null,
    payeeWallet: payee || recipient || null,
    protocolFee: Number(protocolFee) || 0,
    feeBps: feeBps ?? null,
    txHash: txHash || null,
    paymentId: paymentId || txHash || null,
    timestamp: new Date().toISOString(),
  };
}

// Resolve who a tip actually pays, exactly like unlocks: hosted surfaces
// settle into the creator's fee wallet, self-hosted pay the creator directly.
export async function resolveTipPayee(recipient, options = {}) {
  const to = String(recipient || options.recipient || serverEnv('NIBGATE_TIP_RECIPIENT') || '');
  if (!to) throw new Error('resolveTipPayee requires a recipient.');
  return resolvePayTo(to, options);
}

// Async tip requirement mirroring runHostedPayRequirement: resolve the payee,
// attach the fee policy, build the challenge. Hosts (and the future
// POST /hub/tips/challenge) call this instead of createTipChallenge directly
// so revenue can never drift from the unlock path.
export async function createTipRequirement(input = {}, options = {}) {
  const contentUrl = String(input.contentUrl || input.url || '');
  if (!contentUrl) throw new Error('createTipRequirement requires contentUrl.');
  const amount = String(input.amount || options.amount || '');
  if (!(Number(amount) > 0)) throw new Error('createTipRequirement requires amount > 0.');
  const payee = await resolveTipPayee(input.recipient || options.recipient, options);
  const policy = feePolicy(options);
  const fee = protocolFeeFor(amount, options);
  const challenge = createTipChallenge({ ...input, contentUrl, amount, recipient: payee }, options);
  return { payee, feeBps: policy.feeBps, protocolFee: fee, challenge };
}

// Verify a tip payment: Gateway receipt or direct-transfer proof.
// Reuses the unlock verifiers — money verification is rail-identical.
export function createTipVerifier(options = {}) {
  // createTransferVerifier returns the verify function itself (not an object).
  const verifyTransfer = createTransferVerifier(options);
  return {
    async verifyDirect({ resource, txHash, payment }) {
      return verifyTransfer({ resource, txHash, payment });
    },
    // Gateway: runs the Circle facilitator check against the tip challenge.
    // `req` is any object with { headers, method } (Express req works).
    // Returns { handled, response? } on missing/invalid signature (forward the
    // 402 challenge), or { handled: false, payment } when settled.
    async verifyGateway({ req, resource = {}, recipient, amount, network }) {
      return runCircleGatewayRequirement(
        req || { headers: {}, method: 'POST' },
        {
          price: String(amount),
          recipient,
          url: resource.contentUrl || resource.url || '',
          title: resource.title || 'Tipped content',
          currency: 'USDC',
        },
        { ...options, network: network || options.network },
      );
    },
  };
}

/**
 * Resolve who should receive a tip for a URL.
 * Order: explicit recipient → hub index (when hubApi given) → unresolved.
 * Page-signal extraction (author meta, rel=me) runs DOM-side (extension);
 * pass its result as authorHint. Confidence is JEV's input downstream.
 */
export async function resolveTipRecipient({ url, title, authorHint, hubApi, fetchFn } = {}) {
  const contentUrl = String(url || '');
  if (!contentUrl) return { state: 'unresolved', reason: 'no url' };
  const api = hubApi || serverEnv('NIBGATE_API_BASE') || '';
  if (api) {
    try {
      const doFetch = fetchFn || fetch;
      const res = await doFetch(`${String(api).replace(/\/+$/, '')}/hub/resolve?url=${encodeURIComponent(contentUrl)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.wallet) {
          return { state: 'resolved', wallet: data.wallet, confidence: Number(data.confidence ?? 0.9), source: 'hub-index' };
        }
      }
    } catch {}
  }
  if (authorHint && /^0x[a-fA-F0-9]{40}$/.test(authorHint)) {
    return { state: 'resolved', wallet: authorHint, confidence: 0.6, source: 'page-signal' };
  }
  return { state: 'unresolved', reason: 'no verified recipient; hold until claimed' };
}
