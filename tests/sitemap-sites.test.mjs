import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createSitemapSiteResolver, sitemapCandidate } from '../backend/src/server/hub/sitemap-sites.js';
const json = (body, status = 200) => Response.json(body, { status });
const found = tenant => json({ success: true, site: { subdomain: tenant } });

test('network canonical hosts, reserved names, malformed hosts and platform sites', () => {
  assert.deepEqual(sitemapCandidate(' Fortune.Nibgate.xyz ', 'mainnet'), { host: 'fortune.nibgate.xyz', tenant: 'fortune' });
  assert.equal(sitemapCandidate('fortune.nibgate.xyz', 'testnet'), null);
  assert.equal(sitemapCandidate('fortune.testnet.nibgate.xyz', 'mainnet'), null);
  for (const host of ['api-subblogs.testnet.nibgate.xyz', 'testnet-fortune.testnet.nibgate.xyz', 'x.y.testnet.nibgate.xyz', '-bad.testnet.nibgate.xyz', 'fortune.testnet.nibgate.xyz.evil.com', 'https://fortune.testnet.nibgate.xyz']) assert.equal(sitemapCandidate(host, 'testnet'), null);
  assert.equal(sitemapCandidate('docs.nibgate.xyz', 'mainnet').tenant, null);
  assert.equal(sitemapCandidate('docs.nibgate.xyz', 'testnet'), null);
});

test('exclude absent mainnet mirror, preserve genuine empty or mirrored local tenant', async () => {
  const calls = [];
  const resolve = createSitemapSiteResolver({ fetcher: async (url, options) => {
    calls.push([url, options]);
    const tenant = new URL(url).searchParams.get('subdomain');
    return tenant === 'fortune' ? json({ error: 'Site not found', subdomain: tenant }, 404) : found(tenant);
  } });
  assert.deepEqual(await resolve(['fortune.nibgate.xyz', 'canvasandcode.nibgate.xyz', 'empty.nibgate.xyz', 'docs.nibgate.xyz'], 'mainnet'), ['canvasandcode.nibgate.xyz', 'empty.nibgate.xyz', 'docs.nibgate.xyz']);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(([url, options]) => url.startsWith('https://api-subblogs.nibgate.xyz/blog/public-site-v2?subdomain=') && options.redirect === 'manual' && options.headers['x-forwarded-host'].endsWith('.nibgate.xyz')));
});

test('same tenant exists in testnet only; never queries mainnet backend from testnet', async () => {
  const resolve = createSitemapSiteResolver({ fetcher: async (url, options) => {
    assert.equal(url, 'https://testnet-api-subblogs.nibgate.xyz/blog/public-site-v2?subdomain=fortune');
    assert.equal(options.headers['x-forwarded-host'], 'fortune.testnet.nibgate.xyz');
    return found('fortune');
  } });
  assert.deepEqual(await resolve(['fortune.testnet.nibgate.xyz', 'fortune.nibgate.xyz', 'api-subblogs.testnet.nibgate.xyz'], 'testnet'), ['fortune.testnet.nibgate.xyz']);
});

test('unknown404, redirects, HTML, mismatch, malformed,503 and network failure fail instead of returning an empty list', async () => {
  const responses = [() => json({ error: 'Site not found', subdomain: 'someoneelse' }, 404), () => json({ error: 'Route unavailable' }, 404), () => new Response('', { status: 302 }), () => new Response('Not found', { status: 404 }), () => found('someoneelse'), () => new Response('{', { headers: { 'content-type': 'application/json' } }), () => json({ error: 'Temporarily unavailable' }, 503), () => { throw new Error('timeout'); }];
  for (const response of responses) {
    const resolve = createSitemapSiteResolver({ fetcher: async () => response() });
    await assert.rejects(resolve(['fortune.nibgate.xyz'], 'mainnet'), /could not be verified/);
  }
});

test('positive cache tolerates short outage but not confirmed removal; both cache outcomes protect rate budget', async () => {
  let time = 0, mode = 'found', calls = 0;
  const resolve = createSitemapSiteResolver({ now: () => time, fetcher: async () => {
    calls++;
    if (mode === 'error') throw new Error('unavailable');
    return mode === 'found' ? found('fortune') : json({ error: 'Site not found' }, 404);
  } });
  const domains = ['fortune.nibgate.xyz'];
  assert.deepEqual(await resolve(domains, 'mainnet'), domains);
  await resolve(domains, 'mainnet'); assert.equal(calls, 1);
  time = 300001; mode = 'error'; assert.deepEqual(await resolve(domains, 'mainnet'), domains);
  time = 1800001; await assert.rejects(resolve(domains, 'mainnet'));
  mode = 'absent'; time += 300001; assert.deepEqual(await resolve(domains, 'mainnet'), []);
  mode = 'found'; time += 300001; assert.deepEqual(await resolve(domains, 'mainnet'), domains);
  mode = 'absent'; time += 300001; assert.deepEqual(await resolve(domains, 'mainnet'), []);
});

test('52 sites are bounded to six concurrent lookups and simultaneous requests coalesce', async () => {
  let active = 0, max = 0, calls = 0;
  const resolve = createSitemapSiteResolver({ fetcher: async url => {
    active++; max = Math.max(max, active); calls++;
    await new Promise(r => setTimeout(r, 2)); active--;
    return found(new URL(url).searchParams.get('subdomain'));
  } });
  const domains = Array.from({ length: 52 }, (_, i) => `site${i}.nibgate.xyz`);
  const [a, b] = await Promise.all([resolve(domains, 'mainnet'), resolve(domains, 'mainnet')]);
  assert.deepEqual(a, domains); assert.deepEqual(b, domains);
  assert.equal(calls, 52); assert.equal(max, 6);
});

test('actual sitemap route uses local network resolver and surfaces lookup/database failure as503', async () => {
  const source = await fs.readFile(new URL('../backend/src/server/routes/hub-routes.js', import.meta.url), 'utf8');
  const start = source.indexOf("  app.get('/api/hub/sitemap-sites'");
  const end = source.indexOf('\n  });', start) + 6;
  const register = new Function('app', 'db', 'activeNetwork', 'resolveSitemapSites', source.slice(start, end));
  let handler;
  const db = { website: { findMany: async query => { assert.deepEqual(query.where, { deletedAt: null }); return [{ domain: 'fortune.testnet.nibgate.xyz' }]; } } };
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(value) { this.body = value; return this; } };
  register({ get: (path, h) => { handler = h; } }, db, () => ({ name: 'testnet' }), async (domains, network) => { assert.equal(network, 'testnet'); return domains; });
  await handler({}, res); assert.equal(res.body.success, true);
  db.website.findMany = async () => { throw new Error('database unavailable'); };
  await handler({}, res); assert.equal(res.statusCode, 503); assert.equal(res.body.success, false); assert.equal(res.body.sites, undefined);
});

test('GSC default is network-aware and refuses failed/malformed lists', async () => {
  const source = await fs.readFile(new URL('../backend/src/server/hub/gsc-sitemap.js', import.meta.url), 'utf8');
  assert.equal(source.includes('/sitemap.xml/`'), false, 'keep canonical URL repair from PR41');
  const body = source.slice(source.indexOf('export async function fetchSiteList()'), source.indexOf('export async function listSubmittedSitemaps()')).replace('export ', '');
  let url;
  const factory = new Function('process', 'hostsFor', 'request', `${body}; return fetchSiteList;`);
  const list = factory({ env: {} }, () => ({ apiBase: 'https://testnet-api.nibgate.xyz' }), async u => { url = u; return { success: true, sites: ['fortune.testnet.nibgate.xyz'] }; });
  assert.deepEqual(await list(), ['fortune.testnet.nibgate.xyz']); assert.equal(url, 'https://testnet-api.nibgate.xyz/hub/sitemap-sites');
  await assert.rejects(factory({ env: {} }, () => ({ apiBase: 'https://api.nibgate.xyz' }), async () => ({ success: false }))(), /unavailable/);
});

test('automatic GSC submission and index/IndexNow timers never start on noindex testnet', async () => {
  const source = await fs.readFile(new URL('../backend/src/server/hub/monitors.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('// ── GSC Sitemap Monitor')).replaceAll('export function ', 'function ');
  let timers = 0, submits = 0, indexes = 0;
  const factory = new Function('activeNetwork', 'process', 'setTimeout', 'setInterval', 'submitAllSiteSitemaps', 'runIndexSweep', `${body}; return {startGscSitemapMonitor,startGscIndexMonitor,runGscSitemapSweep,runGscIndexSweep};`);
  let network = 'testnet';
  const monitor = factory(() => ({ name: network }), { env: { GSC_SERVICE_ACCOUNT_JSON: 'configured-test-placeholder' } }, () => { timers++; return {}; }, () => { timers++; return {}; }, async () => { submits++; return { disabled: true }; }, async () => { indexes++; return { disabled: true }; });
  monitor.startGscSitemapMonitor(); monitor.startGscIndexMonitor();
  await monitor.runGscSitemapSweep(); await monitor.runGscIndexSweep();
  assert.deepEqual([timers,submits,indexes], [0,0,0]);
  network = 'mainnet'; monitor.startGscSitemapMonitor(); monitor.startGscIndexMonitor();
  assert.equal(timers, 2);
  await monitor.runGscSitemapSweep(); await monitor.runGscIndexSweep();
  assert.deepEqual([submits,indexes], [1,1]);
  network = 'testnet'; await monitor.runGscSitemapSweep(); await monitor.runGscIndexSweep();
  assert.deepEqual([submits,indexes], [1,1]);
});

test('direct submission entrypoints refuse testnet before credential, fetch or database access', async () => {
  let network = 'testnet';
  const source = (await fs.readFile(new URL('../backend/src/server/hub/gsc-sitemap.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '').replaceAll('export ', '');
  const gsc = new Function('activeNetworkName', 'sitemapCandidate', 'process', `${source}; return {automaticIndexingEnabled,assertProductionIndexingDomain,submitSitemapForDomain,submitAllSiteSitemaps};`)(() => network, sitemapCandidate, { env: { GSC_SERVICE_ACCOUNT_JSON: 'not-parsed-on-testnet' } });
  assert.equal((await gsc.submitAllSiteSitemaps({ force: true })).disabled, true);
  await assert.rejects(gsc.submitSitemapForDomain('fortune.testnet.nibgate.xyz'), /disabled/);
  await assert.rejects(gsc.submitSitemapForDomain('fortune.nibgate.xyz'), /disabled/);
  const indexSource = (await fs.readFile(new URL('../backend/src/server/hub/gsc-index.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '').replaceAll('export ', '');
  const index = new Function('automaticIndexingEnabled', 'assertProductionIndexingDomain', 'process', `${indexSource}; return {runIndexSweep,submitIndexNow};`)(gsc.automaticIndexingEnabled, gsc.assertProductionIndexingDomain, { env: { GSC_SERVICE_ACCOUNT_JSON: 'configured-placeholder' } });
  assert.equal((await index.runIndexSweep()).disabled, true);
  await assert.rejects(index.submitIndexNow('fortune.testnet.nibgate.xyz', ['anything']), /disabled/);
  network = 'mainnet';
  for (const domain of ['fortune.testnet.nibgate.xyz', 'testnet-fortune.nibgate.xyz', 'testnet.nibgate.xyz', 'api-subblogs.nibgate.xyz', 'evil.example']) assert.throws(() => gsc.assertProductionIndexingDomain(domain), /disabled/);
  for (const domain of ['canvasandcode.nibgate.xyz', 'docs.nibgate.xyz', 'www.nibgate.xyz']) assert.doesNotThrow(() => gsc.assertProductionIndexingDomain(domain));
});

test('frequent52-domain feed polling stays below200 reads/15minutes, including absent tenants', async () => {
  let time = 0, calls = 0;
  const resolve = createSitemapSiteResolver({ now: () => time, fetcher: async url => {
    calls++;
    const tenant = new URL(url).searchParams.get('subdomain');
    return Number(tenant.slice(4)) < 8 ? json({ error: 'Site not found', subdomain: tenant }, 404) : found(tenant);
  } });
  const domains = Array.from({ length: 52 }, (_, i) => `site${i}.nibgate.xyz`);
  for (time = 0; time < 900000; time += 10000) assert.equal((await resolve(domains, 'mainnet')).length, 44);
  assert.equal(calls, 156);
});

test('cold failures are backed off;429 honors longer Retry-After without false absence', async () => {
  let time = 0, calls = 0;
  const resolve = createSitemapSiteResolver({ now: () => time, fetcher: async () => {
    calls++;
    return new Response('rate limited', { status: 429, headers: { 'retry-after': '900' } });
  } });
  for (time = 0; time < 900000; time += 10000) await assert.rejects(resolve(['fortune.nibgate.xyz'], 'mainnet'));
  assert.equal(calls, 1);
  time = 900001; await assert.rejects(resolve(['fortune.nibgate.xyz'], 'mainnet')); assert.equal(calls, 2);
});
