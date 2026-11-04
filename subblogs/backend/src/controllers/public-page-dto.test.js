const test=require('node:test');
const assert=require('node:assert/strict');
const {publicPageDTO}=require('./public-page-dto');
const site={id:'site-fixture',name:'Fixture',description:'Public description',subdomain:'fixture'};
const post={id:'post-fixture',siteId:site.id,status:'published',slug:'public',type:'article',title:'Public title',excerpt:'Public teaser',price:null,publicAccess:true,bodyMarkdown:'**Public** prose.',publishedAt:'2026-08-01',author:{name:'Author',email:'DO_NOT_COPY'}};
test('combined DTO selects only public article and author fields',async()=>{
 const input={...post,contentKey:'DO_NOT_COPY',bodyStorageRef:'DO_NOT_COPY'};
 const dto=publicPageDTO({...site,verifyToken:'DO_NOT_COPY',settings:'DO_NOT_COPY'},input);
 assert.ok(!JSON.stringify(dto).includes('DO_NOT_COPY'));
 assert.equal(dto.post.bodyMarkdown,post.bodyMarkdown);
 assert.deepEqual(dto.site,site);
 assert.deepEqual(dto.post.author,{name:'Author'});
});
test('paid, restricted and ambiguous posts never inspect body or private fields',()=>{
 for(const change of [{price:'1.00'},{publicAccess:false},{publicAccess:undefined},{isLocked:true},{price:'invalid'}]){
  const value={...post,...change};
  for(const key of ['bodyMarkdown','body','media','contentKey','whitelist'])Object.defineProperty(value,key,{get(){throw new Error('Private field read');}});
  const dto=publicPageDTO(site,value);assert.equal(dto.post.isLocked,true);assert.ok(!('bodyMarkdown' in dto.post));
 }
});
test('draft, removed and cross-tenant posts cannot become public DTOs',()=>{
 assert.equal(publicPageDTO(site,null),null);
 const draft={...post,status:'draft'};Object.defineProperty(draft,'bodyMarkdown',{get(){throw new Error('Draft read');}});
 assert.equal(publicPageDTO(site,draft),null);
 assert.throws(()=>publicPageDTO({...site,id:'other'},post),/tenant mismatch/);
});
test('site credentials and arbitrary relation getters are never accessed',()=>{
 const value={...site};for(const key of ['verifyToken','settings','hub','widgetScript'])Object.defineProperty(value,key,{get(){throw new Error('Secret field read');}});
 assert.equal(publicPageDTO(value,post).site.name,'Fixture');
});
