import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../backend/src/server/mcp.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\n/gm, '').replace('export function registerMcpRoute', 'function registerMcpRoute');
const expected = { views: 3, unlocks: 1, payments: 1, ratings: 0, tips: 0, nibshareViews: 2, nibshareUnlocks: 1, nibshareRevenue: 5, total: 7 };
const register = new Function('db', 'ledgerTotals', 'activeNetwork', 'hostsFor', 'shareManifest', `${source}\nreturn registerMcpRoute;`)(
  {}, async () => expected, () => ({ name: 'mainnet', isTestnet: false }), () => ({ apiBase: 'https://api.nibgate.xyz' }), async slug => ({ slug }),
);
const handlers = {};
register({ get: () => {}, post: (path, handler) => { handlers[path] = handler; } });
async function call(name, args = {}) {
  const res = { body: null, set() { return this; }, type() { return this; }, json(value) { this.body = value; return this; } };
  await handlers['/mcp']({ body: { id: 1, method: 'tools/call', params: { name, arguments: args } } }, res);
  return res.body.result;
}
test('MCP returns aggregate private-share counts, without private events', async () => {
  const result = await call('get_ledger');
  const data = JSON.parse(result.content[0].text);
  assert.deepEqual(data.totals, expected);
  assert.deepEqual(data.activities, []);
  assert.equal(data.activityStatus, 'unavailable');
  assert.equal((await call('get_ledger', { domain: 'private.example' })).isError, true);
  assert.equal((await call('get_leaderboards', { type: 'content' })).isError, true);
});
test('MCP still resolves a caller-supplied share link', async () => {
  const result = await call('resolve_share', { url: 'https://nibgate.xyz/ns/abc123' });
  assert.deepEqual(JSON.parse(result.content[0].text), { success: true, manifest: { slug: 'abc123' } });
});
