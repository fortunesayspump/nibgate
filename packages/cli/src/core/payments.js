import { createGatewayBuyer as sdkCreateGatewayBuyer } from '@nibgate/sdk/server';

const ARC_TESTNET_CAIP2 = 'eip155:5042002';

function normalizeUsdPrice(value) {
  const raw = String(value);
  return raw.startsWith('$') ? raw : `$${raw}`;
}

function publicMode(config) {
  return process.env.NIBGATE_PAYMENT_MODE || config.payments?.mode || 'demo';
}

export function createPaymentProvider(config) {
  const mode = publicMode(config);

  return {
    mode,
    displayName: mode === 'circle-gateway' ? 'Circle Gateway x402' : 'Demo payments',
    facilitatorUrl: config.payments?.facilitatorUrl || process.env.CIRCLE_GATEWAY_FACILITATOR_URL || 'https://gateway-api-testnet.circle.com',
    sellerAddress: process.env.NIBGATE_SELLER_ADDRESS || config.payments?.sellerAddress || '',
    networks: config.payments?.networks || [ARC_TESTNET_CAIP2],
    isLive: mode === 'circle-gateway',
    buyerChain: process.env.NIBGATE_BUYER_CHAIN || 'arcTestnet',
    buyerConfigured: Boolean(process.env.NIBGATE_BUYER_PRIVATE_KEY),
    buyerPrivateKey: process.env.NIBGATE_BUYER_PRIVATE_KEY || '',
    buyerRpcUrl: process.env.NIBGATE_BUYER_RPC_URL || '',
    priceFor(route, actor = 'human') {
      const price = actor === 'agent' && route.agentPrice ? route.agentPrice : route.price;
      return normalizeUsdPrice(price);
    }
  };
}

export async function createGatewayBuyer(provider) {
  if (!provider.isLive || !provider.buyerConfigured) return null;

  const result = await sdkCreateGatewayBuyer({
    buyerPrivateKey: provider.buyerPrivateKey,
    buyerChain: provider.buyerChain,
    buyerRpcUrl: provider.buyerRpcUrl,
  });

  return result.ok ? result.client : null;
}

export { ARC_TESTNET_CAIP2 };
