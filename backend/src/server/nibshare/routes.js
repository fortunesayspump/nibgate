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
  app.delete('/api/nibshare/:slug', controller.requireAuth, controller.revokeShare);
  app.post('/api/nibshare/:slug/reslug', controller.requireAuth, controller.rotateShare);
  app.get('/api/nibshare/mine', controller.requireAuth, controller.listMine);
  app.get('/api/nibshare/dashboard', controller.requireAuth, controller.dashboardStats);
  app.get('/api/nibshare/stats', controller.platformStats);
}
