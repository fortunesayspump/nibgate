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
  const deps = {
    ...defaults, ...privacy, process: { env: { NIBGATE_DISABLE_KEEPER: 'true' } },
    serializeContent: value => value, normalizeContentType: value => value,
    db: { content: { async findMany() { return []; }, async count() { return 0; } } },
    ...overrides,
  };
  const register = new Function(...Object.keys(deps), `${source}\nreturn registerHubRoutes;`)(...Object.values(deps));
  const handlers = {};
  const app = Object.fromEntries(['get', 'post', 'put', 'patch', 'delete', 'options', 'use'].map(method => [method, (path, ...fns) => { handlers[`${method} ${path}`] = fns.at(-1); }]));
  register(app);
  async function request(path, query = {}) {
    const res = { statusCode: 200, headers: {}, set(name, value) { this.headers[name] = value; return this; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handlers[`get ${path}`]({ query }, res);
    return res;
  }
  return { request };
}

test('HTTP public ledger and stats use shared services and return no-store', async () => {
  const calls = [];
  const { request } = harness({
    getPublicLedger: async (db, args) => { calls.push(args); return { success: true, activities: [] }; },
    getPublicStats: async () => ({ success: true, stats: {} }),
  });
  for (const path of ['/api/hub/ledger', '/api/hub/stats']) {
    const res = await request(path, { type: 'views' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
    assert.equal(res.body.success, true);
  }
  assert.deepEqual(calls, [{ type: 'views' }]);
});

test('HTTP errors are unavailable, never empty success or leaked DB detail', async () => {
  const fail = async () => { throw new Error('PRIVATE database connection details'); };
  const { request } = harness({ getPublicLedger: fail, getPublicStats: fail, db: { content: { findMany: fail, count: fail } } });
  for (const path of ['/api/hub/ledger', '/api/hub/stats', '/api/hub/explore/content', '/api/hub/reputation/leaderboards']) {
    const res = await request(path, { type: 'content' });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.success, false);
    assert.doesNotMatch(JSON.stringify(res.body), /PRIVATE/);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
  }
});

test('Explore uses public predicates for result and count and an explicit serialization allowlist', async () => {
  const calls = [];
  const { request } = harness({ db: { content: {
    async findMany(args) { calls.push(args); return [{ id: 'public', title: 'Article', url: 'https://creator.example/post', createdAt: '2026-01-01', views: 1, unlocks: 0, revenue: 0, accessPolicy: 'PRIVATE', publisherWallet: 'PRIVATE' }]; },
    async count(args) { calls.push(args); return 1; },
  } } });
  const res = await request('/api/hub/explore/content');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.total, 1);
  assert.doesNotMatch(JSON.stringify(res.body), /PRIVATE/);
  for (const call of calls) assert.deepEqual(call.where, privacy.publicContentWhere());
});
