// Run after staging the actual testnet outer bundle at .cloudflare-build/audit-outer.
// No upstream requests, owner records, wallet signatures or payments are used.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const {Miniflare,kCurrentWorker,convertV4MiniflareOptions}=createRequire(new URL('../cloudflare/tooling/package.json',import.meta.url))('miniflare');
test('actual Cloudflare DO renderer keeps nonces, canonical URLs, RSC and assets coherent',async t=>{
 const dir=process.env.HUB_AUDIT_BUNDLE || '.cloudflare-build/audit-outer',modules=[];
 const network=process.env.HUB_AUDIT_NETWORK || 'testnet';
 assert.ok(['mainnet','testnet'].includes(network));
 const origin=network==='mainnet'?'https://nibgate.xyz':'https://testnet.nibgate.xyz';
 for(const file of (await fs.readdir(dir)).sort((a,b)=>Number(b==='worker.js')-Number(a==='worker.js'))){
  const type=file==='worker.js'||file.endsWith('.mjs')?'ESModule':file.endsWith('.wasm')?'CompiledWasm':file.endsWith('.bin')?'Data':null;
  if(type)modules.push({type,path:file,contents:await fs.readFile(`${dir}/${file}`,type==='ESModule'?'utf8':undefined)});
 }
 const requests=[];
 const m=new Miniflare(convertV4MiniflareOptions({workers:[{name:'test',modules,compatibilityDate:'2026-11-04',compatibilityFlags:['nodejs_compat'],durableObjects:{RENDER:{className:'HubRenderObject',useSQLite:true}},serviceBindings:{WORKER_SELF_REFERENCE:kCurrentWorker,ASSETS:async request=>{
  const pathname=new URL(request.url).pathname;
  try{return new Response(await fs.readFile(`frontend/.open-next/assets${pathname}`),{headers:{'content-type':pathname.endsWith('.js')?'application/javascript':'application/octet-stream'}})}catch{return new Response('Not found',{status:404})}
 }},outboundService:async request=>{
  const url=new URL(request.url);
  if(url.hostname!==(network==='mainnet'?'api.nibgate.xyz':'testnet-api.nibgate.xyz'))return new Response('Unexpected test upstream',{status:502});
  const body=await request.text();
  requests.push({path:url.pathname,cookie:request.headers.get('cookie'),body});
  if(url.pathname==='/auth/nonce')return Response.json({nonce:'synthetic-nonce'});
  if(url.pathname==='/auth/verify')return new Response('{"success":true}',{headers:{'content-type':'application/json','set-cookie':'synthetic_session=owner; HttpOnly; Secure; SameSite=Lax; Path=/'}});
  if(url.pathname==='/nibshare'&&request.method==='POST')return Response.json(request.headers.get('cookie')==='synthetic_session=owner'?{slug:'fixture'}:{error:'Unauthorized'},{status:request.headers.get('cookie')==='synthetic_session=owner'?201:401});
  if(url.pathname==='/nibshare/fixture/access')return request.headers.get('x-nibgate-payment-proof')==='synthetic-proof'?Response.json({content:'Synthetic unlocked content'}):new Response('{"error":"Payment required"}',{status:402,headers:{'content-type':'application/json','payment-required':'synthetic-challenge'}});
  return Response.json({error:'Synthetic unauthenticated fixture'},{status:401});
 }}]}));
 t.after(()=>m.dispose());
 let lastNonce;
 for(const path of ['/share?audit=1','/privacy?audit=1','/signin']){
  const response=await m.dispatchFetch(origin+path);
  const html=await response.text();assert.equal(response.status,200,path);
  const nonce=response.headers.get('content-security-policy')?.match(/'nonce-([^']+)'/)?.[1];assert.ok(nonce);assert.notEqual(nonce,lastNonce);lastNonce=nonce;
  const scripts=[...html.matchAll(/<script\b([^>]*)>/g)];assert.ok(scripts.length);
  for(const [,attributes] of scripts)assert.ok(attributes.includes(`nonce="${nonce}"`),'script/header nonce mismatch');
  assert.ok(html.includes(`rel="canonical" href="${origin}${path.split('?')[0]}"`));
  assert.equal(response.headers.get('x-frame-options'),'DENY');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.match(response.headers.get('cache-control'),/no-store/);
 }
 const rsc=await m.dispatchFetch(origin+'/privacy?_rsc=fixture',{headers:{rsc:'1'}});
 assert.equal(rsc.status,200);assert.match(rsc.headers.get('content-type'),/text\/x-component/);
 const nonceResponse=await m.dispatchFetch(origin+'/auth/nonce');assert.equal(nonceResponse.status,200);
 const verify=await m.dispatchFetch(origin+'/auth/verify',{method:'POST',headers:{'content-type':'application/json'},body:'{"message":"synthetic-siwe","signature":"synthetic"}'});
 assert.equal(verify.status,200);assert.match(verify.headers.get('set-cookie'),/synthetic_session=owner/);
 assert.equal(requests.at(-1).body,'{"message":"synthetic-siwe","signature":"synthetic"}');
 const payload=JSON.stringify({title:'Synthetic draft',price:'0',publicAccess:false,status:'draft'});
 const denied=await m.dispatchFetch(origin+'/nibshare',{method:'POST',headers:{'content-type':'application/json'},body:payload});assert.equal(denied.status,401);
 const create=await m.dispatchFetch(origin+'/nibshare',{method:'POST',headers:{'content-type':'application/json',cookie:'synthetic_session=owner'},body:payload});
 assert.equal(create.status,201);assert.equal(requests.at(-1).body,payload);assert.equal(requests.at(-1).cookie,'synthetic_session=owner');
 const locked=await m.dispatchFetch(origin+'/nibshare/fixture/access');assert.equal(locked.status,402);assert.equal(locked.headers.get('payment-required'),'synthetic-challenge');
 const unlocked=await m.dispatchFetch(origin+'/nibshare/fixture/access',{headers:{'x-nibgate-payment-proof':'synthetic-proof'}});assert.equal(unlocked.status,200);assert.match(await unlocked.text(),/Synthetic unlocked content/);
 const widget=await m.dispatchFetch(origin+'/widget.js?_rsc=fixture',{headers:{rsc:'1'}});
 assert.equal(widget.status,200);assert.match(widget.headers.get('content-type'),/javascript/);
});
