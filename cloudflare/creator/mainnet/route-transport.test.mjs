import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adminProxy} from './api-proxy.mjs';
import {readerProxy} from './reader-proxy.mjs';
const host='goldenhour.nibgate.xyz',root='https://'+host,cfg={host,tenant:'goldenhour',canonical:root,origin:'https://api-subblogs.nibgate.xyz'};
test('gateway writes require creator bearer and same origin; destination and body stay fixed',async()=>{
 for(const path of ['/api/nibgate/gateway/deposit','/api/nibgate/gateway/withdraw']){
  let seen;const fetcher=async(url,options)=>{seen={url,options};return Response.json({ok:true},{status:201})};
  const request=(headers)=>new Request(root+path+'?mode=fixture',{method:'POST',headers,body:'{"amount":"1"}'});
  let r=await adminProxy(request({origin:root,'content-type':'application/json'}),cfg,fetcher);assert.equal(r.status,401);assert.equal(seen,undefined);
  r=await adminProxy(request({origin:'https://elsewhere.invalid',authorization:'Bearer synthetic'}),cfg,fetcher);assert.equal(r.status,403);assert.equal(seen,undefined);
  r=await adminProxy(request({origin:root,authorization:'Bearer synthetic','content-type':'application/json','x-site-subdomain':'wrong'}),cfg,fetcher);assert.equal(r.status,201);assert.equal(seen.url,'https://api-subblogs.nibgate.xyz'+path+'?mode=fixture');assert.equal(seen.options.headers.get('x-site-subdomain'),'goldenhour');assert.equal(seen.options.redirect,'manual');assert.equal(new TextDecoder().decode(seen.options.body),'{"amount":"1"}');
 }
});
test('preflight and manifest retain fixed tenant, proof, methods and manual redirects',async()=>{
 let seen;const f=async(url,options)=>{seen={url,options};return Response.json({ok:true})};
 let r=await readerProxy(new Request(root+'/api/nibgate/preflight',{method:'POST',headers:{origin:root,'payment-signature':'synthetic-proof','content-type':'application/json'},body:'{"path":"/writing/fixture"}'}),cfg,f);assert.equal(r.status,200);assert.equal(seen.url,'https://api-subblogs.nibgate.xyz/api/nibgate/preflight');assert.equal(seen.options.headers.get('payment-signature'),'synthetic-proof');assert.equal(seen.options.headers.get('x-site-subdomain'),'goldenhour');assert.equal(seen.options.redirect,'manual');
 r=await readerProxy(new Request(root+'/api/nibgate/manifest?path=%2Fwriting%2Ffixture'),cfg,f);assert.equal(r.status,200);assert.equal(seen.url,'https://api-subblogs.nibgate.xyz/api/nibgate/manifest?path=%2Fwriting%2Ffixture');
 r=await readerProxy(new Request(root+'/api/nibgate/preflight',{method:'POST',headers:{origin:'https://elsewhere.invalid'}}),cfg,f);assert.equal(r.status,403);
});
