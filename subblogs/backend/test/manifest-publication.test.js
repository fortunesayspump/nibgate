const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
// Execute the actual route registration with isolated repository/storage adapters.
// No production client, credentials, network, payment or decryption is used.
function handler(posts){
 const handlers={};const router={};for(const method of ['get','post','put','delete'])router[method]=(route,...fns)=>{handlers[method+route]=fns.at(-1);};
 const noop=()=>{};const dependencies={
  express:{Router:()=>router},'../../lib/prisma':{blogPost:{findFirst:async({where})=>posts.find(p=>Object.entries(where).every(([k,v])=>p[k]===v))||null,findMany:async({where})=>posts.filter(p=>Object.entries(where).every(([k,v])=>p[k]===v))}},
  '../../config/config':{nibgate:{gatewaySecret:'isolated-fixture'}},'@nibgate/sdk/server':{createCircleGatewayServer:()=>({})},'../../lib/storage':{registerR2Provider:noop},'../../middlewares/validate':()=>noop,'../../validations/nibgate.validation':{},'../../middlewares/auth':{authenticate:noop,authorize:()=>noop},'../../lib/keywrap':{},'../../services/document-render':{},'../../services/access.service':{},'../../config/logger':{},'../../middlewares/tenant':{sitePublicOrigin:()=> 'https://fixture.nibgate.xyz'},
 };
 const context={module:{exports:{}},require:id=>{assert.ok(id in dependencies,id);return dependencies[id];},process:{env:{}},Buffer,console};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/routes/v1/nibgate.route.js'),'utf8'),context);
 return handlers['get/manifest'];
}
const post={id:'fixture-post',siteId:'fixture-site',slug:'sample',type:'article',status:'published',title:'Published',price:'1',bodyMarkdown:'NEVER_RETURN',contentKey:'NEVER_RETURN',bodyStorageRef:'NEVER_RETURN'};
async function call(fn,query={path:'/writing/sample'}){let status=200,body;const headers={};const res={set(k,v){headers[k]=v;return this;},status(s){status=s;return this;},json(b){body=b;return this;}};await fn({query,siteId:'fixture-site',site:{name:'Fixture',subdomain:'fixture'},get:()=> 'fixture'},res,e=>{throw e;});return {status,body,headers};}
test('published paid manifests retain metadata but never contain private storage/body fields',async()=>{const r=await call(handler([post]));assert.equal(r.status,200);assert.equal(r.body.title,'Published');assert.equal(r.body.payment.mode,'one_time');assert.ok(!JSON.stringify(r.body).includes('NEVER_RETURN'));assert.equal(r.headers['Cache-Control'],'private, no-store');});
test('draft, foreign tenant and mismatched type manifests return 404',async()=>{for(const override of [{status:'draft'},{siteId:'other'},{type:'photo'}])assert.equal((await call(handler([{...post,...override}]))).status,404);});
test('unpublishing immediately hides the manifest and site listing',async()=>{const data=[{...post}];const fn=handler(data);assert.equal((await call(fn)).status,200);data[0].status='draft';assert.equal((await call(fn)).status,404);assert.equal((await call(fn,{})).body.content.length,0);});
