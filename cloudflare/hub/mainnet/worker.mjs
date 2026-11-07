import { drnibProxy } from './drnib-proxy.mjs';
import { DurableObject } from 'cloudflare:workers';
export class HubRenderObject extends DurableObject {
  async fetch(request) { const app = (await import('./open-next.mjs')).default; return app.fetch(request, this.env, this.ctx); }
}
const guides = new Map([['/skill.md','text/markdown; charset=utf-8'], ['/discovery.md','text/markdown; charset=utf-8'], ['/.well-known/agent-skills/index.json','application/json; charset=utf-8']]);
const contracts = new Set(['/openapi.json','/api/nibgate/status']);
const informationPages = new Set(['/privacy','/security','/faq','/terms','/cookies','/install','/quick-start','/examples','/roadmap','/extension-privacy','/payments','/discovery']);
async function handle(request, env) {
  const url = new URL(request.url);
  const previewHost = 'nibgate-hub-mainnet-candidate.fortuneze0.workers.dev';
  if (url.protocol !== 'https:' || !['nibgate.xyz', previewHost].includes(url.hostname)) return new Response('Not found', { status: 404 });
  if (url.hostname === previewHost) {
    const allowedPage = ['/', '/get-started', '/signin'].includes(url.pathname);
    const allowedAsset = /^\/(?:_next\/static|brand|fonts|illustrations)(?:\/|$)|^\/(?:favicon\.(?:ico|png)|logo\.svg|nibgate-wordmark\.svg|chrome\.svg)$/.test(url.pathname);
    if (!['GET','HEAD'].includes(request.method) || !(allowedPage || allowedAsset || guides.has(url.pathname) || contracts.has(url.pathname))) return new Response('Unavailable in public preview',{status:404,headers:{'cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'}});
    const headers = new Headers(request.headers); for (const name of ['cookie','authorization','proxy-authorization','x-forwarded-host','x-site-subdomain']) headers.delete(name);
    headers.set('host','nibgate.xyz');
    request = new Request(new URL(url.pathname + url.search, 'https://nibgate.xyz'), {method:request.method,headers,redirect:'manual'});
    const response = await handle(request,env); const out = new Response(response.body,response);out.headers.set('cache-control','private, no-store');out.headers.set('x-robots-tag','noindex, nofollow');return out;
  }
  if (guides.has(url.pathname) || contracts.has(url.pathname)) {
    if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405,headers:{allow:'GET, HEAD','cache-control':'no-store'}});
    if (guides.has(url.pathname)) {
      const asset = await env.ASSETS.fetch(new Request(new URL(url.pathname,url.origin), {method:'GET'}));
      if (!asset.ok) return new Response('Unavailable',{status:503,headers:{'cache-control':'no-store'}});
      return new Response(request.method === 'HEAD' ? null : asset.body,{status:200,headers:{'content-type':guides.get(url.pathname),'cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});
    }
    try {
      const upstream = new URL(url.pathname + url.search, 'https://api.nibgate.xyz');
      const response = await fetch(upstream,{method:'GET',headers:{accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(10000)});
      if (!response.ok || response.headers.has('set-cookie') || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('Unusable upstream');
      return new Response(request.method === 'HEAD' ? null : response.body,{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store, no-transform','x-content-type-options':'nosniff'}});
    } catch { return new Response('{"error":"API contract temporarily unavailable"}',{status:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}}); }
  }
  if (informationPages.has(url.pathname)) {
    if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405,headers:{allow:'GET, HEAD','cache-control':'no-store'}});
    try {
      const cachePath='/cdn-cgi/_next_cache/__BUILD_ID__'+url.pathname+'.cache';
      const asset=await env.ASSETS.fetch(new Request(new URL(cachePath,url.origin)));
      if (!asset.ok) throw new Error('Missing prerender');
      const cache=await asset.json(), rsc=request.headers.get('rsc')==='1';
      if (cache.type!=='app' || typeof cache.html!=='string' || typeof cache.rsc!=='string') throw new Error('Invalid prerender');
      return new Response(request.method==='HEAD'?null:(rsc?cache.rsc:cache.html),{status:200,headers:{'content-type':rsc?'text/x-component; charset=utf-8':'text/html; charset=utf-8','cache-control':'private, no-store, no-transform','vary':'RSC, Next-Router-State-Tree, Next-Router-Prefetch','x-content-type-options':'nosniff'}});
    } catch {return new Response('Temporarily unavailable',{status:503,headers:{'cache-control':'private, no-store'}})}
  }
  const drnib = await drnibProxy(request);
  if (drnib) return drnib;
  if (url.pathname.startsWith('/_next/static/')) return env.ASSETS.fetch(request);
  return env.RENDER.get(env.RENDER.idFromName('hub-mainnet-local')).fetch(request);
}
export default {fetch:handle};
