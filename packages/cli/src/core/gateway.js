import { nanoid } from 'nanoid';
import { createPaymentChallenge, createUnlockToken, verifyUnlockToken } from '@nibgate/sdk/server';
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

    const cached = unlocks.get(token);
    if (cached && cached.routeId === routeId && cached.expiresAt > Date.now()) return cached;

    const resource = routeById(routeId);
    if (!resource) return null;
    const payload = verifyUnlockToken(token, resource);
    if (!payload) return null;

    const result = {
      token,
      routeId,
      paymentId: payload.paymentId,
      actor: payload.actor,
      expiresAt: payload.exp * 1000
    };
    unlocks.set(token, result);
    store.upsertUnlock(result);
    return result;
  }

  function createPaymentChallengeForRoute(route, mode = 'human') {
    const recipient = route.recipientWallet || paymentProvider.sellerAddress || config.site.creatorWallet;
    const resource = {
      id: route.id,
      title: route.title,
      type: route.type,
      price: mode === 'agent' && route.agentPrice ? route.agentPrice : route.price,
      currency: route.currency,
      path: route.path,
      url: `${config.site.origin}${route.path}`,
      recipient,
    };

    const challenge = createPaymentChallenge(resource, {
      network: route.network,
      paymentMode: paymentProvider.mode,
      paymentRail: paymentProvider.isLive ? 'gateway' : 'demo',
      actor: mode,
      origin: config.site.origin,
    });

    challenge.nibgate = {
      ...challenge.nibgate,
      unit: route.unit || 'unlock',
      humanPrice: route.price,
      agentPrice: route.agentPrice || route.price,
      network: route.network,
      license: route.license,
      splits: route.splits,
      platformFeeBps: config.site.platformFeeBps,
      provider: paymentProvider.displayName,
    };

    return challenge;
  }

  function recordPayment(route, actor, amount, settlement = {}) {
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

    const resource = {
      id: route.id,
      title: route.title,
      type: route.type,
      price: amount,
      currency: route.currency,
      path: route.path,
      recipient: paymentProvider.sellerAddress || config.site.creatorWallet,
    };

    const token = createUnlockToken(resource, {
      paymentId: payment.id,
      payment: {
        txHash: payment.txHash,
        payer: payment.payer,
        recipient: resource.recipient,
        amount: Number(amount),
        currency: route.currency,
        verified: Boolean(settlement.verified),
      },
      actor,
      expiresInSeconds: 60 * 60 * 12,
    });

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
    createPaymentChallenge: createPaymentChallengeForRoute,
    recordPayment,
    agentManifest
  };
}
