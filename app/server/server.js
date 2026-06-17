import cookieParser from 'cookie-parser';
import express from 'express';
import path from 'node:path';
import { rootDir } from '../../cli/packages/core/config.js';
import { createGateway } from '../../cli/packages/core/gateway.js';
import { createCircleGatewayMiddleware, createGatewayBuyer } from '../../cli/packages/core/payments.js';
import { createStateStore } from '../../cli/packages/core/state.js';
import { createHubEventForwarder } from './hub-events.js';
import { registerAppRoutes } from './routes/app-routes.js';
import { registerContentRoutes } from './routes/content-routes.js';
import { registerDemoRoutes } from './routes/demo-routes.js';
import { registerHubRoutes } from './routes/hub-routes.js';
import { createConfigResolver, resolveAppDist, resolveWebAssets } from './runtime.js';

export async function createApp(config, options = {}) {
  const app = express();
  const store = createStateStore(options.statePath || path.join(rootDir, '.nibgate', 'state.json'));
  const gateway = createGateway(config, store);
  const circleGateway = await createCircleGatewayMiddleware(gateway.paymentProvider);
  const gatewayBuyer = await createGatewayBuyer(gateway.paymentProvider);
  const appDist = resolveAppDist();
  const webAssets = resolveWebAssets(appDist);
  const getConfig = createConfigResolver(config, options.loadLiveConfig);
  const forwardHubEvent = createHubEventForwarder(getConfig);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use('/assets', express.static(path.join(appDist, 'assets')));

  const context = {
    store,
    gateway,
    circleGateway,
    gatewayBuyer,
    appDist,
    webAssets,
    getConfig,
    forwardHubEvent
  };

  registerHubRoutes(app);
  registerAppRoutes(app, context);
  registerContentRoutes(app, context);
  registerDemoRoutes(app, context);

  return app;
}
