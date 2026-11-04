const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');const jwt=require('jsonwebtoken');
function load(file,deps){const context={module:{exports:{}},require:id=>{if(id in deps)return deps[id];throw Error('unexpected dependency '+id)},Buffer,Date,Math};vm.runInNewContext(fs.readFileSync(path.join(__dirname,file),'utf8'),context);return context.module.exports;}
test('real JWT verification and async wallet lookup preserve tenant isolation',async()=>{
 const key='isolated-fixture-only-not-a-live-secret';const wallet='0x1111111111111111111111111111111111111111';
 const siwe=load('../src/services/siwe.service.js',{'jsonwebtoken':jwt,crypto:require('node:crypto'),'../config/config':{env:'test',jwt:{secret:key}},'../lib/prisma':{user:{findUnique:async({where})=>where.id==='fixture'?{id:'fixture',siteId:'site-1',walletAddress:wallet}:null}},'../utils/ApiError':class extends Error{},'http-status':{status:{}},'../lib/network':{},'@nibgate/wallet/siwe.js':{}});
 const access=load('../src/services/access.service.js',{'http-status':{status:{}},'../utils/ApiError':class extends Error{},'../lib/prisma':{},'@nibgate/sdk/server':{},'../services/siwe.service':siwe});
 const make=(secret,claims)=>jwt.sign(claims,secret,{expiresIn:'5m'});const valid=make(key,{sub:'fixture',siteId:'site-1',kind:'siwe'}),forged=make('different-fixture-key',{sub:'fixture',siteId:'site-1',kind:'siwe'}),wrongKind=make(key,{sub:'fixture',siteId:'site-1',kind:'other'});
 for(const [siteId,token,expected] of [['site-1',valid,wallet],['site-2',valid,null],['site-1',forged,null],['site-1',wrongKind,null]])assert.equal(await access.sessionWalletFor({siteId,cookies:{sb_auth_session:token}}),expected);
});
