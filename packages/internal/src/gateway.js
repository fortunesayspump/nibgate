import { nanoid } from 'nanoid';
import { createPaymentProvider } from './payments.js';

export function createGateway(config, store) {
  const unlocks = new Map();
  const paymentProvider = createPaymentProvider(config);

  for (const unlock of store.listUnlocks()) {
    if (unlock.expiresAt > Date.now()) {
      unlocks.set(unlock.token, unlock);
    }
  }

  function routeById(id) {
    return config.routes.find((route) => route.id === id);
  }

  function routeByPath(requestPath) {
    return config.routes.find((route) => requestPath === route.path || requestPath.startsWith(`${route.path}/`));
  }

  function totalEarnings() {
    return store.listPayments().reduce((sum, payment) => sum + Number(payment.amount), 0);
  }

  function getUnlock(req, routeId) {
    const token = req.cookies[`nibgate_unlock_${routeId}`] || req.get('x-nibgate-unlock');
    if (!token) return null;

    const unlock = unlocks.get(token);
    if (!unlock || unlock.routeId !== routeId || unlock.expiresAt < Date.now()) return null;
    return unlock;
  }

  function createPaymentChallenge(route, mode = 'human') {
    const amount = mode === 'agent' && route.agentPrice ? route.agentPrice : route.price;
    const challenge = {
      x402Version: paymentProvider.isLive ? 2 : 'draft-demo',
      status: 402,
      scheme: 'exact',
      paymentMode: paymentProvider.mode,
      accepts: [
        {
          asset: route.currency,
          network: paymentProvider.networks[0] || route.network,
          amount,
          recipient: paymentProvider.sellerAddress || config.site.creatorWallet,
          description: `Unlock ${route.title}`,
          resource: `${config.site.origin}${route.path}`,
          mimeType: route.type === 'article' ? 'text/html' : 'application/octet-stream',
          payTo: paymentProvider.sellerAddress || config.site.creatorWallet,
          maxTimeoutSeconds: 120
        }
      ],
      nibgate: {
        contentId: route.id,
        title: route.title,
        contentType: route.type,
        unit: route.unit || 'unlock',
        humanPrice: route.price,
        agentPrice: route.agentPrice || route.price,
        currency: route.currency,
        network: route.network,
        license: route.license,
        splits: route.splits,
        platformFeeBps: config.site.platformFeeBps,
        provider: paymentProvider.displayName
      }
    };
    return challenge;
  }

  function recordPayment(route, actor, amount, settlement = {}) {
    const token = nanoid(28);
    const now = Date.now();
    const payment = {
      id: nanoid(14),
      routeId: route.id,
      title: route.title,
      actor,
      amount,
      currency: route.currency,
      network: route.network,
      createdAt: new Date(now).toISOString(),
      txHash: settlement.transaction || `arc_demo_${nanoid(18)}`,
      payer: settlement.payer || null,
      provider: settlement.provider || paymentProvider.mode
    };

    const unlock = {
      token,
      routeId: route.id,
      paymentId: payment.id,
      actor,
      expiresAt: now + 1000 * 60 * 60 * 12
    };

    store.appendPayment(payment);
    unlocks.set(token, unlock);
    store.upsertUnlock(unlock);

    return { token, payment };
  }

  function agentManifest() {
    return {
      name: config.site.name,
      protocol: 'nibgate-demo',
      x402: true,
      paymentMode: paymentProvider.mode,
      paymentProvider: paymentProvider.displayName,
      creatorWallet: config.site.creatorWallet,
      sellerAddress: paymentProvider.sellerAddress || config.site.creatorWallet,
      platformFeeBps: config.site.platformFeeBps,
      resources: config.routes.map((route) => ({
        id: route.id,
        title: route.title,
        type: route.type,
        path: route.path,
        price: route.price,
        agentPrice: route.agentPrice || route.price,
        currency: route.currency,
        network: route.network,
        license: route.license
      }))
    };
  }

  return {
    config,
    paymentProvider,
    payments: store.listPayments(),
    routeById,
    routeByPath,
    totalEarnings,
    getUnlock,
    createPaymentChallenge,
    recordPayment,
    agentManifest
  };
}
