import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dispatch } from '../policy-hub-blog.mjs';

const publicPages = [
 '/', '/get-started', '/signin', '/explore', '/explore/articles', '/explore/images',
 '/explore/music', '/explore/video', '/explore/documents', '/explore/products',
 '/explore/categories', '/explore/wishlists', '/explore/creators', '/explore/agent-routes',
 '/explore/writing', '/explore/hot-new', '/explore/best-sellers', '/leaderboards',
 '/blog', '/blog/example', '/share', '/share/mine', '/share/edit/example', '/ns', '/ns/example',
 '/ledger', '/dr-nib/research', '/dr-nib/research/example/report', '/pending-tips',
 '/pending-tips/claim', '/dashboard', '/dashboard/analytics', '/dashboard/sites',
 '/dashboard/contents', '/dashboard/profile', '/dashboard/earnings', '/dashboard/blog',
 '/payments', '/discovery', '/privacy', '/security', '/faq', '/terms', '/cookies',
 '/install', '/quick-start', '/examples', '/roadmap', '/extension-privacy',
 '/llms.txt', '/llms-full.txt', '/.well-known/llms.txt', '/.well-known/llms-full.txt', '/robots.txt', '/sitemap.xml', '/all-content-sitemap.xml',
];
const apiPaths = [
 '/hub/explore/content?q=article', '/hub/reputation/leaderboards?type=content', '/hub/stats',
 '/hub/ledger', '/hub/dashboard/analytics', '/hub/tips', '/hub/evt', '/auth/me',
 '/nibshare/example', '/newsletter/subscribe', '/uploads/example', '/app/example',
 '/api/hub/explore/content', '/api/auth/me', '/api/nibgate/status', '/api/blog/posts',
 '/blog/admin/posts', '/api/blog/admin/posts', '/rpc', '/api/rpc', '/openapi.json',
];
function handler(status = 200) {
 const seen=[];
 return {seen, inner:{async fetch(request){seen.push(request);return new Response('original handler',{status,headers:{'cache-control':'public, max-age=500','cdn-cache-control':'max-age=500','set-cookie':'unit-test=only; Secure; HttpOnly'}});}}};
}

test('all pre-migration Hub page routes reach their existing handlers',async()=>{
 for (const path of publicPages) {
  const h=handler(); const response=await dispatch(new Request('https://nibgate.xyz'+path),'hub',h.inner,{},{});
  assert.equal(response.status,200,path);assert.equal(h.seen.length,1,path);
  assert.equal(response.headers.get('cache-control'),'private, no-store, no-transform',path);
  assert.equal(response.headers.get('cdn-cache-control'),null,path);
 }
});
test('existing Hub API rewrites receive requests without changing authentication or bodies',async()=>{
 for(const path of apiPaths){
  const h=handler(401);const request=new Request('https://nibgate.xyz'+path,{method:'POST',headers:{cookie:'unit-test=only',authorization:'Bearer synthetic-test','content-type':'application/json'},body:'{"synthetic":true}'});
  const response=await dispatch(request,'hub',h.inner,{},{});
  assert.equal(response.status,401,path);assert.equal(h.seen.length,1,path);
  assert.equal(h.seen[0].headers.get('authorization'),'Bearer synthetic-test',path);
  assert.equal(h.seen[0].headers.get('cookie'),'unit-test=only',path);
  assert.equal(await h.seen[0].text(),'{"synthetic":true}',path);
  assert.equal(response.headers.get('set-cookie'),'unit-test=only; Secure; HttpOnly',path);
 }
});
test('restoration does not override original content or payment access denials',async()=>{
 for(const status of [401,402,403,404,429,503]){
  const h=handler(status);const response=await dispatch(new Request('https://nibgate.xyz/nibshare/example'),'hub',h.inner,{},{});
  assert.equal(response.status,status);assert.equal(await response.text(),'original handler');
 }
});
test('cross-network, unknown and encoded routes retain migration guards',async()=>{
 for(const url of ['https://testnet.nibgate.xyz/explore','https://other.example/explore','http://nibgate.xyz/explore','https://nibgate.xyz/internal-secret','https://nibgate.xyz/explore/unknown','https://nibgate.xyz/%65xplore','https://nibgate.xyz/explore//articles']){
  const h=handler();const response=await dispatch(new Request(url),'hub',h.inner,{},{});
  assert.ok([400,404,503].includes(response.status),url);assert.equal(h.seen.length,0,url);
 }
});
test('restored public assets reach existing asset/application handling',async()=>{
 for(const path of ['/widget.js','/logo.svg','/chrome.svg','/nibgate-wordmark.svg','/favicon.ico','/icon.png','/apple-icon.png','/_next/static/chunks/app/%5Bid%5D/page.js']){
  const h=handler();const response=await dispatch(new Request('https://nibgate.xyz'+path),'hub',h.inner,{},{});
  assert.equal(response.status,200,path);assert.equal(h.seen.length,1,path);
 }
});
test('testnet build host pinning still works with restored routes',async()=>{
 const source=(await readFile(new URL('../policy-hub-blog.mjs',import.meta.url),'utf8')).replace("host!=='nibgate.xyz'","host!=='testnet.nibgate.xyz'").replaceAll('https://api-subblogs.nibgate.xyz','https://testnet-api-subblogs.nibgate.xyz');
 const policy=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const h=handler();assert.equal((await policy.dispatch(new Request('https://testnet.nibgate.xyz/explore'),'hub',h.inner,{},{})).status,200);
 assert.equal((await policy.dispatch(new Request('https://nibgate.xyz/explore'),'hub',h.inner,{},{})).status,404);
});
test('the four restored navigation components exactly match the pre-migration release',async()=>{
 for(const name of ['Header','Hero','Features','Footer']){
  const path=`frontend/src/components/${name}.tsx`;
  const original=execFileSync('git',['show',`8e8e54a6fb3e3a9e50dd52b541367de660a36cc5:${path}`],{encoding:'utf8'});
  assert.equal(await readFile(new URL('../'+path,import.meta.url),'utf8'),original,name);
 }
});
test('analytics restoration keeps honest unavailable states instead of old fabricated arrays',async()=>{
 const source=await readFile(new URL('../frontend/src/app/dashboard/analytics/page.tsx',import.meta.url),'utf8');
 assert.match(source,/TRAFFIC_SOURCES[^\n]*= \[\]/);
 assert.ok(!source.includes('const RETENTION_COHORTS'));
 assert.match(source,/Retention cohort data is unavailable/);
 for(const network of ['mainnet','testnet']){
  const worker=await readFile(new URL(`../cloudflare/hub/${network}/worker.mjs`,import.meta.url),'utf8');
  assert.ok(!worker.includes('Withhold the legacy analytics page'));
  assert.match(worker,/const drnib = await drnibProxy\(request\)/);
 }
});

// Keep the restoration inventory complete as original application pages evolve.
test('every checked-in Hub page and route is allowed by migration policy',async()=>{
 const root=new URL('../frontend/src/app/',import.meta.url);
 async function visit(dir,prefix=''){
  for(const entry of await readdir(dir,{withFileTypes:true})){
   if(entry.isDirectory())await visit(new URL(entry.name+'/',dir),prefix+'/'+entry.name);
   else if(entry.name==='page.tsx'||entry.name==='route.ts'){
    const path=(prefix||'/').replace(/\[[^/]+\]/g,'example');
    const h=handler();
    assert.equal((await dispatch(new Request('https://nibgate.xyz'+path),'hub',h.inner,{},{})).status,200,path);
   }
  }
 }
 await visit(root);
});
