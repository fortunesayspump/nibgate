import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { protectResponse } from '../frontend/src/lib/hub-security.mjs';
const source = readFileSync(new URL('../cloudflare/hub/mainnet/worker.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export class HubRenderObject', 'class HubRenderObject').replace('export default ', 'globalThis.worker = ');
const context = vm.createContext({ URL, Request, Response, Headers, protectResponse, DurableObject: class {}, drnibProxy: async () => null });
vm.runInContext(source, context);
const env = { RENDER: { idFromName: x => x, get: () => ({ fetch: async () => new Response('unchanged renderer') }) } };
const fetch = (url, method = 'GET') => context.worker.fetch(new Request(url, {method}), env);
test('exact mainnet game GET/HEAD redirects to fixed Short without forwarding query', async () => {
  for (const path of ['/game', '/game/', '/game?next=https://evil.example&secret=discard']) for (const method of ['GET','HEAD']) {
    const r = await fetch('https://nibgate.xyz' + path, method);
    assert.equal(r.status,302); assert.equal(r.headers.get('location'),'https://youtube.com/shorts/s2LnG-RJ2fs?feature=share');
    assert.equal(r.headers.get('cache-control'),'no-store'); assert.equal(await r.text(),'');
    assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  }
});
test('non-read game methods are not redirected', async () => {
  for (const method of ['POST','PUT','DELETE','OPTIONS']) {
    const r=await fetch('https://nibgate.xyz/game',method); assert.equal(r.status,405); assert.equal(r.headers.get('location'),null); assert.equal(r.headers.get('allow'),'GET, HEAD');
  }
});
test('host/protocol/preview guards and all other paths remain unchanged', async () => {
  for (const url of ['http://nibgate.xyz/game','https://testnet.nibgate.xyz/game','https://evil.example/game','https://nibgate-hub-mainnet-candidate.fortuneze0.workers.dev/game']) {
    const r=await fetch(url); assert.equal(r.status,404); assert.equal(r.headers.get('location'),null);
  }
  for (const path of ['/','/game/child','/games','/Game']) { const r=await fetch('https://nibgate.xyz'+path); assert.equal(r.status,200); assert.equal(await r.text(),'unchanged renderer'); }
});
