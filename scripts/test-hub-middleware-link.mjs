import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dispatch } from '../policy-hub-blog.mjs';

const inner = { fetch: async () => new Response('synthetic') };
test('share middleware manifest link is preserved on mainnet and testnet', async () => {
  const main = await dispatch(new Request('https://nibgate.xyz/ns/example-1'), 'hub', inner, {}, {});
  assert.equal(main.headers.get('link'), '<https://api.nibgate.xyz/nibshare/example-1/manifest>; rel="alternate"; type="application/json"');
  const queried = await dispatch(new Request('https://nibgate.xyz/ns/example-1?ref=synthetic'), 'hub', inner, {}, {});
  assert.equal(queried.headers.get('link'), main.headers.get('link'));
  const source = (await readFile(new URL('../policy-hub-blog.mjs', import.meta.url), 'utf8')).replace("host!=='nibgate.xyz'", "host!=='testnet.nibgate.xyz'").replaceAll('https://api-subblogs.nibgate.xyz', 'https://testnet-api-subblogs.nibgate.xyz');
  const testnet = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const result = await testnet.dispatch(new Request('https://testnet.nibgate.xyz/ns/example-1'), 'hub', inner, {}, {});
  assert.equal(result.headers.get('link'), '<https://testnet-api.nibgate.xyz/nibshare/example-1/manifest>; rel="alternate"; type="application/json"');
  const ordinary = await dispatch(new Request('https://nibgate.xyz/get-started'), 'hub', inner, {}, {});
  assert.equal(ordinary.headers.get('link'), null);
});
