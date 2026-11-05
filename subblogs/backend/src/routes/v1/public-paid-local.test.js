const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createPublicArticleV2Router}=require('./public-article-v2.route');

test('public paid metadata is tenant-bound and never reads protected body',async t=>{
  const site={id:'one',name:'One',subdomain:'one'};
  const row={id:'paid1',siteId:'one',slug:'article',type:'article',status:'published',publicAccess:true,price:'3',title:'Public paid title',excerpt:'Public excerpt',updatedAt:new Date('2026-01-01'),publishedAt:new Date('2026-01-01'),bodyMarkdown:'PRIVATE_BODY',contentKey:'PRIVATE_KEY',author:{name:'Author'}};
  let paidReads=0, mutate=false;
  const prisma={blogPost:{findMany:async()=>[],findFirst:async q=>{
    if(q.where.OR)return null; // the existing free-only query
    assert.equal(q.select.bodyMarkdown,undefined);
    assert.equal(q.select.bodyStorageRef,undefined);
    assert.equal(q.select.contentKey,undefined);
    if(row.siteId!==q.where.siteId||row.slug!==q.where.slug||row.status!=='published'||row.publicAccess!==true)return null;
    paidReads++;
    if(mutate&&paidReads===2){row.publicAccess=false;return null;}
    return Object.fromEntries(Object.keys(q.select).map(k=>[k,row[k]]));
  }}};
  const app=express();app.use((req,res,next)=>{req.site=site;req.siteId=site.id;next()});
  app.use('/blog',createPublicArticleV2Router({prisma,decryptBody:async()=>{throw Error('must not decrypt')} }));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url='http://127.0.0.1:'+server.address().port+'/blog/public-article-v2/article';
  let response=await fetch(url);let text=await response.text();assert.equal(response.status,200);assert.match(text,/Public paid title/);assert.doesNotMatch(text,/PRIVATE_BODY|PRIVATE_KEY/);assert.equal(JSON.parse(text).post.isLocked,true);assert.equal(response.headers.get('cache-control'),'private, no-store');
  row.publicAccess=false;response=await fetch(url);text=await response.text();assert.equal(response.status,404);assert.doesNotMatch(text,/Public paid title|PRIVATE_BODY/);
  row.publicAccess=true;paidReads=0;mutate=true;response=await fetch(url);text=await response.text();assert.equal(response.status,409);assert.doesNotMatch(text,/Public paid title|PRIVATE_BODY/);
});

test('home includes public paid metadata while excluding private and foreign posts',async t=>{
  const site={id:'one',name:'One',subdomain:'one'};
  const post=(id,extra={})=>({id,siteId:'one',slug:id,type:'article',status:'published',publicAccess:true,price:'2',title:'TITLE_'+id,excerpt:'Excerpt',publishedAt:new Date('2026-01-01'),updatedAt:new Date('2026-01-01'),bodyMarkdown:'SECRET_BODY',contentKey:'SECRET_KEY',...extra});
  const rows=[post('paid'),post('free',{price:null}),post('private',{publicAccess:false}),post('foreign',{siteId:'two'})];let calls=0;
  const prisma={blogPost:{findFirst:async()=>null,findMany:async q=>{
    calls++;assert.equal(q.select.bodyMarkdown,undefined);assert.equal(q.select.contentKey,undefined);
    return rows.filter(p=>p.siteId===q.where.siteId&&p.status==='published'&&p.publicAccess===true&&(!q.where.id||q.where.id.in.includes(p.id))).map(p=>Object.fromEntries(Object.keys(q.select).map(k=>[k,p[k]])));
  }}};
  const app=express();app.use((req,res,next)=>{req.site=site;req.siteId=site.id;next()});app.use('/blog',createPublicArticleV2Router({prisma}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});t.after(()=>new Promise(resolve=>server.close(resolve)));
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/blog/public-home-v2');const body=await r.text();assert.equal(r.status,200);assert.match(body,/TITLE_paid/);assert.match(body,/TITLE_free/);assert.doesNotMatch(body,/TITLE_private|TITLE_foreign|SECRET_BODY|SECRET_KEY/);assert.equal(calls,2);
});
