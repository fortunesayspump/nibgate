import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function creator(kind, response=()=>new Response('ok')) {
 const source=read(`cloudflare/creator/${kind}/worker.mjs`).replace(/^import .*;\n/gm,'').replace(/^export \{.*;\n/gm,'').replace('export class RenderObject','class RenderObject').replace('export default','return');
 const worker=new Function('DurableObject','hosts','app','adminProxy','publicSite','readerProxy','tenantFromHost',source)(class {},['shelflife.nibgate.xyz'],{},()=>new Response('admin'),async()=>({subdomain:'shelflife'}),()=>new Response('reader'),h=>h==='shelflife.nibgate.xyz'?'shelflife':null);
 const env={ASSETS:{fetch:async()=>response()},RENDER:{idFromName:x=>x,get:()=>({fetch:async()=>response()})}};
 return (path,options={})=>worker.fetch(new Request('https://shelflife.nibgate.xyz'+path,options),env);
}
for(const kind of ['mainnet','wildcard']) {
 test(`${kind}: legacy sitemap GET/HEAD redirects only to canonical, retaining query`,async()=>{
  for(const method of ['GET','HEAD']) {const r=await creator(kind)('/sitemap.xml/?x=1',{method});assert.equal(r.status,308);assert.equal(r.headers.get('location'),'https://shelflife.nibgate.xyz/sitemap.xml?x=1');}
  assert.equal((await creator(kind)('/sitemap.xml/',{method:'POST'})).status,404);
 });
 test(`${kind}: public mainnet HTML and sitemap stop receiving blanket noindex`,async()=>{
  for(const p of ['/','/writing','/writing/post','/photos/photo','/music','/video','/docs/doc','/about']) {
   const r=await creator(kind,()=>new Response('public',{headers:{'content-type':'text/html; charset=utf-8'}}))(p);
   assert.equal(r.headers.get('x-robots-tag'),null,p);assert.equal(r.headers.get('cache-control'),'private, no-store');
  }
  const xml=await creator(kind,()=>new Response('<urlset/>',{headers:{'content-type':'application/xml'}}))('/sitemap.xml');assert.equal(xml.headers.get('x-robots-tag'),null);
  assert.equal((await creator(kind,()=>new Response('private',{headers:{'content-type':'text/html','x-robots-tag':'noindex, nofollow'}}))('/writing/post')).headers.get('x-robots-tag'),'noindex, nofollow');
  for(const options of [{headers:{rsc:'1'}},{headers:{'next-router-prefetch':'1'}}]) assert.equal((await creator(kind,()=>new Response('component',{headers:{'content-type':'text/html'}}))('/writing/post',options)).headers.get('x-robots-tag'),'noindex, nofollow');
  assert.equal((await creator(kind,()=>new Response('component',{headers:{'content-type':'text/html'}}))('/writing/post?_rsc=1')).headers.get('x-robots-tag'),'noindex, nofollow');
  assert.equal((await creator(kind,()=>new Response('session',{headers:{'content-type':'text/html','set-cookie':'session=placeholder'}}))('/writing/post')).headers.get('x-robots-tag'),'noindex, nofollow');
 });
 test(`${kind}: private, error and disallowed pages remain excluded`,async()=>{
  assert.equal((await creator(kind)('/admin')).headers.get('x-robots-tag'),'noindex, nofollow');
  assert.equal((await creator(kind,()=>new Response('missing',{status:404}))('/writing/gone')).headers.get('x-robots-tag'),'noindex, nofollow');
  for(const p of ['/sitemap.xml//','/unknown','/sitemap.xml/other'])assert.equal((await creator(kind)(p)).status,404);
 });
}
test('Hub redirects legacy sitemap variants before inner app; other guards unchanged',async()=>{
 const source=read('policy-hub-blog.mjs').replace(/^import .*;\n/gm,'').replace('export async function dispatch','async function dispatch')+'\nreturn dispatch;';
 const dispatch=new Function('pageSecurityHeaders','protectResponse',source)(()=>({headers:{}}),r=>r);
 const inner={fetch:()=>new Response('ok')};
 for(const path of ['/sitemap.xml/','/all-content-sitemap.xml/']){
  const r=await dispatch(new Request('https://nibgate.xyz'+path+'?x=1'),'hub',inner,{},{});assert.equal(r.status,308);assert.equal(r.headers.get('location'),'https://nibgate.xyz'+path.slice(0,-1)+'?x=1');
 }
 assert.equal((await dispatch(new Request('https://evil.example/sitemap.xml/'),'hub',inner,{},{})).status,404);
 assert.equal((await dispatch(new Request('https://nibgate.xyz/sitemap.xml/',{method:'POST'}),'hub',inner,{},{})).status,503);
 assert.equal((await dispatch(new Request('https://nibgate.xyz/sitemap.xml'),'hub',inner,{},{})).status,200);
});
test('GSC submission and inspection use slashless canonical sitemap paths',()=>{
 for(const p of ['backend/src/server/hub/gsc-index.js','backend/src/server/hub/gsc-sitemap.js']) {
  const s=read(p);assert.ok(s.includes('`https://${domain}/sitemap.xml`'));assert.ok(!s.includes('`https://${domain}/sitemap.xml/`'));
 }
});
test('actual Hub dispatch + security module preserve redirect and page behavior',async()=>{
 const {dispatch}=await import('../policy-hub-blog.mjs');
 const inner={fetch:async()=>new Response('public')};
 const r=await dispatch(new Request('https://nibgate.xyz/sitemap.xml/'),'hub',inner,{},{});
 assert.equal(r.status,308);assert.equal(r.headers.get('location'),'https://nibgate.xyz/sitemap.xml');
 const ok=await dispatch(new Request('https://nibgate.xyz/sitemap.xml'),'hub',inner,{},{});
 assert.equal(ok.status,200);assert.equal(ok.headers.get('x-content-type-options'),'nosniff');assert.ok(ok.headers.has('content-security-policy'));assert.equal(ok.headers.get('x-robots-tag'),null);
});
test('actual docs staging emits legacy sitemap redirect and keeps XML header',async()=>{
 const {mkdtemp,mkdir,readFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {execFileSync}=await import('node:child_process');
 const temp=await mkdtemp(join(tmpdir(),'nibgate-seo-docs-'));
 try {await mkdir(join(temp,'out'));execFileSync(process.execPath,[new URL('../docs/scripts/stage-cloudflare-static.mjs',import.meta.url).pathname],{cwd:temp});assert.equal(await readFile(join(temp,'out/_redirects'),'utf8'),'/sitemap.xml/ /sitemap.xml 308\n');assert.match(await readFile(join(temp,'out/_headers'),'utf8'),/Content-Type: application\/xml/);}finally{await rm(temp,{recursive:true,force:true});}
});

