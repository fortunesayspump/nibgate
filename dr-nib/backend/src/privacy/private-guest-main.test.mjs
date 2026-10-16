import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateGuestRuntime} from './private-guest-main.js';

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
