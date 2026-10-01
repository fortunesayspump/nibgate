// FIRST import, always: env.js has to populate process.env before routes pull in
// db.js and construct a Prisma client. ESM evaluates imports in order.
import './env.js';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { config } from './env.js';
import { runs } from './routes/runs.js';
import { budgets } from './routes/budgets.js';
import { exports } from './routes/exports.js';
import { initQueue, queueMode } from './queue.js';

export async function createApp() {
  await initQueue();
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '1mb' }));
  // Same-origin by default (the frontend proxies /drnib/* here), so cookies
  // just work and CORS never comes up. Direct cross-origin calls need
  // credentials, which is why the browser client sends them.
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => res.json({ ok: true, queue: queueMode() }));

  app.use('/v1/runs', runs);
  app.use('/v1/budgets', budgets);
  app.use('/v1', exports);
  app.use((err, _req, res, _next) => res.status(500).json({ error: err?.message || 'internal' }));
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = config.port;
  createApp().then((app) => app.listen(port, () => console.log(`[dr-nib] API on :${port} (${queueMode()})`)));
}