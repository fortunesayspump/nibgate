import { buildSiteManifest, buildVerificationFile } from '../../../packages/cli/src/core/hub.js';
import { createAppState } from '../app-state.js';
import { marketingPage, marketingRoutePage } from '../marketing.js';

export function registerAppRoutes(app, context) {
  const { store, webAssets, getConfig } = context;

  app.get('/api/app/state', (_req, res) => {
    res.json(createAppState(getConfig(), store));
  });

  app.get('/', (_req, res) => {
    res.send(marketingPage({ cssHref: webAssets.cssHref }));
  });

  app.get('/about', (_req, res) => {
    res.send(marketingPage({ cssHref: webAssets.cssHref, activePath: '/about' }));
  });

  app.get(['/blog', '/features', '/get-started'], (req, res) => {
    const page = marketingRoutePage({ cssHref: webAssets.cssHref, path: req.path });
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
