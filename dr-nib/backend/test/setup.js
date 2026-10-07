// Loads the test database and refuses to go near anything else.
//
// Dr. Nib's research tables live in a real Postgres schema, so the tests need a
// real Postgres. The only thing standing between a test run and someone's
// development data is this check: the schema name has to say _test, or we
// refuse to start.
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

const root = path.resolve(import.meta.dirname, '..');
const file = path.join(root, '.env.test');

if (!fs.existsSync(file)) {
  throw new Error(`Missing ${file}. Copy test/env.example to .env.test and point it at a throwaway schema.`);
}

dotenv.config({ path: file });

const url = process.env.DRNIB_DATABASE_URL || '';
if (!/[?&]schema=drnib_test\b/.test(url)) {
  throw new Error(`Refusing to run against ${url || '(nothing)'}. DRNIB_DATABASE_URL must name a schema ending in _test.`);
}

// Hermetic models: tests must never spend real money or depend on live
// services. Point the JEV client at a dead port (every decision falls back,
// deterministically) and drop any model or money key the shell happens to
// carry, so a developer's local .env can never make the suite non-deterministic.
// Test files stub exactly the keys their subject needs.
//
// Known hole this does NOT cover: the Prisma client loads the repo .env into
// process.env at import time (after this file runs), re-introducing real keys
// that unstubAllEnvs cannot remove (it only restores stubbed vars). Tests
// asserting "off without key" must therefore delete the real vars at the
// assertion site and restore after — see spend policy + sandbox tests.
process.env.HUB_API_URL = 'http://127.0.0.1:9';
delete process.env.OPENROUTER_API_KEY;
delete process.env.DRNIB_AGENT_PRIVATE_KEY;
delete process.env.SANDBOX_URL;
delete process.env.SANDBOX_API_KEY;
delete process.env.SANDBOX_TOKEN;