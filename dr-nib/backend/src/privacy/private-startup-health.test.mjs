import test from 'node:test';
import assert from 'node:assert/strict';
import {createStartupHealth} from './private-startup-health.js';
test('readiness stays false and only fixed stages are published',async()=>{
 const h=createStartupHealth();await h.listen(0);
 try{
  const url=`http://127.0.0.1:${h.server.address().port}`;
  assert.deepEqual(await (await fetch(url+'/health')).json(),{ok:true,privateReady:false,startup:{state:'starting',stage:'CONFIGURATION'}});
  h.stage('PHALA_ATTESTATION');h.fail(new Error('secret-password project contents'));
  const value=await (await fetch(url+'/health')).json();
  assert.deepEqual(value,{ok:true,privateReady:false,startup:{state:'failed',stage:'PHALA_ATTESTATION'}});
  assert.throws(()=>h.stage('secret-password'),/INVALID_STARTUP_STAGE/);
  h.stage('DATABASE');h.fail('P1000');assert.equal((await(await fetch(url+'/health')).json()).startup.reason,'DATABASE_AUTHENTICATION');
  h.fail('secret-value');assert.equal((await(await fetch(url+'/health')).json()).startup.reason,undefined);
  assert.equal((await fetch(url+'/v1/private/sessions',{method:'POST',body:'secret'})).status,503);
  assert.equal((await fetch(url+'/health?secret=1')).status,503);
  assert.equal((await fetch(url+'/health',{method:'POST'})).status,503);
 }finally{await h.close();}
});
