import { unlockedContent } from 'nibgate/src/core/content.js';
import { unlockEventPayloads } from '../hub-events.js';

function setUnlockCookie(res, routeId, token) {
  res.cookie(`nibgate_unlock_${routeId}`, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 12
  });
}

function emitUnlockEvents(forwardHubEvent, route, payment, actor, amount, extra = {}) {
  for (const event of unlockEventPayloads(route, payment, actor, amount, extra)) {
    void forwardHubEvent(event);
  }
}

export function registerContentRoutes(app, context) {
  const { gateway, circleGateway, gatewayBuyer, forwardHubEvent, getConfig } = context;

  app.get('/api/content/:id/price', (req, res) => {
    const route = gateway.routeById(req.params.id);
    if (!route) return res.status(404).json({ error: 'Unknown content id' });
    return res.status(402).json(gateway.createPaymentChallenge(route, req.query.mode === 'agent' ? 'agent' : 'human'));
  });

  app.post('/api/content/:id/unlock', async (req, res) => {
    const route = gateway.routeById(req.params.id);
    if (!route) return res.status(404).json({ error: 'Unknown content id' });

    if (gateway.paymentProvider.isLive) {
      if (!gatewayBuyer) {
        return res.status(503).json({
          error: 'Live buyer is not configured',
          detail: 'Set NIBGATE_BUYER_PRIVATE_KEY to enable the real browser unlock flow.'
        });
      }

      try {
        const unlockUrl = `${getConfig().site.origin}/api/content/${route.id}/access?actor=human`;
        const paymentResult = await gatewayBuyer.pay(unlockUrl);
        const unlockToken = paymentResult?.data?.unlockToken;

        if (!unlockToken) {
          return res.status(502).json({
            error: 'Gateway payment completed but no unlock token was returned',
            route: route.id
          });
        }

        if (req.accepts('html')) {
          setUnlockCookie(res, route.id, unlockToken);
          return res.redirect(route.path);
        }

        return res.json({
          ok: true,
          unlockToken,
          payment: paymentResult,
          access: {
            url: route.path,
            expiresInSeconds: 60 * 60 * 12
          }
        });
      } catch (error) {
        return res.status(502).json({
          error: 'Gateway payment failed',
          detail: error.message
        });
      }
    }

    const { token, payment } = gateway.recordPayment(route, 'human', route.price, {
      provider: gateway.paymentProvider.mode
    });
    emitUnlockEvents(forwardHubEvent, route, payment, 'human', route.price);

    if (req.accepts('html')) {
      setUnlockCookie(res, route.id, token);
      return res.redirect(route.path);
    }

    return res.json({
      ok: true,
      payment,
      unlockToken: token,
      access: {
        url: route.path,
        expiresInSeconds: 60 * 60 * 12
      }
    });
  });

  app.get('/api/content/:id/access', (req, res) => {
    const route = gateway.routeById(req.params.id);
    if (!route) return res.status(404).json({ error: 'Unknown content id' });

    const unlock = gateway.getUnlock(req, route.id);
    if (!unlock && circleGateway) {
      const actor = req.query.actor === 'human' ? 'human' : 'agent';
      const requirePayment = circleGateway.require(gateway.paymentProvider.priceFor(route, actor));
      return requirePayment(req, res, () => {
        const amount = actor === 'agent' && route.agentPrice ? route.agentPrice : route.price;
        const { token, payment } = gateway.recordPayment(route, actor, amount, {
          provider: gateway.paymentProvider.mode,
          transaction: req.payment?.transaction,
          payer: req.payment?.payer,
          network: req.payment?.network
        });

        if (actor === 'human') {
          setUnlockCookie(res, route.id, token);
        }

        emitUnlockEvents(forwardHubEvent, route, payment, actor, amount, {
          transaction: req.payment?.transaction || ''
        });

        return res.json({
          ...unlockedContent(route, getConfig(), payment.id),
          unlockToken: token,
          access: {
            url: route.path,
            expiresInSeconds: 60 * 60 * 12
          }
        });
      });
    }

    if (!unlock) return res.status(402).json(gateway.createPaymentChallenge(route, 'agent'));

    return res.json(unlockedContent(route, getConfig(), unlock.paymentId));
  });
}
