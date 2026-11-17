import assert from 'node:assert/strict';
import metadata from './metadata.json' with { type: 'json' };
for (const [host, data] of Object.entries(metadata.hosts)) {
  for (const [path, expected] of Object.entries({ '/mcp': data.info, '/.well-known/mcp.json': data.card, '/openapi.json': data.openapi, '/api/openapi.json': data.openapi })) {
    const res = await fetch('https://' + host + path, { signal: AbortSignal.timeout(30000) });
    assert.equal(res.status, 200, host + path);
    assert.deepEqual(await res.json(), expected, host + path + ' metadata drift');
  }
  const res = await fetch('https://' + host + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'metadata-parity', method: 'tools/list' }), signal: AbortSignal.timeout(30000) });
  assert.deepEqual(await res.json(), { jsonrpc: '2.0', id: 'metadata-parity', result: { tools: data.tools } });
  console.log(host + ': five public metadata surfaces match backend source');
}
