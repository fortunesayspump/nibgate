import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sdkVersion = JSON.parse(readFileSync(new URL('../packages/nibgate/package.json', import.meta.url))).version;
const walletVersion = JSON.parse(readFileSync(new URL('../packages/wallet/package.json', import.meta.url))).version;

const networks = ['https://api.nibgate.xyz', 'https://testnet-api.nibgate.xyz'];
for (const origin of networks) {
  const specResponse = await fetch(`${origin}/openapi.json`, { signal: AbortSignal.timeout(30000) });
  assert.equal(specResponse.status, 200, `${origin} OpenAPI HTTP status`);
  const spec = await specResponse.json();
  assert.equal(spec.info.version, '0.2.12', `${origin} OpenAPI version`);
  assert.match(spec.paths['/hub/tips/verify'].post.description, /payment-verification-pending/);
  const response = await fetch(`${origin}/mcp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'nibgate-release-check', version: '1.0' } } }),
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, `${origin} MCP HTTP status`);
  const initialize = await response.json();
  assert.equal(initialize.result.serverInfo.version, '0.2.12');
  assert.match(initialize.result.instructions, /payment-verification-pending/);
  const tools = await fetch(`${origin}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }), signal: AbortSignal.timeout(30000) });
  assert.equal(tools.status, 200);
  assert.ok((await tools.json()).result.tools.length > 0);
  const card = await fetch(`${origin}/.well-known/mcp.json`, { signal: AbortSignal.timeout(30000) });
  assert.equal(card.status, 200);
  assert.ok(JSON.stringify(await card.json()).includes('0.2.12'));
  console.log(`${origin}: OpenAPI, MCP initialize/tools/card 0.2.12 and retry reconciliation PASS`);
}
if (process.argv.includes('--clients')) {
  for (const path of ['/discovery.md', '/skill.md', '/llms.txt', '/llms-full.txt', '/.well-known/agent-skills/index.json']) {
    const response = await fetch(`https://nibgate.xyz${path}`, { signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200, path);
    const body = await response.text();
    assert.ok(!body.includes('0.4.35-testnet.0'), `${path} stale SDK prerelease`);
    assert.ok(!body.includes('0.4.25-testnet.0'), `${path} stale wallet prerelease`);
    assert.ok(!/https:\/\/(?:www\.)?nibgate\.xyz\/hub\//.test(body), `${path} legacy Hub URL`);
    if (path.endsWith('.md')) { assert.ok(body.includes(sdkVersion), `${path}: current SDK version`); assert.ok(body.includes(walletVersion), `${path}: current wallet version`); }
    console.log(`https://nibgate.xyz${path}: live stable documentation PASS`);
  }
  const docs = await fetch('https://docs.nibgate.xyz/llms.txt', { signal: AbortSignal.timeout(30000) });
  assert.equal(docs.status, 200);
  assert.ok(!/https:\/\/(?:www\.)?nibgate\.xyz\/hub\//.test(await docs.text()));
  console.log('https://docs.nibgate.xyz/llms.txt: live documentation PASS');
}
if (process.argv.includes('--npm')) {
  for (const [name, version, companion, companionVersion] of [['sdk',sdkVersion,'wallet',walletVersion], ['wallet',walletVersion,'sdk',sdkVersion]]) {
    const response = await fetch(`https://registry.npmjs.org/@nibgate%2f${name}?releasecheck=${Date.now()}`, { signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200);
    const metadata = await response.json();
    const release = metadata.versions[version];
    assert.ok(release, `${name} ${version} is publicly available`);
    assert.equal(release.dependencies[`@nibgate/${companion}`], companionVersion);
    assert.ok(!JSON.stringify(release).includes('workspace:'));
    assert.equal(metadata['dist-tags'].latest, version);
    console.log(`@nibgate/${name}@${version}: exact dependencies and latest tag PASS`);
  }
}
