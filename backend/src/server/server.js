import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { rootDir } from '@nibgate/cli/src/core/config.js';
import { createGateway } from '@nibgate/cli/src/core/gateway.js';
import { createCircleGatewayMiddleware, createGatewayBuyer } from '@nibgate/cli/src/core/payments.js';
import { createStateStore } from '@nibgate/cli/src/core/state.js';
import { createHubEventForwarder } from './hub-events.js';
import { registerAppRoutes } from './routes/app-routes.js';
import { registerAuthRoutes } from './routes/auth-routes.js';
import { registerBlogRoutes } from './routes/blog-routes.js';
import { registerContentRoutes } from './routes/content-routes.js';
import { registerHubRoutes } from './routes/hub-routes.js';
import { registerNewsletterRoutes } from './routes/newsletter-routes.js';
import { registerUploadRoutes } from './routes/upload-routes.js';
import { createConfigResolver } from './runtime.js';

export async function createApp(config, options = {}) {
  const app = express();
  app.set('trust proxy', true);
  const store = createStateStore(options.statePath || path.join(rootDir, '.nibgate', 'state.json'));
  const gateway = createGateway(config, store);
  const circleGateway = await createCircleGatewayMiddleware(gateway.paymentProvider);
  const gatewayBuyer = await createGatewayBuyer(gateway.paymentProvider);
  const getConfig = createConfigResolver(config, options.loadLiveConfig);
  const forwardHubEvent = createHubEventForwarder(getConfig);

  app.use(express.json({ limit: '8mb' }));
  app.use(express.urlencoded({ extended: true, limit: '8mb' }));
  app.use(cookieParser());
  app.use(cors((req, callback) => {
    if (req.path === '/api/hub/track' || req.path === '/api/hub/reputation/ratings/prepare' || req.path === '/api/hub/reputation/ratings/index') {
      return callback(null, {
        origin: true,
        credentials: true,
        methods: ['POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type']
      });
    }

    callback(null, {
      origin: function (origin, originCallback) {
      const allowedOrigins = process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',')
        : [
            'https://nibgate.xyz',
            'http://localhost:3000',
            'http://localhost:3001',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:3001',
            /\.vercel\.app$/
          ];
      if (!origin || allowedOrigins.some(o => typeof o === 'string' ? o === origin : o.test(origin))) {
        originCallback(null, true);
      } else {
        originCallback(new Error('Not allowed by CORS'));
      }
    },
      credentials: true,
    });
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
  registerNewsletterRoutes(app);
  registerBlogRoutes(app);
  registerUploadRoutes(app);
  registerAppRoutes(app, context);
  registerAuthRoutes(app);
  registerContentRoutes(app, context);

  return app;
}
