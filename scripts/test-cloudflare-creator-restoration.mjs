// Local routing tests only. Synthetic responses never enter the product or live API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { dispatch } from '../policy-creator-writing.mjs';

for (const network of ['mainnet', 'testnet']) {
  const base = new URL(`../cloudflare/creator/${network}/`, import.meta.url);
  const { adminProxy } = await import(new URL('api-proxy.mjs', base));
  const { readerProxy } = await import(new URL('reader-proxy.mjs', base));
  const source = await fs.readFile(new URL('worker.mjs', base), 'utf8');
  const hosts = JSON.parse(await fs.readFile(new URL('../cloudflare/creator/mainnet/hosts.json', import.meta.url)));
  const host = network === 'mainnet' ? 'goldenhour.nibgate.xyz' : 'jeff.testnet.nibgate.xyz';
  const canonical = `https://${host}`;
  const cfg = { host, tenant: host.split('.')[0], canonical, origin: network === 'mainnet' ? 'https://api-subblogs.nibgate.xyz' : 'https://testnet-api-subblogs.nibgate.xyz' };
  function outer(admin, reader) {
    const code = source.replace(/^import .*;\n/gm, '').replace(/^export \{.*\n/gm, '').replace('export class RenderObject', 'class RenderObject').replace('export default', 'const worker =');
    return new Function('DurableObject', 'hosts', 'app', 'adminProxy', 'readerProxy', `${code}\nreturn worker;`)(class {}, hosts, {}, admin, reader);
  }
  test(`${network}: existing page routes reach render with trusted host only`, async () => {
    const rendered = [];
    const worker = outer(() => assert.fail('Unexpected admin proxy'), () => assert.fail('Unexpected reader proxy'));
    const env = { RENDER: { idFromName: x => x, get: x => ({ fetch: async req => { assert.equal(x, host); rendered.push(req); return new Response('test render'); } }) } };
    for (const path of ['/about', '/writing', '/photos', '/music', '/video', '/docs', '/photos/example', '/music/example', '/video/example', '/docs/example', '/api/feed', '/nibgate.json', '/.well-known/nibgate.json', '/robots.txt', '/sitemap.xml']) {
      const response = await worker.fetch(new Request(canonical + path, { headers: { cookie: 'sb_auth_session=secret', authorization: 'Bearer secret', 'x-site-subdomain': 'other', 'x-forwarded-host': 'other.nibgate.xyz' } }), env);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('cache-control'), /no-store/);
      const req = rendered.at(-1);
      assert.equal(req.headers.get('host'), host);
      for (const name of ['cookie', 'authorization', 'x-site-subdomain', 'x-forwarded-host']) assert.equal(req.headers.get(name), null);
    }
    const count = rendered.length;
    for (const path of ['/photos/a/b', '/unknown', '/api/setup', '/api/auth/register', '/api/rating/example', '/photos/%61', '/photos//a']) assert.equal((await worker.fetch(new Request(canonical + path), env)).status, 404, path);
    assert.equal((await worker.fetch(new Request('https://unknown.nibgate.xyz/photos'), env)).status, 404);
    assert.equal((await worker.fetch(new Request(canonical + '/photos', { method: 'POST' }), env)).status, 404);
    assert.equal(rendered.length, count);
    if (network === 'testnet') assert.equal((await worker.fetch(new Request(canonical + '/api/upload', { method: 'POST' }), env)).status, 404);
  });
  test(`${network}: restored APIs use existing proxies, credentials and origin guards`, async () => {
    const sent = [];
    const fetcher = async (url, options) => { sent.push({ url, options }); return new Response('{}', { headers: { 'content-type': 'application/json' } }); };
    const worker = outer((req, config) => adminProxy(req, config, fetcher), (req, config) => readerProxy(req, config, fetcher));
    for (const [path, method] of [['/api/auth/me', 'GET'], ['/api/nibgate/gateway/balances', 'GET'], ['/api/nibgate/gateway/deposit', 'POST'], ['/api/nibgate/gateway/withdraw', 'POST']]) {
      const request = headers => new Request(canonical + path, { method, headers });
      assert.equal((await worker.fetch(request({ origin: canonical }), {})).status, 401);
      if (method === 'POST') assert.equal((await worker.fetch(request({ authorization: 'Bearer test', origin: 'https://other.nibgate.xyz' }), {})).status, 403);
      assert.equal((await worker.fetch(request({ authorization: 'Bearer test', origin: canonical, 'x-site-subdomain': 'other', cookie: 'unrelated=test' }), {})).status, 200);
      assert.equal(sent.at(-1).url, cfg.origin + path);
      assert.equal(sent.at(-1).options.headers.get('x-site-subdomain'), cfg.tenant);
      assert.equal(sent.at(-1).options.headers.get('cookie'), null);
      assert.equal(sent.at(-1).options.headers.get('authorization'), 'Bearer test');
    }
    for (const [path, method] of [['/api/nibgate/manifest', 'GET'], ['/api/nibgate/preflight', 'POST']]) {
      const req = headers => new Request(canonical + path, { method, headers });
      if (method === 'POST') assert.equal((await worker.fetch(req({ origin: 'https://other.nibgate.xyz' }), {})).status, 403);
      assert.equal((await worker.fetch(req({ origin: canonical, cookie: 'sb_auth_session=test; unrelated=test', 'x-site-subdomain': 'other', 'x-nibgate-ownership-signature': 'test-proof' }), {})).status, 200);
      assert.equal(sent.at(-1).url, cfg.origin + path);
      assert.equal(sent.at(-1).options.headers.get('x-site-subdomain'), cfg.tenant);
      assert.equal(sent.at(-1).options.headers.get('cookie'), 'sb_auth_session=test');
      if (method === 'POST') assert.equal(sent.at(-1).options.headers.get('x-nibgate-ownership-signature'), 'test-proof');
    }
    assert.equal((await readerProxy(new Request(canonical + '/api/nibgate/manifest', { method: 'POST', headers: { origin: canonical } }), cfg, fetcher)).status, 405);
    const challenge = await readerProxy(new Request(canonical + '/api/docs/paid'), cfg, async () => new Response('locked', { status: 402, headers: { 'payment-required': 'test-challenge' } }));
    assert.equal(challenge.status, 402);
    assert.equal(challenge.headers.get('payment-required'), 'test-challenge');
    assert.match(challenge.headers.get('cache-control'), /no-store/);
    assert.equal((await readerProxy(new Request(canonical + '/api/auth/nonce'), cfg, async () => new Response('{}', { headers: { 'set-cookie': 'sb_auth_nonce=test; Domain=nibgate.xyz; Secure; HttpOnly; SameSite=Lax; Path=/' } }))).status, 502);
  });
}

test('inner policy permits restored mainnet pages and preserves fresh tenant-bound renders', async () => {
  const seen = [];
  const app = { fetch: async request => { seen.push(request); return new Response('test render', { headers: { 'cdn-cache-control': 'public' } }); } };
  for (const path of ['/about', '/photos', '/music', '/video', '/docs', '/photos/example', '/music/example', '/video/example', '/docs/example', '/api/feed', '/nibgate.json', '/.well-known/nibgate.json', '/robots.txt', '/sitemap.xml']) {
    const response = await dispatch(new Request('https://goldenhour.nibgate.xyz' + path, { headers: { 'x-site-subdomain': 'other', range: 'bytes=0-1', 'if-none-match': 'test' } }), 'creator', app, {}, {});
    assert.equal(response.status, 200, path);
    assert.equal(seen.at(-1).headers.get('x-site-subdomain'), 'goldenhour');
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(response.headers.get('cdn-cache-control'), null);
    if (/^\/(photos|music|video|docs)\//.test(path)) {
      assert.equal(seen.at(-1).headers.get('range'), null);
      assert.equal(seen.at(-1).headers.get('if-none-match'), null);
      assert.equal((await dispatch(new Request('https://goldenhour.nibgate.xyz' + path, { method: 'POST' }), 'creator', app, {}, {})).status, 503);
    }
  }
  // Deliberately retain the original testnet deployment gate until its API/build configuration is verified.
  assert.equal((await dispatch(new Request('https://jeff.testnet.nibgate.xyz/photos'), 'creator', app, {}, {})).status, 404);
});

test('restored frontend uses original implemented contracts with no-store', async () => {
  const read = path => fs.readFile(new URL('../subblogs/frontend/src/' + path, import.meta.url), 'utf8');
  const home = await read('app/page.tsx');
  const writing = await read('app/writing/page.tsx');
  const article = await read('app/[type]/[slug]/page.tsx');
  const layout = await read('app/layout.tsx');
  const header = await read('components/Header.tsx');
  for (const source of [home, writing, article, layout, header]) assert.doesNotMatch(source, /public-(?:home|article|site)-v2/);
  assert.match(home, /"\/blog\/posts-by-types", \{ cache: "no-store" \}/);
  assert.match(home, /extractFirstImage\(post\.bodyMarkdown \|\| ""/);
  assert.match(writing, /\/blog\/posts\?type=\$\{TYPE\}&limit=50/);
  assert.match(article, /\/blog\/posts\/\$\{encodeURIComponent\(slug\)\}/);
  assert.match(article, /typeMap\[post\.type\] !== type/);
  assert.match(article, /const gated = isPremium \|\| post\.publicAccess === false/);
  assert.match(layout, /serverFetch\("\/site", \{ cache: "no-store" \}/);
  assert.match(header, /serverFetch.*\("\/site", \{ cache: "no-store" \}/);
  assert.match(header, /<HeaderClient siteName=\{data\?\.site\?\.name \|\| "Nibgate"\} \/>/);
  const client = await read('components/HeaderClient.tsx');
  assert.doesNotMatch(client, /fetch\(|apiFetch|verifyToken|hubToken|widgetScript/);
});

test('current publicPost contract redacts paid and invite-only bodies for every restored type', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { publicPost } = require('../subblogs/backend/src/controllers/public-post.js');
  const privateFields = ['bodyMarkdown', 'body', 'media', 'audioUrl', 'videoUrl', 'documentUrl', 'audioStorageRef', 'videoStorageRef', 'documentStorageRef', 'contentKey', 'bodyStorageRef', 'audioEncryptedKey', 'videoEncryptedKey', 'documentEncryptedKey', 'whitelist'];
  for (const type of ['article', 'photo', 'music', 'video', 'document']) {
    for (const policy of [{ price: '1', publicAccess: true }, { price: '0', publicAccess: false }]) {
      const input = { id: 'test', type, title: 'Test only', ...policy, ...Object.fromEntries(privateFields.map(key => [key, 'private test fixture'])) };
      const result = publicPost(input);
      assert.equal(result.title, input.title);
      assert.equal(result.type, type);
      for (const field of privateFields) assert.equal(field in result, false, `${type}: ${field}`);
      assert.equal(input.bodyMarkdown, 'private test fixture');
    }
    const free = publicPost({ type, price: '0', publicAccess: true, bodyMarkdown: 'Public test fixture', contentKey: 'private test fixture' });
    assert.equal(free.bodyMarkdown, 'Public test fixture');
    assert.equal('contentKey' in free, false);
  }
});

test('public site metadata remains anonymous through existing proxy, settings remain authenticated', async () => {
  const { adminProxy } = await import('../cloudflare/creator/mainnet/api-proxy.mjs');
  const cfg = { host: 'goldenhour.nibgate.xyz', tenant: 'goldenhour', canonical: 'https://goldenhour.nibgate.xyz', origin: 'https://api-subblogs.nibgate.xyz' };
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++;
    assert.equal(url, cfg.origin + '/api/site');
    assert.equal(options.headers.get('x-site-subdomain'), 'goldenhour');
    return Response.json({ success: true, site: { name: 'Test only' } });
  };
  assert.equal((await adminProxy(new Request(cfg.canonical + '/api/site'), cfg, fetcher)).status, 200);
  assert.equal((await adminProxy(new Request(cfg.canonical + '/api/settings'), cfg, fetcher)).status, 401);
  assert.equal(calls, 1);
});

test('existing discovery, related links and tipping restore without browser site credentials', async () => {
  const read = path => fs.readFile(new URL('../subblogs/frontend/src/' + path, import.meta.url), 'utf8');
  const home = await read('app/page.tsx');
  const article = await read('app/[type]/[slug]/page.tsx');
  const tip = await read('components/NibgateTip.tsx');
  assert.match(home, /href=\{sectionHref\(type\)\}/);
  assert.match(home, /View all \{label\}/);
  for (const key of ['resource-id', 'title', 'type', 'price', 'path', 'image', 'access', 'manifest']) assert.ok(article.includes(`'nibgate:${key}'`), key);
  assert.match(article, /<article data-nibgate-resource/);
  assert.match(article, /<link rel="alternate" type="application\/json" href=\{manifestUrl\}/);
  assert.match(article, /\/blog\/posts\?type=\$\{encodeURIComponent\(post.type\)\}&limit=6`, \{ cache: "no-store" \}/);
  assert.match(article, /filter\(\(p\) => p.id !== post.id\).slice\(0, 5\)/);
  assert.match(article, /<NibgateTip resource=\{tipResource\} recipient=\{recipientWallet\}/);
  assert.match(article, /<NibgateTipRow resource=\{tipResource\} recipient=\{recipientWallet\}/);
  assert.match(article, /Ratings are temporarily unavailable/);
  assert.doesNotMatch(article, /<ReputationRating/);
  assert.doesNotMatch(tip, /apiFetch|fetch\(|useEffect|verifyToken|hubToken|widgetScript/);
  assert.match(tip, /NibgateTipCard resource=\{resource\} recipient=\{recipient \|\| undefined\}/);
});
