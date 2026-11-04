const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
test('SIWE session endpoint never returns a user from a different or missing tenant',async()=>{
 const dependencies={'../utils/catchAsync':fn=>fn,'../services/auth.service':{},'../services/siwe.service':{cookieName:'session',getUserBySessionToken:async token=>token==='valid'?{id:'fake',siteId:'site-1'}:null},'../utils/ApiError':class extends Error{},'http-status':{status:{UNAUTHORIZED:401}}};
 const context={module:{exports:{}},require:id=>{assert.ok(id in dependencies,id);return dependencies[id]}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/controllers/auth.controller.js'),'utf8'),context);
 for(const [siteId,token,expected] of [['site-1','valid',200],['site-2','valid',401],[undefined,'valid',401],['site-1','invalid',401]]){
  let code=200,body;const res={status(n){code=n;return this},json(x){body=x;return this}};await context.module.exports.siweSession({siteId,cookies:{session:token}},res);assert.equal(code,expected);assert.equal(body.authenticated,expected===200);if(expected===401)assert.equal(body.user,undefined);
 }
});
