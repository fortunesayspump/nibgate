import { articlePage, audioPage, protectedRoutePage } from '../examples/views.js';
import { viewEventPayload } from '../hub-events.js';

export function registerExampleRoutes(app, context) {
  const { gateway, webAssets, forwardHubEvent } = context;

  app.get('/demo/audio/midnight-protocol', (req, res) => {
    const route = gateway.routeByPath(req.path);
    void forwardHubEvent(viewEventPayload(route));
    return res.send(audioPage({ route, assets: webAssets }));
  });

  app.get('/demo/ghost/the-agent-economy', (req, res) => {
    const route = gateway.routeByPath(req.path);
    void forwardHubEvent(viewEventPayload(route));
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
}
