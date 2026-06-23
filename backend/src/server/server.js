import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { rootDir } from 'nibgate/src/core/config.js';
import { createGateway } from 'nibgate/src/core/gateway.js';
import { createCircleGatewayMiddleware, createGatewayBuyer } from 'nibgate/src/core/payments.js';
import { createStateStore } from 'nibgate/src/core/state.js';
import { createHubEventForwarder } from './hub-events.js';
import { registerAppRoutes } from './routes/app-routes.js';
import { registerAuthRoutes } from './routes/auth-routes.js';
import { registerContentRoutes } from './routes/content-routes.js';
import { registerHubRoutes } from './routes/hub-routes.js';
import { createConfigResolver } from './runtime.js';

export async function createApp(config, options = {}) {
  const app = express();
  const store = createStateStore(options.statePath || path.join(rootDir, '.nibgate', 'state.json'));
  const gateway = createGateway(config, store);
  const circleGateway = await createCircleGatewayMiddleware(gateway.paymentProvider);
  const gatewayBuyer = await createGatewayBuyer(gateway.paymentProvider);
  const getConfig = createConfigResolver(config, options.loadLiveConfig);
  const forwardHubEvent = createHubEventForwarder(getConfig);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(cors({
    origin: function (origin, callback) {
      const allowedOrigins = process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',')
        : ['https://nibgate.xyz', /\.vercel\.app$/];
      if (!origin || allowedOrigins.some(o => typeof o === 'string' ? o === origin : o.test(origin))) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }));


  const context = {
    store,
    gateway,
    circleGateway,
    gatewayBuyer,
    getConfig,
    forwardHubEvent
  };

  registerHubRoutes(app);
  registerAppRoutes(app, context);
  registerAuthRoutes(app);
  registerContentRoutes(app, context);

  return app;
}
