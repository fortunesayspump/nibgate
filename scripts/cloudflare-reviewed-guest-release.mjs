import {readFileSync} from 'node:fs';
const releases=JSON.parse(readFileSync(new URL('../cloudflare/hub/reviewed-guest-releases.json',import.meta.url),'utf8'));
// These are reviewed public deployment identities, never fetched from a guest.
// Keep the rest of the independently configured verifier policy unchanged.
export function applyReviewedGuestRelease(network,env){
 const release=releases[network];
 if(!release||env.NEXT_PUBLIC_NIBGATE_NETWORK!==network||env.NEXT_PUBLIC_DRNIB_PRIVATE_APP_ID!==release.appId||!/^[0-9a-f]{64}$/.test(release.composeHash))throw Error('Reviewed private guest release does not match this network/app');
 env.NEXT_PUBLIC_DRNIB_PRIVATE_COMPOSE_HASH=release.composeHash;
}
