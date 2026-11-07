import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as privacy from '../backend/src/server/hub/public-feeds.js';
const original = readFileSync(new URL('../backend/src/server/routes/hub-routes.js', import.meta.url), 'utf8');
const imports = [...original.matchAll(/^import ([\s\S]*?) from '[^']+';$/gm)];
const source = original.replace(/^import [\s\S]*? from '[^']+';$/gm, '').replace(/^export /gm, '');
function harness(overrides = {}) {
  const defaults = {};
  for (const [, clause] of imports) for (const name of clause.replace(/[{}]/g, '').split(',').map(name => name.trim()).filter(Boolean)) defaults[name] = () => undefined;
  const deps = { ...defaults, ...privacy, process: { env: { NIBGATE_DISABLE_KEEPER: 'true' } }, activeNetwork: () => ({ name: 'mainnet' }), db: {}, ...overrides };
  const register = new Function(...Object.keys(deps), `${source}\nreturn registerHubRoutes;`)(...Object.values(deps));
  const handlers = {};
  register(Object.fromEntries(['get', 'post', 'put', 'patch', 'delete', 'options', 'use'].map(method => [method, (path, ...fns) => { handlers[`${method} ${path}`] = fns.at(-1); }])));
  return async (path, query = {}) => {
    const res = { statusCode: 200, headers: {}, set(name, value) { this.headers[name] = value; return this; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handlers[`get ${path}`]({ query }, res); return res;
  };
}

test('HTTP discovery delegates to current source and passes its actual active network', async () => {
  const calls = [];
  const request = harness({ getPublicDiscovery: async (db, query, options) => { calls.push({ query, options }); return { success: true, scope: 'current-public-creator-articles', content: [] }; } });
  const res = await request('/api/hub/explore/content', { q: 'public' });
  assert.equal(res.statusCode, 200); assert.equal(res.headers['Cache-Control'], 'private, no-store');
  assert.deepEqual(calls, [{ query: { q: 'public' }, options: { network: 'mainnet' } }]);
});

test('HTTP history is unavailable even when stale indexed data might exist', async () => {
  const request = harness({ db: new Proxy({}, { get() { throw Error('No historical reads allowed'); } }) });
  for (const path of ['/api/hub/ledger', '/api/hub/reputation/leaderboards']) {
    const res = await request(path);
    assert.equal(res.statusCode, 503); assert.equal(res.body.code, 'event-visibility-unavailable');
    assert.equal(res.body.success, false); assert.equal(res.body.activities, undefined);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
  }
});

test('HTTP errors withhold implementation detail instead of fabricating empty results', async () => {
  const fail = async () => { throw Error('PRIVATE database connection'); };
  const request = harness({ getPublicDiscovery: fail, getPublicStats: fail });
  for (const path of ['/api/hub/explore/content', '/api/hub/stats']) {
    const res = await request(path); assert.equal(res.statusCode, 503);
    assert.equal(res.body.success, false); assert.doesNotMatch(JSON.stringify(res.body), /PRIVATE/);
  }
});
