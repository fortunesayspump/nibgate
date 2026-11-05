import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const mfModule=createRequire(new URL('../cloudflare/tooling/package.json',import.meta.url))('miniflare');
const { Miniflare, kCurrentWorker, convertV4MiniflareOptions } = mfModule;
test('mainnet build serves mainnet host and forwards synthetic auth only to mainnet',async t=>{
 const dir=path.resolve('.cloudflare-build/mainnet-outer');
 const names=await readdir(dir);
 const modules=[{type:'ESModule',path:'worker.js',contents:await readFile(path.join(dir,'worker.js'),'utf8')}];
 for(const n of names){if(n.endsWith('.mjs'))modules.push({type:'ESModule',path:n,contents:await readFile(path.join(dir,n),'utf8')});if(n.endsWith('.wasm'))modules.push({type:'CompiledWasm',path:n,contents:await readFile(path.join(dir,n))});if(n.endsWith('.bin'))modules.push({type:'Data',path:n,contents:await readFile(path.join(dir,n))})}
 const seen=[];const assets=path.resolve('.cloudflare-build/hub/mainnet/assets');
 const worker=new Miniflare(convertV4MiniflareOptions({workers:[{name:'test',modules,compatibilityDate:'2026-11-04',compatibilityFlags:['nodejs_compat'],durableObjects:{RENDER:{className:'HubRenderObject',useSQLite:true}},serviceBindings:{ASSETS:async req=>{try{return new Response(await readFile(path.join(assets,decodeURIComponent(new URL(req.url).pathname))))}catch{return new Response('missing',{status:404})}},WORKER_SELF_REFERENCE:kCurrentWorker},outboundService:async req=>{seen.push({host:new URL(req.url).hostname,path:new URL(req.url).pathname,cookie:req.headers.get('cookie')});return Response.json({fixture:true},{status:201})}}]}));
 t.after(()=>worker.dispose());
 assert.equal((await worker.dispatchFetch('https://nibgate.xyz/')).status,200);
 assert.equal((await worker.dispatchFetch('https://testnet.nibgate.xyz/')).status,404);
 const response=await worker.dispatchFetch('https://nibgate.xyz/auth/me',{headers:{cookie:'fixture=owner'}});
 assert.equal(response.status,201);assert.equal(seen.at(-1).host,'api.nibgate.xyz');assert.equal(seen.at(-1).cookie,'fixture=owner');
});
