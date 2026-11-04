const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createPublicPagePreviewRouter}=require('./public-page-preview.route');
const site={id:'site-fixture',name:'Jeff',subdomain:'jeff',verifyToken:'NEVER_SERIALIZE'};
const metadata={id:'post-fixture',siteId:site.id,status:'published',slug:'sample',type:'article',title:'Public fixture',price:null,publicAccess:true,updatedAt:new Date('2026-08-01'),author:{name:'Author'}};
async function harness(t,{meta=metadata,content={bodyMarkdown:'**Public** fixture.'},current=true,decryptBody,tenant=site}={}) {
 const calls=[];const prisma={blogPost:{findFirst:async query=>{
  calls.push(query);if(calls.length===1)return meta;
  if(query.select.bodyMarkdown)return content;
  return current?{id:metadata.id}:null;
 }}};
 const app=express();app.use((req,res,next)=>{req.site=tenant;next();});app.use('/blog',createPublicPagePreviewRouter({prisma,decryptBody}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 return {url:'http://127.0.0.1:'+server.address().port,calls};
}
test('public HTTP response uses exact policy and excludes private site fields',async t=>{
 const h=await harness(t);const response=await fetch(h.url+'/blog/public-page/sample');
 const dto=await response.json();assert.equal(response.status,200);assert.equal(dto.post.bodyMarkdown,'**Public** fixture.');assert.ok(!JSON.stringify(dto).includes('NEVER_SERIALIZE'));
 assert.equal(h.calls.length,3);assert.ok(!h.calls[0].select.bodyMarkdown);
 assert.deepEqual(h.calls[1].where,{id:metadata.id,siteId:site.id,slug:'sample',type:'article',status:'published',publicAccess:true,OR:[{price:null},{price:'0'}],updatedAt:metadata.updatedAt});
 assert.deepEqual(h.calls[2].where,h.calls[1].where);
});
test('paid and invite-only posts return teasers without a body query or decryption',async t=>{
 for(const change of [{price:'1.00'},{publicAccess:false},{publicAccess:undefined}]){
  const h=await harness(t,{meta:{...metadata,...change},decryptBody(){throw new Error('Unexpected decrypt');}});
  const r=await fetch(h.url+'/blog/public-page/sample');const dto=await r.json();assert.equal(r.status,200);assert.equal(dto.post.isLocked,true);assert.ok(!('bodyMarkdown' in dto.post));assert.equal(h.calls.length,1);
 }
});
test('restriction or edit between metadata and body read fails closed',async t=>{
 const h=await harness(t,{content:null});const r=await fetch(h.url+'/blog/public-page/sample');assert.equal(r.status,409);assert.ok(!(await r.text()).includes('Public**'));assert.equal(h.calls.length,2);
});
test('policy change during public storage decryption suppresses the body',async t=>{
 let decrypts=0;const h=await harness(t,{content:{bodyStorageRef:'fixture-storage',contentKey:'fixture-key'},current:false,decryptBody:async()=>{decrypts++;return Buffer.from('DO_NOT_RETURN');}});
 const r=await fetch(h.url+'/blog/public-page/sample');assert.equal(r.status,409);assert.ok(!(await r.text()).includes('DO_NOT_RETURN'));assert.equal(decrypts,1);
});
test('missing, foreign-tenant and failed storage paths expose no content or errors',async t=>{
 for(const [options,status] of [[{meta:null},404],[{tenant:null},404],[{meta:{...metadata,siteId:'other'}},503],[{content:{bodyStorageRef:'fixture',contentKey:'fixture'},decryptBody:async()=>{throw new Error('PRIVATE_DIAGNOSTIC');}},503]]){
  const h=await harness(t,options);const r=await fetch(h.url+'/blog/public-page/sample');assert.equal(r.status,status);const text=await r.text();assert.ok(!text.includes('PRIVATE_DIAGNOSTIC'));assert.ok(!text.includes('bodyMarkdown'));assert.equal(r.headers.get('cache-control'),'private, no-store');
 }
});
