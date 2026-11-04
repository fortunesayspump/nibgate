const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function load(file, deps) {
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{module,require:n=>{if(n in deps)return deps[n];throw Error(n)}});
 return module.exports;
}
const auth=load('subblogs/backend/src/middlewares/auth.js',{'passport':{},'http-status':{status:{FORBIDDEN:403}},'../utils/ApiError':class extends Error{constructor(code,message){super(message);this.statusCode=code}},'../config/logger':{}});
const routes={};
const router=Object.fromEntries(['get','put','post'].map(m=>[m,(p,...handlers)=>routes[`${m} ${p}`]=handlers]));
load('subblogs/backend/src/routes/v1/settings.route.js',{'express':{Router:()=>router},'bcryptjs':{},'../../middlewares/validate':()=>()=>{},'../../validations/settings.validation':{},'../../lib/prisma':{},'../../middlewares/auth':auth,'http-status':{},'../../lib/tenant-cache':{},'../../lib/network':{},'../../config/config':{}});
test('reader cannot modify settings or links; provisioned author and admin remain allowed',()=>{
 for(const route of ['put /','post /link-hub','post /link-hub/disconnect']){
  const handler=routes[route][1];
  for(const role of ['reader','author','admin']){
   let called=false,error;handler({user:{role}}, {}, e=>{called=true;error=e});
   assert.equal(called,true);assert.equal(error?.statusCode,role==='reader'?403:undefined,`${route} ${role}`);
  }
 }
});
test('settings read and own password change retain their existing middleware layout',()=>{
 assert.equal(routes['get /'].length,2);
 assert.equal(routes['put /password'].length,2);
});
