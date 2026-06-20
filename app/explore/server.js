import express from 'express';
import path from 'node:path';
import { explorePage } from './page.js';
import { resolveAppDist, resolveWebAssets } from '../server/runtime.js';

const EXPLORE_ROUTES = ['/', '/products', '/categories', '/wishlists', '/creators'];

export function createExploreServer() {
  const app = express();
  const appDist = resolveAppDist();
  const webAssets = resolveWebAssets(appDist);
  const marketingOrigin = process.env.MARKETING_ORIGIN || 'http://localhost:3000';

  app.use('/assets', express.static(path.join(appDist, 'assets')));

  app.get(EXPLORE_ROUTES, (req, res) => {
    res.send(explorePage({ cssHref: webAssets.cssHref, marketingOrigin, path: req.path }));
  });

  app.use((_req, res) => {
    res.status(404).send('Not found');
  });

  return app;
}
