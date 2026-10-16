import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateCapabilitySigner,createGuestCapabilityAuthenticator,createInMemoryJtiConsumer} from './private-capability.js';
let jose;
try{jose=await import('jose')}catch{}

test('short-lived EdDSA broker capability binds run, scope and one-use ID', {skip:!jose},async()=>{
  const {publicKey,privateKey}=await jose.generateKeyPair('EdDSA');
  const sign=createPrivateCapabilitySigner({privateKey});
  let time=Date.now();
  const authenticate=createGuestCapabilityAuthenticator({publicKey,consumeJti:createInMemoryJtiConsumer({now:()=>time})});
  const runId='11111111-1111-4111-8111-111111111111';
  const token=await sign({tenantId:'tenant_fixture',runId,scope:'sessions:open'});
  const req={method:'POST',url:'/v1/private/sessions',headers:{authorization:`Bearer ${token}`}};
  assert.deepEqual(await authenticate(req),{tenantId:'tenant_fixture',runId});
  assert.equal(await authenticate(req),null);
  const another=await sign({tenantId:'tenant_fixture',runId,scope:'sessions:open'});
  assert.equal(await authenticate({...req,url:'/v1/private/sessions/11111111-1111-4111-8111-111111111111/execute',headers:{authorization:`Bearer ${another}`}}),null);
  assert.equal(await authenticate({...req,headers:{authorization:'Bearer malformed'}}),null);
  const read=await sign({tenantId:'tenant_fixture',runId,scope:'jobs:read'});
  const jobReq={method:'GET',url:`/v1/private/runs/${runId}/job`,headers:{authorization:`Bearer ${read}`}};
  assert.equal(await authenticate({...jobReq,url:`/v1/private/reports/${runId}`}),null);
  assert.deepEqual(await authenticate(jobReq),{tenantId:'tenant_fixture',runId});
  const full=await sign({tenantId:'tenant_fixture',runId,scope:'sessions:full-execute'});
  const fullReq={method:'POST',url:`/v1/private/sessions/${runId}/full-execute`,headers:{authorization:`Bearer ${full}`}};
  assert.equal(await authenticate({...fullReq,url:`/v1/private/sessions/${runId}/execute`}),null);
  assert.deepEqual(await authenticate(fullReq),{tenantId:'tenant_fixture',runId});
});
