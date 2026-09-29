# Nib Tip — protocol spec

Tipping any content on the internet, SDK-first. Status: live on mainnet +
testnet. `packages/nibgate` re-exports from `@nibgate/sdk/server` the tip surface (`server/tip.js`:
`createTipChallenge`, `tipReceipt`, `createTipVerifier` with `verifyDirect` +
`verifyGateway`, `resolveTipPayee`, `createTipRequirement`,
`resolveTipRecipient`) and the holding surface (`server/holding.js`:
`mintHoldingAddress`, `holdingDeployment`, `buildHoldingRequirement`,
`buildHoldingRelease`, `submitHoldingRelease`, `buildHoldingRefund`,
`submitHoldingRefund`, `deployHoldingBox`, `withdrawHoldingBoxGateway`,
`fundHoldingBox`, `mintClaimToken`/`verifyClaimToken`, `createTipIntent`), plus
`browser/tip.js` (`tipContent`, `holdTipContent`, `refundTip`). Hub endpoints
(live both nets): `/hub/tips/challenge`, `/hub/tips/verify` (both rails), `/hub/tips`,
`/hub/tips/hold` (two-step: no proof → box-funding challenge, with proof →
held), `/hub/tips/held`, `/hub/tips/claim`, `/hub/tips/refund`, `/hub/resolve`,
backed by the `Tip` table (`settled`/`held`/`released`/`refunded`) and
`TipDomainClaim` (one wallet per domain).
Proven end-to-end on testnet and mainnet (real funds, both rails): a hold
funds a no-key
domain box; the owner verifies and claims; the keeper runs
`release(domain, creator)` paying net minus the 500bps held-tier cut. Gateway
holds credit the box's Gateway ledger; the box implements ERC-1271, so the hub
keeper (or an on-demand claim) withdraws the credit onchain — no hub custody,
no shell address. Circle batch settlement is deferred, so a claim whose credit
has not settled returns `202 pending-settlement` and is retried. Claim requires
two proofs: site ownership (`verifyToken`) + wallet control (owner-link bound
wallet, or a signed `claimToken` to pay a different wallet). A second wallet
cannot re-claim a domain (409, manual review). Challenge carries the Circle
`extra` batching block + top-level `resource` required by the v3 gateway
client (also fixed for unlock challenges).
For the claimant side, see `NON-NIBGATE-CREATORS.md`. For cuts, see `FEES.md`.

## Model

A tip is `{ site, contentUrl, contentHash?, title, amount, payer, recipient?,
status }`. Statuses: `settled` (paid direct), `held` (protocol holding for an
unresolved/never-claimed creator), `released` (held → claimed), `refunded`
(payer-reclaimed before release, full amount, no fee). No `expired`: per policy
unclaimed tips never expire (see
`NON-NIBGATE-CREATORS.md`). Same receipt shape as unlocks with
`type: 'tip'`, so Explore, ledger, earnings, and reputation count tips with
no new machinery.

## Server (`@nibgate/sdk/server`)

```ts
// Requirement + challenge for a known recipient (mirrors the unlock path
// so revenue can never drift from it).
const reqd = await createTipRequirement(
  { contentUrl, title, amount, recipient },
  { network: 'eip155:5042', paymentRail: 'transfer' }, // or 'eip155:5042002'
);
// reqd = { payee, feeBps, protocolFee, challenge }

// POST /api/tip/verify → verifies Gateway receipt / direct transfer,
//                           returns { ok, proof, receipt }
```

Verification is pure cryptography + chain reads (same verifiers as unlocks).
A random blogger sets a receiver wallet and accepts tips with zero Nibgate
relationship.

## Hub-hosted flow (no creator backend)

Creator sets a destination wallet on their hub dashboard (or at claim time).
Payers hit the hub tip endpoint; the hub runs the SDK flow server-side and
takes the hosted cut. Same pattern as hub-hosted unlocks (`hub/pay`).

```text
POST /hub/tips/challenge  { contentUrl, title?, amount }
POST /hub/tips/verify     { payment proof... } → { ok, proof, receipt }
POST /hub/tips/refund     { domain, payer, message, signature } → full-amount refund of unclaimed holds
GET  /hub/tips/held?domain=X          (creator view of waiting tips)
POST /hub/tips/claim     { siteId, token } (release on verification)
GET  /hub/resolve?url=...             (creator resolution lookup)
```

## Creator resolution

```ts
resolveTipRecipient({ url, title?, authorHint? })
  → { wallet?, confidence, source }
// source: 'hub-index' | 'hub-index-domain' | 'page-signal' | 'unresolved'
// (extension JEV inference reports 'jev-model'; hub never guesses)
```

Local signals first, hub lookup second, inference last. JEV consumes
`confidence` downstream (hold vs pay thresholds).

## Browser (`@nibgate/sdk` browser + `@nibgate/wallet` React)

```ts
import { tipContent, holdTipContent, refundTip } from '@nibgate/sdk/browser';

await tipContent({ contentUrl, title, amount, signer, hubApi }); // resolved → settled; else → held
await holdTipContent({ contentUrl, amount, signer, hubApi });     // explicit hold
await refundTip({ domain, signer, hubApi });                      // payer refund
```

```tsx
import { NibgateTipCard, NibgateTipInline, useNibgateTip } from '@nibgate/wallet/react';
// useNibgateTip() returns { tip, refund, status, receipt } — direct tips and
// held-tip refunds from one hook.
```

## Networks

All endpoints and helpers take `network` / read `NIBGATE_NETWORK` (server) and
`NEXT_PUBLIC_NIBGATE_NETWORK` (browser), defaulting to testnet. Live on both
stacks; money never crosses (see DESIGN.md network model).
