import path from 'node:path';
import { buildSiteManifest, buildVerificationFile } from '../../../cli/packages/core/hub.js';
import { createAppState } from '../app-state.js';
import { marketingPage } from '../marketing.js';

export function registerAppRoutes(app, context) {
  const { store, appDist, webAssets, getConfig } = context;

  app.get('/api/app/state', (_req, res) => {
    res.json(createAppState(getConfig(), store));
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
