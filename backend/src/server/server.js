import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { rootDir } from '@nibgate/internal/config.js';
import { createGateway } from '@nibgate/internal/gateway.js';
import { createCircleGatewayMiddleware, createGatewayBuyer } from '@nibgate/internal/payments.js';
import { createStateStore } from '@nibgate/internal/state.js';
import { createHubEventForwarder } from './hub-events.js';
import { registerAppRoutes } from './routes/app-routes.js';
import { registerAuthRoutes } from './routes/auth-routes.js';
import { registerBlogRoutes } from './routes/blog-routes.js';
import { registerContentRoutes } from './routes/content-routes.js';
import { registerHubRoutes } from './routes/hub-routes.js';
import { registerNewsletterRoutes } from './routes/newsletter-routes.js';
import { registerNibshareRoutes } from './routes/nibshare-routes.js';
import { registerUploadRoutes } from './routes/upload-routes.js';
import { registerRpcRoute } from './routes/rpc-route.js';
import { openApiSpec } from './openapi.js';
import { registerMcpRoute } from './mcp.js';
import { createConfigResolver } from './runtime.js';
import { registerProvider } from '@nibgate/sdk/server';
import { createNibgateProvider } from './lib/nibgate-provider.js';

function registerNibgateProvider() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) return;
  registerProvider('nibgate', createNibgateProvider, {
    endpoint, accessKeyId, secretAccessKey, bucket, publicUrl: publicUrl.replace(/\/+$/, '')
  });
}

export async function createApp(config, options = {}) {
  registerNibgateProvider();
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
    if (req.path === '/api/rpc' || req.path === '/api/hub/pay' || req.path === '/api/hub/evt' || req.path === '/api/hub/track' || req.path === '/api/hub/reputation/ratings/prepare' || req.path === '/api/hub/reputation/ratings/index' || req.path === '/api/nibshare' || /^\/api\/nibshare\/[^/]+\/unlock$/.test(req.path)) {
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
            /^http:\/\/localhost:\d+$/,
            /^http:\/\/127\.0\.0\.1:\d+$/,
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
  registerNibshareRoutes(app);
  registerNewsletterRoutes(app);
  registerBlogRoutes(app);
  registerUploadRoutes(app);
  registerAppRoutes(app, context);
  registerAuthRoutes(app);
  registerContentRoutes(app, context);
  registerRpcRoute(app);
  registerMcpRoute(app);

  // Machine-readable API contract for AI agents and tooling.
  app.get('/api/openapi.json', (_req, res) => {
    res.type('application/json').json(openApiSpec);
  });

  return app;
}
