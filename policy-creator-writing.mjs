// LOCAL ASSESSMENT ONLY: strictly scoped traffic; not a production-ready route map.
const ASSET = /^\/(?:_next\/static|brand|fonts|illustrations)(?:\/|$)/;
const HUB_PAGE = /^\/(?:|get-started|signin|dashboard(?:\/.*)?|share(?:\/.*)?)$/;
const HUB_API = /^\/(?:api\/)?(?:auth|nibshare|uploads)(?:\/|$)|^\/(?:api\/)?hub\/dashboard(?:\/|$)/;
const CREATOR_PAGE = /^\/$|^\/admin(?:\/|$)|^\/(?:writing|photos|music|video|docs)(?:\/[a-zA-Z0-9_-]{1,200})?\/?$|^\/(?:about|robots\.txt|sitemap\.xml|nibgate\.json|\.well-known\/nibgate\.json|api\/feed)$/;
const CREATOR_API = /^\/api\/(?:auth|upload)(?:\/|$)|^\/api\/blog\/admin(?:\/|$)|^\/api\/settings(?:\/|$)|^\/api\/blog\/public-site-v2$/;
function blocked(code=503) {return new Response('Temporarily unavailable',{status:code,headers:{'cache-control':'private, no-store, no-transform','x-robots-tag':'noindex, nofollow'}})}
export async function dispatch(request,scope,inner,env,ctx){
 const url=new URL(request.url); const host=url.hostname.toLowerCase(); const raw=url.pathname;
 if(url.protocol!=='https:' || (scope==='hub'?host!=='nibgate.xyz':!/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.nibgate\.xyz$/.test(host)||/^(www|api|docs|testnet|drnib|private-drnib)\./.test(host))) return blocked(404);
 // Encoded route names, repeated slashes and backslashes are withheld, rather than normalized.
 if((raw.includes('%') && !/^\/_next\/static\/(?:[a-zA-Z0-9._~\/-]|%5[bBdD])+$/.test(raw)) || raw.includes('\\') || raw.includes('//') || raw.split('/').some(s=>s==='.'||s==='..')) return blocked(400);
 if(scope==='creator' && /^\/(?:photos|music|video|docs|sitemap\.xml|api\/feed)(?:[/.]|$)/.test(raw)) return blocked();
 if(scope==='hub' && /^\/dashboard\/analytics(?:\/|$)/.test(raw)) return blocked();
 if(scope==='creator' && (raw==='/' || /^\/(?:writing|photos|music|video|docs)\//.test(raw)||raw==='/api/blog/public-site-v2') && !['GET','HEAD'].includes(request.method))return blocked();
 const asset=ASSET.test(raw) || (scope==='creator' && /^\/(?:favicon\.(?:ico|png)|logo\.svg|nibgate-(?:wordmark|mark)\.svg|combined-logo\.svg)$/.test(raw));const allow=scope==='hub'?HUB_PAGE.test(raw)||HUB_API.test(raw):CREATOR_PAGE.test(raw)||CREATOR_API.test(raw);
 if(!asset && !allow)return blocked();
 let safeRequest=request;
 if(scope==='creator'){const h=new Headers(request.headers);h.set('x-site-subdomain',host.split('.')[0]);h.set('x-forwarded-host',host);h.set('x-nibgate-verified-host',host);if(/^\/(?:writing|photos|music|video|docs)\//.test(raw)){h.delete('if-none-match');h.delete('if-modified-since');h.delete('if-range');h.delete('range');}safeRequest=new Request(request,{headers:h});}
 const target=scope==='creator' && CREATOR_API.test(raw) ? new URL(raw+url.search,'https://api-subblogs.nibgate.xyz') : null;
 const response=target ? await fetch(new Request(new Request(target,safeRequest),{redirect:'manual'})) : await inner.fetch(safeRequest,env,ctx);
 if(asset)return response;
 // Do not allow the Worker/CDN/browser to retain policy-sensitive responses.
 const out=new Response(response.body,response);out.headers.set('cache-control','private, no-store, no-transform');out.headers.delete('vercel-cdn-cache-control');out.headers.delete('cdn-cache-control');out.headers.delete('cloudflare-cdn-cache-control');if(scope==='creator' && request.headers.get('rsc')==='1')out.headers.set('x-robots-tag','noindex, nofollow');return out;
}
