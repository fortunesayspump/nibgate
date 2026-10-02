// Loads configuration before anything constructs a Prisma client. Import this
// FIRST in every entrypoint (server.js, worker.js): ESM evaluates imports in
// declaration order, so a dotenv call living in the importer's body runs too
// late to help the modules it imports.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// Under vitest the harness owns the environment (test/setup.js): loading the
// developer's local .env here would re-introduce real keys and endpoints that
// tests deliberately removed, making hermetic tests secretly live. So in test
// workers, read the environment as given and validate it — nothing more.
if (!process.env.VITEST) {
  for (const p of [path.join(root, '.env'), path.join(root, '..', '..', '.env')]) {
    if (fs.existsSync(p)) dotenv.config({ path: p });
  }
}

// Two databases, deliberately, and they must not be confused.
//   • the hub's  — Dr. Nib has no accounts of its own. It reads the hub's SIWE
//     session and validates it against the hub's Session/User tables.
//   • ours     — research runs, evidence, ledger, in our own schema.
// @nibgate/internal builds its Prisma client with no explicit datasource, so it
// reads DATABASE_URL. That has to be the hub.
const hubDatabaseUrl = process.env.HUB_DATABASE_URL || process.env.DATABASE_URL;
if (!hubDatabaseUrl) {
  throw new Error('HUB_DATABASE_URL (or DATABASE_URL) is required — Dr. Nib authenticates against the hub database.');
}
process.env.DATABASE_URL = hubDatabaseUrl;

if (!process.env.DRNIB_DATABASE_URL) {
  throw new Error('DRNIB_DATABASE_URL is required — point it at this service\'s own schema, e.g. ?schema=drnib');
}

export const config = {
  root,
  port: Number(process.env.PORT || 3100),
  hubDatabaseUrl,
  drnibDatabaseUrl: process.env.DRNIB_DATABASE_URL,
  hubApiUrl: (process.env.HUB_API_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:3001').split(',').map((s) => s.trim()),
  redisUrl: process.env.REDIS_URL || null,
};