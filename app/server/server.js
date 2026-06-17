import cookieParser from 'cookie-parser';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { unlockedContent } from '../../cli/packages/core/content.js';
import { rootDir } from '../../cli/packages/core/config.js';
import { createGateway } from '../../cli/packages/core/gateway.js';
import { createCircleGatewayMiddleware, createGatewayBuyer } from '../../cli/packages/core/payments.js';
import { createStateStore } from '../../cli/packages/core/state.js';
import { articlePage, audioPage, protectedRoutePage } from './demo/views.js';
import { createAppState } from './app-state.js';
import { marketingPage } from './marketing.js';

export async function createApp(config, options = {}) {
  const app = express();
  const store = createStateStore(options.statePath || path.join(rootDir, '.nibgate', 'state.json'));
  const gateway = createGateway(config, store);
  const circleGateway = await createCircleGatewayMiddleware(gateway.paymentProvider);
  const gatewayBuyer = await createGatewayBuyer(gateway.paymentProvider);
  const appDist = resolveAppDist();
  const webAssets = resolveWebAssets(appDist);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use('/assets', express.static(path.join(appDist, 'assets')));

  function setUnlockCookie(res, routeId, token) {
    res.cookie(`nibgate_unlock_${routeId}`, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 12
    });
  }

  function resolveWebAssets(distDir) {
    if (process.env.NIBGATE_PANEL_DEV === 'true') {
      return {
        cssHref: 'http://localhost:5173/src/styles.css'
      };
    }

    try {
      const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
      const cssMatch = html.match(/href="([^"]+\.css)"/);
      return {
        cssHref: cssMatch ? cssMatch[1] : '/assets/styles.css'
      };
    } catch {
      return {
        cssHref: '/assets/styles.css'
      };
    }
  }

  function resolveAppDist() {
    const preferredDist = path.join(rootDir, 'app', 'dist');
    if (fs.existsSync(path.join(preferredDist, 'index.html'))) {
      return preferredDist;
    }

    return path.join(rootDir, 'app', 'web', 'dist');
  }

  app.get('/api/app/state', (_req, res) => {
    res.json(createAppState(config, store));
  });

  app.get('/', (_req, res) => {
    res.send(marketingPage({ cssHref: webAssets.cssHref }));
  });

  app.get('/app', (_req, res) => {
    if (process.env.NIBGATE_PANEL_DEV === 'true') {
      return res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nibgate App</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="http://localhost:5173/@vite/client"></script>
  <script type="module" src="http://localhost:5173/src/main.tsx"></script>
</body>
</html>`);
    }

    return res.sendFile(path.join(appDist, 'index.html'));
  });

  function manifestHandler(_req, res) {
    res.json(gateway.agentManifest());
  }

  app.get('/.well-known/nibgate.json', manifestHandler);

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
          detail: 'Set NIBGATE_BUYER_PRIVATE_KEY to enable the real browser demo unlock flow.'
        });
      }

      try {
        const unlockUrl = `${config.site.origin}/api/content/${route.id}/access?actor=human`;
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

        return res.json({
          ...unlockedContent(route, config, payment.id),
          unlockToken: token,
          access: {
            url: route.path,
            expiresInSeconds: 60 * 60 * 12
          }
        });
      });
    }

    if (!unlock) return res.status(402).json(gateway.createPaymentChallenge(route, 'agent'));

    return res.json(unlockedContent(route, config, unlock.paymentId));
  });

  app.get('/demo/audio/midnight-protocol', (req, res) => {
    const route = gateway.routeByPath(req.path);
    return res.send(audioPage({ route, assets: webAssets }));
  });

  app.get('/demo/ghost/the-agent-economy', (req, res) => {
    const route = gateway.routeByPath(req.path);
    return res.send(articlePage({ req, route, gateway, assets: webAssets }));
  });

  app.use((req, res) => {
    const route = gateway.routeByPath(req.path);
    if (!route) return res.status(404).json({ error: 'Not found' });

    const unlock = gateway.getUnlock(req, route.id);
    if (!unlock) {
      if (req.accepts('html')) {
        return res.status(402).send(protectedRoutePage({ route, gateway, assets: webAssets }));
      }

      return res.status(402).json(gateway.createPaymentChallenge(route));
    }

    if (route.originUrl) {
      fetch(route.originUrl)
        .then(async (originRes) => {
          const contentType = originRes.headers.get('content-type') || 'text/html; charset=utf-8';
          res.status(originRes.status).type(contentType).send(await originRes.text());
        })
        .catch((error) => {
          res.status(502).json({
            error: 'Origin fetch failed',
            route: route.id,
            originUrl: route.originUrl,
            detail: error.message
          });
        });
      return;
    }

    return res.json({
      ok: true,
      proxied: true,
      route: route.id,
      message: 'Nibgate would stream the protected origin response here.'
    });
  });

  return app;
}
