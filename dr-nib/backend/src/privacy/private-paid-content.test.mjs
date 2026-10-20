import test from 'node:test';
import assert from 'node:assert/strict';
import {privatePaidContent} from './private-paid-content.js';

test('SDK access proof is redeemed once and never enters purchased evidence', async () => {
  let reads = 0;
  const out = await privatePaidContent({ok:true, unlockProof:'synthetic-access-proof', payment:{signature:'synthetic-signature'}}, async proof => {
    reads++; assert.equal(proof, 'synthetic-access-proof');
    return Response.json({content:'Actual purchased article.',unlockProof:proof});
  });
  assert.equal(reads, 1); assert.equal(out.data.content, 'Actual purchased article.');
  assert.equal(out.contentUnavailable, false);
  assert(!JSON.stringify(out).includes('synthetic-access-proof'));
});

test('failed proof redemption never substitutes payment metadata for article content or repeats', async () => {
  for (const response of [()=>Response.json({ok:true,resource:{title:'metadata only'}}),()=>new Response('',{status:402}),()=>{throw Error('synthetic private response')}]) {
    let reads=0;
    const out=await privatePaidContent({unlockProof:'synthetic-access-proof'},async()=>{reads++;return response()});
    assert.equal(reads,1); assert.deepEqual(out,{data:null,contentUnavailable:true});
  }
  let reads=0;
  assert.deepEqual(await privatePaidContent({unlockProof:{}},async()=>{reads++}),{data:null,contentUnavailable:true});
  assert.equal(reads,0);
});

test('direct purchased datasets retain content while payment credentials are stripped', async () => {
  const out=await privatePaidContent({content:'dataset',authorization:'synthetic-authorization'},()=>assert.fail('No access proof to redeem'));
  assert.deepEqual(out,{data:{content:'dataset'},contentUnavailable:false});
});
