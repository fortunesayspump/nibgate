import { buildSiteManifest, buildVerificationFile } from '../../../packages/cli/src/core/hub.js';
import { explorePage } from '../../explore/page.js';
import { createAppState } from '../app-state.js';
import { sitePage, siteRoutePage } from '../site.js';

const EXPLORE_ROUTE_PATHS = ['/explore', '/explore/products', '/explore/categories', '/explore/wishlists', '/explore/creators'];

export function registerAppRoutes(app, context) {
  const { store, webAssets, getConfig } = context;

  app.get('/api/app/state', (_req, res) => {
    res.json(createAppState(getConfig(), store));
  });

  app.get('/', (_req, res) => {
    res.send(sitePage({ cssHref: webAssets.cssHref }));
  });

  app.get('/about', (_req, res) => {
    res.send(sitePage({ cssHref: webAssets.cssHref, activePath: '/about' }));
  });

  app.get(EXPLORE_ROUTE_PATHS, (req, res) => {
    const explorePath = req.path.replace(/^\/explore/, '') || '/';
    res.send(explorePage({
      cssHref: webAssets.cssHref,
      siteOrigin: '',
      path: explorePath,
      basePath: '/explore'
    }));
  });

  app.get(['/blog', '/features', '/get-started', '/signin'], (req, res) => {
    const page = siteRoutePage({ cssHref: webAssets.cssHref, path: req.path });
    if (!page) return res.status(404).send('Not found');
    return res.send(page);
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
