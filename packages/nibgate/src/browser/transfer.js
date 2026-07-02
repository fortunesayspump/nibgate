import { normalizeResource } from '../core/resource.js';
import { checkResourceAccess } from './index.js';

export function createTransferCheckout(resource, options = {}) {
  const normalized = normalizeResource({ ...resource, paymentRail: 'transfer' });
  const sendTransfer = options.sendTransfer || options.transfer;
  if (typeof sendTransfer !== 'function') {
    throw new Error('createTransferCheckout requires sendTransfer({ resource, recipient, amount, currency, network }) and a server verifyTransfer hook.');
  }

  return {
    resource: normalized,
    async pay(input = {}) {
      const recipient = normalized.recipient || normalized.payTo;
      const amount = String(normalized.price || normalized.amount || '0');
      const currency = normalized.currency || 'USDC';
      const network = options.network || input.challenge?.accepts?.[0]?.network || 'eip155:5042002';
      const result = await sendTransfer({ resource: normalized, recipient, amount, currency, network, challenge: input.challenge });
      const txHash = result?.txHash || result?.hash || result?.transactionHash || result?.paymentId || '';
      if (!txHash) throw new Error('Transfer checkout did not return a txHash.');
      return {
        paymentSignature: txHash,
        signature: txHash,
        memo: result.memo || '',
        metadata: {
          paymentProvider: 'direct-transfer',
          paymentId: txHash,
          txHash,
          recipient,
          amount: Number(amount),
          currency,
          network,
          ...(result.metadata || result)
        }
      };
    }
  };
}

export async function payWithTransfer(resource, options = {}) {
  const checkout = options.checkout || createTransferCheckout(resource, options).pay;
  const result = await checkout({ resource: normalizeResource(resource), challenge: options.challenge || null });
  const txHash = result?.metadata?.txHash || result?.txHash || result?.paymentSignature || result?.signature || '';
  if (!txHash) throw new Error('Transfer checkout did not return a txHash.');
  return checkResourceAccess(resource, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'x-nibgate-transfer-tx': txHash
    },
    payment: result.metadata || { paymentProvider: 'direct-transfer', txHash, paymentId: txHash }
  });
}
