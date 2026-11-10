import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {pageSecurityHeaders, protectResponse} from '../frontend/src/lib/hub-security.mjs';
const frontendRequire = createRequire(new URL('../frontend/package.json', import.meta.url));
const {transformSync} = createRequire(new URL('../cloudflare/tooling/package.json', import.meta.url))('esbuild');
function load(file, mocks={}, globals={}) {
 const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
 const code=transformSync(source,{loader:file.endsWith('tsx')?'tsx':file.endsWith('ts')?'ts':'js',format:'cjs',jsx:'automatic',target:'es2022'}).code;
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,URL,URLSearchParams,Request,Response,Headers,AbortSignal,process,console,crypto,btoa,...globals,require:name=>Object.hasOwn(mocks,name)?mocks[name]:frontendRequire(name)});
 return module.exports;
}
test('fresh nonces override spoofed headers and retain the wallet popup policy',()=>{
 const request=new Request('https://nibgate.xyz/share?ignored=1',{headers:{'x-nonce':'attacker','x-nibgate-pathname':'//attacker.invalid'}});
 const a=pageSecurityHeaders(request),b=pageSecurityHeaders(request);
 assert.notEqual(a.nonce,b.nonce);assert.notEqual(a.nonce,'attacker');
 assert.equal(a.headers.get('x-nibgate-pathname'),'/share');
 assert.ok(a.csp.includes(`'nonce-${a.nonce}'`));assert.match(a.csp,/script-src[^;]*'strict-dynamic'/);
 assert.doesNotMatch(a.csp,/script-src[^;]*'unsafe-inline'|'unsafe-eval'/);
 assert.match(a.csp,/frame-ancestors 'none'/);
 const verifier=pageSecurityHeaders(request,{verifierUrl:'https://verifier.example/verify'});
 assert.match(verifier.csp,/connect-src[^;]*https:\/\/verifier.example/);
 assert.doesNotMatch(a.csp,/verifier.example/);
 assert.throws(()=>pageSecurityHeaders(request,{verifierUrl:'http://verifier.example/verify'}));
 const response=protectResponse(new Response('ok',{headers:{'set-cookie':'fixture=1; HttpOnly; Secure'}}),a.csp);
 assert.equal(response.headers.get('set-cookie'),'fixture=1; HttpOnly; Secure');
 assert.equal(response.headers.get('x-frame-options'),'DENY');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 assert.equal(response.headers.get('cross-origin-opener-policy'),'same-origin-allow-popups');assert.match(response.headers.get('cache-control'),/no-store/);
});
for(const network of ['mainnet','testnet'])test(`${network} widget query/RSC requests serve the same script without forwarding prefetch headers`,async()=>{
 const host=network==='mainnet'?'nibgate.xyz':'testnet.nibgate.xyz';let seen;
 const worker=load(`cloudflare/hub/${network}/worker.mjs`,{'./drnib-proxy.mjs':{drnibProxy:async()=>null},'cloudflare:workers':{DurableObject:class{}},'../../../frontend/src/lib/hub-security.mjs':{protectResponse}}).default;
 const env={ASSETS:{fetch:async request=>{seen=request;return new Response('/* fixture script */',{headers:{'content-type':'text/plain'}})}}};
 for(const method of ['GET','HEAD']){
 const response=await worker.fetch(new Request(`https://${host}/widget.js?_rsc=fixture`,{method,headers:{rsc:'1',cookie:'synthetic=1'}}),env);
 assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/javascript/);
 assert.equal(new URL(seen.url).search,'');assert.equal(seen.headers.get('rsc'),null);assert.equal(seen.headers.get('cookie'),null);
 }
 assert.equal((await worker.fetch(new Request(`https://${host}/widget.js`,{method:'POST'}),env)).status,405);
});
test('domain validation avoids invalid lookups and normalizes URLs before sending',()=>{
 const {normalizeTipDomain}=load('frontend/src/lib/tip-lookup.ts');
 assert.equal(normalizeTipDomain(' https://WWW.Example.com/path?x=1 '),'example.com');
 for(const input of ['', 'localhost','javascript:alert(1)','https://user:password@example.com','not a domain','https://127.0.0.1'])assert.throws(()=>normalizeTipDomain(input),/valid domain/);
});
test('Pending Tips handles non-JSON 400, throttling and unavailable services honestly',async()=>{
 for(const status of [400,429,503]){
 let seen;
 const {fetchHeldTips}=load('frontend/src/lib/tip-lookup.ts',{}, {fetch:async url=>{seen=new URL(url);return new Response('<html>error</html>',{status})}});
 await assert.rejects(fetchHeldTips('https://testnet-api.nibgate.xyz','example.com'),status===400?/valid domain/:status===429?/wait a moment/:/temporarily unavailable/);
 assert.equal(seen.hostname,'testnet-api.nibgate.xyz');assert.equal(seen.searchParams.get('domain'),'example.com');
 }
});
test('Explore distinguishes empty success from 4xx/network/malformed failures',async()=>{
 for(const response of [new Response('{}',{status:400}),new Response('{}',{status:429}),new Response('{}')]){
 const {getExploreProducts}=load('frontend/src/app/explore/_data/explore-content.ts',{}, {fetch:async()=>response});
 const result=await getExploreProducts();assert.equal(result.products.length,0);assert.ok(result.error);
 }
 const {getExploreProducts}=load('frontend/src/app/explore/_data/explore-content.ts',{}, {fetch:async()=>Response.json({content:[]})});
 assert.equal((await getExploreProducts()).error,'');
});
test('authenticated Share API transport preserves sessions, privacy fields, zero prices and payment proofs',async()=>{
 const calls=[];
 const {nibshareApi}=load('frontend/src/features/nibshare/api.ts',{}, {fetch:async(url,options)=>{calls.push({url,options});return Response.json({success:true})}});
 await nibshareApi.authNonce();await nibshareApi.authVerify({message:'synthetic SIWE fixture',signature:'0xfixture'});
 const payload={title:'Local fixture',content:'body',price:'0',publicAccess:false,whitelist:['0x1111111111111111111111111111111111111111'],whitelistPrice:'0'};
 await nibshareApi.create(payload);await nibshareApi.update('fixture',payload);await nibshareApi.access('fixture',{proof:'synthetic-proof'});
 assert.equal(calls[0].url,'/auth/nonce');assert.equal(calls[1].options.credentials,'include');
 for(const call of calls.slice(2,4)){assert.equal(call.options.credentials,'include');assert.deepEqual(JSON.parse(call.options.body),payload);}
 assert.equal(calls[4].options.headers['x-nibgate-payment-proof'],'synthetic-proof');
});
test('rendered Share controls have explicit labels across content types and paid whitelist states',()=>{
 const React=frontendRequire('react'),{renderToStaticMarkup}=frontendRequire('react-dom/server');
 const {JSDOM}=createRequire(new URL('../cloudflare/tooling/package.json',import.meta.url))('jsdom');
 const shares=load('frontend/src/features/nibshare/lib/shares.ts');
 const wallet=load('frontend/src/features/nibshare/components/WalletListEditor.tsx',{'../lib/shares':shares});
 const mocks={'next/navigation':{useRouter:()=>({push(){}})},'./WalletListEditor':wallet,'../api':{nibshareApi:{}},'./ShareSuccess':{ShareSuccess:()=>null},'../lib/shares':shares,'../lib/content':load('frontend/src/features/nibshare/lib/content.ts'),
 './MarkdownEditor':{__esModule:true,default:()=>React.createElement('textarea',{'aria-label':'Body'})}};
 for(const name of ['ImageUploader','VideoUploader','AudioUploader','DocumentUploader'])mocks['./'+name]=load(`frontend/src/features/nibshare/components/${name}.tsx`,{'../lib/upload':{uploadJson:()=>{throw Error('No uploads in SSR test')}}});
 const Form=load('frontend/src/features/nibshare/components/ShareForm.tsx',mocks).default;
 for(const contentType of ['article','photo','video','music','document']){
 const markup=renderToStaticMarkup(React.createElement(Form,{authenticated:true,defaultRecipientWallet:'0x1111111111111111111111111111111111111111',editing:{slug:'fixture',initial:{title:'Fixture',price:'1',contentType,content:'fixture',whitelist:['0x2222222222222222222222222222222222222222'],whitelistPrice:'0.5',publicAccess:false}}}));
 const document=new JSDOM(markup).window.document;
 for(const control of document.querySelectorAll('input,select,textarea,[role="textbox"]')){
 const name=control.getAttribute('aria-label') || control.closest('label')?.textContent || [...document.querySelectorAll('label')].find(label=>label.htmlFor===control.id && control.id)?.textContent;
 assert.ok(name?.trim(),`${contentType}: unnamed ${control.outerHTML}`);
 }
 for(const label of document.querySelectorAll('label[for]'))assert.ok(document.getElementById(label.htmlFor));
 assert.ok(document.querySelector('button[type="button"]'));
 }
});
