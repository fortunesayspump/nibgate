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
import { x402 } from './routes/x402.js';
import { mcp } from './mcp/routes.js';
import { initQueue, queueMode } from './queue.js';
import { requeueOrphans, requeueStalledRuns } from './worker.js';

export async function createApp() {
  await initQueue();
  // This process executes stages too (inline mode), so it sweeps for anything
  // a dead worker left mid-stage before serving traffic.
  const swept = await requeueOrphans().catch((e) => {
    console.error('[dr-nib] orphan sweep failed:', e.message);
    return { reclaimed: 0, runs: [] };
  });
  if (swept.reclaimed) console.log(`[dr-nib] reclaimed ${swept.reclaimed} orphaned step(s) across ${swept.runs.length} run(s)`);
  // …and for runs stranded with no stage in flight at all (driver died between
  // stages): re-enqueue them so a restart resumes work instead of freezing it.
  const stalled = await requeueStalledRuns().catch((e) => {
    console.error('[dr-nib] stalled sweep failed:', e.message);
    return { kicked: [] };
  });
  if (stalled.kicked.length) console.log(`[dr-nib] requeued ${stalled.kicked.length} stalled run(s): ${stalled.kicked.join(', ')}`);
  const app = express();
  app.set('trust proxy', true);
  // Some x402 client libs send a doubled Content-Type on the paid retry
  // ("application/json, application/json"); body-parser then skips the body
  // entirely and handlers see {}. First value wins per RFC 7231 §3.1.1.1.
  app.use((req, _res, next) => {
    const ct = req.headers['content-type'];
    if (typeof ct === 'string' && ct.includes(',')) req.headers['content-type'] = ct.split(',')[0].trim();
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  // Same-origin by default (the frontend proxies /drnib/* here), so cookies
  // just work and CORS never comes up. Direct cross-origin calls need
  // credentials, which is why the browser client sends them.
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => res.json({ ok: true, queue: queueMode() }));

  // Kill switch (DRNIB_DISABLED): refuse run/API traffic with an explicit
  // 503, but keep /health live so the deployment reads as intentionally off
  // rather than broken. Registered before the routers so it wins.
  if (config.disabled) {
    app.use((req, res, next) => {
      if (req.path === '/health') return next();
      return res.status(503).json({ error: 'Dr. Nib is disabled on this deployment (DRNIB_DISABLED).' });
    });
  }

  app.use('/v1/runs', runs);
  app.use('/v1/budgets', budgets);
  // x402 before exports: router middleware runs on mount-prefix match, so the
  // exports router's auth would 401 these permissionless paid routes first.
  // (x402 carries no router middleware, so nothing leaks the other way.)
  app.use('/v1', x402);
  app.use('/v1', exports);
  app.use('/mcp', mcp);
  app.use((err, _req, res, _next) => res.status(500).json({ error: err?.message || 'internal' }));
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = config.port;
  createApp().then((app) => app.listen(port, () => console.log(`[dr-nib] API on :${port} (${queueMode()})`)));
}