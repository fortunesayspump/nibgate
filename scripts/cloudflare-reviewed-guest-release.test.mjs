import test from 'node:test';import assert from 'node:assert/strict';
import {applyReviewedGuestRelease} from './cloudflare-reviewed-guest-release.mjs';
for(const [network,appId] of [['mainnet','a5e2fc27ad1f9e09653ef840d97a49290115c908'],['testnet','c6f58feeabbaba0570e18e75ad5c71bc18fce2af']])test(network+' build pins the reviewed image release without altering other policy',()=>{
 const env={NEXT_PUBLIC_NIBGATE_NETWORK:network,NEXT_PUBLIC_DRNIB_PRIVATE_APP_ID:appId,NEXT_PUBLIC_DRNIB_PRIVATE_COMPOSE_HASH:'previous',verifier:'unchanged'};
 applyReviewedGuestRelease(network,env);assert.match(env.NEXT_PUBLIC_DRNIB_PRIVATE_COMPOSE_HASH,/^[0-9a-f]{64}$/);assert.equal(env.verifier,'unchanged');assert.equal(env.NEXT_PUBLIC_DRNIB_PRIVATE_APP_ID,appId);
});
test('wrong network or app cannot select a release',()=>{
 for(const env of [{},{NEXT_PUBLIC_NIBGATE_NETWORK:'testnet',NEXT_PUBLIC_DRNIB_PRIVATE_APP_ID:'a5e2fc27ad1f9e09653ef840d97a49290115c908'},{NEXT_PUBLIC_NIBGATE_NETWORK:'mainnet',NEXT_PUBLIC_DRNIB_PRIVATE_APP_ID:'c6f58feeabbaba0570e18e75ad5c71bc18fce2af'}])assert.throws(()=>applyReviewedGuestRelease('testnet',env));
});
