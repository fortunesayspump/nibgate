import {boundedBody} from './api-proxy.mjs';
// Synthetic-only reader transport experiment. Not registered with a Worker.
const authPaths=new Map([['/api/auth/nonce','GET'],['/api/auth/verify','POST'],['/api/auth/session','GET'],['/api/auth/logout','POST']]);
const access=/^\/api\/(?:writing|photos|music|video|docs)\/[a-zA-Z0-9_-]{1,200}$/;
const quote=/^\/api\/nibgate\/posts\/[a-zA-Z0-9_-]{1,200}\/quote$/;
const media=/^\/api\/nibgate\/media\/[a-zA-Z0-9_-]{1,200}\/(?:audio|photo|video|document(?:\/(?:preview|render))?)$/;
const cookieNames=new Set(['sb_auth_nonce','sb_auth_session']);
function selectCookies(raw){
 const result=[];const seen=new Set();
 for(const part of (raw||'').split(';')){const i=part.indexOf('=');if(i<0)continue;const name=part.slice(0,i).trim(),value=part.slice(i+1).trim();if(!cookieNames.has(name))continue;if(seen.has(name)||!/^[A-Za-z0-9._~-]{0,8192}$/.test(value))throw Error('Invalid cookie');seen.add(name);result.push(`${name}=${value}`);}
 return result.join('; ');
}
function safeSetCookie(value){
 const parts=value.split(';').map(x=>x.trim());const first=parts[0].match(/^(sb_auth_nonce|sb_auth_session)=([A-Za-z0-9._~-]{0,8192})$/);if(!first)return null;
 if(parts.some(x=>/^domain\s*=/i.test(x)))return null;
 if(!parts.some(x=>/^secure$/i.test(x))||!parts.some(x=>/^httponly$/i.test(x))||!parts.some(x=>/^samesite=lax$/i.test(x))||!parts.some(x=>/^path=\/$/i.test(x)))return null;
 if(parts.some(x=>/[\r\n]/.test(x)))return null;return value;
}
export async function readerProxy(request,cfg,fetcher=fetch){
 const u=new URL(request.url),bad=status=>new Response('Unavailable',{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 if(!cfg||u.protocol!=='https:'||u.hostname!==cfg.host||u.port||/%|\\|\/\//.test(u.pathname))return bad(404);
 const isAuth=authPaths.has(u.pathname),isBalance=u.pathname==='/api/nibgate/gateway/balance',isPreflight=u.pathname==='/api/nibgate/preflight',isManifest=u.pathname==='/api/nibgate/manifest',isAccess=access.test(u.pathname)||media.test(u.pathname)||quote.test(u.pathname)||u.pathname==='/api/nibgate/access';if(!isAuth&&!isAccess&&!isBalance&&!isPreflight&&!isManifest)return bad(404);
 if(request.method!==(isAuth?authPaths.get(u.pathname):(isBalance||isPreflight)?'POST':'GET'))return bad(405);
 if(request.method==='POST'&&request.headers.get('origin')!==u.origin)return bad(403);
 if(u.search.length>2048||request.headers.get('authorization'))return bad(400);
 let cookies;try{cookies=selectCookies(request.headers.get('cookie'));}catch{return bad(400);}
 const headers=new Headers({'x-site-subdomain':cfg.tenant,'x-forwarded-host':new URL(cfg.canonical).host});
 if(cookies)headers.set('cookie',cookies);
 for(const key of ['accept','content-type',...((isAccess||isPreflight)?['payment-signature','payment-memo','x-nibgate-transfer-tx','x-nibgate-tx-owner','x-nibgate-payment-proof','x-nibgate-ownership-signature','range']:[])]){
  const value=request.headers.get(key);if(value){if(value.length>32768)return bad(413);headers.set(key,value);}
 }
 try{
  let body;if(request.method==='POST'&&request.body){const declared=request.headers.get('content-length');if(declared&&(!/^\d+$/.test(declared)||Number(declared)>65536))return bad(413);body=await boundedBody(request.body,65536);if(body===null)return bad(413);if(u.pathname==='/api/auth/verify'){let input;try{input=JSON.parse(new TextDecoder().decode(body));}catch{return bad(400);}if(!input||input.domain!==u.host)return bad(400);}}
  const r=await fetcher(cfg.origin+u.pathname+u.search,{method:request.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(30000),cf:{cacheTtl:0,cacheEverything:false}});
  if(r.status>=300&&r.status<400){await r.body?.cancel();return bad(502);}
  const out=new Headers({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
  for(const key of ['content-type','content-disposition','content-range','accept-ranges','payment-required','x-nibgate-payment-proof','retry-after'])if(r.headers.has(key))out.set(key,r.headers.get(key));
  if(isAuth&&r.headers.has('set-cookie')){
   if(typeof r.headers.getSetCookie!=='function')return bad(502);
   const values=r.headers.getSetCookie();if(values.length>2)return bad(502);
   const names=new Set();for(const value of values){const safe=safeSetCookie(value);if(!safe)return bad(502);const name=safe.slice(0,safe.indexOf('='));if(names.has(name))return bad(502);names.add(name);out.append('set-cookie',safe);}
  }
  return new Response(r.body,{status:r.status,headers:out});
 }catch{return bad(502);}
}
