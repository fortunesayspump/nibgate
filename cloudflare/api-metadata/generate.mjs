import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const output = new URL('./metadata.json', import.meta.url);
if (!process.env.METADATA_GENERATOR_CHILD) {
  const metadata = {};
  for (const network of ['mainnet', 'testnet']) {
    const api = network === 'mainnet' ? 'https://api.nibgate.xyz' : 'https://testnet-api.nibgate.xyz';
    const child = spawnSync(process.execPath, [new URL(import.meta.url).pathname], { encoding: 'utf8', env: { PATH: process.env.PATH, METADATA_GENERATOR_CHILD: '1', NIBGATE_NETWORK: network, NIBGATE_PUBLIC_API_URL: api, PUBLIC_API_URL: api, NIBGATE_SCHEDULED_MONITORS: 'metric-cleanup', DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:1/metadata_only' } });
    if (child.status !== 0) throw Error(child.stderr || child.stdout);
    metadata[new URL(api).hostname] = JSON.parse(child.stdout);
  }
  const sourceFiles = ['backend/src/server/mcp.js', 'backend/src/server/openapi.js', 'backend/src/server/server.js', 'packages/internal/src/networks.js'];
  const sourceHash = createHash('sha256');
  for (const file of sourceFiles) sourceHash.update(await readFile(new URL('../../' + file, import.meta.url)));
  const text = JSON.stringify({ sourceSha256: sourceHash.digest('hex'), hosts: metadata }, null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (await readFile(output, 'utf8') !== text) throw Error('Metadata drift: regenerate before deployment');
  } else await writeFile(output, text);
} else {
  globalThis.fetch = () => { throw Error('Metadata generation must not perform network requests'); };
  const { db } = await import('../../packages/internal/src/db.js');
  db.$use(() => { throw Error('Metadata generation must not query the database'); });
  const { registerMcpRoute } = await import('../../backend/src/server/mcp.js');
  const { openApiSpec } = await import('../../backend/src/server/openapi.js');
  const routes = {};
  registerMcpRoute({ get: (path, handler) => { routes['GET ' + path] = handler; }, post: (path, handler) => { routes['POST ' + path] = handler; } });
  const invoke = async (route, body) => {
    let value;
    const res = { type: () => res, json: json => { value = json; return res; } };
    await routes[route]({ body }, res);
    return value;
  };
  const info = await invoke('GET /mcp');
  const card = await invoke('GET /.well-known/mcp.json');
  const list = await invoke('POST /mcp', { id: 1, method: 'tools/list' });
  await db.$disconnect();
  process.stdout.write(JSON.stringify({ info, card, tools: list.result.tools, openapi: openApiSpec }));
}
