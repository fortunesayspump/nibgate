import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch as hubDispatch } from '../policy-hub-blog.mjs';
import { dispatch as creatorDispatch } from '../policy-creator-writing.mjs';

const inner = { fetch: async request => new Response(new URL(request.url).pathname) };
const request = (host,path) => new Request(`https://${host}${path}`);

test('original Hub pages reach the application', async () => {
  for (const path of ['/explore','/leaderboards','/ledger','/dashboard/analytics','/sitemap.xml']) {
    const response = await hubDispatch(request('nibgate.xyz',path),'hub',inner,{},{});
    assert.equal(response.status,200, path);
    assert.equal(await response.text(),path);
  }
});

test('original creator media paths reach their tenant application', async () => {
  for (const path of ['/photos/sample','/music/sample','/video/sample','/docs/sample','/writing/sample']) {
    const response = await creatorDispatch(request('fixture.nibgate.xyz',path),'creator',inner,{},{});
    assert.equal(response.status,200,path);
    assert.equal(await response.text(),path);
  }
  assert.equal((await creatorDispatch(request('api.nibgate.xyz','/photos/sample'),'creator',inner,{},{})).status,404);
});
