import { normalizeServerResource as normalizeResource } from '../core/resource.js';
import { serverEnv } from './env.js';
import { jsonResponse } from './response.js';

async function importGatewayPackage(specifier) {
  return import(specifier);
}

// Batching option block the Circle v3 client requires on every gateway
// accept (extra.name GatewayWalletBatched v1 + verifyingContract). Without
// it, pay() throws "No Gateway batching option available" — for unlock AND
// tip challenges alike. Pure data, no network.
export function gatewayBatchingExtra(network = '') {
  const net = String(network || '').toLowerCase();
  const verifyingContract =
    net.includes('5042002') || net === 'testnet' || net.includes('testnet')
      ? '0x0077777d7EBA4688BDeF3E311b846F25870A19B9'
      : net.includes('5042') || net === 'mainnet' || net.includes('mainnet') || net.includes('arc')
        ? '0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE'
        : '';
  if (!verifyingContract) return undefined;
  return { name: 'GatewayWalletBatched', version: '1', verifyingContract };
}

export async function payWithGateway(resourceInput, options = {}) {
  const resource = normalizeResource(resourceInput);
  const gatewayBuyerResult = await createGatewayBuyer(options);
  if (!gatewayBuyerResult.ok) return gatewayBuyerResult;
  const gatewayBuyer = gatewayBuyerResult.client;

  const origin = options.origin || serverEnv('NIBGATE_SITE_ORIGIN') || '';
  const accessUrl = options.accessUrl || `${origin.replace(/\/$/, '')}${resource.path || '/'}`;
  const paymentResult = await gatewayBuyer.pay(accessUrl);
  const data = paymentResult?.data || {};
  const returnedPayment = data.payment || {};
  return {
    ok: true,
    payment: {
      paymentId: returnedPayment.paymentId || data.paymentId || data.id || paymentResult?.id || '',
      paymentProvider: 'circle-gateway',
      memo: returnedPayment.memo || data.memo || paymentResult?.memo || '',
      txHash: returnedPayment.txHash || data.txHash || data.transaction || paymentResult?.transaction || '',
      receiptUrl: returnedPayment.receiptUrl || data.receiptUrl || '',
      chainExplorerUrl: returnedPayment.chainExplorerUrl || ((returnedPayment.txHash || data.txHash || data.transaction || paymentResult?.transaction)
        ? `${/^eip155:5042$/.test(returnedPayment.network || options.network || serverEnv('NIBGATE_PAYMENT_NETWORK') || '') ? 'https://explorer.arc.io' : 'https://testnet.arcscan.app'}/tx/${returnedPayment.txHash || data.txHash || data.transaction || paymentResult?.transaction}`
        : ''),
      amount: Number(returnedPayment.amount || resource.price || 0),
      revenue: Number(returnedPayment.revenue || returnedPayment.amount || resource.price || 0),
      currency: returnedPayment.currency || resource.currency || 'USDC',
      payer: returnedPayment.payer || data.payer || gatewayBuyerResult.address || '',
      recipient: resource.recipient || resource.payTo || options.recipient || serverEnv('NIBGATE_SELLER_ADDRESS') || '',
      network: returnedPayment.network || options.network || serverEnv('NIBGATE_PAYMENT_NETWORK') || 'eip155:5042002',
      verified: true,
      raw: data
    },
    raw: paymentResult
  };
}

export async function createGatewayBuyer(options = {}) {
  const buyerPrivateKey = options.buyerPrivateKey || serverEnv('NIBGATE_BUYER_PRIVATE_KEY') || '';
  if (!buyerPrivateKey) {
    return {
      ok: false,
      status: 503,
      error: 'Gateway buyer is not configured',
      detail: 'Set NIBGATE_BUYER_PRIVATE_KEY so this local example can execute a real Gateway payment.'
    };
  }

  let GatewayClient;
  try {
    ({ GatewayClient } = await importGatewayPackage('@circle-fin/x402-batching/client'));
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: 'Gateway client package is not available',
      detail: error.message
    };
  }

  const gatewayBuyer = new GatewayClient({
    chain: options.buyerChain || serverEnv('NIBGATE_BUYER_CHAIN') || defaultBuyerChain(),
    privateKey: buyerPrivateKey,
    rpcUrl: options.buyerRpcUrl || serverEnv('NIBGATE_BUYER_RPC_URL') || undefined
  });

  return {
    ok: true,
    client: gatewayBuyer,
    address: gatewayBuyer.address,
    chain: options.buyerChain || serverEnv('NIBGATE_BUYER_CHAIN') || defaultBuyerChain()
  };
}

export async function getGatewayBalances(options = {}) {
  const buyer = await createGatewayBuyer(options);
  if (!buyer.ok) return buyer;
  const balances = await buyer.client.getBalances(options.address);
  return { ok: true, address: options.address || buyer.address, ...balances };
}

export async function depositToGateway(amount, options = {}) {
  const buyer = await createGatewayBuyer(options);
  if (!buyer.ok) return buyer;
  const result = await buyer.client.deposit(String(amount), options.depositOptions || {});
  return { ok: true, ...result };
}

export async function withdrawFromGateway(amount, options = {}) {
  const buyer = await createGatewayBuyer(options);
  if (!buyer.ok) return buyer;
  const result = await buyer.client.withdraw(String(amount), {
    chain: options.chain,
    recipient: options.recipient,
    maxFee: options.maxFee,
    ...(options.withdrawOptions || {})
  });
  return { ok: true, ...result };
}

// Network-aware Circle Gateway defaults. An unset var must never silently pick
// the other stack: mainnet content verified/paid through the TESTNET facilitator
// fails, which drops the receipt (and revenue) on the floor.
// NOTE: testnet is checked first because 'eip155:5042002' contains '5042' —
// a naive includes('5042') classifies the testnet CAIP as mainnet and sends
// testnet payments to the mainnet facilitator (which rejects them).
export function isMainnetNetwork(value = '') {
  const v = String(value || '').toLowerCase();
  if (v.includes('testnet') || v.includes('5042002')) return false;
  return v === 'mainnet' || v.includes('5042');
}
export function activePaymentNetwork() {
  return serverEnv('NIBGATE_PAYMENT_NETWORK') || serverEnv('NIBGATE_NETWORK') || '';
}
export function defaultFacilitatorUrl(network = activePaymentNetwork()) {
  return isMainnetNetwork(network) ? 'https://gateway-api.circle.com' : 'https://gateway-api-testnet.circle.com';
}
export function defaultGatewayApi(network = activePaymentNetwork()) {
  return isMainnetNetwork(network) ? 'https://gateway-api.circle.com/v1' : 'https://gateway-api-testnet.circle.com/v1';
}
export function defaultBuyerChain(network = activePaymentNetwork()) {
  return isMainnetNetwork(network) ? 'arc' : 'arcTestnet';
}

export async function runCircleGatewayRequirement(request, resourceInput, options = {}) {
  let createGatewayMiddleware;
  try {
    ({ createGatewayMiddleware } = await importGatewayPackage('@circle-fin/x402-batching/server'));
  } catch (error) {
    return {
      handled: true,
      response: jsonResponse({
        error: 'Gateway server package is not available',
        detail: error.message
      }, { status: 500 })
    };
  }

  const resource = normalizeResource(resourceInput);
  const recipient = resource.recipient || resource.payTo || options.recipient || serverEnv('NIBGATE_SELLER_ADDRESS') || '';
  if (!recipient) {
    return {
      handled: true,
      response: jsonResponse({
        error: 'Gateway seller address is not configured',
        detail: 'Set NIBGATE_SELLER_ADDRESS or pass recipient in the resource.'
      }, { status: 400 })
    };
  }
  const middleware = createGatewayMiddleware({
    sellerAddress: recipient,
    facilitatorUrl: options.facilitatorUrl || serverEnv('NIBGATE_FACILITATOR_URL') || serverEnv('CIRCLE_GATEWAY_FACILITATOR_URL') || defaultFacilitatorUrl(options.network || activePaymentNetwork()),
    networks: [options.network || serverEnv('NIBGATE_PAYMENT_NETWORK') || 'eip155:5042002'],
    description: `Unlock ${resource.title}`
  });

  let body = '';
  const headers = {};
  let statusCode = 200;
  let nextCalled = false;
  const requestHeaders = {};
  const sourceHeaders = request.headers || {};
  if (typeof sourceHeaders.forEach === 'function') {
    sourceHeaders.forEach((value, key) => { requestHeaders[key.toLowerCase()] = value; });
  } else {
    for (const key of Object.keys(sourceHeaders)) {
      requestHeaders[key.toLowerCase()] = sourceHeaders[key];
    }
  }
  const req = {
    method: request.method || 'GET',
    url: resource.url || resource.path || '/',
    headers: requestHeaders
  };
  const res = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(value) {
      statusCode = value;
    },
    setHeader(name, value) {
      headers[name] = value;
    },
    end(value = '') {
      body = value;
    }
  };

  await middleware.require(`$${resource.price}`)(req, res, () => {
    nextCalled = true;
  });

  if (!nextCalled) {
    return {
      handled: true,
      response: new Response(body, {
        status: statusCode,
        headers
      })
    };
  }

  return {
    handled: false,
    payment: {
      paymentProvider: 'circle-gateway',
      paymentId: requestHeaders['payment-signature'] || '',
      memo: requestHeaders['payment-memo'] || '',
      payer: req.payment?.payer || '',
      amount: Number(resource.price || 0),
      revenue: Number(resource.price || 0),
      currency: resource.currency || 'USDC',
      recipient,
      network: options.network || serverEnv('NIBGATE_PAYMENT_NETWORK') || 'eip155:5042002',
      txHash: req.payment?.transaction || '',
      verified: true
    }
  };
}
