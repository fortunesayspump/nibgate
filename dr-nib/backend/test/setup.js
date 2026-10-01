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