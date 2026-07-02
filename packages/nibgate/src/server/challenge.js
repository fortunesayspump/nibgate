import { normalizePaymentRail } from '../core/payment.js';
import { normalizeServerResource as normalizeResource } from '../core/resource.js';
import { serverEnv } from './env.js';

export function createPaymentChallenge(resourceInput, options = {}) {
  const resource = normalizeResource(resourceInput);
  const origin = options.origin || serverEnv('NIBGATE_SITE_ORIGIN') || '';
  const actor = options.actor || 'human';
  const recipient = resource.recipient || resource.payTo || options.recipient || serverEnv('NIBGATE_SELLER_ADDRESS') || '';
  const paymentRail = normalizePaymentRail(resource.paymentRail || options.paymentRail || options.paymentMode);
  return {
    x402Version: options.x402Version || 2,
    status: 402,
    scheme: 'exact',
    paymentMode: paymentRail === 'gateway' ? (options.paymentMode || serverEnv('NIBGATE_PAYMENT_MODE') || 'unconfigured') : 'transfer',
    paymentRail,
    accepts: [
      {
        asset: resource.currency,
        network: options.network || serverEnv('NIBGATE_PAYMENT_NETWORK') || 'eip155:5042002',
        amount: String(resource.price),
        recipient,
        description: `Unlock ${resource.title}`,
        resource: resource.url || `${origin}${resource.path}`,
        mimeType: resource.type === 'article' ? 'text/html' : 'application/octet-stream',
        payTo: recipient,
        maxTimeoutSeconds: options.maxTimeoutSeconds || 120,
        rail: paymentRail,
        transfer: paymentRail === 'transfer' ? {
          token: resource.currency || 'USDC',
          chainId: options.chainId || options.network || serverEnv('NIBGATE_PAYMENT_NETWORK') || 'eip155:5042002',
          recipient,
          amount: String(resource.price),
          verifier: 'creator-server'
        } : undefined
      }
    ],
    nibgate: {
      contentId: resource.id,
      title: resource.title,
      contentType: resource.type,
      price: String(resource.price),
      currency: resource.currency,
      path: resource.path,
      actor,
      access: resource.access,
      unlock: resource.unlock,
      paymentRail
    }
  };
}
