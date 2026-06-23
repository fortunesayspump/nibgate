import { buildSiteManifest, buildVerificationFile } from 'nibgate/src/core/hub.js';

import { createAppState } from '../app-state.js';

export function registerAppRoutes(app, context) {
  const { store, getConfig } = context;

  app.get('/api/app/state', (_req, res) => {
    res.json(createAppState(getConfig(), store));
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
