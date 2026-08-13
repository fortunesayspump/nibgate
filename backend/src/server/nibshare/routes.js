import * as controller from './controller.js';

export function registerNibshareRoutes(app) {
  app.post('/api/nibshare', controller.requireAuth, controller.createShare);
  app.get('/api/nibshare/:slug/meta', controller.getShareMeta);
  app.get('/api/nibshare/:slug/manifest', controller.getShareManifest);
  app.post('/api/nibshare/:slug/view', controller.recordView);
  app.post('/api/nibshare/:slug/unlock', controller.unlockShare);
  app.get('/api/nibshare/:slug/access', controller.accessShare);
  app.get('/api/nibshare/:slug/media/:kind', controller.getShareMedia);
  app.post('/api/nibshare/gateway/balance', controller.gatewayBalance);
  app.post('/api/nibshare/:slug/entitlements/:wallet/revoke', controller.requireAuth, controller.revokeEntitlement);
  app.post('/api/nibshare/:slug/entitlements/:wallet/ban', controller.requireAuth, controller.banEntitlement);
  app.delete('/api/nibshare/:slug/entitlements/:wallet', controller.requireAuth, controller.restoreEntitlement);
  app.put('/api/nibshare/:slug/access-control', controller.requireAuth, controller.updateAccessPolicy);
  app.get('/api/nibshare/:slug/access-control', controller.requireAuth, controller.getAccessControl);
  app.get('/api/nibshare/:slug/quote', controller.quoteShare);
  app.delete('/api/nibshare/:slug', controller.requireAuth, controller.revokeShare);
  app.post('/api/nibshare/:slug/reslug', controller.requireAuth, controller.rotateShare);
  app.get('/api/nibshare/mine', controller.requireAuth, controller.listMine);
  app.get('/api/nibshare/dashboard', controller.requireAuth, controller.dashboardStats);
  app.get('/api/nibshare/stats', controller.platformStats);

  // Short mirror of the share page path on the API host: GET /ns/:slug reads
  // straight through (free → body, paid → 402 x402 challenge).
  app.get('/ns/:slug', (req, res, next) => {
    const apiBase = (process.env.NIBGATE_PUBLIC_API_URL || process.env.PUBLIC_API_URL || 'https://api.nibgate.xyz').replace(/\/+$/, '');
    res.set('Link', `<${apiBase}/nibshare/${req.params.slug}/manifest>; rel="alternate"; type="application/json"`);
    next();
  }, controller.accessShare);
}
