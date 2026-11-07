import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { getPublicDiscovery, getPublicStats, getPublicLedger, getPublicLeaderboards } from '../backend/src/server/hub/public-feeds.js';
const require = createRequire(import.meta.url);
const { createPublicArticleV2Router } = require('../subblogs/backend/src/routes/v1/public-article-v2.route.js');

// Entirely in-process fixtures. No HTTP listeners, real tenants, live fetches or writes.
const site = { id: 'tenant-one', subdomain: 'one', name: 'One', description: '' };
const origin = 'https://one.nibgate.xyz';
const post = (id, changes = {}) => ({ id, siteId: site.id, slug: id, type: 'article', status: 'published', publicAccess: true,
  price: '2', title: `Title ${id}`, excerpt: '', coverUrl: null, publishedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  bodyMarkdown: 'PROTECTED_BODY', contentKey: 'PROTECTED_KEY', ...changes });
// Evaluate the actual predicate rather than blindly returning eligible records.
function matches(row, where) {
  return Object.entries(where).every(([key, value]) => key === 'OR' ? value.some(part => matches(row, part))
    : value && typeof value === 'object' && 'in' in value ? value.in.includes(row[key]) : row[key] === value);
}
function fixture(rows = [post('public')]) {
  let read = 0;
  const state = { rows, beforeRead: () => {}, calls: [], requests: [], beforeFetch: () => {} };
  const prisma = { blogPost: {
    findFirst: async () => { throw Error('Home must not read article bodies'); },
    findMany: async args => {
      await state.beforeRead(++read);
      state.calls.push(args);
      for (const key of ['bodyMarkdown', 'bodyStorageRef', 'contentKey']) assert.equal(args.select[key], undefined);
      let result = state.rows.filter(row => matches(row, args.where));
      if (args.orderBy) result = result.toSorted((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.id.localeCompare(a.id));
      if (args.take) result = result.slice(0, args.take);
      return result.map(row => Object.fromEntries(Object.keys(args.select).map(key => [key, row[key]])));
    },
  } };
  const router = createPublicArticleV2Router({ prisma, decryptBody: async () => { throw Error('Must not decrypt'); } });
  state.home = (tenant = site, siteId = tenant?.id) => new Promise((resolve, reject) => {
    const headers = {};
    const res = { statusCode: 200, set(k,v) { headers[k] = v; return this; }, vary() { return this; },
      status(code) { this.statusCode = code; return this; }, json(body) { resolve({ status: this.statusCode, headers, body }); } };
    router.handle({ method: 'GET', url: '/public-home-v2', headers: {}, site: tenant, siteId }, res, error => reject(error || Error('Route did not respond')));
  });
  state.fetchFn = async (url, options) => {
    state.requests.push(url);
    await state.beforeFetch(state.requests.length, url);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['x-site-subdomain'], site.subdomain);
    assert.equal(options.headers['x-forwarded-host'], 'one.nibgate.xyz');
    assert.ok(url.startsWith('https://api-subblogs.nibgate.xyz/'));
    let result;
    if (url.endsWith('/api/blog/public-home-v2')) result = await state.home();
    else {
      assert.ok(url.endsWith('/api/nibgate/manifest'));
      // Manifest fixture follows the production route's current published/public contract.
      result = { status: 200, body: { origin, content: state.rows.filter(row => matches(row, { siteId: site.id, status: 'published', publicAccess: true })).map(row => ({
        id: row.id, title: row.title, summary: row.excerpt || '', type: row.type, price: row.price || null,
        currency: 'USDC', path: `/writing/${row.slug}`, url: `${origin}/writing/${row.slug}`, imageUrl: row.coverUrl || null,
      })) } };
    }
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'content-type': 'application/json' } });
  };
  state.db = new Proxy({ website: { findMany: async () => [{ id: 'website-one', domain: 'one.nibgate.xyz' }] } }, {
    get(target, key) { if (!(key in target)) throw Error(`Forbidden Hub history/index model ${String(key)}`); return target[key]; },
  });
  state.options = { network: 'mainnet', fetchFn: (...args) => state.fetchFn(...args) };
  return state;
}

test('real public-home route enforces tenant, published state and public access; permits public paid metadata', async () => {
  const f = fixture([post('paid'), post('free', { price: null }), post('invite-only', { publicAccess: false }), post('draft', { status: 'draft' }), post('foreign', { siteId: 'other' }), post('video', { type: 'video' })]);
  const result = await f.home();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.posts.map(row => row.id).sort(), ['free', 'paid']);
  assert.equal(result.headers['Cache-Control'], 'private, no-store');
  assert.doesNotMatch(JSON.stringify(result.body), /invite-only|draft|foreign|video|PROTECTED|publicAccess/);
  assert.equal(result.body.posts.find(post=>post.id==='paid').price, '2');
  assert.ok(result.body.posts.every(post=>post.updatedAt));
  assert.equal((await f.home(site, 'other')).status, 404);
  assert.equal((await f.home(null)).status, 404);
});

test('real home route removes publication changed between its own two reads', async () => {
  const f = fixture();
  f.beforeRead = count => { if (count === 2) f.rows[0].publicAccess = false; };
  const result = await f.home();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.posts, []);
});

test('discovery uses the real home DTO, not nonexistent status/visibility fields or indexed metadata', async () => {
  const f = fixture([post('public'), post('invite-only', { publicAccess: false }), post('draft', { status: 'draft' }), post('foreign', { siteId: 'other' })]);
  const result = await getPublicDiscovery(f.db, {}, f.options);
  assert.equal(result.total, 1);
  assert.equal(result.content[0].title, 'Title public');
  assert.equal(result.content[0].price, 2);
  assert.equal(result.content[0].url, `${origin}/writing/public`);
  assert.deepEqual(f.requests.map(url => new URL(url).pathname), ['/api/blog/public-home-v2', '/api/nibgate/manifest', '/api/blog/public-home-v2']);
  assert.doesNotMatch(JSON.stringify(result), /invite-only|draft|foreign|PROTECTED/);
});

for (const mutation of ['private', 'draft', 'foreign', 'title']) test(`discovery excludes ${mutation} changes immediately before final home`, async () => {
  const f = fixture();
  f.beforeFetch = count => { if (count !== 3) return;
    if (mutation === 'private') f.rows[0].publicAccess = false;
    if (mutation === 'draft') f.rows[0].status = 'draft';
    if (mutation === 'foreign') f.rows[0].siteId = 'other';
    if (mutation === 'title') f.rows[0].title = 'Changed title';
  };
  const result = await getPublicDiscovery(f.db, {}, f.options);
  assert.deepEqual(result.content, []);
  assert.equal(result.total, 0);
});

test('private to public exposes current metadata only, never historical events or zero-valued history claims', async () => {
  const f = fixture([post('newly-public', { publicAccess: false })]);
  assert.equal((await getPublicDiscovery(f.db, {}, f.options)).total, 0);
  f.rows[0].publicAccess = true;
  const result = await getPublicDiscovery(f.db, {}, f.options);
  assert.equal(result.total, 1);
  for (const key of ['views', 'unlocks', 'revenue', 'ratings', 'reputationScore', 'reputationStars']) assert.equal(result.content[0][key], null);
  const stats = await getPublicStats(f.db, f.options);
  assert.equal(stats.stats.content, 1);
  for (const key of ['views', 'unlocks', 'revenue', 'protocolFees', 'tips', 'tipRevenue']) assert.equal(stats.stats[key], null);
  for (const fn of [getPublicLedger, getPublicLeaderboards]) await assert.rejects(fn(f.db), { status: 503, code: 'event-visibility-unavailable' });
});

test('private to public during fetch is not retrospectively added to the original snapshot', async () => {
  const f = fixture([post('late-public', { publicAccess: false })]);
  f.beforeFetch = count => { if (count === 2) f.rows[0].publicAccess = true; };
  assert.deepEqual((await getPublicDiscovery(f.db, {}, f.options)).content, []);
});

for (const failRead of [1, 2, 3, 4]) test(`creator database failure on read ${failRead} propagates as source unavailability, not empty success`, async () => {
  const f = fixture();
  f.beforeRead = count => { if (count === failRead) throw Error('Fixture source outage'); };
  await assert.rejects(getPublicDiscovery(f.db, {}, f.options), { status: 503, code: 'public-source-unavailable' });
});

for (const failFetch of [1, 2, 3]) test(`transport failure on source request ${failFetch} cannot fabricate success`, async () => {
  const f = fixture();
  f.beforeFetch = count => { if (count === failFetch) throw Error('Fixture network outage'); };
  await assert.rejects(getPublicDiscovery(f.db, {}, f.options), { status: 503, code: 'public-source-unavailable' });
});

test('website registry failure and wrong-tenant home response fail closed', async () => {
  const f = fixture();
  f.db.website.findMany = async () => { throw Error('Registry unavailable'); };
  await assert.rejects(getPublicDiscovery(f.db, {}, f.options), /Registry unavailable/);
  const g = fixture();
  g.home = async () => ({ status: 200, body: { success: true, site: { name: 'Other', subdomain: 'other' }, posts: [] } });
  await assert.rejects(getPublicDiscovery(g.db, {}, g.options), { status: 503, code: 'public-source-unavailable' });
});
