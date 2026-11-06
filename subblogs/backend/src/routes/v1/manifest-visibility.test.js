const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('manifest handlers include public paid teasers and exclude private or foreign posts', async t => {
  const handlers = new Map();
  const rows = [
    { id:'free', siteId:'one', slug:'free', type:'article', status:'published', publicAccess:true, price:'0', title:'PUBLIC_FREE' },
    { id:'paid', siteId:'one', slug:'paid', type:'article', status:'published', publicAccess:true, price:'2', title:'PUBLIC_PAID', videoUrl:'PRIVATE_MEDIA_URL' },
    { id:'private', siteId:'one', slug:'private', type:'article', status:'published', publicAccess:false, price:'0', title:'PRIVATE_TITLE' },
    { id:'unknown', siteId:'one', slug:'unknown', type:'article', status:'published', publicAccess:null, price:'0', title:'UNKNOWN_TITLE' },
    { id:'draft', siteId:'one', slug:'draft', type:'article', status:'draft', publicAccess:true, price:'0', title:'DRAFT_TITLE' },
    { id:'foreign', siteId:'two', slug:'foreign', type:'article', status:'published', publicAccess:true, price:'0', title:'FOREIGN_TITLE' },
  ];
  const matches = (row, where) => Object.entries(where).every(([key,value]) => row[key] === value);
  const prisma = { blogPost: {
    findMany: async ({where}) => rows.filter(row => matches(row,where)),
    findFirst: async ({where}) => rows.find(row => matches(row,where)) || null,
  }};
  const router = Object.fromEntries(['get','post','put','delete'].map(method => [method,(path,...fns) => handlers.set(`${method} ${path}`,fns.at(-1))]));
  const original = Module._load;
  t.after(() => { Module._load = original; });
  Module._load = function(request, parent, isMain) {
    if (parent?.filename?.endsWith('/routes/v1/nibgate.route.js')) {
      const mocks = {
        express:{Router:()=>router}, '../../lib/prisma':prisma,
        '../../middlewares/validate':()=>()=>{}, '../../validations/nibgate.validation':{},
        '../../config/config':{nibgate:{}}, '@nibgate/sdk/server':{createCircleGatewayServer:()=>({})},
        '../../lib/keywrap':{}, '../../lib/storage':{registerR2Provider:()=>{}},
        '../../services/document-render':{}, '../../middlewares/auth':{authenticate:()=>{},authorize:()=>()=>{}},
        '../../services/access.service':{}, '../../config/logger':{},
      };
      if (Object.hasOwn(mocks,request)) return mocks[request];
    }
    if (request==='../../middlewares/tenant') return {sitePublicOrigin:()=> 'https://one.nibgate.xyz'};
    return original.apply(this,arguments);
  };
  delete require.cache[require.resolve('./nibgate.route')]; require('./nibgate.route');
  async function invoke(path,query={},overrides={}) {
    const req={siteId:'one',site:{name:'One',subdomain:'one'},query,protocol:'https',get:()=>'',...overrides};
    const res={statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this},status(v){this.statusCode=v;return this},json(v){this.body=v;return this}};
    await handlers.get(`get ${path}`)(req,res,error=>{throw error}); return res;
  }
  for (const path of ['/manifest','/nibgate.json']) {
    const res=await invoke(path); const text=JSON.stringify(res.body);
    assert.equal(res.statusCode,200); assert.equal(res.headers['Cache-Control'],'private, no-store');
    assert.match(text,/PUBLIC_FREE/); assert.match(text,/PUBLIC_PAID/);
    assert.doesNotMatch(text,/PRIVATE_TITLE|UNKNOWN_TITLE|DRAFT_TITLE|FOREIGN_TITLE|PRIVATE_MEDIA_URL/);
    assert.equal((await invoke(path,{}, {siteId:undefined})).statusCode,404);
  }
  const paid=await invoke('/manifest',{path:'/writing/paid'});
  assert.equal(paid.body.title,'PUBLIC_PAID'); assert.doesNotMatch(JSON.stringify(paid.body),/PRIVATE_MEDIA_URL/);
  for (const slug of ['private','unknown','draft','foreign']) {
    const res=await invoke('/manifest',{path:`/writing/${slug}`});
    assert.equal(res.statusCode,404); assert.doesNotMatch(JSON.stringify(res.body),/TITLE/);
  }
});
