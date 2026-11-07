// Synthetic fixtures only; the connection must be the named local disposable database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ledgerTotals } from '../backend/src/server/hub/ledger-totals.js';
const uri = process.env.NIBGATE_LEDGER_TEST_URL || '';
test('private shares contribute to totals without being returned', { skip: !uri }, async t => {
  const u = new URL(uri);
  assert.equal(u.hostname, '127.0.0.1'); assert.equal(u.port, '56343');
  assert.equal(u.pathname, '/nibgate_ledger_disposable'); assert.equal(u.searchParams.get('schema'), 'hub');
  const require = createRequire(import.meta.url);
  const { PrismaClient } = require('../packages/cli/generated/client/index.js');
  const db = new PrismaClient({ datasources: { db: { url: uri } } });
  t.after(() => db.$disconnect());
  await db.nibShare.createMany({ data: [
    { id: 'fixture-public', slug: 'fixture-public', title: 'PUBLIC_FIXTURE', ownerWallet: 'fixture', whitelist: [], publicAccess: true, contentHash: 'fixture' },
    { id: 'fixture-private', slug: 'fixture-private', title: 'PRIVATE_FIXTURE', ownerWallet: 'fixture', whitelist: [], publicAccess: false, contentHash: 'fixture' },
  ] });
  await db.nibShareEvent.createMany({ data: [
    { shareId: 'fixture-public', type: 'view' }, { shareId: 'fixture-private', type: 'view' },
  ] });
  await db.nibShareReceipt.create({ data: { shareId: 'fixture-private', payerWallet: 'fixture', amount: 2 } });
  const totals = await ledgerTotals(db);
  assert.equal(totals.nibshareViews, 2); assert.equal(totals.nibshareUnlocks, 1);
  assert.equal(totals.nibshareRevenue, 2); assert.equal(totals.total, 3);
  assert.doesNotMatch(JSON.stringify(totals), /PRIVATE_FIXTURE|fixture-private|fixture/);
});
