import { buildSiteManifest, buildVerificationFile } from 'nibgate/src/core/hub.js';
import { explorePage } from '../../../../frontend/src/explore/page.js';

const EXPLORE_ROUTE_PATHS = ['/', '/explore', '/explore/products', '/explore/categories', '/explore/wishlists', '/explore/creators'];

export function registerAppRoutes(app, context) {
  const { webAssets, getConfig } = context;

  app.get(EXPLORE_ROUTE_PATHS, (req, res) => {
    // If the path is exactly '/' or '/explore', it maps to the explore root '/'
    const explorePath = req.path === '/' ? '/' : (req.path.replace(/^\/explore/, '') || '/');
    res.send(explorePage({
      cssHref: webAssets.cssHref,
      siteOrigin: '',
      path: explorePath,
      basePath: req.path.startsWith('/explore') ? '/explore' : ''
    }));
  });

  app.get('/.well-known/nibgate.json', (_req, res) => {
    res.json(buildSiteManifest(getConfig()));
  });

  app.get('/.well-known/nibgate-verify.txt', (_req, res) => {
    res.type('text/plain').send(buildVerificationFile(getConfig()));
  });

  app.get('/api/nibgate/status', (_req, res) => {
    const config = getConfig();
    res.json({
      site: {
        name: config.site.name,
        origin: config.site.origin
      },
      hub: config.hub,
      manifestUrl: `${config.site.origin}/.well-known/nibgate.json`,
      verificationUrl: `${config.site.origin}/.well-known/nibgate-verify.txt`
    });
  });
}
