import { createGatewayBuyer as sdkCreateGatewayBuyer } from '@nibgate/sdk/server';

const ARC_TESTNET_CAIP2 = 'eip155:5042002';
const ARC_MAINNET_CAIP2 = 'eip155:5042';

function configuredNetwork(config = {}) {
  const explicit = process.env.NIBGATE_PAYMENT_NETWORK
    || process.env.NIBGATE_NETWORK
    || config.payments?.networks?.[0]
    || config.routes?.find((route) => route.network)?.network
    || ARC_TESTNET_CAIP2;
  const value = String(explicit).toLowerCase();
  // Testnet's chain id contains "5042", so test it first.
  const mainnet = !(value.includes('testnet') || value.includes('5042002'))
    && (value === 'mainnet' || value === 'arc' || value.includes('5042'));
  return {
    caip2: mainnet ? ARC_MAINNET_CAIP2 : ARC_TESTNET_CAIP2,
    buyerChain: mainnet ? 'arc' : 'arcTestnet',
    facilitatorUrl: mainnet ? 'https://gateway-api.circle.com' : 'https://gateway-api-testnet.circle.com',
  };
}

function normalizeUsdPrice(value) {
  const raw = String(value);
  return raw.startsWith('$') ? raw : `$${raw}`;
}

function publicMode(config) {
  return process.env.NIBGATE_PAYMENT_MODE || config.payments?.mode || 'demo';
}

export function createPaymentProvider(config) {
  const mode = publicMode(config);
  const defaults = configuredNetwork(config);
  const environmentNetwork = process.env.NIBGATE_PAYMENT_NETWORK || process.env.NIBGATE_NETWORK;

  return {
    mode,
    displayName: mode === 'circle-gateway' ? 'Circle Gateway x402' : 'Demo payments',
    facilitatorUrl: config.payments?.facilitatorUrl || process.env.CIRCLE_GATEWAY_FACILITATOR_URL || defaults.facilitatorUrl,
    sellerAddress: process.env.NIBGATE_SELLER_ADDRESS || config.payments?.sellerAddress || '',
    networks: environmentNetwork
      ? [defaults.caip2]
      : (config.payments?.networks?.length ? config.payments.networks : [defaults.caip2]),
    isLive: mode === 'circle-gateway',
    buyerChain: process.env.NIBGATE_BUYER_CHAIN || defaults.buyerChain,
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

export { ARC_TESTNET_CAIP2, ARC_MAINNET_CAIP2 };
