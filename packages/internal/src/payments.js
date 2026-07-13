const ARC_TESTNET_CAIP2 = 'eip155:5042002';
const CIRCLE_GATEWAY_TESTNET_URL = 'https://gateway-api-testnet.circle.com';
const DEFAULT_BUYER_CHAIN = 'arcTestnet';

function normalizeUsdPrice(value) {
  const raw = String(value);
  return raw.startsWith('$') ? raw : `$${raw}`;
}

function publicMode(config) {
  return process.env.NIBGATE_PAYMENT_MODE || config.payments?.mode || 'demo';
}

export function createPaymentProvider(config) {
  const mode = publicMode(config);
  const buyerPrivateKey = process.env.NIBGATE_BUYER_PRIVATE_KEY || '';

  return {
    mode,
    displayName: mode === 'circle-gateway' ? 'Circle Gateway x402' : 'Demo payments',
    facilitatorUrl: config.payments?.facilitatorUrl || process.env.CIRCLE_GATEWAY_FACILITATOR_URL || CIRCLE_GATEWAY_TESTNET_URL,
    sellerAddress: process.env.NIBGATE_SELLER_ADDRESS || config.payments?.sellerAddress || '',
    networks: config.payments?.networks || [ARC_TESTNET_CAIP2],
    isLive: mode === 'circle-gateway',
    buyerChain: process.env.NIBGATE_BUYER_CHAIN || DEFAULT_BUYER_CHAIN,
    buyerConfigured: Boolean(buyerPrivateKey),
    buyerPrivateKey,
    buyerRpcUrl: process.env.NIBGATE_BUYER_RPC_URL || '',
    priceFor(route, actor = 'human') {
      const price = actor === 'agent' && route.agentPrice ? route.agentPrice : route.price;
      return normalizeUsdPrice(price);
    }
  };
}

export async function createCircleGatewayMiddleware(provider) {
  if (!provider.isLive) return null;
  if (!provider.sellerAddress) {
    throw new Error('NIBGATE_SELLER_ADDRESS is required when NIBGATE_PAYMENT_MODE=circle-gateway.');
  }

  const { createGatewayMiddleware } = await import('@circle-fin/x402-batching/server');
  return createGatewayMiddleware({
    sellerAddress: provider.sellerAddress,
    facilitatorUrl: provider.facilitatorUrl,
    networks: provider.networks
  });
}

export async function createGatewayBuyer(provider) {
  if (!provider.isLive || !provider.buyerConfigured) return null;

  const { GatewayClient } = await import('@circle-fin/x402-batching/client');
  return new GatewayClient({
    chain: provider.buyerChain,
    privateKey: provider.buyerPrivateKey,
    rpcUrl: provider.buyerRpcUrl || undefined
  });
}

export { ARC_TESTNET_CAIP2, CIRCLE_GATEWAY_TESTNET_URL };
