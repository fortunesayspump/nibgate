import { DurableObject } from 'cloudflare:workers';
import hosts from './hosts.json';
import { adminProxy } from './api-proxy.mjs';
import { readerProxy } from './reader-proxy.mjs';
import app from '../../../subblogs/frontend/migration-wrapper.mjs';
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from '../../../subblogs/frontend/migration-wrapper.mjs';

const allowedHosts = new Set([...hosts, 'lowfi.nibgate.xyz']);
const readerPath = /^\/api\/auth\/(?:nonce|verify|session|logout)$|^\/api\/nibgate\/(?:access|preflight|manifest|gateway\/balance)$|^\/api\/nibgate\/posts\/[a-zA-Z0-9_-]{1,200}\/quote$|^\/api\/nibgate\/media\/[a-zA-Z0-9_-]{1,200}\/(?:audio|photo|video|document(?:\/(?:preview|render))?)$|^\/api\/(?:writing|photos|music|video|docs)\/[a-zA-Z0-9_-]{1,200}$/;
const allowedPath = /^\/admin(?:\/|$)|^\/api\/(?:auth\/(?:login|me)|site|nibgate\/gateway\/(?:balances|deposit|withdraw)|settings(?:\/.*)?|blog\/admin(?:\/.*)?|nibgate\/posts(?:\/.*)?|upload)$|^\/$|^\/(?:writing|photos|music|video|docs)(?:\/[a-zA-Z0-9_-]{1,200})?\/?$|^\/(?:about|robots\.txt|sitemap\.xml|nibgate\.json|\.well-known\/nibgate\.json|api\/feed)$|^\/(?:_next\/static|brand|fonts|illustrations)(?:\/|$)|^\/(?:favicon\.(?:ico|png)|logo\.svg|nibgate-(?:wordmark|mark)\.svg|combined-logo\.svg)$|^\/api\/blog\/public-site-v2$/;
const safeAsset = /^\/_next\/static\/(?:[a-zA-Z0-9._~\/-]|%5[bBdD])+$/;
function denied() { return new Response('Unavailable', {status:404,headers:{'cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'}}); }
export class RenderObject extends DurableObject {
  async fetch(request) {
    if (!allowedHosts.has(new URL(request.url).hostname)) return denied();
    return app.fetch(request, this.env, this.ctx);
  }
}
export default {
  async fetch(request, env) {
    const u = new URL(request.url), p = u.pathname, host = u.hostname;
    if (u.protocol !== 'https:' || !allowedHosts.has(host) || !(allowedPath.test(p) || readerPath.test(p)) || p.includes('\\') || p.includes('//') || (p.includes('%') && !safeAsset.test(p))) return denied();
    if (readerPath.test(p)) return readerProxy(request, {host, tenant:host.split('.')[0], canonical:'https://' + host, origin:'https://api-subblogs.nibgate.xyz'});
    if (/^\/api\/(?:auth\/(?:login|me)|site|nibgate\/gateway\/(?:balances|deposit|withdraw)|settings(?:\/.*)?|blog\/admin(?:\/.*)?|nibgate\/posts(?:\/.*)?|upload)$/.test(p)) {
      return adminProxy(request, {host, tenant:host.split('.')[0], canonical:'https://' + host, origin:'https://api-subblogs.nibgate.xyz'});
    }
    if (!['GET','HEAD'].includes(request.method)) return denied();
    const h = new Headers(request.headers);
    for (const name of ['cookie','authorization','proxy-authorization','x-site-subdomain','x-forwarded-host','x-nibgate-verified-host']) h.delete(name);
    h.set('host',host);
    const safe = new Request(new URL(p + u.search, 'https://' + host), {method:request.method,headers:h,redirect:'manual'});
    const response = p.startsWith('/_next/static/') ? await env.ASSETS.fetch(safe) : await env.RENDER.get(env.RENDER.idFromName(host)).fetch(safe);
    const out = new Response(response.body,response);
    out.headers.set('x-robots-tag','noindex, nofollow');
    out.headers.set('cache-control','private, no-store');
    return out;
  }
};
