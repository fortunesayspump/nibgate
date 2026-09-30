import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const p of [path.join(root, '.env'), path.join(root, '..', '..', '.env')]) {
  if (fs.existsSync(p)) dotenv.config({ path: p });
}

import { runs } from './routes/runs.js';
import { budgets } from './routes/budgets.js';
import { exports } from './routes/exports.js';
import { initQueue, queueMode } from './queue.js';

export async function createApp() {
  await initQueue();
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  const origins = (process.env.CORS_ORIGIN || 'http://localhost:3001').split(',').map((s) => s.trim());
  app.use(cors({ origin: origins }));
  app.get('/health', (_req, res) => res.json({ ok: true, queue: queueMode() }));
  app.use('/v1/runs', runs);
  app.use('/v1/budgets', budgets);
  app.use('/v1', exports);
  app.use((err, _req, res, _next) => res.status(500).json({ error: err?.message || 'internal' }));
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3100);
  createApp().then((app) => app.listen(port, () => console.log(`[dr-nib] API on :${port} (${queueMode()})`)));
}
