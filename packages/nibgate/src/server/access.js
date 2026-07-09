import { normalizePaymentRail } from '../core/payment.js';
import { normalizeServerResource as normalizeResource } from '../core/resource.js';
import { actorFromRequest, accessModeFor } from './actor.js';
import { createPaymentChallenge } from './challenge.js';
import { jsonResponse } from './response.js';
import { DEFAULT_UNLOCK_SECONDS, createUnlockToken, verifyUnlockToken } from './proof.js';
import { createManifest, manifestResponse } from './manifest.js';
import { emitHubEvent } from './hub.js';
import { depositToGateway, getGatewayBalances, payWithGateway, runCircleGatewayRequirement, withdrawFromGateway } from './gateway.js';
import { serverEnv } from './env.js';

export function createNibgateServer(options = {}) {
  const secret = options.secret || serverEnv('NIBGATE_SECRET') || serverEnv('NIBGATE_UNLOCK_SECRET') || 'nibgate-dev-secret';
  const verifyPayment = options.verifyPayment || null;
  const verifyTransfer = options.verifyTransfer || null;

  async function unlock(resourceInput, payment = {}) {
    const resource = normalizeResource(resourceInput);
    if (verifyPayment) {
      const verified = await verifyPayment({ resource, payment });
      if (!verified) {
        return { ok: false, status: 402, error: 'Payment verification failed', challenge: createPaymentChallenge(resource, options) };
      }
    }

    const unlockProof = createUnlockToken(resource, {
      secret,
      paymentId: payment.paymentId || payment.id || '',
      payment,
      actor: payment.actor || 'human',
      expiresInSeconds: payment.expiresInSeconds || options.expiresInSeconds
    });

    return {
      ok: true,
      unlockProof,
      expiresInSeconds: payment.expiresInSeconds || options.expiresInSeconds || DEFAULT_UNLOCK_SECONDS,
      resource,
      payment
    };
  }

  function isUnlocked(request, resourceInput, checkOptions = {}) {
    const resource = normalizeResource(resourceInput);
    const token = request?.headers?.get?.('x-nibgate-payment-proof') || '';
    const payload = verifyUnlockToken(token, resource, { secret });
    if (!payload) return false;
    if (checkOptions.actor && payload.actor && payload.actor !== checkOptions.actor) return false;
    return true;
  }

  function accessFor(request, resourceInput, accessOptions = {}) {
    const resource = normalizeResource(resourceInput);
    const actor = accessOptions.actor || actorFromRequest(request, accessOptions.defaultActor || 'human');
    const mode = accessModeFor(resource, actor);
    const unlocked = isUnlocked(request, resource, { actor });
    return {
      actor,
      mode,
      unlocked,
      allowed: mode === 'free' || unlocked,
      blocked: mode === 'blocked',
      paid: mode === 'paid',
      resource
    };
  }

  function protect(resourceInput, handler, routeOptions = {}) {
    const resource = normalizeResource(resourceInput);
    return async function protectedHandler(request, context) {
      const access = accessFor(request, resource, routeOptions);
      if (access.allowed) {
        return handler(request, context);
      }

      if (access.blocked) {
        return jsonResponse({
          status: 403,
          error: `${access.actor} access is blocked for this resource`,
          nibgate: {
            contentId: resource.id,
            actor: access.actor,
            access: resource.access
          }
        }, { status: 403 });
      }

      const challenge = createPaymentChallenge(resource, { ...options, ...routeOptions, actor: access.actor });
      return jsonResponse(challenge, { status: 402 });
    };
  }

  async function accessResponse(request, resourceInput, allowedBody = null, routeOptions = {}) {
    const resource = normalizeResource(resourceInput);
    const access = accessFor(request, resource, routeOptions);

    if (!access.allowed) {
      if (access.blocked) {
        return jsonResponse({
          status: 403,
          error: `${access.actor} access is blocked for this resource`,
          resource
        }, { status: 403 });
      }

      const rail = normalizePaymentRail(resource.paymentRail || routeOptions.paymentRail || options.paymentRail || routeOptions.paymentMode || options.paymentMode);
      if (rail === 'gateway' && (routeOptions.paymentMode || options.paymentMode || serverEnv('NIBGATE_PAYMENT_MODE')) === 'circle-gateway') {
        const gateway = await runCircleGatewayRequirement(request, resource, { ...options, ...routeOptions });
        if (gateway.handled) return gateway.response;
        const result = await unlock(resource, gateway.payment);
        if (result.ok) {
          return jsonResponse({ ok: true, resource, payment: gateway.payment, unlockProof: result.unlockProof, expiresInSeconds: result.expiresInSeconds });
        }
      }

      if (rail === 'transfer') {
        const txHash = request.headers?.get?.('x-nibgate-transfer-tx') || request.headers?.get?.('x-transfer-tx') || '';
        if (txHash) {
          if (!verifyTransfer) {
            return jsonResponse({ error: 'Transfer verification is not configured', detail: 'Pass verifyTransfer({ resource, txHash, request }) to createNibgateServer/createCircleGatewayServer before using paymentRail: transfer.' }, { status: 501 });
          }
          const transferPayment = {
            paymentProvider: 'direct-transfer',
            paymentId: txHash,
            txHash,
            amount: Number(resource.price || 0),
            revenue: Number(resource.price || 0),
            currency: resource.currency || 'USDC',
            recipient: resource.recipient || resource.payTo || routeOptions.recipient || options.recipient || serverEnv('NIBGATE_SELLER_ADDRESS') || '',
            network: routeOptions.network || options.network || serverEnv('NIBGATE_PAYMENT_NETWORK') || 'eip155:5042002'
          };
          const verified = await verifyTransfer({ resource, txHash, payment: transferPayment, request });
          if (!verified) return jsonResponse({ error: 'Transfer verification failed' }, { status: 402 });
          const result = await unlock(resource, { ...transferPayment, verified: true });
          if (result.ok) return jsonResponse({ ok: true, resource, payment: { ...transferPayment, verified: true }, unlockProof: result.unlockProof, expiresInSeconds: result.expiresInSeconds });
        }
      }

      return jsonResponse(createPaymentChallenge(resource, { ...options, ...routeOptions, actor: access.actor, paymentRail: rail }), { status: 402 });
    }

    const body = typeof allowedBody === 'function'
      ? allowedBody({ access, resource })
      : (allowedBody || { ok: true, resource });

    return body instanceof Response ? body : jsonResponse(body);
  }

  async function payAndUnlockResponse(request, resourceInput, routeOptions = {}) {
    const resource = normalizeResource(resourceInput);
    const origin = routeOptions.origin || options.origin || serverEnv('NIBGATE_SITE_ORIGIN') || '';
    const accessUrl = routeOptions.accessUrl || `${origin.replace(/\/$/, '')}${routeOptions.accessPath || resource.path || '/'}`;

    let payment;
    if ((routeOptions.paymentMode || options.paymentMode || serverEnv('NIBGATE_PAYMENT_MODE') || 'circle-gateway') === 'circle-gateway') {
      const gatewayResult = await payWithGateway(resource, { ...options, ...routeOptions, origin, accessUrl });
      if (!gatewayResult.ok) return jsonResponse(gatewayResult, { status: gatewayResult.status || 500 });
      payment = gatewayResult.payment;
    } else {
      return jsonResponse({
        success: false,
        error: 'Real payments are required',
        detail: 'Set NIBGATE_PAYMENT_MODE=circle-gateway for real local payment tests.'
      }, { status: 400 });
    }

    const result = await unlock(resource, payment);
    if (!result.ok) return jsonResponse({ success: false, ...result }, { status: result.status || 402 });

    const response = jsonResponse({
      success: true,
      unlockProof: result.unlockProof,
      expiresInSeconds: result.expiresInSeconds,
      payment,
      resource: result.resource
    });

    emitHubEvent('payment_completed', resource, {
      ...options,
      ...routeOptions,
      origin,
      payload: payment
    }).catch(() => {});
    emitHubEvent('unlock_completed', resource, {
      ...options,
      ...routeOptions,
      origin,
      payload: payment
    }).catch(() => {});

    return response;
  }

  return {
    unlock,
    isUnlocked,
    accessFor,
    protect,
    accessResponse,
    payAndUnlockResponse,
    manifest: (input = {}) => createManifest({ ...input, origin: input.origin || options.origin }),
    manifestResponse: (input = {}) => manifestResponse({ ...input, origin: input.origin || options.origin }),
    emitHubEvent: (event, resource, eventOptions = {}) => emitHubEvent(event, resource, { ...options, ...eventOptions }),
    getGatewayBalances: (balanceOptions = {}) => getGatewayBalances({ ...options, ...balanceOptions }),
    depositToGateway: (amount, depositOptions = {}) => depositToGateway(amount, { ...options, ...depositOptions }),
    withdrawFromGateway: (amount, withdrawOptions = {}) => withdrawFromGateway(amount, { ...options, ...withdrawOptions }),
    createPaymentChallenge: (resource, challengeOptions = {}) => createPaymentChallenge(resource, { ...options, ...challengeOptions }),
    createUnlockToken: (resource, tokenOptions = {}) => createUnlockToken(resource, { ...tokenOptions, secret }),
    verifyUnlockToken: (token, resource) => verifyUnlockToken(token, resource, { secret }),
    actorFromRequest,
    accessModeFor
  };
}

export function protect(resource, handler, options = {}) {
  return createNibgateServer(options).protect(resource, handler);
}

export function verifyPayment(options = {}) {
  return async function verifyPaymentMiddleware(req, res, next) {
    const contentId = req.params?.id || req.body?.resourceId || '';

    const proofHeader = req.headers?.['x-nibgate-payment-proof'] || '';
    if (proofHeader) {
      const nibgate = createNibgateServer(options);
      const payload = nibgate.verifyUnlockToken(proofHeader, { id: contentId });
      if (payload) {
        req.nibgate = { unlock: payload, verified: true };
        return next();
      }
    }

    if ((options.paymentMode || process.env.NIBGATE_PAYMENT_MODE) === 'circle-gateway') {
      const sigHeader = req.headers?.['payment-signature'] || '';
      if (sigHeader) {
        const resource = options.resource || { id: contentId, price: req.body?.price || '0' };
        const gatewayHeaders = Object.assign(Object.create(null), req.headers || {});
        gatewayHeaders.forEach = function (cb) {
          var self = this;
          Object.keys(self).forEach(function (k) { if (k !== 'forEach') cb(self[k], k); });
        };
        const gateway = await runCircleGatewayRequirement(
          { headers: gatewayHeaders, method: req.method || 'GET', url: req.originalUrl || req.url || '/' },
          resource,
          options
        );
        if (!gateway.handled) {
          req.nibgate = { payment: gateway.payment, verified: true };
          return next();
        }
        return res.status(402).json({ error: 'Payment verification failed', detail: 'The payment signature could not be verified.' });
      }
    }

    const errBody = createPaymentChallenge(options.resource || { id: contentId, price: req.body?.price || '0' }, options);
    return res.status(402).json(errBody);
  };
}
