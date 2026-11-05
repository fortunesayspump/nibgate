import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const mfModule=createRequire(new URL('../cloudflare/tooling/package.json',import.meta.url))('miniflare');
const {Miniflare,kCurrentWorker,convertV4MiniflareOptions}=mfModule;
test('creator wallet session and payment challenges stay tenant bound',async t=>{
 const seen=[], code=await fs.readFile('.cloudflare-build/creator-outer/worker.js','utf8');
 const m=new Miniflare(convertV4MiniflareOptions({workers:[{name:'test',modules:[{type:'ESModule',path:'worker.js',contents:code}],compatibilityDate:'2026-11-04',compatibilityFlags:['nodejs_compat'],durableObjects:{RENDER:{className:'RenderObject',useSQLite:true}},serviceBindings:{ASSETS:async()=>new Response('not found',{status:404}),WORKER_SELF_REFERENCE:kCurrentWorker},outboundService:async req=>{
   const u=new URL(req.url);const body=Buffer.from(await req.arrayBuffer());seen.push({host:u.hostname,path:u.pathname,tenant:req.headers.get('x-site-subdomain'),cookie:req.headers.get('cookie'),proof:req.headers.get('payment-signature'),bodyLength:body.length,bodyHash:createHash('sha256').update(body).digest('hex')});
   if(u.pathname.endsWith('/nonce'))return new Response('{}',{status:200,headers:{'content-type':'application/json','set-cookie':'sb_auth_nonce=fake; HttpOnly; Secure; SameSite=Lax; Path=/'}});
   if(u.pathname.endsWith('/gateway/balance'))return Response.json({balance:'synthetic'});
   if(u.pathname.endsWith('/upload'))return Response.json({success:true},{status:201});
   return new Response('{"error":"payment required"}',{status:402,headers:{'content-type':'application/json','payment-required':'synthetic-challenge'}});
 }}]}));t.after(()=>m.dispose());
 const root='https://goldenhour.nibgate.xyz';
 let r=await m.dispatchFetch(root+'/api/auth/nonce',{headers:{'x-site-subdomain':'wildtype',cookie:'unrelated=fake'}});
 assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/sb_auth_nonce=/);assert.equal(seen[0].host,'api-subblogs.nibgate.xyz');assert.equal(seen[0].tenant,'goldenhour');assert.equal(seen[0].cookie,null);
 r=await m.dispatchFetch(root+'/api/nibgate/access?path=%2Fwriting%2Fpaid',{headers:{cookie:'sb_auth_session=fake; unrelated=fake','payment-signature':'synthetic-proof','x-site-subdomain':'wildtype'}});
 assert.equal(r.status,402);assert.equal(r.headers.get('payment-required'),'synthetic-challenge');assert.equal(seen.at(-1).tenant,'goldenhour');assert.equal(seen.at(-1).cookie,'sb_auth_session=fake');assert.equal(seen.at(-1).proof,'synthetic-proof');assert.match(r.headers.get('cache-control'),/no-store/);
 r=await m.dispatchFetch(root+'/api/nibgate/gateway/balance',{method:'POST',headers:{origin:root,'content-type':'application/json'},body:'{"address":"synthetic"}'});assert.equal(r.status,200);assert.equal(seen.at(-1).tenant,'goldenhour');
 const upload=Buffer.concat([Buffer.from('--synthetic\r\n'),Buffer.alloc(30*1024*1024,0x61),Buffer.from('\r\n--synthetic--')]);
 r=await m.dispatchFetch(root+'/api/upload?encrypted=1',{method:'POST',headers:{origin:root,authorization:'Bearer synthetic','content-type':'multipart/form-data; boundary=synthetic'},body:upload});
 assert.equal(r.status,201);assert.equal(seen.at(-1).tenant,'goldenhour');assert.equal(seen.at(-1).bodyLength,upload.length);assert.equal(seen.at(-1).bodyHash,createHash('sha256').update(upload).digest('hex'));
 const count=seen.length;r=await m.dispatchFetch('https://testnet.nibgate.xyz/api/nibgate/access');assert.equal(r.status,404);assert.equal(seen.length,count);
});
