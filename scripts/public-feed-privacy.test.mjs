import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creatorSource, getPublicDiscovery, getPublicLedger, getPublicLeaderboards, getPublicStats } from '../backend/src/server/hub/public-feeds.js';

// Fixtures exercise only local code. Nothing is written to a live database.
const post = { id: 'current-post', slug: 'public-post', type: 'article', title: 'Current public title', excerpt: 'Current public summary', coverUrl: null, publishedAt: '2026-11-07T00:00:00Z', updatedAt: '2026-11-07T00:00:00Z', price: '2.50' };
const home = (posts = [post]) => ({ success: true, site: { name: 'Current public site', subdomain: 'creator' }, posts });
const resource = (item = post) => ({ id: item.id, title: item.title, summary: item.excerpt || '', type: 'article', price: item.price, currency: 'USDC', path: `/writing/${item.slug}`, url: `https://creator.nibgate.xyz/writing/${item.slug}`, imageUrl: item.coverUrl });
const manifest = (posts = [post]) => ({ origin: 'https://creator.nibgate.xyz', content: posts.map(resource) });
function fixtures({ homes = [home(), home()], manifestValue = manifest(), sites = [{ id: 'site', domain: 'creator.nibgate.xyz' }] } = {}) {
  const calls = [];
  const reads = [];
  const db = { website: { async findMany(args) { reads.push(args); return sites; } } };
  for (const model of ['content', 'metric', 'unlockReceipt', 'contentRating', 'tip', 'user', 'nibShare', 'nibShareEvent', 'nibShareReceipt']) Object.defineProperty(db, model, { get() { throw new Error(`Historical/private table read: ${model}`); } });
  let homeIndex = 0;
  const fetchFn = async (url, options) => {
    calls.push({ url, options });
    const value = url.endsWith('/public-home-v2') ? homes[Math.min(homeIndex++, homes.length - 1)] : manifestValue;
    return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
  };
  return { db, calls, reads, options: { network: 'mainnet', fetchFn } };
}

test('creator sources pin network and fixed API origins, never arbitrary registered hosts', () => {
  assert.equal(creatorSource('creator.nibgate.xyz', 'mainnet').apiOrigin, 'https://api-subblogs.nibgate.xyz');
  assert.equal(creatorSource('testnet-creator.nibgate.xyz', 'testnet').domain, 'creator.testnet.nibgate.xyz');
  for (const [domain, network] of [['creator.testnet.nibgate.xyz', 'mainnet'], ['creator.nibgate.xyz', 'testnet'], ['api.nibgate.xyz', 'mainnet'], ['nibgate.xyz', 'mainnet'], ['localhost', 'mainnet'], ['127.0.0.1', 'mainnet'], ['creator.nibgate.xyz.evil', 'mainnet'], ['testnet-creator.nibgate.xyz', 'mainnet']]) assert.equal(creatorSource(domain, network), null);
});

test('discovery uses only rechecked authoritative current metadata and null history', async () => {
  const { db, calls, reads, options } = fixtures();
  const result = await getPublicDiscovery(db, {}, options);
  assert.equal(result.scope, 'current-public-creator-articles');
  assert.equal(result.content.length, 1);
  const item = result.content[0];
  assert.equal(item.title, post.title);
  assert.equal(item.id, post.id);
  assert.equal(item.identityScope, 'creator-publication');
  assert.equal(item.price, 2.5);
  for (const key of ['views', 'unlocks', 'revenue', 'ratings', 'reputationScore', 'reputationStars']) assert.equal(item[key], null);
  assert.doesNotMatch(JSON.stringify(result), /payerWallet|recipientWallet|actor|receipt|txHash|visitorId|accessPolicy|unlockPolicy/);
  assert.deepEqual(reads[0].select, { id: true, domain: true });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(call => new URL(call.url).pathname), ['/api/blog/public-home-v2', '/api/nibgate/manifest', '/api/blog/public-home-v2']);
  for (const { url, options: request } of calls) {
    assert.equal(new URL(url).origin, 'https://api-subblogs.nibgate.xyz');
    assert.equal(request.redirect, 'error'); assert.equal(request.cache, 'no-store');
    assert.equal(request.headers['x-site-subdomain'], 'creator');
    assert.equal(request.headers['x-forwarded-host'], 'creator.nibgate.xyz');
    assert.equal(request.headers.Authorization, undefined); assert.equal(request.headers.Cookie, undefined);
  }
});

test('withdrawn or changed metadata is omitted after final public-listing recheck', async () => {
  for (const changed of [home([]), home([{ ...post, title: 'Changed title' }]), home([{ ...post, id: 'replacement-id' }])]) {
    const { db, options } = fixtures({ homes: [home(), changed] });
    const result = await getPublicDiscovery(db, {}, options);
    assert.equal(result.total, 0); assert.deepEqual(result.content, []);
    assert.doesNotMatch(JSON.stringify(result), /Current public title|Changed title/);
  }
});

test('invite-only/missing manifest entries cannot reuse stale index rows or public home metadata', async () => {
  const { db, options } = fixtures({ manifestValue: manifest([]) });
  const result = await getPublicDiscovery(db, {}, options);
  assert.deepEqual(result.content, []);
});

test('private-to-public source state creates a current listing but never exposes prior activity', async () => {
  const { db, options } = fixtures();
  const result = await getPublicDiscovery(db, {}, options);
  assert.equal(result.content[0].id, 'current-post');
  await assert.rejects(getPublicLedger(db), { code: 'event-visibility-unavailable', status: 503 });
  await assert.rejects(getPublicLeaderboards(db), { code: 'event-visibility-unavailable', status: 503 });
});

test('new publication reusing a URL never inherits old IDs, wallets or historical counters', async () => {
  const replacement = { ...post, id: 'new-owner-publication', title: 'New public publication' };
  const { db, options } = fixtures({ homes: [home([replacement]), home([replacement])], manifestValue: manifest([replacement]) });
  const result = await getPublicDiscovery(db, {}, options);
  assert.equal(result.content[0].id, replacement.id);
  assert.equal(result.content[0].views, null);
  assert.equal(result.content[0].revenue, null);
});

test('source failures and wrong tenant are unavailable, never valid empty success', async () => {
  for (const bad of [{ ...home(), site: { name: 'Other site', subdomain: 'other' } }, { success: false }, { ...home(), posts: null }]) {
    const { db, options } = fixtures({ homes: [bad] });
    await assert.rejects(getPublicDiscovery(db, {}, options), { code: 'public-source-unavailable' });
  }
  const { db, options } = fixtures();
  options.fetchFn = async () => new Response('Unavailable', { status: 503 });
  await assert.rejects(getPublicDiscovery(db, {}, options), { code: 'public-source-unavailable' });
});

test('an authoritative empty listing is valid but not a historical zero', async () => {
  const { db, options } = fixtures({ homes: [home([]), home([])], manifestValue: manifest([]) });
  const result = await getPublicDiscovery(db, {}, options);
  assert.equal(result.success, true); assert.equal(result.total, 0);
  const stats = await getPublicStats(db, options);
  assert.equal(stats.stats.content, 0);
  for (const key of ['views', 'unlocks', 'revenue', 'tips', 'creators']) assert.equal(stats.stats[key], null);
});

test('current stats count source listings without reading historical aggregates', async () => {
  const { db, options } = fixtures();
  const result = await getPublicStats(db, options);
  assert.equal(result.stats.content, 1); assert.equal(result.stats.sites, 1);
  assert.equal(result.stats.revenue, null); assert.equal(result.stats.views, null);
});

test('only supported current article scope is returned; historical sort is never fabricated', async () => {
  const { db, options } = fixtures();
  const result = await getPublicDiscovery(db, { sort: 'best-sellers' }, options);
  assert.equal(result.sort, 'newest-publication'); assert.equal(result.requestedSort, 'best-sellers');
  assert.equal(result.coverage.perSiteLimit, 20);
  assert.deepEqual((await getPublicDiscovery(db, { type: 'video' }, options)).content, []);
  await assert.rejects(getPublicDiscovery(db, { skip: 10001 }, options), { status: 400 });
});

test('successive requests re-read current publication state; no eligibility cache', async () => {
  const data = fixtures();
  assert.equal((await getPublicDiscovery(data.db, {}, data.options)).content.length, 1);
  data.options.fetchFn = async url => new Response(JSON.stringify(url.endsWith('/manifest') ? manifest([]) : home([])), { headers: { 'Content-Type': 'application/json' } });
  assert.equal((await getPublicDiscovery(data.db, {}, data.options)).content.length, 0);
});


test('legacy manifest image fallback does not suppress an eligible public article', async () => {
  const currentManifest = manifest(); currentManifest.content[0].imageUrl = 'https://creator.nibgate.xyz/legacy-cover.jpg';
  const { db, options } = fixtures({ manifestValue: currentManifest });
  const result = await getPublicDiscovery(db, {}, options);
  assert.equal(result.total, 1); assert.equal(result.content[0].imageUrl, '');
});

test('malformed current prices are source errors, never fabricated empty listings', async () => {
  for (const price of ['invalid', '', '-1', {}, undefined]) {
    const currentManifest = manifest(); currentManifest.content[0].price = price;
    const { db, options } = fixtures({ manifestValue: currentManifest });
    await assert.rejects(getPublicDiscovery(db, {}, options), { code: 'public-source-unavailable' });
  }
});


test('price-only or revision-only changes after manifest read are not emitted', async () => {
  for (const replacement of [{ ...post, price: '4' }, { ...post, updatedAt: '2026-11-07T01:00:00Z' }]) {
    const { db, options } = fixtures({ homes: [home(), home([replacement])] });
    assert.deepEqual((await getPublicDiscovery(db, {}, options)).content, []);
  }
});

test('older creator DTOs lacking a safe revision or price fail closed', async () => {
  for (const key of ['price', 'updatedAt']) {
    const legacy = { ...post }; delete legacy[key];
    const { db, options } = fixtures({ homes: [home([legacy])] });
    await assert.rejects(getPublicDiscovery(db, {}, options), { code: 'public-source-unavailable' });
  }
});

test('request-wide deadline prevents aged snapshots from becoming public results', async () => {
  const { db, options } = fixtures();
  let elapsed = 0;
  const fetch = options.fetchFn;
  options.now = () => elapsed;
  options.fetchFn = async (...args) => { elapsed += 6000; return fetch(...args); };
  await assert.rejects(getPublicDiscovery(db, {}, options), { code: 'public-source-unavailable' });
});


test('earlier final snapshots cannot wait behind later sites beyond the freshness bound', async () => {
  const sites = Array.from({ length: 17 }, (_, index) => ({ id: `site-${index}`, domain: `creator${index}.nibgate.xyz` }));
  const { db } = fixtures({ sites });
  let elapsed = 0;
  const homeReads = new Map();
  const options = { network: 'mainnet', now: () => elapsed, fetchFn: async (url, request) => {
    const subdomain = request.headers['x-site-subdomain'];
    const origin = `https://${subdomain}.nibgate.xyz`;
    let value;
    if (url.endsWith('/public-home-v2')) {
      const count = (homeReads.get(subdomain) || 0) + 1; homeReads.set(subdomain, count);
      if (subdomain === 'creator16' && count === 2) elapsed = 3000;
      value = { ...home(), site: { name: subdomain, subdomain } };
    } else value = { origin, content: [{ ...resource(), url: `${origin}/writing/${post.slug}` }] };
    return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
  } };
  await assert.rejects(getPublicDiscovery(db, {}, options), { code: 'public-source-unavailable' });
});
