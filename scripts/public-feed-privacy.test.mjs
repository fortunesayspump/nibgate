import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPublicLedger, getPublicStats, publicContentWhere, publicSiteWhere, publicTipWhere, sanitizePublicContent } from '../backend/src/server/hub/public-feeds.js';

// Test fixtures only; no runtime/demo records are created or published.
const content = { id: 'public-content', websiteId: 'public-site', title: 'Public article', url: 'https://creator.example/post', website: { domain: 'creator.example' } };
function fixtureDb() {
  const calls = [];
  const rows = {
    content: [content], metric: [], unlockReceipt: [], contentRating: [], tip: [],
  };
  const db = {};
  for (const model of ['content', 'metric', 'unlockReceipt', 'contentRating', 'tip', 'user', 'website']) {
    db[model] = {
      async findMany(args) { calls.push({ model, method: 'findMany', args }); return rows[model] || []; },
      async count(args) { calls.push({ model, method: 'count', args }); return (rows[model] || []).length; },
    };
  }
  for (const model of ['nibShare', 'nibShareEvent', 'nibShareReceipt']) {
    Object.defineProperty(db, model, { get() { throw Error('Private share data must never be read'); } });
  }
  return { db, calls, rows };
}

test('public predicates retain verification/deletion gates with exact domain filtering', () => {
  assert.deepEqual(publicSiteWhere('creator.example'), { deletedAt: null, isVerified: true, verificationStatus: 'verified', domain: 'creator.example' });
  const scope = publicContentWhere('creator.example');
  assert.equal(scope.deletedAt, null);
  assert.deepEqual(scope.website, publicSiteWhere('creator.example'));
  assert.ok(scope.NOT.OR.some(item => item.url?.contains === '/ns/'));
  assert.ok(scope.NOT.OR.some(item => item.url?.contains === '/nibshare/'));
  assert.ok(scope.NOT.OR.some(item => item.url?.contains === '/share/'));
  const tip = publicTipWhere(['public-content', 'public-content']);
  assert.deepEqual(tip.contentId.in, ['public-content']);
  assert.deepEqual(tip.OR, [{ domain: null }, { domain: { not: 'nibshare', mode: 'insensitive' } }]);
});

test('public content output is allowlisted, not opaque access/identity metadata', () => {
  const result = sanitizePublicContent({ title: 'Visible', views: 2, accessPolicy: '{"password":"secret"}', unlockPolicy: 'secret', publisherWallet: 'private-wallet', recipientWallet: 'wallet', privateFieldAddedLater: 'secret' });
  assert.deepEqual(result, { title: 'Visible', views: 2 });
});

test('ledger never reads private shares or exposes browsing identifiers/referrers', async () => {
  const { db, rows, calls } = fixtureDb();
  rows.metric = [{ id: 'view-1', createdAt: new Date(), content, visitorId: 'private-visitor', sessionId: 'private-session', referrer: 'private-referrer', actor: 'private-actor' }];
  const result = await getPublicLedger(db, { domain: 'creator.example', type: 'views' });
  assert.equal(result.activities.length, 1);
  assert.equal(result.activities[0].contentTitle, 'Public article');
  assert.doesNotMatch(JSON.stringify(result), /private-|nibshare/i);
  for (const call of calls.filter(call => ['metric', 'unlockReceipt', 'contentRating'].includes(call.model))) {
    assert.deepEqual(call.args.where.website, publicSiteWhere('creator.example'));
    assert.deepEqual(call.args.where.content, publicContentWhere('creator.example'));
  }
  const query = calls.find(call => call.model === 'metric' && call.method === 'findMany');
  assert.equal(query.args.select.visitorId, undefined);
  assert.equal(query.args.select.referrer, undefined);
});

test('unlock feed and total use verified receipts, never raw unlock events', async () => {
  const { db, rows, calls } = fixtureDb();
  rows.unlockReceipt = [{ id: 'receipt-1', createdAt: new Date(), content, amount: 2, payerWallet: 'public-payer', paymentId: 'internal-id', metadata: 'PRIVATE' }];
  const result = await getPublicLedger(db, { type: 'unlocks' });
  assert.equal(result.activities[0].type, 'unlock');
  assert.equal(result.activities[0].amount, 2);
  assert.equal(result.activities[0].metadata, undefined);
  assert.equal(result.activities[0].paymentId, undefined);
  assert.equal(result.totals.unlocks, result.totals.payments);
  assert.ok(!calls.some(call => call.model === 'metric' && call.method === 'findMany'));
  for (const call of calls.filter(call => call.model === 'unlockReceipt')) {
    assert.equal(call.args.where.status, 'verified');
    assert.deepEqual(call.args.where.paymentProvider.in, ['circle-gateway', 'direct-transfer']);
    assert.deepEqual(call.args.where.paymentId, { not: '' });
  }
});

test('tip query permits only public indexed IDs, uses canonical metadata and rejects unmatched rows', async () => {
  const { db, rows, calls } = fixtureDb();
  rows.tip = [
    { id: 'tip-1', contentId: content.id, createdAt: new Date(), amount: 1, status: 'settled', title: 'PRIVATE raw tip title', contentUrl: '/ns/private-slug' },
    { id: 'private-tip', contentId: 'not-allowed', createdAt: new Date(), amount: 10, status: 'settled' },
  ];
  const result = await getPublicLedger(db, { type: 'tips' });
  assert.equal(result.activities.length, 1);
  assert.equal(result.activities[0].contentTitle, content.title);
  assert.equal(result.activities[0].contentUrl, content.url);
  for (const call of calls.filter(call => call.model === 'tip')) {
    assert.deepEqual(call.args.where.contentId.in, [content.id]);
    assert.deepEqual(call.args.where.OR, [{ domain: null }, { domain: { not: 'nibshare', mode: 'insensitive' } }]);
    assert.ok(call.args.where.NOT.OR.some(item => item.contentUrl?.contains === '/ns/'));
  }
});

test('combined feed emits each receipt once and applies pagination after merging', async () => {
  const { db, rows, calls } = fixtureDb();
  rows.metric = [{ id: 'view', content, createdAt: new Date('2026-01-01') }];
  rows.unlockReceipt = [{ id: 'payment', content, createdAt: new Date('2026-01-03'), amount: 1 }];
  rows.contentRating = [{ id: 'rating', content, createdAt: new Date('2026-01-02'), ratingValue: 40 }];
  const first = await getPublicLedger(db, { limit: '1' });
  assert.equal(first.activities[0].id, 'payment');
  assert.equal(first.hasMore, true);
  const second = await getPublicLedger(db, { limit: '1', skip: '1' });
  assert.equal(second.activities[0].id, 'rating');
  const last = await getPublicLedger(db, { limit: '1', skip: '2' });
  assert.equal(last.activities[0].id, 'view');
  assert.equal(last.hasMore, false);
  for (const call of calls.filter(call => call.method === 'findMany' && call.model !== 'content')) assert.equal(call.args.skip, undefined);
});

test('invalid/private type and ambiguous domains fail before a database read', async () => {
  for (const args of [{ type: 'nibshare' }, { domain: 'https://creator.example' }, { domain: 'example/path' }, { skip: '10001' }]) {
    const { db, calls } = fixtureDb();
    await assert.rejects(getPublicLedger(db, args), { status: 400 });
    assert.equal(calls.length, 0);
  }
});

test('stats exclude private shares and do not turn database failure into zero', async () => {
  const { db, rows, calls } = fixtureDb();
  rows.unlockReceipt = [{ amount: 3, protocolFee: 0.1 }];
  rows.tip = [{ amount: 2, protocolFee: 0.1, status: 'settled' }, { amount: -1, status: 'refunded' }];
  const result = await getPublicStats(db);
  assert.equal(result.stats.revenue, 4);
  assert.equal(result.stats.tipRevenue, 1);
  assert.equal(result.stats.tips, 1);
  assert.doesNotMatch(JSON.stringify(result), /nibshare/i);
  assert.deepEqual(calls.find(call => call.model === 'tip').args.where.contentId.in, [content.id]);
  db.metric.count = async () => { throw new Error('unavailable'); };
  await assert.rejects(getPublicStats(db), /unavailable/);
  await assert.rejects(getPublicLedger(db), /unavailable/);
});


test('ledger distinguishes the supported pagination limit from end of activity', async () => {
  const { db, rows } = fixtureDb();
  rows.metric = Array.from({ length: 10002 }, (_, index) => ({ id: String(index), content, createdAt: new Date('2026-01-01') }));
  const result = await getPublicLedger(db, { type: 'views', limit: '1', skip: '10000' });
  assert.equal(result.activities.length, 1);
  assert.equal(result.hasMore, false);
  assert.equal(result.paginationLimitReached, true);
});
