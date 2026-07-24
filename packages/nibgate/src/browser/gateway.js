import { stringifyJson } from './json.js';

function encodeBase64(value) {
  const text = typeof value === 'string' ? value : stringifyJson(value);
  if (typeof Buffer !== 'undefined') return Buffer.from(text).toString('base64');
  return btoa(unescape(encodeURIComponent(text)));
}

function decodeBase64(value) {
  if (typeof Buffer !== 'undefined') return Buffer.from(value, 'base64').toString('utf8');
  return decodeURIComponent(escape(atob(value)));
}

export async function createCircleGatewayBrowserAdapter(options = {}) {
  const signer = options.signer || await options.getSigner?.();
  if (!signer?.address || typeof signer.signTypedData !== 'function') {
    throw new Error('Circle Gateway browser adapter requires an EVM signer with address and signTypedData.');
  }

  let BatchEvmScheme;
  try {
    const circle = await import('@circle-fin/x402-batching/client');
    BatchEvmScheme = circle.BatchEvmScheme;
  } catch {
    const local = await import('./schemes/batch-scheme.js');
    BatchEvmScheme = local.BatchEvmScheme;
  }
  const scheme = options.clientModule?.BatchEvmScheme
    ? new options.clientModule.BatchEvmScheme(signer)
    : new BatchEvmScheme(signer);
  const network = options.network || options.chainId && `eip155:${options.chainId}` || 'eip155:5042002';

  function parsePaymentRequired(input) {
    if (input && typeof input === 'object') return input;
    if (!input || typeof input !== 'string') throw new Error('Missing PAYMENT-REQUIRED header.');
    return JSON.parse(decodeBase64(input));
  }

  function selectGatewayRequirement(paymentRequired) {
    const accepts = Array.isArray(paymentRequired?.accepts) ? paymentRequired.accepts : [];
    const selected = accepts.find((option) => {
      const extra = option.extra || {};
      return option.network === network
        && extra.name === 'GatewayWalletBatched'
        && extra.version === '1'
        && typeof extra.verifyingContract === 'string';
    }) || accepts.find((option) => {
      const extra = option.extra || {};
      return extra.name === 'GatewayWalletBatched'
        && extra.version === '1'
        && typeof extra.verifyingContract === 'string';
    });
    if (!selected) {
      const networks = accepts.map((option) => option.network).filter(Boolean).join(', ') || 'none';
      const hasGatewayExtra = accepts.some((option) => {
        const extra = option.extra || {};
        return extra.name === 'GatewayWalletBatched' && extra.version === '1' && typeof extra.verifyingContract === 'string';
      });
      throw new Error(
        hasGatewayExtra
          ? `No Circle Gateway batching payment option found for ${network}. Server returned networks: ${networks}.`
          : `The payment challenge is not a Circle Gateway batching challenge. Configure the creator access route with createCircleGatewayServer(...) or createNibgateServer({ paymentMode: 'circle-gateway', network: '${network}' }).`
      );
    }
    return selected;
  }

  return {
    signer,
    network,
    async pay({ paymentRequiredHeader, challenge }) {
      const paymentRequired = parsePaymentRequired(paymentRequiredHeader || challenge);
      const accepted = selectGatewayRequirement(paymentRequired);
      const x402Version = paymentRequired.x402Version ?? 2;
      const paymentPayload = await scheme.createPaymentPayload(x402Version, accepted);
      const paymentSignature = encodeBase64({
        ...paymentPayload,
        resource: paymentRequired.resource,
        accepted
      });
      return {
        paymentSignature,
        signature: paymentSignature,
        metadata: {
          paymentProvider: 'circle-gateway',
          network: accepted.network,
          payer: signer.address,
          recipient: accepted.payTo || accepted.recipient,
          amount: accepted.amount,
          currency: accepted.asset
        }
      };
    }
  };
}
