import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from './worker.mjs';
import metadata from './metadata.json' with { type: 'json' };
const base = 'https://api.nibgate.xyz';
const post = (message, headers = {}, path = '/mcp') => new Request(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof message === 'string' ? message : JSON.stringify(message) });
const noOrigin = () => { throw Error('must not fetch origin'); };
async function forwarded(req) {
  const original = req.clone(); const result = new Response('real origin error', { status: 502, headers: { 'x-origin-result': 'preserved' } });
  let calls = 0;
  assert.equal(await handle(req, async (actual, options) => { calls++; assert.equal(options.redirect, 'manual'); assert.equal(actual, req); assert.equal(actual.url, original.url); assert.deepEqual([...actual.headers], [...original.headers]); assert.equal(await actual.text(), await original.text()); return result; }), result);
  assert.equal(calls, 1);
}
test('both network discovery surfaces exactly match generated backend metadata', async () => {
  for (const [host, data] of Object.entries(metadata.hosts)) {
    for (const [path, expected] of Object.entries({ '/mcp': data.info, '/.well-known/mcp.json': data.card, '/openapi.json': data.openapi, '/api/openapi.json': data.openapi })) {
      const result = await handle(new Request('https://' + host + path), noOrigin);
      assert.deepEqual(await result.json(), expected);
      assert.equal(result.headers.get('access-control-allow-origin'), null);
      assert.equal(result.headers.get('vary'), 'Origin');
      assert.equal(result.headers.get('cache-control'), 'no-store');
      assert.equal(result.headers.get('deprecation'), path.startsWith('/api/') ? 'true' : null);
    }
    assert.equal(data.info.protocolVersion, '2025-06-18');
  }
});
test('initialize, ping and tools/list preserve JSON-RPC IDs and metadata', async () => {
  for (const id of [0, 4, 'client-id', null]) {
    for (const method of ['initialize', 'ping', 'tools/list']) {
      const result = await handle(post({ jsonrpc: '2.0', id, method }), noOrigin);
      const value = await result.json(); assert.equal(value.id, id); assert.equal(value.jsonrpc, '2.0');
      const data = metadata.hosts['api.nibgate.xyz'];
      assert.deepEqual(value.result, method === 'initialize' ? data.info : method === 'tools/list' ? { tools: data.tools } : {});
    }
  }
});
test('known stateless notifications return the existing empty 202 response', async () => {
  for (const method of ['notifications/initialized', 'notifications/cancelled']) {
    const result = await handle(post({ jsonrpc: '2.0', method }), noOrigin);
    assert.equal(result.status, 202); assert.equal(await result.text(), '');
  }
});
test('trace context does not wake origin for static probes or bypass dynamic/auth handling', async () => {
  const trace = { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' };
  for (const method of ['initialize', 'ping', 'tools/list', 'notifications/initialized']) {
    const response = await handle(post({ jsonrpc: '2.0', method }, trace), noOrigin);
    assert.equal(response.status, method.startsWith('notifications/') ? 202 : 200);
    assert.equal(response.headers.get('x-nibgate-edge-metadata'), metadata.sourceSha256);
  }
  await forwarded(post({ jsonrpc: '2.0', id: 'real', method: 'tools/call', params: { name: 'explore_content' } }, trace));
  for (const header of ['authorization', 'cookie', 'origin', 'mcp-session-id', 'x-custom']) {
    await forwarded(post({ jsonrpc: '2.0', method: 'ping' }, { ...trace, [header]: 'fixture' }));
  }
});
test('auth, origin, session and unknown headers always reach origin unchanged', async () => {
  for (const header of ['authorization', 'cookie', 'origin', 'mcp-session-id', 'cf-access-jwt-assertion', 'x-api-key', 'x-custom', 'if-none-match']) await forwarded(post({ jsonrpc: '2.0', id: 1, method: 'ping' }, { [header]: 'fixture' }));
  await forwarded(post({ jsonrpc: '2.0', id: 1, method: 'initialize' }, { 'mcp-protocol-version': '2099-01-01' }));
});
test('tools/call, unknown methods and metadata-bearing params forward once, preserving errors', async () => {
  for (const message of [{ jsonrpc: '2.0', id: 'real', method: 'tools/call', params: { name: 'get_platform_stats', arguments: {} } }, { jsonrpc: '2.0', id: 2, method: 'future/method' }, { jsonrpc: '2.0', method: 'ping', params: { _meta: { authorization: 'fixture' } } }]) await forwarded(post(message));
});
test('malformed, batch, scalar, oversized and wrong content type bodies preserve origin handling', async () => {
  for (const body of ['{', 'null', '2', '[]', '[{"method":"ping"}]', JSON.stringify({ jsonrpc: '2.0', method: 'ping', params: { padding: 'x'.repeat(70000) } })]) await forwarded(post(body));
  await forwarded(post({ method: 'ping' }));
  await forwarded(post({ jsonrpc: '2.0', method: 'ping', id: {} }));
  await forwarded(post({ jsonrpc: '2.0', method: 'ping' }, { 'content-type': 'text/plain' }));
});
test('query/path variants, dynamic discovery/readiness and all other methods remain live', async () => {
  for (const path of ['/mcp?token=fixture', '/mcp/', '/mcp/extra', '/.well-known/x402', '/api/nibgate/status', '/hub/stats', '/hub/ledger']) await forwarded(new Request(base + path));
  for (const method of ['OPTIONS', 'DELETE', 'PUT']) await forwarded(new Request(base + '/mcp', { method }));
  await forwarded(new Request('https://unrelated.example/mcp'));
});
test('HEAD metadata has no body and preserves representation headers', async () => {
  const result = await handle(new Request(base + '/mcp', { method: 'HEAD' }), noOrigin);
  assert.equal(await result.text(), ''); assert.equal(result.headers.get('content-type'), 'application/json; charset=utf-8');
});
