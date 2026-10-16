import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateGuestHttpServer} from './private-guest-http.js';
import {generateHpkeRecipient,sealHpkeReport} from './source-hpke.js';

test('guest HTTP accepts only authenticated, bound ciphertext operations',async()=>{
  const calls=[];
  const runId='33333333-3333-4333-8333-333333333333';
  const reportId='22222222-2222-4222-8222-222222222222';
  const recipient=await generateHpkeRecipient();
  const report=await sealHpkeReport({recipientPublicKey:recipient.publicKey,context:{tenantId:'tenant_fixture',runId,objectId:reportId,revision:1,purpose:'report',recipientId:recipient.recipientId},plaintext:Buffer.from('HARMLESS_SYNTHETIC_CIPHERTEXT')});
  const sessions={
    open:async x=>{calls.push(['open',x]);return {sessionId:'11111111-1111-4111-8111-111111111111',clientNonce:x.clientNonce.toString('hex'),recipientId:recipient.recipientId,recipientPublicKey:Buffer.from(recipient.publicKey).toString('base64'),evidence:{attestation:'aabb'}}},
    prove:async x=>{calls.push(['prove',x]);return {verified:true,sessionId:'11111111-1111-4111-8111-111111111111',recipientId:'a'.repeat(64),clientNonce:'ab'.repeat(32),challengeDigest:'cd'.repeat(32)}},
    execute:async x=>{calls.push(['execute',x]);return {id:reportId,version:1,encrypted:true}},
  };
  const server=createPrivateGuestHttpServer({sessions,authenticate:async req=>req.headers.authorization==='Bearer synthetic'?{tenantId:'tenant_fixture',runId}:null,getReport:async x=>{calls.push(['report',x]);return report}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=(path,value,token='Bearer synthetic')=>fetch(base+path,{method:'POST',headers:{authorization:token,'content-type':'application/json'},body:JSON.stringify(value)});
  try{
    let r=await post('/v1/private/sessions',{runId,clientNonce:'ab'.repeat(32)});
    assert.equal(r.status,201);assert.equal((await r.json()).evidence.attestation,'aabb');
    r=await post('/v1/private/sessions',{runId:'other',clientNonce:'ab'.repeat(32)});assert.equal(r.status,400);
    r=await post('/v1/private/sessions',{runId,clientNonce:'ab'.repeat(32)},'Bearer wrong');assert.equal(r.status,401);
    const sid='11111111-1111-4111-8111-111111111111';
    r=await post(`/v1/private/sessions/${sid}/prove`,{challengeEnvelope:{ciphertext:'synthetic'}});assert.equal(r.status,200);
    r=await post(`/v1/private/sessions/${sid}/execute`,{sourceEnvelope:{ciphertext:'synthetic'}});assert.equal(r.status,200);
    r=await fetch(base+`/v1/private/reports/${reportId}?runId=${runId}`,{headers:{authorization:'Bearer synthetic'}});
    assert.equal(r.status,200);assert.deepEqual(await r.json(),report);
    r=await fetch(base+`/v1/private/reports/${reportId}?runId=other`,{headers:{authorization:'Bearer synthetic'}});assert.equal(r.status,400);
    assert.equal(calls.length,4);
    for(const [,x] of calls)assert.equal(x.tenantId,'tenant_fixture');
    assert.ok(!JSON.stringify(report).includes('HARMLESS_SYNTHETIC_CIPHERTEXT'));
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
test('guest HTTP refuses a plaintext report callback or plaintext runner result',async()=>{
  const runId='33333333-3333-4333-8333-333333333333',reportId='22222222-2222-4222-8222-222222222222';
  const server=createPrivateGuestHttpServer({
    sessions:{open:async()=>({}),prove:async()=>({}),execute:async()=>({id:reportId,version:1,encrypted:true,markdown:'HARMLESS_SYNTHETIC_PRIVATE_CANARY'})},
    authenticate:async()=>({tenantId:'tenant_fixture',runId}),
    getReport:async()=>({markdown:'HARMLESS_SYNTHETIC_PRIVATE_CANARY'}),
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const a=await fetch(base+`/v1/private/reports/${reportId}?runId=${runId}`);
    const b=await fetch(base+'/v1/private/sessions/11111111-1111-4111-8111-111111111111/execute',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sourceEnvelope:{}})});
    assert.equal(a.status,503);assert.equal(b.status,503);
    assert.ok(!(await a.text()).includes('CANARY'));assert.ok(!(await b.text()).includes('CANARY'));
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});

test('guest job status returns only owner-bound fixed fields and validates 202',async()=>{
  const runId='33333333-3333-4333-8333-333333333333',reportId='22222222-2222-4222-8222-222222222222';
  let status={state:'processing'};
  const server=createPrivateGuestHttpServer({
    sessions:{open:async()=>({}),prove:async()=>({}),execute:async()=>({state:'processing',runId})},
    authenticate:async()=>({tenantId:'tenant_fixture',runId}),getReport:async()=>null,
    getJobStatus:async()=>status,
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    let r=await fetch(base+`/v1/private/runs/${runId}/job`);
    assert.equal(r.status,200);assert.deepEqual(await r.json(),{state:'processing'});
    r=await fetch(base+`/v1/private/runs/${reportId}/job`);assert.equal(r.status,404);
    status={state:'complete',reportId};
    r=await fetch(base+`/v1/private/runs/${runId}/job`);
    assert.equal(r.status,200);assert.deepEqual(await r.json(),status);
    status={state:'complete',reportId,markdown:'HARMLESS_SYNTHETIC_PRIVATE_CANARY'};
    r=await fetch(base+`/v1/private/runs/${runId}/job`);
    assert.equal(r.status,503);assert.ok(!(await r.text()).includes('CANARY'));
    r=await fetch(base+'/v1/private/sessions/11111111-1111-4111-8111-111111111111/execute',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sourceEnvelope:{}})});
    assert.equal(r.status,202);assert.deepEqual(await r.json(),{state:'processing',runId});
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});

test('guest HTTP maps a conflicting encrypted request to fixed 409 without echo',async()=>{
  const runId='33333333-3333-4333-8333-333333333333';
  const conflict=Object.assign(new Error('HARMLESS_SYNTHETIC_PRIVATE_CANARY'),{code:'PRIVATE_JOB_CONFLICT'});
  const server=createPrivateGuestHttpServer({
    sessions:{open:async()=>({}),prove:async()=>({}),execute:async()=>{throw conflict}},
    authenticate:async()=>({tenantId:'tenant_fixture',runId}),getReport:async()=>null,
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const r=await fetch(base+'/v1/private/sessions/11111111-1111-4111-8111-111111111111/execute',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sourceEnvelope:{}})});
    assert.equal(r.status,409);assert.ok(!(await r.text()).includes('CANARY'));
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});

test('full execute is separately gated, authenticates both envelopes and projects only a receipt',async()=>{
  const runId='33333333-3333-4333-8333-333333333333',sid='11111111-1111-4111-8111-111111111111';
  let entered=0,malicious=true;
  const sessions={open:async()=>({}),prove:async()=>({}),execute:async()=>({}),
    executeFull:async args=>{entered++;assert.equal(args.tenantId,'tenant_fixture');assert.equal(args.runId,runId);
      assert.deepEqual(args.sourceEnvelope,{encrypted:'source'});assert.deepEqual(args.keyEnvelope,{encrypted:'key'});
      return {id:runId,version:1,encrypted:true,...(malicious?{markdown:'HARMLESS_SYNTHETIC_PRIVATE_CANARY'}:{})};}};
  const make=fullReady=>createPrivateGuestHttpServer({sessions,authenticate:async()=>({tenantId:'tenant_fixture',runId}),
    getReport:async()=>null,fullReady});
  const call=async server=>{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{return await fetch(`http://127.0.0.1:${server.address().port}/v1/private/sessions/${sid}/full-execute`,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({sourceEnvelope:{encrypted:'source'},keyEnvelope:{encrypted:'key'}})});
    }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
  };
  let response=await call(make(false));assert.equal(response.status,503);assert.equal(entered,0);
  response=await call(make(true));assert.equal(response.status,503);assert.equal(entered,1);
  assert.ok(!(await response.text()).includes('CANARY'));
  malicious=false;response=await call(make(true));assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{id:runId,version:1,encrypted:true});
});
