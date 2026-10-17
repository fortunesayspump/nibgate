import {test} from 'node:test';
import assert from 'node:assert/strict';
import {brokerPublicKeyPem,createPrivateGuestRuntime} from './private-guest-main.js';

const publicPem='-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\n-----END PUBLIC KEY-----\n';

test('decodes a complete broker public key from canonical base64',()=>{
  const encoded=Buffer.from(publicPem).toString('base64');
  assert.equal(brokerPublicKeyPem({PRIVATE_BROKER_PUBLIC_KEY_SPKI_PEM_B64:encoded}),publicPem);
});

test('rejects malformed base64 broker public keys',()=>{
  assert.throws(()=>brokerPublicKeyPem({PRIVATE_BROKER_PUBLIC_KEY_SPKI_PEM_B64:'not base64'}),/public key unavailable/);
});

test('rejects base64 that decodes to an incomplete PEM',()=>{
  const encoded=Buffer.from('-----BEGIN PUBLIC KEY-----\n').toString('base64');
  assert.throws(()=>brokerPublicKeyPem({PRIVATE_BROKER_PUBLIC_KEY_SPKI_PEM_B64:encoded}),/public key unavailable/);
});

test('retains the multiline PEM variable for compatibility',()=>{
  assert.equal(brokerPublicKeyPem({PRIVATE_BROKER_PUBLIC_KEY_SPKI_PEM:publicPem}),publicPem);
});

test('credential-free diagnostic guest serves health and bound v1 evidence but no private jobs',async()=>{
  const seen=[];
  const server=await createPrivateGuestRuntime({env:{DRNIB_PRIVATE_DIAGNOSTIC_ONLY:'true'},quoteProvider:async x=>{seen.push(x);return {attestation:'aabb'}}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const health=await fetch(base+'/health');assert.deepEqual(await health.json(),{ok:true,privateReady:false,fullReady:false});
    const evidence=await fetch(base+'/v1/private/attestation?nonce='+'ab'.repeat(32));
    const body=await evidence.json();assert.equal(evidence.status,200);assert.equal(body.diagnostic,true);
    assert.equal(body.clientNonce,'ab'.repeat(32));assert.deepEqual(body.evidence,{attestation:'aabb'});
    assert.equal(seen.length,1);assert.equal(seen[0].clientNonce.toString('hex'),'ab'.repeat(32));
    const job=await fetch(base+'/v1/private/sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({runId:'11111111-1111-4111-8111-111111111111',clientNonce:'ab'.repeat(32)})});
    assert.equal(job.status,401);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
