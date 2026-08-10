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

export async function relayX402Payment({ sellerAddress, description, req, res, price, defaultPrice = '0', facilitatorUrl, networks }) {
  const { createGatewayMiddleware } = await import('@circle-fin/x402-batching/server');
  const resolvedFacilitator = facilitatorUrl || process.env.NIBGATE_FACILITATOR_URL || process.env.CIRCLE_GATEWAY_FACILITATOR_URL || CIRCLE_GATEWAY_TESTNET_URL;
  const resolvedNetworks = networks || [process.env.NIBGATE_PAYMENT_NETWORK || ARC_TESTNET_CAIP2];

  const middleware = createGatewayMiddleware({
    sellerAddress,
    facilitatorUrl: resolvedFacilitator,
    networks: resolvedNetworks,
    description,
  });

  let body = '';
  const headers = {};
  let statusCode = 200;
  let nextCalled = false;
  const requestHeaders = {};
  const sourceHeaders = req.headers || {};
  for (const key of Object.keys(sourceHeaders)) {
    requestHeaders[key.toLowerCase()] = sourceHeaders[key];
  }
  const mwReq = { method: req.method || 'GET', url: req.body?.path || '/', headers: requestHeaders };
  const mwRes = {
    get statusCode() { return statusCode; },
    set statusCode(v) { statusCode = v; },
    setHeader(name, value) { headers[name] = value; },
    end(value = '') { body = value; },
  };

  await middleware.require(`$${price || defaultPrice}`)(mwReq, mwRes, () => { nextCalled = true; });

  if (!nextCalled) {
    res.status(statusCode).set(headers).send(body);
    return null;
  }
  return {
    payer: String(mwReq.payment?.payer || '').toLowerCase(),
    txHash: String(mwReq.payment?.transaction || ''),
    networks: resolvedNetworks,
  };
}

export async function gatewayBalance(address) {
  const apiKey = process.env.CIRCLE_API_KEY || '';
  if (!apiKey) return '';
  const r = await fetch('https://gateway-api-testnet.circle.com/v1/balances', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'USDC', sources: [{ depositor: address, domain: 26 }] }),
  });
  const data = await r.json();
  const bal = data?.balances?.[0]?.balance || '';
  return bal ? Number(bal).toFixed(2) + ' USDC' : '';
}

export { ARC_TESTNET_CAIP2, CIRCLE_GATEWAY_TESTNET_URL };
