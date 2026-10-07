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

const hubApiUrl = (process.env.HUB_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

// Network, stated rather than inferred, with a safe inference as fallback: a
// testnet hub URL is unambiguous, so we honour it; anything else is treated as
// mainnet. `DRNIB_NETWORK` overrides when the deployment wants to be explicit.
const network = (() => {
  const explicit = String(process.env.DRNIB_NETWORK || '').toLowerCase();
  if (explicit === 'mainnet' || explicit === 'testnet') return explicit;
  return /testnet/i.test(hubApiUrl) ? 'testnet' : 'mainnet';
})();

// Defense in depth for the product decision that Dr. Nib is mainnet-only.
// The frontend gate hides the app on testnet; this stops a testnet-pointed
// backend from serving runs at all if the operator asks for mainnet-only. It
// fails loudly at boot rather than silently serving the wrong network.
const mainnetOnly = /^(1|true|yes)$/i.test(String(process.env.DRNIB_MAINNET_ONLY || ''));
if (mainnetOnly && network !== 'mainnet') {
  throw new Error(`DRNIB_MAINNET_ONLY is set but this service is configured for ${network} (HUB_API_URL=${hubApiUrl}). Point it at the mainnet hub or unset the flag.`);
}

// Operational kill switch, per deployment: DRNIB_DISABLED=1 makes this
// service answer 503 on every run route (health stays up) without a code
// change. Flip it on the Railway service and restart to pull the backend off
// a stack independently of the frontend flag.
const disabled = /^(1|true|yes)$/i.test(String(process.env.DRNIB_DISABLED || ''));
if (disabled) console.warn('[dr-nib] DRNIB_DISABLED is set — run routes will answer 503 (health stays up).');

export const config = {
  root,
  port: Number(process.env.PORT || 3100),
  hubDatabaseUrl,
  drnibDatabaseUrl: process.env.DRNIB_DATABASE_URL,
  hubApiUrl,
  network,
  mainnetOnly,
  disabled,
  // Per-user ceiling on simultaneously live runs. Each run holds a funded cap
  // and spends provider money; without a cap, many concurrent runs are a
  // denial-of-wallet on the operator. Raise deliberately, not accidentally.
  maxActiveRuns: (() => {
    const n = Number(process.env.DRNIB_MAX_ACTIVE_RUNS);
    return Number.isInteger(n) && n > 0 ? n : 3;
  })(),
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:3001').split(',').map((s) => s.trim()),
  redisUrl: process.env.REDIS_URL || null,
};