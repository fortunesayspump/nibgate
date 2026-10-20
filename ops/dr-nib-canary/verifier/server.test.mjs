import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerifierGateway,verifierGatewayConfig} from './server.mjs';
const origin='https://canary.nibgate.xyz';
const config=()=>verifierGatewayConfig({DRNIB_VERIFIER_UPSTREAM_URL:'http://127.0.0.1:8000/verify',DRNIB_VERIFIER_BROWSER_ORIGINS:origin});
test('verifier transport refuses wildcard origins, public plaintext upstream and arbitrary paths',()=>{
 for(const env of [{DRNIB_VERIFIER_UPSTREAM_URL:'http://public.net/verify',DRNIB_VERIFIER_BROWSER_ORIGINS:origin},{DRNIB_VERIFIER_UPSTREAM_URL:'https://verifier.net/proxy',DRNIB_VERIFIER_BROWSER_ORIGINS:origin},{DRNIB_VERIFIER_UPSTREAM_URL:'https://verifier.net/verify',DRNIB_VERIFIER_BROWSER_ORIGINS:'*'}])assert.throws(()=>verifierGatewayConfig(env));
});
test('direct browser CORS, evidence-only forwarding, rejection and outage fail closed',async()=>{
 const calls=[];let mode='valid';
 const server=createVerifierGateway({config:config(),fetchImpl:async(url,init)=>{calls.push({url:String(url),init});if(mode==='outage')throw Error('fixture');if(mode==='quoteOnly')return Response.json({quote:{verified:true}});if(mode==='invalid')return Response.json({ok:true});return Response.json({is_valid:mode!=='rejected',details:{fixture:true}});}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  let r=await fetch(base+'/verify',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'content-type'}});assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),origin);assert.equal(r.headers.get('access-control-allow-credentials'),null);
  const send=(body,extra={})=>fetch(base+'/verify',{method:'POST',headers:{origin,'content-type':'application/json',cookie:'never-forward-this',...extra},body:JSON.stringify(body)});
  r=await send({attestation:'aa'});assert.equal(r.status,200);assert.equal((await r.json()).is_valid,true);assert.equal(calls.length,1);assert.equal(calls[0].init.headers.cookie,undefined);assert.equal(calls[0].init.redirect,'error');assert.deepEqual(JSON.parse(calls[0].init.body),{attestation:'aa'});
  assert.equal((await send({attestation:'aa',document:'must not leave browser'})).status,400);assert.equal(calls.length,1);
  assert.equal((await send({attestation:'aa'},{origin:'https://attacker.net'})).status,403);assert.equal(calls.length,1);
  assert.equal((await fetch(base+'/verify?redirect=https://attacker.net')).status,404);
  mode='rejected';r=await send({attestation:'aa'});assert.equal((await r.json()).is_valid,false);
  for(const value of ['invalid','outage','quoteOnly']){mode=value;assert.equal((await send({attestation:'aa'})).status,503);}
  assert.equal((await fetch(base+'/health')).status,200);assert.equal((await fetch(base+'/verify',{method:'GET'})).status,405);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
