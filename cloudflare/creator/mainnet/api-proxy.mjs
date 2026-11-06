// Experimental proxy: not registered on a Worker or connected to live data.
// The caller must select cfg from an immutable hostname map, never request input.
const routes=[
 [/^\/api\/auth\/login$/,['POST']], [/^\/api\/auth\/me$/,['GET','HEAD']],
 [/^\/api\/nibgate\/gateway\/balances$/,['GET','HEAD']],
 [/^\/api\/nibgate\/gateway\/(?:deposit|withdraw)$/,['POST']], [/^\/api\/site$/,['GET','HEAD']],
 [/^\/api\/settings$/,['GET','HEAD','PUT']], [/^\/api\/settings\/password$/,['PUT']],
 [/^\/api\/settings\/link-hub(?:\/disconnect)?$/,['POST']],
 [/^\/api\/blog\/admin\/activity$/,['GET','HEAD']],
 [/^\/api\/blog\/admin\/posts$/,['GET','HEAD','POST']],
 [/^\/api\/blog\/admin\/posts\/stats$/,['GET','HEAD']],
 [/^\/api\/blog\/admin\/posts\/[a-zA-Z0-9_-]+$/,['GET','HEAD','PUT','DELETE']],
 [/^\/api\/nibgate\/posts\/[a-zA-Z0-9_-]+\/access-control$/,['GET','HEAD','PUT']],
 [/^\/api\/nibgate\/posts\/[a-zA-Z0-9_-]+\/entitlements\/[a-zA-Z0-9_-]+$/,['DELETE']],
 [/^\/api\/nibgate\/posts\/[a-zA-Z0-9_-]+\/entitlements\/[a-zA-Z0-9_-]+\/(?:ban|revoke)$/,['POST']],
 [/^\/api\/upload$/,['POST']],
];
const SMALL=1024*1024,UPLOAD=31*1024*1024;
export async function boundedBody(body,limit){
 const reader=body.getReader(),chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();return null;}chunks.push(value);}}finally{reader.releaseLock();}
 const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}return result;
}
const responseHeaders=['content-type','content-disposition','retry-after'];
export async function adminProxy(request,cfg,fetcher=fetch){
 const u=new URL(request.url), fail=(status)=>new Response('Unavailable',{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 if(!cfg||u.hostname!==cfg.host||u.protocol!=='https:'||u.port||!routes.some(([pattern])=>pattern.test(u.pathname))||/%|\\|\/\//.test(u.pathname))return fail(404);
 const route=routes.find(([pattern])=>pattern.test(u.pathname));
 if(!route[1].includes(request.method))return fail(405);
 const isWrite=!['GET','HEAD'].includes(request.method);
 if(isWrite&&request.headers.get('origin')!==u.origin)return fail(403);
 // Ambient cookies are intentionally not forwarded; this prototype uses bearer
 // authentication only and cannot implement SIWE or session-cookie routes.
 const auth=request.headers.get('authorization');
 if(u.pathname!=='/api/auth/login'&&u.pathname!=='/api/site'&&!/^Bearer [^\s]+$/.test(auth||''))return fail(401);
 if(u.pathname==='/api/auth/login'&&request.method!=='POST')return fail(405);
 const outHeaders=new Headers({'x-site-subdomain':cfg.tenant,'x-forwarded-host':new URL(cfg.canonical).host});
 for(const key of ['authorization','content-type','accept'])if(request.headers.has(key))outHeaders.set(key,request.headers.get(key));
 const options={method:request.method,headers:outHeaders,redirect:'manual',signal:AbortSignal.timeout(30000),cf:{cacheTtl:0,cacheEverything:false}};
 try{
  if(isWrite&&request.body){const limit=u.pathname==='/api/upload'?UPLOAD:SMALL;const declared=request.headers.get('content-length');if(declared&&(!/^\d+$/.test(declared)||Number(declared)>limit))return fail(413);const bytes=await boundedBody(request.body,limit);if(bytes===null)return fail(413);options.body=bytes;}
  const r=await fetcher(cfg.origin+u.pathname+u.search,options);
  if(r.status>=300&&r.status<400){await r.body?.cancel();return fail(502);}
  const h=new Headers({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
  for(const key of responseHeaders)if(r.headers.has(key))h.set(key,r.headers.get(key));
  return new Response(request.method==='HEAD'?null:r.body,{status:r.status,headers:h});
 }catch{return fail(502);}
}
